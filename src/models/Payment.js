import mongoose from "mongoose";

export const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    provider: { type: String, enum: ["VNPAY"], default: "VNPAY", required: true },
    transactionRef: { type: String, required: true, trim: true },
    // Số tiền gốc tính bằng VND; Service chuyển đổi đơn vị khi gọi VNPay.
    amount: {
      type: Number,
      required: true,
    },
    currency: { type: String, enum: ["VND"], default: "VND", required: true },
    status: { type: String, enum: ["pending", "success", "failed",], default: "pending", required: true },
    providerTransactionId: { type: String, trim: true },
    responseCode: { type: String, trim: true },
    transactionStatus: { type: String, trim: true },
    bankCode: { type: String, trim: true },
    signatureVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    paidAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true, autoIndex: true, autoCreate: false },
);

// Một Order có thể có nhiều lần thử thanh toán, mỗi lần có tham chiếu riêng.
paymentSchema.index({ transactionRef: 1 }, { unique: true });
paymentSchema.index({ order: 1, createdAt: -1 });
paymentSchema.index(
  { provider: 1, providerTransactionId: 1 },
  { unique: true, partialFilterExpression: { providerTransactionId: { $type: "string", $gt: "" } } },
);

// Chỉ Service sau khi xác minh chữ ký, tham chiếu và số tiền mới ghi nhận thành công.
const Payment = mongoose.models.Payment ?? mongoose.model("Payment", paymentSchema);
export default Payment;
