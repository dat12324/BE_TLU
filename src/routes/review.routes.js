import { Router } from "express";
import { verifyRole } from "../middleware/auth.middleware.js";
import { reviewController as controller } from "../controllers/review.controller.js";
import { validateCreateReview, validateUpdateReview,  } from "../validators/review.validator.js";

const router = Router();
router.post("/", verifyRole(["user"]), validateCreateReview, controller.create);
router.patch("/:id", verifyRole(["user"]), validateUpdateReview, controller.update);
router.delete("/:id", verifyRole(["user"]), controller.remove);
export default router;
