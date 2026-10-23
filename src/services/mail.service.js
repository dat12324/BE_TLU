import nodemailer from "nodemailer";
import { HttpError } from "../utils/http-error.js";

export function createMailService(config) {
  let transporter;
  function requireConfig() {
    const smtp = config.smtp ?? {};
    if (
      !smtp.host ||
      !smtp.user ||
      !smtp.pass ||
      !smtp.from ||
      !Number.isInteger(smtp.port) ||
      smtp.port < 1 ||
      smtp.port > 65535 ||
      !["true", "false"].includes(smtp.secure)
    ) {
      throw new HttpError(503, "Chưa cấu hình email khôi phục mật khẩu.");
    }
    return smtp;
  }
  async function send(email, subject, text) {
    const smtp = requireConfig();
    transporter ??= nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure === "true",
      requireTLS: smtp.secure !== "true",
      auth: { user: smtp.user, pass: smtp.pass },
      logger: false,
      debug: false,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    const result = await transporter.sendMail({
      from: smtp.from,
      to: email,
      subject,
      text,
    });
    if (!result.accepted?.length)
      throw new Error("Máy chủ gửi thư không chấp nhận email.");
  }
  return {
    requireConfig,
    async sendPasswordResetOtp(email, otp) {
      await send(
        email,
        "TLUPhone - Mã đặt lại mật khẩu",
        `Mã đặt lại mật khẩu TLUPhone của bạn là ${otp}. Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này.`,
      );
    },
    async sendVerification(email, link) {
      await send(
        email,
        "TLUPhone - Xác thực email",
        `Vui lòng xác thực email TLUPhone bằng liên kết sau trong vòng 15 phút: ${link}`,
      );
    },
  };
}
