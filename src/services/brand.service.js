import mongoose from "mongoose";
import Brand from "../models/Brand.js";
import {
  validateCatalogId,
  validateCatalogInput,
  validateCatalogQuery,
} from "../validators/catalog.validator.js";
import { HttpError } from "../utils/http-error.js";

const adminFields =
  "name slug description logo status createdBy updatedBy createdAt updatedAt";
const publicFields = "name slug description logo.url status";

async function saveBrand(brand) {
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
    const data = brand.toObject();
    delete data.__v;
    return data;
  } catch (error) {
    if (error.code === 11000)
      throw new HttpError(409, "Tên hoặc đường dẫn thương hiệu đã tồn tại.");
    if (error instanceof mongoose.Error.ValidationError)
      throw new HttpError(400, "Dữ liệu thương hiệu không hợp lệ.");
    if (error instanceof mongoose.Error.DocumentNotFoundError)
      throw new HttpError(404, "Không tìm thấy thương hiệu.");
    throw error;
  }
}

export async function listBrands(query = {}, { admin = false } = {}) {
  const { page, limit, status } = validateCatalogQuery(query, admin);
  const filter = admin ? (status ? { status } : {}) : { status: "active" };
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
}

export async function getBrand(id) {
  validateCatalogId(id, "thương hiệu");
  const brand = await Brand.findById(id).select(adminFields).lean();
  if (!brand) throw new HttpError(404, "Không tìm thấy thương hiệu.");
  return brand;
}

export async function createBrand(input, { adminId } = {}) {
  validateCatalogId(adminId, "quản trị viên");
  const data = validateCatalogInput(input, "logo");
  return saveBrand(
    new Brand({ ...data, createdBy: adminId, updatedBy: adminId }),
  );
}

export async function updateBrand(id, input, { adminId } = {}) {
  validateCatalogId(id, "thương hiệu");
  validateCatalogId(adminId, "quản trị viên");
  const data = validateCatalogInput(input, "logo", true);
  const brand = await Brand.findById(id);
  if (!brand) throw new HttpError(404, "Không tìm thấy thương hiệu.");
  for (const field of Object.keys(data)) brand.set(field, data[field]);
  brand.updatedBy = adminId;
  return saveBrand(brand);
}

// Xóa mềm bằng status hiện có; không xóa Product hoặc ảnh Cloudinary.
export async function deactivateBrand(id, { adminId } = {}) {
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
}
