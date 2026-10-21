// Chỉ những lỗi được tạo rõ ràng mới được phép hiển thị thông báo cho máy khách API.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
