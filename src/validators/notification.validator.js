import { param } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";

export const validateNotificationId = [
  param("id").isMongoId().withMessage("ID thông báo không hợp lệ."),
  validateRequest,
];
