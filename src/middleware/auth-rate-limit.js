import { HttpError } from '../utils/http-error.js';

// Bộ giới hạn đơn giản trong một tiến trình. Đếm mọi lần thử, kể cả thành công.
// Không tin giá trị X-Forwarded-For tùy ý; giữ tùy chọn trust proxy của Express ở trạng thái tắt.
export function createAuthRateLimiter({ limit = 10, windowMs = 15 * 60 * 1000, maxEntries = 10000, now = Date.now } = {}) {
  const attempts = new Map();
  return (req, res, next) => {
    const timestamp = now();
    const key = req.ip ?? req.socket.remoteAddress;
    let entry = attempts.get(key);
    if (!entry || entry.resetAt <= timestamp) {
      if (attempts.size >= maxEntries) {
        for (const [ip, attempt] of attempts) if (attempt.resetAt <= timestamp) attempts.delete(ip);
      }
      if (!attempts.has(key) && attempts.size >= maxEntries) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return next(new HttpError(429, 'Too many authentication attempts. Try again later.'));
      }
      entry = { count: 0, resetAt: timestamp + windowMs };
      attempts.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000))));
      return next(new HttpError(429, 'Too many authentication attempts. Try again later.'));
    }
    next();
  };
}
