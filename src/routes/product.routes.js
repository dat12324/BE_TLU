import { Router } from "express";
import {
verifyRole,
verifyTokenIfPresent,
} from "../middleware/auth.middleware.js";
import { productController } from "../controllers/product.controller.js";
import { uploadCloud } from "../config/cloudinary.js";
import {
validatorCreateProduct,
validatorUpdateProduct,
validatorUpdateProductStatus,
validateProductQuery,
} from "../validators/product.validator.js";

const router = Router();
router.get("/", verifyTokenIfPresent, validateProductQuery, productController.list);
router.get(
  "/getByID/:id",
  verifyRole(["admin"]),
  productController.getAdminProductDetail,
);
router.post(
  "/",
  verifyRole(["admin"]),
  uploadCloud.array("images", 10),
  validatorCreateProduct,
  productController.create,
);
router.patch(
  "/:id",
  verifyRole(["admin"]),
  uploadCloud.array("images", 10),
  validatorUpdateProduct,
  productController.update, 
);
router.patch(
  "/:id/status",
  verifyRole(["admin"]),
  validatorUpdateProductStatus,
  productController.update,
);
router.get("/:slug", productController.getProductDetail);

export default router;
