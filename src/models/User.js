import mongoose from "mongoose";
import {
  BCRYPT_HASH_PATTERN,
  PHONE_PATTERN,
  EMAIL_PATTERN,
} from "../utils/validation-patterns.js";
import { requireDocumentSave } from "../utils/model-updates.js";

const avatarSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: {
      type: String,
      trim: true,
      default: null,
      required() {
        return this.provider === "cloudinary";
      },
    },
    provider: {
      type: String,
      enum: ["google", "cloudinary"],
      required() {
        const user = this.ownerDocument();
        // Bắt buộc có nguồn cho mọi ảnh đại diện mới/được thay thế. Ảnh đại diện cũ
        // không thay đổi vẫn có thể được đọc và lưu khi chỉnh sửa thông tin hồ sơ khác.
        return user.isNew || user.isModified("avatar");
      },
    },
  },
  { _id: false, strict: "throw" },
);

function normalizeAvatar(value) {
  if (typeof value !== "string") return value;
  return value.trim() ? { url: value.trim() } : undefined;
}

export const addressSchema = new mongoose.Schema(
  {
    recipientName: { type: String, required: true, trim: true },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
      match: PHONE_PATTERN,
    },
    streetAddress: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
  },
  { strict: "throw" },
);

function removeSecrets(_doc, ret) {
  delete ret.passwordHash;
  delete ret.emailVerificationToken;
  delete ret.passwordResetToken;
  delete ret.googleId;
  delete ret.emailVerificationExpires;
  delete ret.passwordResetExpires;
  delete ret.tokenVersion;
  delete ret.passwordResetOtpHash;
  delete ret.passwordResetOtpExpires;
  delete ret.passwordResetOtpAttempts;
  delete ret.passwordResetLastSentAt;
  delete ret.__v;
  return ret;
}

export const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: EMAIL_PATTERN,
    },
    // Phần xác thực phải băm bằng bcrypt trước khi gán trường này.
    // select:false chỉ kiểm soát phép chiếu; không mã hóa dữ liệu.
    passwordHash: {
      type: String,
      select: false,
      required() {
        return !this.googleId;
      },
      match: BCRYPT_HASH_PATTERN,
    },
    phoneNumber: { type: String, trim: true, match: PHONE_PATTERN },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },
    avatar: { type: avatarSchema, default: undefined, set: normalizeAvatar },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
    },
    addresses: {
      type: [addressSchema],
      default: [],
      validate: {
        validator: (addresses) =>
          Array.isArray(addresses) &&
          addresses.filter((address) => address.isDefault).length <= 1,
        message: "Mỗi người dùng chỉ được có tối đa một địa chỉ mặc định.",
      },
    },
    googleId: {
      type: String,
      trim: true,
      default: null,
      minlength: 1,
      select: false,
    },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false, alias: "isEmailVerified" },
    emailVerifiedAt: { type: Date },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
      validate: {
        validator: Number.isSafeInteger,
        message: "Phiên bản token không hợp lệ.",
      },
    },
  },
  {
    timestamps: true,
    strict: "throw",
    // Tạo chỉ mục đã khai báo khi kết nối ở cả môi trường phát triển và triển khai thực tế.
    autoIndex: true,
    autoCreate: false,
    toJSON: { transform: removeSecrets },
    toObject: { transform: removeSecrets },
  },
);

// Khớp với chỉ mục Atlas hiện có và bảo vệ mọi email User hợp lệ.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: "string" } },
  },
);

// Chuẩn hóa chuỗi đã lưu theo định dạng cũ trong bộ nhớ khi đọc, không ghi cơ sở dữ liệu.
userSchema.pre("init", function normalizeStoredAvatar(raw) {
  if (
    raw.emailVerified === undefined &&
    typeof raw.isEmailVerified === "boolean"
  ) {
    raw.emailVerified = raw.isEmailVerified;
  }
  delete raw.isEmailVerified;
  if (typeof raw.avatar === "string") raw.avatar = normalizeAvatar(raw.avatar);
});
userSchema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: { googleId: { $type: "string" } },
  },
);

// Cập nhật qua document.save() để kiểm tra toàn bộ địa chỉ.
requireDocumentSave(userSchema, "User");

// Hồ sơ/địa chỉ qua User Service; mật khẩu và phân quyền qua Authentication.
// Avatar qua CloudinaryStorage đã kiểm tra quyền. Response dùng DTO; xem docs/user-security.md.
const User = mongoose.models.User ?? mongoose.model("User", userSchema);
export default User;
