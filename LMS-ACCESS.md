# Cấp quyền học, email và đăng nhập học sinh

Trang lớp đã được mở rộng thành khung học tập dùng chung, có chủ đề và bài văn
bản theo [LMS-LEARNING.md](LMS-LEARNING.md). Các bước tài khoản/ghi danh/email dưới
đây tiếp tục được sử dụng; trạng thái trống chỉ còn ở lớp/chủ đề chưa có bài xuất bản.

Đã nối thao tác riêng cho từng hồ sơ đã xác nhận thanh toán/duyệt. Không quét hay
tự cấp quyền/gửi thư cho các hồ sơ cũ. Giữ nguyên SMTP, tài khoản/mật khẩu admin,
thanh toán, ảnh và lịch sử duyệt hiện có.

## Dùng trên giao diện

### Học sinh tự đổi mật khẩu (tùy chọn)

Email mới có liên kết **Đổi mật khẩu ngay (tùy chọn)** đến
`dang-nhap-hoc-sinh.html?doi-mat-khau=1`. Học sinh đăng nhập bằng thông tin trong
email rồi nhập mật khẩu hiện tại, mật khẩu mới và xác nhận. Trong mọi trang LMS
cũng có **Tài khoản → Đổi mật khẩu** cho học sinh. Có thể chọn **Vào lớp, đổi mật
khẩu sau**; không bắt buộc đổi mật khẩu được cấp. Tài khoản cũ có cờ yêu cầu đổi
vẫn phải hoàn thành bước đó, không có lối bỏ qua.

API student_change_password dùng lại phiên PHP/CSRF và xác minh mật khẩu hiện tại,
cho phép học sinh active tự đổi kể cả must_change_password=0. Mật khẩu mới khác
mật khẩu cũ, ít nhất 12 ký tự, tối đa 72 byte UTF-8. Chỉ lưu hash; phiên hiện tại
được cập nhật sau đổi, các phiên cũ bị vô hiệu hóa. Không thay username/ghi danh,
không gửi lại mật khẩu tự chọn qua email. Từ chối đổi khi email cấp thông tin đang
gửi; xóa thư mật khẩu cũ đang chờ để không gửi thông tin đã hết hiệu lực.

### Email cũ không có mật khẩu / tài khoản kiểu HV...

Nguyên nhân: hồ sơ dùng lại email đã có tài khoản nên thư chỉ thông báo lớp,
không thể đọc lại mật khẩu từ password_hash. Không tạo thêm hồ sơ hoặc tài khoản
để sửa trường hợp này. Admin mở hồ sơ đã ghi danh → **Cấp lại thông tin đăng nhập
và gửi email**, xác nhận thao tác. Tên cũ kiểu HV được chuyển sang số ngẫu nhiên
+ họ tên; tài khoản đã đúng dạng giữ nguyên username. Hệ thống cấp mật khẩu mới,
hash thay thế mật khẩu cũ, must_change_password=0 và gửi thư có cả tên/mật khẩu.
Mật khẩu cũ và phiên cũ của tài khoản ở mọi lớp mất hiệu lực; giữ user_id và các
ghi danh. Không sửa tài khoản admin. Đây là thao tác rõ ràng của admin, không tự
đặt lại mật khẩu khi học sinh đăng ký thêm lớp.

Nếu SMTP lỗi, dùng **Gửi lại email** để gửi cùng mật khẩu đang chờ được mã hóa,
không tiếp tục cấp lại. Chống replay và hai admin thao tác đồng thời bằng khóa
yêu cầu, revision và transaction. Kiểm tra vai trò, CSRF, email duy nhất, active
enrollment; từ chối khi một thư của tài khoản đang được gửi. Hủy thư mật khẩu
cũ đang chờ ở các hồ sơ khác của cùng tài khoản để không gửi bí mật đã hết hiệu lực.
API mới POST admin_reissue_credentials nhận reference/version và Idempotency-Key,
không trả mật khẩu. Mật khẩu chờ gửi mã hóa bằng khóa ngoài webroot và xóa sau
khi SMTP chấp nhận. Không gửi thư thật trong kiểm thử.

### Cấp quyền lần đầu

1. Đăng nhập một trong ba admin hiện có tại
   http://127.0.0.1:8080/dang-nhap-admin.html.
2. Mở http://127.0.0.1:8080/quan-ly-dang-ky.html, chọn **Xem chi tiết** của hồ sơ
   **Đã duyệt — chờ cấp quyền học**. Bấm **Cấp quyền học và gửi email** và xác nhận.
3. Trang tải lại trạng thái ghi danh, tên đăng nhập, trạng thái SMTP và lịch sử.
   Nếu email lỗi, tài khoản/ghi danh vẫn được lưu; dùng **Gửi lại email**. Khi mất
   kết nối, bấm **Tải lại trạng thái** trước, không tạo hồ sơ khác.
4. Người học dùng liên kết trong email hoặc
   http://127.0.0.1:8080/dang-nhap-hoc-sinh.html. Tài khoản cấp mới dùng tên và
   mật khẩu trong email để đăng nhập ngay, không yêu cầu đổi mật khẩu lần đầu.
5. Mở http://127.0.0.1:8080/lop-hoc-cua-toi.html. Chỉ có lớp ghi danh
   hoạt động của người đang đăng nhập. **Mở lớp** hiện giáo viên/lịch học và nội
   dung đã xuất bản. Lớp chưa có nội dung hiển thị trạng thái trống rõ ràng.

Ba admin Giaovien1/Giaovien2/Giaovien3 có quyền cấp quyền/gửi lại ngang nhau,
mọi lớp. Học sinh không được xem API quản trị. Truy cập lớp bằng URL hoặc sửa
user_id/role trong request không bỏ qua kiểm tra ghi danh phía máy chủ.
Đăng nhập admin hiện có tiếp tục hoạt động; dùng lại cùng bảng users và phiên PHP.

## Quy tắc tài khoản và ghi danh

- Email đối chiếu bằng `lower(trim(email))`, giống bước chuẩn hóa đăng ký.
  Không bỏ dấu chấm, phần `+...` hoặc suy đoán các email là cùng người.
- Một tài khoản học sinh phù hợp, đang active và có mật khẩu: dùng lại tài
  khoản, giữ nguyên hash/mật khẩu và danh tính. Email chỉ thông báo lớp, không
  chứa mật khẩu hiện tại.
- Nhiều tài khoản trùng email, email thuộc admin/vai trò khác, tài khoản bị
  khóa/chưa có mật khẩu hoặc ghi danh xung đột: dừng để xử lý thủ công, không tự liên kết.
- Chưa có tài khoản: dùng tiền tố số ngẫu nhiên + họ tên đăng ký, ví dụ
  `01 Nguyễn Văn An` (giữ dấu tiếng Việt, chuẩn hóa khoảng trắng). Kiểm tra toàn
  bộ username duy nhất trong transaction; tiền tố mặc định 2 chữ số, mở rộng khi
  nhiều tên trùng. Tiền tố không phải mã hồ sơ và không giới hạn sĩ số ở 99 tên.
  Email luôn ghi đúng tên đăng nhập thực tế. Mật khẩu 192 bit ngẫu nhiên (32 ký
  tự ASCII), users chỉ lưu password_hash, must_change_password=0. Cột password
  cũ nếu có để trống. Không đổi username/password của tài khoản đã tồn tại.
  Migration student_direct_login_v1 bỏ cờ đổi mật khẩu lần đầu một lần cho các
  học sinh đã được cấp quyền qua LMS; giữ nguyên hash, email và ghi danh. Các
  tài khoản ngoài luồng LMS không bị đổi cờ. Không tự gửi lại email cho tài khoản cũ.
- Transaction `BEGIN IMMEDIATE` bao gồm tài khoản, ghi danh user_id đúng lớp,
  trạng thái hồ sơ `enrolled`, tăng revision, hàng chờ thư mã hóa và audit.
- Hồ sơ đã duyệt giữ một chỗ; cấp quyền đổi chỗ đó thành ghi danh active, không
  cộng thêm. Ghi danh đã có phù hợp được dùng lại. Sức chứa vẫn tối đa 99.
- Lỗi SQL rollback toàn bộ cấp quyền. Chỉ sau COMMIT mới thử SMTP. Lỗi SMTP
  không rollback tài khoản/ghi danh. Bấm lặp/hai admin đồng thời không tạo thêm bản sao.

## Email, mã hóa và gửi lại

Module SMTP hiện có `lmsSendMail()` được tái sử dụng; không nhận địa chỉ nhận,
username, mật khẩu, lớp hoặc nội dung thư tùy ý từ frontend. Email nhận lấy từ hồ
sơ/tài khoản đã đối chiếu. `base_url` đang cấu hình được dùng để tạo liên kết
`dang-nhap-hoc-sinh.html`; nếu localhost/loopback, thư ghi rõ chỉ truy cập được
trên máy đang chạy server. Muốn học sinh mở từ máy khác cần base_url triển khai.

Tài khoản mới nhận username/mật khẩu dùng ngay/liên kết. Tài khoản có sẵn chỉ nhận
thông báo lớp và dùng mật khẩu đang có. Thư có HTML và văn bản UTF-8. Mật khẩu
không được trả API/hiện trong trang quản trị hoặc ghi log.

Nội dung chờ gửi được mã hóa AES-256-GCM, IV ngẫu nhiên và AAD gắn registration_id.
Khóa 256 bit tạo nguyên tử khi cấp quyền lần đầu, mặc định:

`D:\GitcloneMNM\.thvp-lms\mail-outbox.key`

Đường dẫn theo thư mục SQLite; có thể đặt `THVP_LMS_ACCESS_KEY` là đường dẫn
tuyệt đối khác ngoài webroot. Không lưu khóa trong Git/CSDL hoặc đưa lên API.
Sao lưu khóa cùng bản sao CSDL riêng và giới hạn quyền đọc cho người vận hành/PHP.
Mất/đổi khóa khi còn thư mã hóa sẽ chặn giải mã, không tự tạo lại tài khoản hoặc
thay mật khẩu để né lỗi. Khôi phục đúng khóa đã sao lưu rồi gửi lại.

Xóa envelope ngay khi SMTP chấp nhận thư hoặc người học đổi mật khẩu tạm.
Mặc định thư chờ lưu tối đa 7 ngày; `THVP_LMS_ACCESS_MAIL_TTL` có thể đặt từ
3600 đến 604800 giây. Hết hạn được xóa ở lần API tiếp theo, vẫn giữ tài khoản,
ghi danh và audit. Nếu mật khẩu chưa được nhận trước hạn này, cần quy trình
khôi phục tài khoản riêng; chưa có chức năng đặt lại mật khẩu trong bước hiện tại.

Mỗi lần gửi có lease 5 phút và request key. Một worker gửi tại một thời điểm;
không giữ transaction/cursor SQLite trong lúc chờ SMTP. Replay cùng yêu cầu
không gửi thêm; một lần gửi mới cần thao tác **Gửi lại email** rõ ràng.
Sau khi đã được SMTP chấp nhận, nút gửi lại không còn hoạt động.

SMTP timeout hoặc worker mất kết nối có thể chưa xác định được thư đã được
chấp nhận hay chưa. Trạng thái **Chưa xác nhận kết quả gửi** yêu cầu kiểm tra hộp
thư trước khi chủ động gửi lại. SMTP không bảo đảm giao thư đúng một lần trong
tình huống mất ACK; retry vẫn dùng cùng tài khoản/ghi danh/mật khẩu chưa đổi.
Không khẳng định tới Inbox hoặc đã đọc. Nếu người học đã đổi mật khẩu thì không
gửi lại mật khẩu cũ; chỉ còn thông báo lớp.

## API và migration

- `POST action=admin_grant_access`: JSON `reference`, `version`; CSRF và
  Idempotency-Key. Cần hồ sơ đã duyệt, lịch sử đối chiếu số tiền thực nhận khớp
  học phí; account/enrollment/outbox/audit được lưu transaction.
- `POST action=admin_access_mail_retry`: cùng các trường, phiên và CSRF;
  gửi lại đúng hồ sơ đã cấp, không tạo thêm tài khoản/ghi danh.
- `GET admin_registration`: thêm `access`, `can_grant_access`, `access_history`.
  Chỉ trả tên đăng nhập, trạng thái/lỗi SMTP an toàn và lịch sử; không trả envelope/khóa/hash mật khẩu.
- `POST auth_login`, `GET auth_user`, `POST auth_logout`: tiếp tục dùng API cũ.
  Danh tính trả thêm `must_change_password`; role/flag lấy lại từ CSDL mỗi request.
- `POST student_change_password`: CSRF, chỉ phiên học sinh đang phải đổi mật
  khẩu; kiểm tra mật khẩu tạm và chính sách mật khẩu mới tại server. Xoay phiên,
  cập nhật credential stamp, vô hiệu hóa mật khẩu tạm/phiên cũ và xóa secret envelope.
- `GET student_classes`, `GET student_class&class_code=...`: chỉ student active
  đã đổi mật khẩu; query luôn gắn user_id của phiên với ghi danh active. Chưa đổi
  trả 423; lớp không thuộc học sinh trả 404. Các API admin tiếp tục từ chối student.
- Thao tác cấp quyền/gửi lại dùng rate scope `access:`, 10/phút/admin và 60/phút/IP.

Migration lặp lại an toàn trong `lms-server/access.php` + `access-migration.sql`:

- users: thêm email và must_change_password khi thiếu; không thay hash hiện có.
- lms_enrollments: thêm user_id FK khi thiếu; dữ liệu cũ chưa xác định giữ NULL.
- Index email chuẩn hóa và trigger ngăn tạo thêm email trùng; dữ liệu trùng cũ
  giữ nguyên để xử lý đúng hồ sơ liên quan, không làm lỗi toàn bộ migration.
- lms_access_grants: một grant/hồ sơ, account/enrollment, envelope và trạng thái/lease SMTP.
- lms_access_history: người thao tác, thời gian, cấp quyền/đổi mật khẩu/gửi thư và
  kết quả, cả các lỗi cấp quyền có hồ sơ xác định; không có nội dung mật khẩu.
- Giữ lms_registrations/lms_payments/lms_evidence/lms_review_history và dữ liệu cũ;
  không rebuild/reset bảng, không tự cấp quyền/gửi thư cho các hồ sơ đã duyệt trước đó.

Tệp giao diện: lms-access.js, lms-student.js, dang-nhap-hoc-sinh.html,
lop-hoc-cua-toi.html; nối vào lms-admin.js/quan-ly-dang-ky.html, dùng CSS/header/footer
chung. lms-account.js nhận phiên học sinh, có link Lớp học của tôi và Đăng xuất.

## Kiểm thử trình duyệt không dùng dữ liệu thật

Chạy từ thư mục dự án:

```powershell
python tests/serve_lms_access_demo.py
```

Công cụ hỏi mật khẩu admin **thử** bằng nhập ẩn, không in mật khẩu. Tự tạo
SQLite/cấu hình ngân hàng giả/ảnh/CA thử/SMTP loopback trong thư mục tạm và một
hồ sơ đã duyệt, chạy PHP ở cổng ngẫu nhiên khác. Không dùng main DB/SMTP thật.

1. Mở URL Admin được công cụ in ra trong **cửa sổ trình duyệt riêng tư**, vì cookie
   cùng hostname có thể dùng chung giữa các cổng. Đăng nhập Giaovien1/2/3 bằng
   mật khẩu thử vừa nhập. Chọn hồ sơ có sẵn → Cấp quyền học và gửi email.
2. Mở thư mục inbox công cụ in ra; `.eml`/`.txt` là thư giả đã nhận, chỉ chứa dữ
   liệu thử. Có thể đọc `.txt` bằng Notepad để lấy thông tin đăng nhập học sinh.
   Không có mật khẩu xuất hiện trong API, trang quản trị hoặc console log.
3. Đăng xuất admin hoặc dùng cửa sổ trình duyệt khác. Mở Student login tại URL
   được in, dùng thông tin trong thư giả, đổi mật khẩu rồi xem đúng lớp CB-01.
   Thử sửa URL sang NC-01 để thấy bị chặn. Chưa có bài giảng sẽ được thông báo rõ.
4. Muốn thử SMTP lỗi trước khi cấp quyền: sửa **enabled=false** trong tệp mail.json
   thử mà công cụ in đường dẫn. Cấp quyền vẫn lưu tài khoản/ghi danh nhưng mail
   báo lỗi. Đặt lại true, tải lại chi tiết và Gửi lại email. Không sửa tệp SMTP chính.
5. Ctrl+C dừng đúng các process demo, xóa thư mục tạm và thư giả. Không đưa các
   tài khoản/ảnh/hồ sơ demo vào CSDL chính.

Đã chạy smoke test khởi động demo; thao tác trình duyệt thực tế vẫn cần người
dùng kiểm tra, vì phiên làm việc này không có công cụ trình duyệt.

## Kiểm thử tự động

```powershell
python tests/test_lms_access_http.py
node tests/test_lms_access_frontend.cjs
python tests/serve_lms_access_demo.py --smoke
```

HTTP test dùng hai PHP process chung SQLite thử và SMTP TLS giả: tài khoản mới/cũ,
trùng email/admin, CSRF/quyền, replay/cạnh tranh, SMTP lỗi/gửi lại, cấp quyền ở lớp
99 chỗ, hai lớp cùng email, rollback SQL, mã hóa/xóa payload, đổi mật khẩu và quyền
lớp. Kiểm tra không có mật khẩu rõ trong DB/API/log, integrity/foreign keys.
Đã chạy hồi quy đăng ký/QR/minh chứng/duyệt/admin/email thử, PHP lint, JavaScript
và diff. Frontend là DOM/API mô phỏng, không thay thế kiểm thử trình duyệt.
