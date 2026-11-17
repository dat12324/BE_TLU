import * as service from "../services/payment.service.js";

export const paymentController = {
  async ipn(req, res) {
    try { res.json(await service.handleVnpayIpn(req.query)); }
    catch { res.json({ RspCode: "99", Message: "Lỗi xử lý thanh toán." }); }
  },
  async vnpayReturn(req, res) {
    res.redirect(await service.handleVnpayReturn(req.query));
  },
};
