# Xử lý hồ sơ và đối chiếu thanh toán

Đã bổ sung xử lý thật trên API, phiên PHP và SQLite hiện có. Không tạo tài khoản
học sinh, ghi danh hoạt động, email hoặc hoàn tiền. Không thay mật khẩu, cấu hình
ngân hàng hoặc ảnh đã lưu. Ba admin hiện có xử lý mọi lớp với quyền ngang nhau.

## Mở giao diện

- Đăng nhập: http://127.0.0.1:8080/dang-nhap-admin.html
- Quản lý: http://127.0.0.1:8080/quan-ly-dang-ky.html
- Người đăng ký: `dang-ky-khoa-hoc.html?lop=CB-01` hoặc lớp tương ứng, trên trình
  duyệt vẫn giữ cookie quyền truy cập hồ sơ. Mã hồ sơ/email không cấp quyền xem.

Trong **Xem chi tiết**, kiểm tra snapshot học phí, nội dung chuyển khoản, tài
khoản nhận và lịch sử ảnh. Không suy ra đã nhận tiền chỉ từ ảnh.

1. **Xác nhận thanh toán và duyệt**: dùng hồ sơ có minh chứng chờ đối chiếu và
   tài khoản nhận đã lưu. Chỉ đánh dấu đã kiểm tra tiền thực nhận đúng tài khoản,
   số tiền và nội dung rồi bấm **Xác nhận thanh toán và duyệt**, hoặc **Hủy thao tác**.
   Không nhập lại số tiền, mã giao dịch, ghi chú hoặc xác nhận hộp thoại thứ hai.
   Máy chủ dùng học phí đã lưu, ghi manual_confirmation=1 và bank_transaction=NULL;
   không tự đặt mã giao dịch ngân hàng. Hồ sơ chuyển thành
   **Đã duyệt — chờ cấp quyền học**, tiếp tục giữ chỗ và không nhận ảnh mới.
2. **Yêu cầu bổ sung**: nhập lý do gửi người đăng ký.
   Chủ hồ sơ đọc lý do khi mở lại hoặc tải lại phần minh chứng. Gửi ảnh mới
   vào cùng hồ sơ sẽ trở lại chờ đối chiếu (hoặc chờ kiểm tra nộp muộn).
3. **Từ chối**: bắt buộc lý do và xác nhận hộp thoại; nhả chỗ đang giữ, giữ hồ sơ,
   ảnh và lịch sử. Không có hoàn tiền tự động. Quyết định cuối cùng không bị ghi đè.

Danh sách tự tải lại sau thao tác. Lọc được các trạng thái mới. Khi bị báo hồ sơ
đã thay đổi, bấm **Xem chi tiết** để đọc phiên bản mới trước khi xử lý. Trường đang
nhập được giữ khi mất kết nối; gửi lại cùng nội dung dùng cùng mã yêu cầu.

## API và migration

- `POST lms-api.php?action=admin_review`, admin từ phiên/CSDL, CSRF và
  `Idempotency-Key` ngẫu nhiên 32–128 ký tự. JSON:
  `reference`, `version` (từ chi tiết), `decision` (`approve`, `request_more`, `reject`),
  `reason` (bắt buộc với bổ sung/từ chối), `notes` (nội bộ).
  Duyệt cần thêm `received_vnd` nguyên, `bank_transaction`, `funds_verified: true`.
- `GET admin_registration` thêm `revision`, `actions`, `history`; chỉ admin xem
  thông tin đối chiếu và ghi chú nội bộ. Không trả token người đăng ký.
- `registration`/`evidence` cho chủ hồ sơ thêm trạng thái, `public_reason`,
  `hold_reserved`. `can_submit` lấy từ máy chủ; chủ hồ sơ không thấy lịch sử nội bộ.
- `evidence_upload` tăng phiên bản và xóa yêu cầu bổ sung hiện hành sau khi lưu
  ảnh mới; lý do cũ vẫn nằm trong lịch sử xử lý. Ảnh giống ảnh cũ được trả lại như
  replay, không giả là minh chứng mới và không xóa yêu cầu bổ sung.

`lms-server/review.php` chạy migration cộng thêm bên trong `lmsDB`:

- `lms_registrations`: thêm `review_status`, `review_version`, `review_reason`.
- `lms-server/review-migration.sql`: tạo `lms_review_history` với người xử lý,
  thời gian, trước/sau, phiên bản, ghi chú/lý do, số tiền thực nhận, mã giao dịch,
  hash định danh tài khoản nhận và hash yêu cầu/payload. Đánh dấu
  `registration_review_v1` trong `lms_schema_migrations`.
- Không rebuild/drop bảng cũ hoặc đổi CHECK ban đầu. Trạng thái trình bày dùng
  `review_status` phủ lên trạng thái nền; `pending_review` vẫn thể hiện giữ chỗ,
  `expired` thể hiện nộp muộn không có chỗ, `cancelled` dùng cho hồ sơ từ chối.
- Giữ `lms_payments` làm snapshot tài khoản nhận của từng hồ sơ; không đọc cấu
  hình ngân hàng hiện tại để đối chiếu hồ sơ cũ. Không thêm bản sao hồ sơ/ảnh.

`BEGIN IMMEDIATE` khóa kiểm tra sức chứa và quyết định cùng transaction. Hồ sơ
đang giữ chỗ không bị đếm lần hai; hồ sơ nộp muộn chỉ được duyệt nếu còn chỗ.
Đã duyệt chờ cấp quyền và yêu cầu bổ sung từ hồ sơ đang giữ chỗ tiếp tục tính
vào sức chứa sau hạn 30 phút ban đầu. Yêu cầu bổ sung nộp muộn không tạo chỗ mới.
Từ chối chuyển trạng thái nền để chỗ được trả lại ngay.

Mỗi ảnh mới/quyết định tăng phiên bản. Gửi phiên bản cũ trả 409, không ghi đè.
Replay cùng yêu cầu chỉ trả quyết định đó khi hồ sơ chưa có phiên bản mới.
Unique index `(receiver_key, bank_transaction)` cho quyết định duyệt chặn dùng
một giao dịch hai lần trên cùng ngân hàng/BIN + số tài khoản snapshot. Mã giao
dịch được trim và chuyển chữ hoa; không nhận dạng mã trên ảnh hay tự đối chiếu
ngân hàng. Admin phải thực hiện đối chiếu thực tế.

Giao diện rút gọn không thu thập mã giao dịch nên không thể tự phát hiện cùng
một giao dịch ngân hàng bị xác nhận ở hai hồ sơ. Giáo viên chịu trách nhiệm đối
chiếu thực tế trước khi tick. API cũ có gửi mã giao dịch vẫn kiểm tra số tiền
và chặn mã trùng. Migration lịch sử sao chép đầy đủ các dòng/ID trong cùng
transaction để nới CHECK cho manual_confirmation; không xóa lịch sử hoặc bịa mã.

Giới hạn xử lý dùng cơ chế rate-limit hiện có, scope `review:`:
10 yêu cầu/phút/admin và 60/phút/IP; kể cả yêu cầu không hợp lệ sau xác thực/CSRF.
Mọi SQL, ảnh và dữ liệu riêng tiếp tục bị router chặn truy cập trực tiếp.

## Kiểm thử

```powershell
python tests/test_lms_review_http.py
node tests/test_lms_review_frontend.cjs
python tests/test_lms_admin_http.py
python tests/test_lms_http.py
python tests/test_lms_payment_http.py
python tests/test_lms_evidence_http.py
node tests/test_lms_admin_frontend.cjs
node tests/test_lms_frontend.cjs
node tests/test_lms_payment_frontend.cjs
node tests/test_lms_evidence_frontend.cjs
```

HTTP test mới chạy hai PHP process chung SQLite/thư mục ảnh tạm ngoài webroot.
Kiểm tra ba admin, khách/học sinh/CSRF, số tiền/xác nhận, giao dịch trùng, replay,
vòng bổ sung ảnh, lý do/ghi chú, từ chối, hồ sơ nộp muộn, lớp đóng, chỗ cuối và
hai quyết định cạnh tranh. Kiểm tra users/ghi danh không đổi, giữ lịch sử,
integrity/foreign keys, migration lặp lại và quyền xem ảnh. Không dùng dữ liệu
thật hay chuyển tiền/email. Test frontend là DOM/API mô phỏng, chưa thay thế
kiểm thử trực tiếp trên trình duyệt máy tính/điện thoại.
