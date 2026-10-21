import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { HttpError } from '../utils/http-error.js';
import { toAuthUserDTO } from '../dto/user.dto.js';
import { isUniqueEmailIndex } from '../utils/auth-index.js';

const issuer = 'tluphone-api';
const audience = 'tluphone-web';
let dummyHash;
const getDummyHash = () => dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
const invalidLogin = () => new HttpError(401, 'Invalid email or password.');

export function createAuthService(config) {
  function requireJwtConfig() {
    if (typeof config.jwtSecret !== 'string' || Buffer.byteLength(config.jwtSecret, 'utf8') < 32
      || typeof config.jwtExpiresIn !== 'string' || !/^[1-9]\d*(?:s|m|h|d)$/.test(config.jwtExpiresIn)) {
      throw new HttpError(503, 'Authentication is not configured. Check JWT_SECRET and JWT_EXPIRES_IN.');
    }
  }

  return {
    // Đầu vào đã được request validator kiểm tra và chuẩn hóa trước Controller.
    async register({ fullName, email, phoneNumber, dateOfBirth, password }) {
      const profile = { fullName, email, phoneNumber, dateOfBirth };
      // Chỉ kiểm tra trước không thể ngăn email trùng khi có các yêu cầu đồng thời.
      // Kiểm tra tính sẵn sàng ngay cả khi bật autoIndex; quá trình tạo chỉ mục có thể thất bại.
      let indexes;
      try { indexes = await User.listIndexes(); } catch (error) {
        if (error.code !== 26) throw error;
        indexes = [];
      }
      if (!indexes.some(isUniqueEmailIndex)) {
        throw new HttpError(503, 'Registration requires the database unique email index. Run npm run indexes:auth.');
      }
      if (await User.findOne({ email: profile.email })) throw new HttpError(409, 'Email is already registered.');
      try {
        const user = new User({ ...profile, passwordHash: await hashPassword(password), role: 'user' });
        await user.save();
        return { user: toAuthUserDTO(user) };
      } catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'Email is already registered.');
        if (error instanceof mongoose.Error.ValidationError) throw new HttpError(400, 'Invalid account information.');
        throw error;
      }
    },

    async login({ email, password }) {
      requireJwtConfig();
      const user = await User.findOne({ email }).select('+passwordHash +googleId');
      // Vẫn thực hiện tính toán bcrypt thực sự cho tài khoản không tồn tại/không có mật khẩu.
      const correct = await comparePassword(password, user?.passwordHash || await getDummyHash());
      if (!user || !correct || user.isActive !== true) throw invalidLogin();
      const accessToken = jwt.sign({}, config.jwtSecret, {
        algorithm: 'HS256', subject: user._id.toString(), issuer, audience, expiresIn: config.jwtExpiresIn,
      });
      return { accessToken, tokenType: 'Bearer', expiresIn: config.jwtExpiresIn, user: toAuthUserDTO(user) };
    },

    async authenticate(token) {
      requireJwtConfig();
      let claims;
      try {
        claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer, audience });
        if (typeof claims !== 'object' || !mongoose.isObjectIdOrHexString(claims.sub)
          || !Number.isFinite(claims.exp)) throw new Error('Invalid claims');
      } catch { throw new HttpError(401, 'Invalid or expired access token.'); }
      const user = await User.findById(claims.sub);
      if (!user || user.isActive !== true) throw new HttpError(401, 'Authentication required.');
      return user;
    },
  };
}
