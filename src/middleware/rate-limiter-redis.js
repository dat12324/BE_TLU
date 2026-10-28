import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisClient from "../config/redis.js";
import { HttpError } from "../utils/http-error.js";

export const createApiLimiter = () => {
  const limiter = rateLimit({
    store: new RedisStore({
      prefix: "rate:api:",
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    windowMs: 60_000,
    limit: 100,
    message: { message: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau." },
  });
  return (req, res, next) =>
    limiter(req, res, (error) => {
      if (error)
        return next(
          new HttpError(
            503,
            "Bộ nhớ đệm xác thực hiện không khả dụng. Vui lòng thử lại sau.",
          ),
        );
      next();
    });
};
