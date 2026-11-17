(async()=>{
  const login=document.getElementById('lms-student-login');
  const root=login;if(!root)return;
  const find=s=>root.querySelector(s),api=window.THVP_LMS_API,message=find('#lms-student-message');
  const coursesEntry=new URLSearchParams(window.location.search||'').get('nguon')==='khoa-hoc';
  const changePassword=new URLSearchParams(window.location.search||'').get('doi-mat-khau')==='1';
  const classesDestination=coursesEntry?'khoa-hoc-lms.html#khoa-hoc-hoc-sinh':'lop-hoc-cua-toi.html';
  let csrf=null,busy=false;
  function destination(user){return user?.role==='admin'?'quan-ly-dang-ky.html':user?.must_change_password?'dang-nhap-hoc-sinh.html':classesDestination;}
  function showLoginState(user){
    if(coursesEntry&&user?.role==='admin'){
      find('#lms-student-login-form').hidden=false;find('#lms-student-password-form').hidden=true;
      message.textContent='Bạn đang dùng tài khoản giáo viên. Nhập tài khoản học sinh để chuyển đăng nhập.';return;
    }
    if(user?.role==='admin'){window.location.replace(destination(user));return;}
    if(user&&!user.must_change_password&&!changePassword){window.location.replace(destination(user));return;}
    find('#lms-student-change-skip').hidden=!user||!!user.must_change_password;
    find('#lms-student-change-skip').href=classesDestination;
    if(user&&changePassword)find('h1').textContent='Đổi mật khẩu học sinh';
    find('#lms-student-login-form').hidden=!!user;
    find('#lms-student-password-form').hidden=!user;
  }
  find('#lms-student-login-submit').disabled=true;
  try{
    csrf=(await api.request('session')).csrf;
    const {user}=await api.request('auth_user');
    message.textContent='';showLoginState(user);
  }catch(error){
    message.textContent=error.message||'Chưa kết nối được máy chủ. Vui lòng tải lại trang.';
  }finally{find('#lms-student-login-submit').disabled=false;}
  async function post(action,body){
    csrf=(await api.request('session')).csrf;
    return api.request(action,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});
  }
  find('#lms-student-login-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const username=find('#lms-student-username').value.trim(),password=find('#lms-student-password').value;
    if(!username||!password){message.textContent='Vui lòng nhập tên đăng nhập và mật khẩu.';return;}
    busy=true;find('#lms-student-login-submit').disabled=true;message.textContent='Đang đăng nhập…';
    try{
      const body={username,password};if(coursesEntry)body.expected_role='student';
      const {user}=await post('auth_login',body);find('#lms-student-password').value='';
      const authUser = { id: user.id || 2, username: user.username, fullname: user.fullname || user.username || 'Học viên', email: user.email || '', role: 'student', avatar: user.avatar || '' };
      try {
        localStorage.setItem('thvp_current_user', JSON.stringify(authUser));
        sessionStorage.setItem('thvp_current_user', JSON.stringify(authUser));
        sessionStorage.setItem('thvp_test_role', 'student');
        window.dispatchEvent(new CustomEvent('thvp:auth_change', { detail: { user: authUser } }));
      } catch(e){}
      if(user.role==='student'&&(user.must_change_password||changePassword)){showLoginState(user);find('#lms-student-current-password').value=password;message.textContent=user.must_change_password?'Bạn phải đổi mật khẩu tạm trước khi vào lớp.':'Bạn có thể đổi mật khẩu ngay hoặc vào lớp và đổi sau.';find('#lms-student-new-password').focus();}
      else window.location.assign(destination(user));
    }catch(error){message.textContent=error.message||'Chưa đăng nhập được. Vui lòng thử lại.';}
    finally{busy=false;find('#lms-student-login-submit').disabled=false;}
  });
  find('#lms-student-password-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const current=find('#lms-student-current-password').value,next=find('#lms-student-new-password').value,repeat=find('#lms-student-repeat-password').value;
    if(next!==repeat){message.textContent='Hai lần nhập mật khẩu mới chưa khớp.';return;}
    if(next.length<12||new TextEncoder().encode(next).length>72||!next.trim()||next===current){message.textContent='Mật khẩu mới phải khác mật khẩu hiện tại, từ 12 ký tự và tối đa 72 byte UTF-8.';return;}
    busy=true;find('#lms-student-change-submit').disabled=true;message.textContent='Đang lưu mật khẩu mới…';
    try{
      await post('student_change_password',{current_password:current,new_password:next});
      for(const selector of ['#lms-student-current-password','#lms-student-new-password','#lms-student-repeat-password'])find(selector).value='';
      window.location.replace(classesDestination);
    }catch(error){message.textContent=error.message||'Chưa đổi được mật khẩu. Vui lòng thử lại.';}
    finally{busy=false;find('#lms-student-change-submit').disabled=false;}
  });
})();
