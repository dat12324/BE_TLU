import { Router } from "express";
import { verifyRole } from "../middleware/auth.middleware.js";
import { dashboardController } from "../controllers/dashboard.controller.js";

const router = Router();
router.get("/", verifyRole(["admin"]), dashboardController);
export default router;
