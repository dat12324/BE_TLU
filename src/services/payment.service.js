import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import { HttpError } from "../utils/http-error.js";
import { getVnpayConfig } from "../config/vnpay.js";

const verified = (query, config, method) => {
  if (
    !query ||
    Object.values(query).some((value) => typeof value !== "string") ||
    query.vnp_TmnCode !== config.tmnCode ||
    !/^[a-f0-9]{128}$/i.test(query.vnp_SecureHash ?? "")
  )
    return false;
  try {
    return config.vnpay[method]({
      ...query, vnp_SecureHash: query.vnp_SecureHash.toLowerCase(),
    }).isVerified;
  } catch {
    return false;
  }
};
 
const vnpayDate = (date) =>
  new Date(date.getTime() + 7 * 3600000)
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);

export const createPaymentUrl = async (order, ipAddress = "127.0.0.1") => {
  const config = getVnpayConfig();
  if (
    order.paymentMethod !== "VNPAY" ||
    order.status === "cancelled" ||
    order.paymentStatus !== "pending" ||
    !Number.isSafeInteger(order.totalAmount) ||
    order.totalAmount <= 0 ||
    !Number.isSafeInteger(order.totalAmount * 100)
  ) {
    throw new HttpError(400, "Đơn hàng không hợp lệ để thanh toán VNPay.");
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60000);
  const transactionRef = randomUUID().replaceAll("-", "");
  const ip = ipAddress.replace(/^::ffff:/, "");
  const paymentUrl = config.vnpay.buildPaymentUrl({
    // Thư viện tự nhân 100; amount lưu trong Payment vẫn là VND.
    vnp_Amount: order.totalAmount,
    vnp_TxnRef: transactionRef,
    vnp_OrderInfo: `Thanh toan ${order.orderCode}`,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: ip === "::1" || !isIP(ip) ? "127.0.0.1" : ip,
    vnp_CreateDate: vnpayDate(now),
    vnp_ExpireDate: vnpayDate(expiresAt),
  });
  await Payment.create({
    order: order._id,
    transactionRef,
    amount: order.totalAmount,
    expiresAt,
  });
  return paymentUrl;
};

export const handleVnpayIpn = async (query) => {
  const config = getVnpayConfig();
  if (!verified(query, config, "verifyIpnCall"))
    return { RspCode: "97", Message: "Lỗi bảo mật hoặc hệ thống." };
  let payment = await Payment.findOne({
    transactionRef: query.vnp_TxnRef,
    provider: "VNPAY",
  }).lean();
  if (!payment) return { RspCode: "01", Message: "Không tìm thấy đơn hàng." };
  if (
    !/^\d+$/.test(query.vnp_Amount ?? "") ||
    !Number.isSafeInteger(Number(query.vnp_Amount)) ||
    Number(query.vnp_Amount) !== payment.amount * 100
  )
    return { RspCode: "04", Message: "Số tiền không hợp lệ." };
  const order = await Order.findById(payment.order).lean();
  if (!order || order.paymentMethod !== "VNPAY")
    return { RspCode: "01", Message: "Không tìm thấy đơn hàng." };
  if (order.totalAmount !== payment.amount)
    return { RspCode: "04", Message: "Số tiền không hợp lệ." };
  const success =
    query.vnp_ResponseCode === "00" && query.vnp_TransactionStatus === "00";
  // Chưa hoàn tất/đang xử lý/nghi ngờ: không biến thành thất bại và không giải phóng hàng.
  if (!success && !["02"].includes(query.vnp_TransactionStatus))
    return { RspCode: "99", Message: "Lỗi bảo mật hoặc hệ thống." };
  if (
    !/^\d{2}$/.test(query.vnp_ResponseCode ?? "") ||
    (success && !/^[1-9]\d*$/.test(query.vnp_TransactionNo ?? ""))
  ) {
    return { RspCode: "99", Message: "Lỗi bảo mật hoặc hệ thống." };
  }
  const status = success ? "success" : "failed";
  const changes = {
    status,
    responseCode: query.vnp_ResponseCode,
    transactionStatus: query.vnp_TransactionStatus,
    signatureVerified: true,
    verifiedAt: new Date(),
    ...(query.vnp_BankCode ? { bankCode: query.vnp_BankCode } : {}),
    ...(query.vnp_TransactionNo && query.vnp_TransactionNo !== "0"
      ? { providerTransactionId: query.vnp_TransactionNo }
      : {}),
    ...(success ? { paidAt: new Date() } : {}),
  };
  const pending = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "pending" },
    { $set: changes },
    { returnDocument: "after", runValidators: true },
  ).lean();
  payment = pending || (await Payment.findById(payment._id).lean());
  if (
    !payment ||
    payment.status !== status ||
    (success && payment.providerTransactionId !== query.vnp_TransactionNo)
  )
    return { RspCode: "02", Message: "Đơn hàng đã được xác nhận." };
  // Callback lặp tiếp tục bước còn thiếu nếu tiến trình đã dừng giữa hai lần ghi.
  const paymentStatus = success ? "paid" : "failed";
  const result = await Order.updateOne(
    {
      _id: payment.order,
      paymentMethod: "VNPAY",
      status: { $ne: "cancelled" },
      totalAmount: payment.amount,
      paymentStatus: { $in: ["pending", "unpaid"] },
    },
    { $set: { paymentStatus } },
    { runValidators: true },
  );
  if (!result.matchedCount) {
    const current = await Order.findById(payment.order).lean();
    if (
      !current ||
      current.status === "cancelled" ||
      current.paymentStatus !== paymentStatus
    )
      return { RspCode: "99", Message: "Chưa hoàn tất cập nhật đơn hàng." };
  }
  return {
    RspCode: pending || result.matchedCount ? "00" : "02",
    Message:
      pending || result.matchedCount
        ? "Xác nhận thành công."
        : "Đơn hàng đã được xác nhận.",
  };
};

export const handleVnpayReturn = async (query) => {
  const config = getVnpayConfig();
  const redirect = new URL("/orders", config.clientOrigin);
  redirect.searchParams.set("paymentStatus", "invalid");
  if (!verified(query, config, "verifyReturnUrl")) return redirect.toString();
  const payment = await Payment.findOne({
    transactionRef: query.vnp_TxnRef,
    provider: "VNPAY",
  }).lean();
  if (
    !payment ||
    !/^\d+$/.test(query.vnp_Amount ?? "") ||
    Number(query.vnp_Amount) !== payment.amount * 100
  )
    return redirect.toString();
  const order = await Order.findById(payment.order).lean();
  if (
    !order ||
    order.paymentMethod !== "VNPAY" ||
    order.totalAmount !== payment.amount
  )
    return redirect.toString();
  redirect.searchParams.set("orderId", String(order._id));
  redirect.searchParams.set("paymentStatus", order.paymentStatus);
  // Return không ghi paid: luôn lấy kết quả đã được IPN xác minh trong database.
  return redirect.toString();
};
