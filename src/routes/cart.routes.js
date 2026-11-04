import { Router } from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import { cartController as controller } from "../controllers/cart.controller.js";
import { validateCartItem, validateCartVariant } from "../validators/cart.validator.js";

const router = Router();
router.use(verifyToken);
router.get("/", controller.get);
router.post("/items", validateCartItem(true), controller.add);
router.patch("/items/:variantId", validateCartVariant, validateCartItem(), controller.update);
router.delete("/items/:variantId", validateCartVariant, controller.remove);
router.delete("/", controller.clear);
export default router;
