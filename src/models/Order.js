import mongoose from 'mongoose';

const embeddedOptions = { _id: false };
const isMoney = value => Number.isSafeInteger(value) && value >= 0;
const isPositiveInteger = value => Number.isSafeInteger(value) && value > 0;

function moneyField(defaultValue) {
  return {
    type: Number,
    required: true,
    default: defaultValue,
    validate: { validator: isMoney, message: 'Amount must be a non-negative safe integer in VND.' },
  };
}

export const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
  // Snapshot sản phẩm do service cung cấp.
  productName: { type: String, required: true, trim: true },
  sku: { type: String, required: true, trim: true },
  ram: { type: Number, required: true, validate: { validator: isPositiveInteger, message: 'RAM must be a positive safe integer.' } },
  storage: { type: Number, required: true, validate: { validator: isPositiveInteger, message: 'Storage must be a positive safe integer.' } },
  color: { type: String, required: true, trim: true },
  imageUrl: { type: String, trim: true },
  quantity: { type: Number, required: true, validate: { validator: isPositiveInteger, message: 'Quantity must be a positive safe integer.' } },
  unitPrice: moneyField(),
  subtotal: moneyField(),
}, embeddedOptions);

// Snapshot địa chỉ giao hàng.
export const shippingAddressSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  province: { type: String, required: true, trim: true },
  district: { type: String, trim: true },
  ward: { type: String, required: true, trim: true },
  detailAddress: { type: String, required: true, trim: true },
}, embeddedOptions);

export const orderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: {
    type: [orderItemSchema], required: true,
    validate: {
      validator: items => Array.isArray(items) && items.length > 0 && items.every(Boolean),
      message: 'Order must contain at least one valid item.',
    },
  },
  shippingAddress: { type: shippingAddressSchema, required: true },
  subtotal: moneyField(),
  discountAmount: moneyField(0),
  shippingFee: moneyField(0),
  totalAmount: moneyField(),
  paymentMethod: { type: String, enum: ['COD', 'VNPAY'], required: true },
  paymentStatus: { type: String, enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded'], default: 'unpaid' },
  status: { type: String, enum: ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled'], default: 'pending' },
  note: { type: String, trim: true },
  cancelReason: { type: String, trim: true },
  cancelledAt: { type: Date },
  deliveredAt: { type: Date },
}, {
  timestamps: true,
  autoIndex: true,
  autoCreate: true,
});

// Service xử lý duplicate key 11000 khi tạo mã đơn hàng.
orderSchema.index({ orderCode: 1 }, { unique: true });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

// API đổi trạng thái phải dùng service với bộ lọc trạng thái hiện tại và allowlist,
// không cập nhật items/giá/tổng tiền. Tính tiền và tạo snapshot qua Order Service.
// Service chịu trách nhiệm xác minh thanh toán và chống xử lý trùng.
const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);
export default Order;
