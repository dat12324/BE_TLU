import * as service from "../services/product-variant.service.js";

export const productVariantController = {
  async list(req, res) {
    res.json(
      await service.listProductVariants(req.query, req.user?.role === "admin"),
    );
  },
  async get(req, res) {
    res.json({
      data: await service.getProductVariant(
        req.params.id,
        req.user?.role === "admin",
      ),
    });
  },
  async create(req, res) {
    const color = req.files?.colorImage?.[0];
    const variant = await service.createProductVariant(
      req.body,
      req.user._id,
      color && { url: color.path, publicId: color.filename },
    );
    req.uploadCommitted = true;
    const data = variant.toObject();
    delete data.__v;
    delete data.images;
    res.status(201).json({ data });
  },
  async createBulk(req, res) {
    const input = req.body.variants.map((variant, index) => {
      const file = req.files?.[req.body.colorImageIndexes?.[index]];
      return file ? { ...variant, color: { ...variant.color, image: { url: file.path, publicId: file.filename } } } : variant;
    });
    const variants = await service.createProductVariants(input, req.user._id);
    req.uploadCommitted = true;
    const data = variants.map(variant => {
      const item = variant.toObject();
      delete item.__v;
      delete item.images;
      return item;
    });
    res.status(201).json({ data });
  },
  async update(req, res) {
    const color = req.files?.colorImage?.[0];
    const variant = await service.updateProductVariant(
      req.params.id,
      req.body,
      req.user._id,
      color && { url: color.path, publicId: color.filename },
    );
    req.uploadCommitted = true;
    const data = variant.toObject();
    delete data.__v;
    delete data.images;
    res.json({ data });
  },
  async stock(req, res) {
    res.json({
      data: await service.updateVariantStock(
        req.params.id,
        req.body,
        req.user._id,
      ),
    });
  },
  async remove(req, res) {
    res.json({
      data: await service.deleteProductVariant(req.params.id, req.user._id),
    });
  },
};
