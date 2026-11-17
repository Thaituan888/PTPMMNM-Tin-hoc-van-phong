# LMS: hồ sơ đăng ký và giữ chỗ

Phân quyền toàn website và tự hiện lớp theo phiên đăng nhập:
[LMS-PERMISSIONS.md](LMS-PERMISSIONS.md).

Vòng đời lớp (Khai giảng → Bế giảng → Mở lại đăng ký), hàng chờ email và giấy
chứng nhận hoàn thành: [LMS-LIFECYCLE.md](LMS-LIFECYCLE.md).

Học phí hiện tại: cơ bản 1.500.000đ, nâng cao 2.500.000đ. Migration
advanced_fee_2500000_v1 cập nhật ba lớp NC-01/02/03 một lần, không đổi giá hoặc
thông tin chuyển khoản đã chốt của hồ sơ cũ. QR lấy giá từ hồ sơ, không từ trình
duyệt. Cấu hình ngân hàng ở `.thvp-lms/payment-config.json` ngoài webroot;
check-payment-config.php báo đường dẫn thực tế và kiểm tra an toàn. Hồ sơ đã có
snapshot ngân hàng giữ tài khoản cũ khi sửa cấu hình; hồ sơ mới dùng cấu hình mới.

Chạy từ PowerShell trong thư mục dự án:

```powershell
.\start-local.ps1
```

Mở `http://127.0.0.1:8080/khoa-hoc-lms.html`, hoặc
`http://127.0.0.1:8080/dang-ky-khoa-hoc.html?lop=CB-01`.
Không dùng Live Server cho bước có lưu hồ sơ.

Bấm **Đăng ký lớp này** từ lịch lớp mở `dang-ky-khoa-hoc.html?lop=...&dang-ky=moi`:
luôn bắt đầu bằng biểu mẫu trống, không tự tải QR/minh chứng của hồ sơ cũ.
Nếu trình duyệt có hồ sơ trước đó, chỉ hiện nút **Xem hồ sơ đã có**; bấm nút
này mới mở lại thông tin cũ. Trang hồ sơ cũ cũng có liên kết mở biểu mẫu mới.
Chỉ sau khi xác nhận và Tạo hồ sơ mới gửi POST register; thành công bỏ tham số
đăng ký mới để tải lại khôi phục đúng hồ sơ vừa tạo. Khóa gửi lặp của biểu mẫu
mới tách với hồ sơ trước. Không xóa hồ sơ, minh chứng, cookie hoặc tự gia hạn
giữ chỗ khi mở biểu mẫu. Email trùng đang giữ chỗ vẫn bị backend kiểm tra.

Điều hướng LMS đã gom thống nhất trên trang giới thiệu, đăng ký, đăng nhập,
quản lý và cả sáu lớp: góc phải header có menu **Tài khoản**, bên trong có tên,
lớp học, các mục quản lý theo quyền và Đăng xuất. Không còn thanh tài khoản lớn
với nhiều liên kết lặp trong phần nội dung. Khách chỉ thấy nút Đăng nhập dẫn về
chọn Giáo viên/Học sinh. Logo về trang chủ; mỗi trang con giữ một liên kết quay
lại theo ngữ cảnh. Menu dùng bàn phím được, Escape/bấm ngoài để đóng, không
thay phiên, CSRF hoặc quyền API. Thử sau khi tải mới bằng Ctrl+F5.

Launcher dùng `%LOCALAPPDATA%\THVP\php\php.exe`. PHP cần `pdo_sqlite`,
`session`, `mbstring`. Không tìm thấy launcher cũ trong checkout này nên đã thêm
`start-local.ps1`. Các tệp `api.php`, `config.php` và backend tài khoản không thay đổi.
Router cục bộ trả 503 cho API hosting để không kết nối MySQL; các tệp nguồn và
chức năng hosting hiện có vẫn được giữ nguyên. Không có bước gửi email trong API LMS.

## Lưu trữ và API

SQLite mặc định: thư mục `.thvp-lms` nằm **cạnh** thư mục dự án, không nằm trong
thư mục web. Có thể đặt `THVP_LMS_DB` thành đường dẫn tuyệt đối khác ở ngoài
thư mục web. Module từ chối đường dẫn SQLite nằm trong thư mục web.
Cookie phiên LMS tách riêng phiên tài khoản; dữ liệu phiên cũng ở thư mục riêng này.
Khi triển khai hosting, chỉ đặt mã nguồn dự án làm document root, không công khai
thư mục cha. Khi chạy cục bộ phải dùng router của launcher.

`lms-server/migration.sql` chạy lặp lại trong transaction, chỉ tạo bảng/index LMS
nếu chưa có. `classes.json` cung cấp sáu lớp ban đầu. Không ghi đè cờ đóng/mở
hoặc dữ liệu lớp đã có khi chạy lại. Vì checkout chưa có quy tắc bắt buộc ngày
khai giảng, sáu lớp ban đầu mở đăng ký; `opening_date` giữ NULL.
`lms_classes.registration_open=0` đóng đăng ký một lớp.

- `GET lms-api.php?action=session`: cấp CSRF cho khách.
- `GET lms-api.php?action=classes`: thông tin máy chủ và số chỗ thực tế.
- `POST lms-api.php?action=register`: JSON gồm `class_code`, `fullname`, `phone`,
  `email`; cần `X-CSRF-Token` và `Idempotency-Key` (32–128 ký tự ngẫu nhiên).
- `GET lms-api.php?action=registration&class_code=CB-01`: đọc hồ sơ bằng cookie
  truy cập riêng; mã lớp/email/mã hồ sơ không cấp quyền truy cập.

Bảng: `lms_classes`, `lms_registrations`, `lms_enrollments`, `lms_rate_limits`.
Tạo hồ sơ không thêm tài khoản hay dòng ghi danh. `lms_enrollments` chuẩn bị cho
bước ghi danh sau này. Nguồn học phí, sức chứa, giáo viên/lịch là CSDL máy chủ,
không phải giá trị gửi từ trình duyệt. Hồ sơ lưu snapshot lớp và học phí lúc tạo.
Mã `DK` dùng khóa SQLite AUTOINCREMENT, không phụ thuộc sức chứa 99 và không
có API xóa hồ sơ. Mã chuyển khoản là mã lớp + mã hồ sơ.

Giữ chỗ mặc định 1800 giây, cấu hình bằng `THVP_LMS_HOLD_SECONDS` (1–86400).
Số chỗ = 99 trừ ghi danh active và hồ sơ pending_payment chưa hết hạn hoặc
pending_review. Hồ sơ pending_payment chưa gửi minh chứng hết hạn được loại
khỏi số chỗ ngay cả khi chưa có tác vụ dọn nền; lần tạo tiếp theo cập nhật trạng
thái expired. Tải minh chứng đúng hạn chuyển sang pending_review cùng
proof_submitted_at trong transaction. Duyệt/yêu cầu bổ sung tiếp tục dùng giữ chỗ
này; nộp muộn không giữ chỗ đến khi được duyệt và còn sức chứa. Chi tiết xem các
tài liệu minh chứng/xử lý ở cuối trang.

`BEGIN IMMEDIATE` bảo vệ kiểm tra email/sức chứa và lưu hồ sơ. Giới hạn gửi mới:
10 yêu cầu/phút/phiên và 60 yêu cầu/phút/IP. Replay hợp lệ trả lại cùng hồ sơ.
Request key được lưu sessionStorage để thử lại sau mất kết nối; không lưu hồ sơ
hay token vào localStorage. Tải lại chỉ GET hồ sơ, không POST tự động.

Quyền truy cập là token 256-bit dẫn xuất bằng HMAC từ bí mật phiên CSPRNG
256-bit và request key, cho phép phát lại cùng quyền khi mất phản hồi. SQLite
chỉ lưu SHA-256 của token. Token được gửi trong cookie HttpOnly, SameSite=Strict,
Secure khi dùng HTTPS; không nằm trong URL hay JSON. Không chia sẻ cookie.
Chỉ người giữ cookie đọc được hồ sơ; cùng email hoặc cùng request key ở phiên
khác không trả về thông tin cá nhân. Khôi phục quyền trên thiết bị khác chưa làm.

## Kiểm thử

```powershell
python tests/test_lms_http.py
node tests/test_lms_frontend.cjs
```

HTTP tests tự chạy hai PHP server, dùng SQLite tạm ngoài web root, dừng server
và xóa CSDL thử khi xong. Không dùng CSDL chính. Các dòng ghi danh phục vụ kiểm
thử sức chứa chỉ có trong CSDL thử. Phần frontend kiểm tra logic với DOM/API mô
phỏng; chưa thay thế kiểm thử giao diện trực tiếp trên trình duyệt.

Thông tin chuyển khoản và QR đã bổ sung theo [LMS-PAYMENT.md](LMS-PAYMENT.md).
Tải/xem ảnh minh chứng và trạng thái chờ đối chiếu đã bổ sung theo
[LMS-EVIDENCE.md](LMS-EVIDENCE.md), gồm API, kho ảnh riêng và kiểm thử.
Đăng nhập admin và màn hình quản lý đã bổ sung theo [LMS-ADMIN.md](LMS-ADMIN.md).
Duyệt thanh toán, yêu cầu bổ sung, từ chối và lịch sử xử lý đã bổ sung theo
[LMS-REVIEW.md](LMS-REVIEW.md), với kiểm tra phiên bản, giao dịch trùng và sức chứa.
Thao tác duyệt chuyển sang chờ cấp quyền; bước cấp tài khoản/ghi danh/email riêng
được mô tả bên dưới. Giữ mật khẩu hiện có của ba admin.

Cấu hình SMTP riêng và gửi email thử thủ công từ admin đã bổ sung theo
[LMS-MAIL.md](LMS-MAIL.md). Mục gửi thử không cấp tài khoản hoặc ghi danh.
Cấu hình mẫu mặc định tắt; người quản lý tự nhập thông tin thật
và bấm gửi thử đến email của mình.

Đã bổ sung thao tác **Cấp quyền học và gửi email** riêng cho từng hồ sơ đã duyệt,
gửi lại qua hàng chờ mã hóa, đăng nhập học sinh/đổi mật khẩu tạm và **Lớp học của tôi**.
Chi tiết API, migration, khóa mã hóa, giới hạn và môi trường thử trình duyệt riêng
ở [LMS-ACCESS.md](LMS-ACCESS.md). Không tự cấp quyền cho hồ sơ cũ; nội dung học tập
được bổ sung riêng theo phần dưới.

Khung lớp dùng chung giáo viên/học sinh, chỉnh sửa thông tin chung/liên kết
online, chủ đề ẩn/hiện/sắp xếp và bài văn bản nháp/xuất bản đã bổ sung theo
[LMS-LEARNING.md](LMS-LEARNING.md). Tái sử dụng trang lớp và ghi danh hiện có;
chưa có tệp, bài tập, điểm danh hoặc trắc nghiệm.
