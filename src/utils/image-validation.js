import { fileTypeFromBuffer } from 'file-type';
import { HttpError } from './http-error.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MANAGED_IMAGE_ID_PATTERN = /^tluphone\/(?:avatars|brands|categories|products|variants|banners)\/[a-zA-Z0-9_-]+$/;
export const IMAGE_RULES = Object.freeze({
  brand: Object.freeze({ folder: 'tluphone/brands', maxFiles: 1 }),
  category: Object.freeze({ folder: 'tluphone/categories', maxFiles: 1 }),
  product: Object.freeze({ folder: 'tluphone/products', maxFiles: 5 }),
  variant: Object.freeze({ folder: 'tluphone/variants', maxFiles: 5 }),
  banner: Object.freeze({ folder: 'tluphone/banners', maxFiles: 1 }),
  avatar: Object.freeze({ folder: 'tluphone/avatars', maxFiles: 1 }),
});

export function imageError(message, status = 400) {
  return new HttpError(status, message);
}

export function getImageRule(imageType) {
  if (typeof imageType !== 'string' || !Object.hasOwn(IMAGE_RULES, imageType)) {
    throw imageError('Invalid image type.');
  }
  return IMAGE_RULES[imageType];
}

// Nhận diện dữ liệu nhị phân không thay thế bộ giải mã đầy đủ; Cloudinary cũng kiểm tra ảnh.
export async function validateImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw imageError('An image file is required.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) throw imageError('Each image must not exceed 5 MB.', 413);
  let detected;
  try { detected = await fileTypeFromBuffer(buffer); } catch { /* Dữ liệu nhị phân không hợp lệ/bị cắt cụt. */ }
  if (!detected || !IMAGE_MIME_TYPES.includes(detected.mime)) {
    throw imageError('Only valid JPEG, PNG or WebP images are accepted.', 415);
  }
  return detected;
}
