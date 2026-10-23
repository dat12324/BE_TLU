import { Router } from "express";
import { createAuthService } from "../services/auth.service.js";
import { createAuthController } from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { createAuthRateLimiter } from "../middleware/auth-rate-limit.js";
import {
  validateRegister,
  validateLogin,
  validateEmptyAuthRequest,
  validateForgotPassword,
  validateVerifyCode,
  validateResetPassword,
  validateVerifyEmail,
} from "../validators/auth.validator.js";

export function createAuthRouter(config) {
  const router = Router();
  const service = createAuthService(config);
  const controller = createAuthController(service, config);
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
  const emailKey = (req) => req.validatedBody.email;
  router.post(
    ["/forgot-password", "/forgotPassword"],
    createAuthRateLimiter({ limit: 5 }),
    validateForgotPassword,
    createAuthRateLimiter({
      limit: 5,
      windowMs: 60 * 60 * 1000,
      key: emailKey,
    }),
    controller.forgotPassword,
  );
  router.post(
    ["/verify-code", "/verifyCode"],
    createAuthRateLimiter({ limit: 30 }),
    validateVerifyCode,
    createAuthRateLimiter({ limit: 10, key: emailKey }),
    controller.verifyCode,
  );
  const resetLimit = createAuthRateLimiter({ limit: 10 });
  const resetEmailLimit = createAuthRateLimiter({ limit: 10, key: emailKey });
  router.post(
    "/reset-password",
    resetLimit,
    validateResetPassword,
    resetEmailLimit,
    controller.resetPassword,
  );
  router.patch(
    "/resetPassword",
    resetLimit,
    validateResetPassword,
    resetEmailLimit,
    controller.resetPassword,
  );
  router.post(
    ["/resend-verification", "/verifyAccount"],
    createAuthRateLimiter({ limit: 5 }),
    validateForgotPassword,
    createAuthRateLimiter({
      limit: 5,
      windowMs: 60 * 60 * 1000,
      key: emailKey,
    }),
    controller.verifyAccount,
  );
  router.get(
    ["/verify-email", "/verifyMail"],
    createAuthRateLimiter({ limit: 30 }),
    validateVerifyEmail,
    controller.verifyEmail,
  );
  router.post(
    ["/refresh-token", "/refreshToken"],
    createAuthRateLimiter({ limit: 30 }),
    validateEmptyAuthRequest,
    controller.refreshToken,
  );
  router.get("/me", verifyToken, validateEmptyAuthRequest, controller.me);
  // Có tính lũy đẳng: máy khách luôn có thể bỏ token cục bộ, kể cả khi đã hết hạn.
  router.post("/logout", validateEmptyAuthRequest, controller.logout);
  return router;
}
