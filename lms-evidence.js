(() => {
  function create(root, api, csrf, code, onSaved) {
    const find = selector => root.querySelector(selector);
    let record = null, selected = null, preview = null, requestKey = null, busy = false;
    let uploadAvailable = false, canSubmit = false, generation = 0;
    const input = find('#lms-evidence-file'), send = find('#lms-evidence-send');
    const status = find('#lms-evidence-status');
    function controls() {
      input.disabled = busy || !canSubmit;
      send.disabled = busy || !selected || !canSubmit || !uploadAvailable;
      find('#lms-evidence-refresh').disabled = busy;
      find('#lms-new-request').disabled = busy;
      find('#lms-evidence').setAttribute('aria-busy', String(busy));
    }
    function clearSelection(clearInput = true) {
      if (preview) URL.revokeObjectURL(preview);
      preview = null; selected = null; requestKey = null;
      if (clearInput) input.value = '';
      find('#lms-evidence-preview').removeAttribute('src');
      find('#lms-evidence-preview').hidden = true;
    }
    function applyState(saved) {
      record = saved;
      const late = ['expired','late_review'].includes(saved.status) || (saved.status==='needs_more' && saved.hold_reserved===false);
      const final = ['approved_waiting_access','rejected','enrolled'].includes(saved.status);
      find('#lms-evidence-note').textContent = final
        ? (saved.status==='enrolled'?'Đã được ghi danh vào lớp. Không cần gửi thêm minh chứng.':saved.status==='approved_waiting_access'?'Hồ sơ đã duyệt, đang chờ cấp quyền học. Không cần gửi thêm minh chứng.':'Hồ sơ bị từ chối, không nhận thêm minh chứng. Thông tin và ảnh cũ được giữ để tra cứu; không có xác nhận hoàn tiền tự động.') : late
        ? 'Hồ sơ đã hết hạn giữ chỗ. Minh chứng được tiếp nhận để kiểm tra riêng; không giữ thêm chỗ và không bảo đảm được nhận học.'
        : 'Minh chứng được giáo viên đối chiếu. Gửi ảnh chưa có nghĩa là thanh toán đã được xác nhận.';
      const label = find('#lms-record-status');
      if (label && saved.status_label) label.textContent = saved.status_label;
      const reason=find('#lms-public-reason');
      if(reason){reason.textContent=saved.public_reason?'Thông tin từ giáo viên: '+saved.public_reason:'';reason.hidden=!saved.public_reason;}
      find('#lms-new-request').hidden = saved.status !== 'expired';
    }
    async function load() {
      if (!record) return false;
      const sequence = generation;
      try {
        const data = await api.request(`evidence&class_code=${encodeURIComponent(code)}`);
        if (sequence !== generation) return false;
        if (data.registration.reference !== record.reference) throw new Error('Hồ sơ đã thay đổi. Vui lòng tải lại trang.');
        applyState(data.registration);
        uploadAvailable = data.upload.upload_available; canSubmit = data.can_submit;
        find('#lms-evidence-config').textContent = data.upload.configuration_error || '';
        const entries = data.evidence.map(item => {
          const article = document.createElement('article'); article.className = 'lms-evidence-item';
          const date = document.createElement('p');
          date.textContent = `Đã gửi: ${new Date(item.submitted_at).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})} (giờ Việt Nam)${item.timeliness === 'late' ? ' — nộp muộn' : ''}`;
          const link = document.createElement('a');
          if (!item.image_url.startsWith('lms-api.php?action=evidence_image&')) throw new Error('Đường dẫn ảnh không hợp lệ.');
          link.href = item.image_url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          const image = document.createElement('img');
          image.src = item.image_url; image.alt = 'Ảnh minh chứng đã lưu'; image.loading = 'lazy';
          image.referrerPolicy = 'no-referrer';
          link.append(image, document.createTextNode('Xem ảnh đầy đủ'));
          article.append(date, link); return article;
        });
        find('#lms-evidence-history').replaceChildren(...entries);
        find('#lms-evidence-empty').hidden = entries.length !== 0;
        controls(); return true;
      } catch (error) {
        if (sequence !== generation) return false;
        uploadAvailable = false; controls();
        status.textContent = error.message || 'Chưa tải được minh chứng. Vui lòng thử tải lại danh sách ảnh.';
        return false;
      }
    }
    input.addEventListener('change', () => {
      if (busy) return;
      const file = input.files?.[0];
      clearSelection(false); status.textContent = '';
      if (!file) { controls(); return; }
      if (file.size < 1 || file.size > 5 * 1024 * 1024) {
        status.textContent = 'Ảnh phải có dung lượng từ 1 byte đến 5 MB.'; controls(); return;
      }
      if (!/\.(jpe?g|png)$/i.test(file.name) || (file.type && !['image/jpeg','image/png'].includes(file.type))) {
        status.textContent = 'Chỉ chọn ảnh JPG hoặc PNG.'; controls(); return;
      }
      selected = file;
      requestKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2,'0')).join('');
      preview = URL.createObjectURL(file);
      find('#lms-evidence-preview').src = preview;
      find('#lms-evidence-preview').hidden = false;
      controls();
    });
    send.addEventListener('click', async () => {
      if (busy) return;
      if (!selected) { status.textContent = 'Vui lòng chọn ảnh minh chứng.'; return; }
      if (!canSubmit || !uploadAvailable) { status.textContent = 'Chưa thể gửi ảnh. Vui lòng tải lại danh sách để kiểm tra.'; return; }
      busy = true; controls(); status.textContent = 'Đang tải và lưu minh chứng…';
      try {
        const form = new FormData(); form.append('image', selected);
        const result = await api.request(`evidence_upload&class_code=${encodeURIComponent(code)}`, {
          method:'POST', timeoutMs:60000,
          headers:{'X-CSRF-Token':csrf,'Idempotency-Key':requestKey,'X-LMS-Registration':record.reference}, body:form
        });
        if (!result.evidence?.id || result.registration?.reference !== record.reference) throw new Error('Chưa xác nhận được kết quả lưu ảnh. Bạn có thể gửi lại ảnh đã chọn.');
        applyState(result.registration);
        clearSelection();
        await onSaved(result.registration);
        const refreshed = await load();
        status.textContent = refreshed
          ? 'Đã lưu minh chứng. Thanh toán chưa được xác nhận.'
          : 'Đã lưu minh chứng nhưng chưa tải lại được danh sách ảnh. Vui lòng tải lại danh sách.';
      } catch (error) {
        status.textContent = error.message || 'Chưa nhận được kết quả lưu ảnh. Hãy thử lại; ảnh đã chọn vẫn được giữ.';
      } finally { busy = false; controls(); }
    });
    find('#lms-evidence-refresh').addEventListener('click', async () => {
      status.textContent = '';
      await load();
      if (record) await onSaved(record);
    });
    function reset() {
      generation++; clearSelection(); record = null; canSubmit = uploadAvailable = false;
      find('#lms-evidence').hidden = true;
      find('#lms-evidence-history').replaceChildren();
      find('#lms-evidence-config').textContent = ''; status.textContent = ''; controls();
    }
    async function show(saved) {
      if (record?.reference !== saved.reference) reset();
      applyState(saved); find('#lms-evidence').hidden = false;
      await load();
    }
    return Object.freeze({show,reset});
  }
  window.THVP_LMS_EVIDENCE = Object.freeze({create});
})();
