import { HttpError } from "../utils/http-error.js";

export function notFound(_req, res) {
  res.status(404).json({ message: "Không tìm thấy đường dẫn API." });
}

export function errorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);
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
}
