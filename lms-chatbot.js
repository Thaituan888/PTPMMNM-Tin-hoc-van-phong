/**
 * ===================================================================
 * CHATBOT TRỢ LÝ AI TƯ VẤN KHÓA HỌC & TÍNH NĂNG LMS TIN HỌC VĂN PHÒNG
 * - Tích hợp Google Gemini AI (gemini-3.5-flash-lite / gemini-3.1-flash-lite)
 * - TỰ ĐỘNG CẬP NHẬT thông tin 10 khóa học từ danh-sach-khoa-hoc.html
 * - GIỚI THIỆU CHI TIẾT TẤT CẢ CHỨC NĂNG CỦA WEBSITE:
 *   • Diễn đàn sinh viên & giảng viên (hỏi đáp bài tập, điểm tích lũy, avatar, phân quyền)
 *   • Luyện gõ phím 10 ngón (bàn phím ảo, đo WPM, accuracy)
 *   • Kiểm tra bàn phím (Keyboard Tester mô phỏng 104 phím)
 *   • Tìm hiểu bàn phím (nguyên lý 10 ngón, phím định vị F & J)
 *   • Tra cứu phím tắt (Windows, Word, Excel, PowerPoint)
 *   • Ôn luyện thi thử trắc nghiệm (3 dạng câu hỏi, chấm điểm tự động)
 *   • Lộ trình học tập, Lịch khai giảng, Hướng dẫn đăng ký
 * - LƯU TRỮ PHIÊN CHAT KHI CHUYỂN TRANG:
 *   • Chuyển qua trang/tính năng khác: Giữ nguyên đoạn chat và trạng thái mở
 *   • Khi F5 / Reload trang: Tự động đặt lại trạng thái ban đầu sạch sẽ
 * - 100% Giao diện hiện đại: Không dùng bất kỳ popup confirm/alert trình duyệt nào
 * ===================================================================
 */

(function () {
  // 1. CẤU HÌNH GEMINI API & DANH SÁCH MÔ HÌNH ƯU TIÊN
  const DEFAULT_GEMINI_API_KEY = 'AQ.Ab8RN6IMhEp2eRjMgT4FzZeWXYgpuFWrFyvNN6XigxlJmrfdbQ';
  const GEMINI_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash-lite'
  ];

  // Khóa lưu phiên chat trong sessionStorage
  const STORAGE_CHAT_MSGS_KEY = 'thvp_lms_chat_messages_v4';
  const STORAGE_CHAT_CONTEXT_KEY = 'thvp_lms_chat_context_v4';
  const STORAGE_CHAT_IS_OPEN_KEY = 'thvp_lms_chat_open_v4';

  // Cơ sở dữ liệu các khóa học chuẩn đồng bộ toàn diện với hệ thống LMS
  const DEFAULT_COURSES_DATA = {
    "co-ban": {
      "id": "co-ban",
      "name": "Tin học cơ bản",
      "groupName": "Khóa học chính quy LMS",
      "fee": "1.500.000 đ",
      "duration": "14 buổi (19:00 - 21:00)",
      "level": "Cơ bản cho người mới bắt đầu",
      "shortTagline": "Tự tin sử dụng máy tính, làm chủ công việc học tập và văn phòng hằng ngày.",
      "target": "Làm chủ máy tính, Windows, quản lý file; soạn thảo văn bản Word đúng thể thức; lập bảng tính Excel tính toán cơ bản; thiết kế bài trình chiếu PowerPoint; khai thác Internet an toàn.",
      "audience": "Người mới bắt đầu, học sinh, sinh viên cần chuẩn đầu ra CNTT Cơ bản, người đi làm muốn củng cố kỹ năng nền tảng.",
      "classes": [
        { "code": "CB-01", "teacher": "Tống Hoàng Thiên", "days": "Thứ 2, thứ 4 (19:00–21:00)", "link": "dang-ky-khoa-hoc.html?lop=CB-01" },
        { "code": "CB-02", "teacher": "Nguyễn Thái Tuấn", "days": "Thứ 3, thứ 5 (19:00–21:00)", "link": "dang-ky-khoa-hoc.html?lop=CB-02" },
        { "code": "CB-03", "teacher": "Trần Anh Khoa", "days": "Thứ 6, chủ nhật (19:00–21:00)", "link": "dang-ky-khoa-hoc.html?lop=CB-03" }
      ],
      "detailLink": "gioi-thieu-khoa-hoc.html?khoa=co-ban",
      "syllabus": [
        "Module 1: Hiểu biết về CNTT cơ bản, quản lý tệp và thư mục Windows",
        "Module 2: Soạn thảo và định dạng văn bản chuẩn thể thức với Microsoft Word",
        "Module 3: Nhập dữ liệu, tính toán cơ bản và trình bày bảng tính Microsoft Excel",
        "Module 4: Thiết kế bài trình chiếu sinh động và chuyên nghiệp với PowerPoint",
        "Module 5: Khai thác Internet an toàn, email, lưu trữ đám mây và chia sẻ tài liệu",
        "Module 6: Ôn tập đề thi chuẩn Ứng dụng CNTT Cơ bản (Thông tư 03)"
      ]
    },
    "nang-cao": {
      "id": "nang-cao",
      "name": "Tin học nâng cao",
      "groupName": "Khóa học chính quy LMS",
      "fee": "2.500.000 đ",
      "duration": "15 buổi (19:00 - 21:00)",
      "level": "Nâng cao & Chuyên sâu",
      "shortTagline": "Nâng cao kỹ năng văn phòng, xử lý công việc hiệu quả và trình bày kết quả chuyên nghiệp.",
      "target": "Word nâng cao (Mail Merge, Styles, mục lục tự động, bảo mật); Excel hàm phức tạp, PivotTable, Dashboard phân tích số liệu; PowerPoint thiết kế hiện đại, kỹ thuật trình chiếu.",
      "audience": "Người đã có kiến thức cơ bản, sinh viên chuẩn bị thực tập/tốt nghiệp, nhân viên kế toán, hành chính, nhân sự.",
      "classes": [
        { "code": "NC-01", "teacher": "Tống Hoàng Thiên", "days": "Thứ 3, thứ 5 (19:00–21:00)", "link": "dang-ky-khoa-hoc.html?lop=NC-01" },
        { "code": "NC-02", "teacher": "Nguyễn Thái Tuấn", "days": "Thứ 6, chủ nhật (19:00–21:00)", "link": "dang-ky-khoa-hoc.html?lop=NC-02" },
        { "code": "NC-03", "teacher": "Trần Anh Khoa", "days": "Thứ 2, thứ 4 (19:00–21:00)", "link": "dang-ky-khoa-hoc.html?lop=NC-03" }
      ],
      "detailLink": "gioi-thieu-khoa-hoc.html?khoa=nang-cao",
      "syllabus": [
        "Module 1: Word nâng cao: Định dạng tài liệu dài, mục lục tự động, phân chia Section",
        "Module 2: Thiết lập mẫu Form biểu, trộn thư Mail Merge & Khóa bảo mật văn bản",
        "Module 3: Excel hàm phức tạp (XLOOKUP, INDEX/MATCH, hàm logic kết hợp)",
        "Module 4: Phân tích số liệu và lập báo cáo quản trị động với PivotTable & Slicer",
        "Module 5: PowerPoint chuyên nghiệp: Bố cục trực quan, hiệu ứng Morph 3D & Infographic",
        "Module 6: Ôn tập đề thi chuẩn Ứng dụng CNTT Nâng cao và thực hành xử lý tình huống thực tế"
      ]
    },
    "word-van-phong": {
      "id": "word-van-phong",
      "name": "Word văn phòng chuyên sâu",
      "groupName": "Khóa học chuyên đề",
      "fee": "950.000 đ (Ưu đãi 450.000 đ)",
      "duration": "24 giờ (8 buổi)",
      "level": "Mọi trình độ",
      "shortTagline": "Soạn thảo và định dạng văn bản hành chính chuẩn quy định Nghị định 30.",
      "target": "Soạn thảo văn bản cực nhanh, đúng quy chuẩn Nghị định 30/2020/NĐ-CP; định dạng luận văn, đồ án tốt nghiệp.",
      "audience": "Nhân viên văn phòng, thư ký, trợ lý, sinh viên làm khóa luận tốt nghiệp.",
      "detailLink": "gioi-thieu-khoa-hoc.html?khoa=co-ban",
      "syllabus": [
        "Module 1: Quy chuẩn thể thức trình bày văn bản hành chính chuẩn Nhà nước",
        "Module 2: Căn chỉnh Font, Tab, Paragraph, Header/Footer đa trang",
        "Module 3: Tạo mục lục tự động, danh mục hình ảnh và chú thích tham chiếu",
        "Module 4: Xử lý bảng biểu, biểu đồ và chèn hình ảnh minh họa chuẩn",
        "Module 5: Kỹ thuật trộn thư Mail Merge xuất file hàng loạt",
        "Module 6: Khóa bảo vệ văn bản, phân quyền chỉnh sửa và xuất file PDF chuẩn in"
      ]
    },
    "excel-van-phong": {
      "id": "excel-van-phong",
      "name": "Excel văn phòng & Báo cáo",
      "groupName": "Khóa học chuyên đề",
      "fee": "1.200.000 đ (Ưu đãi 490.000 đ)",
      "duration": "30 giờ (10 buổi)",
      "level": "Mọi trình độ",
      "shortTagline": "Thành thạo lập bảng tính, sử dụng hàm thống kê và lập báo cáo quản trị.",
      "target": "Hiểu rõ bản chất các nhóm hàm; tự tin xử lý dữ liệu kế toán, tiền lương, bán hàng; xây dựng báo cáo PivotTable động.",
      "audience": "Nhân viên kế toán, tài chính, nhân sự, bán hàng, sinh viên kinh tế.",
      "detailLink": "gioi-thieu-khoa-hoc.html?khoa=nang-cao",
      "syllabus": [
        "Module 1: Cấu trúc bảng tính chuẩn & Kỹ thuật nhập liệu nhanh",
        "Module 2: Nhóm hàm toán học, xử lý chuỗi văn bản và ngày tháng",
        "Module 3: Nhóm hàm thống kê có điều kiện (COUNTIF, SUMIF, AVERAGEIF)",
        "Module 4: Nhóm hàm logic & Tìm kiếm dữ liệu nâng cao (IF, VLOOKUP, XLOOKUP)",
        "Module 5: Lọc nâng cao Advanced Filter & Định dạng có điều kiện",
        "Module 6: Xây dựng báo cáo động với PivotTable, Slicer và Dashboard trực quan"
      ]
    },
    "powerpoint-thuyet-trinh": {
      "id": "powerpoint-thuyet-trinh",
      "name": "PowerPoint thuyết trình & Thiết kế",
      "groupName": "Khóa học chuyên đề",
      "fee": "850.000 đ (Ưu đãi 450.000 đ)",
      "duration": "24 giờ (8 buổi)",
      "level": "Mọi trình độ",
      "shortTagline": "Thiết kế slide thuyết trình ấn tượng, hiện đại với hiệu ứng chuyên nghiệp.",
      "target": "Nắm vững nguyên lý thị giác, phối màu; thành thạo công cụ thiết kế slide; sử dụng hiệu ứng Animation & Transition tinh tế.",
      "audience": "Người thường xuyên thuyết trình báo cáo, giáo viên, chuyên viên đào tạo, sinh viên bảo vệ đồ án.",
      "detailLink": "gioi-thieu-khoa-hoc.html?khoa=co-ban",
      "syllabus": [
        "Module 1: Tư duy thiết kế slide hiện đại: Bố cục, Typography & Bánh xe màu sắc",
        "Module 2: Làm chủ Slide Master xây dựng hệ thống template đồng bộ thương hiệu",
        "Module 3: Trực quan hóa số liệu và quy trình với SmartArt và Icon đồ họa",
        "Module 4: Nghệ thuật sử dụng chuyển động Morph và hiệu ứng Zoom tương tác",
        "Module 5: Tích hợp Infographic, âm thanh, video và nhúng dữ liệu Excel",
        "Module 6: Kỹ năng trình chiếu chuyên nghiệp, Presenter View và xuất video 4K"
      ]
    },
    "ung-dung-ai": {
      "id": "ung-dung-ai",
      "name": "Ứng dụng AI trong công việc văn phòng",
      "groupName": "Khóa học chuyên đề",
      "fee": "1.200.000 đ",
      "duration": "24 giờ (8 buổi)",
      "level": "Mọi trình độ",
      "shortTagline": "Đột phá năng suất làm việc văn phòng cùng các trợ lý AI thông minh.",
      "target": "Nắm vững kỹ thuật viết câu lệnh (Prompt Engineering); ứng dụng AI tạo nội dung, công thức Excel và tự động hóa xử lý công việc.",
      "audience": "Nhân viên văn phòng, cán bộ quản lý, người làm kinh doanh muốn gia tăng hiệu suất vượt trội.",
      "detailLink": "khoa-hoc-lms.html",
      "syllabus": [
        "Module 1: Tổng quan các mô hình ngôn ngữ lớn: ChatGPT, Copilot, Gemini",
        "Module 2: Kỹ thuật viết câu lệnh Prompt Engineering đỉnh cao cho dân văn phòng",
        "Module 3: Sử dụng AI soạn thảo email chuyên nghiệp, công văn và báo cáo tóm tắt",
        "Module 4: Tận dụng AI để viết công thức Excel phức tạp và gỡ lỗi dữ liệu",
        "Module 5: Tạo slide thuyết trình tự động và biên tập nội dung cùng AI",
        "Module 6: Bảo mật thông tin doanh nghiệp và đạo đức khi khai thác Trí tuệ nhân tạo"
      ]
    },
    "on-luyen-mos": {
      "id": "on-luyen-mos",
      "name": "Luyện thi Chứng chỉ Quốc tế MOS (Word / Excel / PowerPoint)",
      "groupName": "Khóa học ôn luyện MOS",
      "fee": "1.200.000 đ - 1.400.000 đ/môn",
      "duration": "24 giờ (8 buổi/môn)",
      "level": "Cơ bản - Trung cấp",
      "shortTagline": "Luyện giải đề thi chuẩn quốc tế Certiport và tự tin đạt điểm cao bài thi MOS.",
      "target": "Nắm trọn vẹn 100% mục tiêu bài thi MOS; rèn phản xạ thao tác trên giao diện tiếng Anh chuẩn bài thi thật trong 50 phút.",
      "audience": "Sinh viên cần chứng chỉ chuẩn đầu ra tốt nghiệp, người đi làm cần bổ sung hồ sơ xin việc doanh nghiệp nước ngoài.",
      "detailLink": "khoa-hoc-lms.html",
      "syllabus": [
        "Module 1: Cấu trúc bài thi MOS và ma trận kỹ năng chuẩn Certiport",
        "Module 2: Luyện giải trọn bộ 5 đề thi thử sát đề thi thật có đồng hồ bấm giờ",
        "Module 3: Chiến thuật làm bài đạt điểm tối đa và khắc phục các bẫy mất điểm"
      ]
    }
  };

  // Danh sách các tin nhắn đã hiển thị (dùng để lưu/khôi phục khi chuyển trang)
  let chatMessagesList = [];
  // Lịch sử ngữ cảnh gọi Gemini API
  let conversationHistory = [];

  // 2. KIỂM TRA PHÂN BIỆT RELOAD TRANG (F5) VÀ CHUYỂN TRANG
  function isPageReload() {
    try {
      const navEntries = performance.getEntriesByType('navigation');
      if (navEntries && navEntries.length > 0) {
        return navEntries[0].type === 'reload';
      }
      if (window.performance && window.performance.navigation) {
        return window.performance.navigation.type === 1; // 1 = TYPE_RELOAD
      }
    } catch (e) {}
    return false;
  }

  // Quản lý vòng đời phiên chat: Xóa khi Reload (F5), giữ khi Chuyển trang
  function handleSessionLifecycle() {
    if (isPageReload()) {
      // Khi người dùng bấm F5 / Reload: XÓA SẠCH để trở về trạng thái ban đầu bình thường
      try {
        sessionStorage.removeItem(STORAGE_CHAT_MSGS_KEY);
        sessionStorage.removeItem(STORAGE_CHAT_CONTEXT_KEY);
        sessionStorage.removeItem(STORAGE_CHAT_IS_OPEN_KEY);
      } catch (e) {}
      conversationHistory = [];
      chatMessagesList = [];
      return false; // Báo hiệu đã làm mới
    }
    return true; // Giữ lại phiên nếu là chuyển trang
  }

  // Lấy và lưu API Key
  function getStoredApiKey() {
    const stored = localStorage.getItem('thvp_gemini_api_key');
    if (!stored || stored === 'AQ.Ab8RN6JaXlKoBS3qZ1F_6YMqkonOOIa9IPapekFa4NIRar9VaQ') {
      return DEFAULT_GEMINI_API_KEY;
    }
    return stored;
  }

  function saveStoredApiKey(key) {
    if (!key || !key.trim()) {
      localStorage.removeItem('thvp_gemini_api_key');
    } else {
      localStorage.setItem('thvp_gemini_api_key', key.trim());
    }
  }

  // 3. HÀM TỰ ĐỘNG CẬP NHẬT DỮ LIỆU KHÓA HỌC TỪ HỆ THỐNG LMS
  async function fetchLatestCoursesData(forceRefresh = false) {
    // 1. Nếu trên trang đã có sẵn dữ liệu chuẩn từ window.THVP_LMS_DATA (lms-data.js)
    if (typeof window !== 'undefined' && window.THVP_LMS_DATA && window.THVP_LMS_DATA.courses) {
      try {
        const live = window.THVP_LMS_DATA;
        const merged = { ...DEFAULT_COURSES_DATA };
        if (live.courses['co-ban']) {
          merged['co-ban'].fee = live.courses['co-ban'].feeVnd.toLocaleString('vi-VN') + ' đ';
          merged['co-ban'].message = live.courses['co-ban'].message;
        }
        if (live.courses['nang-cao']) {
          merged['nang-cao'].fee = live.courses['nang-cao'].feeVnd.toLocaleString('vi-VN') + ' đ';
          merged['nang-cao'].message = live.courses['nang-cao'].message;
        }
        localStorage.setItem('thvp_lms_courses_db', JSON.stringify(merged));
        return merged;
      } catch (e) {}
    }

    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem('thvp_lms_courses_db');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Object.keys(parsed).length > 0) {
            return parsed;
          }
        }
      } catch (e) {}
    }

    // 2. Thử fetch lms-server/classes.json để đồng bộ danh sách lớp và giảng viên mới nhất
    try {
      const res = await fetch('lms-server/classes.json?t=' + Date.now());
      if (res.ok) {
        const classes = await res.json();
        if (Array.isArray(classes) && classes.length > 0) {
          const merged = { ...DEFAULT_COURSES_DATA };
          classes.forEach(cls => {
            const k = cls.course_key;
            if (merged[k]) {
              if (!merged[k].classes) merged[k].classes = [];
              const exists = merged[k].classes.find(c => c.code === cls.code);
              if (!exists) {
                merged[k].classes.push({
                  code: cls.code,
                  teacher: cls.teacher,
                  days: `${cls.days} (${cls.time || '19:00–21:00'})`,
                  link: `dang-ky-khoa-hoc.html?lop=${cls.code}`
                });
              }
            }
          });
          try { localStorage.setItem('thvp_lms_courses_db', JSON.stringify(merged)); } catch (e) {}
          return merged;
        }
      }
    } catch (e) {}

    return DEFAULT_COURSES_DATA;
  }

  // 4. TỰ ĐỘNG SINH SYSTEM PROMPT ĐẦY ĐỦ KIẾN THỨC VỀ KHÓA HỌC & TẤT CẢ TÍNH NĂNG CỦA WEBSITE
  function buildDynamicSystemPrompt(coursesDb) {
    let coursesText = '';
    let count = 0;

    for (const key in coursesDb) {
      const c = coursesDb[key];
      count++;
      const syllabusList = Array.isArray(c.syllabus) ? c.syllabus.map(m => `    • ${m}`).join('\n') : '';
      let classesList = '';
      if (Array.isArray(c.classes) && c.classes.length > 0) {
        classesList = '\n- Các lớp học mở thường xuyên:\n' + c.classes.map(cl => `    • Lớp ${cl.code}: GV ${cl.teacher} | ${cl.days} | Đăng ký: ${cl.link}`).join('\n');
      }
      coursesText += `
${count}. ${c.name.toUpperCase()} (Mã: ${c.id || key} | Nhóm: ${c.groupName || 'Khóa học'})
- Học phí: ${c.fee || 'Liên hệ'} | Thời lượng: ${c.duration || 'Linh hoạt'} | Trình độ: ${c.level || 'Mọi trình độ'}
- Mô tả: ${c.shortTagline || c.message || ''}
- Mục tiêu: ${c.target || ''}
- Đối tượng phù hợp: ${c.audience || ''}${classesList}
- Xem chi tiết: ${c.detailLink || 'khoa-hoc-lms.html'}
- Đề cương các Module:
${syllabusList}
`;
    }

    return `
Bạn là Trợ lý AI Tư Vấn Thông Minh của Hệ thống Đào tạo Tin Học Văn Phòng LMS.
Nhiệm vụ của bạn:
1. Tư vấn chi tiết, chính xác về các khóa học, lộ trình học, học phí, lịch khai giảng, giảng viên và chứng chỉ.
2. HƯỚNG DẪN VÀ GIỚI THIỆU CHI TIẾT TẤT CẢ CÁC TÍNH NĂNG / TIỆN ÍCH TRÊN WEBSITE CÙNG VÍ DỤ MINH HỌA CỤ THỂ ĐỂ NGƯỜI DÙNG DỄ HÌNH DUNG VÀ SỬ DỤNG.

BỘ KIẾN THỨC TOÀN DIỆN VỀ CÁC TÍNH NĂNG TRÊN WEBSITE (ĐẦY ĐỦ VÀ CHÍNH XÁC NHẤT):
1. DIỄN ĐÀN HỌC TẬP & CỘNG ĐỒNG TIN HỌC (Trang: dien-dan.html):
- Dùng để làm gì: Mạng xã hội học tập dành riêng cho học sinh và giáo viên trao đổi bài tập, hỏi đáp thắc mắc, chia sẻ kinh nghiệm ôn thi và kết nối cùng lớp.
- Phân quyền Giáo viên và Học sinh:
  • Huy hiệu nhận diện: Có huy hiệu rõ ràng "🎓 Giáo viên" (viền vàng cam) và "🧑‍🎓 Học sinh" (viền xanh) trên từng bài viết và bình luận.
  • Quyền Giáo viên: Có đặc quyền ghim bài viết quan trọng lên đầu diễn đàn; có quyền xóa các bài viết hoặc bình luận của học sinh nếu vi phạm nội quy.
  • Quyền Học sinh: Được tự do đăng bài, hỏi bài tập, bình luận, thả cảm xúc; học sinh chỉ có quyền chỉnh sửa/xóa bài của chính mình.
- Tính năng nổi bật:
  • Đổi ảnh đại diện (Avatar): Chọn avatar mẫu có sẵn hoặc tải ảnh trực tiếp từ máy tính/điện thoại, tự động canh khung vuông 200x200 chuẩn đẹp, cập nhật ngay vào tất cả bài viết.
  • Bảng vàng tích điểm (Leaderboard): Tự động cộng điểm cống hiến (+10 điểm khi đăng bài, +3 điểm khi bình luận, điểm cảm xúc) để vinh danh Top thành viên năng nổ.
  • 5 biểu cảm phong phú: Thích (Like), Yêu thích (Love), Ý tưởng (Idea), Ngạc nhiên (Wow), Buồn (Sad).
  • Bình luận đa cấp: Trả lời lồng nhau, đính kèm ảnh minh họa giải bài tập.
  • Bộ lọc bài viết: Lọc theo Mới nhất, Bài Hot nhiều tương tác, Bài từ Giáo viên, Bài từ Học sinh, Bài Khoe điểm thi thử.

2. CÁC KHÓA HỌC CHÍNH QUY LMS (Trang: khoa-hoc-lms.html, gioi-thieu-khoa-hoc.html):
- Tin học cơ bản (Học phí 1.500.000 đ): 3 lớp CB-01 (GV Tống Hoàng Thiên, T2-T4), CB-02 (ThS. Nguyễn Thái Tuấn, T3-T5), CB-03 (GV Trần Anh Khoa, T6-CN). Giờ học 19:00 - 21:00.
- Tin học nâng cao (Học phí 2.500.000 đ): 3 lớp NC-01 (GV Tống Hoàng Thiên, T3-T5), NC-02 (ThS. Nguyễn Thái Tuấn, T6-CN), NC-03 (GV Trần Anh Khoa, T2-T4). Giờ học 19:00 - 21:00.
- Xem chi tiết từng khóa: gioi-thieu-khoa-hoc.html?khoa=co-ban hoặc gioi-thieu-khoa-hoc.html?khoa=nang-cao.

3. HỆ THỐNG ĐĂNG KÝ KHÓA HỌC & THANH TOÁN (Trang: dang-ky-khoa-hoc.html):
- Dùng để làm gì: Đăng ký giữ chỗ lớp học trực tuyến, chọn lịch học, quét mã VietQR tự động chuyển khoản học phí ngân hàng, tải lên biên lai/minh chứng chuyển khoản.
- Kích hoạt nhanh: Hệ thống xác thực và kích hoạt tài khoản học trong 10-15 phút.

4. LỚP HỌC CỦA TÔI (Trang: lop-hoc-cua-toi.html):
- Dành cho học sinh đã đăng ký và giáo viên giảng dạy: Vào lớp học trực tuyến, xem tài liệu bài giảng Word/Excel/PPT, nộp bài tập về nhà và nhận chấm điểm, phản hồi từ giáo viên.

5. QUẢN LÝ ĐĂNG KÝ (Trang: quan-ly-dang-ky.html):
- Dành cho ban quản trị và giáo viên: Quản lý danh sách học viên đăng ký, kiểm duyệt minh chứng đóng học phí, phân lớp tự động.

6. TIỆN ÍCH LUYỆN GÕ PHÍM 10 NGÓN (Trang: luyen-go-phim.html):
- Bàn phím ảo trực quan đổi màu theo từng ngón tay cần bấm; đồng hồ đo tốc độ gõ WPM (từ/phút), độ chính xác % và số lỗi sai thời gian thực.
- Nhiều cấp độ luyện tập từ hàng phím cơ sở (ASDF - JKL;) đến đoạn văn bản tiếng Việt hoàn chỉnh.

7. TIỆN ÍCH KIỂM TRA BÀN PHÍM - KEYBOARD TESTER (Trang: kiem-tra-ban-phim.html):
- Kiểm tra phần cứng bàn phím máy tính xem có nút nào bị liệt, kẹt phím hoặc lỗi ghosting. Bàn phím ảo 104 phím sáng đèn xác nhận ngay khi bấm phím thật.

8. TÌM HIỂU BÀN PHÍM & CẤU TẠO (Trang: tim-hieu-ban-phim.html):
- Hướng dẫn cấu trúc 5 khu vực phím và kỹ thuật đặt tay chuẩn công thái học với 2 phím định vị có gờ F và J.

9. TRA CỨU PHÍM TẮT NHANH (Trang: tra-cuu-phim-tat.html):
- Kho tra cứu hàng trăm tổ hợp phím tắt cho Windows, Word, Excel, PowerPoint với ô tìm kiếm tức thì.

10. HỆ THỐNG ÔN LUYỆN THI THỬ TRẮC NGHIỆM (Trang: on-luyen-thi-thu.html):
- Đề thi trắc nghiệm bấm giờ chuẩn kỳ thi Chứng chỉ CNTT Cơ bản và chứng chỉ quốc tế MOS/IC3; 3 dạng câu hỏi (chọn 1 đáp án, nhiều đáp án, ghép nối kéo thả); chấm điểm tự động và có nút chia sẻ điểm cao lên diễn đàn.

11. LỘ TRÌNH HỌC TẬP (Trang: lo-trinh-hoc-tap.html):
- Bản đồ định hướng lộ trình học 4 giai đoạn từ người mất gốc đến người làm chủ kỹ năng số công sở và đạt chứng chỉ quốc tế.

DỮ LIỆU ĐÀO TẠO VỀ CÁC KHÓA HỌC (${count} CHƯƠNG TRÌNH ĐÀO TẠO):
${coursesText}

CHÍNH SÁCH COMBO & HỌC PHÍ ƯU ĐÃI:
- Combo Toàn Diện (Word + Excel + PowerPoint): 690.000 đ (Tiết kiệm 40% so với giá gốc). Tặng giáo trình PDF + 200+ mẫu template văn bản/dashboard + tài khoản luyện thi hơn 1.000 câu.

ĐỘI NGŨ GIẢNG VIÊN GIẢNG DẠY:
- ThS. Nguyễn Thái Tuấn: Trưởng ban đào tạo, phụ trách lớp CB-02 và NC-02.
- Giảng viên Tống Hoàng Thiên: Chuyên gia tin học ứng dụng, phụ trách lớp CB-01 và NC-01.
- Giảng viên Trần Anh Khoa: Chuyên gia văn phòng và luyện thi MOS, phụ trách lớp CB-03 và NC-03.

PHONG CÁCH TƯ VẤN:
- Tự xưng là "mình" hoặc "em", gọi người học là "bạn" hoặc "anh/chị".
- Trả lời nhiệt tình, thân thiện, rõ ràng, định dạng gạch đầu dòng và emoji sinh động.
- Luôn cung cấp link trang web tương ứng (ví dụ: dien-dan.html, dang-ky-khoa-hoc.html, gioi-thieu-khoa-hoc.html,...) để người dùng dễ dàng bấm vào xem ngay.
`;
  }

  // 5. TỰ ĐỘNG CHÈN HTML CHATBOX VÀO BODY
  function injectChatbotDOM() {
    if (document.getElementById('lmsChatbotRoot')) return;

    const chatbotHTML = `
      <div id="lmsChatbotRoot">
        <!-- Nút Chatbot nổi ở góc dưới bên phải -->
        <button type="button" class="lms-chatbot-btn" id="lmsChatbotToggleBtn" aria-label="Mở cửa sổ tư vấn AI">
          <div class="lms-chatbot-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="lms-chatbot-online-dot"></span>
          </div>
          <div class="lms-chatbot-btn-text">
            <span class="lms-chatbot-btn-title">Trợ Lý AI Tư Vấn LMS ✨</span>
            <span class="lms-chatbot-btn-sub">Gemini AI • Tư vấn khóa học & tính năng</span>
          </div>
          <span class="lms-chatbot-badge">1</span>
        </button>

        <!-- Khung chatbox (Popup) -->
        <div class="lms-chatbox-window" id="lmsChatboxWindow" role="dialog" aria-modal="true" aria-hidden="true">
          <!-- Chatbox Header -->
          <div class="lms-chatbox-header">
            <div class="lms-chatbox-user-info">
              <div class="lms-chatbox-header-avatar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.2">
                  <path d="M12 2a8 8 0 0 0-8 8v4a8 8 0 0 0 16 0v-4a8 8 0 0 0-8-8z"></path>
                  <circle cx="9" cy="11" r="1.5" fill="#0284c7"></circle>
                  <circle cx="15" cy="11" r="1.5" fill="#0284c7"></circle>
                  <path d="M10 16h4"></path>
                </svg>
              </div>
              <div>
                <div class="lms-chatbox-header-title">
                  Trợ Lý Tư Vấn LMS
                  <span class="lms-gemini-pill">✨ Gemini AI</span>
                </div>
                <div class="lms-chatbox-header-status">Trực tuyến 24/7</div>
              </div>
            </div>
            <div class="lms-chatbox-header-actions">
              <!-- Nút Reset phiên chat -->
              <button type="button" class="lms-chatbox-btn-icon" id="lmsChatboxResetBtn" title="Làm mới cuộc trò chuyện" aria-label="Làm mới cuộc trò chuyện">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
              </button>
              <!-- Nút Cài đặt API Key & Dữ liệu -->
              <button type="button" class="lms-chatbox-btn-icon" id="lmsChatboxSettingsBtn" title="Cài đặt AI & Đồng bộ khóa học" aria-label="Cài đặt AI">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
              <!-- Nút Đóng -->
              <button type="button" class="lms-chatbox-btn-close" id="lmsChatboxCloseBtn" aria-label="Đóng cửa sổ chat">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Bảng cài đặt API Key & Dữ liệu Khóa Học -->
          <div class="lms-settings-panel" id="lmsSettingsPanel" style="display: none;">
            <div class="lms-settings-header">
              <span class="lms-settings-title">⚙️ Cấu hình AI & Đồng bộ</span>
              <button type="button" class="lms-settings-close-btn" id="lmsSettingsCloseBtn">✕</button>
            </div>
            <div class="lms-settings-body">
              <div class="lms-settings-section-card">
                <div class="lms-settings-sec-title">📚 Dữ liệu khóa học & Tính năng:</div>
                <div class="lms-settings-sync-row">
                  <span id="lmsSyncCoursesCount" class="lms-sync-badge">Đang kết nối...</span>
                  <button type="button" class="lms-btn-sync-courses" id="lmsBtnSyncCourses">
                    🔄 Đồng bộ lại dữ liệu
                  </button>
                </div>
                <div id="lmsSyncStatusText" class="lms-settings-hint">
                  AI tự động nắm rõ thông tin 10 khóa học và toàn bộ tính năng website.
                </div>
              </div>

              <div class="lms-settings-section-card" style="margin-top: 10px;">
                <label for="lmsApiKeyInput" class="lms-settings-label">
                  Google Gemini API Key:
                </label>
                <input type="password" id="lmsApiKeyInput" class="lms-settings-input" placeholder="Mã API Key dạng AIzaSy... hoặc AQ..." />
                <div class="lms-settings-hint">
                  Khóa API Key của bạn đã được thiết lập sẵn sàng.
                </div>
                <div id="lmsApiKeyStatus" class="lms-settings-status"></div>
                <div class="lms-settings-actions">
                  <button type="button" class="lms-btn-test-key" id="lmsBtnTestKey">⚡ Kiểm tra kết nối</button>
                  <button type="button" class="lms-btn-save-key" id="lmsBtnSaveKey">💾 Lưu cấu hình</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Hộp thoại xác nhận làm mới trực tiếp (IN-CHAT CONFIRM - KHÔNG DÙNG NATIVE CONFIRM) -->
          <div class="lms-inline-confirm-box" id="lmsResetConfirmBox" style="display: none;">
            <div class="lms-inline-confirm-card">
              <div class="lms-inline-confirm-icon">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
              </div>
              <div class="lms-inline-confirm-title">Làm Mới Cuộc Trò Chuyện?</div>
              <div class="lms-inline-confirm-desc">Toàn bộ lịch sử trao đổi hiện tại sẽ được xóa để bạn bắt đầu chủ đề tư vấn mới.</div>
              <div class="lms-inline-confirm-actions">
                <button type="button" class="lms-btn-confirm-cancel" id="lmsBtnCancelReset">Hủy Bỏ</button>
                <button type="button" class="lms-btn-confirm-ok" id="lmsBtnConfirmReset">Đồng Ý Làm Mới</button>
              </div>
            </div>
          </div>

          <!-- Chatbox Body -->
          <div class="lms-chatbox-body" id="lmsChatboxBody">
            <!-- Nội dung tin nhắn sẽ được render tự động từ renderInitialBotMessage() hoặc khôi phục từ phiên cũ -->
          </div>

          <!-- Chatbox Footer Input -->
          <form class="lms-chatbox-footer" id="lmsChatInputForm" onsubmit="lmsChatbotSendMessage(event)">
            <input type="text" id="lmsChatInput" class="lms-chat-user-input" placeholder="Hỏi AI về khóa học, diễn đàn, luyện gõ phím..." autocomplete="off" />
            <button type="submit" class="lms-chat-send-btn" id="lmsChatSendBtn" aria-label="Gửi tin nhắn">
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

  // 6. RENDER TIN NHẮN CHÀO MẶC ĐỊNH BAN ĐẦU
  function renderInitialBotMessage() {
    const body = document.getElementById('lmsChatboxBody');
    if (!body) return;

    const initialBotContent = `
      Xin chào bạn! Mình là Trợ lý AI hệ thống <strong>Tin Học Văn Phòng LMS</strong> (Gemini AI).
      <br /><br />
      Mình có thể hỗ trợ bạn:
      <br>
      • <strong>Tư vấn chọn khóa học</strong> phù hợp theo ngành nghề và mục tiêu công việc.
      <br>
      • <strong>Giới thiệu &amp; Hướng dẫn tất cả chức năng</strong> trên website (Diễn đàn hỏi đáp, Luyện gõ phím 10 ngón, Test phím, Tra cứu phím tắt, Thi thử trắc nghiệm,...).
      <br><br>
      Bạn muốn tìm hiểu nội dung nào dưới đây? Hãy bấm chọn hoặc gõ câu hỏi bất kỳ nhé!
      <div class="lms-quick-reply-wrap" id="lmsInitialQuickReplies">
        <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('tinh_nang_website')">
          🌐 Giới thiệu các chức năng của Website (Diễn đàn, Tiện ích,...)
        </button>
        <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('chuc_nang_dien_dan')">
          💬 Diễn đàn học tập có gì &amp; Dùng để làm gì?
        </button>
        <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('tu_van_khoa_hoc')">
          🎯 Tư vấn chọn khóa học (Word, Excel, PowerPoint, MOS)
        </button>
        <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('gui_yeu_cau')">
          👨‍🏫 Để lại thông tin nhờ Giảng viên tư vấn trực tiếp
        </button>
      </div>
    `;

    body.innerHTML = `
      <div class="lms-msg-row bot">
        <div class="lms-msg-avatar">
          <span>LMS</span>
        </div>
        <div class="lms-msg-bubble">
          ${initialBotContent}
          <span class="lms-msg-time">Vừa xong • Trợ lý AI</span>
        </div>
      </div>
    `;
    lmsChatbotScrollToBottom();

    // Lưu tin nhắn chào ban đầu vào sessionStorage nếu chưa có
    try {
      if (!sessionStorage.getItem(STORAGE_CHAT_MSGS_KEY)) {
        sessionStorage.setItem(STORAGE_CHAT_MSGS_KEY, JSON.stringify([{
          sender: 'bot',
          text: initialBotContent,
          isHTML: true,
          timeStr: 'Vừa xong'
        }]));
      }
    } catch (e) {}
  }

  // 7. LƯU & KHÔI PHỤC PHIÊN CHAT GIỮA CÁC TRANG
  function saveChatSession() {
    try {
      sessionStorage.setItem(STORAGE_CHAT_CONTEXT_KEY, JSON.stringify(conversationHistory));
    } catch (e) {}
  }

  function restoreChatSession() {
    const keepSession = handleSessionLifecycle();

    if (!keepSession) {
      // Đã reset vì reload (F5)
      renderInitialBotMessage();
      return;
    }

    try {
      const savedMsgs = sessionStorage.getItem(STORAGE_CHAT_MSGS_KEY);
      const savedCtx = sessionStorage.getItem(STORAGE_CHAT_CONTEXT_KEY);
      const savedIsOpen = sessionStorage.getItem(STORAGE_CHAT_IS_OPEN_KEY);

      if (savedCtx) {
        const parsedCtx = JSON.parse(savedCtx);
        if (Array.isArray(parsedCtx)) {
          conversationHistory = parsedCtx;
        }
      }

      if (savedMsgs) {
        const parsedMsgs = JSON.parse(savedMsgs);
        if (Array.isArray(parsedMsgs) && parsedMsgs.length > 0) {
          const body = document.getElementById('lmsChatboxBody');
          if (body) {
            body.innerHTML = '';
            for (const item of parsedMsgs) {
              renderMessageElement(item.sender, item.text, item.isHTML, item.timeStr);
            }
            lmsChatbotScrollToBottom();
          }
        } else {
          renderInitialBotMessage();
        }
      } else {
        renderInitialBotMessage();
      }

      // Nếu trước khi chuyển trang chatbox đang mở -> Giữ mở ở trang mới!
      if (savedIsOpen === 'true') {
        const chatboxWindow = document.getElementById('lmsChatboxWindow');
        const toggleBtn = document.getElementById('lmsChatbotToggleBtn');
        const badge = toggleBtn ? toggleBtn.querySelector('.lms-chatbot-badge') : null;
        if (chatboxWindow) {
          chatboxWindow.classList.add('open');
          chatboxWindow.setAttribute('aria-hidden', 'false');
          if (badge) badge.style.display = 'none';
        }
      }
    } catch (e) {
      renderInitialBotMessage();
    }
  }

  // 8. XỬ LÝ SỰ KIỆN GIAO DIỆN & NÚT BẤM
  function setupChatbotEvents() {
    const toggleBtn = document.getElementById('lmsChatbotToggleBtn');
    const closeBtn = document.getElementById('lmsChatboxCloseBtn');
    const chatboxWindow = document.getElementById('lmsChatboxWindow');
    const settingsBtn = document.getElementById('lmsChatboxSettingsBtn');
    const resetBtn = document.getElementById('lmsChatboxResetBtn');
    const settingsPanel = document.getElementById('lmsSettingsPanel');
    const settingsCloseBtn = document.getElementById('lmsSettingsCloseBtn');
    const apiKeyInput = document.getElementById('lmsApiKeyInput');
    const btnSaveKey = document.getElementById('lmsBtnSaveKey');
    const btnTestKey = document.getElementById('lmsBtnTestKey');
    const apiKeyStatus = document.getElementById('lmsApiKeyStatus');
    const btnSyncCourses = document.getElementById('lmsBtnSyncCourses');
    const syncStatusText = document.getElementById('lmsSyncStatusText');
    const syncCoursesCount = document.getElementById('lmsSyncCoursesCount');

    // Hộp thoại xác nhận làm mới
    const resetConfirmBox = document.getElementById('lmsResetConfirmBox');
    const btnCancelReset = document.getElementById('lmsBtnCancelReset');
    const btnConfirmReset = document.getElementById('lmsBtnConfirmReset');

    const badge = toggleBtn ? toggleBtn.querySelector('.lms-chatbot-badge') : null;

    // Cập nhật số lượng khóa học hiện tại
    async function refreshSyncInfo() {
      const data = await fetchLatestCoursesData(false);
      const count = Object.keys(data).length;
      if (syncCoursesCount) {
        syncCoursesCount.textContent = `🟢 Đã đồng bộ ${count} khóa học & Tính năng`;
      }
    }
    refreshSyncInfo();

    // Mở / đóng cửa sổ chat (có lưu trạng thái vào sessionStorage để giữ khi chuyển trang)
    if (toggleBtn && chatboxWindow) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = chatboxWindow.classList.contains('open');
        if (!isOpen) {
          chatboxWindow.classList.add('open');
          chatboxWindow.setAttribute('aria-hidden', 'false');
          if (badge) badge.style.display = 'none';
          sessionStorage.setItem(STORAGE_CHAT_IS_OPEN_KEY, 'true');
          const input = document.getElementById('lmsChatInput');
          if (input) setTimeout(() => input.focus(), 300);
        } else {
          chatboxWindow.classList.remove('open');
          chatboxWindow.setAttribute('aria-hidden', 'true');
          sessionStorage.setItem(STORAGE_CHAT_IS_OPEN_KEY, 'false');
        }
      });
    }

    if (closeBtn && chatboxWindow) {
      closeBtn.addEventListener('click', () => {
        chatboxWindow.classList.remove('open');
        chatboxWindow.setAttribute('aria-hidden', 'true');
        sessionStorage.setItem(STORAGE_CHAT_IS_OPEN_KEY, 'false');
      });
    }

    // Mở / đóng bảng cài đặt
    if (settingsBtn && settingsPanel) {
      settingsBtn.addEventListener('click', () => {
        const isHidden = settingsPanel.style.display === 'none';
        settingsPanel.style.display = isHidden ? 'block' : 'none';
        if (isHidden && apiKeyInput) {
          apiKeyInput.value = getStoredApiKey();
          if (apiKeyStatus) apiKeyStatus.textContent = '';
          refreshSyncInfo();
        }
      });
    }

    if (settingsCloseBtn && settingsPanel) {
      settingsCloseBtn.addEventListener('click', () => {
        settingsPanel.style.display = 'none';
      });
    }

    // Nút đồng bộ lại khóa học thủ công
    if (btnSyncCourses) {
      btnSyncCourses.addEventListener('click', async () => {
        btnSyncCourses.disabled = true;
        if (syncStatusText) syncStatusText.textContent = '⏳ Đang quét và đồng bộ dữ liệu mới nhất...';

        const freshData = await fetchLatestCoursesData(true);
        const count = Object.keys(freshData).length;

        if (syncCoursesCount) {
          syncCoursesCount.textContent = `🟢 Đã đồng bộ ${count} khóa học & Tính năng`;
        }
        if (syncStatusText) {
          syncStatusText.style.color = '#059669';
          syncStatusText.textContent = `✅ Đã cập nhật thành công ${count} khóa học từ hệ thống!`;
        }
        btnSyncCourses.disabled = false;
      });
    }

    // Lưu API Key
    if (btnSaveKey && apiKeyInput) {
      btnSaveKey.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        saveStoredApiKey(key);
        if (apiKeyStatus) {
          apiKeyStatus.style.color = '#059669';
          apiKeyStatus.textContent = '✅ Đã lưu cấu hình API Key!';
        }
        setTimeout(() => {
          if (settingsPanel) settingsPanel.style.display = 'none';
        }, 1200);
      });
    }

    // Kiểm tra kết nối API Key
    if (btnTestKey && apiKeyInput) {
      btnTestKey.addEventListener('click', async () => {
        const testKey = apiKeyInput.value.trim() || getStoredApiKey();
        if (apiKeyStatus) {
          apiKeyStatus.style.color = '#0284c7';
          apiKeyStatus.textContent = '⏳ Đang kiểm tra kết nối với Gemini AI...';
        }
        btnTestKey.disabled = true;

        try {
          const testRes = await testGeminiConnection(testKey);
          if (testRes.success) {
            if (apiKeyStatus) {
              apiKeyStatus.style.color = '#059669';
              apiKeyStatus.textContent = `✅ Kết nối thành công với ${testRes.model}!`;
            }
          } else {
            if (apiKeyStatus) {
              apiKeyStatus.style.color = '#dc2626';
              apiKeyStatus.textContent = `❌ Lỗi: ${testRes.error}`;
            }
          }
        } catch (err) {
          if (apiKeyStatus) {
            apiKeyStatus.style.color = '#dc2626';
            apiKeyStatus.textContent = `❌ Lỗi kết nối: ${err.message}`;
          }
        } finally {
          btnTestKey.disabled = false;
        }
      });
    }

    // XỬ LÝ LÀM MỚI TRỰC TIẾP (100% IN-CHAT DIALOG - KHÔNG DÙNG NATIVE CONFIRM)
    if (resetBtn && resetConfirmBox) {
      resetBtn.addEventListener('click', () => {
        resetConfirmBox.style.display = 'flex';
      });
    }

    if (btnCancelReset && resetConfirmBox) {
      btnCancelReset.addEventListener('click', () => {
        resetConfirmBox.style.display = 'none';
      });
    }

    if (btnConfirmReset && resetConfirmBox) {
      btnConfirmReset.addEventListener('click', () => {
        resetConfirmBox.style.display = 'none';
        conversationHistory = [];
        chatMessagesList = [];
        try {
          sessionStorage.removeItem(STORAGE_CHAT_MSGS_KEY);
          sessionStorage.removeItem(STORAGE_CHAT_CONTEXT_KEY);
        } catch (e) {}

        const body = document.getElementById('lmsChatboxBody');
        if (body) {
          body.innerHTML = `
            <div class="lms-msg-row bot">
              <div class="lms-msg-avatar"><span>LMS</span></div>
              <div class="lms-msg-bubble">
                Cuộc trò chuyện đã được làm mới thành công ✨<br>
                Bạn cần tư vấn khóa học nào hoặc muốn tìm hiểu về chức năng gì (Diễn đàn, Luyện gõ phím, Test bàn phím, Thi thử,...)? Hãy hỏi mình nhé!
                <div class="lms-quick-reply-wrap" style="margin-top: 10px;">
                  <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('tinh_nang_website')">🌐 Các tính năng của Website</button>
                  <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('chuc_nang_dien_dan')">💬 Chức năng của Diễn đàn</button>
                  <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('tu_van_khoa_hoc')">🎯 Tư vấn chọn khóa học</button>
                </div>
                <span class="lms-msg-time">Vừa xong • Trợ lý AI</span>
              </div>
            </div>
          `;
        }
      });
    }
  }

  // 9. KIỂM TRA KẾT NỐI API KEY VỚI GOOGLE GEMINI
  async function testGeminiConnection(key) {
    for (const m of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Ping test' }] }]
          })
        });
        if (res.ok) {
          return { success: true, model: m };
        }
      } catch (e) {}
    }
    return { success: false, error: 'Không thể kết nối hoặc API Key chưa được cấp quyền.' };
  }

  // 10. HÀM GỌI GEMINI AI TƯ VẤN KHÓA HỌC & GIẢI THÍCH TÍNH NĂNG
  window.callGeminiAdvisor = async function (userMessage) {
    const apiKey = getStoredApiKey();
    if (!apiKey) {
      console.warn('[LMS Gemini AI] Chưa cấu hình API Key');
      return null;
    }

    const latestCoursesDb = await fetchLatestCoursesData(false);
    const dynamicSystemPrompt = buildDynamicSystemPrompt(latestCoursesDb);

    console.log(`[LMS Gemini AI] Đang gửi câu hỏi tới Gemini AI...`);

    conversationHistory.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    if (conversationHistory.length > 8) {
      conversationHistory = conversationHistory.slice(-8);
    }

    const payload = {
      system_instruction: {
        parts: [{ text: dynamicSystemPrompt }]
      },
      contents: conversationHistory,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 900
      }
    };

    let lastError = null;

    for (const model of GEMINI_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (replyText) {
            console.log(`[LMS Gemini AI] Phản hồi thành công từ: ${model}`);
            conversationHistory.push({
              role: 'model',
              parts: [{ text: replyText }]
            });
            saveChatSession();
            return replyText;
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          lastError = errData.error?.message || `HTTP ${response.status}`;
          console.warn(`[LMS Gemini AI] Model ${model} trả về lỗi:`, lastError);
        }
      } catch (err) {
        lastError = err.message;
        console.warn(`[LMS Gemini AI] Ngoại lệ khi gọi ${model}:`, err.message);
      }
    }

    window.lastGeminiError = lastError;
    return null;
  };

  // 11. KHỞI TẠO KHI TRANG TẢI XONG
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectChatbotDOM();
      setupChatbotEvents();
      restoreChatSession();
    });
  } else {
    injectChatbotDOM();
    setupChatbotEvents();
    restoreChatSession();
  }

  // Export hàm để tiện truy cập nội bộ
  window.lmsSaveChatSession = saveChatSession;
  window.lmsChatMessagesList = chatMessagesList;
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

// Chuyển đổi Markdown cơ bản sang HTML an toàn
function formatMarkdownToHTML(rawText) {
  if (!rawText) return '';

  let html = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // In đậm **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // In nghiêng *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Inline code `code`
  html = html.replace(/`(.*?)`/g, '<code class="lms-chat-code">$1</code>');

  // Markdown links: [label](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="lms-chat-link">$1</a>');

  // Xử lý danh sách gạch đầu dòng (* hoặc - )
  const lines = html.split('\n');
  const formattedLines = [];
  let inList = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      if (!inList) {
        formattedLines.push('<ul class="lms-chat-ul">');
        inList = true;
      }
      formattedLines.push(`<li>${trimmed.substring(2)}</li>`);
    } else {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      formattedLines.push(line);
    }
  }
  if (inList) {
    formattedLines.push('</ul>');
  }

  return formattedLines.join('<br>').replace(/<br><ul/g, '<ul').replace(/<\/ul><br>/g, '</ul>');
}

// Hàm render một phần tử tin nhắn vào DOM
function renderMessageElement(sender, text, isHTML, timeStr) {
  const body = document.getElementById('lmsChatboxBody');
  if (!body) return;

  const row = document.createElement('div');
  row.className = `lms-msg-row ${sender}`;

  if (sender === 'bot') {
    const content = isHTML ? text : formatMarkdownToHTML(text);
    row.innerHTML = `
      <div class="lms-msg-avatar">
        <span>LMS</span>
      </div>
      <div class="lms-msg-bubble">
        ${content}
        <span class="lms-msg-time">${timeStr} • Trợ lý AI</span>
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
}

// Thêm tin nhắn vào giao diện và tự động lưu vào sessionStorage
function lmsAppendChatMessage(sender, text, isHTML = false) {
  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  renderMessageElement(sender, text, isHTML, timeStr);
  lmsChatbotScrollToBottom();

  // Lưu vào danh sách phiên chat
  try {
    const msgs = JSON.parse(sessionStorage.getItem('thvp_lms_chat_messages_v4') || '[]');
    msgs.push({ sender, text, isHTML, timeStr });
    sessionStorage.setItem('thvp_lms_chat_messages_v4', JSON.stringify(msgs));
  } catch (e) {}
}

// Hiển thị hiệu ứng AI đang soạn câu trả lời
function lmsShowTypingIndicator() {
  const body = document.getElementById('lmsChatboxBody');
  if (!body) return;

  const existing = document.getElementById('lmsTypingRow');
  if (existing) existing.remove();

  const typingRow = document.createElement('div');
  typingRow.className = 'lms-msg-row bot lms-typing-row';
  typingRow.id = 'lmsTypingRow';
  typingRow.innerHTML = `
    <div class="lms-msg-avatar">
      <span>LMS</span>
    </div>
    <div class="lms-msg-bubble lms-typing-bubble">
      <div class="lms-typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="lms-typing-label">Gemini AI đang soạn câu trả lời...</span>
    </div>
  `;
  body.appendChild(typingRow);
  lmsChatbotScrollToBottom();
}

// Ẩn hiệu ứng gõ phím
function lmsHideTypingIndicator() {
  const typingRow = document.getElementById('lmsTypingRow');
  if (typingRow) typingRow.remove();
}

// Xử lý khi người dùng chọn nút gợi ý nhanh
function lmsChatbotSelectOption(optionKey) {
  switch (optionKey) {
    case 'tinh_nang_website':
      lmsAppendChatMessage('user', 'Hãy giới thiệu tổng quan các chức năng của website Tin Học Văn Phòng LMS.');
      setTimeout(() => {
        const botReply = `
          Hệ thống <strong>Tin Học Văn Phòng LMS</strong> là nền tảng học tập &amp; rèn luyện kỹ năng số toàn diện với các khu vực chức năng chính:
          <br><br>
          1️⃣ <strong>Diễn Đàn Thảo Luận (<a href="dien-dan.html" class="lms-chat-link">dien-dan.html</a>)</strong>:
          <br>
          Mạng xã hội học tập dành riêng cho học sinh và giáo viên. Đã có <strong>phân quyền Giáo viên / Học sinh</strong> rõ ràng (Giáo viên có quyền ghim bài và xóa bài vi phạm của học sinh). Hỗ trợ đổi avatar cá nhân, 5 biểu cảm thả tim/ý tưởng/wow, bình luận đa cấp và Bảng Vàng tích điểm.
          <br><br>
          2️⃣ <strong>Kho Khóa Học LMS (<a href="khoa-hoc-lms.html" class="lms-chat-link">khoa-hoc-lms.html</a>)</strong>:
          <br>
          2 chương trình đào tạo trọng tâm: <a href="gioi-thieu-khoa-hoc.html?khoa=co-ban" class="lms-chat-link">Tin học cơ bản (1.500.000đ)</a> và <a href="gioi-thieu-khoa-hoc.html?khoa=nang-cao" class="lms-chat-link">Tin học nâng cao (2.500.000đ)</a>, cùng các lớp học tối 19:00–21:00 do các thầy ThS. Nguyễn Thái Tuấn, GV Tống Hoàng Thiên, GV Trần Anh Khoa giảng dạy.
          <br><br>
          3️⃣ <strong>Đăng Ký Khóa Học (<a href="dang-ky-khoa-hoc.html" class="lms-chat-link">dang-ky-khoa-hoc.html</a>)</strong>:
          <br>
          Chọn lớp học, quét mã VietQR tự động thanh toán học phí nhanh chóng và gửi minh chứng kích hoạt tài khoản trong 10-15 phút.
          <br><br>
          4️⃣ <strong>Lớp Học Của Tôi (<a href="lop-hoc-cua-toi.html" class="lms-chat-link">lop-hoc-cua-toi.html</a>)</strong>:
          <br>
          Xem danh sách lớp đã đăng ký, tài liệu bài giảng Word/Excel/PPT, nộp bài tập về nhà và nhận chấm điểm từ giáo viên.
          <br><br>
          5️⃣ <strong>Luyện Gõ Phím 10 Ngón (<a href="luyen-go-phim.html" class="lms-chat-link">luyen-go-phim.html</a>)</strong>:
          <br>
          Bàn phím ảo trực quan, đo WPM (tốc độ gõ), độ chính xác % và các bài tập luyện ngón phản xạ nhanh.
          <br><br>
          6️⃣ <strong>Kiểm Tra Bàn Phím (<a href="kiem-tra-ban-phim.html" class="lms-chat-link">kiem-tra-ban-phim.html</a>)</strong>:
          <br>
          Test phần cứng bàn phím máy tính 104 phím xem có nút nào bị liệt, kẹt hoặc không nhận tín hiệu.
          <br><br>
          7️⃣ <strong>Tìm Hiểu Bàn Phím (<a href="tim-hieu-ban-phim.html" class="lms-chat-link">tim-hieu-ban-phim.html</a>)</strong>:
          <br>
          Cấu tạo 5 khu vực phím và nguyên lý đặt tay chuẩn công thái học với 2 phím định vị có gờ F và J.
          <br><br>
          8️⃣ <strong>Tra Cứu Phím Tắt (<a href="tra-cuu-phim-tat.html" class="lms-chat-link">tra-cuu-phim-tat.html</a>)</strong>:
          <br>
          Kho phím tắt thần tốc cho Windows, Word, Excel, PowerPoint có ô tìm kiếm tức thì.
          <br><br>
          9️⃣ <strong>Ôn Luyện Thi Thử (<a href="on-luyen-thi-thu.html" class="lms-chat-link">on-luyen-thi-thu.html</a>)</strong>:
          <br>
          Đề thi trắc nghiệm bấm giờ chuẩn kỳ thi CNTT Cơ bản và chứng chỉ quốc tế MOS/IC3, 3 dạng câu hỏi, chấm điểm tự động.
          <br><br>
          🔟 <strong>Lộ Trình Học Tập (<a href="lo-trinh-hoc-tap.html" class="lms-chat-link">lo-trinh-hoc-tap.html</a>)</strong>:
          <br>
          Bản đồ 4 giai đoạn làm chủ kỹ năng số từ cơ bản đến chuyên nghiệp.
        `;
        lmsAppendChatMessage('bot', botReply, true);
      }, 350);
      break;

    case 'chuc_nang_dien_dan':
      lmsAppendChatMessage('user', 'Diễn đàn của website có gì và dùng để làm gì?');
      setTimeout(() => {
        const botReply = `
          <strong>Diễn Đàn Học Tập LMS</strong> (<a href="dien-dan.html" class="lms-chat-link">dien-dan.html</a>) là mạng xã hội học tập dành riêng cho học sinh và giáo viên, bao gồm các chức năng mới nhất:
          <br><br>
          • <strong>Phân Quyền Rõ Ràng Giáo Viên &amp; Học Sinh</strong>:
          <br>
          - Có huy hiệu nhận diện rõ ràng <strong>🎓 Giáo viên</strong> và <strong>🧑‍🎓 Học sinh</strong> trên từng bài đăng và bình luận.
          <br>
          - <strong>Giáo viên</strong>: Có quyền <strong>ghim bài viết quan trọng</strong> lên đầu diễn đàn và có nút <strong>🗑️ Xóa bài học sinh</strong> nếu vi phạm nội quy.
          <br>
          - <strong>Học sinh</strong>: Tự do đăng bài hỏi bài tập, thảo luận và tự quản lý xóa bài viết của chính mình.
          <br><br>
          • <strong>Chỉnh Sửa &amp; Lưu Ảnh Đại Diện (Avatar)</strong>:
          <br>
          - Nhấp vào avatar để đổi ảnh bất cứ lúc nào: chọn mẫu có sẵn hoặc tải ảnh trực tiếp từ máy tính/điện thoại. Hệ thống tự động căn chỉnh khung vuông 200x200 chuẩn đẹp và đồng bộ lên tất cả bài viết của bạn.
          <br><br>
          • <strong>Tương Tác 5 Cảm Xúc</strong>: Thích (Like), Yêu thích (Love), Ý tưởng (Idea), Ngạc nhiên (Wow), Buồn (Sad).
          <br><br>
          • <strong>Bình Luận Đa Cấp</strong>: Trả lời lồng nhau, đính kèm file hoặc ảnh chụp màn hình bài tập.
          <br><br>
          • <strong>Bảng Vàng Tích Điểm (Leaderboard)</strong>: Nhận +10 điểm khi đăng bài, +3 điểm khi bình luận để vinh danh Top thành viên năng nổ.
          <br><br>
          • <strong>Lọc Bài Viết Nhanh</strong>: Tab Mới nhất, Bài Hot, Bài từ Giáo viên, Bài từ Học sinh, Bài Khoe điểm thi thử.
          <br><br>
          👉 Bấm vào đây để tham gia ngay: <a href="dien-dan.html" class="lms-chat-link">Truy cập Diễn đàn Tin Học</a>
        `;
        lmsAppendChatMessage('bot', botReply, true);
      }, 350);
      break;

    case 'tu_van_khoa_hoc':
      lmsAppendChatMessage('user', 'Tư vấn giúp mình chọn khóa học phù hợp với nhu cầu.');
      setTimeout(() => {
        const botReply = `
          Dạ, hệ thống LMS hiện có 2 chương trình đào tạo chính quy trọng tâm:
          <br><br>
          1️⃣ <strong><a href="gioi-thieu-khoa-hoc.html?khoa=co-ban" class="lms-chat-link">Tin Học Cơ Bản</a> (Học phí: 1.500.000 đ)</strong>:
          <br>
          • Dành cho người mới bắt đầu, học sinh, sinh viên cần chuẩn đầu ra CNTT Cơ bản.
          <br>
          • Nội dung: Làm chủ Windows, Word chuẩn thể thức, bảng tính Excel cơ bản, slide PowerPoint thuyết trình, Internet &amp; Email an toàn.
          <br>
          • Lớp học mở tuyển sinh:
          <br>
          - Lớp <strong>CB-01</strong>: GV Tống Hoàng Thiên | Thứ 2, thứ 4 (19:00–21:00) | <a href="dang-ky-khoa-hoc.html?lop=CB-01" class="lms-chat-link">Đăng ký lớp CB-01</a>
          <br>
          - Lớp <strong>CB-02</strong>: ThS. Nguyễn Thái Tuấn | Thứ 3, thứ 5 (19:00–21:00) | <a href="dang-ky-khoa-hoc.html?lop=CB-02" class="lms-chat-link">Đăng ký lớp CB-02</a>
          <br>
          - Lớp <strong>CB-03</strong>: GV Trần Anh Khoa | Thứ 6, chủ nhật (19:00–21:00) | <a href="dang-ky-khoa-hoc.html?lop=CB-03" class="lms-chat-link">Đăng ký lớp CB-03</a>
          <br><br>
          2️⃣ <strong><a href="gioi-thieu-khoa-hoc.html?khoa=nang-cao" class="lms-chat-link">Tin Học Nâng Cao</a> (Học phí: 2.500.000 đ)</strong>:
          <br>
          • Dành cho người đã có kiến thức cơ bản, sinh viên chuẩn bị tốt nghiệp, nhân viên kế toán, nhân sự, hành chính.
          <br>
          • Nội dung: Word nâng cao (Mail Merge, mục lục tự động, bảo mật); Excel hàm phức tạp (XLOOKUP, INDEX/MATCH), PivotTable &amp; Dashboard báo cáo động; PowerPoint thiết kế hiện đại (Morph, Zoom, Infographic).
          <br>
          • Lớp học mở tuyển sinh:
          <br>
          - Lớp <strong>NC-01</strong>: GV Tống Hoàng Thiên | Thứ 3, thứ 5 (19:00–21:00) | <a href="dang-ky-khoa-hoc.html?lop=NC-01" class="lms-chat-link">Đăng ký lớp NC-01</a>
          <br>
          - Lớp <strong>NC-02</strong>: ThS. Nguyễn Thái Tuấn | Thứ 6, chủ nhật (19:00–21:00) | <a href="dang-ky-khoa-hoc.html?lop=NC-02" class="lms-chat-link">Đăng ký lớp NC-02</a>
          <br>
          - Lớp <strong>NC-03</strong>: GV Trần Anh Khoa | Thứ 2, thứ 4 (19:00–21:00) | <a href="dang-ky-khoa-hoc.html?lop=NC-03" class="lms-chat-link">Đăng ký lớp NC-03</a>
          <br><br>
          ⭐ <strong>COMBO TOÀN DIỆN (Word + Excel + PPT)</strong>: Chỉ <strong>690.000 đ</strong> (Tiết kiệm 40%), kèm tặng trọn bộ giáo trình + ngân hàng hơn 1.000 câu luyện thi chứng chỉ.
          <br><br>
          👉 Xem thêm trang tổng quan khóa học: <a href="khoa-hoc-lms.html" class="lms-chat-link">Khoá Học LMS</a> | <a href="dang-ky-khoa-hoc.html" class="lms-chat-link">Đăng Ký Ngay</a>
          <div class="lms-quick-reply-wrap" style="margin-top: 10px;">
            <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('tinh_nang_website')">
              🌐 Xem thêm các tiện ích khác của web (Luyện gõ phím, Test phím,...)
            </button>
            <button type="button" class="lms-qr-btn" onclick="lmsChatbotSelectOption('gui_yeu_cau')">
              👨‍🏫 Nhờ Giảng viên gọi điện tư vấn 1-1
            </button>
          </div>
        `;
        lmsAppendChatMessage('bot', botReply, true);
      }, 350);
      break;

    case 'gui_yeu_cau':
      lmsAppendChatMessage('user', 'Tôi muốn gửi yêu cầu hỗ trợ cho người phụ trách đào tạo.');
      setTimeout(() => {
        const formHTML = `
          Dạ, bạn vui lòng để lại thông tin vào biểu mẫu dưới đây, ThS. Nguyễn Thái Tuấn (Trưởng ban Đào tạo) hoặc tư vấn viên sẽ gọi điện/nhắn Zalo hỗ trợ bạn trong vòng 10-15 phút nhé:
          <form class="lms-chat-support-form" onsubmit="lmsChatbotSubmitSupportTicket(event)">
            <div class="lms-chat-support-title">📋 Thông tin yêu cầu hỗ trợ:</div>
            <div id="ticketFormError" style="display: none; color: #dc2626; font-size: 0.78rem; font-weight: 700;"></div>
            <input type="text" id="ticketFullName" class="lms-chat-input-field" placeholder="Họ và tên của bạn *" required />
            <input type="tel" id="ticketPhone" class="lms-chat-input-field" placeholder="Số điện thoại / Zalo *" required />
            <input type="email" id="ticketEmail" class="lms-chat-input-field" placeholder="Địa chỉ Email (nếu có)" />
            <textarea id="ticketContent" class="lms-chat-input-field" rows="2" placeholder="Nội dung cần tư vấn thêm..."></textarea>
            <button type="submit" class="lms-chat-submit-btn">Gửi Đến Người Phụ Trách</button>
          </form>
        `;
        lmsAppendChatMessage('bot', formHTML, true);
      }, 350);
      break;
  }
}

// Xử lý gửi Form tiếp nhận yêu cầu hỗ trợ (KHÔNG DÙNG NATIVE ALERT)
function lmsChatbotSubmitSupportTicket(event) {
  event.preventDefault();
  const name = document.getElementById('ticketFullName')?.value.trim() || '';
  const phone = document.getElementById('ticketPhone')?.value.trim() || '';
  const email = document.getElementById('ticketEmail')?.value.trim() || '';
  const content = document.getElementById('ticketContent')?.value.trim() || '';
  const errorElem = document.getElementById('ticketFormError');

  if (!name || !phone) {
    if (errorElem) {
      errorElem.style.display = 'block';
      errorElem.textContent = '⚠️ Vui lòng nhập đầy đủ Họ tên và Số điện thoại!';
    }
    return;
  }

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

  const form = event.target;
  form.innerHTML = `
    <div style="color: #059669; font-weight: 700; font-size: 0.88rem; line-height: 1.4;">
      ✅ Đã gửi yêu cầu thành công!<br>
      Cảm ơn bạn <strong>${name}</strong>. ThS. Nguyễn Thái Tuấn và ban đào tạo sẽ liên hệ qua SĐT <strong>${phone}</strong> để giải đáp cho bạn ngay.
    </div>
  `;
}

// Xử lý khi người dùng gửi câu hỏi
async function lmsChatbotSendMessage(event) {
  event.preventDefault();
  const input = document.getElementById('lmsChatInput');
  const sendBtn = document.getElementById('lmsChatSendBtn');
  if (!input) return;

  const userQuery = input.value.trim();
  if (!userQuery) return;

  // Hiển thị tin nhắn người dùng và lưu vào sessionStorage
  lmsAppendChatMessage('user', userQuery);
  input.value = '';
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  // Hiển thị hiệu ứng AI đang soạn thảo
  lmsShowTypingIndicator();

  try {
    // 1. Gọi Google Gemini AI với đầy đủ dữ liệu khóa học và tính năng website
    const aiResponse = await window.callGeminiAdvisor(userQuery);

    lmsHideTypingIndicator();

    if (aiResponse) {
      lmsAppendChatMessage('bot', aiResponse);
    } else {
      // 2. Nếu Gemini không phản hồi hoặc lỗi, kích hoạt bộ quy tắc Fallback thông minh
      lmsFallbackAnswer(userQuery);
    }
  } catch (err) {
    console.error('Lỗi khi xử lý câu hỏi:', err);
    lmsHideTypingIndicator();
    lmsFallbackAnswer(userQuery);
  } finally {
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

// Bộ quy tắc dự phòng (Fallback) khi offline hoặc không có mạng
function lmsFallbackAnswer(message) {
  const lower = message.toLowerCase();

  if (lower.includes('diễn đàn') || lower.includes('dien dan') || lower.includes('forum')) {
    lmsChatbotSelectOption('chuc_nang_dien_dan');
  } else if (lower.includes('tính năng') || lower.includes('chức năng') || lower.includes('website có gì') || lower.includes('web có gì')) {
    lmsChatbotSelectOption('tinh_nang_website');
  } else if (lower.includes('avatar') || lower.includes('ảnh đại diện') || lower.includes('anh dai dien') || lower.includes('đổi ảnh')) {
    const reply = `
      📸 <strong>Cách thay đổi ảnh đại diện (Avatar) trên Diễn Đàn:</strong>
      <br><br>
      1. Truy cập vào trang <a href="dien-dan.html" class="lms-chat-link">Diễn đàn (dien-dan.html)</a>.
      <br>
      2. Tại khung Mini Profile ở cột trái hoặc trang cá nhân, bấm vào nút <strong>📷 Camera</strong> hoặc nút <strong>📸 Đổi Ảnh Đại Diện</strong>.
      <br>
      3. Bạn có thể chọn 1 trong các ảnh đại diện mẫu (Giáo viên nam/nữ, Học sinh nam/nữ) hoặc bấm <strong>"Chọn ảnh từ máy tính"</strong> để tải ảnh cá nhân lên.
      <br>
      4. Hệ thống sẽ tự động căn chỉnh khung hình vuông 200x200 chuẩn đẹp và đồng bộ tức thì lên tất cả bài viết, bình luận của bạn!
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('phân quyền') || lower.includes('phan quyen') || lower.includes('xóa bài') || lower.includes('xoa bai') || lower.includes('ghim bài')) {
    const reply = `
      🛡️ <strong>Phân quyền Giáo viên và Học sinh trên Diễn Đàn:</strong>
      <br><br>
      • <strong>🎓 Giáo viên</strong>:
      <br>
      - Có huy hiệu màu vàng cam nổi bật: <em>🎓 Giáo viên</em>.
      <br>
      - Có đặc quyền <strong>Ghim bài viết</strong> lên đầu trang khi soạn bài.
      <br>
      - Có quyền kiểm duyệt và <strong>xóa bài viết hoặc bình luận vi phạm của học sinh</strong> (nút <em>🗑️ Xóa bài học sinh</em>).
      <br><br>
      • <strong>🧑‍🎓 Học sinh</strong>:
      <br>
      - Có huy hiệu màu xanh: <em>🧑‍🎓 Học sinh</em>.
      <br>
      - Đăng bài hỏi bài tập, bình luận thảo luận, thả 5 biểu cảm và chia sẻ kết quả thi thử.
      <br>
      - Học sinh chỉ có quyền chỉnh sửa/xóa bài viết của chính bản thân mình.
      <br><br>
      👉 Trải nghiệm ngay tại: <a href="dien-dan.html" class="lms-chat-link">dien-dan.html</a>
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('lịch học') || lower.includes('lich hoc') || lower.includes('khai giảng') || lower.includes('ca học')) {
    const reply = `
      📅 <strong>Lịch học &amp; Ca học các lớp LMS thường xuyên (19:00 – 21:00):</strong>
      <br><br>
      📚 <strong>Khóa Tin Học Cơ Bản (1.500.000 đ)</strong>:
      <br>
      • Lớp <strong>CB-01</strong>: Thứ 2, thứ 4 (GV Tống Hoàng Thiên) | <a href="dang-ky-khoa-hoc.html?lop=CB-01" class="lms-chat-link">Đăng ký CB-01</a>
      <br>
      • Lớp <strong>CB-02</strong>: Thứ 3, thứ 5 (ThS. Nguyễn Thái Tuấn) | <a href="dang-ky-khoa-hoc.html?lop=CB-02" class="lms-chat-link">Đăng ký CB-02</a>
      <br>
      • Lớp <strong>CB-03</strong>: Thứ 6, chủ nhật (GV Trần Anh Khoa) | <a href="dang-ky-khoa-hoc.html?lop=CB-03" class="lms-chat-link">Đăng ký CB-03</a>
      <br><br>
      🚀 <strong>Khóa Tin Học Nâng Cao (2.500.000 đ)</strong>:
      <br>
      • Lớp <strong>NC-01</strong>: Thứ 3, thứ 5 (GV Tống Hoàng Thiên) | <a href="dang-ky-khoa-hoc.html?lop=NC-01" class="lms-chat-link">Đăng ký NC-01</a>
      <br>
      • Lớp <strong>NC-02</strong>: Thứ 6, chủ nhật (ThS. Nguyễn Thái Tuấn) | <a href="dang-ky-khoa-hoc.html?lop=NC-02" class="lms-chat-link">Đăng ký NC-02</a>
      <br>
      • Lớp <strong>NC-03</strong>: Thứ 2, thứ 4 (GV Trần Anh Khoa) | <a href="dang-ky-khoa-hoc.html?lop=NC-03" class="lms-chat-link">Đăng ký NC-03</a>
      <br><br>
      👉 Đăng ký trực tuyến tại: <a href="dang-ky-khoa-hoc.html" class="lms-chat-link">dang-ky-khoa-hoc.html</a>
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('giáo viên') || lower.includes('giang vien') || lower.includes('thầy cô') || lower.includes('thay co')) {
    const reply = `
      👨‍🏫 <strong>Đội ngũ Giảng viên phụ trách giảng dạy LMS:</strong>
      <br><br>
      1. <strong>ThS. Nguyễn Thái Tuấn</strong> - Trưởng ban Đào tạo, chuyên gia tin học văn phòng và phân tích dữ liệu, giảng dạy lớp <em>CB-02</em> và <em>NC-02</em>.
      <br>
      2. <strong>Giảng viên Tống Hoàng Thiên</strong> - Giảng viên tin học ứng dụng, phụ trách lớp <em>CB-01</em> và <em>NC-01</em>.
      <br>
      3. <strong>Giảng viên Trần Anh Khoa</strong> - Giảng viên kỹ năng số và luyện thi chứng chỉ quốc tế MOS, phụ trách lớp <em>CB-03</em> và <em>NC-03</em>.
      <br><br>
      Tất cả các thầy đều có nhiều năm kinh nghiệm giảng dạy nhiệt tình, theo sát và hỗ trợ học viên 1-1 trong suốt khóa học.
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('đăng ký') || lower.includes('dang ky') || lower.includes('thanh toán') || lower.includes('chuyển khoản')) {
    const reply = `
      📝 <strong>Quy trình Đăng ký &amp; Thanh toán học phí:</strong>
      <br><br>
      1. Truy cập trang <a href="dang-ky-khoa-hoc.html" class="lms-chat-link">Đăng Ký Khóa Học (dang-ky-khoa-hoc.html)</a>.
      <br>
      2. Chọn lớp học mong muốn (CB-01..03 hoặc NC-01..03) và nhập Họ tên, SĐT, Email.
      <br>
      3. Quét mã <strong>VietQR ngân hàng</strong> để chuyển khoản tự động chuẩn cú pháp.
      <br>
      4. Tải lên hình ảnh biên lai/minh chứng chuyển khoản.
      <br>
      5. Ban đào tạo sẽ xác nhận và kích hoạt quyền vào lớp trong vòng 10-15 phút!
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('lớp học của tôi') || lower.includes('lop hoc cua toi') || lower.includes('bài tập') || lower.includes('tai lieu')) {
    const reply = `
      📖 Trang <strong>Lớp Học Của Tôi</strong> (<a href="lop-hoc-cua-toi.html" class="lms-chat-link">lop-hoc-cua-toi.html</a>):
      <br><br>
      • Dành cho học sinh đã đăng ký và giáo viên giảng dạy.
      <br>
      • Nơi bạn vào lớp học trực tuyến, tải giáo trình PDF, file thực hành Word/Excel/PowerPoint mẫu.
      <br>
      • Nộp bài tập về nhà và nhận chấm điểm, lời phê nhận xét chi tiết từ giáo viên.
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('gõ phím') || lower.includes('đánh máy') || lower.includes('10 ngón')) {
    const reply = `
      Tiện ích <strong>Luyện gõ phím 10 ngón</strong> (<a href="luyen-go-phim.html" class="lms-chat-link">luyen-go-phim.html</a>) giúp bạn rèn tốc độ gõ máy tính thần tốc:
      <br><br>
      • Bàn phím ảo trực quan đổi màu theo phím cần gõ và hướng dẫn ngón tay tương ứng.
      <br>
      • Đo lường chỉ số WPM (từ/phút), độ chính xác % và số lỗi sai thời gian thực.
      <br>
      • Nhiều cấp độ từ hàng phím cơ sở (ASDF - JKL;) đến đoạn văn bản thực tế.
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('test phím') || lower.includes('kiểm tra bàn phím') || lower.includes('kẹt phím') || lower.includes('liệt phím')) {
    const reply = `
      Tiện ích <strong>Kiểm tra bàn phím (Keyboard Tester)</strong> (<a href="kiem-tra-ban-phim.html" class="lms-chat-link">kiem-tra-ban-phim.html</a>) giúp bạn kiểm tra phần cứng bàn phím máy tính:
      <br><br>
      • Mô phỏng bàn phím Full-size 104 nút.
      <br>
      • Khi bấm phím trên bàn phím thật, phím ảo trên web sẽ đổi màu sáng lên để xác nhận phím hoạt động tốt, không bị kẹt hay liệt.
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('phím tắt') || lower.includes('phim tat')) {
    const reply = `
      Kho <strong>Tra cứu phím tắt nhanh</strong> (<a href="tra-cuu-phim-tat.html" class="lms-chat-link">tra-cuu-phim-tat.html</a>) tổng hợp hàng trăm phím tắt hữu ích cho Windows, Word, Excel, PowerPoint có ô tìm kiếm tức thì.
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('thi thử') || lower.includes('trắc nghiệm') || lower.includes('de thi')) {
    const reply = `
      Hệ thống <strong>Ôn luyện thi thử</strong> (<a href="on-luyen-thi-thu.html" class="lms-chat-link">on-luyen-thi-thu.html</a>) cung cấp đề thi trắc nghiệm bấm giờ chuẩn kỳ thi CNTT Cơ bản và chứng chỉ quốc tế MOS/IC3, tự động chấm điểm và xem lời giải chi tiết.
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else if (lower.includes('học phí') || lower.includes('bao nhiêu tiền') || lower.includes('giá')) {
    const reply = `
      💰 <strong>Học phí các khóa học hiện tại:</strong>
      <br><br>
      • Khóa Tin Học Cơ Bản: <strong>1.500.000 đ</strong> (14 buổi, Lớp CB-01..03) | <a href="gioi-thieu-khoa-hoc.html?khoa=co-ban" class="lms-chat-link">Xem chi tiết</a>
      <br>
      • Khóa Tin Học Nâng Cao: <strong>2.500.000 đ</strong> (15 buổi, Lớp NC-01..03) | <a href="gioi-thieu-khoa-hoc.html?khoa=nang-cao" class="lms-chat-link">Xem chi tiết</a>
      <br>
      • Combo Toàn diện (Word + Excel + PPT): <strong>690.000 đ</strong> (Tiết kiệm 40%)
      <br><br>
      👉 Đăng ký trực tuyến tại: <a href="dang-ky-khoa-hoc.html" class="lms-chat-link">dang-ky-khoa-hoc.html</a>
    `;
    lmsAppendChatMessage('bot', reply, true);
  } else {
    lmsChatbotSelectOption('tu_van_khoa_hoc');
  }
}
