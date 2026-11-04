import * as service from "../services/cart.service.js";

export const cartController = {
  async get(req, res) {
    res.json({ data: await service.getCart(req.user._id) });
  },
  async add(req, res) {
    const { productVariant, quantity } = req.body;
    res.json({ data: await service.addCartItem(req.user._id, productVariant, quantity) });
  },
  async update(req, res) {
    res.json({ data: await service.updateCartItem(req.user._id, req.params.variantId, req.body.quantity) });
  },
  async remove(req, res) {
    res.json({ data: await service.removeCartItem(req.user._id, req.params.variantId) });
  },
  async clear(req, res) {
    res.json({ data: await service.clearCart(req.user._id) });
  },
};
