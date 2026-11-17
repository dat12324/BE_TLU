import * as service from "../services/voucher.service.js";

export const voucherController = {
  async list(req, res) {
    res.json(await service.listVouchers(req.query, req.user?.role === "admin"));
  },
  async get(req, res) {
    res.json({ data: await service.getVoucher(req.params.id) });
  },
  async create(req, res) {
    res.status(201).json({ data: await service.saveVoucher(req.body) });
  },
  async update(req, res) {
    res.json({ data: await service.saveVoucher(req.body, req.params.id) });
  },
  async check(req, res) {
    res.json({ data: await service.checkVoucher(req.user._id, req.body.code, req.body.variantIds) });
  },
};
