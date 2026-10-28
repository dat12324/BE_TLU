import { Router } from "express";
import {
  verifyTokenIfPresent,
  verifyRole,
} from "../middleware/auth.middleware.js";
import { brandController } from "../controllers/brand.controller.js";
import {
  validateCreateBrand,
  validateUpdateBrand,
} from "../validators/brand.validator.js";
import { validateCatalogQuery } from "../validators/catalog.validator.js";
import { uploadCloud } from "../config/cloudinary.js";

const router = Router();
router.get(
  "/",
  verifyTokenIfPresent,
  validateCatalogQuery,
  brandController.list,
);
router.get("/:id", verifyRole(["admin"]), brandController.get);
router.post(
  "/",
  verifyRole(["admin"]),
  uploadCloud.single("image"),
  validateCreateBrand,
  brandController.create,
);
router.patch(
  "/:id",
  verifyRole(["admin"]),
  uploadCloud.single("image"),
  validateUpdateBrand,
  brandController.update,
);
router.delete("/:id", verifyRole(["admin"]), brandController.deactivate);

export default router;
