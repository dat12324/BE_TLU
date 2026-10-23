import mongoose from "mongoose";
import { normalizeName } from "../utils/text.js";
import { SLUG_PATTERN } from "../utils/validation-patterns.js";
import { HttpError } from "../utils/http-error.js";

export function validateCatalogId(value, label) {
  if (!mongoose.isObjectIdOrHexString(value))
    throw new HttpError(400, `ID ${label} không hợp lệ.`);
}

// imageField do service chọn cố định: logo cho Brand, image cho Category.
export function validateCatalogInput(input, imageField, partial = false) {
  const allowed = ["name", "slug", "description", "status", imageField];
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !Object.keys(input).length ||
    Object.keys(input).some((key) => !allowed.includes(key))
  ) {
    throw new HttpError(
      400,
      "Dữ liệu chứa trường không được hỗ trợ hoặc không được phép chỉnh sửa.",
    );
  }
  const data = {};
  for (const field of ["name", "slug"]) {
    if (partial && !Object.hasOwn(input, field)) continue;
    if (typeof input[field] !== "string" || !input[field].trim()) {
      throw new HttpError(
        400,
        `${field} là bắt buộc và phải là chuỗi không rỗng.`,
      );
    }
    data[field] =
      field === "name"
        ? normalizeName(input[field])
        : input[field].trim().toLowerCase();
  }
  if (data.slug !== undefined && !SLUG_PATTERN.test(data.slug)) {
    throw new HttpError(
      400,
      "Đường dẫn chỉ được chứa chữ cái, chữ số và dấu gạch nối đơn giữa các phần.",
    );
  }
  if (Object.hasOwn(input, "description")) {
    if (typeof input.description !== "string")
      throw new HttpError(400, "description phải là chuỗi.");
    data.description = input.description.trim();
  }
  if (Object.hasOwn(input, "status")) {
    if (!["active", "inactive"].includes(input.status))
      throw new HttpError(400, "Trạng thái không hợp lệ.");
    data.status = input.status;
  }
  if (Object.hasOwn(input, imageField)) {
    const image = input[imageField];
    if (image === null) data[imageField] = null;
    else {
      if (
        !image ||
        typeof image !== "object" ||
        Array.isArray(image) ||
        Object.keys(image).some((key) => !["url", "publicId"].includes(key)) ||
        typeof image.url !== "string" ||
        !image.url.trim() ||
        typeof image.publicId !== "string" ||
        !image.publicId.trim()
      ) {
        throw new HttpError(400, `${imageField} phải chứa url và publicId.`);
      }
      let url;
      try {
        url = new URL(image.url.trim());
      } catch {
        throw new HttpError(400, "URL ảnh không hợp lệ.");
      }
      if (!["http:", "https:"].includes(url.protocol))
        throw new HttpError(400, "URL ảnh phải sử dụng HTTP hoặc HTTPS.");
      data[imageField] = {
        url: image.url.trim(),
        publicId: image.publicId.trim(),
      };
    }
  }
  return data;
}

export function validateCatalogQuery(query, admin = false) {
  const allowed = admin ? ["page", "limit", "status"] : ["page", "limit"];
  if (Object.keys(query).some((key) => !allowed.includes(key)))
    throw new HttpError(400, "Tham số truy vấn không được hỗ trợ.");
  const result = { page: 1, limit: 20 };
  for (const field of ["page", "limit"]) {
    if (query[field] === undefined) continue;
    if (typeof query[field] !== "string" || !/^[1-9]\d*$/.test(query[field])) {
      throw new HttpError(400, `${field} phải là số nguyên dương.`);
    }
    result[field] = Number(query[field]);
    if (!Number.isSafeInteger(result[field]))
      throw new HttpError(400, `${field} không hợp lệ.`);
  }
  if (
    result.limit > 100 ||
    !Number.isSafeInteger((result.page - 1) * result.limit)
  ) {
    throw new HttpError(
      400,
      "Tham số phân trang vượt giới hạn; limit không được lớn hơn 100.",
    );
  }
  if (query.status !== undefined) {
    if (!["active", "inactive"].includes(query.status))
      throw new HttpError(400, "Bộ lọc trạng thái không hợp lệ.");
    result.status = query.status;
  }
  return result;
}
