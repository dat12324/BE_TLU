import { body } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";
import { normalizeName } from "../utils/text.js";
import {
  BCRYPT_HASH_PATTERN,
  EMAIL_PATTERN,
  PHONE_PATTERN,
} from "../utils/validation-patterns.js";

export const validateRegister = [
  body("fullName", "Họ tên là bắt buộc và không được vượt quá 200 ký tự.")
    .customSanitizer(normalizeName)
    .isString()
    .bail()
    .custom((value) => value.length > 0 && value.length <= 200),
  body("email", "Vui lòng nhập địa chỉ email hợp lệ.")
    .isString()
    .bail()
    .custom((value) => value.length <= 254 && EMAIL_PATTERN.test(value.trim()))
    .bail()
    .trim()
    .toLowerCase(),
  body("password", "Mật khẩu phải có ít nhất 8 ký tự và tối đa 72 byte UTF-8.")
    .isString()
    .bail()
    .custom(
      (value) =>
        value.length >= 8 &&
        value.trim() &&
        Buffer.byteLength(value, "utf8") <= 72 &&
        !BCRYPT_HASH_PATTERN.test(value),
    ),
  body("phoneNumber", "Số điện thoại không hợp lệ.")
    .optional()
    .customSanitizer((value) => (value === "" ? undefined : value))
    .isString()
    .bail()
    .trim()
    .matches(PHONE_PATTERN),
  body(
    "dateOfBirth",
    "Ngày sinh phải hợp lệ, có định dạng YYYY-MM-DD và không được ở tương lai.",
  )
    .optional()
    .customSanitizer((value) => (value === "" ? undefined : value))
    .custom((value) => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
      const date = new Date(value);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value &&
        date <= new Date()
      );
    })
    .bail()
    .customSanitizer((value) => new Date(value)),
  validateRequest,
];

export const validateChangePassword = [
  body("currentPassword", "Vui lòng nhập mật khẩu hiện tại hợp lệ.")
    .isString().bail().notEmpty().bail()
    .custom(value => Buffer.byteLength(value, "utf8") <= 72),
  body("newPassword", "Mật khẩu mới phải có ít nhất 8 ký tự và tối đa 72 byte UTF-8.")
    .isString().bail()
    .custom(value => value.length >= 8 && value.trim() &&
      Buffer.byteLength(value, "utf8") <= 72 && !BCRYPT_HASH_PATTERN.test(value)),
  body("confirmPassword", "Vui lòng nhập xác nhận mật khẩu hợp lệ.")
    .isString().bail().notEmpty(),
  validateRequest,
];

export const validateLogin = [
  body("remember")
    .optional()
    .custom(value => typeof value === "boolean")
    .withMessage("Ghi nhớ đăng nhập phải là boolean."),
  body("email", "Vui lòng nhập địa chỉ email hợp lệ.")
    .isString()
    .bail()
    .custom((value) => value.length <= 254 && EMAIL_PATTERN.test(value.trim()))
    .bail()
    .trim()
    .toLowerCase(),
  body("password", "Vui lòng nhập mật khẩu hợp lệ.")
    .isString()
    .bail()
    .custom(
      (value) => value.length > 0 && Buffer.byteLength(value, "utf8") <= 72,
    ),
  validateRequest,
];
