import mongoose from "mongoose";

export const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: "Số sao phải là số nguyên từ 1 đến 5." },
    },
    content: { type: String, required: true, trim: true, maxlength: 3000 },
  },
  { timestamps: true},
);

// Một người đánh giá một sản phẩm một lần, có thể chỉnh sửa nhận xét đó.
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

// Service kiểm tra đơn đã mua và chỉ tổng hợp rating từ các review được duyệt.
const Review = mongoose.models.Review ?? mongoose.model("Review", reviewSchema);
export default Review;
