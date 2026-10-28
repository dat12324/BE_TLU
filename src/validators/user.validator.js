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

export const validateUserList = [
  query("isActive", "isActive phải là true hoặc false.")
    .optional()
    .isString()
    .bail()
    .isIn(["true", "false"])
    .withMessage("isActive phải là true hoặc false."),
  query("search")
    .optional()
    .isString()
    .withMessage("Từ khóa tìm kiếm không hợp lệ.")
    .bail()
    .custom(
      (value) =>
        normalizeName(value).length > 0 && normalizeName(value).length <= 100,
    )
    .withMessage("Từ khóa tìm kiếm phải có từ 1 đến 100 ký tự."),
  validateRequest,
];
