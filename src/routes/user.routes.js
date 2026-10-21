import { Router } from 'express';
import { createAuthService } from '../services/auth.service.js';
import { createAuthenticate } from '../middleware/auth.middleware.js';
import { createImageUpload } from '../middleware/upload.js';
import { validateUploadFields } from '../validators/image.validator.js';
import { updateMyAvatar } from '../controllers/user.controller.js';

export function createUserRouter(config) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.patch('/me/avatar', createAuthenticate(createAuthService(config)),
    createImageUpload('avatar'), validateUploadFields, updateMyAvatar);
  return router;
}
