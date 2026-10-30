import { Router } from "express";
import { verifyRole, verifyTokenIfPresent } from "../middleware/auth.middleware.js";
import { categoryController } from "../controllers/category.controller.js";
import { validateCreateCategory, validateUpdateCategory } from "../validators/category.validator.js";
import { validateCatalogQuery } from "../validators/catalog.validator.js";
import { uploadCloud } from "../config/cloudinary.js";

const router = Router();
router.get("/", verifyTokenIfPresent, validateCatalogQuery, categoryController.list);
router.get("/:id", verifyRole(["admin"]), categoryController.get);
router.post("/", verifyRole(["admin"]),
  uploadCloud.single("image"),
  validateCreateCategory, categoryController.create);
router.patch("/:id", verifyRole(["admin"]), uploadCloud.single("image"), validateUpdateCategory, categoryController.update);

export default router;
