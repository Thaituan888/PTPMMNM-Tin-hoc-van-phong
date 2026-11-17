(async () => {
  const root = document.getElementById('lms-registration');
  if (!root) return;
  const find = selector => root.querySelector(selector);
  const params = new URLSearchParams(window.location.search);
  const code = params.get('lop');
  const newEntry = params.get('dang-ky') === 'moi';
  const classes = window.THVP_LMS_DATA.classes;
  if (params.getAll('lop').length !== 1 || !Object.hasOwn(classes, code)) {
    find('#lms-invalid-class').hidden = false;
    find('#lms-api-status').textContent = '';
    return;
  }
  const api = window.THVP_LMS_API;
  const status = find('#lms-api-status');
  if (!api) { status.textContent = 'Vui lòng mở trang bằng máy chủ PHP.'; return; }
  let session, serverClass;
  try {
    session = await api.request('session');
    const result = await api.request('classes');
    serverClass = result.classes.find(row => row.code === code);
    if (!serverClass) throw new Error('Lớp chưa được mở trên máy chủ.');
  } catch {
    status.textContent = 'Chưa kết nối được dịch vụ đăng ký. Vui lòng dùng máy chủ PHP và tải lại trang.';
    return;
  }
  status.textContent = '';
  const selected = {code: serverClass.code, courseKey: serverClass.course_key,
    courseName: serverClass.course_name, teacher: serverClass.teacher, days: serverClass.days,
    time: serverClass.time, fee: `${Number(serverClass.fee_vnd).toLocaleString('vi-VN')}đ/khóa`, capacity: serverClass.capacity};
  document.title = `Đăng ký lớp ${selected.code} | Tin Học Văn Phòng`;
  find('#lms-back-course').href = `gioi-thieu-khoa-hoc.html?khoa=${selected.courseKey}#lms-schedule`;
  find('#lms-start-new').href = `dang-ky-khoa-hoc.html?lop=${encodeURIComponent(code)}&dang-ky=moi`;
  find('#lms-valid-class').hidden = false;

  function renderDetails(target, entries) {
    const nodes = entries.flatMap(([label, value]) => {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value;
      if (label === 'Trạng thái') description.id = 'lms-record-status';
      return [term, description];
    });
    target.replaceChildren(...nodes);
  }
  const classInfo = [
    ['Mã lớp', selected.code], ['Khóa học', selected.courseName],
    ['Giáo viên', selected.teacher], ['Lịch học', selected.days],
    ['Giờ học', selected.time], ['Học phí', selected.fee]
  ];
  renderDetails(find('#lms-class-info'), classInfo);
  find('#lms-capacity').textContent = api.availability(serverClass);
  const createButton = find('#lms-create');
  const editButton = find('#lms-edit');
  let accessChecked = false, busy = false, uncertain = false;
  createButton.disabled = true;
  const continueButton = find('#lms-learner-form').querySelector('button[type="submit"]');
  continueButton.disabled = serverClass.availability !== 'open';
  const storageKey = `thvp_lms_${newEntry?'new_request':'request'}_${code}`;
  function randomKey() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join(''); }
  let requestKey;
  try { requestKey = sessionStorage.getItem(storageKey); } catch {}
  if (!requestKey) requestKey = randomKey();
  function rememberKey() { try { sessionStorage.setItem(storageKey, requestKey); } catch {} }
  rememberKey();
  const paymentController = window.THVP_LMS_PAYMENT.create(root, api, session.csrf, code);
  function savedUrl(){return `dang-ky-khoa-hoc.html?lop=${encodeURIComponent(code)}`;}
  async function updateSaved(record) {
    find('#lms-entry').hidden = true;
    find('#lms-confirmation').hidden = true;
    find('#lms-saved').hidden = false;
    const c = record.class;
    renderDetails(find('#lms-saved-info'), [
      ['Mã hồ sơ', record.reference], ['Lớp', c.code], ['Khóa học', c.course_name],
      ['Giáo viên', c.teacher], ['Lịch học', `${c.days}, ${c.time}`],
      ['Học phí', `${record.fee_vnd.toLocaleString('vi-VN')}đ`],
      ['Họ và tên', record.fullname], ['Điện thoại', record.phone], ['Email', record.email],
      ['Giữ chỗ',record.hold_reserved===true ? (record.status==='pending_payment'?'Đang giữ chỗ trong thời hạn đăng ký':record.status==='approved_waiting_access'?'Đang giữ chỗ chờ cấp quyền học':'Đang giữ chỗ chờ đối chiếu') : (record.hold_reserved===false?'Không giữ chỗ':'Xem trạng thái hồ sơ')],
      ['Hạn giữ chỗ ban đầu', new Date(record.expires_at).toLocaleString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'}) + ' (giờ Việt Nam)'],
      ['Trạng thái', record.status_label || (record.status === 'expired' ? 'Đã hết hạn giữ chỗ – chưa xác nhận thanh toán' :
        record.status === 'pending_review' ? 'Chờ đối chiếu – chưa xác nhận thanh toán' : 'Chưa xác nhận thanh toán')]
    ]);
    find('#lms-new-request').hidden = record.status !== 'expired';
    const reason=find('#lms-public-reason');
    reason.textContent=record.public_reason ? 'Thông tin từ giáo viên: '+record.public_reason : '';
    reason.hidden=!record.public_reason;
    await paymentController.show(record);
  }
  const evidenceController = window.THVP_LMS_EVIDENCE.create(root, api, session.csrf, code, async saved => {
    await updateSaved(saved);
    await refreshCapacity();
  });
  async function showSaved(record, restored = false) {
    find('#lms-restored-notice').hidden = !restored;
    await updateSaved(record);
    find('#lms-saved-title').focus();
    await evidenceController.show(record);
  }
  find('#lms-new-request').addEventListener('click', async () => {
    paymentController.reset();
    evidenceController.reset();
    requestKey = randomKey(); rememberKey();
    for (const key of ['name','phone','email']) {
      find(`#lms-${key}`).value = '';
      find(`#lms-${key}`).removeAttribute('aria-invalid');
      find(`#lms-${key}-error`).textContent = '';
    }
    find('#lms-confirmation').hidden = true;
    find('#lms-restored-notice').hidden = true;
    find('#lms-saved').hidden = true;
    find('#lms-entry').hidden = false;
    find('#lms-name').focus();
    await refreshCapacity();
  });
  async function refreshCapacity() {
    try {
      const result = await api.request('classes');
      serverClass = result.classes.find(row => row.code === code);
      find('#lms-capacity').textContent = serverClass ? api.availability(serverClass) : 'Lớp chưa mở';
      continueButton.disabled = serverClass?.availability !== 'open';
      createButton.disabled = busy || !accessChecked || (!uncertain && continueButton.disabled);
    } catch { createButton.disabled = continueButton.disabled = true; }
  }
  window.addEventListener('focus', refreshCapacity);
  createButton.addEventListener('click', async () => {
    if (busy || !accessChecked) return;
    busy = true;
    createButton.disabled = editButton.disabled = true;
    status.textContent = 'Đang lưu hồ sơ…';
    try {
      const result = await api.request('register', {method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf, 'Idempotency-Key': requestKey},
        body: JSON.stringify({class_code: code, fullname: find('#lms-name').value.trim(),
          phone: find('#lms-phone').value.trim(), email: find('#lms-email').value.trim()})});
      status.textContent = '';
      if(newEntry){
        window.history.replaceState(null,'',savedUrl());
        try{sessionStorage.removeItem(storageKey);}catch{}
        find('#lms-existing-record').hidden=true;
      }
      await showSaved(result.registration);
    } catch (error) {
      uncertain = !error.status;
      status.textContent = error.message || 'Chưa nhận được kết quả. Hãy thử lại với cùng yêu cầu.';
      if (error.fields) {
        find('#lms-confirmation').hidden = true;
        find('#lms-entry').hidden = false;
        for (const [key, message] of Object.entries(error.fields)) {
          if (!['name','phone','email'].includes(key)) continue;
          find(`#lms-${key}-error`).textContent = message;
          find(`#lms-${key}`).setAttribute('aria-invalid', 'true');
        }
      }
    } finally { busy = false; editButton.disabled = false; await refreshCapacity(); }
  });

  const form = find('#lms-learner-form');
  const fields = ['name', 'phone', 'email'];
  function validate(key) {
    const input = find(`#lms-${key}`);
    const value = input.value.trim();
    let message = '';
    if (!value) message = 'Vui lòng nhập thông tin này.';
    else if (key === 'email' && (input.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.includes('..'))) {
      message = 'Vui lòng nhập email đúng định dạng, ví dụ: ban@example.com.';
    } else if (key === 'phone') {
      // Chấp nhận số Việt Nam: di động hoặc cố định, dạng 0... hoặc +84... .
      const normalized = value.replace(/[\s().-]/g, '').replace(/^\+84/, '0');
      if (!/^0(?:[35789]\d{8}|2\d{9})$/.test(normalized)) {
        message = 'Vui lòng nhập số điện thoại Việt Nam hợp lệ.';
      }
    }
    find(`#lms-${key}-error`).textContent = message;
    input.setAttribute('aria-invalid', String(Boolean(message)));
    return !message;
  }
  fields.forEach(key => {
    const input = find(`#lms-${key}`);
    input.addEventListener('blur', () => validate(key));
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validate(key);
    });
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const valid = fields.map(validate);
    const firstInvalid = valid.indexOf(false);
    if (firstInvalid !== -1) {
      find(`#lms-${fields[firstInvalid]}`).focus();
      return;
    }
    renderDetails(find('#lms-confirm-class'), classInfo);
    renderDetails(find('#lms-confirm-learner'), [
      ['Họ và tên', find('#lms-name').value.trim()],
      ['Số điện thoại', find('#lms-phone').value.trim()],
      ['Email nhận thông tin đăng nhập', find('#lms-email').value.trim()]
    ]);
    find('#lms-entry').hidden = true;
    find('#lms-confirmation').hidden = false;
    find('#lms-confirm-title').focus();
  });
  find('#lms-edit').addEventListener('click', () => {
    find('#lms-confirmation').hidden = true;
    find('#lms-entry').hidden = false;
    find('#lms-name').focus();
  });
  try {
    const result = await api.request(`registration&class_code=${encodeURIComponent(code)}`);
    accessChecked = true;
    if(newEntry){
      find('#lms-existing-record').hidden=false;
      for(const field of ['name','phone','email'])find(`#lms-${field}`).value='';
      find('#lms-resume-record').addEventListener('click',async()=>{
        find('#lms-existing-record').hidden=true;
        window.history.replaceState(null,'',savedUrl());
        await showSaved(result.registration,true);
      });
    }else await showSaved(result.registration, true);
  } catch (error) {
    if (error.status === 404) accessChecked = true;
    else {
      status.textContent = 'Chưa kiểm tra được hồ sơ đã có. Vui lòng tải lại trang trước khi tạo hồ sơ.';
      createButton.disabled = true;
    }
  }
  // Tự động điền thông tin nếu học viên đã đăng nhập tài khoản trên hệ thống
  try {
    const curUser = window.THVP_AUTH ? window.THVP_AUTH.getCurrentUser() : null;
    if (curUser) {
      const nameInput = find('#lms-name');
      const emailInput = find('#lms-email');
      if (nameInput && !nameInput.value && curUser.fullname) nameInput.value = curUser.fullname;
      if (emailInput && !emailInput.value && curUser.email) emailInput.value = curUser.email;
    }
  } catch (e) {}
  await refreshCapacity();
})();
