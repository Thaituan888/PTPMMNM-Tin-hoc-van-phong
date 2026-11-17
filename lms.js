(() => {
  const root = document.getElementById('lms');
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll('[role="tabpanel"]'));
  const find = selector => root.querySelector(selector);
  const api = window.THVP_LMS_API;
  // Khi mở từ file trên máy, bấm vào vai trò sẽ nhảy sang localhost để test đầy đủ chức năng PHP
  if(window.location.protocol==='file:'){
    root.querySelectorAll('.lms-course-choice').forEach(link=>{
      const teacher = (link.getAttribute('href') || '').startsWith('dang-nhap-admin.html');
      link.href = 'http://127.0.0.1:8080/' + (teacher ? 'dang-nhap-admin.html' : 'dang-nhap-hoc-sinh.html') + '?nguon=khoa-hoc';
    });
  }
  let coursesSequence = 0;

  function node(tag, text) { const element=document.createElement(tag);element.textContent=text;return element; }
  function action(label, href) { const link=node('a',label);link.href=href;link.className='lms-course-open';find('#lms-courses-actions').append(link); }
  function showChoices() {
    find('#lms-courses-picker').hidden=false;
    find('#lms-courses-title').textContent='Bạn muốn đăng nhập với vai trò nào?';
    find('#lms-courses-status').textContent='Chọn Giáo viên hoặc Học sinh để tiếp tục.';
    action('Chưa có tài khoản? Xem khóa học và đăng ký','#gioi-thieu');
  }
  async function loadCourses() {
    const sequence=++coursesSequence;
    const status=find('#lms-courses-status');
    find('#lms-courses-list').replaceChildren();find('#lms-courses-actions').replaceChildren();
    find('#lms-courses-picker').hidden=true;
    find('#lms-courses-refresh').hidden=true;
    if(window.location.protocol==='file:'){
      const localUser = window.THVP_AUTH ? window.THVP_AUTH.getCurrentUser() : null;
      if (localUser) {
        const isTeacher = localUser.role === 'admin' || localUser.role === 'teacher';
        find('#lms-courses-title').textContent = isTeacher ? 'Lớp tôi phụ trách' : 'Lớp học của tôi';
        status.textContent = 'Chọn lớp để xem nội dung học tập (Tài khoản: ' + (localUser.fullname || localUser.username) + ').';
        const sampleClasses = [
          { code: 'CB-01', course_name: 'Tin học cơ bản', teacher: 'Tống Hoàng Thiên', days: 'Thứ 2, thứ 4', time: '19:00–21:00' },
          { code: 'NC-01', course_name: 'Tin học nâng cao', teacher: 'Tống Hoàng Thiên', days: 'Thứ 3, thứ 5', time: '19:00–21:00' }
        ];
        const cards = sampleClasses.map(row => {
          const card = node('article', ''); card.className = 'lms-card';
          const code = node('span', row.code); code.className = 'lms-card-number';
          const title = node('h3', row.course_name);
          const teacher = node('p', 'Giáo viên: ' + row.teacher);
          const schedule = node('p', row.days + ' · ' + row.time);
          const link = node('a', 'Mở lớp'); link.className = 'lms-course-open'; link.href = 'lop-hoc-cua-toi.html?lop=' + encodeURIComponent(row.code);
          card.append(code, title, teacher, schedule, link);
          return card;
        });
        find('#lms-courses-list').replaceChildren(...cards);
        if (isTeacher) action('Quản lý tất cả lớp', 'lop-hoc-cua-toi.html');
        return;
      }
      showChoices();
      return;
    }
    find('#lms-courses-refresh').disabled=true;status.textContent='Đang kiểm tra phiên đăng nhập…';
    find('#lms-courses-title').textContent='Khóa học của bạn';
    try {
      if(!api)throw new Error('Vui lòng mở website bằng máy chủ PHP.');
      const {user}=await api.request('auth_user');
      if(sequence!==coursesSequence)return;
      if(!user){showChoices();return;}
      find('#lms-courses-refresh').hidden=false;
      status.textContent='Đang tải danh sách lớp…';
      const data=await api.request('learning_classes&scope=mine');
      if(sequence!==coursesSequence)return;
      find('#lms-courses-title').textContent=data.can_edit?'Lớp tôi phụ trách':'Lớp học của tôi';
      const cards=data.classes.map(row=>{
        const card=node('article','');card.className='lms-card';
        const code=node('span',row.code);code.className='lms-card-number';
        const title=node('h3',row.course_name);
        const teacher=node('p','Giáo viên: '+row.teacher);
        const schedule=node('p',row.days+' · '+row.time);
        const link=node('a','Mở lớp');link.className='lms-course-open';link.href='lop-hoc-cua-toi.html?lop='+encodeURIComponent(row.code);
        card.append(code,title,teacher,schedule,link);return card;
      });
      find('#lms-courses-list').replaceChildren(...cards);
      status.textContent=cards.length?'Chọn lớp để xem nội dung học tập.':data.can_edit?'Bạn chưa được phân công phụ trách lớp nào.':'Bạn chưa có lớp được ghi danh. Lớp sẽ xuất hiện sau khi giáo viên cấp quyền học.';
      if(data.can_edit)action('Quản lý tất cả lớp','lop-hoc-cua-toi.html');
      else if(!cards.length){action('Xem khóa học và đăng ký','#gioi-thieu');action('Chứng nhận đã hoàn thành','lop-hoc-cua-toi.html');}
    } catch(error) {
      if(sequence!==coursesSequence)return;
      find('#lms-courses-title').textContent='Lớp học';
      if(error.status===401)showChoices();
      else if(error.status===423){status.textContent='Bạn cần đổi mật khẩu tạm trước khi vào lớp học.';action('Đổi mật khẩu tạm','dang-nhap-hoc-sinh.html?doi-mat-khau=1');}
      else {find('#lms-courses-refresh').hidden=false;status.textContent=error.message||'Chưa tải được danh sách lớp. Vui lòng bấm Tải lại danh sách để thử lại.';}
    } finally {if(sequence===coursesSequence)find('#lms-courses-refresh').disabled=false;}
  }

  function selectTab(selected, updateHash = true) {
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => {
      panel.hidden = panel.id !== selected.getAttribute('aria-controls');
    });
    const courses=selected.id==='lms-tab-courses';
    if(updateHash)window.history.replaceState(null,'',courses?'#khoa-hoc':'#gioi-thieu');
    if(courses)loadCourses();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  });
  find('#lms-courses-refresh').addEventListener('click',loadCourses);
  window.addEventListener('lms:auth-change',()=>{
    coursesSequence++;find('#lms-courses-list').replaceChildren();find('#lms-courses-actions').replaceChildren();
    if(!find('#lms-panel-courses').hidden)loadCourses();
  });
  window.addEventListener('thvp:auth_change',()=>{
    coursesSequence++;find('#lms-courses-list').replaceChildren();find('#lms-courses-actions').replaceChildren();
    if(!find('#lms-panel-courses').hidden)loadCourses();
  });
  function fromHash(){
    const hash=window.location.hash;
    selectTab(find(['#khoa-hoc','#khoa-hoc-giao-vien','#khoa-hoc-hoc-sinh'].includes(hash)?'#lms-tab-courses':'#lms-tab-intro'),false);
  }
  window.addEventListener('hashchange',fromHash);
  fromHash();
})();
