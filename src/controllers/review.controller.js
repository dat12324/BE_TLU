import * as service from "../services/review.service.js";

export const reviewController = {
  async list(req, res) {
    res.json(await service.listReviews(req.params.productId, req.query));
  },
  async create(req, res) {
    res.status(201).json({ data: await service.createReview(req.user._id, req.body) });
  },
  async update(req, res) {
    res.json({ data: await service.updateReview(req.params.id, req.user._id, req.body) });
  },
  async remove(req, res) {
    res.json(await service.deleteReview(req.params.id, req.user._id));
  },
};
