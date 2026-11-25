
import { body } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";

export const validateCreateReview = [
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
