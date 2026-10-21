export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Dấu + tùy chọn, theo sau là 8–15 chữ số.
export const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;
export const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(?:0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/;
