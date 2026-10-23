import jwt from "jsonwebtoken";
import {
  randomBytes,
  randomInt,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { HttpError } from "../utils/http-error.js";
import { toAuthUserDTO } from "../dto/user.dto.js";
import { isUniqueEmailIndex } from "../utils/auth-index.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/general-token.js";
import cache from "../utils/cache.repository.js";
import { createMailService } from "./mail.service.js";

const issuer = "tluphone-api";
const refreshAudience = "tluphone-refresh";
const loadUser = (email) =>
  User.findOne({ email }).select("+passwordHash +googleId +tokenVersion");
let dummyHash;

// Chỉ lưu nếu tài khoản vẫn đáp ứng điều kiện đã kiểm tra.
async function saveUser(user, conditions) {
  user.$where = { isActive: true, email: user.email, ...conditions };
  try {
    await user.save();
    return true;
  } catch (error) {
    if (
      error instanceof mongoose.Error.DocumentNotFoundError ||
      error instanceof mongoose.Error.VersionError
    )
      return false;
    throw error;
  }
}

export function createAuthService(config) {
  const mail = createMailService(config);
  function requireTemporarySecret() {
    if (
      typeof config.passwordResetSecret !== "string" ||
      Buffer.byteLength(config.passwordResetSecret, "utf8") < 32 ||
      [config.jwtSecret, config.jwtRefreshSecret].includes(
        config.passwordResetSecret,
      )
    ) {
      throw new HttpError(503, "Cấu hình đặt lại mật khẩu không hợp lệ");
    }
  }
  function requireJwtConfig() {
    for (const [type, secret, expiry] of [
      ["access", config.jwtSecret, config.jwtExpiresIn],
      ["refresh", config.jwtRefreshSecret, config.jwtRefreshExpiresIn],
    ]) {
      if (
        typeof secret !== "string" ||
        Buffer.byteLength(secret, "utf8") < 32 ||
        typeof expiry !== "string" ||
        !/^[1-9]\d*(?:s|m|h|d)$/.test(expiry) ||
        (type === "refresh" && secret === config.jwtSecret)
      ) {
        throw new HttpError(503, `Cấu hình ${type} token không hợp lệ`);
      }
    }
  }
  const digest = (purpose, user, value) =>
    createHmac("sha256", config.passwordResetSecret)
      .update(`${purpose}:${user._id}:${value}`)
      .digest("hex");
  const matches = (hash, candidate) =>
    typeof hash === "string" &&
    /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
  const stateFor = (user, hash) => ({
    userId: user._id.toString(),
    version: user.tokenVersion ?? 0,
    hash,
  });
  const currentState = (state, user) =>
    state &&
    user?.isActive === true &&
    state.userId === user._id.toString() &&
    state.version === (user.tokenVersion ?? 0);
  // Dùng chung cho email xác thực và OTP; cooldown được kiểm tra trong cùng giao dịch.
  async function issueToken({ key, value, ttl, cooldownKey, invalidateKey }) {
    const keys = [key, cooldownKey];
    if (invalidateKey) keys.push(invalidateKey);
    return cache.transaction(keys, async (client) => {
      if ((await client.get(cooldownKey)) !== null) return false;
      const tx = client
        .multi()
        .set(key, value, { EX: ttl })
        .set(cooldownKey, "true", { EX: 60 });
      if (invalidateKey) tx.del(invalidateKey);
      await tx.exec();
      return true;
    });
  }

  async function consumeToken(key, expectedValue) {
    return cache.transaction([key], async (client) => {
      const value = await client.get(key);
      if (value === null || value !== expectedValue) return false;
      await client.multi().del(key).exec();
      return true;
    });
  }

  async function cleanDelivery(key, raw) {
    try {
      await consumeToken(key, raw);
    } catch {
      console.error("[Auth] Failed to clear verification code");
    }
  }

  return {
    async register({ fullName, email, phoneNumber, dateOfBirth, password }) {
      let indexes;
      try {
        indexes = await User.listIndexes();
      } catch (error) {
        if (error.code !== 26) throw error;
        indexes = [];
      }
      if (!indexes.some(isUniqueEmailIndex)) {
        throw new HttpError(503, "Dịch vụ đăng ký tạm thời không khả dụng.");
      }
      if (await User.findOne({ email }))
        throw new HttpError(409, "Email đã được đăng ký.");
      try {
        const user = new User({
          fullName,
          email,
          phoneNumber,
          dateOfBirth,
          passwordHash: await hashPassword(password),
          role: "user",
          emailVerified: false,
        });
        await user.save();
        return { user: toAuthUserDTO(user) };
      } catch (error) {
        if (error.code === 11000)
          throw new HttpError(409, "Email đã được đăng ký.");
        if (error instanceof mongoose.Error.ValidationError)
          throw new HttpError(400, "Thông tin tài khoản không hợp lệ.");
        throw error;
      }
    },

    async login({ email, password }) {
      requireJwtConfig();
      const attemptsKey = `login_attempt:{${email}}`;
      const lockKey = `login_lock:{${email}}`;
      if (await cache.get(lockKey))
        throw new HttpError(
          429,
          "Đăng nhập thất bại quá nhiều lần. Vui lòng thử lại sau.",
        );
      const user = await loadUser(email);
      let passwordHash = user?.passwordHash;
      if (!passwordHash) {
        dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
        passwordHash = await dummyHash;
      }
      const correct = await comparePassword(password, passwordHash);
      if (!user || !correct || user.isActive !== true) {
        await cache.transaction([attemptsKey, lockKey], async (client) => {
          const count = Number((await client.get(attemptsKey)) ?? 0) + 1;
          const tx = client
            .multi()
            .incr(attemptsKey)
            .expire(attemptsKey, 300, "NX");
          if (count >= 10) tx.set(lockKey, "true", { EX: 300 });
          await tx.exec();
        });
        throw new HttpError(401, "Email hoặc mật khẩu không chính xác.");
      }
      // Kiểm tra lại vì tài khoản có thể bị khóa trong lúc so mật khẩu.
      if (await cache.get(lockKey))
        throw new HttpError(
          429,
          "Đăng nhập thất bại quá nhiều lần. Vui lòng thử lại sau.",
        );
      await cache.delete(attemptsKey);
      return {
        accessToken: generateAccessToken(user, config),
        tokenType: "Bearer",
        expiresIn: config.jwtExpiresIn,
        user: toAuthUserDTO(user),
        refreshToken: generateRefreshToken(user, config),
      };
    },

    async refreshToken(token) {
      requireJwtConfig();
      let claims;
      try {
        if (typeof token !== "string" || token.length > 4096) throw new Error();
        claims = jwt.verify(token, config.jwtRefreshSecret, {
          algorithms: ["HS256"],
          issuer,
          audience: refreshAudience,
        });
        if (
          typeof claims !== "object" ||
          !mongoose.isObjectIdOrHexString(claims.sub) ||
          !Number.isFinite(claims.exp) ||
          !Number.isSafeInteger(claims.tokenVersion) ||
          claims.tokenVersion < 0
        )
          throw new Error();
      } catch {
        throw new HttpError(
          401,
          "Phiên đăng nhập đã hết hạn hoặc không hợp lệ.",
        );
      }
      const user = await User.findById(claims.sub).select("+tokenVersion");
      if (
        user?.isActive !== true ||
        (user.tokenVersion ?? 0) !== claims.tokenVersion
      ) {
        throw new HttpError(
          401,
          "Phiên đăng nhập đã hết hạn hoặc không hợp lệ.",
        );
      }
      return { accessToken: generateAccessToken(user, config) };
    },

    async verifyAccount({ email }) {
      requireTemporarySecret();
      mail.requireConfig();
      let base;
      try {
        base = new URL(config.apiBaseUrl);
        if (
          !["http:", "https:"].includes(base.protocol) ||
          base.username ||
          base.password
        )
          throw new Error();
      } catch {
        throw new HttpError(
          503,
          "Dịch vụ xác thực email tạm thời không khả dụng.",
        );
      }
      const user = await loadUser(email);
      if (user?.isActive !== true || user.emailVerified)
        return { message: "Liên kết xác thực đã được gửi đến email của bạn." };
      const key = `verify:{${email}}`;
      const token = randomUUID();
      const raw = JSON.stringify(
        stateFor(user, digest("verify-email", user, token)),
      );
      const issued = await issueToken({
        key,
        value: raw,
        ttl: 900,
        cooldownKey: `verify_cooldown:{${email}}`,
      });
      if (!issued)
        return { message: "Liên kết xác thực đã được gửi đến email của bạn." };
      const link = new URL("/api/auth/verify-email", base);
      link.searchParams.set("email", email);
      link.searchParams.set("token", token);
      try {
        await mail.sendVerification(email, link.toString());
      } catch {
        await cleanDelivery(key, raw);
      }
      return { message: "Liên kết xác thực đã được gửi đến email của bạn." };
    },

    async verifyEmail({ email, token }) {
      requireTemporarySecret();
      const key = `verify:{${email}}`;
      const raw = await cache.get(key);
      const user = await loadUser(email);
      const state = raw && JSON.parse(raw);
      if (
        !currentState(state, user) ||
        !matches(state.hash, digest("verify-email", user, token)) ||
        !(await consumeToken(key, raw))
      ) {
        throw new HttpError(
          400,
          "Liên kết xác thực email không hợp lệ hoặc đã hết hạn.",
        );
      }
      user.emailVerified = true;
      user.emailVerifiedAt = new Date();
      if (!(await saveUser(user, { emailVerified: { $ne: true } }))) {
        throw new HttpError(
          400,
          "Liên kết xác thực email không hợp lệ hoặc đã hết hạn.",
        );
      }
      return { message: "Xác thực email thành công." };
    },

    async forgotPassword({ email }) {
      requireTemporarySecret();
      mail.requireConfig();
      const user = await loadUser(email);
      if (user?.isActive !== true || !user.passwordHash)
        return { message: "Mã xác thực đã được gửi đến email của bạn." };
      const key = `mail-{${email}}`;
      const previous = await cache.get(key);
      const previousHash = previous && JSON.parse(previous).hash;
      let otp, hash;
      do {
        otp = randomInt(0, 100000).toString().padStart(5, "0");
        hash = digest("password-reset-otp", user, otp);
      } while (previousHash === hash);
      const raw = JSON.stringify({ ...stateFor(user, hash), attempts: 0 });
      const issued = await issueToken({
        key,
        value: raw,
        ttl: 300,
        cooldownKey: `mail_cooldown:{${email}}`,
        invalidateKey: `resetToken-{${email}}`,
      });
      if (!issued)
        return { message: "Mã xác thực đã được gửi đến email của bạn." };
      try {
        await mail.sendPasswordResetOtp(email, otp);
      } catch {
        await cleanDelivery(key, raw);
      }
      return { message: "Mã xác thực đã được gửi đến email của bạn." };
    },

    async verifyCode({ email, otp }) {
      requireTemporarySecret();
      const otpKey = `mail-{${email}}`;
      const resetKey = `resetToken-{${email}}`;
      const user = await loadUser(email);
      if (user?.isActive !== true || !user.passwordHash)
        throw new HttpError(400, "Mã xác thực không hợp lệ hoặc đã hết hạn.");
      const resetToken = randomBytes(32).toString("base64url");
      const resetState = JSON.stringify(
        stateFor(user, digest("password-reset-token", user, resetToken)),
      );
      const verified = await cache.transaction(
        [otpKey, resetKey],
        async (client) => {
          const raw = await client.get(otpKey);
          const state = raw && JSON.parse(raw);
          if (!currentState(state, user) || state.attempts >= 5) return false;
          if (!matches(state.hash, digest("password-reset-otp", user, otp))) {
            state.attempts++;
            await client
              .multi()
              .set(otpKey, JSON.stringify(state), { KEEPTTL: true })
              .exec();
            return false;
          }
          await client
            .multi()
            .del(otpKey)
            .set(resetKey, resetState, { EX: 300 })
            .exec();
          return true;
        },
      );
      if (!verified)
        throw new HttpError(400, "Mã xác thực không hợp lệ hoặc đã hết hạn.");
      return { resetToken, expiresIn: 300 };
    },

    async resetPassword({ email, resetToken, password }) {
      requireTemporarySecret();
      const key = `resetToken-{${email}}`;
      const raw = await cache.get(key);
      const user = await loadUser(email);
      const state = raw && JSON.parse(raw);
      if (
        !user?.passwordHash ||
        !currentState(state, user) ||
        !matches(state.hash, digest("password-reset-token", user, resetToken))
      )
        throw new HttpError(
          400,
          "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
        );
      const nextHash = await hashPassword(password);
      // Chỉ một request được dùng token, kể cả khi cùng băm mật khẩu xong.
      if (!(await consumeToken(key, raw)))
        throw new HttpError(
          400,
          "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
        );
      const previousHash = user.passwordHash;
      user.passwordHash = nextHash;
      user.$inc("tokenVersion", 1);
      const saved = await saveUser(user, {
        passwordHash: previousHash,
        ...(state.version === 0
          ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
          : { tokenVersion: state.version }),
      });
      if (!saved)
        throw new HttpError(
          400,
          "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
        );
      return {
        message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
      };
    },
  };
}
