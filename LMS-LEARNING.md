# Khung lớp, chủ đề và bài văn bản

Đã mở rộng Thông báo, Tài liệu học tập, nhập đề trắc nghiệm từ JSON và chấm điểm
phía máy chủ cho cả sáu lớp. Hướng dẫn: [LMS-CLASSROOM.md](LMS-CLASSROOM.md).

Đã mở rộng **chính trang lớp hiện có** `lop-hoc-cua-toi.html?lop=...`, dùng chung
bố cục cho giáo viên/học sinh, cùng bảng lớp/ghi danh và phiên PHP. Không tạo
hệ thống lớp hoặc tài khoản thứ hai. Hai khóa, sáu lớp, lịch học và dữ liệu cũ
được giữ nguyên. Không tự thêm nội dung mẫu vào CSDL chính.

## URL đang triển khai

- Giáo viên đăng nhập: http://127.0.0.1:8080/dang-nhap-admin.html
- Học sinh đăng nhập: http://127.0.0.1:8080/dang-nhap-hoc-sinh.html
- Danh sách lớp dùng chung: http://127.0.0.1:8080/lop-hoc-cua-toi.html
- Tab **Khóa học** trên trang LMS: http://127.0.0.1:8080/khoa-hoc-lms.html#khoa-hoc.
  Khách bấm tab sẽ chọn **Giáo viên / Học sinh**, dẫn đến trang đăng nhập hiện có với
  `?nguon=khoa-hoc`. Đăng nhập xong quay lại `#khoa-hoc-giao-vien` hoặc
  `#khoa-hoc-hoc-sinh`; tải lại vẫn hiển thị đúng danh sách cá nhân.
  Giáo viên thấy lớp phụ trách: Giaovien1 CB-01/NC-01, Giaovien2 CB-02/NC-02,
  Giaovien3 CB-03/NC-03. Nút **Quản lý tất cả lớp** vẫn mở đủ sáu lớp theo
  quyền admin ngang nhau. Học sinh chỉ thấy ghi danh còn hiệu lực; cờ đổi mật khẩu
  của tài khoản cũ vẫn được kiểm tra. Khi đã đăng nhập, bấm tab hoặc F5 hiện ngay
  danh sách cá nhân từ phiên PHP, không hỏi vai trò lại. Đăng xuất để đổi tài khoản.
  Chọn loại tài khoản không cấp quyền; máy chủ xác minh vai trò thật trước khi
  đăng nhập. Chọn loại khác phiên hiện tại sẽ yêu cầu nhập tài khoản phù hợp,
  không tự đăng xuất hoặc thay phiên nếu thông tin/loại tài khoản sai.
- Lớp cơ bản: `lop-hoc-cua-toi.html?lop=CB-01`, `CB-02`, `CB-03`.
- Lớp nâng cao: `lop-hoc-cua-toi.html?lop=NC-01`, `NC-02`, `NC-03`.

Ví dụ đầy đủ: http://127.0.0.1:8080/lop-hoc-cua-toi.html?lop=CB-01.
Đây là URL local, chỉ dùng trên máy đang chạy server; khi triển khai dùng cùng
đường dẫn dưới tên miền thực tế.

## Thử từng bước bằng trình duyệt

1. Mở tab **Khóa học** → **Giáo viên**, đăng nhập Giaovien1, Giaovien2 hoặc
   Giaovien3 với mật khẩu hiện có. Danh sách mặc định gồm hai lớp phụ trách.
   Bấm **Quản lý tất cả lớp** hoặc menu **Tài khoản → Tất cả lớp** để xem đủ
   sáu lớp; cả ba vẫn có quyền quản lý ngang nhau, không phụ thuộc phân công.
2. Mở CB-01. Đầu trang có khóa, mã lớp, giáo viên, ngày/giờ học và liên kết về
   danh sách. Mặc định chỉnh sửa **tắt**, chỉ thấy chủ đề hiển thị/bài đã xuất bản.
   Nút **Danh sách lớp** quay về danh sách cá nhân: giáo viên chỉ thấy hai lớp
   phụ trách, học sinh thấy các lớp đã ghi danh. Danh sách đủ sáu lớp chỉ mở riêng
   từ **Tài khoản → Tất cả lớp** hoặc nút **Quản lý tất cả lớp**.
3. Bấm **Bật chỉnh sửa**. Trong **Thông tin chung**, chọn **Sửa giới thiệu và liên
   kết online**, nhập văn bản và tên/URL HTTP hoặc HTTPS, rồi **Lưu**. Có thể để
   cả tên và URL trống nếu chưa có liên kết. URL mở tab mới, không nhúng/tải nội dung.
4. Bấm **Thêm chủ đề**, nhập tên và mô tả, **Lưu**. Chủ đề mới mặc định hiển thị;
   có thể **Ẩn chủ đề** trong lúc chuẩn bị. **Lên/Xuống** đổi thứ tự toàn bộ chủ
   đề, gồm cả chủ đề đang ẩn. Bấm tiêu đề để thu gọn/mở rộng.
5. Trong chủ đề, chọn **Thêm bài văn bản**, nhập tiêu đề/nội dung rồi **Lưu bản
   nháp**. Bài mới luôn là nháp. Khi muốn xuất bản: **Sửa bài** → **Xuất bản**.
   Bài đã xuất bản có **Lưu thay đổi** hoặc **Chuyển về bản nháp** trong biểu mẫu.
   Chủ đề đang ẩn vẫn che toàn bộ bài, kể cả bài có trạng thái đã xuất bản.
6. Bấm **Tắt chỉnh sửa** để kiểm tra giao diện chỉ xem. Nháp/chủ đề ẩn bị loại
   khỏi phản hồi API, không chỉ ẩn bằng CSS. Mở **Tải lại nội dung** để đọc dữ liệu mới.
7. Dùng cửa sổ riêng tư/trình duyệt khác để giữ phiên giáo viên, đăng nhập một
   học sinh có ghi danh CB-01. Nếu còn mật khẩu tạm, phải đổi trước khi học.
   Học sinh chỉ thấy lớp đã ghi danh còn hiệu lực, cùng nội dung đã xuất bản
   của giáo viên, không có nút chỉnh sửa. Mở lớp khác bằng cách sửa URL sẽ bị từ chối.

Biểu mẫu có **Lưu/Hủy**, khóa thao tác khi lưu và giữ dữ liệu đã nhập nếu lưu
thất bại. Chuyển biểu mẫu/tải lại/tắt chỉnh sửa khi đang nhập sẽ hỏi trước khi
hủy phần chưa lưu. Nếu báo nội dung đã được cập nhật, sao chép phần cần giữ,
tải lại và đối chiếu phiên bản mới trước khi lưu lại. Không tự ghi đè thay đổi
của giáo viên khác.

## Quyền và dữ liệu

- Quyền chỉnh sửa chỉ dành cho ba username Giaovien1/2/3 có role admin và active
  trong SQLite, từ phiên PHP đã xác thực. Mọi lần ghi kiểm tra lại vai trò/active
  trong cùng write transaction. Không lấy quyền từ query, JSON hay localStorage.
- Học sinh phải là student active, đã đổi mật khẩu tạm, có ghi danh active đúng
  user_id/lớp. Quyền này được kiểm tra trên mọi lần đọc lớp/bài; đăng ký hoặc
  cookie hồ sơ không thay thế quyền học.
- Chế độ xem mặc định của cả giáo viên/học sinh chỉ lấy topic visible và lesson
  published. Chế độ `editing=1` chỉ dành cho ba admin, trả thêm nháp/chủ đề ẩn.
- Đọc trực tiếp ID bài cũng JOIN đúng lớp/chủ đề và lọc visibility/status. ID
  thuộc lớp khác không được dùng để sửa hoặc đọc chéo thông qua lớp hiện tại.
- Nội dung là văn bản thuần UTF-8; giữ xuống dòng, render bằng textContent và
  white-space: pre-wrap. Các chuỗi HTML/script được hiển thị nguyên văn, không chạy.
- Liên kết chỉ HTTP/HTTPS, không có userinfo/ký tự điều khiển/khoảng trắng. Cần
  đủ tên và URL hoặc để cả hai trống. Tab mới có noopener/noreferrer. Không fetch URL ở server.
- Giới thiệu tối đa 5.000 ký tự, tên/tiêu đề 150, mô tả chủ đề 3.000, nội dung bài
  20.000, URL 2.048. Tiêu đề bắt buộc; bài xuất bản cần nội dung không trắng.
- Không có xóa nội dung, tệp đính kèm, nhúng video, điểm danh, bài tập/nộp bài,
  chấm điểm, ôn luyện hoặc trắc nghiệm ở bước này.

Migration trong `lms-server/learning-migration.sql`, chạy lặp an toàn từ lmsDB:

- lms_class_pages: FK class_code, giới thiệu/liên kết, revision và structure_revision.
- lms_topics: FK lớp, tên/mô tả, position, visible, revision và người/thời gian sửa.
- lms_text_lessons: FK topic, tiêu đề/nội dung, draft/published, revision và người/thời gian sửa.
- Đánh dấu learning_content_v1; không reset bảng, không đổi bản ghi lms_classes,
  users, hồ sơ, ghi danh hoặc thông tin SMTP/ngân hàng. Class page chỉ được tạo
  khi giáo viên ghi nội dung; không seed chủ đề/bài giả.

Revision của từng bản ghi ngăn sửa từ phiên bản cũ. Thứ tự/danh sách chủ đề dùng
structure_revision; thêm bài cũng tăng revision của chủ đề để retry cũ không
tạo trùng. `BEGIN IMMEDIATE` bảo vệ kiểm tra và ghi: hai admin cùng phiên bản
chỉ một thao tác được chấp nhận, thao tác còn lại nhận HTTP 409.

## API và tệp

Các action nằm trong backend `lms-api.php` hiện có:

- GET learning_classes: danh sách lớp theo quyền, can_edit. `scope=mine` chỉ
  lấy lớp có giáo viên phụ trách khớp danh tính trong CSDL; scope mặc định all
  giữ danh sách sáu lớp cho admin. Học sinh ở cả hai scope chỉ nhận lớp ghi danh.
- POST auth_login nhận thêm expected_role tùy chọn (admin/student) khi vào từ
  tab Khóa học: đối chiếu vai trò CSDL sau kiểm tra mật khẩu và trước thay phiên.
  Không dùng giá trị này để cấp vai trò. Sai loại tài khoản trả 403, giữ phiên cũ.
- GET learning_class&class_code=CB-01&editing=0: metadata, thông tin chung và nội
  dung đã xuất bản. editing=1 chỉ dành cho admin. Không trả dữ liệu hồ sơ/tài khoản.
- GET learning_lesson&class_code=CB-01&id=...&editing=0: đọc riêng bài, cùng quy tắc quyền/lọc.
- POST content_save_class: class_code, version, introduction, online_title, online_url.
- POST content_topic_create: class_code, structure_version, title, description.
- POST content_topic_save: class_code, id, version, title, description, visible boolean.
- POST content_topic_move: class_code, id, version, structure_version, direction up/down.
- POST content_lesson_create: class_code, topic_id, version của chủ đề, title, body;
  server luôn đặt draft, không nhận trạng thái xuất bản khi tạo mới.
- POST content_lesson_save: class_code, topic_id, id, version của bài, title, body,
  status draft/published. Mọi POST cần phiên đúng quyền và X-CSRF-Token.

Các API student_classes/student_class cũ vẫn hoạt động; content_available chỉ
đúng khi có bài published trong chủ đề đang hiển thị. Trang dùng chung hiện dùng
learning_* để thống nhất bố cục và kiểm tra quyền.

Mã: lms-server/learning.php + migration, lms-class.js, lms-learning.css và trang
lop-hoc-cua-toi.html. lms-student.js chỉ giữ đăng nhập/đổi mật khẩu; không có UI
lớp thứ hai. lms-account.js có lối vào danh sách lớp cho giáo viên.

## Kiểm thử đã chạy

```powershell
python tests/test_lms_learning_http.py
python tests/test_lms_learning_http.py --browser
node tests/test_lms_access_frontend.cjs
node tests/test_lms_admin_frontend.cjs
node tests/test_lms_portal_frontend.cjs
```

Test dùng hai PHP process/SQLite riêng, học sinh và admin thử, không ghi bài mẫu
vào CSDL chính hoặc gửi thư thật. Kiểm tra ba admin sửa mọi lớp; đúng/sai ghi danh;
đổi mật khẩu bắt buộc; draft/ẩn qua cả API lớp và ID bài; CSRF/ID chéo/URL/độ dài;
XSS văn bản; xuất bản/ẩn có hiệu lực sau tải lại; hai admin cạnh tranh trả 200/409;
giữ nguyên dữ liệu lớp/tài khoản/ghi danh; SQLite integrity/foreign keys.

Browser test dùng Microsoft Edge headless qua DevTools, Node 24 WebSocket sẵn có,
hồ sơ trình duyệt tạm và thông tin tài khoản thử qua stdin, không in mật khẩu.
Đã chạy desktop 1440px và mobile 390/320px: tạo chủ đề → lưu nháp → xuất bản →
học sinh xem, tắt chỉnh sửa loại nháp, XSS không chạy, form 409 giữ nội dung và
không tràn ngang. Đã xem ảnh chụp kết quả trong `.lms-learning-checks` ngoài webroot.
Mô phỏng viewport mobile không thay thế kiểm thử trên điện thoại thật.

Luồng chọn Giáo viên/Học sinh đã kiểm thử qua liên kết thật, đăng nhập rồi tự
quay về danh sách cá nhân, tải lại trang và bấm Mở lớp. HTTP xác minh danh sách
hai lớp của từng giáo viên, lớp ghi danh của học sinh và chặn sai loại tài khoản
mà không đổi phiên. DOM test kiểm tra chuyển tài khoản, đổi mật khẩu tạm rồi
quay về tab đúng loại, chọn lại và không hiển thị dữ liệu từ phản hồi phiên cũ.

Lần chạy Edge trong sandbox bị timeout DevTools; chạy ngoài sandbox đã thành
công. Nếu môi trường của công cụ chặn Edge, có thể chạy từ PowerShell thông
thường; không cần nới quyền API hoặc tắt kiểm tra quyền ứng dụng.

Đã chạy hồi quy đăng nhập/admin/đăng ký/QR/minh chứng/duyệt/cấp quyền học-email,
PHP lint, JavaScript syntax và diff. Không thay SMTP, tài khoản hoặc hồ sơ thật.
