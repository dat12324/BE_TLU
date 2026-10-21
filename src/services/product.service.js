import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import Category from '../models/Category.js';
import { HttpError } from '../utils/http-error.js';
import { normalizeStringArray } from '../utils/text.js';

const editableFields = new Set([
  'name', 'slug', 'brand', 'category', 'shortDescription', 'description',
  'highlights', 'images', 'technicalSpecs', 'specifications', 'tags', 'flags', 'status',
]);

function checkInput(input, adminId) {
  // Caller phải xác thực Admin trước khi gọi service; không lấy adminId từ request body.
  if (!mongoose.isObjectIdOrHexString(adminId)) throw new HttpError(400, 'Valid Admin ID is required.');
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(field => !editableFields.has(field))) {
    throw new HttpError(400, 'Product contains unsupported or protected fields.');
  }
}

async function persistProduct(product, session) {
  // Bao gồm push()/sửa phần tử trực tiếp trên document trước khi lưu qua service.
  if (product.isModified('tags')) {
    const tags = normalizeStringArray(product.tags, true);
    product.tags = Array.isArray(tags) ? [...new Set(tags)] : tags;
  }
  if (product.isModified('highlights')) {
    product.highlights = normalizeStringArray(product.highlights);
  }
  await product.validate();
  if (product.images.filter(image => image.isPrimary).length > 1) {
    throw new HttpError(400, 'A product can have at most one primary image.');
  }
  if (product.reviewCount === 0 && product.ratingAverage !== 0) {
    throw new HttpError(400, 'Rating must be zero when there are no reviews.');
  }
  const brand = await Brand.exists({ _id: product.brand, status: 'active' }).session(session ?? null);
  const category = await Category.exists({ _id: product.category, status: 'active' }).session(session ?? null);
  if (!brand || !category) throw new HttpError(400, 'Brand and Category must exist and be active.');
  try {
    return await product.save({ session });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'Product slug already exists.');
    throw error;
  }
}

// Ảnh đầu vào phải là metadata từ Image Service đã kiểm tra quyền, không phải buffer/file.
// Service không tự upload/xóa ảnh. Chưa có Review Model để tính lại điểm đánh giá.
export async function createProduct(input, { adminId, session } = {}) {
  checkInput(input, adminId);
  const product = new Product({ createdBy: adminId, updatedBy: adminId });
  for (const field of Object.keys(input)) product.set(field, input[field]);
  return persistProduct(product, session);
}

export async function updateProduct(productId, input, { adminId, session } = {}) {
  checkInput(input, adminId);
  if (!mongoose.isObjectIdOrHexString(productId)) throw new HttpError(400, 'Valid Product ID is required.');
  const product = await Product.findById(productId).session(session ?? null);
  if (!product) throw new HttpError(404, 'Product not found.');
  for (const field of Object.keys(input)) product.set(field, input[field]);
  product.updatedBy = adminId;
  return persistProduct(product, session);
}
