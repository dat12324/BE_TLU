import { Router } from "express";
import { verifyRole, verifyToken, verifyTokenIfPresent } from "../middleware/auth.middleware.js";
import { voucherController as controller } from "../controllers/voucher.controller.js";
import { validateCreateVoucher, validateUpdateVoucher, validateCheckVoucher } from "../validators/voucher.validator.js";

const router = Router();
router.get("/", verifyTokenIfPresent, controller.list);
router.post("/check", verifyToken, validateCheckVoucher, controller.check);
router.get("/:id", verifyRole(["admin"]), controller.get);
router.post("/", verifyRole(["admin"]), validateCreateVoucher, controller.create);
router.patch("/:id", verifyRole(["admin"]), validateUpdateVoucher, controller.update);
export default router;
