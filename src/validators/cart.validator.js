import { body, param } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";

export const validateCartVariant = [
  param("variantId").isMongoId().withMessage("ID SKU không hợp lệ."),
  validateRequest,
];

export const validateCartItem = (create = false) => [
  body()
    .isObject({ strict: true })
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) =>
        (create ? ["productVariant", "quantity"] : ["quantity"]).includes(key),
      ),
    )
    .withMessage("Dữ liệu giỏ hàng chứa trường không được phép."),
  ...(create
    ? [body("productVariant").isMongoId().withMessage("ID SKU không hợp lệ.")]
    : []),
  body("quantity")
    .custom((value) => Number.isSafeInteger(value) && value > 0)
    .withMessage("Số lượng phải là số nguyên dương trong phạm vi an toàn."),
  validateRequest,
];
