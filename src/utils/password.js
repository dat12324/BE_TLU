import bcrypt from "bcrypt";
import { BCRYPT_HASH_PATTERN } from "./validation-patterns.js";

export const PASSWORD_COST = 12;

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new TypeError("Mật khẩu phải là chuỗi không rỗng.");
  }
  if (BCRYPT_HASH_PATTERN.test(password)) {
    throw new TypeError(
      "Đầu vào phải là mật khẩu chưa băm, không phải chuỗi băm bcrypt.",
    );
  }
  // bcrypt cắt dữ liệu sau 72 byte; từ chối thay vì âm thầm làm mất dữ liệu.
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new RangeError("Mật khẩu không được vượt quá 72 byte UTF-8.");
  }
  return bcrypt.hash(password, PASSWORD_COST);
}

export async function comparePassword(password, passwordHash) {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    typeof passwordHash !== "string" ||
    !BCRYPT_HASH_PATTERN.test(passwordHash)
  ) {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
