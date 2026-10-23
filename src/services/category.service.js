import mongoose from "mongoose";
import Category from "../models/Category.js";
import {
  validateCatalogId,
  validateCatalogInput,
  validateCatalogQuery,
} from "../validators/catalog.validator.js";
import { HttpError } from "../utils/http-error.js";

const adminFields =
  "name slug description image status createdBy updatedBy createdAt updatedAt";
const publicFields = "name slug description image.url status";

async function saveCategory(category) {
  try {
    await category.validate();
    const excludeSelf = { _id: { $ne: category._id } };
    if (
      await Category.exists({ name: category.name, ...excludeSelf }).collation({
        locale: "en",
        strength: 2,
      })
    ) {
      throw new HttpError(409, "Tên danh mục đã tồn tại.");
    }
    if (await Category.exists({ slug: category.slug, ...excludeSelf }))
      throw new HttpError(409, "Đường dẫn danh mục đã tồn tại.");
    await category.save();
    const data = category.toObject();
    delete data.__v;
    return data;
  } catch (error) {
    if (error.code === 11000)
      throw new HttpError(409, "Tên hoặc đường dẫn danh mục đã tồn tại.");
    if (error instanceof mongoose.Error.ValidationError)
      throw new HttpError(400, "Dữ liệu danh mục không hợp lệ.");
    if (error instanceof mongoose.Error.DocumentNotFoundError)
      throw new HttpError(404, "Không tìm thấy danh mục.");
    throw error;
  }
}

export async function listCategories(query = {}, { admin = false } = {}) {
  const { page, limit, status } = validateCatalogQuery(query, admin);
  const filter = admin ? (status ? { status } : {}) : { status: "active" };
  const [data, total] = await Promise.all([
    Category.find(filter)
      .select(admin ? adminFields : publicFields)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Category.countDocuments(filter),
  ]);
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getCategory(id) {
  validateCatalogId(id, "danh mục");
  const category = await Category.findById(id).select(adminFields).lean();
  if (!category) throw new HttpError(404, "Không tìm thấy danh mục.");
  return category;
}

export async function createCategory(input, { adminId } = {}) {
  validateCatalogId(adminId, "quản trị viên");
  const data = validateCatalogInput(input, "image");
  return saveCategory(
    new Category({ ...data, createdBy: adminId, updatedBy: adminId }),
  );
}

export async function updateCategory(id, input, { adminId } = {}) {
  validateCatalogId(id, "danh mục");
  validateCatalogId(adminId, "quản trị viên");
  const data = validateCatalogInput(input, "image", true);
  const category = await Category.findById(id);
  if (!category) throw new HttpError(404, "Không tìm thấy danh mục.");
  for (const field of Object.keys(data)) category.set(field, data[field]);
  category.updatedBy = adminId;
  return saveCategory(category);
}

// Xóa mềm bằng status hiện có; không làm mất tham chiếu từ Product.
export async function deactivateCategory(id, { adminId } = {}) {
  validateCatalogId(id, "danh mục");
  validateCatalogId(adminId, "quản trị viên");
  const category = await Category.findByIdAndUpdate(
    id,
    { $set: { status: "inactive", updatedBy: adminId } },
    { returnDocument: "after", runValidators: true },
  )
    .select(adminFields)
    .lean();
  if (!category) throw new HttpError(404, "Không tìm thấy danh mục.");
  return category;
}
