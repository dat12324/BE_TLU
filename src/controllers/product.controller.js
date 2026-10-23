import mongoose from "mongoose";
import * as productService from "../services/product.service.js";
import { HttpError } from "../utils/http-error.js";

async function saveResponse(res, operation, status = 200) {
  try {
    const product = await operation;
    const data = product.toObject();
    delete data.__v;
    res.status(status).json({ data });
  } catch (error) {
    if (
      error instanceof mongoose.Error.ValidationError ||
      error instanceof mongoose.Error.CastError
    ) {
      throw new HttpError(400, "Dữ liệu sản phẩm không hợp lệ.");
    }
    if (error instanceof mongoose.Error.VersionError) {
      throw new HttpError(
        409,
        "Sản phẩm đã được thay đổi. Vui lòng tải lại và thử lại.",
      );
    }
    if (error instanceof mongoose.Error.DocumentNotFoundError)
      throw new HttpError(404, "Không tìm thấy sản phẩm.");
    throw error;
  }
}

export const productController = {
  async listPublic(req, res) {
    res.json(await productService.listProducts(req.validatedQuery));
  },
  async listAdmin(req, res) {
    res.json(
      await productService.listProducts(req.validatedQuery, { admin: true }),
    );
  },
  async getAdmin(req, res) {
    res.json({ data: await productService.getProduct(req.params.id) });
  },
  async getPublic(req, res) {
    res.json({
      data: await productService.getPublicProduct(req.validatedSlug),
    });
  },
  async create(req, res) {
    await saveResponse(
      res,
      productService.createProduct(req.validatedBody, {
        adminId: req.user._id,
      }),
      201,
    );
  },
  async update(req, res) {
    await saveResponse(
      res,
      productService.updateProduct(req.params.id, req.validatedBody, {
        adminId: req.user._id,
      }),
    );
  },
};
