import bcrypt from 'bcrypt';
import { BCRYPT_HASH_PATTERN } from './validation-patterns.js';

export const PASSWORD_COST = 12;

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password must be a non-empty string.');
  }
  if (BCRYPT_HASH_PATTERN.test(password)) {
    throw new TypeError('Expected a plaintext password, not a bcrypt hash.');
  }
  // bcrypt cắt dữ liệu sau 72 byte; từ chối thay vì âm thầm làm mất dữ liệu.
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new RangeError('Password must not exceed 72 UTF-8 bytes.');
  }
  return bcrypt.hash(password, PASSWORD_COST);
}

export async function comparePassword(password, passwordHash) {
  if (typeof password !== 'string' || password.length === 0
    || Buffer.byteLength(password, 'utf8') > 72
    || typeof passwordHash !== 'string' || !BCRYPT_HASH_PATTERN.test(passwordHash)) {
    return false;
  }
  return bcrypt.compare(password, passwordHash);
}
