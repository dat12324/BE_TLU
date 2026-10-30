import { HttpError } from "../utils/http-error.js";
import mongoose from "mongoose";
import multer from "multer";
import { deleteImage, MANAGED_IMAGE_ID_PATTERN } from "../config/cloudinary.js";

export const notFound = (_req, res) => {
  res.status(404).json({ message: "Không tìm thấy đường dẫn API." });
};

export const errorHandler = async (err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Multer tự dọn khi parse/upload thất bại. Các lỗi validation/DB dọn tại đây.
  if (
    !req.uploadCommitted &&
    !err.uploadCommitted &&
    !Object.hasOwn(err, "storageErrors")
  ) {
    const files = [
      ...(req.file ? [req.file] : []),
      ...Object.values(req.files ?? {}).flat(),
    ].filter((file) => MANAGED_IMAGE_ID_PATTERN.test(file?.filename ?? ""));
    const cleanup = await Promise.allSettled(
      files.map((file) => deleteImage(file.filename)),
    );
    const remaining = files.filter(
      (_file, index) => cleanup[index].status === "rejected",
    );
    if (remaining.length) {
      if (req.uploadImageType === "avatar")
        err = new HttpError(
          502,
          "Cập nhật ảnh đại diện thất bại. Cần thử dọn dẹp ảnh đã tải lên một lần nữa.",
        );
      Object.defineProperty(err, "cleanupPublicIds", {
        value: remaining.map((file) => file.filename),
        configurable: true,
      });
      console.error("Chưa dọn dẹp hết ảnh sau khi thao tác thất bại.");
    }
  }
  if (err.storageErrors?.length)
    return res
      .status(502)
      .json({
        message:
          "Tải ảnh thất bại. Cần thử dọn dẹp ảnh đã tải lên một lần nữa.",
      });
  if (err instanceof multer.MulterError) {
    const messages = {
      MISSING_FIELD_NAME: "Vui lòng nhập tên cho các trường Form và Files.",
      LIMIT_UNEXPECTED_FILE: `Tên trường file hoặc số lượng ảnh không hợp lệ: ${JSON.stringify(err.field)} (${err.field?.length ?? 0} ký tự). Dùng "image" cho một ảnh hoặc "images" cho nhiều ảnh; sản phẩm tối đa 10 ảnh/lần.`,
      LIMIT_FILE_SIZE: "Mỗi ảnh không được vượt quá 5 MB.",
      LIMIT_FILE_COUNT: "Số lượng ảnh vượt quá giới hạn của API.",
      LIMIT_FIELD_VALUE: "Nội dung trường thông tin gửi lên quá lớn.",
    };
    return res
      .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ message: messages[err.code] ?? "Biểu mẫu ảnh không hợp lệ." });
  }
  if (
    req.is("multipart/form-data") &&
    /^(Multipart:|Unexpected end of (form|file))/.test(err.message ?? "")
  )
    return res
      .status(400)
      .json({
        message:
          "Biểu mẫu multipart không hợp lệ. Hãy để công cụ gửi request tự đặt Content-Type và boundary.",
      });
  if (!(err instanceof HttpError) && Number.isInteger(err.http_code))
    return res
      .status(err.http_code === 400 ? 415 : 502)
      .json({ message: "Tải ảnh lên dịch vụ lưu trữ thất bại." });
  const isVariant = /^\/api\/product-variants(?:\/|\?|$)/.test(req.originalUrl ?? "");
  if (err instanceof mongoose.Error.ValidationError || err instanceof mongoose.Error.CastError)
    return res.status(400).json({ message: isVariant
      ? "Dữ liệu biến thể sản phẩm không hợp lệ." : "Dữ liệu không hợp lệ." });
  if (err instanceof mongoose.Error.VersionError)
    return res.status(409).json({ message: isVariant
      ? "Biến thể đã thay đổi. Vui lòng tải lại và thử lại."
      : "Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại." });
  if (err.code === 11000) {
    const duplicateEmail =
      Object.hasOwn(err.keyPattern ?? {}, "email") ||
      Object.hasOwn(err.keyValue ?? {}, "email");
    return res.status(409).json({
      message: duplicateEmail
        ? "Email đã được đăng ký."
        : "Dữ liệu đã tồn tại. Vui lòng sử dụng giá trị khác.",
    });
  }
  const status =
    Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
      ? err.status
      : 500;
  if (status >= 500)
    console.error("Xử lý yêu cầu thất bại:", err.name ?? "Error");
  const message =
    err instanceof HttpError
      ? err.message
      : status >= 500
        ? "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau."
        : err.type === "entity.parse.failed"
          ? "Nội dung JSON không hợp lệ."
          : err.type === "entity.too.large"
            ? "Dữ liệu gửi lên vượt quá dung lượng cho phép."
            : "Không thể xử lý yêu cầu.";
  res.status(status).json({ message });
};
