import { Router } from "express";
import { verifyToken, verifyRole } from "../middleware/auth.middleware.js";
import { orderController as controller } from "../controllers/order.controller.js";
import { validateCreateOrder, validateOrderId, validateOrderQuery, validateOrderStatus } from "../validators/order.validator.js";

const router = Router();
router.use(verifyToken);
router.get("/", validateOrderQuery, controller.list);
router.post("/", validateCreateOrder, controller.create);
router.get("/:id", validateOrderId, controller.get);
router.patch("/:id/cancel", validateOrderId, validateOrderStatus(true), controller.cancel);
router.patch("/:id/status", verifyRole(["admin"]), validateOrderId, validateOrderStatus(), controller.status);
export default router;
