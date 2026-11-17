(() => {
  const root=document.getElementById('lms-mail');if(!root)return;
  const find=selector=>root.querySelector(selector),api=window.THVP_LMS_API;
  const form=find('#lms-mail-form'),recipient=find('#lms-mail-recipient'),result=find('#lms-mail-result'),entry=document.getElementById('lms-mail-link');
  let authorized=false,configured=false,busy=false,sequence=0;
  const allowed=user=>user?.role==='admin' && ['giaovien1','giaovien2','giaovien3'].includes(String(user.username).toLowerCase());
  function controls(){
    recipient.disabled=busy||!authorized;find('#lms-mail-send').disabled=busy||!authorized||!configured;
    find('#lms-mail-refresh').disabled=busy||!authorized;form.setAttribute('aria-busy',String(busy));
  }
  function lock(){
    sequence++;authorized=false;configured=false;root.hidden=true;recipient.value='';result.textContent='';
    if(entry)entry.hidden=true;
    find('#lms-mail-issues').replaceChildren();find('#lms-mail-config').textContent='';controls();
  }
  function paint(status){
    configured=status.configured===true;
    find('#lms-mail-config').textContent=status.message;
    find('#lms-mail-issues').replaceChildren(...(status.issues||[]).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    controls();
  }
  async function refresh(){
    if(!authorized||busy)return;
    const version=++sequence;configured=false;controls();
    find('#lms-mail-config').textContent='Đang kiểm tra cấu hình…';
    try{
      const {mail}=await api.request('mail_status');if(version!==sequence||!authorized)return;
      paint(mail);
    }catch(error){
      if(version!==sequence)return;
      if(error.status===401||error.status===403){lock();return;}
      find('#lms-mail-config').textContent=error.message||'Chưa kiểm tra được cấu hình. Vui lòng thử lại.';
    }
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!authorized||!configured)return;
    const email=recipient.value.trim();
    if(!email||recipient.validity.typeMismatch||/[\s\x00-\x1F\x7F]/.test(email)){
      result.textContent='Vui lòng nhập một địa chỉ email nhận thử hợp lệ.';recipient.focus();return;
    }
    const version=++sequence;busy=true;controls();result.textContent='Đang gửi email thử qua SMTP…';
    try{
      const {csrf}=await api.request('session');
      if(version!==sequence||!authorized)return;
      const data=await api.request('mail_test',{method:'POST',timeoutMs:90000,
        headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({recipient:email})});
      if(version!==sequence||!authorized)return;
      result.textContent=data.accepted_by_smtp===true?data.message:'SMTP chưa xác nhận kết quả gửi. Vui lòng kiểm tra hộp thư trước khi gửi lại.';
    }catch(error){
      if(version!==sequence)return;
      if(error.status===401||error.status===403){lock();return;}
      if(error.mail)paint(error.mail);
      result.textContent=error.status ? (error.message||'SMTP chưa xác nhận kết quả gửi. Vui lòng kiểm tra hộp thư trước khi gửi lại.')
        : 'Chưa xác nhận được kết quả gửi do mất kết nối hoặc hết thời gian chờ. Vui lòng kiểm tra hộp thư trước khi gửi lại; hệ thống không tự gửi lại.';
    }finally{busy=false;controls();}
  });
  find('#lms-mail-refresh').addEventListener('click',refresh);
  window.addEventListener('lms:auth-change',event=>{
    if(!allowed(event.detail.user)){lock();return;}
    authorized=true;root.hidden=false;if(entry)entry.hidden=false;refresh();
  });
  (async()=>{
    try{const {user}=await api.request('auth_user');if(!allowed(user)){lock();return;}authorized=true;root.hidden=false;if(entry)entry.hidden=false;await refresh();}
    catch{lock();}
  })();
})();
