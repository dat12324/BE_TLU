import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import InventoryReservation from "../models/InventoryReservation.js";
import Notification from "../models/Notifications.js";
import { HttpError } from "../utils/http-error.js";
import { normalizePagination } from "../utils/pagination.js";

// Chuẩn bị giá và snapshot; createOrder lưu cùng thao tác giữ hàng trong transaction.
// user, discountAmount và shippingFee do backend đã xác thực/tính toán cung cấp, không lấy từ req.body.
export const prepareOrder = async (
  orderItems, shippingAddress, paymentMethod, note,
  user, discountAmount = 0, shippingFee = 0, session,
) => {
  const ids = new Set();
  for (const item of orderItems) {
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
    .select("product sku ram storage color price stock reservedStock")
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
    const variant = byId.get(item.productVariant.toString().toLowerCase()) ?? {};
    const subtotal = item.quantity * variant.price;
    const imageUrl =
      variant.color?.image?.url ??
      variant.product?.images?.find((image) => image?.isPrimary)?.url ??
      variant.product?.images?.[0]?.url;
    return {
      product: variant.product?._id,
      productVariant: item.productVariant,
      productName: variant.product?.name,
      sku: variant.sku,
      ram: variant.ram == null || variant.ram === "" ? undefined : variant.ram,
      storage: variant.storage == null || variant.storage === "" || variant.storage === "TIÊU CHUẨN" ? undefined : variant.storage,
      color: variant.color?.name,
      imageUrl,
      quantity: item.quantity,
      unitPrice: variant.price,
      subtotal,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const totalAmount = subtotal - discountAmount + shippingFee;
  const address = shippingAddress;
  const order = new Order({
    orderCode: `TLU${randomInt(0, 10_000_000_000).toString().padStart(10, "0")}`,
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
  return order;
};

export const createOrder = async (user, { items, shippingAddress, paymentMethod, note }) => {
  if (paymentMethod !== "COD")
    throw new HttpError(503, "Thanh toán VNPay chưa được triển khai. Vui lòng chọn COD.");
  return mongoose.connection.transaction(async session => {
    const order = await prepareOrder(items, shippingAddress, paymentMethod, note, user, 0, 0, session);
    order.shippingFee = order.subtotal >= 500000 ? 0 : 30000;
    order.totalAmount = order.subtotal + order.shippingFee;
    for (const item of order.items) {
      const result = await ProductVariant.updateOne({
        _id: item.productVariant, status: "active", deletedAt: null, price: item.unitPrice,
        stock: { $gte: item.quantity }, reservedStock: { $gte: 0 },
        $expr: { $lte: [{ $add: ["$reservedStock", item.quantity] }, "$stock"] },
      }, { $inc: { reservedStock: item.quantity, __v: 1 } }, { session });
      if (!result.matchedCount)
        throw new HttpError(409, "Giá hoặc tồn kho đã thay đổi. Vui lòng kiểm tra lại đơn hàng.");
    }
    await order.save({ session });
    await InventoryReservation.insertMany(order.items.map(item => ({
      order: order._id, productVariant: item.productVariant, quantity: item.quantity, status: "active",
    })), { session });
    await Notification.insertMany([{
      user: order.user,
      order: order._id,
      title: "Đặt hàng thành công",
      message: `Đơn hàng ${order.orderCode} đã được đặt thành công và đang chờ xác nhận.`,
    }], { session });
    return order;
  });
};

export const listOrders = async (user, admin, { page, limit, status, paymentMethod, search } = {}) => {
  ({ page, limit } = normalizePagination(page, limit));
  const filter = admin ? {} : { user };
  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (search) filter.orderCode = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const [data, total] = await Promise.all([
    Order.find(filter).select("-__v").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const getOrder = async (id, user, admin = false) => {
  const order = await Order.findOne({ _id: id, ...(admin ? {} : { user }) }).select("-__v").lean();
  if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng.");
  return order;
};

const settleReservations = async (order, committed, session) => {
  const reservations = await InventoryReservation.find({ order: order._id, status: "active" }).session(session).lean();
  for (const item of reservations) {
    const result = await ProductVariant.updateOne({
      _id: item.productVariant, reservedStock: { $gte: item.quantity },
      ...(committed ? { stock: { $gte: item.quantity } } : {}),
    }, { $inc: { reservedStock: -item.quantity, ...(committed ? { stock: -item.quantity } : {}), __v: 1 } }, { session });
    if (!result.matchedCount) throw new HttpError(409, "Tồn kho giữ hàng không hợp lệ.");
    await InventoryReservation.updateOne({ _id: item._id, status: "active" }, {
      $set: { status: committed ? "committed" : "released", [committed ? "committedAt" : "releasedAt"]: new Date() },
    }, { session, runValidators: true });
  }
};

const transitions = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipping", "cancelled"],
  shipping: ["delivered"],
  delivered: [],
  cancelled: [],
};

export const updateOrderStatus = async (id, user, admin, status, cancelReason) =>
  mongoose.connection.transaction(async session => {
    const filter = { _id: id, ...(admin ? {} : { user }) };
    const current = await Order.findOne(filter).session(session).lean();
    if ((!admin && status !== "cancelled") || !transitions[current?.status]?.includes(status))
      throw new HttpError(409, "Không thể chuyển đơn hàng sang trạng thái này.");
    const changes = { status };
    if (status === "cancelled") Object.assign(changes, {
      cancelReason: cancelReason || (admin ? "Quản trị viên hủy đơn." : "Khách hàng hủy đơn."), cancelledAt: new Date(),
    });
    if (status === "delivered") Object.assign(changes, { deliveredAt: new Date(), paymentStatus: "paid" });
    const order = await Order.findOneAndUpdate({
      ...filter, status: current.status, paymentMethod: current.paymentMethod, paymentStatus: current.paymentStatus,
    }, { $set: changes }, { session, returnDocument: "after", runValidators: true }).select("-__v").lean();
    if (order && (status === "cancelled" || status === "delivered"))
      await settleReservations(order, status === "delivered", session);
    if (order) {
      const titles = {
        confirmed: "Đơn hàng đã được xác nhận",
        shipping: "Đơn hàng đang giao",
        delivered: "Đơn hàng đã giao thành công",
        cancelled: "Đơn hàng đã hủy",
      };
      await Notification.insertMany([{
        user: order.user,
        order: order._id,
        title: titles[status],
        message: `${titles[status]}: ${order.orderCode}.${status === "cancelled" ? ` Lý do: ${order.cancelReason}` : ""}`,
      }], { session });
    }
    return order;
  });
