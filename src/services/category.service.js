import mongoose from "mongoose";
import slugify from "slugify";
import { normalizePagination } from "../utils/pagination.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { validateCatalogId } from "../validators/catalog.validator.js";
import { HttpError } from "../utils/http-error.js";


const adminFields =
  "name slug description image status createdBy updatedBy createdAt updatedAt";
const publicFields = "name slug description image.url status";

const saveCategory = async (category) => {
  let saved = false;
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
    saved = true;
    const data = category.toObject();
    delete data.__v;
    return data;
  } catch (error) {
    if (saved) Object.defineProperty(error, "uploadCommitted", { value: true });
    if (error.code === 11000)
      throw new HttpError(409, "Tên hoặc đường dẫn danh mục đã tồn tại.");
    if (error instanceof mongoose.Error.ValidationError)
      throw new HttpError(400, "Dữ liệu danh mục không hợp lệ.");
    if (error instanceof mongoose.Error.DocumentNotFoundError)
      throw new HttpError(404, "Không tìm thấy danh mục.");
    if (error instanceof mongoose.Error.VersionError)
      throw new HttpError(409, "Danh mục đã thay đổi. Vui lòng tải lại và thử lại.");
    throw error;
  }
};

export const listCategories = async (page = 1, limit = 20, status, admin = false) => {
  ({ page, limit } = normalizePagination(page, limit));
  const filter = status ? { status } : {};
  const [data, total] = await Promise.all([
    Category.find(filter)
      .select(admin ? adminFields : publicFields)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Category.countDocuments(filter),
  ]);
  if (admin && data.length) {
    const counts = await Product.aggregate([
      { $match: { category: { $in: data.map(category => category._id) } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const byCategory = new Map(counts.map(item => [item._id.toString(), item.count]));
    for (const category of data) category.productCount = byCategory.get(category._id.toString()) ?? 0;
  }
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getCategory = async (id) => {
  validateCatalogId(id, "danh mục");
  const category = await Category.findById(id).select(adminFields).lean();
  if (!category) throw new HttpError(404, "Không tìm thấy danh mục.");
  return category;
};

export const createCategory = async (name, slug, description, image, status, adminId) => {
  if (slug === undefined && typeof name === "string")
    slug = slugify(name, { lower: true, strict: true, locale: "vi", trim: true });
  const data = Object.fromEntries(
    Object.entries({ name, slug, description, image, status }).filter(([, value]) => value !== undefined),
  );
  validateCatalogId(adminId, "quản trị viên");
  const category = new Category({ ...data, createdBy: adminId, updatedBy: adminId });
  return saveCategory(category);
};

export const updateCategory = async (id, name, slug, description, image, status, adminId) => {
  if (slug === undefined && typeof name === "string")
    slug = slugify(name, { lower: true, strict: true, locale: "vi", trim: true });
  const data = Object.fromEntries(
    Object.entries({ name, slug, description, image, status }).filter(([, value]) => value !== undefined),
  );
  validateCatalogId(id, "danh mục");
  validateCatalogId(adminId, "quản trị viên");
  // Đổi trạng thái không cần kiểm tra lại ảnh/dữ liệu cũ không được chỉnh sửa.
  if (Object.keys(data).length === 1 && status !== undefined) {
    const category = await Category.findByIdAndUpdate(
      id,
      { $set: { status, updatedBy: adminId } },
      { returnDocument: "after", runValidators: true },
    ).select(adminFields).lean();
    if (!category) throw new HttpError(404, "Không tìm thấy danh mục.");
    return category;
  }
  const category = await Category.findById(id);
  if (!category) throw new HttpError(404, "Không tìm thấy danh mục.");
  for (const field of Object.keys(data)) category.set(field, data[field]);
  category.updatedBy = adminId;
  if (image !== undefined) category.increment();
  return saveCategory(category);
};

