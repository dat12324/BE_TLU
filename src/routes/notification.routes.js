import { Router } from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import { notificationController as controller } from "../controllers/notification.controller.js";
import { validateNotificationId } from "../validators/notification.validator.js";

const router = Router();
router.use(verifyToken);
router.get("/", controller.list);
router.get("/unread-count", controller.unreadCount);
router.patch("/read-all", controller.readAll);
router.patch("/:id/read", validateNotificationId, controller.read);
export default router;
