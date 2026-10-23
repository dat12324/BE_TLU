import { Router } from "express";
import { categoryController } from "../controllers/category.controller.js";

export function createCategoryRouter() {
  const router = Router();
  router.get("/", categoryController.listPublic);
  return router;
}

// Gắn dưới /api/admin sau middleware xác thực và verifyRole(['admin']).
export function createAdminCategoryRouter() {
  const router = Router();
  router.get("/", categoryController.listAdmin);
  router.get("/:id", categoryController.get);
  router.post("/", categoryController.create);
  router.patch("/:id", categoryController.update);
  router.delete("/:id", categoryController.deactivate);
  return router;
}
