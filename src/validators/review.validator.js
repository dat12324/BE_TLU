
import { body } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";

export const validateCreateReview = [
  body("product")
    .isMongoId()
    .withMessage("Sản phẩm không hợp lệ."),

  body("order")
    .isMongoId()
    .withMessage("Đơn hàng không hợp lệ."),

  body("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Số sao phải từ 1 đến 5."),

  body("content")
    .isString()
    .withMessage("Nội dung đánh giá không hợp lệ.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Vui lòng nhập nội dung đánh giá.")
    .isLength({ max: 3000 })
    .withMessage("Nội dung tối đa 3000 ký tự."),

  validateRequest,
];

export const validateUpdateReview = [
  body("rating")
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage("Số sao phải từ 1 đến 5."),

  body("content")
    .optional()
    .isString()
    .withMessage("Nội dung đánh giá không hợp lệ.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Nội dung không được để trống.")
    .isLength({ max: 3000 })
    .withMessage("Nội dung tối đa 3000 ký tự."),

  validateRequest,
];
