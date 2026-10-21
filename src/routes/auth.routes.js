import { Router } from 'express';
import { createAuthService } from '../services/auth.service.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { createAuthenticate } from '../middleware/auth.middleware.js';
import { createAuthRateLimiter } from '../middleware/auth-rate-limit.js';
import { validateRegister, validateLogin, validateEmptyAuthRequest } from '../validators/auth.validator.js';

export function createAuthRouter(config) {
  const router = Router();
  const service = createAuthService(config);
  const controller = createAuthController(service);
  const authenticate = createAuthenticate(service);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/register', createAuthRateLimiter({ limit: 5 }), validateRegister, controller.register);
  router.post('/login', createAuthRateLimiter(), validateLogin, controller.login);
  router.get('/me', authenticate, validateEmptyAuthRequest, controller.me);
  // Có tính lũy đẳng: máy khách luôn có thể bỏ token cục bộ, kể cả khi đã hết hạn.
  router.post('/logout', validateEmptyAuthRequest, controller.logout);
  return router;
}
