/**
 * ===================================================================
 * CHATBOT TƯ VẤN & HỖ TRỢ KHÓA HỌC LMS TIN HỌC VĂN PHÒNG
 * - Tự động hiển thị ở góc dưới bên phải trên tất cả các trang
 * - Tư vấn lựa chọn khóa học, Giải đáp lịch khai giảng, Hướng dẫn đăng ký
 * - Tiếp nhận yêu cầu hỗ trợ và chuyển đến người phụ trách đào tạo
 * ===================================================================
 */

(function () {
  // 1. Tự động tiêm HTML Chatbot vào cuối body
  function injectChatbotDOM() {
    if (document.getElementById('lmsChatbotRoot')) return;

    const chatbotHTML = `
      <div id="lmsChatbotRoot">
        <!-- Nút Chatbot nổi ở góc dưới bên phải -->
        <button type="button" class="lms-chatbot-btn" id="lmsChatbotToggleBtn" aria-label="Mở cửa sổ tư vấn khóa học">
          <div class="lms-chatbot-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="lms-chatbot-online-dot"></span>
          </div>
          <div class="lms-chatbot-btn-text">
            <span class="lms-chatbot-btn-title">Tư Vấn Khóa Học LMS</span>
            <span class="lms-chatbot-btn-sub">Trực tuyến 24/7 • Bấm để chat</span>
          </div>
          <span class="lms-chatbot-badge">1</span>
        </button>

        <!-- Khung chatbox (Popup) -->
        <div class="lms-chatbox-window" id="lmsChatboxWindow" role="dialog" aria-modal="true" aria-hidden="true">
          <!-- Chatbox Header -->
          <div class="lms-chatbox-header">
            <div class="lms-chatbox-user-info">
              <div class="lms-chatbox-header-avatar">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.2">
                  <path d="M12 2a8 8 0 0 0-8 8v4a8 8 0 0 0 16 0v-4a8 8 0 0 0-8-8z"></path>
                  <circle cx="9" cy="11" r="1.5" fill="#0284c7"></circle>
                  <circle cx="15" cy="11" r="1.5" fill="#0284c7"></circle>
                  <path d="M10 16h4"></path>
                </svg>
              </div>
              <div>
                <div class="lms-chatbox-header-title">Trợ Lý Tư Vấn LMS</div>
                <div class="lms-chatbox-header-status">Đang hoạt động (Giải đáp tức thì)</div>
              </div>
            </div>
            <div class="lms-chatbox-header-actions">
              <button type="button" class="lms-chatbox-btn-close" id="lmsChatboxCloseBtn" aria-label="Đóng cửa sổ chat">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Chatbox Body -->
          <div class="lms-chatbox-body" id="lmsChatboxBody">
            <!-- Bot message mặc định ban đầu -->
            <div class="lms-msg-row bot">
              <div class="lms-msg-avatar">LMS</div>
              <div class="lms-msg-bubble">
                Xin chào bạn! Mình là Trợ lý tư vấn hệ thống <strong>Tin Học Văn Phòng LMS</strong>. 
                <br /><br />
                Bạn đang quan tâm đến nội dung nào dưới đây? Hãy bấm chọn hoặc gửi câu hỏi để mình hỗ trợ nhé!
                <div class="lms-quick-reply-wrap" id="lmsInitialQuickReplies">
                  <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('tu_van_khoa_hoc')">
                    🎯 Tư vấn chọn khóa học phù hợp
                  </button>
                  <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('lich_khai_giang')">
                    📅 Xem lịch khai giảng các lớp sắp mở
                  </button>
                  <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('huong_dan_dang_ky')">
                    📝 Hướng dẫn các bước đăng ký & học phí
                  </button>
                  <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('gui_yeu_cau')">
                    👨‍🏫 Gửi yêu cầu hỗ trợ cho người phụ trách
                  </button>
                </div>
                <span class="lms-msg-time">Vừa xong</span>
              </div>
            </div>
          </div>

          <!-- Chatbox Footer Input -->
          <form class="lms-chatbox-footer" id="lmsChatInputForm" onsubmit="lmsChatbotSendMessage(event)">
            <input type="text" id="lmsChatInput" class="lms-chat-user-input" placeholder="Nhập câu hỏi của bạn tại đây..." autocomplete="off" />
            <button type="submit" class="lms-chat-send-btn" aria-label="Gửi tin nhắn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatbotHTML);
  }

  // 2. Xử lý mở / đóng Chatbox
  function setupChatbotEvents() {
    const toggleBtn = document.getElementById('lmsChatbotToggleBtn');
    const closeBtn = document.getElementById('lmsChatboxCloseBtn');
    const chatboxWindow = document.getElementById('lmsChatboxWindow');
    const badge = toggleBtn ? toggleBtn.querySelector('.lms-chatbot-badge') : null;

    if (toggleBtn && chatboxWindow) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = chatboxWindow.classList.contains('open');
        if (!isOpen) {
          chatboxWindow.classList.add('open');
          chatboxWindow.setAttribute('aria-hidden', 'false');
          if (badge) badge.style.display = 'none';
          const input = document.getElementById('lmsChatInput');
          if (input) setTimeout(() => input.focus(), 300);
        } else {
          chatboxWindow.classList.remove('open');
          chatboxWindow.setAttribute('aria-hidden', 'true');
        }
      });
    }

    if (closeBtn && chatboxWindow) {
      closeBtn.addEventListener('click', () => {
        chatboxWindow.classList.remove('open');
        chatboxWindow.setAttribute('aria-hidden', 'true');
      });
    }
  }

  // 3. Khởi tạo khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectChatbotDOM();
      setupChatbotEvents();
    });
  } else {
    injectChatbotDOM();
    setupChatbotEvents();
  }
})();

// Hàm cuộn xuống đáy tin nhắn
function lmsChatbotScrollToBottom() {
  const body = document.getElementById('lmsChatboxBody');
  if (body) {
    setTimeout(() => {
      body.scrollTop = body.scrollHeight;
    }, 50);
  }
}

// Thêm tin nhắn vào giao diện
function lmsAppendChatMessage(sender, text, isHTML = false) {
  const body = document.getElementById('lmsChatboxBody');
  if (!body) return;

  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  const row = document.createElement('div');
  row.className = `lms-msg-row ${sender}`;

  if (sender === 'bot') {
    row.innerHTML = `
      <div class="lms-msg-avatar">LMS</div>
      <div class="lms-msg-bubble">
        ${isHTML ? text : text.replace(/\n/g, '<br>')}
        <span class="lms-msg-time">${timeStr}</span>
      </div>
    `;
  } else {
    row.innerHTML = `
      <div class="lms-msg-bubble">
        ${text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
        <span class="lms-msg-time">${timeStr}</span>
      </div>
    `;
  }

  body.appendChild(row);
  lmsChatbotScrollToBottom();
}

// Xử lý khi người dùng chọn nút gợi ý nhanh
function lmsChatbotSelectOption(optionKey) {
  switch (optionKey) {
    case 'tu_van_khoa_hoc':
      lmsAppendChatMessage('user', 'Tôi muốn được tư vấn chọn khóa học phù hợp.');
      setTimeout(() => {
        const botReply = `
          Dạ, hệ thống LMS hiện có 4 chương trình đào tạo trọng tâm:
          <br><br>
          1️⃣ <strong>Tin học căn bản</strong>: Dành cho người mới bắt đầu làm quen máy tính, Windows và An toàn mạng.
          <br>
          2️⃣ <strong>Microsoft Word</strong>: Soạn thảo văn bản hành chính theo Nghị định 30, làm khóa luận, hợp đồng.
          <br>
          3️⃣ <strong>Microsoft Excel</strong>: Xử lý dữ liệu, hàm nâng cao (VLOOKUP, INDEX, IF lồng) & Dashboard báo cáo.
          <br>
          4️⃣ <strong>Microsoft PowerPoint</strong>: Thiết kế slide thuyết trình ấn tượng, Infographic thu hút.
          <br><br>
          👉 Bạn có thể xem chi tiết mục tiêu và đề cương tại trang: 
          <a href="danh-sach-khoa-hoc.html" style="color: #0284c7; font-weight: 700; text-decoration: underline;">Danh sách khóa học</a>
          <div class="lms-quick-reply-wrap" style="margin-top: 10px;">
            <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('lich_khai_giang')">
              📅 Xem lịch khai giảng các lớp trên
            </button>
            <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('gui_yeu_cau')">
              👨‍🏫 Nhờ Giảng viên tư vấn trực tiếp
            </button>
          </div>
        `;
        lmsAppendChatMessage('bot', botReply, true);
      }, 400);
      break;

    case 'lich_khai_giang':
      lmsAppendChatMessage('user', 'Xem lịch khai giảng các lớp sắp mở.');
      setTimeout(() => {
        const botReply = `
          Lịch khai giảng các lớp gần nhất trong tháng:<br><br>
          • <strong>Lớp LMS-CB01 (Combo Văn Phòng)</strong>: Khai giảng 18/11 (Tối 2-4-6 từ 19h30 - 21h30).<br>
          • <strong>Lớp LMS-EX02 (Excel Báo Cáo)</strong>: Khai giảng 20/11 (Tối 3-5-7 từ 19h30 - 21h30).<br>
          • <strong>Lớp LMS-WD03 (Word Hành Chính)</strong>: Khai giảng 22/11 (Tối 2-4-6 từ 18h00 - 19h30).<br>
          • <strong>Lớp LMS-PP04 (PowerPoint Thiết Kế)</strong>: Khai giảng 25/11 (Sáng T7 - CN từ 09h00 - 11h00).<br><br>
          💡 Hình thức: Trực tuyến qua LMS + Zoom trực tiếp với giảng viên. 
          <br><br>
          👉 Bạn xem chi tiết và lọc theo ca học tại trang: 
          <a href="lich-khai-giang.html" style="color: #0284c7; font-weight: 700; text-decoration: underline;">Lịch khai giảng đầy đủ</a>
          <div class="lms-quick-reply-wrap" style="margin-top: 10px;">
            <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('huong_dan_dang_ky')">
              📝 Hướng dẫn đăng ký và giữ chỗ ngay
            </button>
          </div>
        `;
        lmsAppendChatMessage('bot', botReply, true);
      }, 400);
      break;

    case 'huong_dan_dang_ky':
      lmsAppendChatMessage('user', 'Hướng dẫn cách đăng ký khóa học.');
      setTimeout(() => {
        const botReply = `
          Quy trình 6 bước đăng ký cực kỳ đơn giản:<br>
          <strong>Bước 1</strong>: Tạo tài khoản trên website.<br>
          <strong>Bước 2</strong>: Đăng nhập vào hệ thống.<br>
          <strong>Bước 3</strong>: Chọn khóa học bạn cần.<br>
          <strong>Bước 4</strong>: Chọn lịch học phù hợp.<br>
          <strong>Bước 5</strong>: Gửi thông tin và thanh toán học phí qua MBBank / MoMo (Cú pháp: <code>LMS [SĐT] [Mã lớp]</code>).<br>
          <strong>Bước 6</strong>: Nhận email kích hoạt tự động và truy cập vào khóa học.<br><br>
          👉 Xem hình ảnh hướng dẫn từng bước tại:
          <a href="huong-dan-dang-ky.html" style="color: #0284c7; font-weight: 700; text-decoration: underline;">Trang Hướng dẫn đăng ký</a>
        `;
        lmsAppendChatMessage('bot', botReply, true);
      }, 400);
      break;

    case 'gui_yeu_cau':
      lmsAppendChatMessage('user', 'Tôi muốn gửi yêu cầu hỗ trợ cho người phụ trách đào tạo.');
      setTimeout(() => {
        const formHTML = `
          Dạ, bạn vui lòng để lại thông tin vào biểu mẫu dưới đây, ThS. Nguyễn Thái Tuấn (Trưởng ban Đào tạo) hoặc tư vấn viên sẽ gọi điện/nhắn Zalo hỗ trợ bạn trong vòng 10-15 phút nhé:
          <form class="lms-chat-support-form" onsubmit="lmsChatbotSubmitSupportTicket(event)">
            <div class="lms-chat-support-title">📋 Thông tin yêu cầu hỗ trợ:</div>
            <input type="text" id="ticketFullName" class="lms-chat-input-field" placeholder="Họ và tên của bạn *" required />
            <input type="tel" id="ticketPhone" class="lms-chat-input-field" placeholder="Số điện thoại / Zalo *" required />
            <input type="email" id="ticketEmail" class="lms-chat-input-field" placeholder="Địa chỉ Email (nếu có)" />
            <textarea id="ticketContent" class="lms-chat-input-field" rows="2" placeholder="Câu hỏi hoặc yêu cầu cần tư vấn..."></textarea>
            <button type="submit" class="lms-chat-submit-btn">Gửi Đến Người Phụ Trách</button>
          </form>
        `;
        lmsAppendChatMessage('bot', formHTML, true);
      }, 400);
      break;
  }
}

// Xử lý gửi Form tiếp nhận yêu cầu hỗ trợ
function lmsChatbotSubmitSupportTicket(event) {
  event.preventDefault();
  const name = document.getElementById('ticketFullName')?.value.trim() || '';
  const phone = document.getElementById('ticketPhone')?.value.trim() || '';
  const email = document.getElementById('ticketEmail')?.value.trim() || '';
  const content = document.getElementById('ticketContent')?.value.trim() || '';

  if (!name || !phone) {
    alert('Vui lòng nhập Họ tên và Số điện thoại!');
    return;
  }

  // Lưu tạm vào LocalStorage
  const newTicket = {
    id: Date.now(),
    name,
    phone,
    email,
    content,
    createdAt: new Date().toISOString()
  };

  try {
    const existing = JSON.parse(localStorage.getItem('lms_support_tickets') || '[]');
    existing.push(newTicket);
    localStorage.setItem('lms_support_tickets', JSON.stringify(existing));
  } catch (e) {
    console.error(e);
  }

  // Ẩn form và thông báo thành công
  const form = event.target;
  form.innerHTML = `
    <div style="color: #059669; font-weight: 700; font-size: 0.88rem; line-height: 1.4;">
      ✅ Đã gửi yêu cầu thành công!<br>
      Cảm ơn bạn <strong>${name}</strong>. ThS. Nguyễn Thái Tuấn và ban đào tạo sẽ liên hệ qua SĐT <strong>${phone}</strong> để giải đáp cho bạn ngay.
    </div>
  `;
}

// Xử lý người dùng tự gõ câu hỏi vào ô input
function lmsChatbotSendMessage(event) {
  event.preventDefault();
  const input = document.getElementById('lmsChatInput');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;

  lmsAppendChatMessage('user', message);
  input.value = '';

  const lower = message.toLowerCase();

  setTimeout(() => {
    if (lower.includes('học phí') || lower.includes('bao nhiêu tiền') || lower.includes('giá') || lower.includes('chi phí')) {
      const reply = `
        Học phí các khóa học hiện đang được ưu đãi giảm đến 40%:<br>
        • Khóa Word hoặc PowerPoint: <strong>450.000 đ</strong> (Giá gốc 700.000 đ)<br>
        • Khóa Excel Chuyên sâu: <strong>490.000 đ</strong> (Giá gốc 800.000 đ)<br>
        • Combo Toàn diện (Word + Excel + PPT): <strong>690.000 đ</strong> (Giá gốc 1.200.000 đ)<br><br>
        👉 Bạn có thể xem thêm ưu đãi và phương thức thanh toán tại:
        <a href="huong-dan-dang-ky.html" style="color: #0284c7; font-weight: 700;">Hướng dẫn đăng ký &amp; Thanh toán</a>
      `;
      lmsAppendChatMessage('bot', reply, true);
    } else if (lower.includes('lịch') || lower.includes('khi nào') || lower.includes('khai giảng') || lower.includes('thời gian học')) {
      lmsChatbotSelectOption('lich_khai_giang');
    } else if (lower.includes('đăng ký') || lower.includes('cách học') || lower.includes('tham gia')) {
      lmsChatbotSelectOption('huong_dan_dang_ky');
    } else if (lower.includes('chứng chỉ') || lower.includes('mos') || lower.includes('ic3') || lower.includes('cntt')) {
      const reply = `
        Khóa học LMS cam kết chuẩn đầu ra 100% cho các chứng chỉ:<br>
        • <strong>Chứng chỉ Ứng dụng CNTT Cơ bản</strong> (theo Thông tư 03 của Bộ TTTT &amp; GDĐT)<br>
        • <strong>Chứng chỉ Tin học Quốc tế MOS (Microsoft Office Specialist)</strong><br>
        • <strong>Chứng chỉ Kỹ năng số Quốc tế IC3 GS6</strong><br><br>
        Bạn sẽ được cấp tài khoản làm hơn 1.000 câu hỏi thi thử có mã PIN chuẩn format thi thật!
      `;
      lmsAppendChatMessage('bot', reply, true);
    } else if (lower.includes('liên hệ') || lower.includes('hotline') || lower.includes('sđt') || lower.includes('giảng viên')) {
      lmsChatbotSelectOption('gui_yeu_cau');
    } else {
      const reply = `
        Cảm ơn câu hỏi của bạn! Hệ thống đã ghi nhận nội dung: <em>"${message}"</em>.<br><br>
        Bạn muốn mình hỗ trợ cụ thể về mục nào dưới đây:
        <div class="lms-quick-reply-wrap" style="margin-top: 10px;">
          <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('tu_van_khoa_hoc')">🎯 Xem danh sách &amp; mục tiêu các khóa học</button>
          <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('lich_khai_giang')">📅 Tra cứu lịch khai giảng</button>
          <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('gui_yeu_cau')">👨‍🏫 Chuyển câu hỏi này đến Giảng viên</button>
        </div>
      `;
      lmsAppendChatMessage('bot', reply, true);
    }
  }, 450);
}

