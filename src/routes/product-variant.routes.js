import { Router } from "express";
import { uploadCloud } from "../config/cloudinary.js";
import { verifyRole, verifyTokenIfPresent } from "../middleware/auth.middleware.js";
import { productVariantController as controller } from "../controllers/product-variant.controller.js";
import { validateCreateVariant, validateBulkVariants, validateUpdateVariant, validateVariantStatus, validateVariantStock, validateVariantQuery } from "../validators/product-variant.validator.js";

const router = Router();
router.get("/", verifyTokenIfPresent, validateVariantQuery, controller.list);
router.get("/:id", verifyTokenIfPresent, controller.get);
router.post("/bulk", verifyRole(["admin"]), uploadCloud.array("colorImages", 10), validateBulkVariants, controller.createBulk);
router.post("/", verifyRole(["admin"]), uploadCloud.fields([
  { name: "colorImage", maxCount: 1 },
]), validateCreateVariant, controller.create);
router.patch("/:id/stock", verifyRole(["admin"]), validateVariantStock, controller.stock);
router.patch("/:id/status", verifyRole(["admin"]), validateVariantStatus, controller.update);
router.patch("/:id", verifyRole(["admin"]), uploadCloud.fields([
  { name: "colorImage", maxCount: 1 },
]), validateUpdateVariant, controller.update);
router.delete("/:id", verifyRole(["admin"]), controller.remove);
export default router;
