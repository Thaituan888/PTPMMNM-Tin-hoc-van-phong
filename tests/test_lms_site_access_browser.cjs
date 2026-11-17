// Real Edge, fake SQLite users only; no real email or payment.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser,ws,profile,id=0;const pending=new Map(),errors=[];
async function command(method,params={}){return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(new Error('CDP timeout '+method));},15000);pending.set(key,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error('Browser evaluation failed: '+r.exceptionDetails.text);return r.result.value;}
async function waitFor(expression,label){for(let i=0;i<200;i++){if(await evaluate(expression))return;await sleep(100);}const state=await evaluate(`({path:location.pathname,login:document.querySelector('#lms-login-message')?.textContent,student:document.querySelector('#lms-student-message')?.textContent,courses:document.querySelector('#lms-courses-status')?.textContent})`);throw new Error('UI timeout: '+label+' '+JSON.stringify(state)+' '+JSON.stringify(errors));}
async function main(){
  const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const config=JSON.parse(Buffer.concat(chunks).toString());
  profile=fs.mkdtempSync(path.join(os.tmpdir(),'lms-permission-edge-'));fs.mkdirSync(config.screenshots,{recursive:true});
  browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--disable-background-networking','--disable-extensions','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let port;for(let i=0;i<150;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port)break;}catch{}await sleep(100);}assert(port,'Edge started');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(targets.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(new Error(r.error.message)):p.resolve(r.result);}}else if(r.method==='Runtime.exceptionThrown'){const e=r.params.exceptionDetails;errors.push(e.exception?.description||e.text);}});
  await command('Page.enable');await command('Runtime.enable');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  async function open(file){const url=config.base_url+'/'+file;await command('Page.navigate',{url});await waitFor(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`,'page ready '+file);}
  async function screenshot(name){const r=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(config.screenshots,name),Buffer.from(r.data,'base64'));}
  async function logout(){await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('.lms-account-panel button')).find(x=>x.textContent==='Đăng xuất');if(!b)throw Error('Logout missing');b.click();})()`);await waitFor(`!document.querySelector('.lms-account-menu')`,'logged out');}
  async function login(teacher){
    await open(teacher?'dang-nhap-admin.html?nguon=khoa-hoc':'dang-nhap-hoc-sinh.html?nguon=khoa-hoc');
    const prefix=teacher?'#lms-login-':'#lms-student-';
    await waitFor(teacher?'document.querySelector("#lms-login-submit")?.disabled===false':'document.querySelector("#lms-student-login-submit")?.disabled===false','login initialized');
    await evaluate(`document.querySelector(${JSON.stringify(prefix+'username')}).value=${JSON.stringify(teacher?'Giaovien1':'Enrolled')};document.querySelector(${JSON.stringify(prefix+'password')}).value=${JSON.stringify(config.password)};document.querySelector(${JSON.stringify(prefix+'username')}).form.requestSubmit();`);
    await waitFor(`location.pathname.endsWith('/khoa-hoc-lms.html')&&document.querySelectorAll('#lms-courses-list article').length===${teacher?2:1}`,'login automatically shows personal classes');
  }
  await open('index.html');await waitFor(`document.querySelector('[data-lms-account-link]')?.getAttribute('href')==='khoa-hoc-lms.html#khoa-hoc'`,'public login destination');
  await evaluate(`document.querySelector('[data-lms-account-link]').click()`);await waitFor(`document.querySelector('#lms-courses-picker')?.hidden===false&&!!document.querySelector('#lms-courses-actions a')`,'guest chooses teacher/student');
  assert(await evaluate(`document.querySelectorAll('#lms-courses-picker a').length===2&&document.querySelector('#lms-courses-actions a').hash==='#gioi-thieu'`));
  await screenshot('guest-login-desktop.png');
  await open('dang-nhap-hoc-sinh.html?nguon=khoa-hoc');assert(await evaluate(`!!document.querySelector('#lms-student-login-form a[href="khoa-hoc-lms.html#gioi-thieu"]')`));
  await open('luyen-go-phim.html');await waitFor(`document.body.dataset.lmsFeaturePreview==='true'`,'guest preview');
  await evaluate(`document.querySelector('#btn-tools-dropdown').click()`);assert(await evaluate(`document.querySelector('#nav-tools-dropdown').classList.contains('open')`),'public preview keeps header navigation');
  await evaluate(`localStorage.setItem('thvp_current_user',JSON.stringify({role:'admin',username:'Giaovien1'}));`);await open('on-luyen-thi-thu.html');
  assert(await evaluate(`document.body.dataset.lmsFeaturePreview==='true'&&window.THVP_AUTH.getCurrentUser()===null`),'forged localStorage cannot grant access');
  await login(true);await open('khoa-hoc-lms.html#khoa-hoc');await waitFor(`document.querySelectorAll('#lms-courses-list article').length===2`,'teacher reload');
  assert(await evaluate(`document.querySelector('#lms-courses-picker').hidden&&Array.from(document.querySelectorAll('#lms-courses-list .lms-card-number')).map(x=>x.textContent).join(',')==='CB-01,NC-01'`));
  await evaluate(`document.querySelector('#lms-tab-intro').click();document.querySelector('#lms-tab-courses').click();`);await waitFor(`document.querySelectorAll('#lms-courses-list article').length===2`,'teacher repeats tab without role choice');await screenshot('teacher-classes-desktop.png');
  for(const file of ['on-luyen-thi-thu.html','luyen-go-phim.html','kiem-tra-ban-phim.html','tra-cuu-phim-tat.html','tim-hieu-ban-phim.html','dien-dan.html']){
    await open(file);await waitFor(`window.THVP_AUTH?.getCurrentUser()?.role==='admin'&&!!document.querySelector('.lms-account-menu')`,'teacher member feature '+file);
    assert(await evaluate(`!document.querySelector('#btnHeaderRoleCycle')&&!document.querySelector('.role-switcher-bar')&&document.body.dataset.lmsFeaturePreview!=='true'`));
  }
  await logout();await waitFor(`document.body.dataset.lmsFeaturePreview==='true'`,'logout reloads public preview');
  await login(false);assert(await evaluate(`document.querySelector('#lms-courses-picker').hidden&&document.querySelector('#lms-courses-list .lms-card-number').textContent==='CB-01'`));
  await open('khoa-hoc-lms.html#khoa-hoc-giao-vien');await waitFor(`document.querySelectorAll('#lms-courses-list article').length===1`,'student forged teacher hash');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'mobile personal classes fit');await screenshot('student-classes-mobile.png');
  await open('luyen-go-phim.html');await waitFor(`window.THVP_AUTH?.getCurrentUser()?.role==='student'`,'student features');
  assert(await evaluate(`Object.isFrozen(window.THVP_AUTH.getCurrentUser())`),'readonly identity snapshot');
  await logout();await waitFor(`document.body.dataset.lmsFeaturePreview==='true'`,'student logout');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'mobile public preview fits');await screenshot('guest-preview-mobile.png');
  assert.deepEqual(errors,[],'no uncaught JavaScript errors');
  console.log('PASS Edge desktop/mobile: public login choices, registration CTA, server-backed teacher/student login, role auto-resume, own classes on reload/repeated tab, all six feature pages, localStorage spoof denied, logout locks features, no JS errors.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(ws)ws.close();if(browser){browser.kill();await sleep(600);}if(profile){const base=fs.realpathSync(os.tmpdir())+path.sep;const target=path.resolve(profile);if(target.startsWith(base)&&path.basename(target).startsWith('lms-permission-edge-'))try{fs.rmSync(target,{recursive:true,force:true});}catch{}}});
