# TLUPhone Backend

Authentication API đã triển khai: đăng ký, đăng nhập, thông tin tài khoản và logout bằng JWT Bearer. Xem [hướng dẫn cấu hình, Postman và unique email index](docs/authentication.md).

Tất cả model bật `autoIndex: true` ở cả development và production. Khi khởi động, BE nạp đủ model và chờ tạo các index đã khai báo trước khi mở cổng. Không tự xóa/sửa index cũ; lỗi dữ liệu trùng hoặc cấu hình index xung đột cần xử lý riêng. Script `indexes:auth` chỉ còn là công cụ chẩn đoán tùy chọn.

Backend Node.js + Express, MongoDB + Mongoose; đã có Authentication và các model bán hàng. Các API nghiệp vụ bán hàng chưa triển khai.

## Chạy local

Yêu cầu Node.js 22 trở lên và MongoDB local hoặc MongoDB Atlas.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Nếu PowerShell chặn `npm.ps1`, sử dụng `npm.cmd` thay cho `npm`.

Mở `.env` và cấu hình:

| Biến | Giá trị mặc định / ý nghĩa |
| --- | --- |
| NODE_ENV | development; dùng production khi triển khai |
| PORT | 5000 |
| MONGODB_URI | mongodb://127.0.0.1:27017/tluphone; bắt buộc |
| CLIENT_ORIGIN | http://localhost:5173; origin FE, không có dấu / cuối |
| JWT_SECRET | Chuỗi ngẫu nhiên ít nhất 32 byte để ký JWT, không commit hoặc ghi log |
| JWT_EXPIRES_IN | 1d; hỗ trợ thời hạn như 1h hoặc 1d |

Đảm bảo MongoDB local đang chạy. Với Atlas, thay `MONGODB_URI` bằng chuỗi kết nối của cluster, cấu hình database user và network access; URL-encode ký tự đặc biệt trong mật khẩu. Không commit `.env` hoặc thông tin đăng nhập.

```powershell
npm start
npm test
curl.exe http://localhost:5000/api/health
```

`npm run dev` tự khởi động lại bằng nodemon. `npm start` chạy Node trực tiếp. Server chỉ mở cổng sau khi kết nối MongoDB; lỗi kết nối sẽ kết thúc với mã lỗi. Ctrl+C hoặc SIGTERM đóng HTTP server và kết nối MongoDB.

## API hiện có

- `GET /api/health`: HTTP 200, `{"status":"ok","database":"connected"}` khi Mongoose báo đã kết nối.
- Khi mất kết nối: HTTP 503, `{"status":"unavailable","database":"disconnected"}`. Việc phát hiện mất kết nối phụ thuộc cơ chế theo dõi của MongoDB driver.
- Route không tồn tại: HTTP 404, `{"message":"Route not found"}`.
- Lỗi nội bộ: HTTP 500, `{"message":"Internal server error"}`, không trả stack trace.

CORS cho phép origin được cấu hình; trình duyệt chặn đọc response từ origin khác. CORS không thay thế xác thực. JSON request giới hạn 1 MB.

## Cấu trúc

`src/app.js` tạo Express app; `src/server.js` quản lý khởi động và tắt server. Các thư mục `config`, `routes`, `controllers`, `middleware` chứa các thành phần nền tảng. `models` và `services` dành cho nghiệp vụ tiếp theo.

Tests kiểm tra cấu hình, health check với trạng thái kết nối giả lập, CORS, 404, JSON không hợp lệ và bảo mật lỗi 500. Tests không yêu cầu MongoDB và không thay thế kiểm thử kết nối MongoDB thực tế.

Khi khởi tạo, `npm audit` báo 3 cảnh báo mức high trong chuỗi phụ thuộc phát triển `nodemon → chokidar → braces`, chưa có bản sửa theo báo cáo npm. Các phụ thuộc production không bị báo lỗi ở lần kiểm tra này. Không chạy `npm audit fix --force` tự động; kiểm tra lại các bản cập nhật trước khi nâng cấp.

FE giữ nguyên. Có User, Brand, Category, Product, ProductVariant, Cart, Order và InventoryReservation Model. Authentication đã có API; các API bán hàng, Google Login, quên mật khẩu và thanh toán chưa triển khai.
