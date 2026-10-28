import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { randomUUID } from "node:crypto";
import { HttpError } from "../utils/http-error.js";

export { cloudinary };
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MANAGED_IMAGE_ID_PATTERN =
  /^tluphone\/(?:avatars|brands|categories|products|variants|banners)\/[a-zA-Z0-9_-]+$/;
export const IMAGE_RULES = Object.freeze({
  brand: { folder: "tluphone/brands", maxFiles: 1 },
  category: { folder: "tluphone/categories", maxFiles: 1 },
  product: { folder: "tluphone/products", maxFiles: 10 },
  variant: { folder: "tluphone/variants", maxFiles: 5 },
  banner: { folder: "tluphone/banners", maxFiles: 1 },
  avatar: { folder: "tluphone/avatars", maxFiles: 1 },
});
export const getImageRule = (type) => {
  if (typeof type !== "string" || !Object.hasOwn(IMAGE_RULES, type))
    throw new HttpError(400, "Loại ảnh không hợp lệ.");
  return IMAGE_RULES[type];
};
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req) => {
    const type =
      req.params.imageType ??
      {
        products: "product",
        brands: "brand",
        categories: "category",
        users: "avatar",
        banners: "banner",
      }[req.baseUrl.split("/").at(-1)];
    req.uploadImageType = type;
    if (
      ["cloud_name", "api_key", "api_secret"].some(
        (key) => !cloudinary.config()[key],
      )
    )
      throw new HttpError(
        503,
        "Chưa cấu hình Cloudinary. Vui lòng kiểm tra biến môi trường.",
      );
    return {
      folder: getImageRule(type).folder,
      public_id: randomUUID(),
      allowed_formats: ["jpg", "png", "webp"],
      overwrite: false,
      timeout: 30000,
    };
  },
});
// Multer có thể dọn file lỗi trước khi Cloudinary cấp public_id (ví dụ quá 5 MB).
const removeStoredFile = storage._removeFile.bind(storage);
storage._removeFile = (req, file, callback) => {
  if (!file.filename) return callback(null);
  removeStoredFile(req, file, callback);
};
export const uploadCloud = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter(_req, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
      return callback(
        new HttpError(415, "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP."),
      );
    callback(null, true);
  },
});

export const deleteImage = async (publicId) => {
  if (typeof publicId !== "string" || !MANAGED_IMAGE_ID_PATTERN.test(publicId))
    throw new HttpError(
      400,
      "Mã publicId của ảnh không hợp lệ hoặc không thuộc hệ thống.",
    );
  if (
    ["cloud_name", "api_key", "api_secret"].some(
      (key) => !cloudinary.config()[key],
    )
  )
    throw new HttpError(
      503,
      "Chưa cấu hình Cloudinary. Vui lòng kiểm tra biến môi trường.",
    );
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      type: "upload",
      invalidate: true,
      timeout: 30000,
    });
    if (!["ok", "not found"].includes(result?.result)) throw new Error();
    return { deleted: result.result === "ok" };
  } catch {
    throw new HttpError(502, "Xóa ảnh trên dịch vụ lưu trữ thất bại.");
  }
};
