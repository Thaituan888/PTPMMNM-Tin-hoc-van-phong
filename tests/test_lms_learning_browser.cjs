// Real Edge/CDP test using Node's built-in WebSocket. Receives fake credentials through stdin only.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser=null,ws=null,profile=null,cdp=null;
const pending=new Map();let nextId=0;
async function command(method,params={}){
  const id=++nextId;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw new Error('Browser evaluation failed');
  return result.result.value;
}
async function waitFor(expression,label,timeout=25000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await evaluate(expression))return;await sleep(100);}
  throw new Error('UI timeout: '+label);
}
async function click(text,scope='document'){
  const expression=`(()=>{const el=Array.from(${scope}.querySelectorAll('button')).find(x=>x.textContent===${JSON.stringify(text)}&&!x.disabled);if(!el)return false;el.click();return true;})()`;
  assert(await evaluate(expression),'Button available: '+text);
}
async function submit(text){
  assert(await evaluate(`(()=>{const form=document.querySelector('.lms-learning-editor');const button=Array.from(form?.querySelectorAll('button')||[]).find(x=>x.textContent===${JSON.stringify(text)});if(!button)return false;form.requestSubmit(button);return true;})()`),'Submit editor');
}
async function main(){
  const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const config=JSON.parse(Buffer.concat(chunks).toString());
  const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  assert(fs.existsSync(edge),'Edge executable exists');assert.equal(typeof WebSocket,'function');
  const tempRoot=fs.realpathSync(os.tmpdir());profile=fs.mkdtempSync(path.join(tempRoot,'lms-edge-'));
  fs.mkdirSync(config.screenshots,{recursive:true});
  browser=spawn(edge,['--headless=new','--disable-gpu','--disable-background-networking','--disable-extensions','--disable-sync','--no-first-run','--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let debuggingPort=null;
  for(let i=0;i<150;i++){
    try{debuggingPort=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(debuggingPort)break;}catch{}
    if(browser.exitCode!==null)break;await sleep(100);
  }
  assert(debuggingPort,'Headless Edge started');
  const targets=await (await fetch('http://127.0.0.1:'+debuggingPort+'/json/list')).json();
  const target=targets.find(t=>t.type==='page');assert(target,'DevTools page target');
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',()=>reject(new Error('CDP connection failed')),{once:true});});
  const exceptions=[];
  ws.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(data.id){const waiter=pending.get(data.id);if(waiter){pending.delete(data.id);data.error?waiter.reject(new Error('CDP command rejected')):waiter.resolve(data.result);}}
    else if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);
  });
  await command('Browser.getVersion');await command('Page.enable');await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const base=config.base_url;
  await command('Page.navigate',{url:base+'/khoa-hoc-lms.html#gioi-thieu'});
  await waitFor(`document.querySelectorAll('.lms-course-poster').length===2&&Array.from(document.querySelectorAll('.lms-course-poster')).every(img=>img.complete&&img.naturalWidth===1536&&img.naturalHeight===1024)`,'both course posters load');
  await evaluate(`(async()=>{await Promise.all(Array.from(document.querySelectorAll('.lms-course-poster')).map(img=>img.decode()));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;})()`);
  assert(await evaluate(`(()=>{const cards=Array.from(document.querySelectorAll('.lms-course-card'));return cards[0].getBoundingClientRect().top===cards[1].getBoundingClientRect().top&&cards[0].querySelector('a').href.endsWith('?khoa=co-ban')&&cards[1].querySelector('a').href.endsWith('?khoa=nang-cao')&&document.documentElement.scrollWidth<=innerWidth;})()`),'desktop posters and course destinations');
  const postersDesktop=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'posters-desktop.png'),Buffer.from(postersDesktop.data,'base64'));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate(`(()=>{const c=Array.from(document.querySelectorAll('.lms-course-card')).map(x=>x.getBoundingClientRect());return c[1].top>=c[0].bottom&&document.documentElement.scrollWidth<=innerWidth;})()`),'posters stack without horizontal overflow on mobile');
  const postersMobile=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'posters-mobile.png'),Buffer.from(postersMobile.data,'base64'));
  await evaluate(`document.querySelectorAll('.lms-course-card')[1].scrollIntoView();window.scrollBy(0,-100);`);
  const advancedMobile=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'posters-advanced-mobile.png'),Buffer.from(advancedMobile.data,'base64'));
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:pathToFileURL(path.join(__dirname,'../khoa-hoc-lms.html')).href+'#khoa-hoc'});
  await waitFor(`document.querySelector('#lms-courses-status')?.textContent.includes('Chọn Giáo viên')`,'file preview course choice');
  assert.equal(await evaluate(`document.querySelector('#lms-courses-picker a').href`),'http://127.0.0.1:8080/dang-nhap-admin.html?nguon=khoa-hoc');
  assert.equal(await evaluate(`document.querySelectorAll('#lms-courses-picker a')[1].href`),'http://127.0.0.1:8080/dang-nhap-hoc-sinh.html?nguon=khoa-hoc');
  await command('Page.navigate',{url:pathToFileURL(path.join(__dirname,'../dang-nhap-admin.html')).href+'?nguon=khoa-hoc'});
  await waitFor(`document.querySelector('#lms-login-message')?.textContent.includes('trực tiếp từ tệp')`,'file URL explains missing PHP server');
  assert.equal(await evaluate(`document.querySelector('#lms-login-server-help').hidden`),false);
  assert.equal(await evaluate(`document.querySelector('#lms-login-server-help a').href`),'http://127.0.0.1:8080/dang-nhap-admin.html?nguon=khoa-hoc');
  await command('Page.navigate',{url:base+'/khoa-hoc-lms.html#khoa-hoc'});
  await waitFor(`document.querySelector('#lms-courses-status')?.textContent.includes('Chọn Giáo viên')`,'course login choice');
  assert.equal(await evaluate(`document.querySelectorAll('#lms-courses-list article').length`),0);
  assert.equal(await evaluate(`document.querySelectorAll('#lms-courses-picker a').length`),2);
  await evaluate(`document.querySelector('#lms-courses-picker a[href^="dang-nhap-admin"]').click();`);
  await waitFor(`document.querySelector('#lms-login-submit')&&performance.getEntriesByType('resource').some(x=>x.name.includes('action=auth_user')&&x.responseEnd>0)`,'admin login ready');await sleep(150);
  await evaluate(`document.querySelector('#lms-login-username').value=${JSON.stringify(config.admin_username)};document.querySelector('#lms-login-password').value=${JSON.stringify(config.admin_password)};document.querySelector('#lms-login-submit').click();`);
  await waitFor(`location.hash==='#khoa-hoc-giao-vien'&&document.querySelectorAll('#lms-courses-list article').length===2`,'teacher returned to two assigned classes');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('#lms-courses-list .lms-card-number')).map(x=>x.textContent).join(',')`),'CB-01,NC-01');
  await command('Page.reload');
  await waitFor(`document.querySelectorAll('#lms-courses-list article').length===2`,'teacher list survives reload');
  await waitFor(`document.querySelector('.lms-account-menu summary')`,'compact account menu');
  assert(await evaluate(`document.querySelector('[data-lms-account]').hidden&&document.querySelector('[data-lms-account-link]').hidden`),'duplicate account bar and header link removed');
  await evaluate(`document.querySelector('.lms-account-menu summary').click();`);
  assert(await evaluate(`document.querySelector('.lms-account-menu').open&&Array.from(document.querySelectorAll('.lms-account-panel a')).some(x=>x.textContent==='Quản lý đăng ký')`),'teacher navigation grouped in menu');
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);
  assert.equal(await evaluate(`document.querySelector('.lms-account-menu').open`),false);
  for(const pathname of ['gioi-thieu-khoa-hoc.html?khoa=co-ban','dang-ky-khoa-hoc.html?lop=CB-01','quan-ly-dang-ky.html','lop-hoc-cua-toi.html']){
    await command('Page.navigate',{url:base+'/'+pathname});
    await waitFor(`document.querySelector('.lms-account-menu summary')`,'shared compact navigation');
    assert.equal(await evaluate(`document.querySelectorAll('.lms-account-menu').length`),1);
    assert(await evaluate(`document.querySelector('[data-lms-account]').hidden`),'no duplicate account bar on '+pathname);
    await command('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
    await evaluate(`document.querySelector('.lms-account-menu summary').click();`);
    assert(await evaluate(`(()=>{const r=document.querySelector('.lms-account-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;})()`),'mobile account menu stays inside '+pathname);
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  await command('Page.navigate',{url:base+'/khoa-hoc-lms.html#khoa-hoc-giao-vien'});
  await waitFor(`document.querySelectorAll('#lms-courses-list article').length===2`,'return from shared navigation checks');
  assert(await evaluate(`document.querySelector('#lms-panel-intro').hidden&&!document.querySelector('#lms-panel-courses').hidden`));
  assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),'desktop course tab has no horizontal overflow');
  const portal=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'courses-admin-desktop.png'),Buffer.from(portal.data,'base64'));
  await evaluate(`document.querySelector('#lms-courses-list a[href="lop-hoc-cua-toi.html?lop=CB-01"]').click();`);
  await waitFor(`document.querySelector('#lms-learning-room')?.hidden===false`,'shared classroom ready');
  assert.equal(await evaluate(`document.querySelector('#lms-class-back').getAttribute('href')`),'khoa-hoc-lms.html#khoa-hoc-giao-vien');
  await evaluate(`document.querySelector('#lms-class-back').click();`);
  await waitFor(`location.hash==='#khoa-hoc-giao-vien'&&document.querySelectorAll('#lms-courses-list article').length===2`,'back returns teacher to assigned classes only');
  await evaluate(`document.querySelector('#lms-courses-list a[href="lop-hoc-cua-toi.html?lop=CB-01"]').click();`);
  await waitFor(`document.querySelector('#lms-learning-room')?.hidden===false`,'class reopened after personal list');
  assert(await evaluate(`document.querySelector('#lms-learning-edit').textContent==='Bật chỉnh sửa'&&!document.querySelector('#lms-learning-edit').hidden`));
  await click('Bật chỉnh sửa');await waitFor(`document.querySelector('#lms-learning-edit')?.textContent==='Tắt chỉnh sửa'`,'edit mode');
  await click('Thêm thông báo');
  await evaluate(`document.querySelector('.lms-learning-editor input[type="text"]').value='Thông báo trình duyệt';document.querySelector('.lms-learning-editor textarea').value='Chuẩn bị tài liệu trước buổi học.';`);
  await submit('Xuất bản');await waitFor(`!document.querySelector('.lms-learning-editor')&&document.querySelector('#lms-learning-resources').textContent.includes('Thông báo trình duyệt')`,'notice published');
  await click('Tải tài liệu lên');
  await evaluate(`(()=>{const f=document.querySelector('.lms-learning-editor');f.querySelector('input[type="text"]').value='Tài liệu trình duyệt';const dt=new DataTransfer();dt.items.add(new File(['Tài liệu tiếng Việt'], 'bai-hoc.txt',{type:'text/plain'}));f.querySelector('input[type="file"]').files=dt.files;})()`);
  await submit('Xuất bản');await waitFor(`!document.querySelector('.lms-learning-editor')&&document.querySelector('#lms-learning-resources').textContent.includes('Tài liệu trình duyệt')`,'document uploaded');
  await click('Nhập bài trắc nghiệm từ tệp');
  await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify({title:'Trắc nghiệm trình duyệt',questions:[{text:'Sao chép?',choices:['Ctrl+C','Ctrl+V'],answer:0}]})],'quiz.json',{type:'application/json'}));document.querySelector('.lms-learning-editor input[type="file"]').files=dt.files;})()`);
  await submit('Xuất bản');await waitFor(`!document.querySelector('.lms-learning-editor')&&document.querySelector('#lms-learning-resources').textContent.includes('Trắc nghiệm trình duyệt')`,'quiz imported');
  await click('Thêm chủ đề');
  const topicTitle='Chủ đề kiểm thử trình duyệt',lessonTitle='Bài văn bản kiểm thử trình duyệt';
  const lessonBody='Nội dung xuất bản qua trình duyệt\n<script>window.__LMS_XSS=1</script>\n<img src=x onerror="window.__LMS_XSS=1">';
  await evaluate(`document.querySelector('.lms-learning-editor input').value=${JSON.stringify(topicTitle)};document.querySelector('.lms-learning-editor textarea').value='Mô tả tiếng Việt';`);
  await submit('Lưu');await waitFor(`!document.querySelector('.lms-learning-editor')&&Array.from(document.querySelectorAll('summary')).some(x=>x.textContent===${JSON.stringify(topicTitle)})`,'topic saved');
  const topicScope=`Array.from(document.querySelectorAll('details')).find(x=>x.querySelector('summary').textContent===${JSON.stringify(topicTitle)})`;
  await click('Thêm bài văn bản',topicScope);
  await evaluate(`document.querySelector('.lms-learning-editor input').value=${JSON.stringify(lessonTitle)};document.querySelector('.lms-learning-editor textarea').value=${JSON.stringify(lessonBody)};`);
  await submit('Lưu bản nháp');await waitFor(`!document.querySelector('.lms-learning-editor')&&document.querySelector('#lms-learning-topics').textContent.includes(${JSON.stringify(lessonTitle)})`,'draft saved');
  await click('Tắt chỉnh sửa');await waitFor(`document.querySelector('#lms-learning-edit').textContent==='Bật chỉnh sửa'`,'view mode');
  assert(!(await evaluate(`document.querySelector('#lms-learning-topics').textContent.includes(${JSON.stringify(lessonTitle)})`)),'draft excluded in teacher view');
  await click('Bật chỉnh sửa');await waitFor(`document.querySelector('#lms-learning-topics').textContent.includes(${JSON.stringify(lessonTitle)})`,'draft restored for editing');
  const lessonScope=`Array.from(document.querySelectorAll('.lms-learning-lesson')).find(x=>x.querySelector('h3').textContent===${JSON.stringify(lessonTitle)})`;
  await click('Sửa bài',lessonScope);await submit('Xuất bản');
  await waitFor(`!document.querySelector('.lms-learning-editor')&&${lessonScope}.querySelector('.lms-learning-badge').textContent==='Đã xuất bản'`,'lesson published');
  // Another tab updates the row; the open form must retain its input after a 409.
  await click('Sửa bài',lessonScope);
  await evaluate(`document.querySelector('.lms-learning-editor textarea').value='Giữ nội dung chưa lưu';`);
  assert.equal(await evaluate(`(async()=>{const s=await (await fetch('lms-api.php?action=session')).json();const d=await (await fetch('lms-api.php?action=learning_class&class_code=CB-01&editing=1')).json();const t=d.topics.find(x=>x.title===${JSON.stringify(topicTitle)});const l=t.lessons.find(x=>x.title===${JSON.stringify(lessonTitle)});return (await fetch('lms-api.php?action=content_lesson_save',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:JSON.stringify({class_code:'CB-01',topic_id:t.id,id:l.id,version:l.revision,title:l.title,body:l.body,status:'published'})})).status;})()`),200);
  await submit('Lưu thay đổi');await waitFor(`document.querySelector('.lms-learning-error')?.textContent.includes('cập nhật')`,'stale editor conflict');
  assert.equal(await evaluate(`document.querySelector('.lms-learning-editor textarea').value`),'Giữ nội dung chưa lưu');
  await click('Hủy',`document.querySelector('.lms-learning-editor')`);
  assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),'desktop has no horizontal overflow');
  const desktop=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'teacher-desktop.png'),Buffer.from(desktop.data,'base64'));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);
  assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),'teacher mobile has no horizontal overflow');
  await evaluate(`${topicScope}.scrollIntoView();window.scrollBy(0,-110);`);
  const mobileTeacher=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'teacher-mobile.png'),Buffer.from(mobileTeacher.data,'base64'));
  await evaluate(`document.querySelector('.lms-account-menu summary').click();`);
  await click('Đăng xuất');await waitFor(`location.pathname.endsWith('dang-nhap-hoc-sinh.html')`,'logout routes to student login');
  await command('Page.navigate',{url:base+'/khoa-hoc-lms.html#khoa-hoc'});
  await waitFor(`document.querySelector('#lms-courses-picker')?.hidden===false`,'student selects role');
  await evaluate(`document.querySelector('#lms-courses-picker a[href^="dang-nhap-hoc-sinh"]').click();`);
  await waitFor(`document.querySelector('#lms-student-login-submit')&&performance.getEntriesByType('resource').some(x=>x.name.includes('action=auth_user')&&x.responseEnd>0)`,'student login ready');await sleep(150);
  await evaluate(`document.querySelector('#lms-student-username').value=${JSON.stringify(config.student_username)};document.querySelector('#lms-student-password').value=${JSON.stringify(config.student_password)};document.querySelector('#lms-student-login-submit').click();`);
  await waitFor(`location.hash==='#khoa-hoc-hoc-sinh'&&document.querySelectorAll('#lms-courses-list article').length===1`,'student returned to enrolled class only');
  await command('Page.reload');
  await waitFor(`document.querySelectorAll('#lms-courses-list article').length===1`,'student list survives reload');
  assert.equal(await evaluate(`document.querySelectorAll('#lms-courses-list a[href*="NC-01"]').length`),0);
  assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),'mobile course tab has no horizontal overflow');
  const portalStudent=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'courses-student-mobile.png'),Buffer.from(portalStudent.data,'base64'));
  await evaluate(`document.querySelector('#lms-courses-list a[href="lop-hoc-cua-toi.html?lop=CB-01"]').click();`);
  await waitFor(`document.querySelector('#lms-learning-topics')?.textContent.includes(${JSON.stringify(lessonTitle)})`,'student sees published lesson');
  assert(await evaluate(`document.querySelector('#lms-learning-edit').hidden&&!document.querySelector('.lms-learning-editor')`),'student has no edit UI');
  assert.equal(await evaluate(`document.querySelector('#lms-class-back').getAttribute('href')`),'khoa-hoc-lms.html#khoa-hoc-hoc-sinh');
  assert(await evaluate(`document.querySelector('#lms-learning-resources').textContent.includes('Thông báo trình duyệt')&&document.querySelector('#lms-learning-resources').textContent.includes('Tài liệu trình duyệt')`),'student sees notice and uploaded document');
  await click('Làm bài kiểm tra');
  await evaluate(`window.confirm=()=>true;document.querySelector('.lms-learning-editor input[type="radio"]').checked=true;document.querySelector('.lms-learning-editor').requestSubmit();`);
  await waitFor(`!document.querySelector('.lms-learning-editor')&&document.querySelector('#lms-learning-resources').textContent.includes('10.00/10')`,'student quiz instantly graded');
  assert(await evaluate(`window.__LMS_XSS===undefined&&!document.querySelector('#lms-learning-topics script')&&!document.querySelector('#lms-learning-topics img')`),'plain text XSS never executes');
  assert(await evaluate(`!document.querySelector('#lms-learning-topics').textContent.includes('DRAFT_PRIVATE_MARKER')&&!document.querySelector('#lms-learning-topics').textContent.includes('HIDDEN_LESSON_MARKER')`),'draft/hidden text absent');
  assert.equal(await evaluate(`fetch('lms-api.php?action=learning_lesson&class_code=CB-01&id='+${config.draft_id}).then(r=>r.status)`),404);
  assert.equal(await evaluate(`fetch('lms-api.php?action=learning_lesson&class_code=CB-01&id='+${config.hidden_id}).then(r=>r.status)`),404);
  assert.equal(await evaluate(`fetch('lms-api.php?action=learning_class&class_code=CB-01&editing=1').then(r=>r.status)`),403);
  assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),'student mobile has no horizontal overflow');
  await evaluate(`${topicScope}.scrollIntoView();window.scrollBy(0,-110);`);
  const mobile=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'student-mobile.png'),Buffer.from(mobile.data,'base64'));
  await evaluate(`document.querySelector('.lms-account-menu summary').click();document.querySelector('.lms-account-panel a[href="dang-nhap-hoc-sinh.html?doi-mat-khau=1"]').click();`);
  await waitFor(`document.querySelector('#lms-student-password-form')?.hidden===false`,'optional password change from student menu');
  assert.equal(await evaluate(`document.querySelector('#lms-student-login-form').hidden`),true);
  assert.equal(await evaluate(`document.querySelector('#lms-student-change-skip').hidden`),false);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'optional password form fits mobile');
  await evaluate(`document.querySelector('#lms-student-change-skip').click();`);
  await waitFor(`document.querySelector('#lms-student-class-list')?.textContent.includes('CB-01')`,'student can skip optional password change and enter class');
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});await sleep(100);
  assert(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),'320px viewport has no horizontal overflow');
  assert.equal(exceptions.length,0,'no uncaught JavaScript exceptions');
  console.log('PASS: file preview links navigate to local PHP, direct file login reports cause/recovery link; real Edge desktop/mobile (1440, 390, 320px), teacher/student login and personal classes, reload, draft/publish/student view, XSS inert and private APIs blocked; no horizontal overflow.');
}
main().catch(error=>{console.error('FAIL: browser check: '+error.message);process.exitCode=1;}).finally(async()=>{
  if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close');}catch{}ws.close();}
  if(browser&&browser.exitCode===null){await Promise.race([new Promise(resolve=>browser.once('exit',resolve)),sleep(3000)]);if(browser.exitCode===null)browser.kill();}
  if(profile){const parent=fs.realpathSync(os.tmpdir());const resolved=fs.existsSync(profile)?fs.realpathSync(profile):profile;
    if(resolved.startsWith(parent+path.sep)&&path.basename(resolved).startsWith('lms-edge-')){try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:15,retryDelay:200});}catch{}}
  }
});
