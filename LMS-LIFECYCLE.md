# Khai giảng, bế giảng và chứng nhận hoàn thành

Áp dụng chung sáu lớp CB-01/02/03, NC-01/02/03. Giaovien1/2/3 có quyền ngang
nhau, kể cả lớp không nằm trong phân công. Dùng phiên PHP, CSRF, ghi danh,
SQLite và SMTP hiện có; không có backend hay tài khoản thứ hai.

## Thao tác giáo viên

1. Mở http://127.0.0.1:8080/lop-hoc-cua-toi.html, chọn lớp, Ctrl+F5 nếu cần.
   Bấm **Bật chỉnh sửa**, đến **Thông báo**.
2. **Khai giảng**: chọn ngày học đầu tiên theo ngày trong tuần của lớp. Giờ bắt
   đầu lấy từ lịch hiện có (19:00–21:00), dùng múi giờ Việt Nam. Không chấp nhận
   buổi trong quá khứ hoặc sai lịch. Bấm **Khai giảng và gửi email**.
   Hệ thống lưu ngày giờ, chuyển trạng thái, đóng đăng ký ngay và xếp email cho
   các học sinh đang ghi danh đợt đó. Email ghi lớp đã mở, buổi đầu, lịch và giáo viên.
   Đây là thông báo có ngày bắt đầu được chọn, không cần cron chờ đến ngày đó.
3. **Bế giảng**: xác nhận hành động. Hệ thống tạo một chứng nhận cho mỗi học sinh
   đang ghi danh, chốt họ tên đăng ký (không dùng tên đăng nhập có tiền tố), tên
   khóa/lớp/đợt/ngày cấp/số chứng nhận. Ghi danh đợt này chuyển inactive nên học
   sinh không vào bài, tệp hoặc kiểm tra được nữa. Tài khoản, hồ sơ, bài làm và
   thông tin thanh toán không bị xóa. Email chúc mừng, công nhận hoàn thành và
   đính kèm giấy chứng nhận **PNG** tiếng Việt.
4. Sau bế giảng, đăng ký **vẫn đóng**. Khi cần, giáo viên bấm **Mở lại đăng ký**.
   Hệ thống tăng số đợt, cho hồ sơ mới vào đúng đợt mới. Học sinh đợt cũ không
   được tự khôi phục quyền học; muốn học lại phải có ghi danh mới hợp lệ. Hồ sơ
   chờ thanh toán/duyệt của đợt cũ không được cấp quyền vào đợt mới.
5. Khi lớp đang học, giáo viên vẫn có thể mở/đóng đăng ký thủ công cho cùng đợt.
   Không tự đổi ngày khai giảng đã gửi. Nội dung bài/tài liệu/đề lớp được giữ lại;
   giáo viên chủ động chuẩn bị nội dung và bài kiểm tra mới cho đợt tiếp theo.

Học sinh xem **Lớp học của tôi** để tải chứng nhận dù đợt học đã kết thúc. Giáo
viên cũng có mục **Chứng nhận đã cấp** trong Thông báo. Chứng nhận có dòng:
“Trung tâm chúc mừng và công nhận [họ tên] đã hoàn thành khóa học”. Không thêm
chữ ký, con dấu hoặc thông tin cơ quan chưa được cung cấp.

## Trạng thái email và tiếp tục khi lỗi

Quyết định lớp và danh sách người nhận được lưu transaction trước khi gửi thư.
Giao diện gửi lần lượt, một người nhận mỗi yêu cầu; mỗi học sinh nhận email
riêng, không lộ danh sách email cả lớp. Số thư được SMTP chấp nhận hiển thị riêng;
không khẳng định thư đã tới Inbox. Không có email gửi tự động khi chỉ mở trang.

Giữ trang mở để gửi hết hàng chờ. Nếu đóng trang/mất mạng, mở lại lớp → Bật chỉnh
sửa → **Lịch sử khai giảng / bế giảng và email** → **Tiếp tục gửi email**. Các thư
đã sent không bị gửi lại. Với lỗi, dùng **Thử gửi lại email lỗi**; giao diện hiển
thị nhóm lỗi SMTP/cấu hình/chứng nhận an toàn. Nếu mất phản hồi sau khi SMTP nhận
thư, trạng thái unknown cần kiểm tra hộp thư trước khi gửi lại vì SMTP không bảo
đảm exactly-once khi mất kết nối. Không tạo thêm chứng nhận hoặc gia hạn giữ chỗ.

Thư bế giảng và chứng nhận vẫn gửi/tải được sau khi mở lại đợt mới. Thông báo
khai giảng cũ không tiếp tục gửi khi đợt đã kết thúc. Nếu có ghi danh thiếu user,
họ tên hoặc email hợp lệ, xử lý lớp bị từ chối để tránh bỏ sót người nhận.

## Dữ liệu, API và quyền

- lifecycle-migration.sql + lmsInitLifecycle thêm lms_class_lifecycle,
  lms_class_events, lms_class_mail, lms_class_mail_retries, lms_certificates;
  cycle_id trên registrations/enrollments mặc định 1 cho dữ liệu cũ.
- Không tự tạo sự kiện/chứng nhận trong CSDL chính. Migration lặp an toàn,
  giữ bảng, ID và thông tin cũ. Chỉ thay index email giữ chỗ thành có cycle_id.
  Số chỗ tính các ghi danh active và giữ chỗ hợp lệ của đợt hiện tại; sức chứa 99.
- GET class_lifecycle&class_code=... chỉ giáo viên. POST class_transition gồm
  class_code/version/action/start_date, X-CSRF-Token và Idempotency-Key.
  action: start, complete, reopen, close_registration. Phiên bản cũ bị 409;
  replay cùng khóa trả cùng event, không tạo quyết định/chứng nhận trùng.
- POST class_send_mail gồm event_id/retry, kiểm tra admin/CSRF. Hàng chờ claim
  trong transaction và lease 5 phút chống hai người gửi cùng một thư. Retry có
  khóa riêng. Giới hạn mặc định xử lý lớp 10/phút/admin, gửi hàng chờ 360/phút/admin
  và 1080/phút/IP, đủ cho lớp 99 học sinh mà không bỏ rate-limit cũ.
- GET class_certificates (lọc class_code nếu cần): học sinh chỉ nhận của mình,
  giáo viên xem mọi lớp. GET class_certificate&id=... kiểm tra phiên và chủ sở
  hữu/quyền admin, trả attachment PNG. ID không tự cấp quyền; không có token URL.
- Giấy PNG lưu tại `certificates` cạnh SQLite, mặc định
  `D:\GitcloneMNM\.thvp-lms\certificates`. Tên tệp ngẫu nhiên không công khai.
  Tạo khi gửi/tải chứng nhận, có tệp tạm và đổi tên hoàn chỉnh; DB lưu bản chốt
  họ tên và số chứng nhận. Có thể tái tạo từ bản chốt nếu tệp bị thiếu.
- PHP cần GD/FreeType. start-local.ps1 bật GD cục bộ; phông Noto Sans kèm giấy
  phép OFL ở vendor/noto-sans. Không gọi dịch vụ tạo ảnh/chứng nhận bên ngoài.
- mail.php mở rộng tùy chọn attachment nội bộ; giữ TLS verification, cấu hình
  SMTP và cách gửi thư tài khoản hiện có. Không nhận tài khoản SMTP/recipient
  tùy ý từ frontend hoặc ghi mật khẩu/token vào log.

## Kiểm thử đã chạy

```powershell
python tests/test_lms_lifecycle_http.py
python tests/test_lms_lifecycle_http.py --browser
python tests/test_lms_learning_http.py
python tests/test_lms_access_http.py
python tests/test_lms_review_http.py
python tests/test_lms_payment_http.py
python tests/test_lms_mail_http.py
```

Dùng SQLite/thư mục tệp riêng và SMTP giả TLS+AUTH có CA thử, không gửi tiền,
email thật hoặc thao tác lớp thật. Kiểm tra: lịch bắt đầu, khóa đăng ký, quyền
ba admin/khách/học sinh/CSRF, idempotency và tranh chấp quyết định, email lỗi rồi
gửi lại, chứng nhận PNG đính kèm đúng chủ, chặn mọi API nội dung sau bế giảng,
truy cập ảnh riêng, đăng ký mới sau mở lại, hồ sơ/giữ chỗ đợt cũ không chen vào,
không đổi tài khoản/mật khẩu, SQLite integrity/foreign keys.

Edge desktop/mobile mô phỏng 1440/390px thực hiện chọn ngày → khai giảng →
bế giảng → học sinh tải chứng nhận → mở lại đăng ký. Học sinh không có nút xử
lý lớp và không đọc lớp đã bế giảng. Ảnh kiểm thử ở `.lms-lifecycle-checks` ngoài
webroot, gồm chứng nhận giả có tên “Nguyễn Văn Kiểm Thử”. Chưa kiểm tra điện
thoại vật lý hay xác nhận Inbox từ nhà cung cấp email thật trong lượt triển khai.
