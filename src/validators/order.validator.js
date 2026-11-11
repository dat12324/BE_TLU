
import { body, param, query } from "express-validator";
import { validateRequest } from "../middleware/validate-request.js";
import { PHONE_PATTERN } from "../utils/validation-patterns.js";

const statuses = ["pending", "confirmed", "shipping", "delivered", "cancelled"];

export const validateOrderId = [
  param("id")
    .isMongoId()
    .withMessage("Không tìm thấy đơn hàng hợp lệ."),
  validateRequest,
];

export const validateCreateOrder = [
  body("items")
    .isArray({ min: 1 })
    .withMessage("Giỏ hàng không có sản phẩm."),

  body("items.*.productVariant")
    .isMongoId()
    .withMessage("Sản phẩm không hợp lệ."),

  body("items.*.quantity")
    .isInt({ min: 1 })
    .withMessage("Số lượng sản phẩm không hợp lệ."),

  body("paymentMethod")
    .isIn(["COD", "VNPAY"])
    .withMessage("Vui lòng chọn phương thức thanh toán."),

  body("shippingAddress.fullName")
    .trim()
    .notEmpty()
    .withMessage("Vui lòng nhập họ tên người nhận."),

  body("shippingAddress.phone")
    .trim()
    .matches(PHONE_PATTERN)
    .withMessage("Số điện thoại không hợp lệ."),

  body("shippingAddress.province")
    .trim()
    .notEmpty()
    .withMessage("Vui lòng chọn tỉnh/thành phố."),

  body("shippingAddress.ward")
    .trim()
    .notEmpty()
    .withMessage("Vui lòng chọn phường/xã."),

  body("shippingAddress.detailAddress")
    .trim()
    .notEmpty()
    .withMessage("Vui lòng nhập địa chỉ cụ thể."),

  validateRequest,
];

export const validateOrderQuery = [
  query("status")
    .optional()
    .isIn(statuses)
    .withMessage("Trạng thái đơn hàng không hợp lệ."),

  query("paymentMethod")
    .optional()
    .isIn(["COD", "VNPAY"])
    .withMessage("Phương thức thanh toán không hợp lệ."),

  validateRequest,
];

export const validateOrderStatus = (cancel = false) => [
  ...(cancel ? [] : [
    body("status")
      .isIn(["confirmed", "shipping", "delivered", "cancelled"])
      .withMessage("Không thể cập nhật trạng thái đơn hàng."),
  ]),
  validateRequest,
];
