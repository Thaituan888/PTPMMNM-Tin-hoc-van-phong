const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../lms-mail.js'),'utf8');
const flush=()=>new Promise(setImmediate);
async function page(user={username:'Giaovien1',role:'admin'}){
  const nodes=new Map(),events={},calls=[];
  let configured=true,issue=null,held=false,release=null,failure=null;
  class Node {
    constructor(){this.hidden=true;this.value='';this.children=[];this.handlers={};this.validity={typeMismatch:false};}
    addEventListener(key,fn){this.handlers[key]=fn;}
    replaceChildren(...children){this.children=children;}
    setAttribute(key,value){this[key]=value;}
    focus(){this.focused=true;}
  }
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};
  get('#lms-mail').querySelector=get;
  const api={request:async(action,options)=>{
    calls.push({action,options});
    if(action==='auth_user')return {user};
    if(action==='session')return {csrf:'verified-csrf'};
    if(action==='mail_status')return {mail:{configured,message:configured?'Đã cấu hình SMTP.':'Chưa cấu hình email.',issues:issue?[issue]:[]}};
    if(action==='mail_test'){
      if(held)await new Promise(resolve=>release=resolve);
      if(failure)throw failure;
      return {accepted_by_smtp:true,message:'Đã gửi qua SMTP; vui lòng kiểm tra hộp thư và thư rác'};
    }
    throw new Error('Unexpected action');
  }};
  const context={window:{THVP_LMS_API:api,addEventListener:(key,fn)=>events[key]=fn},
    document:{getElementById:id=>get('#'+id),createElement:()=>new Node()}};
  vm.runInNewContext(source,context);await flush();await flush();
  return {get,calls,events,configured:value=>configured=value,issue:value=>issue=value,hold:value=>held=value,
    release:()=>release(),failure:value=>failure=value,submit:()=>get('#lms-mail-form').handlers.submit({preventDefault(){}})};
}
(async()=>{
  for(const user of [null,{username:'student_fixture',role:'student'},{username:'Giaovien1',role:'student'},{username:'OtherAdmin',role:'admin'}]){
    const p=await page(user);assert.equal(p.get('#lms-mail').hidden,true);assert.equal(p.calls.some(c=>c.action==='mail_status'),false);
  }
  for(const username of ['Giaovien1','Giaovien2','Giaovien3']){
    const p=await page({username,role:'admin'});assert.equal(p.get('#lms-mail').hidden,false);
    assert.equal(p.calls.filter(c=>c.action==='mail_test').length,0); // Opening/refreshing never sends automatically.
  }
  const p=await page();
  await p.submit();assert.equal(p.calls.filter(c=>c.action==='mail_test').length,0);
  p.get('#lms-mail-recipient').value='bad';p.get('#lms-mail-recipient').validity.typeMismatch=true;
  await p.submit();assert.equal(p.calls.filter(c=>c.action==='mail_test').length,0);
  p.get('#lms-mail-recipient').value=' owner@example.test ';p.get('#lms-mail-recipient').validity.typeMismatch=false;
  p.hold(true);const pending=p.submit();await flush();
  assert.equal(p.get('#lms-mail-send').disabled,true);assert.equal(p.get('#lms-mail-refresh').disabled,true);
  assert(!p.get('#lms-mail-result').textContent.includes('Đã gửi'));
  await p.submit();assert.equal(p.calls.filter(c=>c.action==='mail_test').length,1);
  const sent=p.calls.find(c=>c.action==='mail_test');
  assert.equal(sent.options.headers['X-CSRF-Token'],'verified-csrf');assert.equal(sent.options.timeoutMs,90000);
  assert.deepEqual(JSON.parse(sent.options.body),{recipient:'owner@example.test'});
  p.release();await pending;
  assert.equal(p.get('#lms-mail-result').textContent,'Đã gửi qua SMTP; vui lòng kiểm tra hộp thư và thư rác');
  assert.equal(p.get('#lms-mail-send').disabled,false);
  p.hold(false);p.failure(Object.assign(new Error('SMTP từ chối xác thực.'),{status:502}));
  await p.submit();assert.equal(p.get('#lms-mail-result').textContent,'SMTP từ chối xác thực.');
  assert.equal(p.get('#lms-mail-recipient').value,' owner@example.test ');
  p.failure(new Error('Failed to fetch'));await p.submit();assert(p.get('#lms-mail-result').textContent.includes('không tự gửi lại'));
  assert(p.get('#lms-mail-result').textContent.includes('kiểm tra hộp thư'));
  p.failure(Object.assign(new Error('Cấu hình đã thay đổi'),{status:422,mail:{configured:false,message:'Chưa cấu hình email.',issues:['Thiếu cấu hình']}}));
  await p.submit();assert.equal(p.get('#lms-mail-send').disabled,true);assert.equal(p.get('#lms-mail-config').textContent,'Chưa cấu hình email.');
  p.configured(true);p.issue('<script>fixture</script>');await p.get('#lms-mail-refresh').handlers.click();
  assert.equal(p.get('#lms-mail-issues').children[0].textContent,'<script>fixture</script>');assert.equal(p.get('#lms-mail-send').disabled,false);
  p.events['lms:auth-change']({detail:{user:null}});
  assert.equal(p.get('#lms-mail').hidden,true);assert.equal(p.get('#lms-mail-recipient').value,'');
  assert.equal(p.get('#lms-mail-result').textContent,'');
  const expired=await page();expired.get('#lms-mail-recipient').value='owner@example.test';
  expired.failure(Object.assign(new Error('Expired session'),{status:401}));await expired.submit();
  assert.equal(expired.get('#lms-mail').hidden,true);
  console.log('PASS: three-admin UI gate, configuration/refresh, no automatic sends, destination validation, busy/double-click guard, CSRF, recipient-only POST, precise acceptance wording, error/retry retention, safe text rendering and logout/session revocation (simulated DOM).');
})().catch(error=>{console.error(error);process.exitCode=1;});
