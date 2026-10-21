import { Router } from 'express';
import { createImageController } from '../controllers/image.controller.js';
import { createImageUpload, uploadSingleImage } from '../middleware/upload.js';
import { validateImageType, validateUploadFields, validateDeleteImage } from '../validators/image.validator.js';

// Gắn dưới /api/admin sau xác thực JWT và requireAdmin, trước khi đọc multipart.
export function createAdminImageRouter() {
  const router = Router();
  const controller = createImageController();
  router.post('/upload/:imageType', validateImageType, uploadSingleImage,
    validateUploadFields, controller.uploadSingle);
  router.post('/upload-multiple/:imageType', validateImageType,
    (req, res, next) => createImageUpload(req.params.imageType, { multiple: true })(req, res, next),
    validateUploadFields, controller.uploadMultiple);
  router.delete('/', validateDeleteImage, controller.remove);
  return router;
}
