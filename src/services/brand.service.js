import mongoose from "mongoose";
import slugify from "slugify";
import { normalizePagination } from "../utils/pagination.js";
import Brand from "../models/Brand.js";
import { validateCatalogId } from "../validators/catalog.validator.js";
import { HttpError } from "../utils/http-error.js";


const adminFields =
  "name slug description logo status createdBy updatedBy createdAt updatedAt";
const publicFields = "name slug description logo.url status";

const saveBrand = async (brand) => {
  let saved = false;
  try {
    await brand.validate();
    const excludeSelf = { _id: { $ne: brand._id } };
    if (
      await Brand.exists({ name: brand.name, ...excludeSelf }).collation({
        locale: "en",
        strength: 2,
      })
    ) {
      throw new HttpError(409, "Tên thương hiệu đã tồn tại.");
    }
    if (await Brand.exists({ slug: brand.slug, ...excludeSelf }))
      throw new HttpError(409, "Đường dẫn thương hiệu đã tồn tại.");
    await brand.save();
    saved = true;
    const data = brand.toObject();
    delete data.__v;
    return data;
  } catch (error) {
    if (saved) Object.defineProperty(error, "uploadCommitted", { value: true });
    if (error.code === 11000)
      throw new HttpError(409, "Tên hoặc đường dẫn thương hiệu đã tồn tại.");
    if (error instanceof mongoose.Error.ValidationError)
      throw new HttpError(400, "Dữ liệu thương hiệu không hợp lệ.");
    if (error instanceof mongoose.Error.DocumentNotFoundError)
      throw new HttpError(404, "Không tìm thấy thương hiệu.");
    if (error instanceof mongoose.Error.VersionError)
      throw new HttpError(409, "Thương hiệu đã thay đổi. Vui lòng tải lại và thử lại.");
    throw error;
  }
};

export const listBrands = async (page = 1, limit = 20, status, admin = false) => {
  ({ page, limit } = normalizePagination(page, limit));
  const filter = status ? { status } : {};
  const [data, total] = await Promise.all([
    Brand.find(filter)
      .select(admin ? adminFields : publicFields)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Brand.countDocuments(filter),
  ]);
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getBrand = async (id) => {
  validateCatalogId(id, "thương hiệu");
  const brand = await Brand.findById(id).select(adminFields).lean();
  if (!brand) throw new HttpError(404, "Không tìm thấy thương hiệu.");
  return brand;
};

export const createBrand = async (name, slug, description, logo, status, adminId) => {
  if (slug === undefined && typeof name === "string")
    slug = slugify(name, { lower: true, strict: true, locale: "vi", trim: true });
  const data = Object.fromEntries(
    Object.entries({ name, slug, description, logo, status }).filter(([, value]) => value !== undefined),
  );
  validateCatalogId(adminId, "quản trị viên");
  const brand = new Brand({ ...data, createdBy: adminId, updatedBy: adminId });
  return saveBrand(brand);
};

export const updateBrand = async (id, name, slug, description, logo, status, adminId) => {
  if (slug === undefined && typeof name === "string")
    slug = slugify(name, { lower: true, strict: true, locale: "vi", trim: true });
  const data = Object.fromEntries(
    Object.entries({ name, slug, description, logo, status }).filter(([, value]) => value !== undefined),
  );
  validateCatalogId(id, "thương hiệu");
  validateCatalogId(adminId, "quản trị viên");
  const brand = await Brand.findById(id);
  if (!brand) throw new HttpError(404, "Không tìm thấy thương hiệu.");
  for (const field of Object.keys(data)) brand.set(field, data[field]);
  brand.updatedBy = adminId;
  if (logo !== undefined) brand.increment();
  return saveBrand(brand);
};

// Xóa mềm bằng status hiện có; không xóa Product hoặc ảnh Cloudinary.
export const deactivateBrand = async (id, adminId) => {
  validateCatalogId(id, "thương hiệu");
  validateCatalogId(adminId, "quản trị viên");
  const brand = await Brand.findByIdAndUpdate(
    id,
    { $set: { status: "inactive", updatedBy: adminId } },
    { returnDocument: "after", runValidators: true },
  )
    .select(adminFields)
    .lean();
  if (!brand) throw new HttpError(404, "Không tìm thấy thương hiệu.");
  return brand;
};
