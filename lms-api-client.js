(() => {
  function connectionError(code,message){const error=new Error(message);error.code=code;return error;}
  async function request(action, options = {}) {
    if(window.location?.protocol==='file:')throw connectionError('LMS_FILE_URL','Trang đang mở trực tiếp từ tệp trên máy nên không thể đăng nhập. Vui lòng mở trang bằng máy chủ PHP.');
    const {timeoutMs = 15000, ...fetchOptions} = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await fetch(`lms-api.php?action=${action}`, {
          credentials: 'same-origin', cache: 'no-store', ...fetchOptions, signal: controller.signal
        });
      } catch(error) {
        if(error.name==='AbortError')throw connectionError('LMS_TIMEOUT','Máy chủ phản hồi quá lâu. Vui lòng thử lại.');
        throw connectionError('LMS_NETWORK','Không kết nối được API của website. Vui lòng kiểm tra địa chỉ trang và máy chủ PHP đang chạy.');
      }
      let data;
      try { data=await response.json(); }
      catch { throw connectionError('LMS_NOT_JSON','Địa chỉ đang mở không trả dữ liệu API hợp lệ. Vui lòng dùng máy chủ PHP, không mở tệp trực tiếp hoặc dùng Live Server.'); }
      if(!data||typeof data!=='object'||Array.isArray(data))throw connectionError('LMS_NOT_JSON','Máy chủ trả dữ liệu API không hợp lệ. Vui lòng kiểm tra địa chỉ website.');
      if (!response.ok) {
        const error = new Error(data.error || 'Không thể kết nối dịch vụ đăng ký.');
        error.status = response.status;
        error.fields = data.fields;
        error.code = data.code;
        error.mail = data.mail;
        throw error;
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  function availability(row) {
    return {open: `Còn nhận ${row.remaining} học sinh`, held_full: 'Tạm hết chỗ',
      full: 'Lớp đã đủ học sinh', closed: 'Lớp đang đóng đăng ký'}[row.availability];
  }
  window.THVP_LMS_API = Object.freeze({request, availability});
})();
