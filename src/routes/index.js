import { Router } from 'express';
import authRouter from './auth.routes.js';
import brandRouter from './brand.routes.js';
import categoryRouter from './category.routes.js';
import userRouter from './user.routes.js';
import productRouter from './product.routes.js';
import productVariantRouter from './product-variant.routes.js';
import bannerRouter from './banner.routes.js';
import flashSaleRouter from './flash-sale.routes.js';
import cartRouter from './cart.routes.js';
import orderRouter from './order.routes.js';
import notificationRouter from './notification.routes.js';
import dashboardRouter from './dashboard.routes.js';

const router = Router();
router.use('/auth', authRouter);
router.use('/brands', brandRouter);
router.use('/categories', categoryRouter);
router.use('/products', productRouter);
router.use('/product-variants', productVariantRouter);
router.use('/users', userRouter);
router.use('/banners', bannerRouter);
router.use('/flash-sales', flashSaleRouter);
router.use('/cart', cartRouter);
router.use('/orders', orderRouter);
router.use('/notifications', notificationRouter);
router.use('/dashboard', dashboardRouter);

export default router;
