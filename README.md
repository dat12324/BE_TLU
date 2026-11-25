# TLUPhone Backend

Authentication API đã triển khai: đăng ký, đăng nhập, thông tin tài khoản và logout bằng JWT Bearer. Xem [hướng dẫn cấu hình, Postman và unique email index](docs/authentication.md).

Tất cả model bật `autoIndex: true` ở cả development và production. Khi khởi động, BE nạp đủ model và chờ tạo các index đã khai báo trước khi mở cổng. Không tự xóa/sửa index cũ; lỗi dữ liệu trùng hoặc cấu hình index xung đột cần xử lý riêng.

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
| REDIS_URL | URL Redis Cloud; lưu token tạm, OTP, giới hạn đăng nhập và request |
| JWT_REFRESH_SECRET | Secret riêng ít nhất 32 byte cho refresh JWT, khác JWT_SECRET |
| JWT_REFRESH_EXPIRES_IN | 7d; refresh qua cookie HttpOnly, không lưu JWT trong Redis |
| PASSWORD_RESET_SECRET | Secret HMAC ít nhất 32 byte, khác hai JWT secret |
| API_BASE_URL | http://localhost:5000; URL Backend công khai dùng trong liên kết xác thực email |
| SMTP_HOST / SMTP_PORT / SMTP_SECURE | Cấu hình SMTP; 587 + false cho STARTTLS, 465 + true cho TLS |
| SMTP_USER / SMTP_PASS / SMTP_FROM | Tài khoản gửi email và địa chỉ gửi; không commit thông tin thật |

Đảm bảo MongoDB local đang chạy. Với Atlas, thay `MONGODB_URI` bằng chuỗi kết nối của cluster, cấu hình database user và network access; URL-encode ký tự đặc biệt trong mật khẩu. Không commit `.env` hoặc thông tin đăng nhập.

```powershell
npm start
npm test
```

`npm run dev` tự khởi động lại bằng nodemon. `npm start` chạy Node trực tiếp. Server kết nối Redis khi có REDIS_URL, sau đó MongoDB trước khi mở cổng; lỗi kết nối sẽ kết thúc với mã lỗi. Ctrl+C hoặc SIGTERM đóng HTTP server, Redis và MongoDB.

## API hiện có

- Route không tồn tại: HTTP 404, `{"message":"Không tìm thấy đường dẫn API."}`.
- Lỗi nội bộ: HTTP 500, `{"message":"Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau."}`, không trả stack trace.

CORS cho phép origin được cấu hình; trình duyệt chặn đọc response từ origin khác. CORS không thay thế xác thực. JSON request giới hạn 1 MB.

## Cấu trúc

`src/app.js` tạo Express app; `src/server.js` quản lý khởi động và tắt server. Các thư mục `config`, `routes`, `controllers`, `middleware` chứa các thành phần nền tảng. `models` và `services` dành cho nghiệp vụ tiếp theo.

Tests kiểm tra cấu hình, CORS, 404, JSON không hợp lệ và bảo mật lỗi 500. Tests không yêu cầu MongoDB và không thay thế kiểm thử kết nối MongoDB thực tế.

Khi khởi tạo, `npm audit` báo 3 cảnh báo mức high trong chuỗi phụ thuộc phát triển `nodemon → chokidar → braces`, chưa có bản sửa theo báo cáo npm. Các phụ thuộc production không bị báo lỗi ở lần kiểm tra này. Không chạy `npm audit fix --force` tự động; kiểm tra lại các bản cập nhật trước khi nâng cấp.

FE giữ nguyên. Auth có xác thực email qua liên kết, quên mật khẩu OTP 5 chữ số và refresh cookie theo BĐS; xem [cấu hình và cách test](docs/authentication.md). Register không tự gửi email; gọi verifyAccount/resend-verification sau register. Chưa chặn đăng nhập vì chưa xác thực email, không có 2FA. Không thay đổi các module bán hàng trong đợt Redis này.

## Bộ lọc sản phẩm cho trang chủ

`GET /api/products` hỗ trợ `isFeatured`, `isNew`, `isHotDeal` nhận `true`/`false` và `sort=rating_desc`.

Bộ lọc `tags` nhận chuỗi phân cách bằng dấu phẩy, ví dụ `tags=gaming,battery`.
Sản phẩm phải có đủ các tag đã chọn; khoảng trắng, hoa/thường và tag trùng được chuẩn hóa.
Không truyền `tags` thì danh sách giữ nguyên, kể cả sản phẩm chưa có tag.
Ví dụ tìm điện thoại chơi game, pin tốt, dưới 10 triệu và còn hàng:
`GET /api/products?tags=gaming,battery&maxPrice=10000000&inStock=true&sort=price_asc&limit=5`.

Gemini Function Calling: `src/utils/gemini-tools.js` xuất
`productTools` và `executeProductTool({ name, args })`.
Chỉ có `searchProducts`; luôn dùng quyền khách hàng, không ghi MongoDB.
Tìm kiếm mặc định 5 sản phẩm còn hàng, tối đa 10; không gửi danh sách hoặc phân trang SKU.
SKU chỉ được dùng nội bộ để lọc cấu hình, giá và tồn kho.
Dữ liệu gửi AI gồm tên, slug, thương hiệu, technicalSpecs, tags,
giá bán/giá so sánh và tồn khả dụng của SKU đại diện cho giá, không phải tổng tồn sản phẩm. Không gửi ảnh, HTML mô tả,
specifications dài hoặc metadata. Không có kết quả thì trả danh sách rỗng, không tự bỏ bộ lọc.
Mỗi hàm trả `{ response, products }`: chỉ gửi `response` vào Gemini, giữ `products` riêng cho FE.
Thẻ gồm tên, slug, thương hiệu, URL ảnh chính và giá tham khảo từ SKU thực tế;
FE dẫn đến `/products/:slug`, không hiển thị bộ chọn SKU hoặc nút thêm giỏ trong chat.
Ảnh không được gửi vào Gemini.
Thử model sinh lời gọi hàm bằng `node scripts/test-gemini-tools.js` (cần cấu hình Gemini;
chỉ gửi câu hỏi thử và khai báo hàm, không gửi dữ liệu MongoDB).
Khuyến mãi gồm sản phẩm được đánh dấu hoặc có SKU đang hoạt động, chưa xóa, với giá gốc lớn hơn giá bán.
Các bộ lọc chạy trước phân trang; response và quy tắc chỉ hiển thị sản phẩm active cho khách hàng được giữ nguyên.

```http
GET /api/products?isHotDeal=true&page=1&limit=5
GET /api/products?isFeatured=true&sort=rating_desc&page=1&limit=8
GET /api/products?isNew=true&sort=newest&page=1&limit=4
```
## Google Login

`POST /api/auth/google` nhận JSON `{ "credential": "<Google ID Token>", "remember": false }`.
FE dùng Google Identity Services; BE xác minh bằng `google-auth-library`, sau đó trả cùng cấu trúc đăng nhập thường và đặt Refresh Token Cookie HttpOnly.

- BE cấu hình `GOOGLE_CLIENT_ID`; FE cấu hình `VITE_GOOGLE_CLIENT_ID` cùng giá trị và khởi động lại Vite.
- Google Cloud OAuth Client loại Web cần Authorized JavaScript origin `http://localhost:3000` khi chạy local.
- API Google yêu cầu header `Origin` khớp `CLIENT_ORIGIN` (trình duyệt tự gửi). Không cần Google Client Secret cho luồng này.
- Gmail đã được Google xác minh trùng email tài khoản hiện có sẽ tự liên kết Google ID và đăng nhập, giữ nguyên mật khẩu, quyền và dữ liệu tài khoản. Không tự liên kết email ngoài Gmail hoặc tài khoản đã gắn Google ID khác.
- Tài khoản mới có role `user`; tài khoản Google đã liên kết giữ role và trạng thái trong MongoDB.
- Không đưa tệp client-secret JSON, mật khẩu hoặc token vào Git.

## Banner API

| Method | Endpoint | Quyền | Chức năng |
| --- | --- | --- | --- |
| GET | `/api/banners` | Công khai; token Admin để xem tất cả | Danh sách, phân trang và lọc |
| GET | `/api/banners/:id` | Admin | Chi tiết |
| POST | `/api/banners` | Admin | Tạo, trả 201 `{ data }` |
| PATCH | `/api/banners/:id` | Admin | Sửa thông tin, thay ảnh hoặc ẩn/hiện, trả 200 `{ data }` |

Danh sách trả 200 `{ data, pagination: { page, limit, total, totalPages } }`.
Query hỗ trợ `page`, `limit` (tối đa 100), `search` theo tiêu đề, `position`, `status` (chỉ Admin).
Danh sách Admin sắp theo vị trí trước khi phân trang; trong mỗi vị trí sắp theo `displayOrder` tăng dần, sau đó mới nhất. Danh sách công khai giữ thứ tự `displayOrder`. Khách chỉ xem `active`, đã đến `startsAt` và chưa đến `endsAt`; không đặt lịch thì hiển thị ngay.
Vị trí: `hero`, `promo`, `product-iphone`, `product-android`.

Test Postman/Thunder: chọn Bearer Token của Admin, POST `/api/banners`, Body → Form, thêm file `image` (JPG/PNG/WebP, tối đa 5 MB, một ảnh) cùng các trường:

```text
title: Ưu đãi điện thoại
subtitle: Khám phá các sản phẩm mới
position: hero
theme: slate
link: /products
btnText: Xem sản phẩm
displayOrder: 0
status: active
```

Cũng nhận JSON với `image: { url, publicId }` từ Cloudinary; không gửi metadata và file cùng lúc.
`promo` không bắt buộc ảnh, dùng `tone` (rose/slate/emerald), `icon` (phone/brands/shipping).
`theme` có slate/indigo/zinc/amber/purple. Ngày `startsAt`/`endsAt` dùng ISO 8601; gửi `null` để bỏ lịch.
PATCH cùng ID và Body `{ "status": "inactive" }` để ẩn, `active` để hiện. Không có API xóa cứng.
`createdBy`/`updatedBy` được lấy từ Admin đã xác thực; client không được tự gán.
Ảnh vừa upload được dọn nếu validation hoặc lưu DB thất bại; thay ảnh thành công giữ ảnh cũ trên Cloudinary.
Lỗi dữ liệu/ID trả 400, chưa đăng nhập 401, thiếu quyền 403, không tìm thấy 404, sai định dạng ảnh 415, ảnh quá lớn 413.
FE quản lý Banner tại `/admin/banners`, hỗ trợ thêm/sửa ảnh, lịch, vị trí, phân trang và ẩn/hiện.
Trang chủ và trang sản phẩm lấy banner từ API; danh sách công khai có cache 30 giây, dùng chung request giữa các component và được xóa cache sau thao tác Admin.
Ngày trống trong FormData được hiểu là bỏ giới hạn lịch. Chưa có banner thì các vùng banner không hiển thị dữ liệu mock.

## Cart API

Tất cả endpoint yêu cầu `Authorization: Bearer <accessToken>`. User được lấy từ JWT; không gửi `user`, giá hoặc tổng tiền trong body.

| Method | Endpoint | Body JSON |
| --- | --- | --- |
| GET | `/api/cart` | Không cần |
| POST | `/api/cart/items` | `{ "productVariant": "<SKU ObjectId>", "quantity": 1 }` |
| PATCH | `/api/cart/items/:variantId` | `{ "quantity": 2 }` |
| DELETE | `/api/cart/items/:variantId` | Không cần |
| DELETE | `/api/cart` | Không cần |

Thành công trả HTTP 200 `{ data: { items, totalQuantity, totalAmount } }`. Mỗi item có `variantId`, `productVariant` (thông tin SKU và Product hiện tại, hoặc null khi SKU đã mất), `quantity`, `availableStock`, `isAvailable`, `subtotal`. SKU không còn khả dụng vẫn giữ trong giỏ để người dùng xóa; client cần xem `isAvailable`, không coi tổng tiền hiển thị là xác nhận có thể đặt hàng.

POST cộng số lượng nếu SKU đã có; PATCH đặt số lượng mới. Số lượng phải là Number nguyên dương an toàn, không vượt lượng có thể bán (`stock - reservedStock`). Thêm vào giỏ không giữ hoặc trừ hàng. Lần đầu thêm mới tạo giỏ; GET và DELETE không tự tạo giỏ. DELETE có thể gọi lại an toàn kể cả khi item không còn tồn tại.


Lỗi: 400 dữ liệu/ID sai; 401 chưa đăng nhập; 404 SKU không khả dụng hoặc PATCH item không có trong giỏ; 409 vượt tồn kho hoặc xung đột cập nhật.

Test Thunder: đăng nhập lấy token, POST một SKU còn hàng hai lần, GET kiểm tra chỉ một dòng đã cộng số lượng; PATCH số lượng, DELETE item, sau đó DELETE toàn bộ giỏ. Dùng tài khoản khác để kiểm tra giỏ độc lập.

Frontend đã nối Cart API qua `CartContext` và Axios hiện có: tải giỏ theo tài khoản, thêm SKU thực tế, cập nhật số lượng, xóa item/xóa giỏ và cập nhật badge Header. Khách cần đăng nhập; giỏ localStorage cũ không tự chuyển lên MongoDB. Lựa chọn checkbox và coupon demo chỉ là trạng thái Frontend, chưa phải tính giá/voucher đặt hàng từ Backend. Checkout mô phỏng giữ nguyên giỏ Backend, không tự xóa sau khi tạo đơn demo.

Các cập nhật dùng atomic update theo User trong JWT, không ghi đè cả mảng item khi sửa một SKU. Tồn kho được kiểm tra tại lúc xử lý request; Checkout vẫn phải kiểm tra lại và giữ/trừ hàng nhất quán. Giá là giá thường `ProductVariant.price`, cùng cách tính với Order hiện tại. Không lưu snapshot giá vào Cart.

## Order API

Tất cả endpoint cần Bearer access token. User ID lấy từ JWT, không nhận từ body.

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| POST | `/api/orders` | Tạo đơn COD, trả 201 `{ data: order }` |
| GET | `/api/orders` | User xem đơn của mình; Admin xem toàn bộ, trả 200 `{ data, pagination }` |
| GET | `/api/orders/:id` | Chi tiết đơn của mình hoặc Admin xem, trả 200 `{ data: order }` |
| PATCH | `/api/orders/:id/cancel` | Chủ đơn hủy đơn pending/confirmed, body `{ "cancelReason": "Đổi nhu cầu" }` hoặc `{}` |
| PATCH | `/api/orders/:id/status` | Admin chuyển trạng thái, body `{ "status": "confirmed" }` |

GET danh sách hỗ trợ `page`, `limit` (tối đa 100), `status`, `paymentMethod`, `search` theo mã đơn. Không có API xóa đơn hoặc sửa items/giá sau khi tạo. Đơn của người khác trả 404 với khách hàng.

Ví dụ POST:

```json
{
  "items": [{ "productVariant": "ID_SKU", "quantity": 1 }],
  "shippingAddress": {
    "fullName": "Nguyễn Văn A",
    "phone": "0912345678",
    "province": "Hà Nội",
    "ward": "Phường ...",
    "detailAddress": "Số nhà, tên đường ..."
  },
  "paymentMethod": "COD",
  "note": "Gọi trước khi giao"
}
```


`district` tùy chọn. Địa chỉ được sao chép vào Order, không phụ thuộc việc sửa sổ địa chỉ sau này. Giá/sản phẩm lấy từ MongoDB; mặc định discountAmount = 0, gửi thêm `voucherCode` để áp dụng mã giảm giá. Phí giao hàng 30.000đ nếu subtotal trước giảm giá dưới 500.000đ, còn lại miễn phí; các khoản này chỉ Backend tính. Chưa hỗ trợ nhận tại cửa hàng ở Order API này.

Trạng thái: `pending → confirmed → shipping → delivered`. Cho phép hủy từ pending/confirmed, không hủy khi đang giao hoặc đã giao. Khi hủy qua endpoint trạng thái Admin có thể gửi thêm `cancelReason`. Gửi lại trạng thái đã xử lý trả 409; không trừ/giải phóng hàng lần hai. Không cho đánh dấu paid tùy ý qua request.

Tạo COD dùng transaction để lưu Order, tăng reservedStock có điều kiện và tạo InventoryReservation active không hết hạn. Hủy chuyển reservation sang released và giảm reservedStock. Giao thành công chuyển committed, giảm cả stock và reservedStock, cập nhật paymentStatus=paid và deliveredAt. SKU cập nhật kho tăng __v để tránh luồng chỉnh sửa SKU ghi đè. Chỉ xử lý các đơn COD unpaid có dữ liệu giữ hàng tương ứng; đơn cũ thiếu reservation trả 409, không tự sửa/migration dữ liệu cũ.

Transaction cần MongoDB replica set (Atlas đáp ứng). Không có fallback ghi rời rạc. API không tự xóa Cart sau khi tạo đơn; khi nối Checkout, chỉ xóa các dòng đã đặt sau khi nhận phản hồi tạo đơn thành công. POST chưa có idempotency key, nên FE phải chặn gửi lặp trong lúc chờ tạo đơn.

VNPAY giữ trong enum để tích hợp sau; POST chọn VNPAY hiện trả 503, không tạo Order hoặc giữ hàng. Chưa có URL thanh toán, IPN, xác minh chữ ký hoặc hoàn tiền. Không tự đổi trạng thái đơn đã thanh toán hoặc đơn VNPAY qua luồng COD.

Test Thunder: đăng nhập khách → POST đơn → GET danh sách/chi tiết; đăng nhập Admin → PATCH confirmed → shipping → delivered. Tạo đơn khác để thử cancel và kiểm tra reservedStock được trả lại. Lỗi 400 dữ liệu sai; 401 chưa đăng nhập; 403 thiếu quyền Admin; 404 không tìm thấy/không thuộc chủ đơn; 409 hết hàng hoặc chuyển trạng thái không hợp lệ.

## Notification API

Tất cả endpoint yêu cầu `Authorization: Bearer <accessToken>`, chỉ thao tác thông báo của User đăng nhập (kể cả Admin).

| Method | Endpoint | Response thành công (200) |
| --- | --- | --- |
| GET | `/api/notifications?page=1&limit=20` | `{ data: [...], pagination: { page, limit, total, totalPages } }` |
| GET | `/api/notifications/unread-count` | `{ data: { unreadCount: 3 } }` |
| PATCH | `/api/notifications/:id/read` | `{ data: notification }` |
| PATCH | `/api/notifications/read-all` | `{ data: { modifiedCount: 3 } }` |

Danh sách sắp xếp mới nhất trước; limit mặc định 20, tối đa 100. Hai API PATCH không cần body, chỉ đặt `isRead = true`; gửi lại vẫn an toàn. ID sai định dạng trả 400, thông báo không tồn tại hoặc không thuộc người dùng trả 404, chưa đăng nhập trả 401.

Order Service tự tạo thông báo cho chủ đơn khi đặt hàng thành công hoặc chuyển sang confirmed/shipping/delivered/cancelled. Thông báo lưu trong cùng transaction với đơn hàng và tồn kho. Không tạo lại thông báo cho lịch sử đơn cũ. Popup Header tải dữ liệu mới khi mở, chưa có thông báo thời gian thực.

## Voucher API

| Method | Endpoint | Quyền | Chức năng |
| --- | --- | --- | --- |
| GET | `/api/vouchers?page=1&limit=20&search=SAVE` | Public hoặc Admin | Danh sách phân trang; khách chỉ thấy mã active, trong thời gian sử dụng và còn lượt. Admin thấy tất cả, có thể lọc `status=active/inactive`. |
| GET | `/api/vouchers/:id` | Admin | Chi tiết mã giảm giá |
| POST | `/api/vouchers` | Admin | Tạo mã, trả 201 `{ data: voucher }` |
| PATCH | `/api/vouchers/:id` | Admin | Sửa một phần hoặc bật/tắt bằng `status` |
| POST | `/api/vouchers/check` | Đăng nhập | Xem trước giảm giá từ giỏ hàng hiện tại |

Tạo mã (JSON; thời gian ví dụ theo UTC+7, chỉnh lại khi thử):

```json
{
  "code": "TLU10",
  "description": "Giảm 10%, tối đa 500.000đ",
  "discountType": "percentage",
  "discountValue": 10,
  "maxDiscount": 500000,
  "minOrderValue": 1000000,
  "usageLimit": 100,
  "startsAt": "2026-11-12T00:00:00+07:00",
  "endsAt": "2026-12-01T00:00:00+07:00",
  "status": "active"
}
```

`discountType=fixed`: `discountValue` là số VND. Phần trăm là số nguyên 1–100; tiền là số nguyên không âm trong phạm vi an toàn, mức giảm phải lớn hơn 0. `maxDiscount` và `usageLimit` cho phép `null` (không giới hạn). Code tự trim, viết hoa và có unique index sẵn trong Model. Không nhận `usedCount`, `_id` hoặc toán tử cập nhật từ request.

Kiểm tra mã: đăng nhập User, thêm hàng vào giỏ, gửi `POST /api/vouchers/check` với `{ "code": "TLU10" }`. Response 200: `{ data: { voucherId, code, subtotal, discountAmount, totalAmount } }`; `totalAmount` ở đây là tiền hàng sau giảm, chưa gồm phí vận chuyển. Backend lấy giá từ giỏ hàng/MongoDB, không nhận số tiền do client gửi; làm tròn phần trăm, áp trần `maxDiscount` và không giảm quá tiền hàng. API kiểm tra chỉ xem trước, **không giữ lượt và không tăng usedCount**.

Có thể gửi thêm `variantIds: ["ID_SKU"]` để chỉ tính các dòng đã chọn trong giỏ hàng; số lượng và giá vẫn lấy từ Cart/MongoDB. ID không có trong giỏ hoặc sản phẩm đã chọn không khả dụng trả 409. Không gửi `variantIds` thì kiểm tra toàn bộ giỏ như trước. Popup FE ở Cart/Checkout lấy mã từ GET `/vouchers` và gọi `/vouchers/check` trước khi áp dụng. Khi đổi lựa chọn/số lượng/giá, mã đã áp dụng được gỡ để kiểm tra lại; Checkout gửi `voucherCode` khi tạo đơn.

`node scripts/seed-vouchers.js` thêm 5 mã mẫu GIAM10, GIAM500K, TLU2026, WELCOME, SALE15, chỉ thêm mã chưa tồn tại; không ghi đè mã cũ hoặc thay đổi index. Các mã có hiệu lực từ 12/11/2026 đến hết 31/12/2026 (UTC+7), không giới hạn lượt. GIAM10 yêu cầu đơn từ 2 triệu. Script không chạy tự động khi khởi động server.

Đặt đơn có voucher: gửi thêm `voucherCode` vào body `POST /api/orders`:

```json
{
  "items": [{ "productVariant": "ID_SKU_THAT", "quantity": 1 }],
  "shippingAddress": {
    "fullName": "Nguyễn Văn A",
    "phone": "0912345678",
    "province": "Hà Nội",
    "ward": "Hà Đông",
    "detailAddress": "23 Nguyễn Trãi"
  },
  "paymentMethod": "COD",
  "voucherCode": "TLU10"
}
```

Thay `ID_SKU_THAT` bằng ObjectId SKU thực tế. Backend tính lại subtotal từ đúng các SKU đặt mua, kiểm tra mã đang active/trong thời hạn/đủ tiền hàng/còn lượt và tăng `usedCount` có điều kiện trong cùng transaction tạo Order, giữ hàng và thông báo. Không cần gọi `/check` trước; kết quả xem trước không bảo đảm giữ được lượt. Order lưu thêm `voucher` (ID), `voucherCode` (snapshot) và `discountAmount`; `totalAmount = subtotal - discountAmount + shippingFee`. Client không quyết định số tiền giảm hoặc tổng tiền. Đơn không gửi voucher hoạt động như trước, VNPAY vẫn chưa hỗ trợ.

Hủy đơn thành công trả lại một lượt voucher trong cùng transaction giải phóng hàng. Gọi hủy lại không trả thêm lượt; giao hàng thành công giữ nguyên lượt đã dùng. Sửa voucher sau này không thay đổi giá hoặc mã snapshot của các đơn đã đặt. Tạo đơn thất bại sẽ rollback cả lượt voucher; không cần migration cho các đơn cũ không có voucher.

PATCH `{ "status": "inactive" }` để tắt mã, `{ "status": "active" }` để bật lại. Mã hết hạn hoặc hết lượt vẫn không dùng được dù active. Lỗi đầu vào/không đủ điều kiện trả 400; chưa đăng nhập 401; thiếu quyền 403; không có mã theo ID 404; trùng code hoặc giỏ hàng không khả dụng 409. Không có API xóa cứng.

## Dashboard API (Admin)

`GET /api/dashboard?period=7days`, gửi Bearer token Admin. `period`: `today`, `7days` (mặc định), `30days`, `month`; ngày tính theo UTC+7. Trả HTTP 200 với `{ data: { meta, summary, revenueSeries, orderStatuses, recentOrders, topProducts, lowStockProducts } }`. Chưa đăng nhập trả 401, không phải Admin trả 403.

- Doanh thu: tổng `totalAmount` đơn `delivered` và `paid`, theo `deliveredAt` trong khoảng chọn. Bao gồm phí vận chuyển, sau giảm giá của đơn.
- Đơn hàng/trạng thái/5 đơn gần đây: theo `createdAt` trong khoảng chọn.
- Top 5 sản phẩm: cộng số lượng và thành tiền snapshot của đơn đã giao, đã thanh toán theo ngày giao; không dùng giá SKU hiện tại.
- Sản phẩm đang bán và khách hàng: tổng hiện tại của Product active và User role user, không giới hạn theo khoảng ngày.
- Tối đa 10 SKU cảnh báo: SKU active, chưa xóa, Product active; `stock - reservedStock < lowStockThreshold`. Bỏ qua tồn kho chưa xác định (`stock: null`).

Dashboard Frontend gọi API khi mở trang hoặc đổi khoảng ngày. Không còn sử dụng dữ liệu mẫu; không có dữ liệu thì hiển thị 0/danh sách rỗng. API chỉ đọc dữ liệu, không tạo dữ liệu thống kê hoặc index.

## Review API

| Method | Endpoint | Quyền | Dữ liệu |
| --- | --- | --- | --- |
| GET | `/api/products/:productId/reviews?page=1&limit=20` | Public | Danh sách mới nhất trước; tối đa 100 đánh giá/trang |
| POST | `/api/reviews` | User | `{ "product": "PRODUCT_ID", "rating": 5, "content": "Sản phẩm tốt." }`; `order` tùy chọn |
| PATCH | `/api/reviews/:id` | Chủ đánh giá | `{ "rating": 4, "content": "Nội dung đã cập nhật." }`; có thể chỉ gửi một trường |
| DELETE | `/api/reviews/:id` | Chủ đánh giá | Không cần body |

Các API ghi cần `Authorization: Bearer ACCESS_TOKEN` của tài khoản role `user`.
Một người chỉ đánh giá mỗi Product một lần và cần có đơn `delivered` chứa Product đó.
Nếu gửi `order`, đơn đó phải thuộc người đăng nhập, đã giao và chứa đúng Product.
Số sao là số nguyên 1–5, nội dung sau trim dài 1–3000 ký tự. Client không được truyền `user` hay sửa Product/Order của đánh giá.

GET trả `{ data: [...], pagination: { page, limit, total, totalPages } }`; chỉ liệt kê đánh giá của Product active.
Thông tin người viết chỉ populate `_id`, `fullName`, `avatar`.
POST trả 201, PATCH trả 200 với `{ data: review }`; DELETE trả 200 với `{ message: "Đã xóa đánh giá." }`.
Các lỗi: 400 dữ liệu sai, 401 chưa đăng nhập, 403 sai quyền/chưa có đơn đã giao, 404 không tìm thấy, 409 đã đánh giá.

Tạo/sửa/xóa và tính lại `Product.reviewCount`, `Product.ratingAverage` (làm tròn một chữ số thập phân) nằm trong cùng MongoDB transaction.
Xóa hết đánh giá trả cả hai giá trị về 0. Cần MongoDB hỗ trợ transaction (Atlas hoặc replica set), như luồng Order hiện tại.
Không có bước duyệt đánh giá vì Review Model hiện không có trường trạng thái.
Kiểm thử không cần Atlas: `node --test test/review-api.test.js`.

## VNPay Sandbox

- `config/vnpay.js` khởi tạo thư viện `vnpay` từ biến môi trường khi cần thanh toán, tắt logger SDK. `payment.service.js` dùng `buildPaymentUrl()`, `verifyIpnCall()` và `verifyReturnUrl()`; không tự ký hoặc so sánh HMAC.
- Truyền VND gốc vào `buildPaymentUrl()` vì SDK tự nhân 100. Khi đối chiếu callback vẫn dùng `vnp_Amount` gốc nhân 100 như giao thức VNPay. Giữ hạn 15 phút và UTC+7, không phụ thuộc múi giờ máy chủ.
- Payment Model, endpoint, trạng thái Order và cơ chế cập nhật có điều kiện được giữ nguyên. SDK không thay thế việc kiểm tra số tiền, mã giao dịch hoặc chống xử lý IPN trùng. Số tiền callback âm/thập phân bị SDK từ chối tại bước xác minh (`RspCode: 97`), không ghi database.
- Checkout cho chọn COD hoặc VNPay. VNPay gửi `paymentMethod: "VNPAY"` qua `POST /api/orders`, nhận `data.paymentUrl`, sau đó chuyển trình duyệt sang cổng Sandbox. COD giữ nguyên luồng hiện tại.
- Cấu hình Backend: `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL`, `VNPAY_RETURN_URL` trong `.env`; `CLIENT_ORIGIN` trỏ tới Frontend. Không đặt secret trong biến `VITE_*`.
- `GET /api/payments/vnpay/ipn`: endpoint public xác minh chữ ký, số tiền và giao dịch, cập nhật Payment/Order có điều kiện. Callback lặp không ghi nhận thanh toán hai lần. Giữ cơ chế transaction sẵn có của Order cho tồn kho/voucher; Payment không thêm transaction mới.
- `GET /api/payments/vnpay/return`: chỉ kiểm tra và chuyển về `/orders?orderId=...&paymentStatus=...`. FE lấy lại Order từ Backend để hiển thị kết quả, không tin trạng thái trên URL. Nếu IPN đến chậm, kiểm tra tối đa 10 lần cách nhau 3 giây và cho phép cập nhật thủ công.
- Khi test trên máy cá nhân, Return có thể dùng localhost; IPN phải được đăng ký với VNPay bằng URL Backend công khai truy cập được. Không nhận IPN thì Order vẫn pending, kể cả khi trình duyệt đã quay về.
- Reservation VNPay có hạn 15 phút nhưng hiện chưa có tác vụ tự đối soát/giải phóng khi không nhận IPN. Payment thất bại cho phép hủy đơn theo luồng hiện tại. Không hỗ trợ hoàn tiền hoặc hủy thông thường đơn VNPay pending/paid.
- Test mock: `node --test test/payment-api.test.js test/order-service.test.js`; không tạo giao dịch thật. Tham khảo giao thức [VNPay 2.1.0](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html).


### Chat tư vấn sản phẩm

`POST /api/chat/messages` là API public, tối đa 10 yêu cầu/IP/phút.
Cần `GEMINI_API_KEY` và `GEMINI_MODEL` trong `.env`.

```json
{
  "message": "Tìm điện thoại chơi game dưới 10 triệu",
  "history": []
}
```

`history` là tối đa 10 tin trước đó, mỗi tin có `role` (`user` hoặc `assistant`) và `content`.
Không gửi lời chào mặc định hoặc metadata ảnh trong lịch sử. Câu hỏi tối đa 1.000 ký tự;
mỗi tin lịch sử tối đa 2.000 ký tự. Không lưu lịch sử vào MongoDB.

Response `200`: `{ "message": "Câu trả lời", "products": [{ "name": "...", "slug": "...", "brand": "...", "image": "https://...", "price": 9000000, "compareAtPrice": 10000000 }] }`.
FE dùng `products` để hiện thẻ và dẫn tới `/products/:slug`. Không có sản phẩm thì `products: []`.
Lỗi dữ liệu trả 400, giới hạn tần suất 429, thiếu cấu hình/Gemini không khả dụng 503.
API chỉ gọi công cụ tìm sản phẩm, không đặt hàng hoặc sửa dữ liệu.
Gợi ý “5 điện thoại pin trâu nhất” dùng `sort: "battery_desc"`, `limit: 5`,
`inStock: true`: MongoDB xếp `technicalSpecs.batteryCapacity` giảm dần trước khi giới hạn kết quả.
Chỉ chọn máy đang bán, còn hàng và có dung lượng pin lớn hơn 0; không yêu cầu tag `battery`.
Đây là xếp hạng theo mAh, không phải phép đo thời lượng pin thực tế. Nếu không đủ dữ liệu thì trả ít hơn 5 máy.
Luồng Function Calling theo [tài liệu Gemini](https://ai.google.dev/gemini-api/docs/function-calling).

Frontend `ChatbotWidget.jsx` gọi API qua `src/lib/api.js`, gửi tối đa 10 tin trước đó
và hiển thị câu trả lời cùng thẻ sản phẩm. Lịch sử chỉ giữ trong state; tải lại trang sẽ bắt đầu hội thoại mới.
