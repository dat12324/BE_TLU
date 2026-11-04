import mongoose from "mongoose";
import { normalizeName } from "../utils/text.js";
import { createImageSchema } from "../schemas/image.schema.js";

export const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, set: normalizeName },
    subtitle: { type: String, trim: true },
    tag: { type: String, trim: true },
    priceText: { type: String, trim: true },
    btnText: { type: String, trim: true },
    image: {
      type: createImageSchema(),
      required: function () { return this.position !== "promo"; },
    },
    // FE ánh xạ các lựa chọn này sang màu nền và icon có sẵn.
    theme: { type: String, enum: ["slate", "indigo", "zinc", "amber", "purple"], default: "slate" },
    tone: { type: String, enum: ["rose", "slate", "emerald"], default: "rose" },
    icon: { type: String, enum: ["phone", "brands", "shipping"], default: "phone" },
    link: {
      type: String,
      trim: true,
      validate: {
        validator: value => !value || /^\/(?!\/)/.test(value) || /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value),
        message: "Liên kết banner phải là đường dẫn nội bộ hoặc URL HTTPS.",
      },
    },
    position: { type: String, enum: ["hero", "promo", "product-iphone", "product-android"], default: "hero", required: true },
    displayOrder: {
      type: Number,
      default: 0,
      required: true,
      validate: {
        validator: value => Number.isSafeInteger(value) && value >= 0,
        message: "Thứ tự hiển thị phải là số nguyên không âm.",
      },
    },
    status: { type: String, enum: ["active", "inactive"], default: "active", required: true },
    startsAt: { type: Date },
    endsAt: {
      type: Date,
      validate: {
        validator: function (value) { return !value || !this.startsAt || value > this.startsAt; },
        message: "Thời gian kết thúc phải sau thời gian bắt đầu.",
      },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, autoIndex: true, autoCreate: false },
);

bannerSchema.index({ position: 1, status: 1, displayOrder: 1 });

const Banner = mongoose.models.Banner ?? mongoose.model("Banner", bannerSchema);
export default Banner;
