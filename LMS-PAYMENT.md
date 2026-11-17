# Chuyển khoản và QR cho hồ sơ LMS

## Điền tài khoản nhận tiền

Tệp mẫu **trống** trong dự án:
`D:\GitcloneMNM\PTPMMNM-Tin-hoc-van-phong\lms-server\payment-config.example.json`.

Vị trí cấu hình thật mặc định:
`D:\GitcloneMNM\.thvp-lms\payment-config.json` (cạnh SQLite, ngoài thư mục web).
Tạo bản sao mẫu ở vị trí này rồi tự điền bốn trường JSON dưới dạng chuỗi:

- `bank_name`: tên ngân hàng.
- `bank_bin`: mã BIN NAPAS gồm đúng 6 chữ số của ngân hàng nhận.
- `account_number`: số tài khoản; giữ số 0 đầu, không có khoảng trắng, tối đa
  19 ký tự chữ/số theo trường tài khoản của VietQR.
- `account_name`: tên chủ tài khoản đúng thông tin ngân hàng.

Ví dụ thao tác tạo bản sao mẫu, không ghi đè nếu đã có cấu hình:

```powershell
New-Item -ItemType Directory -Force -Path 'D:\GitcloneMNM\.thvp-lms'
if (-not (Test-Path -LiteralPath 'D:\GitcloneMNM\.thvp-lms\payment-config.json')) {
    Copy-Item -LiteralPath '.\lms-server\payment-config.example.json' -Destination 'D:\GitcloneMNM\.thvp-lms\payment-config.json'
}
```

Lưu UTF-8 **không BOM** và kiểm tra cú pháp JSON. Không có tài khoản giả mặc định.
Nếu tệp thiếu, trống hoặc sai định dạng, trang chỉ báo
“Thông tin thanh toán chưa được cấu hình”, không hiển thị QR/thông tin chuyển tiền.
Mã ngân hàng phải được người quản trị kiểm tra đúng với ngân hàng nhận; chức năng
này không gọi dịch vụ xác minh danh tính chủ tài khoản.

Có thể đặt biến môi trường `THVP_LMS_PAYMENT_CONFIG` thành đường dẫn tuyệt đối tới
tệp JSON khác ngoài thư mục web rồi khởi động lại PHP. Nếu dùng `THVP_LMS_DB` để
đổi CSDL, cấu hình mặc định nằm cùng thư mục với CSDL đó. Các kiểm thử luôn đặt
cả hai đường dẫn về thư mục tạm riêng.

Nếu giữ đường dẫn mặc định, máy chủ đang chạy đọc cấu hình ở yêu cầu tiếp theo;
không cần khởi động lại chỉ để sửa nội dung JSON. Lần mở thanh toán đầu tiên với
cấu hình hợp lệ lưu tài khoản nhận vào `lms_payments`. Sửa/xóa cấu hình sau đó
**không đổi tài khoản nhận của hồ sơ đã có snapshot**. Hồ sơ chưa bắt đầu thanh
toán sẽ dùng cấu hình hợp lệ tại lần mở đầu tiên. Không có chức năng đổi snapshot
của hồ sơ cũ trong bước này.

## API và dữ liệu

Kiểm tra cấu hình bằng chính PHP mà không mở CSDL và không in dữ liệu tài khoản/token:

```powershell
& "$env:LOCALAPPDATA\THVP\php\php.exe" .\lms-server\check-payment-config.php
```

Kết quả chỉ hiển thị đường dẫn, khả năng đọc, trạng thái hợp lệ và tên trường/lỗi
JSON cần sửa. Trang thanh toán cũng hiển thị lỗi cấu hình cụ thể cho người đã có
quyền truy cập hồ sơ. Launcher in thư mục dự án và kết quả kiểm tra khi khởi động.
Nếu PowerShell chặn chạy script, có thể dùng chính sách chỉ cho tiến trình này:
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1`.
Không cần đổi chính sách PowerShell toàn máy.

`POST lms-api.php?action=payment&class_code=CB-01` cần cookie HttpOnly quyền truy
cập hồ sơ hiện có và header `X-CSRF-Token`. Body không cần dữ liệu, dùng `{}`.
Số tiền, mã hồ sơ, nội dung, khóa/lớp và hạn giữ chỗ lấy từ hồ sơ lưu trên máy chủ.
Mã hồ sơ/email/điện thoại không cấp quyền xem thanh toán. API không tạo hồ sơ,
không tạo lượt giữ chỗ mới, không đổi `expires_at`, không xác nhận thanh toán.

Migration bổ sung bảng `lms_payments` có khóa chính/FK `registration_id` và
snapshot `bank_name`, `bank_bin`, `account_number`, `account_name`, `currency`,
`created_at`. Migration lặp lại không thay đổi snapshot hoặc các bảng dữ liệu cũ.
Chụp snapshot và kiểm tra quyền/trạng thái chạy trong `BEGIN IMMEDIATE`.

Chỉ hồ sơ `pending_payment`, chưa có minh chứng và còn hạn giữ chỗ mới nhận QR.
Hồ sơ hết hạn, hủy, chờ đối chiếu hoặc đã ghi danh không nhận QR/tài khoản hướng
dẫn thanh toán từ API này. Giao diện dùng giờ máy chủ và đồng hồ đơn điệu để đếm
ngược; khi hết hạn sẽ xóa QR, ẩn hướng dẫn/sao chép/tải PNG và cập nhật trạng thái.
Tải PNG và thử lại đều kiểm tra API quyền/trạng thái, không tạo hồ sơ khác.

QR là chuỗi VietQR/NAPAS account transfer: GUID `A000000727`, `QRIBFTTA`, BIN,
tài khoản, số tiền VND, nội dung chuyển khoản và CRC16-CCITT-FALSE. Không chứa họ
tên người học, email, điện thoại hoặc token. Tên chủ tài khoản hiển thị bên cạnh;
ứng dụng ngân hàng xác định người nhận từ BIN/tài khoản khi quét.

QR được vẽ **cục bộ trong trình duyệt** bằng [Nayuki QR Code generator](https://www.nayuki.io/page/qr-code-generator-library),
với viền trắng bốn module, xuất PNG bằng canvas. Thư viện và giấy phép nằm trong
`vendor/nayuki`; không dùng CDN hoặc gửi dữ liệu thanh toán tới dịch vụ QR ngoài.
Tham khảo cấu trúc VietQR: [mã nguồn và tài liệu của Subiz](https://github.com/subiz/vietqr).

Nếu vẽ QR lỗi, tài khoản và hướng dẫn chuyển khoản thủ công vẫn hiển thị khi hồ
sơ đủ điều kiện. Quét hoặc tải QR không làm đổi trạng thái thanh toán. PNG đã tải
trước đó là ảnh tĩnh và không thể thu hồi trong ứng dụng ngân hàng; sau khi hết
hạn, website không tiếp tục cung cấp hay hướng dẫn dùng ảnh đó. Không chuyển tiền
thử trong quá trình kiểm thử phần mềm.

## Chạy và kiểm thử

```powershell
.\start-local.ps1
python tests/test_lms_payment_http.py
python tests/test_lms_http.py
node tests/test_lms_payment_frontend.cjs
node tests/test_lms_frontend.cjs
```

Mở `http://127.0.0.1:8080/dang-ky-khoa-hoc.html?lop=CB-01` bằng trình duyệt đã có
cookie hồ sơ, hoặc tạo hồ sơ mới qua luồng thông thường. Việc tải lại chỉ khôi
phục hồ sơ và mở thanh toán cho hồ sơ đó.

Kiểm thử HTTP dùng ngân hàng và SQLite tạm riêng; không ghi tài khoản thử/hồ sơ
thử vào dữ liệu chính và không chuyển tiền. `qr_roundtrip.cjs` dùng chính thư viện
và hàm vẽ production qua canvas mô phỏng, mã hóa PNG, đọc lại pixel PNG rồi giải
mã độc lập bằng [jsQR](https://github.com/cozmo/jsQR), đối chiếu TLV, số tiền,
nội dung và CRC. jsQR chỉ phục vụ kiểm thử, không được tải trong website.
Kiểm thử giao diện JavaScript dùng DOM/API mô phỏng; chưa kiểm thử thao tác thực
tế trên trình duyệt hoặc quét bằng ứng dụng ngân hàng.

Tải/xem minh chứng và trạng thái chờ đối chiếu đã bổ sung theo
[LMS-EVIDENCE.md](LMS-EVIDENCE.md). Xử lý admin đã bổ sung theo
[LMS-REVIEW.md](LMS-REVIEW.md). Chưa cấp tài khoản, ghi danh hoạt động hoặc gửi email.
