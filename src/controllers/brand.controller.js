import * as brandService from '../services/brand.service.js';

export const brandController = {
  async listPublic(req, res) {
    res.json(await brandService.listBrands(req.query));
  },
  async listAdmin(req, res) {
    res.json(await brandService.listBrands(req.query, { admin: true }));
  },
  async get(req, res) {
    res.json({ data: await brandService.getBrand(req.params.id) });
  },
  async create(req, res) {
    res.status(201).json({ data: await brandService.createBrand(req.body, { adminId: req.user._id }) });
  },
  async update(req, res) {
    res.json({ data: await brandService.updateBrand(req.params.id, req.body, { adminId: req.user._id }) });
  },
  async deactivate(req, res) {
    res.json({ message: 'Brand deactivated.',
      data: await brandService.deactivateBrand(req.params.id, { adminId: req.user._id }) });
  },
};
