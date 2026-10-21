import mongoose from 'mongoose';

export const inventoryReservationSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  productVariant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
  quantity: {
    type: Number,
    required: true,
    validate: {
      validator: value => Number.isSafeInteger(value) && value > 0,
      message: 'Reserved quantity must be a positive safe integer.',
    },
  },
  status: { type: String, enum: ['active', 'committed', 'released'], default: 'active' },
  // Dịch vụ đặt thời hạn 15 phút cho VNPay; COD không có thời hạn tự động.
  expiresAt: { type: Date },
  releasedAt: { type: Date },
  committedAt: { type: Date },
}, {
  timestamps: true,
  strict: 'throw',
  autoIndex: true,
  autoCreate: false,
  optimisticConcurrency: true,
});

// Bao gồm bản ghi lịch sử: mỗi cặp đơn hàng/biến thể chỉ có một bản ghi giữ hàng.
inventoryReservationSchema.index({ order: 1, productVariant: 1 }, { unique: true });
// Chỉ hỗ trợ truy vấn. Không dùng TTL: hết hạn phải giải phóng hàng an toàn, không xóa lịch sử.
inventoryReservationSchema.index({ status: 1, expiresAt: 1 });

// Không tác động đến tồn kho, tính thời hạn, tra cứu hoặc dùng requireDocumentSave.
// Dịch vụ sau này phải chuyển trạng thái có điều kiện từ active sang committed/released
// và cập nhật nhất quán stock/reservedStock của ProductVariant trong một giao dịch.
// Kiểm tra trạng thái thanh toán trước khi giải phóng hàng giữ cho VNPay đã hết hạn (kể cả
// thông báo thanh toán thành công đến muộn), và bảo đảm xử lý lặp thông báo/tác vụ có tính lũy đẳng. Việc kiểm tra
// tham chiếu tồn tại, chủ đơn hàng, mốc thời gian và lỗi chỉ mục duy nhất thuộc trách nhiệm của dịch vụ.
const InventoryReservation = mongoose.models.InventoryReservation
  ?? mongoose.model('InventoryReservation', inventoryReservationSchema);
export default InventoryReservation;
