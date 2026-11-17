# Thông báo, tài liệu và kiểm tra trong sáu lớp

Đã thêm Khai giảng/Bế giảng/Mở lại đăng ký và gửi chứng nhận hoàn thành. Hướng
dẫn: [LMS-LIFECYCLE.md](LMS-LIFECYCLE.md). Học sinh đợt đã bế giảng không còn
quyền nội dung, nhưng có thể tải chứng nhận từ danh sách lớp.

Mở http://127.0.0.1:8080/khoa-hoc-lms.html#khoa-hoc → Giáo viên → đăng nhập.
Giáo viên mở lớp phụ trách hoặc chọn Quản lý tất cả lớp để mở bất kỳ lớp nào
trong CB-01/02/03, NC-01/02/03. Cả ba admin vẫn có quyền ngang nhau.

## Thử trên giao diện

1. Mở lớp → **Bật chỉnh sửa**. Chế độ xem vẫn là mặc định khi mở/tải lại lớp.
2. **Thông tin chung / Lớp học online**: chọn Sửa giới thiệu và liên kết online,
   nhập tên và URL HTTP/HTTPS, Lưu. Học sinh mở liên kết trong tab mới.
3. **Thông báo** → Thêm thông báo: nhập tiêu đề, nội dung, tùy chọn tệp/link.
   Lưu bản nháp hoặc Xuất bản. Bấm Chỉnh sửa để sửa hoặc chuyển lại bản nháp.
4. **Tài liệu học tập** → Tải tài liệu lên: chọn PDF, TXT UTF-8, JPG hoặc PNG thật,
   tối đa 5 MB, nhập tiêu đề rồi Xuất bản. Có thể thay tệp khi Chỉnh sửa; để
   trống giữ tệp đang có. Bước này chưa nhận Word/Excel/PowerPoint trực tiếp;
   xuất PDF từ Office để tải lên. Tệp được tải xuống qua API kiểm tra phiên,
   không có đường dẫn công khai hoặc đường dẫn vật lý trong phản hồi.
5. **Kiểm tra** → Nhập bài trắc nghiệm từ tệp → Tải tệp mẫu JSON. Sửa câu hỏi,
   lựa chọn và đáp án trong tệp, chọn lại tệp rồi Lưu bản nháp hoặc Xuất bản.
   Tiêu đề nhập trên biểu mẫu ưu tiên hơn title trong JSON; để trống dùng title
   trong tệp. Mỗi bài 1–100 câu, mỗi câu 2–6 lựa chọn, một đáp án đúng.
6. Khi chỉnh sửa bài trắc nghiệm, chọn Tải câu hỏi để chỉnh sửa, sửa JSON rồi
   nhập lại. Để trống tệp giữ câu hỏi hiện tại. Bài đã có lượt nộp không cho thay
   câu hỏi/đáp án; có thể đổi tiêu đề hoặc trạng thái. Muốn thay đề thì tạo bài mới.
7. Học sinh đăng nhập trong cửa sổ riêng tư, mở lớp đã ghi danh. Chỉ thấy nội
   dung đã xuất bản. Chọn **Làm bài kiểm tra**, trả lời đủ câu rồi **Kết thúc và
   xem điểm**, xác nhận nộp. Mỗi học sinh một lần nộp mỗi bài. Điểm theo thang 10,
   mỗi câu có trọng số bằng nhau, hiển thị ngay và còn nguyên khi tải lại trang.
   Server tự chấm; không nhận điểm do trình duyệt gửi, không trả đáp án đúng cho
   API học sinh. Gửi lặp không thay kết quả đã nộp. Đây là kiểm tra không giới hạn
   thời gian; chưa có hẹn giờ hoặc nộp bài tự động.

Mẫu JSON (answer đếm từ **0**, ví dụ 0 là lựa chọn đầu tiên):

```json
{
  "title": "Kiểm tra buổi 1",
  "questions": [
    {"text": "Phím tắt sao chép?", "choices": ["Ctrl + C", "Ctrl + V"], "answer": 0},
    {"text": "Phím tắt dán?", "choices": ["Ctrl + C", "Ctrl + V"], "answer": 1}
  ]
}
```

Có thể thêm đề/hướng dẫn dạng tệp hoặc liên kết ở nút Thêm đề / hướng dẫn kiểm
tra. Chỉ bài trắc nghiệm nhập đúng JSON mới có làm bài và tự chấm.

## Backend và bảo vệ dữ liệu

- Tái sử dụng lms-api.php, phiên PHP, CSRF, users/enrollments và learning.php.
- resources-migration.sql chạy lặp an toàn từ bootstrap.php, không gieo dữ liệu
  mẫu. Bảng lms_class_resources, lms_resource_requests, lms_quizzes,
  lms_quiz_attempts, lms_quiz_requests. Không thay tài khoản hoặc ghi danh hiện có.
- API: GET learning_resources, learning_file, learning_quizzes (class_code;
  danh sách hỗ trợ editing=0/1); POST content_resource_save (multipart),
  content_quiz_save và quiz_submit (JSON). Mọi POST kiểm tra CSRF, vai trò.
- Metadata/file và đề được gắn đúng lớp. Học sinh bắt buộc đổi mật khẩu tạm,
  có ghi danh active. Bản nháp, file nháp, đề nháp không truy cập bằng đổi ID.
- Tài liệu ở thư mục `learning-files` cạnh SQLite, mặc định
  `D:\GitcloneMNM\.thvp-lms\learning-files`, nằm ngoài webroot. Tên ngẫu nhiên,
  kiểm tra MIME/đuôi/dung lượng; luôn trả attachment, nosniff. Lỗi transaction
  dọn tệp vừa tạo; thay tệp giữ tệp cũ, chưa có thao tác xóa.
- Sửa dùng revision và transaction, xung đột trả 409. Gửi lặp lưu nội dung dùng
  Idempotency-Key. Chấm điểm lưu transaction, UNIQUE(quiz_id,user_id) chống nộp
  đồng thời; lượt gửi lại nhận kết quả cũ. Không nhận user_id/role từ frontend.
- Biểu mẫu giữ tệp/nội dung/đáp án nếu lỗi; không ghi dữ liệu vào localStorage.

## Kiểm thử

```powershell
python tests/test_lms_resources_http.py
python tests/test_lms_learning_http.py --browser
node tests/test_lms_access_frontend.cjs
node --check lms-class.js
```

Các test dùng SQLite, tài khoản và thư mục tệp thử riêng, không gửi email hoặc
thay dữ liệu lớp thật. Bao gồm quyền ba giáo viên/sáu lớp, sai CSRF/ghi danh,
MIME/tệp giả/5 MB, file nháp, idempotency, xung đột phiên bản, nhập đề không hợp
lệ, giấu đáp án, điểm giả, nộp trùng/đồng thời, đọc điểm sau tải lại, SQLite
integrity/foreign keys. Edge kiểm tra tải tài liệu, nhập JSON, thông báo và nộp
bài xem điểm, cùng hồi quy chủ đề/bài văn bản ở desktop và mobile mô phỏng
1440/390/320 px. Chưa kiểm tra điện thoại vật lý.
