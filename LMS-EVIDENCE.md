# Minh chứng chuyển khoản LMS

Đã bổ sung chọn/xem trước JPG/PNG, gửi minh chứng, xem ảnh riêng tư và lịch sử các
lần bổ sung. Đã nối màn hình xử lý admin theo [LMS-REVIEW.md](LMS-REVIEW.md):
yêu cầu bổ sung cho phép ảnh mới, hồ sơ đã duyệt/từ chối không nhận thêm ảnh.
Gửi ảnh không tự xác nhận nhận tiền, cấp tài khoản hoặc gửi email.

## Chạy PHP và cấu hình upload

PHP dùng `%LOCALAPPDATA%\THVP\php\php.exe`. Máy hiện có `php_gd.dll` nhưng cấu hình
PHP chưa bật GD. Launcher mới bật `extension=gd` chỉ cho tiến trình PHP đó và đặt
`display_errors=0` từ lúc khởi động để cảnh báo POST quá lớn không làm hỏng JSON.
Không sửa `php.ini` toàn máy hoặc thông tin ngân hàng.

Giới hạn PHP đã kiểm tra: `upload_max_filesize=6M`, `post_max_size=8M`.
Ứng dụng vẫn từ chối ảnh lớn hơn **5 × 1024 × 1024 byte**. Không cần đổi các giới
hạn hiện có. Nếu dùng PHP khác, cần `upload_max_filesize >= 5M`, `post_max_size >= 6M`,
`fileinfo`, `pdo_sqlite`, `mbstring`, GD có JPEG/PNG. API sẽ báo rõ nếu chưa đủ.

Sau khi cập nhật launcher, khởi động lại máy chủ đúng dự án:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1
```

Kiểm tra riêng cấu hình ảnh bằng:

```powershell
& "$env:LOCALAPPDATA\THVP\php\php.exe" -d extension=gd .\lms-server\check-evidence.php
```

## Dữ liệu và quyền truy cập

Ảnh mặc định nằm tại `D:\GitcloneMNM\.thvp-lms\evidence`, bên ngoài webroot.
Nếu đổi `THVP_LMS_DB`, ảnh mặc định ở thư mục `evidence` cạnh SQLite tương ứng.
Có thể đặt `THVP_LMS_EVIDENCE_DIR` thành đường dẫn tuyệt đối khác ngoài webroot.
Đường dẫn ảnh đặt trong webroot hoặc liên kết tượng trưng bị từ chối.

Bảng `lms_evidence` mới liên kết `registration_id` tới hồ sơ. Mỗi lần gửi mới lưu
một ảnh với tên ngẫu nhiên 256-bit, MIME, kích thước đã lưu, SHA-256 ảnh gốc,
hash request key, thời điểm và phân loại đúng hạn/muộn. Không lưu tên tệp người gửi.
Migration `CREATE TABLE IF NOT EXISTS` không sửa/xóa các dòng hồ sơ, ngân hàng,
tài khoản hoặc ảnh cũ.

Ảnh đi qua fileinfo, kiểm tra kích thước/đuôi, getimagesize, kiểm tra kết thúc tệp
và giải mã GD. Chỉ JPEG/PNG được nhận. Ảnh được mã hóa lại để bỏ metadata/nội dung
ngoài ảnh. JPEG lưu chất lượng 90; nội dung nhìn thấy được giữ, không giữ nguyên
byte/metadata EXIF. Ảnh tối đa 16 triệu điểm ảnh, chiều tối đa 8192 và phải nằm
trong ngân sách bộ nhớ PHP; ảnh quá lớn có hướng dẫn giảm độ phân giải.

- `GET lms-api.php?action=evidence&class_code=CB-01`: danh sách ảnh, thời điểm,
  trạng thái hồ sơ, khả năng gửi và trạng thái cấu hình upload.
- `POST lms-api.php?action=evidence_upload&class_code=CB-01`: multipart với trường
  `image`; cần cookie token hồ sơ, `X-CSRF-Token`, `Idempotency-Key` và
  `X-LMS-Registration` bằng mã hồ sơ hiện đang xem. Mã này chỉ chống gắn nhầm hồ
  sơ khi cookie thay đổi giữa các tab, không cấp quyền xem/gửi.
- `GET lms-api.php?action=evidence_image&class_code=CB-01&id=...`: handler trả
  ảnh sau khi kiểm tra token và ID ảnh thuộc đúng hồ sơ. Không có URL ảnh công
  khai; đoán ID hoặc nhập cùng email/điện thoại không đọc được ảnh. Không đưa
  token lên URL. Ảnh trả với no-store, nosniff và Content-Type JPEG/PNG cố định.

Gửi lặp cùng request key/ảnh hoặc chọn lại đúng byte ảnh cũ trả ảnh đã lưu, không
thêm bản ghi. Ảnh khác cần request key mới; giao diện tự tạo khi chọn ảnh mới.
Khi lỗi có thể thử lại, giao diện giữ File, preview và request key. Mỗi phiên có
10 yêu cầu upload mới/phút, mỗi IP 60/phút, dùng helper và bảng giới hạn hiện có.
Các lần phát lại hợp lệ không bị tính như lần gửi ảnh mới.

Ảnh đã giải mã được ghi vào kho riêng, sau đó insert metadata và cập nhật trạng
thái trong `BEGIN IMMEDIATE`. Chỉ trả thành công khi tệp và transaction đã lưu.
Nếu transaction thất bại, chỉ tệp vừa tạo bị dọn; không ghi đè/xóa ảnh cũ.

## Trạng thái và sức chứa

- Hồ sơ còn lượt giữ chỗ hợp lệ tại lúc lưu: `pending_review`, hiển thị
  **Chờ đối chiếu thanh toán**. Trạng thái này tiếp tục tính một chỗ dù
  `expires_at` ban đầu đã qua. Ảnh bổ sung vẫn thuộc lượt giữ chỗ đó.
- Hồ sơ đã hết hạn: hiển thị `late_review`, **Minh chứng nộp muộn — chờ kiểm tra**.
  Để giữ nguyên CHECK constraint/schema cũ, trạng thái này lưu bằng `status=expired`
  cùng `proof_submitted_at` khác NULL; lịch sử ảnh ghi `timeliness=late`.
  API chuẩn hóa thành `late_review`. Không giữ thêm chỗ, kể cả lớp còn chỗ;
  không cam kết người nộp muộn được nhận học.

Số chỗ vẫn là 99 trừ ghi danh active, pending_payment chưa hết hạn và
pending_review. Hồ sơ expired có minh chứng không tham gia tổng giữ chỗ.
Không có insert users/ghi danh active hoặc xác nhận thanh toán trong luồng này.
Các ảnh được bổ sung theo lịch sử, không thay ảnh cũ. QR không tiếp tục được cung
cấp sau khi hồ sơ chuyển sang chờ đối chiếu hoặc kiểm tra minh chứng muộn.

## Kiểm thử

```powershell
python tests/test_lms_evidence_http.py
node tests/test_lms_evidence_frontend.cjs
python tests/test_lms_http.py
python tests/test_lms_payment_http.py
node tests/test_lms_frontend.cjs
node tests/test_lms_payment_frontend.cjs
```

HTTP tests chạy hai PHP process với GD, SQLite/thư mục ảnh tạm riêng, ảnh màu do
GD tạo ra; không dùng giao dịch thật và không ghi ảnh/hồ sơ thử vào CSDL chính.
Bao gồm lỗi upload/giả ảnh, quyền ảnh, idempotency đồng thời, lỗi CSDL dọn tệp,
giữ chỗ đúng hạn/muộn, rate limit và integrity/foreign keys. Các bản ghi active
để mô phỏng lớp đủ 99 chỉ có trong CSDL thử.

Kiểm thử JavaScript dùng DOM/API mô phỏng, tách biệt với HTTP. Chưa xác nhận thao
tác giao diện thực tế trên trình duyệt máy tính/điện thoại.

Mở `http://127.0.0.1:8080/dang-ky-khoa-hoc.html?lop=CB-01` trong trình duyệt có
cookie hồ sơ. Bên dưới phần thanh toán, chọn ảnh, kiểm tra preview rồi bấm
**Gửi minh chứng**. Kết quả lưu và ảnh cũ được hiển thị tại **Ảnh đã gửi**;
**Tải lại danh sách ảnh** chỉ đọc lại lịch sử, không tạo hồ sơ mới.
