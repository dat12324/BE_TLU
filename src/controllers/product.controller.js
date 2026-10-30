import mongoose from "mongoose";
import * as productService from "../services/product.service.js";
import { HttpError } from "../utils/http-error.js";

const saveResponse = async (res, operation, status = 200) => {
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
};

export const productController = {
  async list(req, res) {
    const admin = req.user?.role === "admin";
    const { page, limit, search, brand, category } = req.query;
    const status = admin ? req.query.status : "active";
    res.json(
      await productService.listProducts(
        page,
        limit,
        search,
        brand,
        category,
        status,
        admin,
      ),
    );
  },
  async getProductDetail(req, res) {
    res.json({ data: await productService.getProductDetail(req.params.slug) });
  },
  async getAdminProductDetail(req, res) {
    res.json({
      data: await productService.getProductDetail(req.params.id, true),
    });
  },
  async create(req, res) {
    const {
      name,
      slug,
      brand,
      category,
      shortDescription,
      description,
      highlights,
      images,
      technicalSpecs,
      specifications,
      tags,
      flags,
      status,
    } = req.body;
    const uploaded =
      req.files?.map((file, index) => ({ url: file.path, publicId: file.filename, isPrimary: index === req.body.primaryImageIndex })) ??
      [];
    await saveResponse(
      res,
      productService
        .createProduct(
          name,
          slug,
          brand,
          category,
          shortDescription,
          description,
          highlights,
          uploaded.length ? uploaded : images,
          technicalSpecs,
          specifications,
          tags,
          flags,
          status,
          req.user._id,
        )
        .then((product) => {
          req.uploadCommitted = true;
          return product;
        }),
      201,
    );
  },
  async update(req, res) {
    const {
      name,
      slug,
      brand,
      category,
      shortDescription,
      description,
      highlights,
      images,
      technicalSpecs,
      specifications,
      tags,
      flags,
      status,
    } = req.body;
    const uploaded =
      req.files?.map((file, index) => ({ url: file.path, publicId: file.filename, isPrimary: index === req.body.primaryImageIndex })) ??
      [];
    await saveResponse(
      res,
      productService
        .updateProduct(
          req.params.id,
          name,
          slug,
          brand,
          category,
          shortDescription,
          description,
          highlights,
          images,
          technicalSpecs,
          specifications,
          tags,
          flags,
          status,
          req.user._id,
          undefined,
          uploaded,
        )
        .then((product) => {
          req.uploadCommitted = true;
          return product;
        }),
    );
  },
};
