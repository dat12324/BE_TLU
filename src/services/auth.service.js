import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { HttpError } from "../utils/http-error.js";
import { toAuthUserDTO } from "../dto/user.dto.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/general-token.js";
import cache from "../utils/cache.repository.js";
import { transporter } from "../utils/send-mail.js";
import { EMAIL_PATTERN } from "../utils/validation-patterns.js";

const normalizeEmail = (email) => {
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email.trim())
  )
    throw new HttpError(400, "Vui lòng nhập địa chỉ email hợp lệ.");
  return email.trim().toLowerCase();
};

const issuer = "tluphone-api";
const refreshAudience = "tluphone-refresh";
const loadUser = (email) =>
  User.findOne({ email }).select("+passwordHash +googleId +tokenVersion");
let dummyHash;

// Chỉ lưu nếu tài khoản vẫn đáp ứng điều kiện đã kiểm tra.
const saveUser = async (user, conditions) => {
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
};

const requireJwtConfig = (config) => {
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
};
// Dùng chung cho email xác thực và OTP; cooldown được kiểm tra trong cùng giao dịch.
const issueToken = async ({ key, value, ttl, cooldownKey, invalidateKey }) => {
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
};

const consumeToken = async (key, expectedValue) => {
  return cache.transaction([key], async (client) => {
    const value = await client.get(key);
    if (value === null || value !== expectedValue) return false;
    await client.multi().del(key).exec();
    return true;
  });
};

const cleanDelivery = async (key, raw) => {
  try {
    await consumeToken(key, raw);
  } catch {
    console.error("[Auth] Failed to clear verification code");
  }
};

export const authService = {
  async register(
    fullName,
    email,
    password,
    confirmPassword,
    phoneNumber,
    dateOfBirth,
  ) {
    if (password !== confirmPassword)
      throw new HttpError(400, "Mật khẩu xác nhận không khớp.");
    const existsUser = await User.findOne({ email });
    if (existsUser) throw new HttpError(409, "Email đã được đăng ký.");
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
      if (error instanceof mongoose.Error.ValidationError)
        throw new HttpError(400, "Thông tin tài khoản không hợp lệ.");
      throw error;
    }
  },

  async login(email, password, config) {
    requireJwtConfig(config);
    const attemptsKey = `login_attempt:{${email}}`;
    const lockKey = `login_lock:{${email}}`;
    if (await cache.get(lockKey))
      throw new HttpError(
        429,
        "Đăng nhập thất bại quá nhiều lần. Vui lòng thử lại sau.",
      );
    const user = await loadUser(email);
    const passwordHash =
      user?.passwordHash ||
      (await (dummyHash ??= hashPassword(randomBytes(32).toString("hex"))));
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

  async refreshToken(refreshToken, config) {
    requireJwtConfig(config);
    let claims;
    try {
      if (typeof refreshToken !== "string" || refreshToken.length > 4096)
        throw new Error();
      claims = jwt.verify(refreshToken, config.jwtRefreshSecret, {
        algorithms: ["HS256"],
        issuer,
        audience: refreshAudience,
      });
      const { sub, exp, tokenVersion } = claims;
      if (
        typeof claims !== "object" ||
        !mongoose.isObjectIdOrHexString(sub) ||
        !Number.isFinite(exp) ||
        !Number.isSafeInteger(tokenVersion) ||
        tokenVersion < 0
      )
        throw new Error();
    } catch {
      throw new HttpError(401, "Phiên đăng nhập đã hết hạn hoặc không hợp lệ.");
    }
    const user = await User.findById(claims.sub).select("+tokenVersion");
    if (
      user?.isActive !== true ||
      (user.tokenVersion ?? 0) !== claims.tokenVersion
    )
      throw new HttpError(401, "Phiên đăng nhập đã hết hạn hoặc không hợp lệ.");
    return { accessToken: generateAccessToken(user, config) };
  },

  async verifyAccount(email, config) {
    email = normalizeEmail(email);
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
    const raw = JSON.stringify({
      userId: user._id.toString(),
      version: user.tokenVersion ?? 0,
      token,
    });
    const issued = await issueToken({
      key,
      value: raw,
      ttl: 900,
      cooldownKey: `verify_cooldown:{${email}}`,
    });
    if (!issued)
      return { message: "Liên kết xác thực đã được gửi đến email của bạn." };
    const link = new URL("/api/auth/verifyMail", base);
    link.searchParams.set("email", email);
    link.searchParams.set("token", token);
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: "TLUPhone - Xác thực email",
        text: `Vui lòng xác thực email TLUPhone bằng liên kết sau trong vòng 15 phút: ${link}`,
      });
    } catch {
      await cleanDelivery(key, raw);
    }
    return { message: "Liên kết xác thực đã được gửi đến email của bạn." };
  },

  async verifyEmail(token, email) {
    email = normalizeEmail(email);
    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        token,
      )
    )
      throw new HttpError(
        400,
        "Liên kết xác thực email không hợp lệ hoặc đã hết hạn.",
      );
    const key = `verify:{${email}}`;
    const raw = await cache.get(key);
    const user = await loadUser(email);
    const state = raw && JSON.parse(raw);
    if (
      user?.isActive !== true ||
      state?.userId !== user._id.toString() ||
      state.version !== (user.tokenVersion ?? 0) ||
      state.token !== token ||
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

  async forgotPassword(email) {
    email = normalizeEmail(email);
    const user = await loadUser(email);
    if (!user) throw new HttpError(404, "Email chưa được đăng ký.");
    if (user?.isActive !== true || !user.passwordHash)
      return { message: "Mã xác thực đã được gửi đến email của bạn." };
    const key = `mail-{${email}}`;
    const previous = await cache.get(key);
    const previousOtp = previous && JSON.parse(previous).token;
    let otp;
    do {
      otp = randomInt(0, 100000).toString().padStart(5, "0");
    } while (previousOtp === otp);
    const raw = JSON.stringify({
      userId: user._id.toString(),
      version: user.tokenVersion ?? 0,
      token: otp,
      attempts: 0,
    });
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
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: "TLUPhone - Mã đặt lại mật khẩu",
        text: `Mã đặt lại mật khẩu TLUPhone của bạn là ${otp}. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này.`,
      });
    } catch {
      await cleanDelivery(key, raw);
    }
    return { message: "Mã xác thực đã được gửi đến email của bạn." };
  },

  async verifyCode(email, otp) {
    email = normalizeEmail(email);
    if (typeof otp !== "string" || !/^\d{5}$/.test(otp))
      throw new HttpError(400, "Mã xác thực phải gồm đúng 5 chữ số.");
    const otpKey = `mail-{${email}}`;
    const resetKey = `resetToken-{${email}}`;
    const user = await loadUser(email);
    if (user?.isActive !== true || !user.passwordHash)
      throw new HttpError(400, "Mã xác thực không hợp lệ hoặc đã hết hạn.");
    const resetToken = randomBytes(32).toString("base64url");
    const resetState = JSON.stringify({
      userId: user._id.toString(),
      token: resetToken,
    });
    const verified = await cache.transaction(
      [otpKey, resetKey],
      async (client) => {
        const raw = await client.get(otpKey);
        const state = raw && JSON.parse(raw);
        if (
          !state ||
          state.userId !== user._id.toString() ||
          state.version !== (user.tokenVersion ?? 0) ||
          state.attempts >= 5
        )
          return false;
        if (state.token !== otp) {
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

  async changePassword(userId, currentPassword, newPassword, confirmPassword) {
    const user = await User.findById(userId).select("+passwordHash");
    if (!user) throw new HttpError(401, "Vui lòng đăng nhập để tiếp tục.");
    if (!(await comparePassword(currentPassword, user.passwordHash)))
      throw new HttpError(400, "Mật khẩu hiện tại không chính xác.");
    if (confirmPassword !== newPassword)
      throw new HttpError(400, "Mật khẩu xác nhận không khớp.");
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    return { message: "Đổi mật khẩu thành công. " };
  },

  async resetPassword(email, newPassword, resetToken) {
    email = normalizeEmail(email);
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      throw new HttpError(400, "Mật khẩu phải có ít nhất 8 ký tự");
    }
    const key = `resetToken-{${email}}`;
    const raw = await cache.get(key);
    const state = raw && JSON.parse(raw);
    if (typeof resetToken !== "string" || !state || state.token !== resetToken)
      throw new HttpError(
        400,
        "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
      );
    const user = await User.findOne({ _id: state.userId, email });
    if (!user) throw new HttpError(404, "Người dùng không tồn tại.");
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    if (!(await consumeToken(key, raw)))
      throw new HttpError(
        400,
        "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
      );
    user.passwordHash = passwordHash;
    await user.save();
    return {
      message: "Đặt lại mật khẩu thành công. ",
    };
  },
};

export const createAuthService = (config) => ({
  ...authService,
  login: (email, password) => authService.login(email, password, config),
  refreshToken: (token) => authService.refreshToken(token, config),
  verifyAccount: (email) => authService.verifyAccount(email, config),
});
