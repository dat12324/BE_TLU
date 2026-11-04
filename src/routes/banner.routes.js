import { Router } from "express";
import { verifyRole, verifyTokenIfPresent } from "../middleware/auth.middleware.js";
import { uploadCloud } from "../config/cloudinary.js";
import { bannerController } from "../controllers/banner.controller.js";
import { validateCreateBanner, validateUpdateBanner, validateBannerQuery } from "../validators/banner.validator.js";

const router = Router();
router.get("/", verifyTokenIfPresent, validateBannerQuery, bannerController.list);
router.get("/:id", verifyRole(["admin"]), bannerController.get);
router.post("/", verifyRole(["admin"]), uploadCloud.single("image"), validateCreateBanner, bannerController.create);
router.patch("/:id", verifyRole(["admin"]), uploadCloud.single("image"), validateUpdateBanner, bannerController.update);

export default router;
