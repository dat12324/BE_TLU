import { Router } from 'express';
import authRouter from './auth.routes.js';
import brandRouter from './brand.routes.js';
import categoryRouter from './category.routes.js';
import { uploadCloud, deleteImage } from '../config/cloudinary.js';
import { verifyRole } from '../middleware/auth.middleware.js';
import { validateImageType, validateUploadFields, validateDeleteImage } from '../validators/image.validator.js';
import { HttpError } from '../utils/http-error.js';
import userRouter from './user.routes.js';
import productRouter from './product.routes.js';

const router = Router();
router.use('/auth', authRouter);
router.use('/brands', brandRouter);
router.use('/categories', categoryRouter);
router.use('/products', productRouter);
router.use('/users', userRouter);
// Giữ các URL cũ; không còn module upload Controller/Service/Router riêng.
router.post('/images/upload/:imageType', verifyRole(['admin']), validateImageType,
  uploadCloud.single('image'), validateUploadFields, (req, res) => {
    if (!req.file) throw new HttpError(400, 'Vui lòng chọn tệp ảnh.');
    req.uploadCommitted = true;
    res.status(201).json({ data: { url: req.file.path, publicId: req.file.filename } });
  });
router.post('/images/upload-multiple/:imageType', verifyRole(['admin']), validateImageType,
  uploadCloud.array('images', 10), validateUploadFields, (req, res) => {
    if (!req.files?.length) throw new HttpError(400, 'Vui lòng chọn tệp ảnh.');
    req.uploadCommitted = true;
    res.status(201).json({ data: req.files.map(file => ({ url: file.path, publicId: file.filename })) });
  });
router.delete('/images', verifyRole(['admin']), validateDeleteImage, async (req, res) => {
  res.json({ data: await deleteImage(req.body.publicId) });
});

export default router;
