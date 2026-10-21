
import mongoose from 'mongoose';
import { normalizeName } from '../utils/text.js';
import { SLUG_PATTERN } from '../utils/validation-patterns.js';
import { createImageSchema } from '../schemas/image.schema.js';

export const brandSchema = new mongoose.Schema({
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

  logo: {
    type: createImageSchema({ validateCloudinaryUrl: false }),
    default: undefined,
  },

  description: {
    type: String,
    trim: true,
  },

  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
  strict: 'throw',
  autoIndex: true,
  autoCreate: false,
});

// Không phân biệt chữ hoa/chữ thường khi kiểm tra tên trùng.
// Ví dụ: Samsung, SAMSUNG, samsung được xem là trùng nhau.
brandSchema.index(
  { name: 1 },
  {
    unique: true,
    name: 'name_unique_ci',
    collation: {
      locale: 'en',
      strength: 2,
    },
  }
);

// Slug phải duy nhất.
brandSchema.index(
  { slug: 1 },
  { unique: true }
);

// Không tự động xóa Brand khi có Product liên kết.
// API sau này nên chuyển status sang inactive.

const Brand =
  mongoose.models.Brand ??
  mongoose.model('Brand', brandSchema);

export default Brand;
