import { Router } from 'express';
import { productController } from '../controllers/product.controller.js';
import { validateProductBody, validateProductId, validateProductSlug, validateProductList } from '../validators/product.validator.js';

export function createProductRouter() {
  const router = Router();
  router.get('/', validateProductList(), productController.listPublic);
  router.get('/:slug', validateProductSlug, productController.getPublic);
  return router;
}

// Mounted after authentication and verifyRole(['admin']) in the API router.
export function createAdminProductRouter() {
  const router = Router();
  router.get('/', validateProductList({ admin: true }), productController.listAdmin);
  router.get('/:id', validateProductId, productController.getAdmin);
  router.post('/', validateProductBody(), productController.create);
  router.patch('/:id', validateProductId, validateProductBody({ partial: true }), productController.update);
  router.patch('/:id/status', validateProductId, validateProductBody({ statusOnly: true }), productController.update);
  return router;
}
