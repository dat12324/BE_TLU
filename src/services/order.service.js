import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import { HttpError } from "../utils/http-error.js";

const isMoney = (value) => Number.isSafeInteger(value) && value >= 0;
const maxSafeAmount = BigInt(Number.MAX_SAFE_INTEGER);

const safeAmount = (value, message) => {
  if (value < 0n || value > maxSafeAmount) throw new HttpError(400, message);
  return Number(value);
};

// Chỉ chuẩn bị document; checkout sau này lưu cùng thao tác giữ hàng trong transaction.
// user, discountAmount và shippingFee do backend đã xác thực/tính toán cung cấp, không lấy từ req.body.
export const prepareOrder = async (
  orderItems, shippingAddress, paymentMethod, note,
  user, discountAmount = 0, shippingFee = 0, session,
) => {
  if (!mongoose.isObjectIdOrHexString(user))
    throw new HttpError(400, "Vui lòng cung cấp người dùng hợp lệ.");
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    throw new HttpError(400, "Đơn hàng phải có ít nhất một sản phẩm hợp lệ.");
  }
  if (!isMoney(discountAmount) || !isMoney(shippingFee)) {
    throw new HttpError(
      400,
      "Số tiền phải là số nguyên không âm trong phạm vi an toàn, tính bằng VND.",
    );
  }

  const ids = new Set();
  for (const item of orderItems) {
    if (
      !item ||
      !mongoose.isObjectIdOrHexString(item.productVariant) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new HttpError(
        400,
        "Vui lòng cung cấp biến thể sản phẩm hợp lệ và số lượng nguyên dương trong phạm vi an toàn.",
      );
    }
    const id = item.productVariant.toString().toLowerCase();
    if (ids.has(id))
      throw new HttpError(
        400,
        "Các sản phẩm trong đơn hàng không được trùng biến thể.",
      );
    ids.add(id);
  }

  const variants = await ProductVariant.find({
    _id: { $in: [...ids] },
    status: "active",
    deletedAt: null,
  })
    .select("product sku ram storage color images price")
    .populate({
      path: "product",
      model: Product,
      select: "name status images",
      options: { session },
    })
    .session(session ?? null)
    .lean();
  const byId = new Map(
    variants.map((variant) => [variant._id.toString(), variant]),
  );
  const items = orderItems.map((item) => {
    const variant = byId.get(item.productVariant.toString().toLowerCase());
    if (!variant || variant.product?.status !== "active") {
      throw new HttpError(409, "Sản phẩm hoặc biến thể hiện không khả dụng.");
    }
    if (!isMoney(variant.price))
      throw new HttpError(409, "Giá sản phẩm không hợp lệ.");
    const subtotal = safeAmount(
      BigInt(item.quantity) * BigInt(variant.price),
      "Thành tiền sản phẩm phải bằng số lượng nhân đơn giá và nằm trong phạm vi số nguyên an toàn.",
    );
    const imageUrl =
      variant.color?.image?.url ??
      variant.images?.[0]?.url ??
      variant.product.images?.find((image) => image.isPrimary)?.url ??
      variant.product.images?.[0]?.url;
    return {
      product: variant.product._id,
      productVariant: variant._id,
      productName: variant.product.name,
      sku: variant.sku,
      ram: variant.ram,
      storage: variant.storage,
      color: variant.color?.name,
      imageUrl,
      quantity: item.quantity,
      unitPrice: variant.price,
      subtotal,
    };
  });
  const subtotal = safeAmount(
    items.reduce((sum, item) => sum + BigInt(item.subtotal), 0n),
    "Tổng tiền hàng phải bằng tổng thành tiền các sản phẩm và nằm trong phạm vi số nguyên an toàn.",
  );
  if (discountAmount > subtotal)
    throw new HttpError(
      400,
      "Số tiền giảm giá không được vượt quá tổng tiền hàng.",
    );
  const totalAmount = safeAmount(
    BigInt(subtotal) - BigInt(discountAmount) + BigInt(shippingFee),
    "Tổng thanh toán phải bằng tổng tiền hàng trừ giảm giá cộng phí vận chuyển và nằm trong phạm vi số nguyên an toàn.",
  );
  const address = shippingAddress;
  const order = new Order({
    orderCode: `TLU-${randomUUID()}`,
    user,
    items,
    shippingAddress:
      address == null
        ? undefined
        : {
            fullName: address.fullName,
            phone: address.phone,
            province: address.province,
            district: address.district,
            ward: address.ward,
            detailAddress: address.detailAddress,
          },
    subtotal,
    discountAmount,
    shippingFee,
    totalAmount,
    paymentMethod,
    note,
  });
  await order.validate();
  return order;
};
