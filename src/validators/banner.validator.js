import { body, query } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";
import { BANNER_EDITABLE_FIELDS } from "../services/banner.service.js";
import { bannerSchema } from "../models/Banner.js";

const validateBannerBody = (partial = false) => [
  body().isObject({ strict: true }).bail()
    .custom((value, { req }) => (Object.keys(value).length > 0 || Boolean(req.file)) &&
      Object.keys(value).every(key => BANNER_EDITABLE_FIELDS.includes(key)))
    .withMessage("Dữ liệu banner chứa trường không được phép hoặc đang để trống."),
  body("image").custom((value, { req }) => !req.file || value === undefined)
    .withMessage("Chỉ gửi file ảnh hoặc metadata ảnh, không gửi đồng thời cả hai."),
  body("image").if((value, { req }) => req.is("multipart/form-data") && typeof value === "string")
    .custom(value => { JSON.parse(value); return true; })
    .withMessage("Metadata ảnh phải là JSON hợp lệ.").bail()
    .customSanitizer(value => JSON.parse(value)),
  body("image").optional({ values: "null" }).isObject({ strict: true }).bail()
    .custom(value => Object.keys(value).every(key => ["url", "publicId"].includes(key)))
    .withMessage("Ảnh chỉ được chứa url và publicId."),
  ...(!partial ? [body("title").exists().withMessage("Vui lòng nhập tiêu đề banner.")] : []),
  ...["title", "subtitle", "tag", "priceText", "btnText", "link"].map(field =>
    body(field).optional().isString().withMessage(`${field} phải là chuỗi.`).bail().trim()),
  ...["position", "status", "theme", "tone", "icon"].map(field =>
    body(field).optional().isString().bail().isIn(bannerSchema.path(field).enumValues)
      .withMessage(`${field} không hợp lệ.`)),
  body("displayOrder").optional().isInt({ min: 0, max: Number.MAX_SAFE_INTEGER })
    .withMessage("Thứ tự hiển thị phải là số nguyên không âm.").bail().toInt(),
  ...["startsAt", "endsAt"].map(field =>
    body(field).customSanitizer(value => value === "" ? null : value)
      .optional({ values: "null" }).isISO8601().withMessage(`${field} phải là ngày ISO hợp lệ.`).bail().toDate()),
  validateRequest,
];

export const validateCreateBanner = validateBannerBody();
export const validateUpdateBanner = validateBannerBody(true);
export const validateBannerQuery = [
  query("position").optional().isString().bail().isIn(bannerSchema.path("position").enumValues)
    .withMessage("Vị trí banner không hợp lệ."),
  query("status").if((_value, { req }) => req.user?.role === "admin").optional()
    .isString().bail().isIn(["active", "inactive"]).withMessage("Trạng thái không hợp lệ."),
  query("search").optional().isString().bail().trim().isLength({ max: 100 })
    .withMessage("Từ khóa tìm kiếm tối đa 100 ký tự."),
  validateRequest,
];
