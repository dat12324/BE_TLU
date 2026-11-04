import * as bannerService from "../services/banner.service.js";

export const bannerController = {
  async list(req, res) {
    res.json(await bannerService.listBanners(req.query, req.user?.role === "admin"));
  },
  async get(req, res) {
    res.json({ data: await bannerService.getBanner(req.params.id) });
  },
  async create(req, res) {
    const data = { ...req.body };
    if (req.file) data.image = { url: req.file.path, publicId: req.file.filename };
    const banner = await bannerService.createBanner(data, req.user._id);
    req.uploadCommitted = true;
    res.status(201).json({ data: banner });
  },
  async update(req, res) {
    const data = { ...req.body };
    if (req.file) data.image = { url: req.file.path, publicId: req.file.filename };
    const banner = await bannerService.updateBanner(req.params.id, data, req.user._id);
    req.uploadCommitted = true;
    res.json({ data: banner });
  },
};
