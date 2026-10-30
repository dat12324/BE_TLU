import { body, query, validationResult } from "express-validator";
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
      (value, { req }) =>
        (Object.keys(value).length > 0 || Object.values(req.files ?? {}).flat().length > 0) &&
        Object.keys(value).every((key) => allowed.includes(key)),
    )
    .withMessage("Dữ liệu rỗng hoặc chứa trường không được phép chỉnh sửa.");
const numberFields = [
  "ram",
  "storage",
  "price",
  "compareAtPrice",
  "stock",
  "lowStockThreshold",
];
const formFields = [
  body(["color", ...numberFields, "isDefault"])
    .if((value, { req }) => req.is("multipart/form-data") && typeof value === "string")
    .custom(value => { try { JSON.parse(value); return true; } catch { return false; } })
    .withMessage("Màu, ảnh, số và boolean trong form phải là JSON hợp lệ.").bail()
    .customSanitizer(value => JSON.parse(value)),
  body("color.image").custom((value, { req }) => !req.files?.colorImage?.length || value === undefined)
    .withMessage("Không gửi đồng thời color.image và file colorImage."),
];
const rules = [
  body("sku")
    .optional()
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .withMessage("SKU không được để trống."),
  body(numberFields)
    .optional({ values: "null" })
    .custom((value) => Number.isSafeInteger(value) && value >= 0)
    .withMessage("Giá, dung lượng và tồn kho phải là số nguyên không âm."),
  body(["ram", "storage"])
    .optional()
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
    .trim()
    .notEmpty()
    .withMessage("Thông tin màu không hợp lệ."),
  body("color.image")
    .optional()
    .if((value, { path }) => path !== "color.image" || value !== null)
    .isObject({ strict: true })
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) => ["url", "publicId"].includes(key)),
    )
    .withMessage("Ảnh chỉ gồm url và publicId."),
  body([
    "color.image.url",
    "color.image.publicId",
  ])
    .optional()
    .isString()
    .withMessage("Thông tin ảnh phải là chuỗi."),
];

const createVariantRules = [
  ...formFields,
  objectFields(["product", "stock", ...fields]),
  body("product").isMongoId().withMessage("ID sản phẩm không hợp lệ."),
  body(["ram", "storage", "color.name", "price"])
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
export const validateVariantQuery = [
  query(["product", "status", "ram", "storage", "color"])
    .optional()
    .custom((value) => typeof value === "string")
    .withMessage("Tham số lọc phải là chuỗi."),
  query("product")
    .optional()
    .isMongoId()
    .withMessage("ID sản phẩm không hợp lệ."),
  query("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("Trạng thái không hợp lệ."),
  query(["ram", "storage"])
    .optional()
    .isInt({ min: 1, max: Number.MAX_SAFE_INTEGER })
    .withMessage("RAM/bộ nhớ không hợp lệ."),
  query("color")
    .optional()
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .isLength({ max: 100 })
    .withMessage("Màu không hợp lệ."),
  // page/limit dùng normalizePagination như Product; query không sử dụng được bỏ qua.
  validateRequest,
];
