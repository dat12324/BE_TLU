import mongoose from "mongoose";
import { body, query } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";
import { normalizeName } from "../utils/text.js";
import { SLUG_PATTERN } from "../utils/validation-patterns.js";
import { HttpError } from "../utils/http-error.js";

// Kiểm tra giá trị ID nội bộ trong Service, không phải request middleware.
export const validateCatalogId = (value, label) => {
  if (!mongoose.isObjectIdOrHexString(value))
    throw new HttpError(400, `ID ${label} không hợp lệ.`);
};

export const validateCatalogInput = (imageField, partial = false) => [
  body()
    .isObject({ strict: true })
    .withMessage("Dữ liệu phải là object.")
    .bail()
    .custom(
      (value, { req }) =>
        (Object.keys(value).length > 0 || Boolean(req.file)) &&
        Object.keys(value).every((key) =>
          ["name", "slug", "description", "status", imageField].includes(key),
        ),
    )
    .withMessage(
      "Dữ liệu chứa trường không được hỗ trợ hoặc không được phép chỉnh sửa.",
    ),
  body(imageField)
    .custom((value, { req }) => !req.file || value === undefined)
    .withMessage(
      "Chỉ chọn file ảnh hoặc metadata ảnh, không gửi đồng thời cả hai.",
    ),
  body(imageField)
    .if(
      (value, { req }) =>
        req.is("multipart/form-data") && typeof value === "string",
    )
    .custom((value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    })
    .withMessage("Metadata ảnh trong form phải là JSON hợp lệ.")
    .bail()
    .customSanitizer((value) => JSON.parse(value)),
  ...(!partial
    ? [
        body("name")
          .exists()
          .withMessage("name là bắt buộc và phải là chuỗi không rỗng."),
        body("slug").customSanitizer((value) =>
          typeof value === "string" && !value.trim() ? undefined : value,
        ),
      ]
    : []),
  body("name", "name là bắt buộc và phải là chuỗi không rỗng.")
    .optional()
    .isString()
    .bail()
    .customSanitizer(normalizeName)
    .notEmpty()
    .withMessage("name là bắt buộc và phải là chuỗi không rỗng."),
  body("slug", "Đường dẫn không hợp lệ.")
    .optional()
    .isString()
    .bail()
    .trim()
    .toLowerCase()
    .matches(SLUG_PATTERN)
    .withMessage(
      "Đường dẫn chỉ được chứa chữ cái, chữ số và dấu gạch nối đơn giữa các phần.",
    ),
  body("description")
    .optional()
    .isString()
    .withMessage("description phải là chuỗi.")
    .bail()
    .trim(),
  body("status", "Trạng thái không hợp lệ.")
    .optional()
    .isString()
    .bail()
    .isIn(["active", "inactive"])
    .withMessage("Trạng thái không hợp lệ."),
  body(imageField, `${imageField} phải chứa url và publicId.`)
    .optional({ values: "null" })
    .isObject({ strict: true })
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) => ["url", "publicId"].includes(key)),
    )
    .withMessage(`${imageField} phải chứa url và publicId.`),
  body(`${imageField}.url`, "URL ảnh không hợp lệ.")
    .if((_value, { req }) => req.body?.[imageField] != null)
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .bail()
    .custom((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .withMessage("URL ảnh phải sử dụng HTTP hoặc HTTPS."),
  body(`${imageField}.publicId`, `${imageField} phải chứa url và publicId.`)
    .if((_value, { req }) => req.body?.[imageField] != null)
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${imageField} phải chứa url và publicId.`),
  validateRequest,
];

export const validateCatalogQuery = [
  query("status", "Bộ lọc trạng thái không hợp lệ.")
    .if((_value, { req }) => req.user?.role === "admin")
    .optional()
    .isString()
    .bail()
    .isIn(["active", "inactive"])
    .withMessage("Bộ lọc trạng thái không hợp lệ."),
  validateRequest,
];
