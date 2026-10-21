import mongoose from 'mongoose';
import { normalizeName, normalizeStringArray } from '../utils/text.js';
import { SLUG_PATTERN } from '../utils/validation-patterns.js';
import { numericSpec } from '../utils/schema-fields.js';
import { createImageSchema } from '../schemas/image.schema.js';

const embeddedOptions = { _id: false };

const imageSchema = createImageSchema({ includeAlt: true, includeIsPrimary: true });
imageSchema.set('strict', true);

const technicalSpecsSchema = new mongoose.Schema({
  chip: { type: String, trim: true },
  chipBrand: { type: String, trim: true },
  batteryCapacity: numericSpec(true), // mAh
  screenSize: numericSpec(true), // inch
  refreshRate: numericSpec(), // Hz
  cameraMainMp: numericSpec(), // MP
  operatingSystem: { type: String, trim: true },
  network: { type: String, trim: true },
  wirelessCharging: { type: Boolean },
}, embeddedOptions);

const specificationItemSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
}, embeddedOptions);

const specificationGroupSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  items: { type: [specificationItemSchema], default: [] },
}, embeddedOptions);

export const productSchema = new mongoose.Schema({
  // Chỉ chứa tên mẫu sản phẩm; RAM, bộ nhớ và màu thuộc ProductVariant.
  name: {
    type: String, required: true, trim: true,
    set: normalizeName,
  },
  slug: {
    type: String, required: true, lowercase: true, trim: true,
    match: [SLUG_PATTERN, 'Slug must contain letters, digits and single hyphens between segments.'],
  },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  shortDescription: { type: String, trim: true },
  description: { type: String, trim: true },
  highlights: { type: [String], default: [], set: value => normalizeStringArray(value) },
  images: {
    type: [imageSchema], default: [],
    validate: {
      validator: images => Array.isArray(images) && images.every(Boolean),
      message: 'Product images must be an array of valid images.',
    },
  },
  technicalSpecs: { type: technicalSpecsSchema, default: undefined },
  specifications: { type: [specificationGroupSchema], default: [] },
  tags: {
    type: [String], default: [],
    set: value => {
      const normalized = normalizeStringArray(value, true);
      return Array.isArray(normalized) ? [...new Set(normalized)] : normalized;
    },
  },
  ratingAverage: {
    type: Number, default: 0, min: 0, max: 5,
    validate: {
      validator: value => Number.isFinite(value),
      message: 'Rating must be finite.',
    },
  },
  reviewCount: {
    type: Number, default: 0,
    validate: {
      validator: value => Number.isSafeInteger(value) && value >= 0,
      message: 'Review count must be a non-negative safe integer.',
    },
  },
  // Đường dẫn lồng nhau tránh xung đột với Document.isNew của Mongoose.
  flags: {
    isFeatured: { type: Boolean, default: false },
    isNew: { type: Boolean, default: false },
    isHotDeal: { type: Boolean, default: false },
  },
  status: { type: String, enum: ['draft', 'active', 'inactive'], default: 'draft' },
  // API sau này phải lấy các giá trị này từ quản trị viên đã xác thực, không lấy từ req.body.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  autoIndex: true,
  autoCreate: true,
});

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ brand: 1 });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });

// Tạo/cập nhật qua Product Service để kiểm tra quy tắc ảnh, đánh giá và Brand/Category.
// Giá, tồn kho, SKU, RAM, bộ nhớ và màu sẽ được lấy từ ProductVariant.
const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);
export default Product;
