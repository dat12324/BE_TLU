import { body as check, query } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";
import { normalizeName } from "../utils/text.js";
import { SLUG_PATTERN } from "../utils/validation-patterns.js";

export const PRODUCT_EDITABLE_FIELDS = [
  "name",
  "slug",
  "brand",
  "category",
  "shortDescription",
  "description",
  "highlights",
  "images",
  "technicalSpecs",
  "specifications",
  "tags",
  "flags",
  "status",
];
const statuses = ["draft", "active", "inactive"];

// Kiểm tra kiểu gốc trước khi Mongoose ép kiểu; Model kiểm tra required và giá trị subdocument.
const productFields = [
  check()
    .isObject({ strict: true })
    .withMessage("Dữ liệu sản phẩm phải là object")
    .bail()
    .custom(
      (value, { req }) =>
        (Object.keys(value).length > 0 || req.files?.length > 0) &&
        Object.keys(value).every((key) =>
          PRODUCT_EDITABLE_FIELDS.includes(key) || key === "primaryImageIndex",
        ),
    )
    .withMessage(
      "Dữ liệu sản phẩm rỗng hoặc chứa trường không được phép chỉnh sửa",
    ),
  check("primaryImageIndex")
    .optional()
    .custom((value, { req }) =>
      /^(0|[1-9]\d*)$/.test(String(value)) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) < (req.files?.length ?? 0),
    )
    .withMessage("Ảnh chính mới phải nằm trong danh sách ảnh tải lên.")
    .toInt(),
  check("name")
    .optional()
    .isString()
    .withMessage("Tên sản phẩm phải là chuỗi")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Tên sản phẩm không được để trống"),
  check("slug")
    .optional()
    .isString()
    .withMessage("Slug phải là chuỗi")
    .bail()
    .trim()
    .toLowerCase()
    .matches(SLUG_PATTERN)
    .withMessage("Slug không hợp lệ"),
  check(["brand", "category"])
    .optional()
    .isString()
    .withMessage("Thương hiệu và danh mục phải là chuỗi")
    .bail()
    .notEmpty()
    .withMessage("Thương hiệu và danh mục không được để trống"),
  check("status")
    .optional()
    .isString()
    .withMessage("Trạng thái không hợp lệ")
    .bail()
    .isIn(statuses)
    .withMessage("Trạng thái không hợp lệ"),
  check(["shortDescription", "description"])
    .optional()
    .isString()
    .withMessage("Mô tả phải là chuỗi"),
  check(["images", "tags", "highlights", "specifications"])
    .optional()
    .isArray()
    .withMessage("Dữ liệu phải là mảng"),
  check(["tags.*", "highlights.*"])
    .isString()
    .withMessage("Tags và highlights phải chứa các chuỗi"),
  check("images.*")
    .isObject({ strict: true })
    .withMessage("Ảnh phải là object")
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) =>
        ["url", "publicId", "alt", "isPrimary"].includes(key),
      ),
    )
    .withMessage("Cấu trúc ảnh không hợp lệ"),
  check(["images.*.url", "images.*.publicId", "images.*.alt"])
    .optional()
    .isString()
    .withMessage("Thông tin ảnh phải là chuỗi"),
  check("images.*.isPrimary")
    .optional()
    .custom((value) => typeof value === "boolean")
    .withMessage("isPrimary phải là boolean"),
  check("flags")
    .optional()
    .isObject({ strict: true })
    .withMessage("Flags phải là object")
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) =>
        ["isFeatured", "isNew", "isHotDeal"].includes(key),
      ),
    )
    .withMessage("Flags không hợp lệ"),
  check(["flags.isFeatured", "flags.isNew", "flags.isHotDeal"])
    .optional()
    .custom((value) => typeof value === "boolean")
    .withMessage("Flags phải là boolean"),
  check("technicalSpecs")
    .optional({ values: "null" })
    .isObject({ strict: true })
    .withMessage("Thông số kỹ thuật phải là object hoặc null")
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) =>
        [
          "chip",
          "chipBrand",
          "operatingSystem",
          "network",
          "batteryCapacity",
          "screenSize",
          "refreshRate",
          "cameraMainMp",
          "wirelessCharging",
        ].includes(key),
      ),
    )
    .withMessage("Thông số kỹ thuật không hợp lệ"),
  check([
    "technicalSpecs.chip",
    "technicalSpecs.chipBrand",
    "technicalSpecs.operatingSystem",
    "technicalSpecs.network",
  ])
    .optional()
    .isString()
    .withMessage("Thông số phải là chuỗi"),
  check([
    "technicalSpecs.batteryCapacity",
    "technicalSpecs.screenSize",
    "technicalSpecs.refreshRate",
    "technicalSpecs.cameraMainMp",
  ])
    .optional({ values: "null" })
    .custom((value) => typeof value === "number")
    .withMessage("Thông số phải là số hoặc null"),
  check("technicalSpecs.wirelessCharging")
    .optional()
    .custom((value) => typeof value === "boolean")
    .withMessage("wirelessCharging phải là boolean"),
  check("specifications.*")
    .isObject({ strict: true })
    .withMessage("Nhóm thông số phải là object")
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) =>
        ["key", "title", "items"].includes(key),
      ),
    )
    .withMessage("Nhóm thông số không hợp lệ"),
  check(["specifications.*.key", "specifications.*.title"])
    .optional()
    .isString()
    .withMessage("Nhóm thông số phải dùng chuỗi"),
  check("specifications.*.items")
    .optional()
    .isArray()
    .withMessage("Items phải là mảng"),
  check("specifications.*.items.*")
    .isObject({ strict: true })
    .withMessage("Thông số phải là object")
    .bail()
    .custom((value) =>
      Object.keys(value).every((key) =>
        ["key", "label", "value"].includes(key),
      ),
    )
    .withMessage("Thông số không hợp lệ"),
  check([
    "specifications.*.items.*.key",
    "specifications.*.items.*.label",
    "specifications.*.items.*.value",
  ])
    .optional()
    .isString()
    .withMessage("Thông số phải dùng chuỗi"),
];

const productFormFields = [
  check([
    "images",
    "tags",
    "highlights",
    "technicalSpecs",
    "specifications",
    "flags",
  ])
    .if(
      (value, { req }) =>
        req.is("multipart/form-data") && typeof value === "string",
    )
    .custom((value) => {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    })
    .withMessage("Các trường mảng/object trong form phải là JSON hợp lệ.")
    .bail()
    .customSanitizer((value) => JSON.parse(value)),
];

export const validatorCreateProduct = [
  check("images")
    .custom((value, { req }) => !req.files?.length || value === undefined)
    .withMessage(
      "Chỉ chọn file ảnh hoặc metadata images, không gửi đồng thời cả hai.",
    ),
  ...productFormFields,
  check(["name", "brand", "category"])
    .exists()
    .withMessage("Tên, thương hiệu và danh mục không được để trống"),
  check("slug").customSanitizer((value) =>
    typeof value === "string" && !value.trim() ? undefined : value,
  ),
  ...productFields,
  validateRequest,
];

export const validatorUpdateProduct = [
  ...productFormFields,
  ...productFields,
  validateRequest,
];

export const validatorUpdateProductStatus = [
  check()
    .isObject({ strict: true })
    .withMessage("Dữ liệu sản phẩm phải là object")
    .bail()
    .custom((value) => Object.keys(value).every((key) => key === "status"))
    .withMessage("Chỉ được cập nhật trạng thái sản phẩm"),
  check("status")
    .isString()
    .withMessage("Trạng thái không hợp lệ")
    .bail()
    .isIn(statuses)
    .withMessage("Trạng thái không hợp lệ"),
  validateRequest,
];

export const validateProductQuery = [
  query(["brand", "category"])
    .optional()
    .isString()
    .withMessage("Slug thương hiệu hoặc danh mục không hợp lệ.")
    .bail()
    .custom((value) => SLUG_PATTERN.test(value.trim().toLowerCase()))
    .withMessage("Slug thương hiệu hoặc danh mục không hợp lệ."),
  query("search")
    .optional()
    .isString()
    .withMessage("Từ khóa tìm kiếm không hợp lệ.")
    .bail()
    .custom(
      (value) =>
        normalizeName(value).length > 0 && normalizeName(value).length <= 100,
    )
    .withMessage("Tìm kiếm phải là chuỗi không rỗng, tối đa 100 ký tự."),
  query("status")
    .if((_value, { req }) => req.user?.role === "admin")
    .optional()
    .isString()
    .withMessage("Trạng thái sản phẩm không hợp lệ.")
    .bail()
    .isIn(statuses)
    .withMessage("Trạng thái sản phẩm không hợp lệ."),
  validateRequest,
];
