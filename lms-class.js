(async()=>{
  const root=document.getElementById('lms-student-classes');if(!root)return;
  const find=s=>root.querySelector(s),api=window.THVP_LMS_API;
  const code=new URLSearchParams(window.location.search).get('lop');
  find('#lms-class-back').hidden=!code;
  const status=find('#lms-student-message');
  let model=null,editing=false,busy=false,editor=null,sequence=0,fieldNumber=0;
  function node(tag,text='',className=''){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
  function button(text,handler){const el=node('button',text,'lms-admin-action');el.type='button';el.addEventListener('click',handler);return el;}
  function controls(){
    root.setAttribute('aria-busy',String(busy));
    root.querySelectorAll('button').forEach(el=>{el.disabled=busy||el.dataset.boundary==='true';});
  }
  function discard(){if(!editor)return true;if(!window.confirm('Hủy phần đang nhập chưa lưu? Bạn có thể bấm Hủy để tiếp tục nhập.'))return false;editor.form.remove();editor=null;return true;}
  function inaccessible(error){
    status.setAttribute('data-tone','error');
    if([401,403,404,423].includes(error.status))find('#lms-learning-resources').replaceChildren();
    if([401,403,404,423].includes(error.status)){find('#lms-learning-room').hidden=true;find('#lms-learning-topics').replaceChildren();find('#lms-learning-general').replaceChildren();if(editor)editor.form.remove();editor=null;}
    if(error.status===401||error.status===423){sequence++;find('#lms-student-class-list').replaceChildren();window.location.replace('dang-nhap-hoc-sinh.html');return;}
    status.textContent=error.message||'Chưa tải được nội dung lớp. Vui lòng thử lại.';
  }
  window.addEventListener('lms:auth-change',event=>{
    if(!event.detail.user||event.detail.user.must_change_password||(editing&&!(event.detail.user.role==='admin'&&['giaovien1','giaovien2','giaovien3'].includes(String(event.detail.user.username).toLowerCase()))))find('#lms-learning-resources').replaceChildren();
    if(!event.detail.user||event.detail.user.must_change_password){sequence++;if(editor)editor.form.remove();editor=null;find('#lms-student-class-list').replaceChildren();find('#lms-learning-topics').replaceChildren();find('#lms-learning-general').replaceChildren();find('#lms-learning-room').hidden=true;window.location.replace('dang-nhap-hoc-sinh.html');}
    else if(editing && !(event.detail.user.role==='admin'&&['giaovien1','giaovien2','giaovien3'].includes(String(event.detail.user.username).toLowerCase()))){
      sequence++;find('#lms-learning-room').hidden=true;find('#lms-learning-topics').replaceChildren();find('#lms-learning-general').replaceChildren();if(editor)editor.form.remove();editor=null;
      window.location.replace('lop-hoc-cua-toi.html'+(code?'?lop='+encodeURIComponent(code):''));
    }
  });
  function fields(form,specs){
    const inputs={};
    for(const spec of specs){
      const group=node('div','','lms-learning-field'),label=node('label',spec.label);
      const input=document.createElement(spec.multiline?'textarea':'input');input.id='lms-learning-field-'+(++fieldNumber);label.htmlFor=input.id;
      if(!spec.multiline)input.type=spec.type||'text';else input.rows=spec.key==='body'?12:4;
      if(spec.max)input.maxLength=spec.max;
      input.value=spec.value??'';input.required=!!spec.required;inputs[spec.key]=input;group.append(label,input);form.append(group);
    }
    return inputs;
  }
  function openForm(mount,title,specs,base,action,choices){
    if(busy||!editing||!model?.can_edit||!discard())return;
    const form=document.createElement('form');form.className='lms-learning-editor';form.noValidate=true;
    form.append(node('h3',title));const inputs=fields(form,specs);
    const message=node('p','','lms-learning-error');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
    const actions=node('div','','lms-learning-actions');
    for(const choice of choices){const submit=node('button',choice.label,'lms-admin-action');submit.type='submit';submit.value=choice.status||'';actions.append(submit);}
    actions.append(button('Hủy',()=>{if(!busy){form.remove();editor=null;}}));form.append(actions,message);mount.append(form);editor={form};
    Object.values(inputs)[0]?.focus();
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      const payload={class_code:code,...base};
      for(const [key,input] of Object.entries(inputs))payload[key]=input.value;
      if(action==='content_lesson_save')payload.status=event.submitter?.value||choices[0].status;
      const current=sequence;busy=true;controls();message.textContent='Đang lưu…';
      try{
        const {csrf}=await api.request('session');
        await api.request(action,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(payload)});
        if(current!==sequence)return;
        editor=null;form.remove();
        const updated=await load();status.textContent=updated?'Đã lưu nội dung.':'Đã lưu nhưng chưa tải lại được nội dung. Bấm Tải lại nội dung để kiểm tra.';
      }catch(error){
        if(current!==sequence)return;
        message.textContent=(error.message||'Chưa xác nhận được kết quả lưu. Phần đang nhập được giữ nguyên.')+(error.status===409?' Nội dung nhập vẫn được giữ ở biểu mẫu; sao chép nếu cần trước khi tải lại.':'');
        if([401,403,423].includes(error.status))inaccessible(error);
      }finally{busy=false;controls();}
    });controls();
  }
  async function quick(action,payload){
    if(busy||!editing||!discard())return;
    const current=sequence;busy=true;controls();status.textContent='Đang lưu…';
    try{
      const {csrf}=await api.request('session');
      await api.request(action,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({class_code:code,...payload})});
      if(current===sequence){const updated=await load();status.textContent=updated?'Đã lưu nội dung.':'Đã lưu nhưng chưa tải lại được nội dung. Bấm Tải lại nội dung để kiểm tra.';}
    }catch(error){if(current===sequence)inaccessible(error);}
    finally{busy=false;controls();}
  }
  function topicForm(mount,topic=null){
    openForm(mount,topic?'Sửa chủ đề':'Thêm chủ đề',[
      {key:'title',label:'Tên chủ đề',value:topic?.title,max:150,required:true},
      {key:'description',label:'Mô tả',value:topic?.description,max:3000,multiline:true}
    ],topic?{id:topic.id,version:topic.revision,visible:!!topic.visible}:{structure_version:model.page.structure_revision},topic?'content_topic_save':'content_topic_create',[{label:'Lưu'}]);
  }
  function lessonForm(mount,topic,lesson=null){
    openForm(mount,lesson?'Sửa bài văn bản':'Thêm bài văn bản (bản nháp)',[
      {key:'title',label:'Tiêu đề bài',value:lesson?.title,max:150,required:true},
      {key:'body',label:'Nội dung văn bản thuần',value:lesson?.body,max:20000,multiline:true}
    ],lesson?{id:lesson.id,topic_id:topic.id,version:lesson.revision}:{topic_id:topic.id,version:topic.revision},lesson?'content_lesson_save':'content_lesson_create',
      lesson?(lesson.status==='published'?[{label:'Lưu thay đổi',status:'published'},{label:'Chuyển về bản nháp',status:'draft'}]:[{label:'Lưu bản nháp',status:'draft'},{label:'Xuất bản',status:'published'}]):[{label:'Lưu bản nháp'}]);
  }
  function customForm(mount,title,specs){
    if(busy||!editing||!model.can_edit||!discard())return null;
    const form=node('form','','lms-learning-editor');form.noValidate=true;form.append(node('h3',title));
    const inputs=fields(form,specs),message=node('p','','lms-learning-error');message.setAttribute('role','status');
    const actions=node('div','','lms-learning-actions');
    for(const [label,value] of [['Lưu bản nháp','draft'],['Xuất bản','published']]){const b=node('button',label,'lms-admin-action');b.type='submit';b.value=value;actions.append(b);}
    actions.append(button('Hủy',()=>{if(!busy){form.remove();editor=null;}}));form.append(actions,message);mount.append(form);editor={form};
    return {form,inputs,message};
  }
  function fileInput(form,label,accept){
    const id='lms-learning-field-'+(++fieldNumber),group=node('div','','lms-learning-field'),caption=node('label',label),input=node('input');input.type='file';input.accept=accept;input.id=id;caption.htmlFor=id;group.append(caption,input);form.prepend(group);return input;
  }
  function resourceForm(mount,kind,row=null){
    const ui=customForm(mount,row?'Chỉnh sửa nội dung':'Thêm nội dung',[
      {key:'title',label:'Tiêu đề',value:row?.title,max:150,required:true},
      {key:'body',label:'Nội dung / hướng dẫn',value:row?.body,max:20000,multiline:true},
      {key:'url',label:'Liên kết HTTP/HTTPS (không bắt buộc)',value:row?.url,max:2048,type:'url'}
    ]);if(!ui)return;
    const file=fileInput(ui.form,'Tệp PDF, TXT UTF-8, JPG, PNG; tối đa 5 MB. Để trống để giữ tệp cũ.','.pdf,.txt,.jpg,.jpeg,.png');
    let key=crypto.randomUUID();ui.form.addEventListener('input',()=>key=crypto.randomUUID());
    ui.form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      if(file.files[0]?.size>5*1024*1024){ui.message.textContent='Tệp vượt giới hạn 5 MB.';return;}
      const data=new FormData();for(const [k,v] of Object.entries({class_code:code,kind,id:row?.id||0,version:row?.revision||0,status:event.submitter?.value||'draft'}))data.append(k,String(v));
      for(const [k,input] of Object.entries(ui.inputs))data.append(k,input.value);if(file.files[0])data.append('file',file.files[0]);
      busy=true;controls();ui.message.textContent='Đang tải và lưu…';const current=sequence;
      try{const {csrf}=await api.request('session');await api.request('content_resource_save',{method:'POST',headers:{'X-CSRF-Token':csrf,'Idempotency-Key':key},body:data,timeoutMs:60000});if(current===sequence){editor=null;await load();}}
      catch(error){if(current===sequence)ui.message.textContent=error.message||'Chưa lưu được. Tệp và nội dung vẫn được giữ để thử lại.';}
      finally{busy=false;controls();}
    });
  }
  const quizTemplate={title:'Kiểm tra kiến thức',questions:[{text:'Phím tắt nào dùng để sao chép?',choices:['Ctrl + C','Ctrl + V','Ctrl + X','Ctrl + Z'],answer:0}]};
  function downloadJson(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function quizForm(mount,quiz=null){
    const ui=customForm(mount,quiz?'Sửa bài trắc nghiệm':'Nhập bài trắc nghiệm từ JSON',[
      {key:'title',label:'Tên bài kiểm tra',value:quiz?.title||'',max:150,required:true}
    ]);if(!ui)return;
    const file=fileInput(ui.form,'Chọn tệp JSON tối đa 1 MB; mỗi câu có một đáp án đúng. Khi sửa có thể để trống để giữ câu hỏi.','.json');
    ui.form.append(node('p','Dùng tệp mẫu; answer là vị trí đáp án đúng tính từ 0. Tối đa 100 câu, mỗi câu 2–6 lựa chọn.'));
    ui.form.append(button('Tải tệp mẫu JSON',()=>downloadJson(quizTemplate,'mau-trac-nghiem.json')));
    if(quiz)ui.form.append(button('Tải câu hỏi để chỉnh sửa',()=>downloadJson({title:quiz.title,questions:quiz.questions},'bai-kiem-tra.json')));
    let key=crypto.randomUUID();ui.form.addEventListener('input',()=>key=crypto.randomUUID());
    ui.form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;const current=sequence;
      busy=true;controls();ui.message.textContent='Đang kiểm tra và lưu…';
      try{
        let data=quiz?{title:quiz.title,questions:quiz.questions}:null;
        if(file.files[0]){if(file.files[0].size>1048576)throw new Error('Tệp JSON vượt 1 MB.');try{data=JSON.parse((await file.files[0].text()).replace(/^\uFEFF/,''));}catch{throw new Error('Tệp JSON không đúng định dạng. Hãy dùng tệp mẫu.');}}
        if(!data)throw new Error('Vui lòng chọn tệp câu hỏi JSON.');
        const title=ui.inputs.title.value.trim()||data.title;
        const {csrf}=await api.request('session');await api.request('content_quiz_save',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':key},body:JSON.stringify({class_code:code,id:quiz?.id||0,version:quiz?.revision||0,title,questions:data.questions,status:event.submitter?.value||'draft'})});
        if(current===sequence){editor=null;await load();}
      }catch(error){if(current===sequence)ui.message.textContent=error.message||'Chưa lưu được bài kiểm tra.';}finally{busy=false;controls();}
    });
  }
  function quizAttempt(mount,quiz){
    if(busy||!discard())return;
    const form=node('form','','lms-learning-editor');const groups=[];form.append(node('h3',quiz.title));
    quiz.questions.forEach((q,index)=>{
      const field=node('fieldset'),legend=node('legend',(index+1)+'. '+q.text);field.append(legend);const options=[];
      q.choices.forEach((text,i)=>{const label=node('label'),radio=node('input');radio.type='radio';radio.name='question-'+quiz.id+'-'+index;radio.value=String(i);label.append(radio,document.createTextNode(' '+text));field.append(label);options.push(radio);});form.append(field);groups.push(options);
    });
    form.append(node('p','Mỗi học sinh nộp một lần. Kiểm tra đáp án trước khi kết thúc.'));
    const submit=node('button','Kết thúc và xem điểm','lms-admin-action');submit.type='submit';const message=node('p','','lms-learning-error');message.setAttribute('role','status');form.append(submit,button('Hủy',()=>{if(!busy&&window.confirm('Hủy bài đang làm?')){form.remove();editor=null;}}),message);mount.append(form);editor={form};
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;const answers=groups.map(options=>options.findIndex(x=>x.checked));
      if(answers.includes(-1)){message.textContent='Vui lòng trả lời đầy đủ các câu hỏi.';return;}
      if(!window.confirm('Nộp bài để chấm điểm? Sau khi nộp không thể sửa đáp án.'))return;
      const current=sequence;busy=true;controls();message.textContent='Đang chấm điểm…';
      try{const {csrf}=await api.request('session');const {result}=await api.request('quiz_submit',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({class_code:code,id:quiz.id,version:quiz.revision,answers})});if(current===sequence){editor=null;await load();status.textContent='Điểm: '+(10*result.correct_count/result.total).toFixed(2)+'/10 · Đúng '+result.correct_count+'/'+result.total+' câu.';}}
      catch(error){if(current===sequence)message.textContent=error.message||'Chưa nộp được. Đáp án đã chọn vẫn được giữ.';}finally{busy=false;controls();}
    });
  }
  let lifecycleRetry=null;
  function dateText(timestamp){return new Date(timestamp*1000).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});}
  function mailSummary(counts){return counts.total?`SMTP đã chấp nhận ${counts.sent}/${counts.total} email · Chờ gửi ${counts.pending} · Đang gửi ${counts.sending} · Lỗi ${counts.failed} · Chưa rõ kết quả ${counts.unknown}`:'Chưa có học sinh ghi danh trong đợt này; không có email cần gửi.';}
  async function sendEventMail(eventId,retry=false){
    if(busy)return;busy=true;controls();const current=sequence;let counts=null;
    try{
      do{
        const {csrf}=await api.request('session');
        const result=await api.request('class_send_mail',{method:'POST',timeoutMs:90000,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({event_id:eventId,retry})});retry=false;counts=result.mail;
        if(current!==sequence)return;status.textContent=mailSummary(counts);
      }while(counts.pending>0);
      if(current===sequence){await load();status.setAttribute('data-tone',counts.failed+counts.unknown?'error':'success');status.textContent=mailSummary(counts)+'. Học sinh cần kiểm tra hộp thư/thư rác.';}
    }catch(error){if(current===sequence){status.setAttribute('data-tone','error');status.textContent=(error.message||'Chưa xác nhận được kết quả gửi email.')+' Trạng thái lớp và hàng chờ đã được lưu; tải lại nội dung để tiếp tục.';}}
    finally{busy=false;controls();}
  }
  async function transition(action,startDate='',message=null){
    if(busy||!model.can_edit)return;
    const life=model.lifecycle;
    const payload={class_code:code,version:life.revision,action,start_date:startDate};const serialized=JSON.stringify(payload);
    if(!lifecycleRetry||lifecycleRetry.body!==serialized)lifecycleRetry={body:serialized,key:crypto.randomUUID()};
    if(action==='complete'&&!window.confirm(`Bế giảng ${code}? Học sinh đợt này sẽ không vào nội dung lớp được nữa; hệ thống tạo chứng nhận hoàn thành và gửi email cho từng học sinh. Đăng ký vẫn đóng cho đến khi giáo viên mở lại.`))return;
    if(action==='reopen'&&!window.confirm(life.state==='completed'?'Mở đăng ký đợt mới? Học sinh đợt cũ vẫn không được vào học.':'Mở lại đăng ký cho đợt học hiện tại?'))return;
    busy=true;controls();if(message)message.textContent='Đang lưu…';const current=sequence;
    try{
      const {csrf}=await api.request('session');const result=await api.request('class_transition',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':lifecycleRetry.key},body:lifecycleRetry.body});
      if(current!==sequence)return;lifecycleRetry=null;editor=null;
      await load();busy=false;controls();status.setAttribute('data-tone','success');status.textContent='Đã lưu trạng thái lớp. '+mailSummary(result.mail);
      if(result.mail.pending>0)await sendEventMail(result.event_id);
    }catch(error){if(current===sequence){if(message)message.textContent=error.message;else{status.setAttribute('data-tone','error');status.textContent=error.message||'Chưa lưu được trạng thái lớp.';}}}
    finally{busy=false;controls();}
  }
  function startForm(mount){
    if(busy||!discard())return;const form=node('form','','lms-learning-editor');form.noValidate=true;
    form.append(node('h3','Khai giảng lớp'),node('p','Chọn buổi học đầu tiên theo lịch '+model.class.days+' · '+model.class.time+'. Thời gian dùng múi giờ Việt Nam. Khi xác nhận, lớp ngừng nhận đăng ký và gửi lịch cho học sinh đã ghi danh.'));
    const inputs=fields(form,[{key:'start_date',label:'Ngày học đầu tiên',type:'date',required:true}]);
    const message=node('p','','lms-learning-error');message.setAttribute('role','status');const submit=node('button','Khai giảng và gửi email','lms-admin-action');submit.type='submit';
    form.append(submit,button('Hủy',()=>{if(!busy){form.remove();editor=null;}}),message);mount.append(form);editor={form};
    form.addEventListener('submit',event=>{event.preventDefault();if(!inputs.start_date.value){message.textContent='Chọn ngày học đầu tiên.';return;}transition('start',inputs.start_date.value,message);});
  }
  function renderLifecycle(mount){
    const life=model.lifecycle;if(!life)return;
    const labels={ready:'Chưa khai giảng',started:'Đã khai giảng',completed:'Đã bế giảng'};
    mount.append(node('p',`Đợt ${life.cycle_id} · ${labels[life.state]}`,'lms-learning-badge'));
    if(life.starts_at)mount.append(node('p','Buổi đầu tiên: '+dateText(life.starts_at)+' (giờ Việt Nam)'));
    if(!model.can_edit)return;
    const info=model.lifecycleAdmin;mount.append(node('p',info?.registration_open?'Đang nhận đăng ký':'Đã đóng đăng ký','lms-learning-muted'));
    if(editing){
      const actions=node('div','','lms-learning-actions');
      if(life.state==='ready')actions.append(button('Khai giảng',()=>startForm(mount)));
      if(life.state==='started')actions.append(button('Bế giảng',()=>{if(discard())transition('complete');}));
      actions.append(button(info?.registration_open?'Đóng đăng ký':'Mở lại đăng ký',()=>{if(discard())transition(info?.registration_open?'close_registration':'reopen');}));mount.append(actions);
    }
    const history=node('details');history.append(node('summary','Lịch sử khai giảng / bế giảng và email'));let hasEvents=false;
    for(const event of (info?.events||[]).slice(0,12)){
      if(!['start','complete'].includes(event.action))continue;
      hasEvents=true;
      const row=node('div','','lms-learning-event');row.append(node('p',(event.action==='start'?'Khai giảng':'Bế giảng')+' đợt '+event.cycle_id+' · '+dateText(event.created_at)),node('p',mailSummary(event.mail)));
      const errorNames={recipient_changed:'Tài khoản hoặc email học sinh đã thay đổi; cần kiểm tra trước khi gửi',mail_configuration:'Kiểm tra cấu hình SMTP',smtp_auth:'SMTP từ chối xác thực',smtp_connect:'Không kết nối được SMTP',smtp_tls:'Không xác minh được TLS',smtp_timeout:'SMTP hết thời gian chờ',smtp_unknown:'Chưa xác nhận kết quả SMTP',smtp_rejected:'SMTP từ chối thư',smtp_socket_denied:'Windows chặn kết nối SMTP',certificate_unavailable:'Chưa tạo được chứng nhận; cần GD và phông Noto Sans',certificate_or_mail:'Lỗi tạo chứng nhận hoặc gửi thư'};
      for(const [error,n] of Object.entries(event.mail.errors||{}))row.append(node('p',(errorNames[error]||'Chưa gửi được email')+' ('+n+')','lms-learning-error'));
      const available=event.action==='complete'||(life.state==='started'&&Number(life.cycle_id)===Number(event.cycle_id));
      if(available&&(event.mail.pending+event.mail.sending+event.mail.failed+event.mail.unknown)>0)history.open=true;
      if(available&&event.mail.pending>0)row.append(button('Tiếp tục gửi email',()=>sendEventMail(event.id)));
      if(available&&(event.mail.failed+event.mail.unknown)>0)row.append(button('Thử gửi lại email lỗi',()=>{if(window.confirm('Gửi lại các email lỗi hoặc chưa rõ kết quả? Nếu SMTP đã nhận thư nhưng mất phản hồi, người nhận có thể nhận thư lặp.'))sendEventMail(event.id,true);}));
      history.append(row);
    }
    if(hasEvents)mount.append(history);
    if(model.certificates?.length){const details=node('details');details.append(node('summary','Chứng nhận đã cấp ('+model.certificates.length+')'));for(const cert of model.certificates){const p=node('p'),a=node('a',cert.fullname+' · Đợt '+cert.cycle_id+' · '+cert.number,'lms-admin-back');a.href=cert.download_url;p.append(a);details.append(p);}mount.append(details);}
  }
  function renderResources(){
    const container=find('#lms-learning-resources');container.replaceChildren();
    for(const [kind,label] of [['notice','Thông báo'],['material','Tài liệu học tập'],['test','Kiểm tra']]){
      const section=node('section','','lms-admin-box');section.append(node('h2',label));
      if(kind==='notice')renderLifecycle(section);
      if(editing)section.append(button(kind==='test'?'Thêm đề / hướng dẫn kiểm tra':kind==='notice'?'Thêm thông báo':'Tải tài liệu lên',()=>resourceForm(section,kind)));
      const rows=(model.resources||[]).filter(r=>r.kind===kind);
      if(!rows.length&&!(kind==='test'&&model.quizzes?.length))section.append(node('p','Chưa có '+label.toLowerCase()+' được xuất bản.','lms-learning-muted'));
      for(const row of rows){const article=node('article','','lms-learning-lesson');article.append(node('h3',row.title));if(editing)article.append(node('p',row.status==='draft'?'Bản nháp':'Đã xuất bản','lms-learning-badge'));if(row.body)article.append(node('div',row.body,'lms-learning-plain'));
        if(row.url){const a=node('a','Mở liên kết','lms-learning-online');a.href=row.url;a.target='_blank';a.rel='noopener noreferrer';article.append(a);}
        if(row.download_url){const a=node('a','Tải tài liệu ('+Math.ceil(row.size_bytes/1024)+' KB)','lms-learning-online');a.href=row.download_url;article.append(a);}
        if(editing)article.append(button('Chỉnh sửa',()=>resourceForm(article,kind,row)));section.append(article);
      }
      if(kind==='test'){
        if(editing)section.append(button('Nhập bài trắc nghiệm từ tệp',()=>quizForm(section)));
        for(const quiz of model.quizzes||[]){const article=node('article','','lms-learning-lesson');article.append(node('h3',quiz.title),node('p',quiz.questions.length+' câu · Tự chấm điểm theo thang 10 · Một lần nộp'));
          if(editing)article.append(node('p',quiz.status==='draft'?'Bản nháp':'Đã xuất bản','lms-learning-badge'),button('Sửa bài trắc nghiệm',()=>quizForm(article,quiz)));
          else if(quiz.result)article.append(node('p','Điểm: '+(10*quiz.result.correct_count/quiz.result.total).toFixed(2)+'/10 · Đúng '+quiz.result.correct_count+'/'+quiz.result.total+' câu.','lms-learning-result'));
          else if(!model.can_edit)article.append(button('Làm bài kiểm tra',()=>quizAttempt(article,quiz)));
          section.append(article);
        }
      }container.append(section);
    }
  }
  function render(){
    const {class:c,page,topics}=model;
    find('#lms-learning-title').textContent=c.course_name+' · '+c.code;
    find('#lms-learning-meta').textContent=`Giáo viên: ${c.teacher} · ${c.days} · ${c.time}`;
    find('#lms-learning-room').hidden=false;find('#lms-learning-toolbar').hidden=false;
    find('#lms-learning-edit').hidden=!model.can_edit;
    find('#lms-learning-edit').textContent=editing?'Tắt chỉnh sửa':'Bật chỉnh sửa';
    find('#lms-learning-edit').setAttribute('aria-pressed',String(editing));
    find('#lms-learning-mode').textContent=editing?'Đang chỉnh sửa · Chủ đề ẩn và bản nháp chỉ hiển thị cho giáo viên quản trị.':'';
    const general=find('#lms-learning-general');general.replaceChildren(node('h2','Thông tin chung'));
    general.append(node('div',page.introduction||'Giới thiệu lớp đang được cập nhật.','lms-learning-plain'));
    general.append(node('h2','Lớp học online'));
    if(page.online_url){
      try{
        const url=new URL(page.online_url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid URL');
        const link=node('a',page.online_title||'Vào lớp học trực tuyến','lms-learning-online');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';general.append(link);
      }catch{general.append(node('p','Liên kết học online chưa hợp lệ.'));}
    }else general.append(node('p','Chưa có liên kết học trực tuyến.','lms-learning-muted'));
    if(editing)general.append(button('Sửa giới thiệu và liên kết online',()=>openForm(general,'Thông tin chung',[
      {key:'introduction',label:'Giới thiệu lớp',value:page.introduction,max:5000,multiline:true},
      {key:'online_title',label:'Tên liên kết học online',value:page.online_title,max:150},
      {key:'online_url',label:'URL học online (HTTP/HTTPS)',value:page.online_url,max:2048,type:'url'}
    ],{version:page.revision},'content_save_class',[{label:'Lưu'}])));
    renderResources();
    const container=find('#lms-learning-topics');container.replaceChildren();
    if(!topics.length)container.append(node('p','Lớp chưa có chủ đề học tập được hiển thị.','lms-learning-empty'));
    for(const [index,topic] of topics.entries()){
      const detail=document.createElement('details');detail.open=true;detail.className='lms-learning-topic'+(!topic.visible?' lms-learning-hidden-topic':'');
      const summary=node('summary',topic.title);detail.append(summary);
      const inner=node('div','','lms-learning-topic-body');
      if(editing)inner.append(node('p',topic.visible?'Chủ đề đang hiển thị':'Chủ đề đang ẩn với học sinh','lms-learning-badge'));
      if(topic.description)inner.append(node('div',topic.description,'lms-learning-plain'));
      if(editing){
        const actions=node('div','','lms-learning-actions');
        actions.append(button('Sửa chủ đề',()=>topicForm(inner,topic)),button(topic.visible?'Ẩn chủ đề':'Hiện chủ đề',()=>quick('content_topic_save',{id:topic.id,version:topic.revision,title:topic.title,description:topic.description,visible:!topic.visible})));
        for(const [direction,label,edge] of [['up','Lên',index===0],['down','Xuống',index===topics.length-1]]){
          const move=button(label,()=>quick('content_topic_move',{id:topic.id,version:topic.revision,structure_version:page.structure_revision,direction}));move.dataset.boundary=String(edge);actions.append(move);
        }
        actions.append(button('Thêm bài văn bản',()=>lessonForm(inner,topic)));inner.append(actions);
      }
      if(!topic.lessons.length)inner.append(node('p',editing?'Chưa có bài văn bản trong chủ đề này.':'Chủ đề chưa có bài được xuất bản.','lms-learning-empty'));
      for(const lesson of topic.lessons){
        const article=node('article','','lms-learning-lesson');article.append(node('h3',lesson.title));
        if(editing)article.append(node('p',lesson.status==='published'?'Đã xuất bản':'Bản nháp','lms-learning-badge'));
        article.append(node('div',lesson.body||'Bài chưa có nội dung.','lms-learning-plain'));
        if(editing)article.append(button('Sửa bài',()=>lessonForm(article,topic,lesson)));
        inner.append(article);
      }
      detail.append(inner);container.append(detail);
    }
    find('#lms-learning-add-topic').hidden=!editing;
    controls();
  }
  async function load(){
    const current=++sequence;status.textContent='Đang tải lớp học…';
    try{
      const suffix='&class_code='+encodeURIComponent(code)+'&editing='+(editing?'1':'0');
      const [data,resources,quizzes]=await Promise.all([api.request('learning_class'+suffix),api.request('learning_resources'+suffix),api.request('learning_quizzes'+suffix)]);
      if(current!==sequence)return false;
      let extra={};
      if(data.can_edit){const [life,certs]=await Promise.all([api.request('class_lifecycle&class_code='+encodeURIComponent(code)),api.request('class_certificates&class_code='+encodeURIComponent(code))]);extra={lifecycleAdmin:life,certificates:certs.certificates};}
      if(current!==sequence)return false;
      model={...data,...extra,resources:resources.resources,quizzes:quizzes.quizzes};editing=data.editing;editor=null;render();status.textContent='';return true;
    }catch(error){if(current===sequence)inaccessible(error);return false;}
  }
  find('#lms-learning-edit').addEventListener('click',async()=>{
    if(busy||!model?.can_edit||!discard())return;
    editing=!editing;find('#lms-learning-topics').replaceChildren();find('#lms-learning-general').replaceChildren();await load();
  });
  find('#lms-learning-refresh').addEventListener('click',()=>{if(!busy&&discard())load();});
  find('#lms-learning-add-topic').addEventListener('click',()=>topicForm(find('#lms-learning-topic-editor')));
  try{
    const {user}=await api.request('auth_user');
    if(!user||user.must_change_password){window.location.replace('dang-nhap-hoc-sinh.html');return;}
    find('#lms-class-back').href=user.role==='admin'?'khoa-hoc-lms.html#khoa-hoc-giao-vien':'khoa-hoc-lms.html#khoa-hoc-hoc-sinh';
    if(code){await load();return;}
    const data=await api.request('learning_classes');find('#lms-learning-title').textContent=data.can_edit?'Các lớp học':'Lớp học của tôi';
    const cards=data.classes.map(c=>{
      const card=node('article','','lms-admin-box');card.append(node('h2',c.code+' · '+c.course_name),node('p','Giáo viên: '+c.teacher),node('p',c.days+' · '+c.time));
      const link=node('a','Mở lớp','lms-admin-back');link.href='lop-hoc-cua-toi.html?lop='+encodeURIComponent(c.code);card.append(link);return card;
    });find('#lms-student-class-list').replaceChildren(...cards);status.textContent=cards.length?'':'Bạn chưa có ghi danh hoạt động.';
    if(user.role==='student'){
      const {certificates}=await api.request('class_certificates');
      if(certificates.length){const section=node('section','','lms-admin-box');section.append(node('h2','Chứng nhận hoàn thành của tôi'));for(const cert of certificates){const p=node('p',cert.course_name+' · '+cert.class_code+' · Đợt '+cert.cycle_id+' · '),a=node('a','Tải chứng nhận','lms-admin-back');a.href=cert.download_url;p.append(a);section.append(p);}find('#lms-student-class-list').append(section);if(!cards.length){status.setAttribute('data-tone','success');status.textContent='Các đợt học đã kết thúc. Bạn có thể tải chứng nhận bên dưới.';}}
    }
  }catch(error){inaccessible(error);}
})();
