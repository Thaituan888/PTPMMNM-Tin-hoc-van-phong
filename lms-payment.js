(() => {
  function create(root, api, csrf, code) {
    const find = selector => root.querySelector(selector);
    let record = null, payment = null, deadline = 0, timer = null, generation = 0, loading = null;
    const copyFields = [['#lms-account-copy', '#lms-account'], ['#lms-amount-copy', '#lms-amount'], ['#lms-copy', '#lms-transfer']];

    function clearQR() {
      find('#lms-qr-image').hidden = true;
      find('#lms-qr-image').removeAttribute('src');
      find('#lms-qr-download').hidden = true;
    }
    function hideInstructions() {
      clearQR();
      find('#lms-payment-details').hidden = true;
      find('#lms-bank-info').replaceChildren();
      for (const [button, input] of copyFields) {
        find(button).disabled = true;
        find(input).value = '';
      }
      payment = null;
    }
    function expired() {
      if (record) record.status = 'expired';
      hideInstructions();
      find('#lms-qr-retry').hidden = true;
      find('#lms-payment-message').textContent = 'Hồ sơ đã hết hạn giữ chỗ. Vui lòng không tiếp tục thanh toán theo hồ sơ này.';
      find('#lms-countdown').textContent = 'Đã hết hạn giữ chỗ';
      find('#lms-new-request').hidden = false;
      const status = find('#lms-record-status');
      if (status) status.textContent = 'Đã hết hạn giữ chỗ – chưa xác nhận thanh toán';
      if (timer) clearInterval(timer);
      timer = null;
    }
    function active() {
      if (!record || record.status !== 'pending_payment') return false;
      if (performance.now() >= deadline) { expired(); return false; }
      return true;
    }
    function tick() {
      if (!active()) return;
      const seconds = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      find('#lms-countdown').textContent = `Thời gian giữ chỗ còn lại: ${Math.floor(seconds / 60)} phút ${seconds % 60} giây`;
    }
    function paintQR() {
      clearQR();
      if (!active() || !payment?.configured) return;
      try {
        if (!payment.qr_payload) throw new Error('No payload');
        const image = window.THVP_LMS_QR.png(payment.qr_payload);
        if (!active()) return;
        find('#lms-qr-image').src = image;
        find('#lms-qr-image').hidden = false;
        find('#lms-qr-download').hidden = false;
        find('#lms-qr-error').textContent = '';
      } catch {
        find('#lms-qr-error').textContent = 'Chưa tạo được QR. Bạn có thể chuyển khoản thủ công theo thông tin bên cạnh hoặc thử tạo QR lại.';
      }
      find('#lms-qr-retry').hidden = false;
    }
    function render(data, requestedAt) {
      if (data.reference !== record.reference) throw new Error('Hồ sơ đã thay đổi. Vui lòng tải lại trang.');
      hideInstructions();
      find('#lms-payment-message').textContent = data.configuration_error
        ? `${data.message}. ${data.configuration_error}` : data.message;
      const remaining = Date.parse(data.expires_at) - (data.server_time_ms ?? Date.parse(data.server_time));
      if (!Number.isFinite(remaining)) throw new Error('Không xác định được thời hạn giữ chỗ.');
      deadline = requestedAt + remaining;
      if (!data.eligible) {
        find('#lms-qr-retry').hidden = true;
        if (data.status === 'expired') expired();
        else {
          record.status = data.status;
          find('#lms-countdown').textContent = 'Hồ sơ không ở bước chờ thanh toán';
          const status = find('#lms-record-status');
          if (status) status.textContent = data.status_label || 'Không tiếp tục thanh toán theo hồ sơ này';
        }
        return;
      }
      record.status = data.status;
      tick();
      if (!active()) return;
      find('#lms-qr-retry').hidden = false;
      if (!data.configured) return;
      payment = data;
      const nodes = [];
      for (const [label, value] of [['Ngân hàng', data.bank.bank_name], ['Mã ngân hàng/BIN', data.bank.bank_bin], ['Chủ tài khoản', data.bank.account_name]]) {
        const term = document.createElement('dt'), description = document.createElement('dd');
        term.textContent = label; description.textContent = value; nodes.push(term, description);
      }
      find('#lms-bank-info').replaceChildren(...nodes);
      find('#lms-account').value = data.bank.account_number;
      find('#lms-amount').value = String(data.amount_vnd);
      find('#lms-transfer').value = data.transfer_content;
      for (const [button] of copyFields) find(button).disabled = false;
      find('#lms-payment-details').hidden = false;
      paintQR();
    }
    async function load() {
      if (!record) return;
      if (loading) return loading;
      const sequence = generation;
      const task = (async () => {
        const requestedAt = performance.now();
        try {
          const {payment: data} = await api.request(`payment&class_code=${encodeURIComponent(code)}`, {
            method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: '{}'
          });
          if (sequence === generation) render(data, requestedAt);
        } catch {
          if (sequence !== generation) return;
          hideInstructions();
          find('#lms-payment-message').textContent = 'Chưa lấy được thông tin thanh toán. Vui lòng thử lại; hồ sơ và thời hạn giữ chỗ vẫn được giữ nguyên.';
          find('#lms-qr-retry').hidden = false;
          if (deadline && performance.now() >= deadline) expired();
        }
      })();
      loading = task;
      try { await task; } finally { if (loading === task) loading = null; }
    }
    async function show(saved) {
      reset();
      record = {...saved};
      find('#lms-payment').hidden = false;
      find('#lms-payment-message').textContent = 'Đang lấy thông tin thanh toán…';
      if (saved.status === 'expired') { expired(); return; }
      await load();
      if (record && record.status === 'pending_payment' && deadline > performance.now()) {
        timer = setInterval(tick, 1000);
      }
    }
    function reset() {
      generation++;
      if (timer) clearInterval(timer);
      timer = null; record = null; deadline = 0; loading = null;
      hideInstructions();
      find('#lms-payment').hidden = true;
      find('#lms-countdown').textContent = '';
      find('#lms-copy-status').textContent = '';
      find('#lms-qr-error').textContent = '';
      find('#lms-qr-retry').hidden = true;
    }
    copyFields.forEach(([button, input]) => find(button).addEventListener('click', async () => {
      if (!active() || !payment?.configured) return;
      try {
        await navigator.clipboard.writeText(find(input).value);
        find('#lms-copy-status').textContent = 'Đã sao chép.';
      } catch {
        find(input).select();
        find('#lms-copy-status').textContent = 'Hãy sao chép phần nội dung đã chọn.';
      }
    }));
    find('#lms-qr-retry').addEventListener('click', async () => {
      find('#lms-qr-retry').disabled = true;
      clearQR();
      await load();
      find('#lms-qr-retry').disabled = false;
    });
    find('#lms-qr-download').addEventListener('click', async () => {
      await load(); // Re-authorize and re-check eligibility before every download.
      if (!active() || !payment?.qr_payload || find('#lms-qr-image').hidden) return;
      const link = document.createElement('a');
      link.href = find('#lms-qr-image').src;
      link.download = `${record.reference}-vietqr.png`;
      link.click();
    });
    window.addEventListener('focus', () => {
      if (record) { clearQR(); hideInstructions(); load(); }
    });
    return Object.freeze({show, reset});
  }
  window.THVP_LMS_PAYMENT = Object.freeze({create});
})();
