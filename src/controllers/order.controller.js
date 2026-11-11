import * as service from "../services/order.service.js";

export const orderController = {
  async create(req, res) {
    res.status(201).json({ data: await service.createOrder(req.user._id, req.body) });
  },
  async list(req, res) {
    res.json(await service.listOrders(req.user._id, req.user.role === "admin", req.query));
  },
  async get(req, res) {
    res.json({ data: await service.getOrder(req.params.id, req.user._id, req.user.role === "admin") });
  },
  async cancel(req, res) {
    res.json({ data: await service.updateOrderStatus(req.params.id, req.user._id, false, "cancelled", req.body.cancelReason) });
  },
  async status(req, res) {
    const { status, cancelReason } = req.body;
    res.json({ data: await service.updateOrderStatus(req.params.id, req.user._id, true, status, cancelReason) });
  },
};
