import cloudinary from 'cloudinary';
import { readCloudinaryConfig } from './env.js';
import { HttpError } from '../utils/http-error.js';

export function loadCloudinaryConfig(env = process.env) {
  const config = readCloudinaryConfig(env);
  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    throw new HttpError(503, 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  }
  return config;
}

// Khởi tạo khi cần: các API hiện có vẫn hoạt động khi chưa có thông tin xác thực Cloudinary.
let client;
export function getCloudinary() {
  if (!client) {
    const config = loadCloudinaryConfig();
    cloudinary.v2.config(config);
    client = cloudinary.v2;
  }
  return client;
}
