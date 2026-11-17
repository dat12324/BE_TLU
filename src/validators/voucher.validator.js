import { body } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";
import { VOUCHER_FIELDS } from "../services/voucher.service.js";

const code = () =>
  body("code")
    .isString()
    .withMessage("Vui lòng nhập mã giảm giá.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Vui lòng nhập mã giảm giá.")
    .bail()
    .matches(/^[A-Za-z0-9_-]{1,50}$/)
    .withMessage(
      "Mã giảm giá chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới, tối đa 50 ký tự.",
    )
    .bail()
    .toUpperCase();

const voucherRules = [
  body()
    .isObject({ strict: true })
    .bail()
    .custom(
      (value) =>
        Object.keys(value).length > 0 &&
        Object.keys(value).every((key) => VOUCHER_FIELDS.includes(key)),
    )
    .withMessage(
      "Dữ liệu mã giảm giá đang trống hoặc chứa trường không được phép.",
    ),
  code().optional(),
  body("discountType")
    .optional()
    .isIn(["percentage", "fixed"])
    .withMessage("Loại giảm giá không hợp lệ."),
  body("discountValue")
    .optional()
    .custom((value) => Number.isSafeInteger(value) && value > 0)
    .withMessage("Mức giảm phải là số nguyên dương trong phạm vi an toàn."),
  ...["maxDiscount", "minOrderValue", "usageLimit"].map((field) =>
    body(field)
      .optional({ values: "null" })
      .custom(
        (value) =>
          Number.isSafeInteger(value) &&
          value >= (field === "usageLimit" ? 1 : 0),
      )
      .withMessage("Số tiền hoặc giới hạn sử dụng không hợp lệ."),
  ),
  ...["startsAt", "endsAt"].map((field) =>
    body(field)
      .optional()
      .isString()
      .bail()
      .isISO8601()
      .withMessage("Thời gian phải là ngày hợp lệ.")
      .bail()
      .toDate(),
  ),
];

export const validateCreateVoucher = [
  ...["code", "discountType", "discountValue", "startsAt", "endsAt"].map(
    (field) =>
      body(field)
        .exists({ values: "null" })
        .withMessage(`Vui lòng cung cấp ${field}.`),
  ),
  ...voucherRules,
  validateRequest,
];
export const validateUpdateVoucher = [...voucherRules, validateRequest];
export const validateCheckVoucher = [
  code(),
  body("variantIds").optional().isArray({ min: 1 }).withMessage("Vui lòng chọn sản phẩm để áp dụng mã."),
  body("variantIds.*").isMongoId().withMessage("Sản phẩm trong giỏ hàng không hợp lệ."),
  validateRequest,
];
