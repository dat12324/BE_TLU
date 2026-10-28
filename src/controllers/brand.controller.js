import * as brandService from "../services/brand.service.js";

export const brandController = {
  async list(req, res) {
    const admin = req.user?.role === "admin";
    const { page = 1, limit = 20 } = req.query;
    const status = admin ? req.query.status : "active";
    res.json(await brandService.listBrands(page, limit, status, admin));
  },
  async get(req, res) {
    res.json({ data: await brandService.getBrand(req.params.id) });
  },
  async create(req, res) {
    const { name, slug, description, logo, status } = req.body;
    const uploaded = req.file
      ? { url: req.file.path, publicId: req.file.filename }
      : logo;
    const data = await brandService.createBrand(
      name,
      slug,
      description,
      uploaded,
      status,
      req.user._id,
    );
    req.uploadCommitted = true;
    res.status(201).json({ data });
  },
  async update(req, res) {
    const { name, slug, description, logo, status } = req.body;
    const uploaded = req.file
      ? { url: req.file.path, publicId: req.file.filename }
      : logo;
    const data = await brandService.updateBrand(
      req.params.id,
      name,
      slug,
      description,
      uploaded,
      status,
      req.user._id,
    );
    req.uploadCommitted = true;
    res.json({ data });
  },
  async deactivate(req, res) {
    res.json({
      message: "Đã vô hiệu hóa thương hiệu.",
      data: await brandService.deactivateBrand(req.params.id, req.user._id),
    });
  },
};
