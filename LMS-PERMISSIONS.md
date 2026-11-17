# Phân quyền website và đăng nhập dùng chung

Cập nhật 16/11/2026. Dùng bảng `users`, ghi danh và phiên PHP LMS hiện có;
không tạo hệ thống tài khoản mới. Không dùng localStorage hoặc lựa chọn vai trò
để cấp quyền. Mật khẩu ba giáo viên đã được đặt theo yêu cầu qua công cụ cục bộ,
chỉ lưu `password_hash`; không ghi mật khẩu vào mã nguồn hoặc tài liệu.

## Quyền truy cập

- Khách xem được trang chủ, lộ trình giới thiệu, giới thiệu khóa học, lịch lớp và
  đăng ký. **Đăng nhập** mở lựa chọn **Giáo viên / Học sinh**.
- Học sinh chưa có tài khoản có liên kết **Xem khóa học và đăng ký** trên trang
  đăng nhập. Quy trình: đăng ký → thanh toán/minh chứng → giáo viên duyệt và cấp
  quyền → nhận tài khoản qua email. Chỉ tạo hồ sơ chưa phải ghi danh hoạt động.
- Ôn luyện, gõ phím, kiểm tra bàn phím, tra cứu phím tắt, tìm hiểu bàn phím và
  diễn đàn yêu cầu giáo viên hợp lệ hoặc học sinh có ít nhất một ghi danh đang
  hoạt động trong đợt học hiện tại, lớp chưa bế giảng. Khách mở trực tiếp chỉ nhận
  trang giới thiệu và nút đăng nhập/đăng ký, không nhận HTML chức năng bên trong.
- Học sinh chỉ vào lớp có ghi danh hợp lệ. Cờ đổi mật khẩu của tài khoản cũ vẫn
  được kiểm tra; quy trình cấp tài khoản và đổi mật khẩu hiện tại không thay đổi.
- Giaovien1, Giaovien2, Giaovien3 có quyền admin ngang nhau trên sáu lớp.
  Danh sách mặc định lần lượt CB-01/NC-01, CB-02/NC-02, CB-03/NC-03.
  **Quản lý tất cả lớp** mở đủ sáu lớp. Không có admin khác trong CSDL máy này
  tại thời điểm cập nhật. Không xóa hoặc đổi danh tính tài khoản khác.
- Khi đã đăng nhập, tab **Khóa học** tự hiện danh sách cá nhân từ phiên PHP.
  Bấm lại tab, F5 hoặc dùng hash vai trò khác không yêu cầu chọn vai trò lại và
  không đổi quyền. Muốn đổi tài khoản, dùng **Tài khoản → Đăng xuất** trước.

## Thành phần và lưu ý triển khai

`GET lms-api.php?action=site_access` trả danh tính công khai và
`can_use_features`/`reason` theo CSDL hiện tại, không trả mật khẩu.
`lms-server/site-access.php` dùng lại `lmsActor` cùng ghi danh/lifecycle.
`router.php` kiểm tra quyền trước khi phục vụ sáu trang tính năng và JS diễn đàn;
phản hồi có quyền không lưu cache. API quản trị/lớp vẫn kiểm tra quyền riêng.

`auth.js` giữ giao diện tương thích cho các trang cũ, lấy quyền từ API và bỏ
đăng nhập mô phỏng/EmailJS/tài khoản demo. `lms-account.js` dùng chung menu phiên
trên toàn website. Nút chuyển vai trò thử nghiệm ở ôn luyện/gõ phím đã bỏ.
Dữ liệu bài luyện/tiến độ/diễn đàn đang lưu cục bộ được giữ nguyên. Bước này
không chuyển các module cũ thành dịch vụ đồng bộ nhiều người dùng và không
kết nối API MySQL hosting.

Cookie `THVP_LMS_SESSION` dùng Path `/` để router đọc cùng phiên khi mở HTML.
Phạm vi cũ `/lms-api.php` được chuyển một lần, giữ HttpOnly/SameSite; không xóa
cookie token hồ sơ/minh chứng hoặc gọi `localStorage.clear()`. Đăng xuất/thu hồi
ghi danh/khóa tài khoản có hiệu lực ở máy chủ. Trang đang mở kiểm tra lại khi
quay về tab và mỗi 30 giây.

Phải dùng router của launcher. Hosting cần cấu hình tương đương trước khi
công khai; chỉ tải HTML lên hosting tĩnh không cung cấp bảo vệ máy chủ.

## Thử bằng trình duyệt

Nếu máy chủ chưa chạy:

```powershell
cd D:\GitcloneMNM\PTPMMNM-Tin-hoc-van-phong
.\start-local.ps1
```

1. Mở http://127.0.0.1:8080/index.html trong cửa sổ riêng tư. Bấm **Đăng nhập**:
   thấy hai lựa chọn. Không dùng `file:///`, Live Server hoặc đổi qua lại host.
2. Chọn giáo viên, đăng nhập bằng tài khoản/mật khẩu đã yêu cầu. Thấy hai lớp
   phụ trách. Đổi tab Giới thiệu/Khóa học hoặc F5: lớp vẫn hiện ngay.
3. Đăng xuất, chọn học sinh. Chưa có tài khoản thì vào liên kết giới thiệu đăng
   ký. Tài khoản đã được cấp quyền đăng nhập thấy đúng lớp đã ghi danh.
4. Chưa đăng nhập, mở http://127.0.0.1:8080/luyen-go-phim.html: chỉ thấy giới thiệu
   và nút đăng nhập/đăng ký. Đăng nhập học sinh có ghi danh rồi mở lại để sử dụng.

Kiểm thử dùng SQLite ngoài webroot, tài khoản giả, không SMTP thật:

```powershell
python -B tests/test_lms_site_access_http.py --browser
node tests/test_lms_portal_frontend.cjs
```

Bao gồm quyền khách/học sinh/ba giáo viên, giả vai trò, lớp cá nhân, CSRF,
chuyển cookie cũ, thu hồi ghi danh, SQLite integrity/foreign keys. Edge kiểm tra
đăng nhập thật, tải lại/chuyển tab, menu, sáu trang tính năng và desktop/mobile.
Ảnh thử: `D:\GitcloneMNM\.lms-permissions-checks`, không chứa hồ sơ thật.
