import { body, param, query } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";
import {
  getImageRule,
  MANAGED_IMAGE_ID_PATTERN,
} from "../config/cloudinary.js";

export const validateImageType = [
  param("imageType").custom((value) => Boolean(getImageRule(value))),
  validateRequest,
];

// Multer nhận file; client không được tự gán folder hoặc publicId khi upload.
export const validateUploadFields = [
  body()
    .custom(
      (_value, { req }) =>
        !req.params.imageType ||
        !req.files?.length ||
        req.files.length <= getImageRule(req.params.imageType).maxFiles,
    )
    .withMessage("Số lượng ảnh vượt quá giới hạn cho loại ảnh này."),
  body()
    .custom((value) => Object.keys(value ?? {}).length === 0)
    .withMessage(
      "Chỉ chấp nhận tệp ảnh tải lên; folder và publicId do máy chủ quản lý.",
    ),
  query()
    .custom((value) => Object.keys(value).length === 0)
    .withMessage(
      "Chỉ chấp nhận tệp ảnh tải lên; folder và publicId do máy chủ quản lý.",
    ),
  validateRequest,
];
