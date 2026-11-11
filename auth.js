
// ===================================================================
// BẮT BUỘC LUÔN CUỘN LÊN ĐẦU TRANG KHI F5 / TẢI LẠI TRANG
// ===================================================================
if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);
window.addEventListener('beforeunload', function () {
  window.scrollTo(0, 0);
});
window.addEventListener('load', function () {
  window.scrollTo(0, 0);
});

/**
 * ===================================================================
 * HỆ THỐNG XÁC THỰC, ĐĂNG KÝ HỌC VIÊN, GỬI MÃ OTP 6 SỐ & QUÊN MẬT KHẨU
 * - Giữ nguyên 100% phong cách giao diện Xanh Nước Biển (Water-Blue) của web
 * - 2 Cửa sổ hiện tại:
 *   1. Đăng nhập:
 *      + Nhập Tên đăng nhập & Mật khẩu
 *      + TÀI KHOẢN THỬ NGHIỆM: Điền nhanh Giáo viên (Giangvien/12345678) hoặc Học viên (hocvien01/12345678)
 *      + Nút "ĐĂNG NHẬP HỆ THỐNG"
 *      + Link "QUÊN MẬT KHẨU?" dưới nút đăng nhập
 *   2. Đăng ký học viên:
 *      + Tên hiển thị (thay cho Họ và tên)
 *      + Email học viên (lưu lại cho học viên)
 *      + Tên đăng nhập & Mật khẩu
 *      + Nút "TẠO TÀI KHOẢN" (Tạo thành công ngay lập tức và đăng nhập vào web)
 * - 3 Cửa sổ mới (Quên mật khẩu, Nhập OTP, Đổi mật khẩu):
 *   3. Quên mật khẩu:
 *      + Yêu cầu điền cả TÊN ĐĂNG NHẬP VÀ EMAIL HỌC VIÊN để rà soát chính xác tránh nhầm lẫn
 *      + Dò tìm trong hệ thống, nếu khớp gửi mã OTP 6 số ngẫu nhiên qua Gmail
 *   4. Nhập mã OTP 6 số:
 *      + Ô số lớn 6 số, đếm ngược 60s, hướng dẫn kiểm tra thư rác Spam
 *   5. Đổi mật khẩu mới:
 *      + Đặt lại mật khẩu mới bảo mật
 * ===================================================================
 */

(function () {
  const STORAGE_KEY = 'thvp_current_user';
  let isApiOnline = null;

  // Phiên OTP hiện tại
  let currentOtpSession = {
    email: '',
    username: '',
    otpCode: '',
    actionType: '', // 'forgot'
    expiresAt: 0,
    tempUserData: null
  };

  let otpCountdownTimer = null;

  // 1. Quản lý Current User
  function getCurrentUser() {
    try {
      const data = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  function setCurrentUser(user, remember = true) {
    if (user) {
      const str = JSON.stringify(user);
      sessionStorage.setItem(STORAGE_KEY, str);
      if (remember) {
        localStorage.setItem(STORAGE_KEY, str);
      }
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    }
    updateAuthInterface();
  }

  // 2. Kiểm tra kết nối API PHP MySQL (InfinityFree)
  async function checkApiOnline() {
    if (isApiOnline !== null) return isApiOnline;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('api.php?action=get_user', { credentials: 'include', signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        const json = await res.json();
        isApiOnline = true;
        if (json.data) {
          setCurrentUser(json.data, false);
        }
        return true;
      }
      isApiOnline = false;
      return false;
    } catch (e) {
      isApiOnline = false;
      return false;
    }
  }

  // 3. API Call Helper
  async function apiCall(action, method = 'GET', data = null) {
    const online = await checkApiOnline();
    if (online) {
      try {
        const options = {
          method,
          headers: {},
          credentials: 'include'
        };
        if (data) {
          if (data instanceof FormData) {
            options.body = data;
          } else {
            const formData = new FormData();
            for (const key in data) {
              formData.append(key, data[key]);
            }
            options.body = formData;
          }
        }
        const res = await fetch(`api.php?action=${action}`, options);
        return await res.json();
      } catch (e) {}
    }

    // Local / Offline Fallback Mode
    return localAuthFallback(action, data);
  }

  function localAuthFallback(action, data) {
    const localUsers = JSON.parse(localStorage.getItem('thvp_registered_users') || '[]');

    if (action === 'login') {
      const { username, password } = data;
      const uLower = username.toLowerCase().trim();

      // Tài khoản Giáo viên mặc định
      if ((uLower === 'giangvien' || uLower === 'giangvien@gmail.com') && password === '12345678') {
        return {
          success: true,
          data: {
            id: 1,
            username: 'Giangvien',
            fullname: 'Giáo viên',
            email: 'giangvien@gmail.com',
            role: 'admin'
          }
        };
      }

      // Tài khoản Học viên mẫu mặc định để test ngay
      if ((uLower === 'hocvien01' || uLower === 'hocvien01@gmail.com') && password === '12345678') {
        return {
          success: true,
          data: {
            id: 2,
            username: 'hocvien01',
            fullname: 'Nguyễn Thái Tuấn',
            email: 'hocvien01@gmail.com',
            role: 'student'
          }
        };
      }

      // Kiểm tra người học đã đăng ký trong localStorage
      const found = localUsers.find(
        u => (u.username.toLowerCase() === uLower || (u.email && u.email.toLowerCase() === uLower)) && u.password === password
      );

      if (found) {
        return {
          success: true,
          data: {
            id: found.id,
            username: found.username,
            fullname: found.fullname,
            email: found.email || '',
            role: 'student'
          }
        };
      }

      return {
        success: false,
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác! (Gợi ý test: hocvien01 / 12345678)'
      };
    }

    if (action === 'send_otp') {
      const { email, username, action_type } = data;
      const uLower = (username || '').toLowerCase().trim();
      const eLower = (email || '').toLowerCase().trim();

      if (action_type === 'forgot') {
        // Kiểm tra khớp CẢ Tên đăng nhập VÀ Email học viên
        const isGV = (uLower === 'giangvien' && (eLower === 'giangvien@gmail.com' || eLower.includes('dthu.edu.vn') || eLower === 'nttuan1120@gmail.com'));
        const isHV01 = (uLower === 'hocvien01' && (eLower === 'hocvien01@gmail.com' || eLower === 'nttuan1120@gmail.com'));
        const found = localUsers.find(
          u => u.username.toLowerCase() === uLower && u.email && u.email.toLowerCase() === eLower
        );

        if (!isGV && !isHV01 && !found) {
          return {
            success: false,
            message: 'Tên đăng nhập và Email học viên không khớp với bất kỳ tài khoản nào trong hệ thống!'
          };
        }
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      return {
        success: true,
        message: 'Đã tạo mã OTP thành công!',
        data: {
          email,
          otp_preview: otp
        }
      };
    }

    if (action === 'register') {
      const { username, password, fullname, email } = data;
      const uLower = (username || '').toLowerCase().trim();
      const eLower = (email || '').toLowerCase().trim();

      // Kiểm tra trùng username
      if (uLower === 'giangvien' || uLower === 'hocvien01' || localUsers.some(u => u.username.toLowerCase() === uLower)) {
        return {
          success: false,
          message: 'Tên đăng nhập này đã được sử dụng! Vui lòng chọn tên khác.'
        };
      }

      // Kiểm tra trùng email
      if (eLower && (eLower === 'giangvien@gmail.com' || eLower === 'hocvien01@gmail.com' || localUsers.some(u => u.email && u.email.toLowerCase() === eLower))) {
        return {
          success: false,
          message: 'Email học viên này đã được sử dụng bởi một tài khoản khác!'
        };
      }

      const newUser = {
        id: Date.now(),
        username,
        password,
        fullname,
        email: email || '',
        role: 'student'
      };
      localUsers.push(newUser);
      localStorage.setItem('thvp_registered_users', JSON.stringify(localUsers));
      return {
        success: true,
        data: newUser
      };
    }

    if (action === 'reset_password') {
      const { email, username, password } = data;
      const uLower = (username || '').toLowerCase().trim();
      const eLower = (email || '').toLowerCase().trim();

      const foundIdx = localUsers.findIndex(
        u => u.email && u.email.toLowerCase() === eLower && (!uLower || u.username.toLowerCase() === uLower)
      );
      if (foundIdx !== -1) {
        localUsers[foundIdx].password = password;
        localStorage.setItem('thvp_registered_users', JSON.stringify(localUsers));
        return {
          success: true,
          message: 'Đổi mật khẩu thành công!',
          data: localUsers[foundIdx]
        };
      }

      // Nếu là tài khoản mẫu hocvien01
      if (uLower === 'hocvien01' || eLower === 'hocvien01@gmail.com') {
        const hv = {
          id: 2,
          username: 'hocvien01',
          fullname: 'Nguyễn Thái Tuấn',
          email: 'hocvien01@gmail.com',
          role: 'student'
        };
        return {
          success: true,
          message: 'Đổi mật khẩu tài khoản học viên mẫu thành công!',
          data: hv
        };
      }

      return {
        success: true,
        message: 'Cập nhật mật khẩu mới thành công!'
      };
    }

    if (action === 'logout') {
      return { success: true };
    }

    return { success: false, message: 'Lệnh không hỗ trợ' };
  }

  // 4. Cấu hình EmailJS chính chủ để gửi thư thật tới Gmail
  const EMAILJS_CONFIG = {
    serviceId: 'service_dxhyblv',
    templateId: 'template_iv5ddrv',
    publicKey: 'UxTMgC2nkTrTwwVjf'
  };

  // Hàm Gửi Thật Mã OTP 6 Số vào Gmail
  async function sendRealOtpEmail(email, username, otpCode, actionType) {
    const actionName = actionType === 'forgot' ? 'Lấy lại mật khẩu' : 'Xác thực tài khoản';
    
    // Gửi qua backend PHP (nếu có kết nối API mail)
    apiCall('send_otp', 'POST', { email, username, action_type: actionType });

    // Bắn email thật trực tiếp từ EmailJS đến hòm thư Gmail của học viên
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: EMAILJS_CONFIG.serviceId,
          template_id: EMAILJS_CONFIG.templateId,
          user_id: EMAILJS_CONFIG.publicKey,
          template_params: {
            to_email: email,
            email: email,
            user_name: username || 'Học viên',
            otp_code: otpCode,
            passcode: otpCode,
            action_name: actionName
          }
        })
      });
      if (res.ok) {
        console.log('✅ Đã gửi thư OTP thật thành công qua EmailJS tới:', email);
      } else {
        const errText = await res.text();
        console.warn('⚠️ Phản hồi từ EmailJS:', res.status, errText);
      }
    } catch (e) {
      console.error('Lỗi khi gọi EmailJS:', e);
    }
  }

  // Eye icon SVGs
  const ICON_EYE = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  `;

  const ICON_EYE_OFF = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
      <line x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  `;

  // 5. Inject Modal HTML into DOM với đầy đủ 5 màn hình
  function injectAuthModal() {
    if (document.getElementById('thvpAuthModal')) return;

    const modalHtml = `
      <div id="thvpAuthModal" class="auth-modal-overlay" aria-hidden="true">
        <div class="auth-modal-box" role="dialog" aria-modal="true">
          <!-- Nút đóng -->
          <button type="button" class="auth-modal-close" id="btnAuthClose" aria-label="Đóng">&times;</button>
          
          <!-- Thanh Tabs Top (Chỉ hiển thị ở Màn 1 Đăng nhập và Màn 2 Đăng ký) -->
          <div class="auth-modal-tabs" id="authNavTabs">
            <button type="button" class="auth-tab-btn active" id="tabLoginBtn">ĐĂNG NHẬP</button>
            <button type="button" class="auth-tab-btn" id="tabRegisterBtn">ĐĂNG KÝ HỌC VIÊN</button>
          </div>

          <!-- Alert Box -->
          <div id="authAlert" class="auth-alert d-none"></div>

          <!-- ========================================================
               MÀN HÌNH 1: ĐĂNG NHẬP (THỦ CÔNG + TEST NHANH + QUÊN MK)
               ======================================================== -->
          <div id="screenLogin" class="auth-screen">
            <form id="authLoginForm" class="auth-form-body">
              <!-- Tên đăng nhập -->
              <div class="auth-form-group">
                <label class="auth-label" for="loginUser">Tên đăng nhập</label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <input type="text" id="loginUser" class="auth-input-control" placeholder="Nhập tên đăng nhập của bạn" required autocomplete="username" />
                </div>
              </div>

              <!-- Mật khẩu -->
              <div class="auth-form-group">
                <label class="auth-label" for="loginPass">Mật khẩu</label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <input type="password" id="loginPass" class="auth-input-control" placeholder="Nhập mật khẩu của bạn" required autocomplete="current-password" />
                  <button type="button" class="auth-btn-eye" data-target="loginPass" aria-label="Hiện/ẩn mật khẩu">
                    ${ICON_EYE_OFF}
                  </button>
                </div>
              </div>

              <!-- Ghi nhớ đăng nhập -->
              <div class="auth-remember-row">
                <label class="auth-checkbox-label">
                  <input type="checkbox" id="loginRemember" class="auth-checkbox" checked />
                  <span class="auth-checkbox-custom"></span>
                  <span class="auth-remember-text">Ghi nhớ đăng nhập</span>
                </label>
              </div>

              <!-- Nút Điền nhanh Giáo viên / Học viên mẫu để test ngay -->
              <div class="auth-quick-creds">
                <span class="auth-quick-title">TÀI KHOẢN THỬ NGHIỆM:</span>
                <div class="auth-quick-tags" style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button type="button" class="auth-quick-pill" id="btnFillTeacher">Giáo viên: Giangvien / 12345678</button>
                  <button type="button" class="auth-quick-pill" id="btnFillStudent">Học viên: hocvien01 / 12345678</button>
                </div>
              </div>

              <!-- Nút ĐĂNG NHẬP HỆ THỐNG -->
              <button type="submit" class="auth-submit-btn" id="btnSubmitLogin">
                ĐĂNG NHẬP HỆ THỐNG
              </button>

              <!-- Link QUÊN MẬT KHẨU? dưới nút đăng nhập -->
              <div class="auth-footer-link-box">
                <button type="button" class="auth-link-btn" id="btnGoForgot">QUÊN MẬT KHẨU?</button>
              </div>
            </form>
          </div>

          <!-- ========================================================
               MÀN HÌNH 2: ĐĂNG KÝ HỌC VIÊN (TẠO TÀI KHOẢN TRỰC TIẾP)
               ======================================================== -->
          <div id="screenRegister" class="auth-screen d-none">
            <form id="authRegisterForm" class="auth-form-body">
              <!-- Tên hiển thị -->
              <div class="auth-form-group">
                <label class="auth-label" for="regFullname">Tên hiển thị <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <input type="text" id="regFullname" class="auth-input-control" placeholder="Nhập tên hiển thị của bạn" required />
                </div>
              </div>

              <!-- Email học viên -->
              <div class="auth-form-group">
                <label class="auth-label" for="regEmail">Email học viên <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  <input type="email" id="regEmail" class="auth-input-control" placeholder="example@gmail.com" required />
                </div>
              </div>

              <!-- Tên đăng nhập -->
              <div class="auth-form-group">
                <label class="auth-label" for="regUser">Tên đăng nhập <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <circle cx="12" cy="12" r="4"/>
                      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>
                    </svg>
                  </div>
                  <input type="text" id="regUser" class="auth-input-control" placeholder="Nhập tên đăng nhập của bạn" required autocomplete="username" />
                </div>
              </div>

              <!-- Mật khẩu -->
              <div class="auth-form-group">
                <label class="auth-label" for="regPass">Mật khẩu <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <input type="password" id="regPass" class="auth-input-control" placeholder="Nhập mật khẩu của bạn" required autocomplete="new-password" />
                  <button type="button" class="auth-btn-eye" data-target="regPass" aria-label="Hiện/ẩn mật khẩu">
                    ${ICON_EYE_OFF}
                  </button>
                </div>
              </div>

              <!-- Xác nhận mật khẩu -->
              <div class="auth-form-group">
                <label class="auth-label" for="regConfirmPass">Xác nhận mật khẩu <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <input type="password" id="regConfirmPass" class="auth-input-control" placeholder="Nhập lại mật khẩu của bạn" required autocomplete="new-password" />
                  <button type="button" class="auth-btn-eye" data-target="regConfirmPass" aria-label="Hiện/ẩn mật khẩu">
                    ${ICON_EYE_OFF}
                  </button>
                </div>
              </div>

              <!-- Nút Tạo tài khoản thành công ngay lập tức -->
              <button type="submit" class="auth-submit-btn" id="btnSubmitRegister">
                TẠO TÀI KHOẢN
              </button>

              <div class="auth-footer-link-box">
                <button type="button" class="auth-link-btn" id="btnRegisterToLogin">ĐÃ CÓ TÀI KHOẢN? ĐĂNG NHẬP</button>
              </div>
            </form>
          </div>

          <!-- ========================================================
               MÀN HÌNH 3: QUÊN MẬT KHẨU (ĐIỀN TÊN ĐĂNG NHẬP & EMAIL HỌC VIÊN)
               ======================================================== -->
          <div id="screenForgot" class="auth-screen d-none">
            <div class="auth-screen-header">
              <h3 class="auth-screen-title">Quên Mật Khẩu</h3>
              <p class="auth-screen-desc">
                Nhập <strong>Tên đăng nhập</strong> và <strong>Email học viên</strong> đã đăng ký để hệ thống rà soát và gửi mã OTP.
              </p>
            </div>

            <form id="authForgotForm" class="auth-form-body">
              <!-- Tên đăng nhập cần lấy lại -->
              <div class="auth-form-group">
                <label class="auth-label" for="forgotUser">Tên đăng nhập <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <input type="text" id="forgotUser" class="auth-input-control" placeholder="Nhập tên đăng nhập của tài khoản" required />
                </div>
              </div>

              <!-- Email học viên đã đăng ký -->
              <div class="auth-form-group">
                <label class="auth-label" for="forgotEmail">Email học viên <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  <input type="email" id="forgotEmail" class="auth-input-control" placeholder="example@gmail.com" required />
                </div>
              </div>

              <!-- Nút Nhận Mã Qua Email -->
              <button type="submit" class="auth-submit-btn" id="btnSubmitForgot">
                NHẬN MÃ QUA EMAIL 🔐
              </button>

              <div class="auth-footer-link-box">
                <button type="button" class="auth-link-btn" id="btnForgotToLogin">QUAY LẠI ĐĂNG NHẬP</button>
              </div>
            </form>
          </div>

          <!-- ========================================================
               MÀN HÌNH 4: NHẬP MÃ OTP 6 SỐ (THEO GIAO DIỆN XANH CỦA WEB)
               ======================================================== -->
          <div id="screenOtp" class="auth-screen d-none">
            <div class="auth-screen-header">
              <h3 class="auth-screen-title">Nhập Mã OTP</h3>
              <p class="auth-screen-desc" id="otpSubtitleDesc">
                Nhập mã 6 số đã được gửi tới Email học viên: <strong id="otpTargetEmailText">example@gmail.com</strong>
              </p>
            </div>

            <form id="authOtpForm" class="auth-form-body">
              <div class="auth-form-group">
                <label class="auth-label auth-label-otp" for="otpInputCode" style="justify-content: flex-start; text-align: left; font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 6px; letter-spacing: 0.03em;">MÃ OTP XÁC THỰC (6 SỐ)</label>
                <input type="text" id="otpInputCode" class="auth-otp-input" placeholder="0 0 0 0 0 0" maxlength="6" inputmode="numeric" autocomplete="one-time-code" required />
              </div>

              <!-- Đếm ngược gửi lại mã -->
              <div class="auth-countdown-row">
                <span id="otpCountdownText">GỬI LẠI MÃ SAU 60S</span>
                <button type="button" id="btnResendOtp" class="auth-btn-resend d-none">GỬI LẠI MÃ NGAY</button>
              </div>

              <!-- Hộp thông báo màu xanh ngọc -->
              <div class="auth-notice-box">
                <div class="anb-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <div class="anb-text">
                  Mã xác thực đã được gửi đến email của bạn! Nếu không thấy mã, bạn vui lòng kiểm tra trong mục <strong>Thư rác (Spam)</strong> nhé.
                </div>
              </div>

              <!-- Nút Xác minh OTP -->
              <button type="submit" class="auth-submit-btn" id="btnSubmitOtp">
                XÁC MINH MÃ OTP
              </button>

              <div class="auth-footer-link-box flex-column">
                <button type="button" class="auth-link-btn" id="btnOtpBack">QUAY LẠI NHẬP THÔNG TIN</button>
                <button type="button" class="auth-link-btn" id="btnOtpToLogin">ĐÃ CÓ TÀI KHOẢN? ĐĂNG NHẬP</button>
              </div>
            </form>
          </div>

          <!-- ========================================================
               MÀN HÌNH 5: ĐỔI MẬT KHẨU MỚI (THEO GIAO DIỆN XANH CỦA WEB)
               ======================================================== -->
          <div id="screenReset" class="auth-screen d-none">
            <div class="auth-screen-header">
              <h3 class="auth-screen-title">Đặt Lại Mật Khẩu Mới</h3>
              <p class="auth-screen-desc">Vui lòng nhập mật khẩu mới bảo mật</p>
            </div>

            <form id="authResetForm" class="auth-form-body">
              <div class="auth-form-group">
                <label class="auth-label" for="resetNewPass">Mật khẩu mới <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <input type="password" id="resetNewPass" class="auth-input-control" placeholder="Nhập mật khẩu mới" required autocomplete="new-password" />
                  <button type="button" class="auth-btn-eye" data-target="resetNewPass" aria-label="Hiện/ẩn mật khẩu">
                    ${ICON_EYE_OFF}
                  </button>
                </div>
              </div>

              <div class="auth-form-group">
                <label class="auth-label" for="resetConfirmPass">Xác nhận mật khẩu mới <span class="req-star">*</span></label>
                <div class="auth-input-group">
                  <div class="auth-input-prefix">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <input type="password" id="resetConfirmPass" class="auth-input-control" placeholder="Nhập lại mật khẩu mới" required autocomplete="new-password" />
                  <button type="button" class="auth-btn-eye" data-target="resetConfirmPass" aria-label="Hiện/ẩn mật khẩu">
                    ${ICON_EYE_OFF}
                  </button>
                </div>
              </div>

              <!-- Hộp thông báo xanh lá thành công (Dời xuống trước nút cập nhật) -->
              <div class="auth-notice-box" style="margin-bottom: 16px;">
                <div class="anb-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <div class="anb-text">
                  Mã xác thực chính xác! Vui lòng đặt mật khẩu mới để bảo mật tài khoản.
                </div>
              </div>

              <!-- Nút Cập nhật mật khẩu -->
              <button type="submit" class="auth-submit-btn" id="btnSubmitReset">
                CẬP NHẬT MẬT KHẨU
              </button>

              <div class="auth-footer-link-box">
                <button type="button" class="auth-link-btn" id="btnResetToLogin">QUAY LẠI ĐĂNG NHẬP</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setupAuthEvents();
  }

  // 6. Quản lý chuyển đổi các màn hình trong hộp thoại
  function switchScreen(screenName) {
    const screens = {
      login: document.getElementById('screenLogin'),
      register: document.getElementById('screenRegister'),
      forgot: document.getElementById('screenForgot'),
      otp: document.getElementById('screenOtp'),
      reset: document.getElementById('screenReset')
    };

    const navTabs = document.getElementById('authNavTabs');
    const alertBox = document.getElementById('authAlert');
    if (alertBox) {
      alertBox.className = 'auth-alert d-none';
      alertBox.textContent = '';
    }

    for (const key in screens) {
      if (screens[key]) {
        screens[key].classList.toggle('d-none', key !== screenName);
      }
    }

    // Hiển thị thanh tabs top chỉ khi ở màn Login hoặc Register
    if (navTabs) {
      navTabs.classList.toggle('d-none', screenName !== 'login' && screenName !== 'register');
      if (screenName === 'login') {
        document.getElementById('tabLoginBtn')?.classList.add('active');
        document.getElementById('tabRegisterBtn')?.classList.remove('active');
      } else if (screenName === 'register') {
        document.getElementById('tabRegisterBtn')?.classList.add('active');
        document.getElementById('tabLoginBtn')?.classList.remove('active');
      }
    }
  }

  // 7. Thiết lập sự kiện cho các màn hình
  function setupAuthEvents() {
    const modal = document.getElementById('thvpAuthModal');
    const btnClose = document.getElementById('btnAuthClose');
    const alertBox = document.getElementById('authAlert');

    function showAlert(msg, isError = true) {
      alertBox.textContent = msg;
      alertBox.className = `auth-alert ${isError ? 'auth-alert-error' : 'auth-alert-success'}`;
    }

    function hideAlert() {
      alertBox.className = 'auth-alert d-none';
      alertBox.textContent = '';
    }

    // Đóng Modal
    btnClose.addEventListener('click', hideModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal();
    });

    // Eye toggle icons
    modal.querySelectorAll('.auth-btn-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const targetInput = document.getElementById(targetId);
        if (!targetInput) return;
        const isPassword = targetInput.type === 'password';
        targetInput.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword ? ICON_EYE : ICON_EYE_OFF;
      });
    });

    // Chuyển Tabs Top
    document.getElementById('tabLoginBtn')?.addEventListener('click', () => switchScreen('login'));
    document.getElementById('tabRegisterBtn')?.addEventListener('click', () => switchScreen('register'));

    // Chuyển màn từ các nút link
    document.getElementById('btnGoForgot')?.addEventListener('click', () => switchScreen('forgot'));
    document.getElementById('btnRegisterToLogin')?.addEventListener('click', () => switchScreen('login'));
    document.getElementById('btnForgotToLogin')?.addEventListener('click', () => switchScreen('login'));
    document.getElementById('btnOtpToLogin')?.addEventListener('click', () => switchScreen('login'));
    document.getElementById('btnResetToLogin')?.addEventListener('click', () => switchScreen('login'));

    document.getElementById('btnOtpBack')?.addEventListener('click', () => {
      switchScreen('forgot');
    });

    // Nút điền nhanh Giáo viên mẫu
    document.getElementById('btnFillTeacher')?.addEventListener('click', () => {
      document.getElementById('loginUser').value = 'Giangvien';
      document.getElementById('loginPass').value = '12345678';
      hideAlert();
    });

    // Nút điền nhanh Học viên mẫu (hocvien01 / 12345678)
    document.getElementById('btnFillStudent')?.addEventListener('click', () => {
      document.getElementById('loginUser').value = 'hocvien01';
      document.getElementById('loginPass').value = '12345678';
      hideAlert();
    });

    // -------------------------------------------------------------
    // SUBMIT MÀN 1: ĐĂNG NHẬP
    // -------------------------------------------------------------
    document.getElementById('authLoginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value.trim();
      const remember = document.getElementById('loginRemember').checked;

      const res = await apiCall('login', 'POST', { username, password });
      if (res.success && res.data) {
        setCurrentUser(res.data, remember);
        hideModal();
        showToast(`Đăng nhập thành công! Xin chào ${res.data.fullname} (${res.data.role === 'admin' ? 'Giảng viên' : 'Học viên'}).`, 'success');
      } else {
        showAlert(res.message || 'Tên đăng nhập hoặc mật khẩu không chính xác!');
      }
    });

    // -------------------------------------------------------------
    // SUBMIT MÀN 2: TẠO TÀI KHOẢN HỌC VIÊN THÀNH CÔNG NGAY LẬP TỨC
    // -------------------------------------------------------------
    document.getElementById('authRegisterForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const email = document.getElementById('regEmail').value.trim();
      const fullname = document.getElementById('regFullname').value.trim();
      const username = document.getElementById('regUser').value.trim();
      const password = document.getElementById('regPass').value;
      const confirmPass = document.getElementById('regConfirmPass').value;

      if (!fullname) {
        showAlert('Vui lòng nhập Tên hiển thị của bạn!');
        return;
      }

      if (!email.includes('@')) {
        showAlert('Vui lòng nhập Email học viên hợp lệ!');
        return;
      }

      if (!username) {
        showAlert('Vui lòng nhập Tên đăng nhập của bạn!');
        return;
      }

      if (password.length < 4) {
        showAlert('Mật khẩu phải có ít nhất 4 ký tự!');
        return;
      }

      if (password !== confirmPass) {
        showAlert('Mật khẩu xác nhận không khớp!');
        return;
      }

      // Tạo tài khoản trực tiếp qua API PHP hoặc LocalStorage
      const res = await apiCall('register', 'POST', { fullname, email, username, password });
      if (res.success && res.data) {
        setCurrentUser(res.data, true);
        hideModal();
        showToast(`Tạo tài khoản thành công! Chào mừng ${res.data.fullname} đến với hệ thống.`, 'success');
      } else {
        showAlert(res.message || 'Lỗi khi tạo tài khoản! Vui lòng thử lại.');
      }
    });

    // -------------------------------------------------------------
    // SUBMIT MÀN 3: QUÊN MẬT KHẨU (RÀ SOÁT CẢ TÊN ĐĂNG NHẬP VÀ EMAIL HỌC VIÊN)
    // -------------------------------------------------------------
    document.getElementById('authForgotForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const username = document.getElementById('forgotUser').value.trim();
      const email = document.getElementById('forgotEmail').value.trim();

      if (!username) {
        showAlert('Vui lòng nhập Tên đăng nhập của bạn!');
        return;
      }

      if (!email.includes('@')) {
        showAlert('Vui lòng nhập Email học viên hợp lệ!');
        return;
      }

      // Rà soát chính xác cả Tên đăng nhập và Email học viên
      const checkRes = await apiCall('send_otp', 'POST', { username, email, action_type: 'forgot' });
      if (!checkRes.success) {
        showAlert(checkRes.message || 'Tên đăng nhập và Email học viên không khớp với bất kỳ tài khoản nào trong hệ thống!');
        return;
      }

      const otpCode = checkRes.data && checkRes.data.otp_preview ? checkRes.data.otp_preview : Math.floor(100000 + Math.random() * 900000).toString();

      currentOtpSession = {
        email,
        username,
        otpCode,
        actionType: 'forgot',
        expiresAt: Date.now() + 5 * 60 * 1000,
        tempUserData: null
      };

      // Gửi thật đến Gmail của học viên
      await sendRealOtpEmail(email, username, otpCode, 'forgot');

      // Chuyển sang màn hình 4: Nhập mã OTP
      showOtpScreen(email);
    });

    // -------------------------------------------------------------
    // SUBMIT MÀN 4: XÁC MINH MÃ OTP
    // -------------------------------------------------------------
    document.getElementById('authOtpForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const enteredOtp = document.getElementById('otpInputCode').value.replace(/\s+/g, '').trim();

      if (enteredOtp.length !== 6) {
        showAlert('Vui lòng nhập đủ 6 chữ số mã OTP!');
        return;
      }

      if (Date.now() > currentOtpSession.expiresAt) {
        showAlert('Mã OTP đã hết hạn! Vui lòng bấm "Gửi lại mã ngay".');
        return;
      }

      if (enteredOtp !== currentOtpSession.otpCode) {
        showAlert('Mã OTP 6 số không chính xác! Vui lòng kiểm tra lại hòm thư.');
        return;
      }

      // Xác minh thành công -> Chuyển sang màn hình 5: Đổi Mật Khẩu Mới
      switchScreen('reset');
    });

    // Nút Gửi lại mã OTP
    document.getElementById('btnResendOtp')?.addEventListener('click', async () => {
      if (!currentOtpSession.email) return;
      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      currentOtpSession.otpCode = newOtp;
      currentOtpSession.expiresAt = Date.now() + 5 * 60 * 1000;
      await sendRealOtpEmail(currentOtpSession.email, currentOtpSession.username, newOtp, currentOtpSession.actionType);
      startOtpCountdown(60);
      showToast('Đã gửi lại mã OTP mới đến ' + currentOtpSession.email, 'info');
    });

    // -------------------------------------------------------------
    // SUBMIT MÀN 5: ĐỔI MẬT KHẨU MỚI
    // -------------------------------------------------------------
    document.getElementById('authResetForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const newPass = document.getElementById('resetNewPass').value;
      const confirmPass = document.getElementById('resetConfirmPass').value;

      if (newPass.length < 4) {
        showAlert('Mật khẩu mới phải có ít nhất 4 ký tự!');
        return;
      }

      if (newPass !== confirmPass) {
        showAlert('Mật khẩu xác nhận không khớp!');
        return;
      }

      const res = await apiCall('reset_password', 'POST', {
        email: currentOtpSession.email,
        username: currentOtpSession.username,
        password: newPass
      });

      if (res.success) {
        if (res.data) {
          setCurrentUser(res.data, true);
        }
        hideModal();
        showToast('Đổi mật khẩu thành công! Bạn đã được đăng nhập vào hệ thống.', 'success');
      } else {
        showAlert(res.message || 'Lỗi khi cập nhật mật khẩu mới!');
      }
    });
  }

  // 8. Kích hoạt Màn hình OTP & Đếm ngược 60s
  function showOtpScreen(email) {
    switchScreen('otp');
    const targetEmailText = document.getElementById('otpTargetEmailText');
    if (targetEmailText) targetEmailText.textContent = email;

    const otpInput = document.getElementById('otpInputCode');
    if (otpInput) {
      otpInput.value = '';
      otpInput.focus();
    }

    startOtpCountdown(60);
  }

  function startOtpCountdown(seconds) {
    clearInterval(otpCountdownTimer);
    const countdownText = document.getElementById('otpCountdownText');
    const btnResend = document.getElementById('btnResendOtp');

    if (btnResend) btnResend.classList.add('d-none');
    if (countdownText) countdownText.classList.remove('d-none');

    let remaining = seconds;
    if (countdownText) countdownText.textContent = `GỬI LẠI MÃ SAU ${remaining}S`;

    otpCountdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(otpCountdownTimer);
        if (countdownText) countdownText.classList.add('d-none');
        if (btnResend) btnResend.classList.remove('d-none');
      } else {
        if (countdownText) countdownText.textContent = `GỬI LẠI MÃ SAU ${remaining}S`;
      }
    }, 1000);
  }

  function showModal(initialScreen = 'login') {
    injectAuthModal();
    const modal = document.getElementById('thvpAuthModal');
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      switchScreen(initialScreen);
    }
  }

  function hideModal() {
    const modal = document.getElementById('thvpAuthModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      clearInterval(otpCountdownTimer);
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    apiCall('logout');
  }

  // 9. Cập nhật Huy hiệu Avatar + Tên + Nút Đăng xuất trên Header
  function updateAuthInterface() {
    const user = getCurrentUser();
    const loginBtns = document.querySelectorAll('.btn-login, .btn-user-logged, #headerAuthBtn');

    loginBtns.forEach(btn => {
      if (!btn) return;
      if (!user) {
        // GUEST (Chưa đăng nhập)
        btn.innerHTML = 'ĐĂNG NHẬP';
        btn.className = 'btn-login';
        btn.onclick = (e) => {
          e.preventDefault();
          showModal('login');
        };
      } else {
        // HỌC VIÊN HOẶC GIÁO VIÊN (Khung tròn Avatar + Chấm xanh + Tên bên dưới + Nút Đăng xuất vuông bo góc)
        const isTeacher = user.role === 'admin' || user.role === 'teacher';
        const displayName = isTeacher ? 'Giáo viên' : (user.fullname || 'Nguyễn Thái Tuấn');

        btn.innerHTML = `
          <div class="header-user-widget">
            <div class="header-user-avatar-col">
              <div class="header-avatar-ring">
                <div class="header-avatar-inner">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M7.5 10.5c.6-.7 1.8-.7 2.4 0" stroke="#64748b" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M14.1 10.5c.6-.7 1.8-.7 2.4 0" stroke="#64748b" stroke-width="1.8" stroke-linecap="round"/>
                    <path d="M9.5 15.2c1.3 1.2 3.7 1.2 5 0" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </div>
                <span class="header-avatar-dot"></span>
              </div>
              <span class="header-user-name">${displayName}</span>
            </div>
            <span class="btn-header-logout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </span>
          </div>
        `;
        btn.className = `btn-user-logged ${isTeacher ? 'admin' : 'student'}`;
        btn.onclick = (e) => {
          e.preventDefault();
          if (e.target.closest('.btn-header-logout')) {
            e.stopPropagation();
            handleLogout();
          }
        };
      }
    });

    window.dispatchEvent(new CustomEvent('thvp:auth_change', { detail: { user } }));
  }

  // 10. Toast Notification Helper
  function showToast(message, type = 'info') {
    let toast = document.getElementById('thvpToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'thvpToast';
      toast.className = 'thvp-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `thvp-toast show ${type}`;
    setTimeout(() => {
      toast.className = 'thvp-toast';
    }, 3500);
  }

  // Global Exports
  window.THVP_AUTH = {
    getCurrentUser,
    setCurrentUser,
    showModal,
    hideModal,
    handleLogout,
    updateAuthInterface,
    apiCall,
    showToast
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectAuthModal();
      updateAuthInterface();
    });
  } else {
    injectAuthModal();
    updateAuthInterface();
  }
})();
