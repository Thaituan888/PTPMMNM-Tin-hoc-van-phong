(() => {
  function create(root,api,onChanged,onError) {
    const find=s=>root.querySelector(s);
    let current=null,busy=false,sequence=0,retry=null;
    const message=find('#lms-access-message');
    function controls(){
      find('#lms-access-grant').disabled=busy||!current?.can_grant_access;
      find('#lms-access-retry').disabled=busy||!current?.access?.can_retry;
      find('#lms-access-reissue').disabled=busy||!current?.access?.can_reissue;
      find('#lms-access-refresh').disabled=busy||!current;
      find('#lms-admin-close').disabled=busy;
      find('#lms-access').setAttribute('aria-busy',String(busy));
    }
    function reset(){sequence++;current=null;busy=false;retry=null;message.textContent='';find('#lms-access-info').textContent='';find('#lms-access-history').replaceChildren();find('#lms-access').hidden=true;controls();}
    function show(data){
      reset();current=data;
      find('#lms-access').hidden=!data.can_grant_access&&!data.access;
      find('#lms-access-grant').hidden=!data.can_grant_access;
      find('#lms-access-retry').hidden=!data.access?.can_retry;
      find('#lms-access-reissue').hidden=!data.access?.can_reissue;
      const a=data.access;
      find('#lms-access-info').textContent=a?`Đã ghi danh · Tài khoản ${a.username} (${a.new_account?'tạo mới':'dùng lại'}). ${a.mail_label}${a.last_error?' · '+a.last_error:''}`
        :'Tài khoản và ghi danh sẽ được lưu trước khi gửi email. Tài khoản có sẵn được giữ nguyên mật khẩu.';
      const labels={reissue_credentials:'Cấp lại thông tin đăng nhập',admin_reissue_credentials:'Cấp lại thông tin đăng nhập',grant:'Cấp quyền học',admin_grant_access:'Cấp quyền học',admin_access_mail_retry:'Gửi lại email',mail_attempt:'Gửi email',password_changed:'Đổi mật khẩu',new_student:'Tạo học sinh mới',existing_student:'Dùng lại học sinh',
        sending:'Đang gửi',sent:'SMTP đã chấp nhận',failed:'Gửi chưa thành công',unknown:'Chưa xác nhận kết quả',completed:'Hoàn thành'};
      find('#lms-access-history').replaceChildren(...(data.access_history||a?.history||[]).map(item=>{
        const p=document.createElement('p');p.textContent=`${new Date(item.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · ${item.actor_name} · ${labels[item.action]||item.action}: ${labels[item.result]||item.result}${item.error_code?' ('+item.error_code+')':''}`;return p;
      }));controls();
    }
    async function send(action){
      if(busy||!current||(action==='admin_grant_access'?!current.can_grant_access:action==='admin_reissue_credentials'?!current.access?.can_reissue:!current.access?.can_retry))return;
      const reference=current.registration.reference;
      if(!window.confirm(action==='admin_grant_access'?`Cấp quyền học và gửi email cho hồ sơ ${reference}? Chỉ hồ sơ này được xử lý.`
        :action==='admin_reissue_credentials'?`Cấp lại thông tin đăng nhập cho hồ sơ ${reference}? Hệ thống tạo mật khẩu mới, mật khẩu cũ và phiên đăng nhập cũ sẽ hết hiệu lực trên tất cả lớp của tài khoản này. Email sẽ có tên đăng nhập và mật khẩu dùng vào lớp ngay.`
        :`Gửi lại email cho hồ sơ ${reference}? Hãy kiểm tra hộp thư nếu lần gửi trước chưa rõ kết quả. Tài khoản và ghi danh sẽ được giữ nguyên.`))return;
      const body=JSON.stringify({reference,version:current.revision});
      if(!retry||retry.action!==action||retry.body!==body)retry={action,body,key:Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')};
      const version=sequence;busy=true;controls();message.textContent='Đang xử lý và gửi email…';
      try{
        const {csrf}=await api.request('session');
        const result=await api.request(action,{method:'POST',timeoutMs:90000,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':retry.key},body:retry.body});
        if(version!==sequence)return;
        if(result.reference!==reference||!result.access)throw new Error('Chưa xác nhận được kết quả. Vui lòng mở lại chi tiết.');
        busy=false;retry=null;await onChanged(reference);
        if(current?.registration.reference===reference)message.textContent=result.access.mail_state==='sent'?(action==='admin_reissue_credentials'?'Đã cấp lại thông tin đăng nhập. SMTP đã chấp nhận email; vui lòng kiểm tra hộp thư và thư rác.':'Đã cấp quyền. SMTP đã chấp nhận email; chưa xác nhận tới Inbox.'):result.access.mail_label;
      }catch(error){
        if(version!==sequence)return;
        message.textContent=error.message||'Chưa xác nhận được kết quả. Bấm Tải lại trạng thái trước khi thử lại; không tạo thêm hồ sơ.';
        if(error.status===401||error.status===403)onError(error);
      }finally{if(version===sequence){busy=false;controls();}}
    }
    find('#lms-access-grant').addEventListener('click',()=>send('admin_grant_access'));
    find('#lms-access-retry').addEventListener('click',()=>send('admin_access_mail_retry'));
    find('#lms-access-reissue').addEventListener('click',()=>send('admin_reissue_credentials'));
    find('#lms-access-refresh').addEventListener('click',()=>{if(!busy&&current)onChanged(current.registration.reference);});
    return Object.freeze({show,reset,isBusy:()=>busy});
  }
  window.THVP_LMS_ACCESS=Object.freeze({create});
})();
