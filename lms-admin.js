(async()=>{
  const root=document.getElementById('lms-admin');if(!root)return;
  const find=s=>root.querySelector(s),api=window.THVP_LMS_API;
  let authorized=false,page=1,pages=1,listSequence=0,detailSequence=0;
  const review=window.THVP_LMS_REVIEW?.create(root,api,async reference=>{await loadList();await showDetail(reference);},handleError);
  const access=window.THVP_LMS_ACCESS?.create(root,api,async reference=>{await loadList();await showDetail(reference);},handleError);
  const money=value=>Number(value).toLocaleString('vi-VN')+'đ';
  const date=value=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})+' (giờ Việt Nam)':'Chưa có';
  function element(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
  function lock(message='Vui lòng đăng nhập bằng tài khoản quản trị.'){
    authorized=false;listSequence++;detailSequence++;
    review?.reset();
    access?.reset();
    find('#lms-admin-content').hidden=true;find('#lms-admin-detail').hidden=true;
    find('#lms-admin-rows').replaceChildren();find('#lms-admin-detail-info').replaceChildren();
    find('#lms-admin-bank').replaceChildren();find('#lms-admin-images').replaceChildren();
    find('#lms-admin-message').textContent=message;find('#lms-admin-login-link').hidden=false;
  }
  function handleError(error){
    if(error.status===401||error.status===403)lock(error.message);
    else find('#lms-admin-message').textContent=error.message||'Chưa lấy được dữ liệu. Vui lòng thử lại.';
  }
  function details(target,entries){
    target.replaceChildren(...entries.flatMap(([label,value])=>[element('dt',label),element('dd',value)]));
  }
  async function showDetail(reference){
    if(!authorized||review?.isBusy()||access?.isBusy())return;
    const sequence=++detailSequence;
    find('#lms-admin-detail').hidden=true;find('#lms-admin-images').replaceChildren();
    find('#lms-admin-message').textContent='Đang tải chi tiết…';
    try{
      const data=await api.request(`admin_registration&reference=${encodeURIComponent(reference)}`);
      if(sequence!==detailSequence||!authorized)return;
      const r=data.registration,c=r.class;
      find('#lms-admin-detail-title').textContent='Hồ sơ '+r.reference;
      details(find('#lms-admin-detail-info'),[
        ['Họ và tên',r.fullname],['Điện thoại',r.phone],['Email',r.email],['Mã lớp',c.code],['Khóa học',c.course_name],
        ['Giáo viên',c.teacher],['Lịch học',c.days+' · '+c.time],['Học phí đã lưu',money(r.fee_vnd)],
        ['Nội dung chuyển khoản',r.transfer_content],['Thời gian gửi',date(data.created_at)],['Trạng thái',r.status_label],
        ['Giữ chỗ',data.hold.label],['Hạn giữ chỗ ban đầu',date(r.expires_at)],['Lý do gửi người đăng ký',r.public_reason||'Không có']
      ]);
      const b=data.payment_snapshot;
      details(find('#lms-admin-bank'),b?[
        ['Ngân hàng',b.bank_name],['BIN',b.bank_bin],['Số tài khoản nhận',b.account_number],['Chủ tài khoản',b.account_name]
      ]:[['Thông tin thanh toán','Chưa lưu tài khoản nhận tiền cho hồ sơ này.']]);
      const images=data.evidence.map(item=>{
        const article=document.createElement('article');
        article.append(element('p',date(item.submitted_at)+(item.timeliness==='late'?' — nộp muộn':'')));
        if(!item.image_url.startsWith('lms-api.php?action=evidence_image&'))throw new Error('Đường dẫn ảnh không hợp lệ.');
        const link=element('a','');link.href=item.image_url;link.target='_blank';link.rel='noopener noreferrer';
        const image=document.createElement('img');image.src=item.image_url;image.alt='Minh chứng chuyển khoản';image.loading='lazy';image.referrerPolicy='no-referrer';
        link.append(image,document.createTextNode('Xem ảnh đầy đủ'));article.append(link);return article;
      });
      find('#lms-admin-images').replaceChildren(...images);find('#lms-admin-no-images').hidden=images.length!==0;
      review?.show(data);
      access?.show(data);
      find('#lms-admin-detail').hidden=false;find('#lms-admin-message').textContent='';
      find('#lms-admin-detail').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
      find('#lms-admin-detail-title').focus({preventScroll:true});
    }catch(error){if(sequence===detailSequence)handleError(error);}
  }
  async function loadList(){
    if(!authorized)return;
    const sequence=++listSequence;
    find('#lms-admin-message').textContent='Đang tải hồ sơ…';
    find('#lms-admin-prev').disabled=find('#lms-admin-next').disabled=true;
    const query=new URLSearchParams({class_code:find('#lms-admin-class').value,status:find('#lms-admin-status').value,page:String(page),page_size:'20'});
    try{
      const data=await api.request('admin_registrations&'+query.toString());
      if(sequence!==listSequence||!authorized)return;
      page=data.page;pages=data.pages;
      const rows=data.items.map(item=>{
        const tr=document.createElement('tr');
        function cell(label,...children){const td=document.createElement('td');td.dataset.label=label;td.append(...children);tr.append(td);}
        cell('Hồ sơ',element('strong',item.reference),element('span',item.fullname));
        cell('Khóa / lớp',element('strong',item.class_code),element('span',item.course_name));
        cell('Thanh toán',element('strong',money(item.fee_vnd)),element('span',item.transfer_content));
        cell('Thời gian gửi',element('span',date(item.created_at)));
        cell('Minh chứng gần nhất',element('span',date(item.last_evidence_at)));
        cell('Trạng thái',element('span',item.status_label));
        const button=element('button','Xem chi tiết');button.type='button';button.className='lms-admin-action';
        button.addEventListener('click',()=>showDetail(item.reference));cell('Thao tác',button);return tr;
      });
      find('#lms-admin-rows').replaceChildren(...rows);find('#lms-admin-empty').hidden=rows.length!==0;
      find('#lms-admin-page-info').textContent=`Trang ${page}/${pages} · ${data.total} hồ sơ`;
      find('#lms-admin-prev').disabled=page<=1;find('#lms-admin-next').disabled=page>=pages;
      find('#lms-admin-message').textContent='';
    }catch(error){if(sequence===listSequence)handleError(error);}
  }
  find('#lms-admin-filters').addEventListener('submit',event=>{event.preventDefault();page=1;loadList();});
  find('#lms-admin-prev').addEventListener('click',()=>{if(page>1){page--;loadList();}});
  find('#lms-admin-next').addEventListener('click',()=>{if(page<pages){page++;loadList();}});
  find('#lms-admin-close').addEventListener('click',()=>{if(review?.isBusy()||access?.isBusy())return;detailSequence++;review?.reset();access?.reset();find('#lms-admin-detail').hidden=true;find('#lms-admin-images').replaceChildren();});
  window.addEventListener('lms:auth-change',event=>{if(event.detail.user?.role!=='admin')lock();});
  try{
    const {user}=await api.request('auth_user');
    if(user?.role!=='admin'){lock(user?'Tài khoản không có quyền quản trị LMS.':undefined);return;}
    authorized=true;
    const {classes}=await api.request('classes');
    for(const row of classes){const option=element('option',row.code+' · '+row.course_name);option.value=row.code;find('#lms-admin-class').append(option);}
    find('#lms-admin-content').hidden=false;find('#lms-admin-login-link').hidden=true;
    await loadList();
  }catch(error){handleError(error);}
})();
