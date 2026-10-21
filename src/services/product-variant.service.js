import mongoose from 'mongoose';
import ProductVariant from '../models/ProductVariant.js';
import Product from '../models/Product.js';
import { normalizeName } from '../utils/text.js';
import { HttpError } from '../utils/http-error.js';

const colorKey = value => typeof value === 'string'
  ? normalizeName(value).toLowerCase().normalize('NFC') : null;

// So sánh dung lượng dạng chuỗi cũ mà không ghi lại bất kỳ giá trị RAM/ROM đã lưu nào.
function capacityKey(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+)\s*(GB|TB)?$/i);
  if (!match) return null;
  const capacity = Number(match[1]) * (match[2]?.toUpperCase() === 'TB' ? 1024 : 1);
  return Number.isSafeInteger(capacity) && capacity > 0 ? capacity : null;
}

// Kiểm tra trước chỉ đọc cho thao tác ghi danh mục của quản trị viên. Chưa thêm Controller hoặc API CRUD.
// Phép chiếu trực tiếp giữ nguyên dung lượng dạng chuỗi cũ (Mongoose sẽ ép kiểu chúng).
export async function assertUniqueVariantCombination(variant, { session } = {}) {
  const ram = capacityKey(variant.ram);
  const storage = capacityKey(variant.storage);
  if (!mongoose.isObjectIdOrHexString(variant.product) || !colorKey(variant.color?.name)
    || !Number.isSafeInteger(ram) || ram <= 0 || !Number.isSafeInteger(storage) || storage <= 0) {
    throw new HttpError(400, 'Valid Product, RAM, storage and color name are required.');
  }
  const productId = new mongoose.Types.ObjectId(variant.product.toString());
  const filter = { product: { $in: [productId, productId.toHexString()] }, deletedAt: null };
  if (variant._id) filter._id = { $ne: new mongoose.Types.ObjectId(variant._id.toString()) };
  const candidates = await ProductVariant.collection.find(filter, {
    projection: { ram: 1, storage: 1, 'color.name': 1 }, session,
  }).toArray();
  const duplicate = candidates.some(candidate => capacityKey(candidate.ram) === ram
    && capacityKey(candidate.storage) === storage
    && colorKey(candidate.color?.name) === colorKey(variant.color.name));
  if (duplicate) throw new HttpError(409, 'A variant with this Product, RAM, storage and color already exists.');
}

// Mã quản trị đã được cấp quyền sau này cung cấp tài liệu chỉ chứa các chỉnh sửa được cho phép rõ ràng.
// Thao tác ghi mới chuẩn hóa khoảng trắng bằng bộ gán hiện có của color.name;
// chỉ mục duy nhất không phân biệt hoa/thường xử lý xung đột giữa các lần ghi danh mục mới.
export async function saveProductVariant(variant, { session } = {}) {
  if (!(variant instanceof ProductVariant)) throw new TypeError('Expected a ProductVariant document.');
  await variant.validate();
  if (variant.compareAtPrice != null && variant.compareAtPrice < variant.price) {
    throw new HttpError(400, 'Compare-at price must be greater than or equal to price.');
  }
  if (variant.stock === undefined) {
    throw new HttpError(400, 'Unverified stock must be explicitly null.');
  }
  if (variant.stock !== null && variant.reservedStock > variant.stock) {
    throw new HttpError(400, 'Reserved stock cannot exceed verified stock.');
  }
  // Helper lưu danh mục không được ghi đè tồn kho đang thay đổi bởi checkout.
  // Tồn kho hiện có phải cập nhật bằng service atomic riêng sau này.
  if (!variant.isNew && (variant.isModified('stock') || variant.isModified('reservedStock'))) {
    throw new HttpError(400, 'Existing inventory must use conditional atomic updates.');
  }
  if (!await Product.exists({ _id: variant.product }).session(session ?? null)) {
    throw new HttpError(400, 'Product must exist.');
  }
  const excludeSelf = variant._id ? { _id: { $ne: variant._id } } : {};
  if (await ProductVariant.exists({ sku: variant.sku, ...excludeSelf }).session(session ?? null)) {
    throw new HttpError(409, 'Variant SKU already exists.');
  }
  if (variant.isDefault && variant.status === 'active' && variant.deletedAt == null
    && await ProductVariant.exists({ product: variant.product, isDefault: true,
      status: 'active', deletedAt: null, ...excludeSelf }).session(session ?? null)) {
    throw new HttpError(409, 'Product already has an active default variant.');
  }
  if (variant.deletedAt == null) await assertUniqueVariantCombination(variant, { session });
  const previousWhere = variant.$where;
  // Giá và giá gốc có thể được sửa đồng thời; kiểm tra trường còn lại ngay khi ghi.
  if (!variant.isNew) {
    if (variant.isModified('price') && !variant.isModified('compareAtPrice')) {
      variant.$where = { ...variant.$where,
        $or: [{ compareAtPrice: null }, { compareAtPrice: { $gte: variant.price } }] };
    } else if (variant.isModified('compareAtPrice') && !variant.isModified('price') && variant.compareAtPrice != null) {
      variant.$where = { ...variant.$where, price: { $lte: variant.compareAtPrice } };
    }
  }
  try {
    return await variant.save({ session });
  } catch (error) {
    if (error instanceof mongoose.Error.DocumentNotFoundError) {
      throw new HttpError(409, 'Variant changed or is no longer available. Reload before updating.');
    }
    if (error.code === 11000) {
      throw new HttpError(409, 'Variant conflicts with an existing SKU, color combination or default.');
    }
    throw error;
  } finally {
    variant.$where = previousWhere;
  }
}
