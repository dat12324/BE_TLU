import { Router } from 'express';
import { brandController } from '../controllers/brand.controller.js';

export function createBrandRouter() {
  const router = Router();
  router.get('/', brandController.listPublic);
  return router;
}

// Gắn dưới /api/admin sau middleware xác thực và requireAdmin.
export function createAdminBrandRouter() {
  const router = Router();
  router.get('/', brandController.listAdmin);
  router.get('/:id', brandController.get);
  router.post('/', brandController.create);
  router.patch('/:id', brandController.update);
  router.delete('/:id', brandController.deactivate);
  return router;
}
