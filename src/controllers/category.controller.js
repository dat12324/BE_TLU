import * as categoryService from "../services/category.service.js";

export const categoryController = {
  async list(req, res) {
    const admin = req.user?.role === "admin";
    const { page = 1, limit = 20 } = req.query;
    const status = admin ? req.query.status : "active";
    res.json(await categoryService.listCategories(page, limit, status, admin));
  },
  async get(req, res) {
    res.json({ data: await categoryService.getCategory(req.params.id) });
  },
  async create(req, res) {
    const { name, slug, description, image, status } = req.body;
    const uploaded = req.file
      ? { url: req.file.path, publicId: req.file.filename }
      : image;
    const data = await categoryService.createCategory(
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
    const { name, slug, description, image, status } = req.body;
    const uploaded = req.file
      ? { url: req.file.path, publicId: req.file.filename }
      : image;
    const data = await categoryService.updateCategory(
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
      message: "Đã vô hiệu hóa danh mục.",
      data: await categoryService.deactivateCategory(
        req.params.id,
        req.user._id,
      ),
    });
  },
};
