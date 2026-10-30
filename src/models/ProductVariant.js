import mongoose from "mongoose";
import { normalizeName } from "../utils/text.js";
import { getInventoryStatus } from "../utils/inventory.js";
import { createImageSchema } from "../schemas/image.schema.js";
import { isCloudinaryImageUrl, isCellphonesImageUrl } from "../utils/image-url.js";

const embeddedOptions = { _id: false };
const imageSchema = createImageSchema({
  validateCloudinaryUrl: false,
});
imageSchema.path("url").validate(
  value => isCloudinaryImageUrl(value) || isCellphonesImageUrl(value),
  "Ảnh phải sử dụng URL HTTPS của Cloudinary hoặc ảnh sản phẩm CellphoneS.",
);
imageSchema.path("publicId").required(function () {
  return !isCellphonesImageUrl(this.url);
});

const colorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, set: normalizeName },
    code: {
      type: String,
      trim: true,
      validate: {
        validator: (value) =>
          value == null || /^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/.test(value),
        message: "Mã màu phải có định dạng #RGB hoặc #RRGGBB.",
      },
    },
    image: { type: imageSchema, default: undefined },
  },
  embeddedOptions,
);

// Các giá trị này là số nguyên, khác với thông số thập phân tùy chọn của numericSpec.
const isNonNegativeInteger = (value) =>
  Number.isSafeInteger(value) && value >= 0;
const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

export const productVariantSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sku: { type: String, required: true, uppercase: true, trim: true },
    ram: {
      type: Number,
      required: true,
      validate: {
        validator: isPositiveInteger,
        message:
          "RAM phải là số nguyên dương trong phạm vi an toàn, tính bằng GB.",
      },
    },
    storage: {
      type: Number,
      required: true,
      validate: {
        validator: isPositiveInteger,
        message:
          "Bộ nhớ phải là số nguyên dương trong phạm vi an toàn, tính bằng GB.",
      },
    },
    color: { type: colorSchema, required: true },
    price: {
      type: Number,
      required: true,
      validate: {
        validator: isNonNegativeInteger,
        message:
          "Giá bán phải là số nguyên không âm trong phạm vi an toàn, tính bằng VND.",
      },
    },
    compareAtPrice: {
      type: Number,
      validate: {
        validator: (value) => value == null || isNonNegativeInteger(value),
        message:
          "Giá gốc phải là số nguyên không âm trong phạm vi an toàn, tính bằng VND.",
      },
    },
    stock: {
      type: Number,
      default: null,
      validate: {
        validator: (value) => value === null || isNonNegativeInteger(value),
        message:
          "Tồn kho phải là null hoặc số nguyên không âm trong phạm vi an toàn.",
      },
    },
    reservedStock: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator: isNonNegativeInteger,
        message:
          "Số lượng giữ hàng phải là số nguyên không âm trong phạm vi an toàn.",
      },
    },
    lowStockThreshold: {
      type: Number,
      required: true,
      default: 5,
      validate: {
        validator: isNonNegativeInteger,
        message:
          "Ngưỡng cảnh báo sắp hết hàng phải là số nguyên không âm trong phạm vi an toàn.",
      },
    },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    deletedAt: { type: Date, default: null },
    // API sau này gán các giá trị này từ quản trị viên đã xác thực, không lấy từ req.body.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    autoIndex: true,
    autoCreate: true,
    toJSON: { virtuals: ["inventoryStatus"] },
    toObject: { virtuals: ["inventoryStatus"] },
  },
);

productVariantSchema.virtual("inventoryStatus").get(function inventoryStatus() {
  return getInventoryStatus(this);
});

productVariantSchema.index({ sku: 1 }, { unique: true });
productVariantSchema.index(
  { product: 1 },
  {
    unique: true,
    name: "product_active_default_unique",
    partialFilterExpression: {
      isDefault: true,
      status: "active",
      deletedAt: null,
    },
  },
);
productVariantSchema.index(
  { product: 1, ram: 1, storage: 1, "color.name": 1 },
  {
    unique: true,
    name: "product_ram_storage_color_live_unique_ci",
    partialFilterExpression: { deletedAt: null },
    collation: { locale: "en", strength: 2, normalization: true },
  },
);
productVariantSchema.index({ product: 1, status: 1, deletedAt: 1 });

// Quy tắc giá và tồn kho được kiểm tra trong ProductVariant Service.
// Thay đổi tồn kho phải dùng atomic update có điều kiện hoặc transaction.
const ProductVariant =
  mongoose.models.ProductVariant ??
  mongoose.model("ProductVariant", productVariantSchema);
export default ProductVariant;
