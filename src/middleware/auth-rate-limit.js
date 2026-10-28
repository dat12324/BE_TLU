import { HttpError } from "../utils/http-error.js";

export const createAuthRateLimiter = ({
  limit = 10,
  windowMs = 15 * 60 * 1000,
  maxEntries = 10000,
  now = Date.now,
  key = (req) => req.ip ?? req.socket.remoteAddress,
} = {}) => {
  const appAttempts = new WeakMap();
  const fallbackAttempts = new Map();
  return (req, res, next) => {
    // Router dùng chung; bộ đếm vẫn tách theo từng Express app.
    if (req.app && !appAttempts.has(req.app))
      appAttempts.set(req.app, new Map());
    const attempts = req.app ? appAttempts.get(req.app) : fallbackAttempts;
    const timestamp = now();
    const identifier = key(req);
    let entry = attempts.get(identifier);
    if (!entry || entry.resetAt <= timestamp) {
      if (attempts.size >= maxEntries) {
        for (const [ip, attempt] of attempts)
          if (attempt.resetAt <= timestamp) attempts.delete(ip);
      }
      if (!attempts.has(identifier) && attempts.size >= maxEntries) {
        res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
        return next(
          new HttpError(
            429,
            "Bạn đã thử xác thực quá nhiều lần. Vui lòng thử lại sau.",
          ),
        );
      }
      entry = { count: 0, resetAt: timestamp + windowMs };
      attempts.set(identifier, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((entry.resetAt - timestamp) / 1000))),
      );
      return next(
        new HttpError(
          429,
          "Bạn đã thử xác thực quá nhiều lần. Vui lòng thử lại sau.",
        ),
      );
    }
    next();
  };
};
