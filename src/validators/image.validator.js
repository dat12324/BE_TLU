import { getImageRule, imageError, MANAGED_IMAGE_ID_PATTERN } from '../utils/image-validation.js';

export function validateImageType(req, _res, next) {
  try {
    getImageRule(req.params.imageType);
    next();
  } catch (error) { next(error); }
}

export function validateUploadFields(req, _res, next) {
  // File nằm trong req.file/req.files; không nhận folder, publicId hoặc text fields từ client.
  if (Object.keys(req.body ?? {}).length || Object.keys(req.query).length) {
    return next(imageError('Upload accepts image files only; folder and publicId are server-controlled.'));
  }
  next();
}

export function validateDeleteImage(req, _res, next) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'publicId')
    || typeof body.publicId !== 'string' || !MANAGED_IMAGE_ID_PATTERN.test(body.publicId)
    || Object.keys(req.query).length) {
    return next(imageError('Provide a valid TLUPhone image publicId only.'));
  }
  next();
}
