import { Router } from "express";
import { verifyRole, verifyTokenIfPresent } from "../middleware/auth.middleware.js";
import { flashSaleController as controller } from "../controllers/flash-sale.controller.js";
import { validateSaveFlashSale } from "../validators/flash-sale.validator.js";

const router = Router();
router.get("/", verifyTokenIfPresent, controller.get);
router.patch("/", verifyRole(["admin"]), validateSaveFlashSale, controller.save);
export default router;
