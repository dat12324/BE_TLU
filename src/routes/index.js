import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { verifyRole } from '../middleware/auth.middleware.js';
import { createBrandRouter, createAdminBrandRouter } from './brand.routes.js';
import { createCategoryRouter, createAdminCategoryRouter } from './category.routes.js';
import { createAdminImageRouter } from './image.routes.js';
import { createUserRouter } from './user.routes.js';
import { createProductRouter, createAdminProductRouter } from './product.routes.js';

export function createApiRouter(isDatabaseConnected, config) {
  const router = Router();
  router.get('/health', createHealthController(isDatabaseConnected));
  router.use('/auth', createAuthRouter(config));
  router.use('/brands', createBrandRouter());
  router.use('/categories', createCategoryRouter());
  router.use('/products', createProductRouter());
  router.use('/users', createUserRouter());
  // Authenticate and authorize every Admin endpoint before its handlers or Multer.
  router.use('/admin', verifyRole(['admin']));
  router.use('/admin/brands', createAdminBrandRouter());
  router.use('/admin/categories', createAdminCategoryRouter());
  router.use('/admin/products', createAdminProductRouter());
  router.use('/admin/images', createAdminImageRouter());
  return router;
}
