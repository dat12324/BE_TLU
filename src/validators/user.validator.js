import { body, query } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";
import { normalizeName } from "../utils/text.js";

export const validateUserBody = (fields) => [
  body()
    .isObject({ strict: true })
    .withMessage("Các trường dữ liệu người dùng gửi lên không hợp lệ.")
    .bail()
    .custom(
      (value) =>
        Object.keys(value).length > 0 &&
        Object.keys(value).every((field) => fields.includes(field)),
    )
    .withMessage("Các trường dữ liệu người dùng gửi lên không hợp lệ."),
  body("isActive")
    .if(() => fields.includes("isActive"))
    .custom((value) => typeof value === "boolean")
    .withMessage("isActive phải là giá trị boolean."),
  validateRequest,
];

