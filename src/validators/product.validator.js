import { HttpError } from "../utils/http-error.js";
import { normalizeName } from "../utils/text.js";
import { SLUG_PATTERN } from "../utils/validation-patterns.js";
import { isCloudinaryImageUrl } from "../utils/image-url.js";
import {
  validateCatalogId,
  validateCatalogQuery,
} from "./catalog.validator.js";

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

function object(value, allowed, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  ) {
    throw new HttpError(
      400,
      `${label} chứa trường không được hỗ trợ hoặc không được phép chỉnh sửa.`,
    );
  }
}

function string(value, label, required = false) {
  if (typeof value !== "string" || (required && !value.trim())) {
    throw new HttpError(
      400,
      `${label} phải là chuỗi${required ? " không rỗng" : ""}.`,
    );
  }
  return value.trim();
}

function array(value, label) {
  if (!Array.isArray(value))
    throw new HttpError(400, `${label} phải là một mảng.`);
  return value;
}

function boolean(value, label) {
  if (typeof value !== "boolean")
    throw new HttpError(
      400,
      `${label} phải là giá trị đúng hoặc sai (boolean).`,
    );
  return value;
}

function slug(value) {
  const result = string(value, "slug", true).toLowerCase();
  if (!SLUG_PATTERN.test(result))
    throw new HttpError(400, "Đường dẫn sản phẩm không hợp lệ.");
  return result;
}

function status(value) {
  if (!statuses.includes(value))
    throw new HttpError(400, "Trạng thái sản phẩm không hợp lệ.");
  return value;
}

function image(value) {
  object(value, ["url", "publicId", "alt", "isPrimary"], "Ảnh");
  const result = {
    url: string(value.url, "image.url", true),
    publicId: string(value.publicId, "image.publicId", true),
  };
  if (!isCloudinaryImageUrl(result.url))
    throw new HttpError(400, "URL ảnh Cloudinary không hợp lệ.");
  if (Object.hasOwn(value, "alt")) result.alt = string(value.alt, "image.alt");
  if (Object.hasOwn(value, "isPrimary"))
    result.isPrimary = boolean(value.isPrimary, "image.isPrimary");
  return result;
}

export function parseProductInput(
  input,
  { partial = false, statusOnly = false } = {},
) {
  object(input, statusOnly ? ["status"] : PRODUCT_EDITABLE_FIELDS, "Sản phẩm");
  if (!Object.keys(input).length)
    throw new HttpError(400, "Dữ liệu sản phẩm không được để trống.");
  if (statusOnly) return { status: status(input.status) };
  const result = {};
  for (const field of ["name", "slug", "brand", "category"]) {
    if (partial && !Object.hasOwn(input, field)) continue;
    if (field === "brand" || field === "category") {
      if (typeof input[field] !== "string")
        throw new HttpError(400, `ID ${field} không hợp lệ.`);
      validateCatalogId(input[field], field);
      result[field] = input[field];
    } else
      result[field] =
        field === "slug"
          ? slug(input[field])
          : normalizeName(string(input[field], field, true));
  }
  for (const field of ["shortDescription", "description"]) {
    if (Object.hasOwn(input, field))
      result[field] = string(input[field], field);
  }
  for (const field of ["tags", "highlights"]) {
    if (Object.hasOwn(input, field))
      result[field] = array(input[field], field).map((value) =>
        string(value, field),
      );
  }
  if (Object.hasOwn(input, "images"))
    result.images = array(input.images, "images").map(image);
  if (Object.hasOwn(input, "status")) result.status = status(input.status);
  if (Object.hasOwn(input, "flags")) {
    object(input.flags, ["isFeatured", "isNew", "isHotDeal"], "flags");
    result.flags = {};
    for (const key of Object.keys(input.flags))
      result.flags[key] = boolean(input.flags[key], `flags.${key}`);
  }
  if (Object.hasOwn(input, "technicalSpecs")) {
    if (input.technicalSpecs === null) result.technicalSpecs = null;
    else {
      const textFields = ["chip", "chipBrand", "operatingSystem", "network"];
      const numberFields = [
        "batteryCapacity",
        "screenSize",
        "refreshRate",
        "cameraMainMp",
      ];
      object(
        input.technicalSpecs,
        [...textFields, ...numberFields, "wirelessCharging"],
        "technicalSpecs",
      );
      result.technicalSpecs = {};
      for (const [key, value] of Object.entries(input.technicalSpecs)) {
        if (textFields.includes(key))
          result.technicalSpecs[key] = string(value, `technicalSpecs.${key}`);
        else if (key === "wirelessCharging")
          result.technicalSpecs[key] = boolean(value, key);
        else {
          if (
            value !== null &&
            (typeof value !== "number" || !Number.isFinite(value))
          ) {
            throw new HttpError(400, `${key} phải là số hữu hạn hoặc null.`);
          }
          result.technicalSpecs[key] = value;
        }
      }
    }
  }
  if (Object.hasOwn(input, "specifications")) {
    result.specifications = array(input.specifications, "specifications").map(
      (group) => {
        object(group, ["key", "title", "items"], "Nhóm thông số");
        return {
          key: string(group.key, "group.key", true),
          title: string(group.title, "group.title", true),
          items: array(
            Object.hasOwn(group, "items") ? group.items : [],
            "group.items",
          ).map((item) => {
            object(item, ["key", "label", "value"], "Thông số");
            return {
              key: string(item.key, "item.key", true),
              label: string(item.label, "item.label", true),
              value: string(item.value, "item.value", true),
            };
          }),
        };
      },
    );
  }
  return result;
}

export function validateProductBody(options = {}) {
  return (req, _res, next) => {
    try {
      if (Object.keys(req.query).length)
        throw new HttpError(400, "API này không hỗ trợ tham số truy vấn.");
      req.validatedBody = parseProductInput(req.body, options);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateProductId(req, _res, next) {
  try {
    validateCatalogId(req.params.id, "sản phẩm");
    if (Object.keys(req.query).length)
      throw new HttpError(400, "API này không hỗ trợ tham số truy vấn.");
    next();
  } catch (error) {
    next(error);
  }
}

export function validateProductSlug(req, _res, next) {
  try {
    if (Object.keys(req.query).length)
      throw new HttpError(400, "API này không hỗ trợ tham số truy vấn.");
    req.validatedSlug = slug(req.params.slug);
    next();
  } catch (error) {
    next(error);
  }
}

export function validateProductList({ admin = false } = {}) {
  return (req, _res, next) => {
    try {
      const query = req.query;
      const allowed = [
        "page",
        "limit",
        "search",
        "brand",
        "category",
        ...(admin ? ["status"] : []),
      ];
      if (Object.keys(query).some((key) => !allowed.includes(key)))
        throw new HttpError(400, "Tham số truy vấn không được hỗ trợ.");
      const pagination = {};
      for (const key of ["page", "limit"])
        if (query[key] !== undefined) pagination[key] = query[key];
      const result = validateCatalogQuery(pagination);
      for (const key of ["brand", "category"]) {
        if (query[key] === undefined) continue;
        if (typeof query[key] !== "string")
          throw new HttpError(400, `ID ${key} không hợp lệ.`);
        validateCatalogId(query[key], key);
        result[key] = query[key];
      }
      if (query.search !== undefined) {
        result.search = normalizeName(string(query.search, "search", true));
        if (result.search.length > 100)
          throw new HttpError(
            400,
            "Nội dung tìm kiếm không được vượt quá 100 ký tự.",
          );
      }
      if (admin && query.status !== undefined)
        result.status = status(query.status);
      req.validatedQuery = result;
      next();
    } catch (error) {
      next(error);
    }
  };
}
