import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { createAuthService } from '../services/auth.service.js';
import { createAuthenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { createBrandRouter, createAdminBrandRouter } from './brand.routes.js';
import { createCategoryRouter, createAdminCategoryRouter } from './category.routes.js';
import { createAdminImageRouter } from './image.routes.js';
import { createUserRouter } from './user.routes.js';

export function createApiRouter(isDatabaseConnected, config) {
  const router = Router();
  router.get('/health', createHealthController(isDatabaseConnected));
  router.use('/auth', createAuthRouter(config));
  router.use('/brands', createBrandRouter());
  router.use('/categories', createCategoryRouter());
  router.use('/users', createUserRouter(config));
  // Mọi endpoint quản trị được gắn dưới dòng này đều áp dụng cả hai bước kiểm tra.
  router.use('/admin', createAuthenticate(createAuthService(config)), requireAdmin);
  router.use('/admin/brands', createAdminBrandRouter());
  router.use('/admin/categories', createAdminCategoryRouter());
  router.use('/admin/images', createAdminImageRouter());
  return router;
}
