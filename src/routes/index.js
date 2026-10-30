import { Router } from 'express';
import authRouter from './auth.routes.js';
import brandRouter from './brand.routes.js';
import categoryRouter from './category.routes.js';
import userRouter from './user.routes.js';
import productRouter from './product.routes.js';
import productVariantRouter from './product-variant.routes.js';

const router = Router();
router.use('/auth', authRouter);
router.use('/brands', brandRouter);
router.use('/categories', categoryRouter);
router.use('/products', productRouter);
router.use('/product-variants', productVariantRouter);
router.use('/users', userRouter);

export default router;
