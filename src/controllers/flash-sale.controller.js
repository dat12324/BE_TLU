import * as service from "../services/flash-sale.service.js";

export const flashSaleController = {
  async get(req, res) {
    res.json({ data: await service.getFlashSale(req.user?.role === "admin") });
  },
  async save(req, res) {
    res.json({ data: await service.saveFlashSale(req.body) });
  },
};
