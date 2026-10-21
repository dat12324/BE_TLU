import { imageService } from '../services/image.service.js';

export function createImageController(service = imageService) {
  return {
    async uploadSingle(req, res) {
      const data = await service.uploadImage(req.file.buffer, req.params.imageType);
      res.status(201).json({ data });
    },
    async uploadMultiple(req, res) {
      const data = await service.uploadImages(req.files, req.params.imageType);
      res.status(201).json({ data });
    },
    async remove(req, res) {
      const data = await service.deleteImage(req.body.publicId);
      res.json({ data });
    },
  };
}
