(() => {
  const bars = Array.from(document.querySelectorAll('[data-lms-account]'));
  if (!bars.length&&!document.querySelectorAll('[data-lms-account-link]').length) return;
  const api = window.THVP_LMS_API;
  let csrf = null;
  let menus=[];
  function element(tag, text) { const node=document.createElement(tag); node.textContent=text; return node; }
  function render(user, message = '') {
    menus.forEach(menu=>menu.remove());menus=[];
    if (user) {
      const authUser = { id: user.id, username: user.username, fullname: user.fullname || user.username, email: user.email || '', role: user.role, avatar: user.avatar || '' };
      try { localStorage.setItem('thvp_current_user', JSON.stringify(authUser)); sessionStorage.setItem('thvp_current_user', JSON.stringify(authUser)); sessionStorage.setItem('thvp_test_role', user.role === 'admin' ? 'teacher' : 'student'); window.dispatchEvent(new CustomEvent('thvp:auth_change', { detail: { user: authUser } })); } catch(e){}
    }
    document.querySelectorAll('[data-lms-account-link]').forEach(link => {
      link.hidden=!!user;link.href='khoa-hoc-lms.html#khoa-hoc';link.textContent='ĐĂNG NHẬP';link.setAttribute('aria-label','Chọn đăng nhập giáo viên hoặc học sinh');
      if(!user)return;
      const menu=element('details','');menu.className='lms-account-menu';
      const summary=element('summary','Tài khoản');summary.title=user.fullname;summary.setAttribute('aria-label','Tài khoản '+user.fullname);menu.append(summary);
      const panel=element('nav','');panel.className='lms-account-panel';panel.setAttribute('aria-label','Tài khoản LMS');
      panel.append(element('span',user.fullname+' · '+(user.role==='admin'?'Giáo viên':'Học sinh')));
      const add=(text,href)=>{const a=element('a',text);a.href=href;panel.append(a);};
      add('Lớp học của tôi',user.role==='admin'?'khoa-hoc-lms.html#khoa-hoc-giao-vien':'lop-hoc-cua-toi.html');
      if(user.role==='admin'){add('Tất cả lớp','lop-hoc-cua-toi.html');add('Quản lý đăng ký','quan-ly-dang-ky.html');}
      else if(user.role==='student')add('Đổi mật khẩu','dang-nhap-hoc-sinh.html?doi-mat-khau=1');
      const logout=element('button','Đăng xuất');logout.type='button';
      logout.addEventListener('click',async()=>{
        logout.disabled=true;
        try {
          if(!csrf)csrf=(await api.request('session')).csrf;
          await api.request('auth_logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:'{}'});
          try {
            localStorage.removeItem('thvp_current_user');
            sessionStorage.removeItem('thvp_current_user');
            sessionStorage.removeItem('thvp_test_role');
            window.dispatchEvent(new CustomEvent('thvp:auth_change', { detail: { user: null } }));
          } catch(e){}
          render(null);
        }catch{render(user,'Chưa đăng xuất được. Vui lòng thử lại.');}
      });panel.append(logout);menu.append(panel);link.after(menu);menus.push(menu);
    });
    bars.forEach(bar => {
      bar.replaceChildren();
      bar.hidden=!message;
      if (message) bar.append(element('span',message));
    });
    window.dispatchEvent(new CustomEvent('lms:auth-change',{detail:{user}}));
  }
  async function refresh() {
    try { csrf=(await api.request('session')).csrf;render((await api.request('auth_user')).user); }
    catch { render(null,'Chưa kết nối được phiên quản trị.'); }
  }
  refresh();window.addEventListener('focus',refresh);
  document.addEventListener?.('click',event=>menus.forEach(menu=>{if(!menu.contains(event.target))menu.open=false;}));
  document.addEventListener?.('keydown',event=>{if(event.key==='Escape')menus.forEach(menu=>{if(menu.open){menu.open=false;menu.querySelector('summary').focus();}});});
})();
