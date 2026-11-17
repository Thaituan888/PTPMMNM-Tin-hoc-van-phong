# SMTP và email thử LMS

Đã có cấu hình SMTP riêng và mục **Kiểm tra email** trong quản lý đăng ký.
Chỉ `Giaovien1`, `Giaovien2`, `Giaovien3` có phiên PHP hợp lệ, active và role admin
trong SQLite mới được sử dụng. Quyền ngang nhau, không phụ thuộc lớp.
Mục gửi thử không thay mật khẩu, trạng thái hồ sơ hay luồng duyệt, không tự cấp
tài khoản học sinh hoặc ghi danh.

Module SMTP này hiện được tái sử dụng cho thao tác cấp quyền học riêng theo
[LMS-ACCESS.md](LMS-ACCESS.md). Không gửi tự động khi chỉ duyệt hồ sơ hoặc tải trang.

## Chọn đúng vị trí cấu hình

Tệp mẫu trống: `lms-server/mail-config.example.json`, `enabled=false`.
Tệp thật phải nằm ngoài webroot và Git. Thứ tự xác định đường dẫn:

1. Biến môi trường `THVP_LMS_MAIL_CONFIG`, nếu được đặt: đường dẫn tuyệt đối.
2. Nếu không đặt: `mail-config.json` nằm cạnh SQLite do `THVP_LMS_DB`/`lmsStorage()`
   xác định. Với dự án hiện tại, mặc định là
   `D:\GitcloneMNM\.thvp-lms\mail-config.json`.

Trên máy hiện tại, thống nhất dùng `D:\GitcloneMNM\.thvp-lms\mail-config.json`,
cùng thư mục với SQLite, cấu hình thanh toán và kho minh chứng. Không dùng
`D:\GitcloneMNM.thvp-lms\mail-config.json`: đây là thư mục khác vì thiếu dấu `\`
trước `.thvp-lms`. Không tự dò/đổi qua lại giữa hai tệp. Tham số `-MailConfigPath`
hoặc biến `THVP_LMS_MAIL_CONFIG` chỉ dùng khi chủ động chọn đường dẫn riêng.

Từ `D:\GitcloneMNM\PTPMMNM-Tin-hoc-van-phong`, sao chép mẫu nếu tệp chưa tồn tại:

```powershell
$mailConfigDestination = 'D:\GitcloneMNM\.thvp-lms\mail-config.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $mailConfigDestination) | Out-Null
if (-not (Test-Path -LiteralPath $mailConfigDestination)) {
    Copy-Item -LiteralPath .\lms-server\mail-config.example.json -Destination $mailConfigDestination
}
```

Mở tệp bằng trình soạn thảo, lưu **UTF-8 không BOM**. Không nhập mật khẩu trên
dòng lệnh hoặc gửi nội dung cấu hình vào log/chat. Giữ quyền đọc tệp cho tài
khoản chạy PHP và người quản lý cấu hình.

| Trường | Cách điền |
| --- | --- |
| `enabled` | Boolean `false` khi chưa sẵn sàng; `true` để cho phép admin gửi thử. |
| `smtp_host` | Tên máy chủ SMTP hoặc IP do nhà cung cấp cấp, không kèm giao thức/cổng/đường dẫn. |
| `smtp_port` | Số nguyên; thường 587 với STARTTLS hoặc 465 với TLS trực tiếp, theo nhà cung cấp. |
| `smtp_encryption` | `tls` cho STARTTLS; `ssl` cho TLS trực tiếp. Không hỗ trợ gửi không mã hóa. |
| `smtp_username` | Tài khoản xác thực SMTP do nhà cung cấp cấp. |
| `smtp_password` | Mật khẩu SMTP/mật khẩu ứng dụng phù hợp; được giữ nguyên, kể cả dấu cách có ý nghĩa. |
| `from_email` | Địa chỉ gửi được tài khoản SMTP cho phép sử dụng. |
| `from_name` | Tên người gửi, hỗ trợ tiếng Việt. |
| `base_url` | URL website, ví dụ URL local của bạn; http/https, không kèm tài khoản, query hoặc fragment. |
| `timeout_seconds` | Không bắt buộc, số nguyên 1–30; mặc định 10 giây cho thao tác mạng. |

Tệp tắt (`enabled=false`, kể cả thiếu trường enabled) không gửi được thư. Khi
bật, tất cả trường SMTP/người gửi/base URL đều bắt buộc và được kiểm tra.
Không thêm các trường tắt kiểm tra chứng chỉ hoặc SMTPOptions tùy ý.

## Kiểm tra cấu hình mà không gửi thư

```powershell
$env:THVP_LMS_MAIL_CONFIG = 'D:\GitcloneMNM\.thvp-lms\mail-config.json'
& "$env:LOCALAPPDATA\THVP\php\php.exe" .\lms-server\check-mail-config.php
```

Công cụ chỉ đọc cấu hình, không mở CSDL và không kết nối SMTP. Kết quả gồm đường
dẫn thực tế, tệp tồn tại/đọc được, OpenSSL, trạng thái và lỗi theo tên trường.
Không in tài khoản SMTP hoặc mật khẩu. Exit code 0 là sẵn sàng theo cấu hình;
1 là chưa sẵn sàng, bao gồm đang tắt/chưa tạo tệp. Chưa chứng minh đã kết nối SMTP.

## Chạy máy chủ và gửi thử

Chạy launcher ở một terminal riêng:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1 -Port 8080
```

Nếu cổng 8080 đang chạy, dừng đúng máy chủ local đó trong terminal của bạn trước
khi khởi động lại với đường dẫn này. Có thể dùng `-Port 8081` để chạy thêm máy chủ
ở cổng khác. Nếu đã dùng đường dẫn mặc định cạnh SQLite hoặc môi trường của máy
chủ đã có biến cấu hình, không cần `-MailConfigPath`.

PHP đọc lại JSON mỗi lần kiểm tra/gửi: đổi nội dung tệp không cần khởi động lại.
Đổi biến môi trường/đường dẫn hoặc php.ini cần khởi động lại tiến trình PHP.
Launcher in kết quả kiểm tra an toàn; cấu hình email chưa có không chặn LMS.

1. Mở http://127.0.0.1:8080/dang-nhap-admin.html và dùng mật khẩu admin hiện có.
2. Mở http://127.0.0.1:8080/quan-ly-dang-ky.html#lms-mail.
3. Chọn **Kiểm tra lại cấu hình** nếu vừa sửa JSON. Nhập email của bạn ở
   **Email nhận thử**, rồi bấm **Gửi email thử**.
4. Kết quả **Đã gửi qua SMTP; vui lòng kiểm tra hộp thư và thư rác** chỉ có sau
   khi SMTP chấp nhận thư. Đây không phải xác nhận đã đến Inbox hoặc đã được đọc.

Không tự gửi khi mở trang, đăng nhập, kiểm tra cấu hình, duyệt hồ sơ hoặc tải lại.
Nút gửi khóa trong lúc xử lý. Khi mất kết nối/timeout, hệ thống không tự gửi lại;
kiểm tra hộp thư trước khi chủ động gửi lần nữa để tránh thư trùng.

## Lỗi và cách kiểm tra an toàn

| Lỗi | Kiểm tra |
| --- | --- |
| Không tìm thấy tệp | Chạy CLI để xem `config_path`; phân biệt hai thư mục có/không có dấu `\` trước `.thvp-lms`. Kiểm tra biến môi trường của tiến trình PHP. |
| BOM/encoding/JSON | Lưu UTF-8 không BOM; dùng nháy kép, không có dấu phẩy thừa/comment; port là số, enabled là boolean. Lỗi không trích nội dung JSON. |
| `mail_configuration` | Mục cấu hình hiển thị từng trường thiếu/sai. Không tự thay bằng thông tin người gửi mẫu. |
| `smtp_connect` | Kiểm tra DNS, host/cổng, tường lửa, dịch vụ SMTP. Localhost có thể phân giải IPv6 trong khi SMTP local chỉ nghe IPv4; dùng địa chỉ phù hợp và chứng chỉ đúng địa chỉ đó. |
| `smtp_socket_denied` / Windows 10013 | Tiến trình PHP không được phép mở socket. Có thể PowerShell ngoài sandbox kết nối được nhưng PHP do công cụ khởi động trong sandbox bị chặn. Chạy lại đúng máy chủ từ PowerShell bình thường có quyền mạng; không tắt tường lửa, xác minh TLS hoặc đổi tài khoản SMTP để né lỗi. |
| `smtp_auth` | Kiểm tra username/password hoặc mật khẩu ứng dụng, quyền SMTP AUTH của nhà cung cấp. Không bật debug trả transcript SMTP. |
| `smtp_tls` | Kiểm tra chế độ tls/ssl, cổng, thời gian máy, tên trên chứng chỉ và CA tin cậy của PHP (`openssl.cafile`/cấu hình hệ thống). Cài CA phù hợp, không tắt verify_peer/verify_peer_name. |
| `smtp_timeout` | Máy chủ chưa phản hồi kịp. Có thể chưa xác định được thư đã được chấp nhận hay chưa; xem hộp thư trước khi gửi lại. |
| `smtp_rejected` | Kiểm tra quyền địa chỉ gửi, địa chỉ nhận và hạn mức/chính sách nhà cung cấp. Không trả nguyên phản hồi SMTP vì có thể chứa thông tin nhạy cảm. |
| HTTP 401/403 | Đăng nhập lại đúng một trong ba admin; quyền và CSRF được kiểm tra ở máy chủ. |
| HTTP 429 | Giới hạn 10 lần/phút/admin, 60 lần/phút/IP, scope riêng `mail:`; chờ một phút. |

Để báo lỗi, dùng mã lỗi và thông báo an toàn trên màn hình, hoặc kết quả CLI.
Không gửi toàn bộ mail-config.json, transcript AUTH, ErrorInfo hoặc bật SMTPDebug.
Ứng dụng luôn tắt debug SMTP và không ghi mật khẩu/nội dung thư vào log.
Nhà cung cấp SMTP vẫn có thể đưa thư vào Spam hoặc từ chối chuyển tiếp sau khi
đã chấp nhận; việc vào Inbox còn phụ thuộc cấu hình tên miền/chính sách của họ.

## Chẩn đoán kết nối không gửi thư

```powershell
& "$env:LOCALAPPDATA\THVP\php\php.exe" -c "$env:LOCALAPPDATA\THVP\php\php.ini" .\lms-server\diagnose-mail.php
# Chỉ khi cần kiểm tra cả hai cặp cổng TLS thông dụng trên SMTP host đã cấu hình:
& "$env:LOCALAPPDATA\THVP\php\php.exe" -c "$env:LOCALAPPDATA\THVP\php\php.ini" .\lms-server\diagnose-mail.php --both
```

Công cụ chỉ chạy CLI, dùng chính transport PHPMailer hiện có, chỉ CONNECT/EHLO/
STARTTLS và đóng kết nối. Không AUTH, MAIL FROM, RCPT TO hoặc DATA; không gửi thư.
Đầu ra che các giá trị thông tin tài khoản, cho biết PHP/php.ini, mã socket,
lỗi OpenSSL và kết quả TLS. Không dùng nguyên transcript/debug SMTP.
Launcher dùng `-c` để chọn rõ php.ini cạnh executable cho cả công cụ kiểm tra và server.

Chẩn đoán tại máy này ngày 14/11/2026: cùng PHP 8.4.27 và php.ini, môi trường
sandbox trả Windows 10013 trước khi bắt tay TLS; chạy ngoài sandbox xác minh TLS
thành công trên smtp.gmail.com:587 (STARTTLS) và :465 (TLS trực tiếp), không xác
thực/gửi thư. `openssl.cafile` chưa đặt và tệp CA mặc định không tồn tại, nhưng
kiểm tra chứng chỉ thực tế vẫn đạt; không xác định đây là lỗi CA và không thay
kho CA hay tắt xác minh. Máy chủ được chạy lại ngoài môi trường hạn chế mạng.

## Mã nguồn và API

- `lms-server/mail.php`: xác định/kiểm tra cấu hình, quyền ba admin,
  `lmsSendMail()` tái sử dụng, `lmsSendTestMail()` có nội dung cố định, không dữ liệu học sinh.
- `lms-server/mail-transport.php`: PHPMailer SMTP, TLS xác minh chứng chỉ, phân
  loại lỗi an toàn, timeout mạng và ngân sách thời gian khoảng 45 giây.
- `lms-server/check-mail-config.php`, `mail-config.example.json`: công cụ và mẫu.
- `vendor/phpmailer/`: PHPMailer 7.2.0 từ [release chính thức](https://github.com/PHPMailer/PHPMailer/releases/tag/v7.2.0),
  mã nguồn upstream giữ nguyên, giấy phép LGPL trong LICENSE, nguồn/SHA-256 trong SOURCE.txt.
- `lms-mail.js`, `quan-ly-dang-ky.html`, `lms-admin.css`: mục kiểm tra email và bố cục mobile.
- `lms-api-client.js`: chuyển mã lỗi/trạng thái cấu hình an toàn cho giao diện.
- `lms-api.php`: `GET action=mail_status` và `POST action=mail_test`.
  POST cần phiên, role/username từ CSDL và `X-CSRF-Token`; JSON chỉ có `recipient`.
  Không nhận host, mật khẩu, người gửi, subject/body hoặc danh sách người nhận tùy ý.
- `start-local.ps1`: tham số đường dẫn và kiểm tra khi khởi động. Router chặn
  tệp cấu hình, module riêng và mã PHP của thư viện qua HTTP; `.gitignore` chặn tệp cấu hình thật.

Không thêm bảng/migration và không lưu mail-config vào CSDL. Chỉ bộ đếm
`lms_rate_limits` hiện có được sử dụng khi gửi thử. Tất cả bảng hồ sơ/ảnh/thanh
toán/lịch sử/users/ghi danh giữ nguyên khi kiểm tra và gửi email thử.

## Kiểm thử đã chạy

```powershell
python tests/test_lms_mail_http.py
python tests/test_lms_mail_probe.py
node tests/test_lms_mail_frontend.cjs
python tests/test_lms_admin_http.py
python tests/test_lms_review_http.py
python tests/test_lms_http.py
python tests/test_lms_payment_http.py
python tests/test_lms_evidence_http.py
node tests/test_lms_admin_frontend.cjs
node tests/test_lms_review_frontend.cjs
node tests/test_lms_frontend.cjs
node tests/test_lms_payment_frontend.cjs
node tests/test_lms_evidence_frontend.cjs
```

Test SMTP dùng SQLite/JSON/certificate/log tạm và SMTP giả chỉ nghe loopback,
không chuyển tiếp ra ngoài. Cần Python, PHP OpenSSL và openssl.exe để tạo CA thử.
Đã kiểm tra STARTTLS/TLS trực tiếp có AUTH, chứng chỉ đúng/sai, nội dung MIME
tiếng Việt, lỗi cấu hình/JSON/BOM, xác thực/kết nối/timeout, quyền/CSRF/rate limit,
không lộ mật khẩu trong API/log và không đổi hồ sơ/users/ghi danh. Kiểm tra thêm
PHP lint, JavaScript, SQLite integrity/foreign keys và diff.

Frontend kiểm thử bằng DOM/API mô phỏng; chưa kiểm thử thao tác trực tiếp trên
trình duyệt máy tính/điện thoại. Chưa gửi SMTP thật hoặc xác nhận tới Inbox.
