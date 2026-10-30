import mongoose from "mongoose";
import { isCloudinaryImageUrl } from "../utils/image-url.js";

// Trả về schema nhúng mới để siêu dữ liệu và bộ kiểm tra không ảnh hưởng giữa các lần sử dụng.
export function createImageSchema({
  includeAlt = false,
  includeIsPrimary = false,
  validateCloudinaryUrl = true,
  urlValidationMessage = "URL ảnh phải là đường dẫn ảnh đã tải lên Cloudinary và sử dụng HTTPS.",
} = {}) {
  const url = { type: String, required: true, trim: true };
  // Brand/Category trước đây chấp nhận các chuỗi URL khác; giữ nguyên quy tắc đó.
  if (validateCloudinaryUrl) {
    url.validate = {
      validator: isCloudinaryImageUrl,
      message: urlValidationMessage,
    };
  }
  const fields = {
    url,
    publicId: { type: String, required: true, trim: true },
  };
  if (includeAlt) fields.alt = { type: String, trim: true };
  if (includeIsPrimary) fields.isPrimary = { type: Boolean, default: false };
  return new mongoose.Schema(fields, { _id: false });
}
