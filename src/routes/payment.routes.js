import { Router } from "express";
import { paymentController as controller } from "../controllers/payment.controller.js";

const router = Router();
router.get("/vnpay/ipn", controller.ipn);
router.get("/vnpay/return", controller.vnpayReturn);
export default router;
