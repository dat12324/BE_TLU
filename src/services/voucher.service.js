import Voucher from "../models/Voucher.js";
import { getCart } from "./cart.service.js";
import { normalizePagination } from "../utils/pagination.js";
import { HttpError } from "../utils/http-error.js";

export const VOUCHER_FIELDS = [
  "code", "description", "discountType", "discountValue", "maxDiscount",
  "minOrderValue", "usageLimit", "startsAt", "endsAt", "status",
];

const activeFilter = (now = new Date()) => ({
  status: "active",
  startsAt: { $lte: now },
  endsAt: { $gt: now },
  $expr: { $or: [
    { $eq: ["$usageLimit", null] },
    { $lt: ["$usedCount", "$usageLimit"] },
  ] },
});

export const listVouchers = async ({ page, limit, search, status } = {}, admin = false) => {
  ({ page, limit } = normalizePagination(page, limit));
  const filter = admin ? {} : activeFilter();
  if (admin && ["active", "inactive"].includes(status)) filter.status = status;
  if (typeof search === "string" && search.trim()) {
    filter.code = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  const [data, total] = await Promise.all([
    Voucher.find(filter).select("-__v").sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Voucher.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getVoucher = async (id) => {
  const voucher = await Voucher.findById(id).select("-__v").lean();
  if (!voucher) throw new HttpError(404, "Không tìm thấy mã giảm giá.");
  return voucher;
};

export const saveVoucher = async (input, id) => {
  const voucher = id ? await Voucher.findById(id) : new Voucher();
  if (!voucher) throw new HttpError(404, "Không tìm thấy mã giảm giá.");
  for (const field of VOUCHER_FIELDS) {
    if (input[field] !== undefined) voucher.set(field, input[field]);
  }
  if (voucher.endsAt <= voucher.startsAt) {
    throw new HttpError(400, "Thời gian kết thúc phải sau thời gian bắt đầu.");
  }
  if (voucher.discountType === "percentage" && voucher.discountValue > 100) {
    throw new HttpError(400, "Phần trăm giảm giá không được vượt quá 100%.");
  }
  if (voucher.usageLimit != null && voucher.usageLimit < voucher.usedCount) {
    throw new HttpError(400, "Giới hạn sử dụng không được nhỏ hơn số lượt đã dùng.");
  }
  if (await Voucher.exists({ code: voucher.code, ...(id ? { _id: { $ne: voucher._id } } : {}) })) {
    throw new HttpError(409, "Mã giảm giá đã tồn tại.");
  }
  await voucher.save();
  const data = voucher.toObject();
  delete data.__v;
  return data;
};

const calculateDiscount = (voucher, subtotal) => {
  if (subtotal < voucher.minOrderValue) {
    throw new HttpError(400, `Đơn hàng cần đạt tối thiểu ${voucher.minOrderValue.toLocaleString("vi-VN")}đ để sử dụng mã.`);
  }
  let discountAmount = voucher.discountType === "percentage"
    ? Math.round(subtotal * (voucher.discountValue / 100))
    : voucher.discountValue;
  if (voucher.maxDiscount != null) discountAmount = Math.min(discountAmount, voucher.maxDiscount);
  discountAmount = Math.min(discountAmount, subtotal);
  return discountAmount;
};

// Gọi trong transaction tạo đơn: tranh lượt cuối bằng một thao tác ghi có điều kiện.
export const useVoucher = async (code, subtotal, session) => {
  const voucher = await Voucher.findOneAndUpdate(
    { code, ...activeFilter(), minOrderValue: { $lte: subtotal } },
    { $inc: { usedCount: 1 } },
    { session, returnDocument: "after", runValidators: true },
  ).lean();
  if (!voucher) throw new HttpError(400, "Mã giảm giá không hợp lệ, hết hạn, hết lượt hoặc đơn hàng chưa đạt giá trị tối thiểu.");
  return { voucherId: voucher._id, code: voucher.code, discountAmount: calculateDiscount(voucher, subtotal) };
};

export const checkVoucher = async (userId, code, variantIds) => {
  const voucher = await Voucher.findOne({ code, ...activeFilter() }).lean();
  if (!voucher) throw new HttpError(400, "Mã giảm giá không hợp lệ, đã hết hạn hoặc hết lượt sử dụng.");
  const cart = await getCart(userId);
  const selectedIds = variantIds ? new Set(variantIds.map(String)) : null;
  const items = selectedIds ? cart.items.filter(item => selectedIds.has(String(item.variantId))) : cart.items;
  if (!items.length || (selectedIds && items.length !== selectedIds.size) || items.some(item => !item.isAvailable)) {
    throw new HttpError(409, "Giỏ hàng trống hoặc có sản phẩm hiện không khả dụng.");
  }
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = calculateDiscount(voucher, subtotal);
  return { voucherId: voucher._id, code: voucher.code, subtotal, discountAmount, totalAmount: subtotal - discountAmount };
};
