import { body, validationResult } from "express-validator";
import { HttpError } from "../utils/http-error.js";
import { validateRequest } from "../middleware/validate-request.js";

const fields = [
  "sku",
  "ram",
  "storage",
  "color",
  "price",
  "compareAtPrice",
  "lowStockThreshold",
  "isDefault",
  "status",
];
const objectFields = (allowed) =>
  body()
    .isObject({ strict: true })
    .withMessage("Dữ liệu phải là object.")
    .bail()
    .custom(
      (value) =>
        Object.keys(value).every((key) => allowed.includes(key)),
    )
    .withMessage("Dữ liệu chứa trường không được phép chỉnh sửa.");
const numberFields = [
  "price",
  "compareAtPrice",
  "stock",
  "lowStockThreshold",
];
const formFields = [
  body(["ram", "storage"]).customSanitizer(value => typeof value === "string" && value.trim() === "" ? null : value),
  body(["color", "ram", "storage", ...numberFields, "isDefault"])
    .if((value, { req }) => req.is("multipart/form-data") && typeof value === "string")
    .custom(value => { try { JSON.parse(value); return true; } catch { return false; } })
    .withMessage("Màu, ảnh, số và boolean trong form phải là JSON hợp lệ.").bail()
    .customSanitizer(value => JSON.parse(value)),
];
const rules = [
  body("sku")
    .optional()
    .isString()
    .bail()
    .notEmpty({ ignore_whitespace: true })
    .withMessage("SKU không được để trống."),
  body(numberFields)
    .optional({ values: "null" })
    .custom((value) => Number.isSafeInteger(value) && value >= 0)
    .withMessage("Giá và tồn kho phải là số nguyên không âm."),
  body(["ram", "storage"])
    .optional({ values: "null" })
    .custom((value) => Number.isSafeInteger(value) && value > 0)
    .withMessage("RAM và bộ nhớ phải là số nguyên dương (GB)."),
  body("isDefault")
    .optional()
    .custom((value) => typeof value === "boolean")
    .withMessage("isDefault phải là boolean."),
  body("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("Trạng thái không hợp lệ."),
  body("color")
    .optional()
    .isObject({ strict: true })
    .bail()
    .custom(
      (value) =>
        Object.keys(value).length > 0 &&
        Object.keys(value).every((key) =>
          ["name", "code", "image"].includes(key),
        ),
    )
    .withMessage("Cấu trúc màu không hợp lệ."),
  body(["color.name", "color.code"])
    .optional()
    .isString()
    .bail()
    .notEmpty({ ignore_whitespace: true })
    .withMessage("Thông tin màu không hợp lệ."),
  body("color.image")
    .optional({ values: "null" })
    .isObject({ strict: true })
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) => ["url", "publicId"].includes(key)),
    )
    .withMessage("Ảnh chỉ gồm url và publicId."),
  body("color.image.url")
    .optional()
    .isString()
    .withMessage("Thông tin ảnh phải là chuỗi."),
];

const createVariantRules = [
  ...formFields,
  objectFields(["product", "stock", ...fields]),
  body("product").isMongoId().withMessage("ID sản phẩm không hợp lệ."),
  body(["color.name", "price"])
    .exists()
    .withMessage("Thiếu thông tin biến thể bắt buộc."),
  ...rules,
];
export const validateCreateVariant = [...createVariantRules, validateRequest];

export const validateBulkVariants = [
  body(["variants", "colorImageIndexes"])
    .if((value, { req }) => req.is("multipart/form-data") && typeof value === "string")
    .custom(value => { try { JSON.parse(value); return true; } catch { return false; } })
    .withMessage("Danh sách SKU và ánh xạ ảnh trong form phải là JSON hợp lệ.").bail()
    .customSanitizer(value => JSON.parse(value)),
  objectFields(["variants", "colorImageIndexes"]),
  body("variants").isArray({ min: 1, max: 50 }).withMessage("Mỗi lần cần gửi từ 1 đến 50 SKU."),
  body("colorImageIndexes").optional().custom((indexes, { req }) => {
    if (!Array.isArray(indexes) || indexes.length !== req.body.variants?.length) return false;
    const files = req.files ?? [];
    if (!indexes.every(index => index === null || (Number.isSafeInteger(index) && index >= 0 && index < files.length))) return false;
    if (files.some((_file, index) => !indexes.includes(index))) return false;
    return indexes.every((imageIndex, index) => imageIndex === null || req.body.variants[index]?.color?.image === undefined);
  }).withMessage("Ánh xạ ảnh màu không hợp lệ hoặc gửi đồng thời ảnh mới và metadata ảnh cũ."),
  body().custom((_value, { req }) => !req.files?.length || req.body.colorImageIndexes !== undefined)
    .withMessage("Vui lòng chỉ định ảnh màu tương ứng cho các SKU."),
  validateRequest,
  async (req, _res, next) => {
    try {
      for (const [index, variant] of req.body.variants.entries()) {
        const item = { body: variant, is: () => false };
        for (const rule of createVariantRules) await rule.run(item);
        const errors = validationResult(item);
        if (!errors.isEmpty())
          throw new HttpError(400, `SKU thứ ${index + 1}: ${errors.array()[0].msg}`);
        req.body.variants[index] = item.body;
      }
    } catch (error) { return next(error); }
    next();
  },
];
export const validateUpdateVariant = [
  ...formFields,
  objectFields(fields),
  ...rules,
  validateRequest,
];
export const validateVariantStatus = [
  objectFields(["status"]),
  body("status")
    .isIn(["active", "inactive"])
    .withMessage("Trạng thái không hợp lệ."),
  validateRequest,
];
export const validateVariantStock = [
  objectFields(["stock", "expectedStock"]),
  body("stock")
    .custom((value) => Number.isSafeInteger(value) && value >= 0)
    .withMessage("Tồn kho phải là số nguyên không âm."),
  body("expectedStock")
    .custom(
      (value) => value === null || (Number.isSafeInteger(value) && value >= 0),
    )
    .withMessage("Cần gửi expectedStock là tồn kho hiện tại hoặc null."),
  validateRequest,
];
