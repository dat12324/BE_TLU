import mongoose from 'mongoose';

export const cartItemSchema = new mongoose.Schema({
  productVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    validate: {
      validator: value => Number.isSafeInteger(value) && value > 0,
      message: 'Cart item quantity must be a positive safe integer.',
    },
  },
}, { _id: false });

export const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: {
    type: [cartItemSchema],
    default: [],
    validate: {
      validator(items) {
        if (!Array.isArray(items) || !items.every(Boolean)) return false;
        const ids = items.map(item => {
          const variant = item.productVariant;
          // _id cũng xử lý tham chiếu đã được populate; tham chiếu thiếu được kiểm tra
          // bằng quy tắc required của từng mục, không cần truy vấn cơ sở dữ liệu.
          return variant == null ? null : (variant._id ?? variant).toString();
        }).filter(id => id !== null);
        return new Set(ids).size === ids.length;
      },
      message: 'Cart items must be valid and reference distinct ProductVariants.',
    },
  },
}, {
  timestamps: true,
  autoIndex: true,
  autoCreate: false,
});

// Tự động tạo khi kết nối; lỗi về tính duy nhất vẫn cần được xử lý trong dịch vụ.
// Dịch vụ giỏ hàng sau này phải xử lý lỗi trùng khóa 11000 khi tạo giỏ hàng.
cartSchema.index({ user: 1 }, { unique: true });

// Atomic update ở service phải dùng điều kiện chống trùng và giới hạn quantity.
// runValidators không kiểm tra $inc hoặc toàn bộ mảng khi dùng $push.

// Không lưu bản chụp giá, tổng tiền, cờ chọn, dữ liệu giữ hàng hoặc truy vấn cơ sở dữ liệu.
// Dịch vụ sau này: lấy người dùng từ phần xác thực, kiểm tra quyền sở hữu/biến thể khả dụng,
// tăng số lượng mục hiện có khi thêm cùng SKU, và tính
// dữ liệu hiển thị từ ProductVariant/Product/Brand. Khi thanh toán, kiểm tra lại
// ID đã chọn, số lượng, giá, trạng thái hoạt động/đã xóa và tồn kho; giỏ hàng không giữ hàng.
const Cart = mongoose.models.Cart ?? mongoose.model('Cart', cartSchema);
export default Cart;
