# Admin LMS: đăng nhập và quản lý hồ sơ

Đã bổ sung duyệt thanh toán, yêu cầu bổ sung và từ chối theo
[LMS-REVIEW.md](LMS-REVIEW.md). Các phần đăng nhập/quyền bên dưới tiếp tục được sử dụng.
Mục **Kiểm tra email** cho riêng ba admin được bổ sung theo [LMS-MAIL.md](LMS-MAIL.md),
gửi thử thủ công qua SMTP cấu hình riêng; mục gửi thử độc lập với thao tác duyệt.

Bước cấp quyền riêng cho từng hồ sơ đã duyệt đã bổ sung theo
[LMS-ACCESS.md](LMS-ACCESS.md), gồm account/enrollment, email/gửi lại và đăng nhập
học sinh; bước duyệt vẫn không tự cấp quyền hoặc gửi thư hàng loạt.

## Khi trang đăng nhập không kết nối được

Trang đăng nhập phải dùng cùng máy chủ PHP với `lms-api.php`. URL cục bộ hiện tại:
http://127.0.0.1:8080/dang-nhap-admin.html?nguon=khoa-hoc.
Khi trang LMS được mở dưới dạng tệp, hai lựa chọn Giáo viên/Học sinh tự dẫn
sang máy chủ PHP cục bộ mặc định cổng 8080 trước khi nhập thông tin đăng nhập.
Các liên kết trên website HTTP/HTTPS vẫn dùng đúng máy chủ và cổng đang mở.
Không mở bằng đường dẫn `file:///...` hoặc Live Server. Client chặn gọi API từ
tệp cục bộ, phân biệt lỗi mạng/timeout/phản hồi không phải JSON và hiển thị lỗi
tiếng Việt. Trên máy cục bộ có liên kết mở đúng trang PHP khi kết nối lỗi;
liên kết không mang theo tên đăng nhập, mật khẩu hoặc token. Không gửi thông tin
đăng nhập sang máy chủ/cổng khác bằng cơ chế fallback và không nới CORS.

Chẩn đoán đã xác nhận PHP phục vụ đúng dự án ở `127.0.0.1:8080` và API session
trả JSON HTTP 200. Người dùng xác nhận mở index bằng tệp trên trình duyệt;
đã tái hiện lỗi API từ file URL trong Edge. Nên mở trang chủ bằng
http://127.0.0.1:8080/index.html để toàn bộ luồng dùng cùng phiên PHP. Kiểm thử client:
`node tests/test_lms_api_client.cjs`. Kiểm thử Edge với CSDL riêng:
`python tests/test_lms_learning_http.py --browser`.

## Tài khoản và nguồn xác thực

Trước bước này SQLite LMS chưa có bảng `users`. Đăng nhập cục bộ trong `auth.js`
dùng JavaScript/localStorage; `api.php`/`config.php` có bảng `users` MySQL và phiên
PHP, nhưng API hosting đang bị router local cách ly. Không gọi bộ khởi tạo MySQL
cũ vì nó có thao tác đặt lại tài khoản cũ. Các tệp và chức năng ngoài LMS được giữ nguyên.

Xác thực quản trị mới dùng **một bảng `users` trong SQLite hiện có**, API
`lms-api.php` và chính phiên `THVP_LMS_SESSION` đang dùng cho LMS. Không tạo
bảng admin_users, CSDL tài khoản khác hoặc cookie đăng nhập thứ hai.
Toàn website hiện dùng phiên này cho menu đăng nhập và kiểm tra quyền tính năng;
`auth.js` không còn đăng nhập mô phỏng bằng localStorage. Xem
[LMS-PERMISSIONS.md](LMS-PERMISSIONS.md). Dữ liệu localStorage không cấp quyền.

Migration tài khoản nằm trong `lms-server/auth.php`, được gọi trong transaction
của `lmsDB`. `lms_schema_migrations` đánh dấu `admin_accounts_v1` để không ghi
đè danh tính/quyền/mật khẩu mỗi lần tải trang. Ba danh tính yêu cầu:

| Tài khoản | Họ tên | Vai trò |
| --- | --- | --- |
| Giaovien1 | Tống Hoàng Thiên | admin |
| Giaovien2 | Nguyễn Thái Tuấn | admin |
| Giaovien3 | Trần Anh Khoa | admin |

Nếu đã có `users` tương thích, giữ mật khẩu của tài khoản tồn tại; chỉ thống nhất
tên/vai trò của ba danh tính trên ở lần migration đầu. Mật khẩu cũ lưu bằng
password_hash hoặc cột password được kiểm tra và nâng cấp hash sau đăng nhập đúng;
không đổi mật khẩu người dùng đang biết. Tài khoản khác không bị xóa/đổi tên/quyền.
Các admin thực khác nếu có vẫn có quyền admin theo CSDL, không dựa vào tên đặc biệt.

Ở lần kiểm kê ban đầu CSDL chính chỉ có ba admin trên, chưa đặt mật khẩu. Theo
tiến độ hiện tại cả ba đã đăng nhập được; bước xử lý hồ sơ giữ mật khẩu hiện có. Mã cũ có
admin mô phỏng `Giangvien`; giữ nguyên ở phần ngoài LMS, không cấp quyền LMS chỉ
vì localStorage ghi role admin. Chưa kiểm kê tài khoản thật trên MySQL hosting
do backend đó chưa được kết nối trong môi trường cục bộ.

## Đặt mật khẩu cục bộ

Từ `D:\GitcloneMNM\PTPMMNM-Tin-hoc-van-phong`, chạy lần lượt:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\set-admin-password.ps1 -Username Giaovien1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\set-admin-password.ps1 -Username Giaovien2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\set-admin-password.ps1 -Username Giaovien3
```

Công cụ hỏi hai lần bằng nhập ẩn. Mật khẩu mới tối thiểu 12 ký tự, tối đa
72 byte UTF-8 (giới hạn bcrypt). Không đặt mật khẩu trong mã JavaScript, tham số
dòng lệnh hoặc tệp tạm. PowerShell gửi JSON qua stdin tới công cụ PHP, lưu
`password_hash(..., PASSWORD_DEFAULT)` và chỉ báo tên tài khoản đã cập nhật.
Không có mật khẩu mặc định; tài khoản mới chưa đặt mật khẩu không đăng nhập được.

Kiểm kê mà không in mật khẩu/hash:

```powershell
& "$env:LOCALAPPDATA\THVP\php\php.exe" .\lms-server\admin-accounts.php list
```

Đổi mật khẩu qua công cụ sẽ làm phiên quản trị cũ mất quyền ở yêu cầu tiếp theo.
Công cụ không tạo danh tính tùy ý hoặc tự bật lại tài khoản đã bị vô hiệu hóa.

## API và quyền

- `GET action=auth_user`: danh tính từ phiên PHP và CSDL, hoặc null.
- `POST action=auth_login`: JSON `username`, `password`, cần `X-CSRF-Token` lấy
  từ action session. Có giới hạn 10 yêu cầu/phút/phiên và 60/phút/IP.
- `POST action=auth_logout`: cần CSRF; chỉ bỏ danh tính quản trị trong phiên.
- `GET action=admin_registrations`: admin; lọc `class_code`, `status`, phân trang
  `page`, `page_size` (1–50, mặc định 20).
- `GET action=admin_registration&reference=DK000123`: admin; chi tiết, snapshot
  thanh toán đã có, ảnh và lịch sử. Không tạo snapshot hoặc QR mới khi xem.
- `GET action=evidence_image&class_code=...&id=...`: handler cũ, nhận quyền admin
  thực từ phiên/CSDL hoặc quyền chủ hồ sơ bằng cookie token hiện có.

Mỗi request kiểm tra user ID, hash thông tin xác thực, hạn phiên 8 giờ, active và
role trong CSDL. Không tin role/username/id được thêm vào query/body. Đăng nhập
và đăng xuất xoay session ID, giữ CSRF, guest_secret và cookie truy cập hồ sơ.
Không gọi localStorage.clear(), không xóa các cookie hồ sơ. Phiên học sinh không
được đọc API quản trị; cả ba admin có quyền ngang nhau với mọi lớp.

Danh sách/chi tiết không trả password_hash, token, access_hash, request_hash,
owner_hash, payload_hash hoặc đường dẫn lưu ảnh. Bộ lọc trạng thái sử dụng cùng
quy tắc trạng thái như luồng người đăng ký. API đọc vẫn chỉ đọc hồ sơ; thao tác
thay đổi được tách thành action `admin_review` có CSRF, transaction và kiểm tra phiên bản.

## Mở và kiểm thử

- Đăng nhập: `http://127.0.0.1:8080/dang-nhap-admin.html`
- Quản lý: `http://127.0.0.1:8080/quan-ly-dang-ky.html`
- Trang LMS giữ nguyên hai nút Giới thiệu/Khóa học; admin đã đăng nhập có mục
  Quản lý đăng ký và Đăng xuất từ phiên thực trên các trang LMS.

```powershell
python tests/test_lms_admin_http.py
node tests/test_lms_admin_frontend.cjs
python tests/test_lms_http.py
python tests/test_lms_payment_http.py
python tests/test_lms_evidence_http.py
node tests/test_lms_frontend.cjs
node tests/test_lms_payment_frontend.cjs
node tests/test_lms_evidence_frontend.cjs
```

HTTP tests dùng CSDL/thư mục ảnh riêng: ba admin, tài khoản học sinh/old admin thử,
đăng nhập/đăng xuất, quyền nhiều lớp, bộ lọc/phân trang/ảnh/no-image, chống giả role,
đổi quyền/mật khẩu từ CSDL, giữ cookie chủ hồ sơ và integrity/foreign keys. Mật
khẩu thử chỉ có ở môi trường tạm. Hồi quy xác nhận đăng ký/QR/minh chứng không
tạo thêm users ngoài ba danh tính admin được seed chủ động trong migration.

Kiểm thử frontend dùng DOM/API mô phỏng; chưa thay thế kiểm thử trình duyệt máy
tính/điện thoại. Bước duyệt đã bổ sung riêng theo LMS-REVIEW.md; chưa cấp tài
khoản học sinh, ghi danh hoạt động hoặc gửi email cho hồ sơ đã duyệt.
