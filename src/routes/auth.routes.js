import { Router } from "express";
import { authController as controller } from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { createAuthRateLimiter } from "../middleware/auth-rate-limit.js";
import {
  validateRegister,
  validateLogin,
  validateChangePassword,
} from "../validators/auth.validator.js";

const router = Router();
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.post(
  "/register",
  createAuthRateLimiter({ limit: 5 }),
  validateRegister,
  controller.register,
);
router.post(
  "/login",
  createAuthRateLimiter(),
  validateLogin,
  controller.login,
);
const emailKey = (req) => typeof req.body?.email === "string"
  ? req.body.email.trim().toLowerCase() : req.ip;
router.post(
  "/forgotPassword",
  createAuthRateLimiter({
    limit: 5,
    windowMs: 60 * 60 * 1000,
    key: emailKey,
  }),
  controller.forgotPassword,
);
router.post(
  "/verifyCode",
  createAuthRateLimiter({ limit: 10, key: emailKey }),
  controller.verifyCode,
);
router.patch(
  "/resetPassword",
  createAuthRateLimiter({ limit: 10, key: emailKey }),
  controller.resetPassword,
);
router.post(
  "/verifyAccount",
  createAuthRateLimiter({
    limit: 5,
    windowMs: 60 * 60 * 1000,
    key: emailKey,
  }),
  controller.verifyAccount,
);
router.get(
  "/verifyMail",
  createAuthRateLimiter({ limit: 30 }),
  controller.verifyEmail,
);
router.post(
  "/refreshToken",
  createAuthRateLimiter({ limit: 30 }),
  controller.refreshToken,
);
router.patch(
  "/changePassword",
  verifyToken,
  createAuthRateLimiter({ limit: 5 }),
  validateChangePassword,
  controller.changePassword,
);
// Có tính lũy đẳng: máy khách luôn có thể bỏ token cục bộ, kể cả khi đã hết hạn.
router.post("/logout", controller.logout);

export default router;
