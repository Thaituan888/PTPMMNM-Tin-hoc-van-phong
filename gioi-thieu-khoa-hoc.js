(() => {
  const root = document.getElementById('lms-detail');
  if (!root) return;

  const { courses, time, capacity } = window.THVP_LMS_DATA;

  const params = new URLSearchParams(window.location.search);
  const key = params.get('khoa');
  const content = root.querySelector('#lms-course-content');
  const error = root.querySelector('#lms-course-error');
  const bar = document.getElementById('lms-fee-bar');
  if (params.getAll('khoa').length !== 1 || !Object.hasOwn(courses, key)) {
    error.hidden = false;
    document.body.style.setProperty('--lms-fee-height', '0px');
    return;
  }

  const course = courses[key];
  bar.querySelector('.lms-fee-price').textContent=course.feeVnd.toLocaleString('vi-VN')+'đ';
  document.title = `${course.name} | Tin Học Văn Phòng`;
  root.querySelector('#lms-course-name').textContent = course.name;
  root.querySelector('#lms-course-message').textContent = course.message;
  const hero=root.querySelector('.lms-course-hero');
  const visual=document.createElement('img');
  visual.src=key==='co-ban'?'images/lms/poster-tin-hoc-co-ban.png':'images/lms/poster-tin-hoc-nang-cao.png';
  visual.alt='Poster '+course.name;visual.className='lms-detail-poster';
  const intro=document.createElement('div');intro.className='lms-hero-copy';
  while(hero.firstChild)intro.append(hero.firstChild);
  const tags=document.createElement('div');tags.className='lms-skill-tags';
  for(const label of ['Word','Excel','PowerPoint']){const tag=document.createElement('span');tag.textContent=label;tags.append(tag);}
  intro.append(tags);hero.append(intro,visual);
  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  for (const section of ['audience', 'topics', 'outcomes']) {
    root.querySelector(`#lms-${section}`).replaceChildren(
      ...course[section].map(text => element('li', text))
    );
  }
  const classCards = course.classes.map(([code, teacher, days]) => {
    const card = element('article', '', 'lms-class');
    card.append(
      element('h3', `Lớp ${code}`),
      element('p', `Giáo viên: ${teacher}`),
      element('p', `Lịch học: ${days}`),
      element('p', `Giờ học: ${time}`),
      element('p', `Tối đa ${capacity} học sinh/lớp`),
      element('p', 'Ngày khai giảng sẽ được cập nhật', 'lms-opening')
    );
    const link = element('a', 'Đăng ký lớp này', 'lms-class-register');
    link.setAttribute('aria-disabled', 'true');
    link.dataset.classCode = code;
    link.setAttribute('aria-label', `Đăng ký lớp ${code}`);
    const availability = element('p', 'Đang kiểm tra số chỗ…', 'lms-class-availability');
    card.querySelector('.lms-opening').dataset.classCode=code;
    availability.dataset.classCode = code;
    availability.setAttribute('aria-live', 'polite');
    card.append(availability, link);
    return card;
  });
  root.querySelector('#lms-class-list').replaceChildren(...classCards);
  async function refreshAvailability() {
    try {
      const { classes } = await window.THVP_LMS_API.request('classes');
      const pricing=classes.find(item=>item.course_key===key);
      if(pricing)bar.querySelector('.lms-fee-price').textContent=Number(pricing.fee_vnd).toLocaleString('vi-VN')+'đ';
      root.querySelectorAll('.lms-class-register').forEach(link => {
        const row = classes.find(item => item.code === link.dataset.classCode);
        const open = row?.availability === 'open';
        link.setAttribute('aria-disabled', String(!open));
        if (open) link.href = `dang-ky-khoa-hoc.html?lop=${encodeURIComponent(row.code)}&dang-ky=moi`;
        else link.removeAttribute('href');
      });
      root.querySelectorAll('.lms-class-availability').forEach(label => {
        const row = classes.find(item => item.code === label.dataset.classCode);
        label.textContent = row ? window.THVP_LMS_API.availability(row) : 'Chưa mở đăng ký';
      });
      root.querySelectorAll('.lms-opening').forEach(label=>{
        const row=classes.find(item=>item.code===label.dataset.classCode);
        label.textContent=row?.opening_date?'Khai giảng: '+row.opening_date.split('-').reverse().join('/'):'Ngày khai giảng sẽ được cập nhật';
      });
    } catch {
      root.querySelectorAll('.lms-class-register').forEach(link => {
        link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true');
      });
      root.querySelectorAll('.lms-class-availability').forEach(label => {
        label.textContent = 'Chưa kiểm tra được số chỗ. Vui lòng tải lại trang bằng máy chủ PHP.';
      });
    }
  }
  refreshAvailability();
  window.addEventListener('focus', refreshAvailability);
  setInterval(refreshAvailability, 30000);
  content.hidden = false;
  error.hidden = true;
  bar.hidden = false;

  const header = document.querySelector('.site-header');
  function measureLayout() {
    document.body.style.setProperty('--lms-fee-height', `${bar.getBoundingClientRect().height}px`);
    document.body.style.setProperty('--lms-header-height', `${header.getBoundingClientRect().height}px`);
  }
  measureLayout();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measureLayout);
    observer.observe(bar);
    observer.observe(header);
  }
  window.addEventListener('resize', measureLayout);

  bar.querySelector('button').addEventListener('click', () => {
    const schedule = root.querySelector('#lms-schedule');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    schedule.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
    schedule.focus({ preventScroll: true });
  });
})();
