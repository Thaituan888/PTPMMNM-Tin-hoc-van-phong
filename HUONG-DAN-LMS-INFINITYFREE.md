# Cài LMS MySQL lên InfinityFree

## Các file được cung cấp

- `database-lms-infinityfree.sql`: import vào database được chọn trong phpMyAdmin. Gồm 29 bảng cho website cũ và LMS, 6 lớp, 3 giáo viên. Không có lệnh xóa bảng hoặc xóa dữ liệu.
- `LMS-TAI-KHOAN-RIENG.txt`: tên đăng nhập và mật khẩu riêng cho 3 giáo viên. Giữ trên máy, không upload vào htdocs, không đưa lên GitHub.
- `scratch/THVP-InfinityFree-LMS.zip`: gói triển khai. Giải nén trên máy trước khi upload; thư mục `htdocs` trong gói chứa mã website đã cập nhật.

Không dùng `database.sql` cũ để cập nhật: file cũ có `DROP TABLE` và sẽ xóa dữ liệu của các bảng đó.

## 1. Import database

1. Trong InfinityFree Control Panel, vào **MySQL Databases**. Tạo database nếu chưa có, hoặc dùng database hiện có của website.
2. Ghi lại **MySQL Hostname**, **Database Name**, **Username**, **Password**. Không tự đặt host thành `localhost`.
3. Nếu database có dữ liệu: mở phpMyAdmin, chọn đúng database, **Export** để sao lưu trước.
4. Chọn database trong cột bên trái, mở **Import**, chọn `database-lms-infinityfree.sql`, dùng UTF-8 rồi thực hiện import.
5. Sau khi thành công sẽ có 29 bảng. Kiểm tra các bảng `users`, `lms_classes`, `lms_registrations`, `lms_topics`, `lms_quizzes`.

SQL dành cho cấu trúc cũ trong file bạn gửi hoặc database mới. Không cần `CREATE DATABASE`, không cần quyền tạo procedure/trigger. Yêu cầu MySQL từ 8.0.16 hoặc MariaDB từ 10.6. Có thể xem phiên bản trong phpMyAdmin bằng `SELECT VERSION();`.

Import lại không đặt lại mật khẩu giáo viên, không tạo thêm lớp trùng mã, không xóa tài khoản, bài tập, bài nộp hoặc bài viết cũ. Nếu đã có các bảng LMS từ một phiên bản MySQL khác, cần kiểm tra cấu trúc trước; script này không tự chuyển mọi schema tùy chỉnh.

Nếu gặp lỗi trùng `lms_user_email_unique`, database cũ có nhiều tài khoản dùng cùng email sau khi bỏ khoảng trắng và chuyển về chữ thường. Kiểm tra các tài khoản đó, sửa email đúng người rồi import lại; không xóa tài khoản để bỏ qua lỗi.

## 2. Cấu hình kết nối

Trong gói triển khai đã có `htdocs/lms-hosting.php` với giá trị mẫu. Mở file đó và điền 4 giá trị thực tế từ MySQL Databases:

```php
<?php
return [
    'driver' => 'mysql',
    'host' => 'sqlXXX.infinityfree.com',
    'port' => 3306,
    'database' => 'if0_XXXXXXX_database',
    'username' => 'if0_XXXXXXX',
    'password' => 'MAT_KHAU_MYSQL_THUC_TE',
];
```

Nếu dùng trực tiếp mã nguồn trong thư mục dự án, sao chép `lms-hosting.example.php` thành `lms-hosting.php` rồi điền thông tin như trên. Không thêm file có mật khẩu thật vào Git.

`api.php` và `lms-api.php` dùng chung kết nối này. Không cần điền lại mật khẩu vào `config.php`. Khi không có `lms-hosting.php`, LMS chạy cục bộ vẫn dùng SQLite như trước.

## 3. Upload mã website

Giải nén gói ZIP trên máy. Upload **nội dung bên trong** thư mục `htdocs` của gói vào đúng `htdocs` của tên miền. Kết quả phải là:

```text
htdocs/
  index.html
  .htaccess
  api.php
  config.php
  lms-api.php
  lms-hosting.php
  lms-server/
    .htaccess
    database.php
    ...
  lms-private/
    .htaccess
    index.html
    payment-config.json
    mail-config.json
  assets/
  images/
  vendor/
  ...các file HTML/CSS/JS...
```

Không tạo thêm lớp thư mục `htdocs/htdocs/` hoặc `htdocs/PTPMMNM-Tin-hoc-van-phong/`.

File Manager có thể ẩn các file bắt đầu bằng dấu chấm: bật hiển thị file ẩn và upload đủ cả 3 file `.htaccess`. Không upload SQL, file tài khoản riêng, `.git`, `tests` hoặc `scratch` lên web.

Đây là bản triển khai mới: cần upload cả mã PHP được sửa, không chỉ import SQL rồi giữ nguyên PHP cũ vốn dùng SQLite.

## 4. Đăng nhập giáo viên

Mở `https://TEN-MIEN/dang-nhap-admin.html`. Dùng mật khẩu trong `LMS-TAI-KHOAN-RIENG.txt`:

| Tên đăng nhập | Giáo viên | Lớp phụ trách |
| --- | --- | --- |
| Giaovien1 | Tống Hoàng Thiên | CB-01, NC-01 |
| Giaovien2 | Nguyễn Thái Tuấn | CB-02, NC-02 |
| Giaovien3 | Trần Anh Khoa | CB-03, NC-03 |

Cả ba có quyền quản trị LMS hiện có, sửa nội dung cả 6 lớp, duyệt minh chứng, cấp quyền và xử lý khai/bế giảng. Mục lớp của tôi lọc theo giáo viên phụ trách. Nếu tên tài khoản đã tồn tại trước khi import, mật khẩu cũ được giữ nguyên; mật khẩu được cung cấp chỉ áp dụng cho tài khoản mới tạo từ SQL.

Học phí được tạo theo mã hiện tại: cơ bản 1.500.000đ, nâng cao 2.500.000đ, tối đa 99 học viên/lớp. Nếu lớp đã tồn tại, SQL giữ thông tin hiện có. Chưa tự tạo bài học, đề kiểm tra hoặc học viên giả: giáo viên nhập nội dung thật qua giao diện quản trị.

## 5. Thanh toán và email

Trong `htdocs/lms-private/payment-config.json`, điền thông tin tài khoản nhận tiền thực tế:

```json
{
  "bank_name": "TEN_NGAN_HANG",
  "bank_bin": "BIN_6_CHU_SO",
  "account_number": "SO_TAI_KHOAN",
  "account_name": "TEN_CHU_TAI_KHOAN"
}
```

Gói để trống thông tin ngân hàng, không gắn một tài khoản nhận tiền mẫu. Hệ thống tạo QR theo cấu hình và chờ giáo viên đối chiếu; không tự xác nhận đã nhận tiền.

`htdocs/lms-private/mail-config.json` mặc định có `enabled: false`. Điền SMTP thật, `from_email`, `from_name`, `base_url` là URL HTTPS của website; sau đó bật `enabled` và dùng mục **Kiểm tra email** trong quản trị. Không dùng mật khẩu MySQL làm mật khẩu SMTP.

Gửi email và chuyển khoản thật chưa được kiểm tra trên hosting của bạn. Cần cấu hình và kiểm tra kết nối SMTP thực tế trước khi phát tài khoản học sinh; database không tự cung cấp dịch vụ gửi thư. Khi gửi thư thất bại, hồ sơ có thể đã được ghi danh: mở lại hồ sơ để kiểm tra trạng thái, không tạo thêm tài khoản. SMTP không sẵn sàng cũng ảnh hưởng luồng OTP cũ; mã OTP không còn được trả về trình duyệt.

Thư mục `lms-private` lưu session, minh chứng, tài liệu, chứng nhận và khóa mã hóa thư. Không xóa thư mục này khi cập nhật mã nguồn. Sao lưu nó cùng database; giữ riêng file `mail-outbox.key` để các thư đang chờ vẫn giải mã được.

## 6. Kiểm tra sau upload

1. Mở `/index.html`: trang chủ hiển thị và tải đủ CSS, ảnh.
2. Mở `/lms-api.php?action=session`: phải trả JSON có `csrf`, không phải trang lỗi 503.
3. Mở `/lms-api.php?action=classes`: có 6 lớp và học phí đúng.
4. Đăng nhập lần lượt 3 giáo viên; kiểm tra mục lớp của tôi có đúng 2 lớp mỗi người.
5. Mở `/lms-private/index.html` và `/lms-server/classes.json`: phải bị chặn 403/404. Nếu đọc được nội dung, kiểm tra `.htaccess` trước khi nhập dữ liệu thật. PHP chỉ kiểm tra sự hiện diện của file chặn; quyền truy cập HTTP cần kiểm tra trên Apache thực tế.
6. Điền thông tin ngân hàng, kiểm tra QR bằng tài khoản nhận tiền thật; kiểm tra email thử trước khi cấp tài khoản cho học sinh.

PHP cần từ 8.1, bật PDO MySQL, mbstring, fileinfo, GD, OpenSSL. Bản này đã được kiểm tra import MySQL lặp lại, đăng nhập 3 giáo viên, lưu nội dung tiếng Việt, chấm bài, lọc hồ sơ, đăng ký đồng thời, lưu thông tin QR, upload minh chứng, duyệt và cấp quyền học sinh. Chưa triển khai lên tài khoản InfinityFree thực tế.
