import mongoose from "mongoose";

const flashSaleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  isEnabled: { type: Boolean, default: true },
  items: [{
    productVariant: { type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant", required: true },
    discountPercent: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
      validate: Number.isInteger,
    },
  }],
}, { timestamps: true });

export default mongoose.model("FlashSale", flashSaleSchema);
