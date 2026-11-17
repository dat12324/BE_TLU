import mongoose from "mongoose";
import Review from "../models/Review.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import { HttpError } from "../utils/http-error.js";
import { normalizePagination } from "../utils/pagination.js";

const updateProductRating = async (product) => {
  const reviews = await Review.find({ product }).select("rating").lean();

  const reviewCount = reviews.length;
  const ratingAverage = reviewCount
    ? Math.round(
        (reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 10
      ) / 10
    : 0;

  await Product.updateOne(
    { _id: product },
    { $set: { reviewCount, ratingAverage } }
  );
};

export const listReviews = async (product, { page, limit } = {}) => {
  if (!(await Product.exists({ _id: product, status: "active" }))) {
    throw new HttpError(404, "Không tìm thấy sản phẩm.");
  }
  ({ page, limit } = normalizePagination(page, limit));
  const [data, total] = await Promise.all([
    Review.find({ product }).select("-__v")
      .populate("user", "fullName avatar")
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments({ product }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const createReview = async (user, { product, rating, content }) => {
  if (!(await Product.exists({ _id: product, status: "active" }))) {
    throw new HttpError(404, "Không tìm thấy sản phẩm.");
  }

  const order = await Order.findOne({
    user,
    status: "delivered",
    "items.product": product,
  }).select("_id");

  if (!order) {
    throw new HttpError(403, "Bạn chưa mua hoặc nhận sản phẩm này.");
  }

  if (await Review.exists({ user, product })) {
    throw new HttpError(409, "Bạn đã đánh giá sản phẩm này.");
  }

  const review = await Review.create({
    user,
    product,
    order: order._id,
    rating,
    content,
  });

  await updateProductRating(product);

  return review;
};

export const updateReview = async (id, user, { rating, content }) => {
  const review = await Review.findOne({ _id: id, user });

  if (!review) {
    throw new HttpError(404, "Không tìm thấy đánh giá.");
  }

  const ratingChanged = rating !== undefined && rating !== review.rating;

  if (rating !== undefined) review.rating = rating;
  if (content !== undefined) review.content = content;

  await review.save();

  if (ratingChanged) {
    await updateProductRating(review.product);
  }

  return review;
};

export const deleteReview = async (id, user) => {
  const review = await Review.findOneAndDelete({ _id: id, user });

  if (!review) {
    throw new HttpError(404, "Không tìm thấy đánh giá.");
  }

  await updateProductRating(review.product);

  return { message: "Đã xóa đánh giá." };
};
