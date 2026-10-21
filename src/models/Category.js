import mongoose from 'mongoose';
import { normalizeName } from '../utils/text.js';
import { SLUG_PATTERN } from '../utils/validation-patterns.js';
import { createImageSchema } from '../schemas/image.schema.js';

export const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    set: normalizeName,
  },
  slug: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [
      SLUG_PATTERN,
      'Slug must contain lowercase letters, digits and single hyphens between segments.',
    ],
  },
  description: { type: String, trim: true },
  image: {
    type: createImageSchema({ validateCloudinaryUrl: false }),
    default: undefined,
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  // API sau này gán các trường truy vết từ quản trị viên đã xác thực, không lấy từ req.body.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  strict: 'throw',
  autoIndex: true,
  autoCreate: false,
});

// Mỗi chỉ mục chỉ khai báo một lần; tính duy nhất cần các chỉ mục này trong MongoDB.
// API sau này phải xử lý lỗi trùng khóa 11000; không coi unique là quy tắc kiểm tra dữ liệu.
categorySchema.index({ name: 1 }, {
  unique: true,
  name: 'name_unique_ci',
  collation: { locale: 'en', strength: 2 },
});
categorySchema.index({ slug: 1 }, { unique: true });

// Không xóa dây chuyền hoặc gây tác động lên Cloudinary trong middleware của mô hình.
// API sau này phải từ chối xóa khi có Product tham chiếu đến Category này và
// ưu tiên status=inactive. Tải lên/thay thế/xóa ảnh thuộc trách nhiệm của dịch vụ.
const Category = mongoose.models.Category ?? mongoose.model('Category', categorySchema);
export default Category;
