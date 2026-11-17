(() => {
  function create(root, api, onChanged, onUnauthorized) {
    const find = selector => root.querySelector(selector);
    const form = find('#lms-review-form'), message = find('#lms-review-message');
    const names = {approve:'Xác nhận thanh toán và duyệt', request_more:'Yêu cầu bổ sung', reject:'Từ chối'};
    let current = null, decision = null, busy = false, retry = null, generation = 0;
    const buttons = Object.keys(names).map(key => [key,find('#lms-review-'+key)]);
    const fields = ['#lms-review-verified','#lms-review-reason','#lms-review-submit','#lms-review-cancel'];
    function controls() {
      for (const [key,button] of buttons) button.disabled = busy || !current?.actions?.[key];
      for (const selector of fields) find(selector).disabled = busy;
      find('#lms-admin-close').disabled = busy;
      form.setAttribute('aria-busy',String(busy));
    }
    function clear() {
      decision = null; retry = null; form.hidden = true;
      find('#lms-review-reason').value = '';
      find('#lms-review-verified').checked = false;
    }
    function reset() {
      generation++; current = null; busy = false; clear();
      message.textContent = ''; find('#lms-review-history').replaceChildren(); controls();
    }
    function show(data) {
      reset(); current = data;
      find('#lms-review-actions').hidden = !Number.isInteger(data.revision);
      const history = (data.history || []).map(item => {
        const article = document.createElement('article');
        const lines = [
          `${names[item.decision] || item.decision} · ${item.actor_name} (${item.actor_username})`,
          new Date(item.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' (giờ Việt Nam)',
          `${item.before_status_label || item.before_status} → ${item.after_status_label || item.after_status}`
        ];
        if (item.public_reason) lines.push('Lý do gửi người đăng ký: '+item.public_reason);
        if (item.notes) lines.push('Ghi chú nội bộ: '+item.notes);
        if (item.received_vnd !== null) lines.push('Đã xác nhận: '+Number(item.received_vnd).toLocaleString('vi-VN')+'đ · '+(item.manual_confirmation?'Giáo viên xác nhận thủ công':('Giao dịch: '+item.bank_transaction)));
        for (const line of lines) {const p=document.createElement('p');p.textContent=line;article.append(p);}
        return article;
      });
      find('#lms-review-history').replaceChildren(...history);
      find('#lms-review-no-history').hidden = history.length !== 0;
      controls();
    }
    for (const [key,button] of buttons) button.addEventListener('click', () => {
      if (busy || !current?.actions?.[key]) return;
      clear(); decision = key; form.hidden = false; message.textContent = '';
      const approval = key === 'approve';
      find('#lms-review-form-title').textContent = names[key];
      find('#lms-review-payment-fields').hidden = !approval;
      find('#lms-review-reason-field').hidden = approval;
      find('#lms-review-verified').required = approval;
      find('#lms-review-reason').required = !approval;
      find('#lms-review-snapshot').textContent = `Học phí đã lưu: ${Number(current.registration.fee_vnd).toLocaleString('vi-VN')}đ · Nội dung: ${current.registration.transfer_content}`;
      find('#lms-review-submit').textContent = names[key];
      find(approval?'#lms-review-verified':'#lms-review-reason').focus();
    });
    find('#lms-review-cancel').addEventListener('click', () => {if(!busy){clear();message.textContent='';}});
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !decision || !current?.actions?.[decision]) return;
      const payload = {reference:current.registration.reference,version:current.revision,decision,
        reason:find('#lms-review-reason').value.trim()};
      if (decision === 'approve') {
        if (!find('#lms-review-verified').checked) {
          message.textContent = 'Vui lòng xác nhận đã kiểm tra khoản tiền thực nhận đúng học phí và nội dung chuyển khoản.';return;
        }
        payload.funds_verified=true;
      } else if (!payload.reason) {message.textContent='Vui lòng nhập lý do gửi cho người đăng ký.';return;}
      if (decision==='reject' && !window.confirm(
        `${names[decision]} hồ sơ ${payload.reference}? ${decision==='approve'?'Hãy chắc chắn đã đối chiếu tiền thực nhận. Hồ sơ sẽ chờ cấp quyền học.':'Hồ sơ sẽ được giải phóng chỗ. Thao tác này không hoàn tiền.'}`)) return;
      const serialized = JSON.stringify(payload);
      if (!retry || retry.body !== serialized) retry = {body:serialized,key:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')};
      const sequence = generation;
      busy=true;controls();message.textContent='Đang lưu quyết định…';
      try {
        const {csrf} = await api.request('session');
        const result = await api.request('admin_review',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':retry.key},body:retry.body});
        if (sequence!==generation) return;
        if (result.registration?.reference!==payload.reference) throw new Error('Chưa xác nhận được kết quả. Vui lòng mở lại hồ sơ.');
        busy=false;clear();
        await onChanged(payload.reference);
        if (current?.registration.reference===payload.reference) message.textContent='Đã lưu: '+result.registration.status_label;
      } catch(error) {
        if(sequence!==generation)return;
        message.textContent=error.message||'Chưa xác nhận được kết quả. Có thể gửi lại cùng thao tác để kiểm tra.';
        if(error.status===401||error.status===403) onUnauthorized(error);
        if(error.status===409) {
          // A stale screen cannot submit another decision until the profile is loaded again.
          current.actions={};clear();
          message.textContent=(error.message||'Hồ sơ đã thay đổi.')+' Bấm “Xem chi tiết” để tải thông tin mới.';
        }
      } finally {if(sequence===generation){busy=false;controls();}}
    });
    return Object.freeze({show,reset,isBusy:()=>busy});
  }
  window.THVP_LMS_REVIEW=Object.freeze({create});
})();
