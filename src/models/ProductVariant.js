import mongoose from 'mongoose';
import { normalizeName } from '../utils/text.js';
import { getInventoryStatus } from '../utils/inventory.js';
import { createImageSchema } from '../schemas/image.schema.js';

const embeddedOptions = { _id: false };
const imageSchema = createImageSchema({
  urlValidationMessage: 'Image must use an HTTPS Cloudinary image URL.',
});
imageSchema.set('strict', true);

const colorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, set: normalizeName },
  code: { type: String, trim: true, validate: {
    validator: value => value == null || /^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/.test(value),
    message: 'Color code must be #RGB or #RRGGBB.',
  } },
  image: { type: imageSchema, default: undefined },
}, embeddedOptions);

// Các giá trị này là số nguyên, khác với thông số thập phân tùy chọn của numericSpec.
const isNonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const isPositiveInteger = value => Number.isSafeInteger(value) && value > 0;

export const productVariantSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sku: { type: String, required: true, uppercase: true, trim: true },
  ram: { type: Number, required: true, validate: {
    validator: isPositiveInteger, message: 'RAM must be a positive safe integer in GB.',
  } },
  storage: { type: Number, required: true, validate: {
    validator: isPositiveInteger, message: 'Storage must be a positive safe integer in GB.',
  } },
  color: { type: colorSchema, required: true },
  images: { type: [imageSchema], default: [] },
  price: { type: Number, required: true, validate: {
    validator: isNonNegativeInteger, message: 'Price must be a non-negative safe integer in VND.',
  } },
  compareAtPrice: { type: Number, validate: {
    validator: value => value == null || isNonNegativeInteger(value),
    message: 'Compare-at price must be a non-negative safe integer in VND.',
  } },
  stock: { type: Number, default: null, validate: {
    validator: value => value === null || isNonNegativeInteger(value),
    message: 'Stock must be null or a non-negative safe integer.',
  } },
  reservedStock: { type: Number, required: true, default: 0, validate: {
    validator: isNonNegativeInteger, message: 'Reserved stock must be a non-negative safe integer.',
  } },
  lowStockThreshold: { type: Number, required: true, default: 5, validate: {
    validator: isNonNegativeInteger, message: 'Low-stock threshold must be a non-negative safe integer.',
  } },
  isDefault: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  deletedAt: { type: Date, default: null },
  // API sau này gán các giá trị này từ quản trị viên đã xác thực, không lấy từ req.body.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  autoIndex: true,
  autoCreate: true,
  toJSON: { virtuals: ['inventoryStatus'] },
  toObject: { virtuals: ['inventoryStatus'] },
});

productVariantSchema.virtual('inventoryStatus').get(function inventoryStatus() {
  return getInventoryStatus(this);
});

productVariantSchema.index({ sku: 1 }, { unique: true });
productVariantSchema.index({ product: 1 }, {
  unique: true,
  name: 'product_active_default_unique',
  partialFilterExpression: { isDefault: true, status: 'active', deletedAt: null },
});
productVariantSchema.index({ product: 1, ram: 1, storage: 1, 'color.name': 1 }, {
  unique: true,
  name: 'product_ram_storage_color_live_unique_ci',
  partialFilterExpression: { deletedAt: null },
  collation: { locale: 'en', strength: 2, normalization: true },
});
productVariantSchema.index({ product: 1, status: 1, deletedAt: 1 });

// Quy tắc giá và tồn kho được kiểm tra trong ProductVariant Service.
// Thay đổi tồn kho phải dùng atomic update có điều kiện hoặc transaction.
const ProductVariant = mongoose.models.ProductVariant
  ?? mongoose.model('ProductVariant', productVariantSchema);
export default ProductVariant;
