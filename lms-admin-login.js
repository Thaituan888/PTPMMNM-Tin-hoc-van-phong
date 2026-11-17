(async()=>{
  const root=document.getElementById('lms-admin-login');if(!root)return;
  const find=s=>root.querySelector(s),api=window.THVP_LMS_API;
  const message=find('#lms-login-message'),button=find('#lms-login-submit');
  const coursesEntry=new URLSearchParams(window.location.search||'').get('nguon')==='khoa-hoc';
  const destination=coursesEntry?'khoa-hoc-lms.html#khoa-hoc-giao-vien':'quan-ly-dang-ky.html';
  if(coursesEntry)find('h1').textContent='Đăng nhập giáo viên';
  function showError(error){
    message.textContent=error.message||'Chưa kết nối được máy chủ đăng nhập. Vui lòng thử lại.';
    const help=find('#lms-login-server-help');
    const local=window.location.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
    help.hidden=!(local&&['LMS_FILE_URL','LMS_NETWORK','LMS_NOT_JSON'].includes(error.code));
    if(!help.hidden)help.querySelector('a').href='http://127.0.0.1:8080/dang-nhap-admin.html'+(coursesEntry?'?nguon=khoa-hoc':'');
  }
  let csrf=null;
  button.disabled=true;
  try {
    csrf=(await api.request('session')).csrf;
    const {user}=await api.request('auth_user');
    if(user?.role==='admin'){
      const authUser = { id: user.id || 1, username: user.username, fullname: user.fullname || 'Giáo viên', email: user.email || 'giangvien@gmail.com', role: 'admin', avatar: user.avatar || '' };
      try { localStorage.setItem('thvp_current_user', JSON.stringify(authUser)); sessionStorage.setItem('thvp_current_user', JSON.stringify(authUser)); sessionStorage.setItem('thvp_test_role', 'teacher'); } catch(e){}
      window.location.replace(destination);
      return;
    }
    if(coursesEntry&&user)message.textContent='Bạn đang dùng tài khoản học sinh. Nhập tài khoản giáo viên để chuyển đăng nhập.';
  }catch(error){showError(error);}finally{button.disabled=false;}
  find('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(button.disabled)return;
    const username=find('#lms-login-username').value.trim(),password=find('#lms-login-password').value;
    if(!username||!password){message.textContent='Vui lòng nhập tài khoản và mật khẩu.';return;}
    button.disabled=true;find('#lms-login-server-help').hidden=true;message.textContent='Đang đăng nhập…';
    try{
      csrf=(await api.request('session')).csrf;
      const body={username,password};if(coursesEntry)body.expected_role='admin';
      const {user}=await api.request('auth_login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});
      find('#lms-login-password').value='';
      if(user.role!=='admin'){message.textContent='Tài khoản này không có quyền quản trị LMS.';return;}
      const authUser = { id: user.id || 1, username: user.username, fullname: user.fullname || 'Giáo viên', email: user.email || 'giangvien@gmail.com', role: 'admin', avatar: user.avatar || '' };
      try {
        localStorage.setItem('thvp_current_user', JSON.stringify(authUser));
        sessionStorage.setItem('thvp_current_user', JSON.stringify(authUser));
        sessionStorage.setItem('thvp_test_role', 'teacher');
        window.dispatchEvent(new CustomEvent('thvp:auth_change', { detail: { user: authUser } }));
      } catch(e){}
      window.location.assign(destination);
    }catch(error){showError(error);}
    finally{button.disabled=false;}
  });
})();
