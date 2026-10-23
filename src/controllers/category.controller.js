import * as categoryService from "../services/category.service.js";

export const categoryController = {
  async listPublic(req, res) {
    res.json(await categoryService.listCategories(req.query));
  },
  async listAdmin(req, res) {
    res.json(await categoryService.listCategories(req.query, { admin: true }));
  },
  async get(req, res) {
    res.json({ data: await categoryService.getCategory(req.params.id) });
  },
  async create(req, res) {
    res
      .status(201)
      .json({
        data: await categoryService.createCategory(req.body, {
          adminId: req.user._id,
        }),
      });
  },
  async update(req, res) {
    res.json({
      data: await categoryService.updateCategory(req.params.id, req.body, {
        adminId: req.user._id,
      }),
    });
  },
  async deactivate(req, res) {
    res.json({
      message: "Đã vô hiệu hóa danh mục.",
      data: await categoryService.deactivateCategory(req.params.id, {
        adminId: req.user._id,
      }),
    });
  },
};
