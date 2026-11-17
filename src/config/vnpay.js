import { VNPay } from "vnpay";
import { HttpError } from "../utils/http-error.js";

export const getVnpayConfig = () => {
  const config = {
    tmnCode: process.env.VNPAY_TMN_CODE?.trim(),
    secret: process.env.VNPAY_HASH_SECRET?.trim(),
    url: process.env.VNPAY_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    returnUrl: process.env.VNPAY_RETURN_URL,
    clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  };
  if (!config.tmnCode || !config.secret || !config.returnUrl) {
    throw new HttpError(503, "Chưa cấu hình thanh toán VNPay.");
  }
  for (const value of [config.url, config.returnUrl, config.clientOrigin]) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new HttpError(503, "URL cấu hình VNPay không hợp lệ.");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new HttpError(503, "URL cấu hình VNPay không hợp lệ.");
    }
  }
  const url = new URL(config.url);
  return {
    ...config,
    vnpay: new VNPay({
      tmnCode: config.tmnCode,
      secureSecret: config.secret,
      vnpayHost: url.origin,
      endpoints: { paymentEndpoint: url.pathname + url.search },
      hashAlgorithm: "SHA512",
      enableLog: false,
    }),
  };
};
