import { Router } from "express";
import { verifyToken, verifyRole } from "../middleware/auth.middleware.js";
import { uploadCloud } from "../config/cloudinary.js";
import { validateUploadFields } from "../validators/image.validator.js";
import {
  updateMyAvatar,
  userController,
} from "../controllers/user.controller.js";
import {
  validateUserBody,
  validateUserList,
} from "../validators/user.validator.js";

const router = Router();
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.get("/getProfile", verifyToken, userController.getMe);
router.patch(
  "/updateProfile",
  verifyToken,
  validateUserBody(["fullName", "phoneNumber", "dateOfBirth", "gender"]),
  userController.updateMe,
);
router.get("/getAddresses", verifyToken, userController.listMyAddresses);
const addressBody = validateUserBody([
  "recipientName",
  "phoneNumber",
  "streetAddress",
  "ward",
  "district",
  "city",
  "isDefault",
]);
router.post(
  "/addAddresses",
  verifyToken,
  addressBody,
  userController.addMyAddress,
);
router.patch(
  "/updateAddresses/:addressId",
  verifyToken,
  addressBody,
  userController.updateMyAddress,
);
router.delete(
  "/deleteAddresses/:addressId",
  verifyToken,
  userController.removeMyAddress,
);
router.patch(
  "/avatar",
  verifyToken,
  uploadCloud.single("image"),
  validateUploadFields,
  updateMyAvatar,
);
router.get(
  "/",
  verifyRole(["admin"]),
  validateUserList,
  userController.listAdmin,
);
router.get("/:id", verifyRole(["admin"]), userController.getAdmin);
router.patch(
  "/:id/status",
  verifyRole(["admin"]),
  validateUserBody(["isActive"]),
  userController.updateStatus,
);

export default router;
