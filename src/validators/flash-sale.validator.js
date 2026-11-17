import { body } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";

export const validateSaveFlashSale = [
  body().isObject({ strict: true }).bail().custom(value => Object.keys(value).length > 0 && Object.keys(value).every(key => ["name", "startAt", "endAt", "isEnabled", "items"].includes(key)))
    .withMessage("Dữ liệu Flash Sale chứa trường không được phép hoặc đang để trống."),
  body("name").optional().isString().bail().trim().notEmpty().withMessage("Vui lòng nhập tên Flash Sale."),
  ...["startAt", "endAt"].map(field => body(field).optional().isString().bail().isISO8601().withMessage("Thời gian phải là ngày ISO hợp lệ.").bail().toDate()),
  body("isEnabled").optional().isBoolean({ strict: true }).withMessage("Trạng thái bật/tắt phải là Boolean."),
  body("items").optional().isArray({ max: 50 }).withMessage("Chương trình có tối đa 50 SKU."),
  body("items.*").isObject({ strict: true }).bail().custom(item => Object.keys(item).every(key => ["productVariant", "discountPercent"].includes(key)))
    .withMessage("Dữ liệu SKU chứa trường không được phép."),
  body("items.*.productVariant").isMongoId().withMessage("ID SKU không hợp lệ."),
  body("items.*.discountPercent").isInt({ min: 1, max: 99 }).withMessage("Giảm giá phải là số nguyên từ 1% đến 99%.").bail().toInt(),
  validateRequest,
];
