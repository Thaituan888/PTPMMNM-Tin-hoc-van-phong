// Real Edge UI, credentials received only via stdin; all fixtures owned by the HTTP runner.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let browser,ws,profile,next=0;const pending=new Map();
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error('Browser evaluation failed');return r.result.value;}
async function waitFor(expression,label){for(let i=0;i<300;i++){if(await evaluate(expression))return;await sleep(100);}const status=await evaluate(`document.querySelector('#lms-student-message')?.textContent||''`);throw new Error('UI timeout '+label+'; status: '+status);}
async function click(text){assert(await evaluate(`(()=>{const el=Array.from(document.querySelectorAll('button')).find(x=>x.textContent===${JSON.stringify(text)}&&!x.disabled);if(!el)return false;el.click();return true;})()`),'Missing button '+text);}
async function main(){
  const chunks=[];for await(const c of process.stdin)chunks.push(c);const config=JSON.parse(Buffer.concat(chunks).toString());
  profile=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'lms-life-edge-'));fs.mkdirSync(config.screenshots,{recursive:true});
  browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--disable-background-networking','--disable-extensions','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let port;for(let i=0;i<150;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port)break;}catch{}await sleep(100);}assert(port,'Edge started');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});const exceptions=[];
  ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(new Error('CDP error')):p.resolve(d.result);}}else if(d.method==='Runtime.exceptionThrown')exceptions.push(d.params.exceptionDetails.text);});
  await command('Browser.getVersion');await command('Page.enable');await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  async function adminLogin(){await command('Page.navigate',{url:config.base_url+'/dang-nhap-admin.html?nguon=khoa-hoc'});await waitFor(`document.querySelector('#lms-login-submit')&&performance.getEntriesByType('resource').some(x=>x.name.includes('action=auth_user')&&x.responseEnd>0)`,'teacher login');await sleep(150);await evaluate(`document.querySelector('#lms-login-username').value='Giaovien1';document.querySelector('#lms-login-password').value=${JSON.stringify(config.admin_password)};document.querySelector('#lms-login-submit').click();`);await waitFor(`location.hash==='#khoa-hoc-giao-vien'`,'teacher signed in');}
  async function room(){await command('Page.navigate',{url:config.base_url+'/lop-hoc-cua-toi.html?lop=CB-01'});await waitFor(`document.querySelector('#lms-learning-room')?.hidden===false`,'room');await evaluate(`window.confirm=()=>true;`);await click('Bật chỉnh sửa');await waitFor(`document.querySelector('#lms-learning-edit').textContent==='Tắt chỉnh sửa'`,'editing');}
  await adminLogin();await room();await click('Khai giảng');
  await evaluate(`document.querySelector('.lms-learning-editor input[type="date"]').value=${JSON.stringify(config.start_date)};document.querySelector('.lms-learning-editor').requestSubmit();`);
  await waitFor(`document.querySelector('#lms-learning-resources').textContent.includes('Đã khai giảng')&&document.querySelector('#lms-student-message').textContent.includes('SMTP đã chấp nhận 1/1')`,'opening and email');
  await click('Bế giảng');await waitFor(`document.querySelector('#lms-learning-resources').textContent.includes('Đã bế giảng')&&document.querySelector('#lms-student-message').textContent.includes('SMTP đã chấp nhận 1/1')`,'completion and certificate mail');
  assert(await evaluate(`document.querySelector('#lms-learning-resources a[href*="action=class_certificate"]')!==null`),'teacher certificate link');
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  await evaluate(`document.querySelector('#lms-learning-resources').scrollIntoView();window.scrollBy(0,-100);`);await sleep(200);
  let shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'teacher-lifecycle-desktop.png'),Buffer.from(shot.data,'base64'));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'mobile layout');
  shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'teacher-lifecycle-mobile.png'),Buffer.from(shot.data,'base64'));
  await evaluate(`document.querySelector('.lms-account-menu summary').click();`);await click('Đăng xuất');await waitFor(`location.pathname.endsWith('dang-nhap-hoc-sinh.html')`,'logout');
  await waitFor(`document.querySelector('#lms-student-login-submit')&&performance.getEntriesByType('resource').some(x=>x.name.includes('action=auth_user')&&x.responseEnd>0)`,'student login');await sleep(150);
  await evaluate(`document.querySelector('#lms-student-username').value=${JSON.stringify(config.student_username)};document.querySelector('#lms-student-password').value=${JSON.stringify(config.student_password)};document.querySelector('#lms-student-login-submit').click();`);
  await waitFor(`document.querySelector('#lms-student-class-list')?.textContent.includes('Chứng nhận hoàn thành của tôi')`,'student certificates after completion');
  assert.equal(await evaluate(`document.querySelectorAll('#lms-student-class-list a[href*="lop-hoc-cua-toi.html?lop=CB-01"]').length`),0);
  assert.equal(await evaluate(`fetch('lms-api.php?action=learning_class&class_code=CB-01').then(r=>r.status)`),404);
  assert.equal(await evaluate(`fetch(document.querySelector('#lms-student-class-list a[href*="class_certificate"]').href).then(r=>r.status)`),200);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
  shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,'student-certificates-mobile.png'),Buffer.from(shot.data,'base64'));
  await adminLogin();await room();await click('Mở lại đăng ký');await waitFor(`document.querySelector('#lms-learning-resources').textContent.includes('Chưa khai giảng')&&document.querySelector('#lms-learning-resources').textContent.includes('Đang nhận đăng ký')`,'manual reopen');
  assert.equal(exceptions.length,0,'no unhandled JS errors');
  console.log('PASS: real Edge teacher opens/completes with SMTP status, certificate links, student loses content access but downloads own certificate, manual reopening, desktop/mobile and no JS/overflow errors.');
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;}).finally(async()=>{if(ws?.readyState===WebSocket.OPEN){try{await command('Browser.close');}catch{}ws.close();}if(browser&&browser.exitCode===null){await Promise.race([new Promise(r=>browser.once('exit',r)),sleep(3000)]);if(browser.exitCode===null)browser.kill();}if(profile){const root=fs.realpathSync(os.tmpdir());if(path.resolve(profile).startsWith(root+path.sep)&&path.basename(profile).startsWith('lms-life-edge-'))try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:15,retryDelay:200});}catch{}}});
