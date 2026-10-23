import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import { createImageUpload } from '../middleware/upload.js';
import { validateUploadFields } from '../validators/image.validator.js';
import { updateMyAvatar } from '../controllers/user.controller.js';

export function createUserRouter() {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.patch('/me/avatar', verifyToken,
    createImageUpload('avatar'), validateUploadFields, updateMyAvatar);
  return router;
}
