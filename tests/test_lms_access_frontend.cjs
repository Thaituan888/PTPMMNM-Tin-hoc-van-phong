const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),flush=()=>new Promise(setImmediate);
class Node{
  constructor(){this.hidden=true;this.value='';this.children=[];this.handlers={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(event,callback){this.handlers[event]=callback;}
  setAttribute(key,value){this[key]=value;}
  focus(){this.focused=true;}
}
function dom(){const nodes=new Map();const get=s=>{if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s);};return {get,document:{createElement:()=>new Node(),getElementById:id=>get('#'+id)}};}
(async()=>{
  const d=dom(),calls=[],changed=[];let release=null,allow=true,held=true;
  const context={crypto:webcrypto,document:d.document,window:{confirm:()=>allow}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lms-access.js'),'utf8'),context);
  const controller=context.window.THVP_LMS_ACCESS.create({querySelector:d.get},{request:async(action,options)=>{
    calls.push({action,options});if(action==='session')return {csrf:'server-csrf'};
    if(held)await new Promise(resolve=>release=resolve);
    return {reference:'DK000001',access:{mail_state:'failed',mail_label:'SMTP chưa gửi được'}};
  }},async reference=>changed.push(reference),()=>{});
  const detail={registration:{reference:'DK000001'},revision:2,can_grant_access:true,access:null};
  controller.show(detail);assert.equal(d.get('#lms-access').hidden,false);
  allow=false;await d.get('#lms-access-grant').handlers.click();assert.equal(calls.length,0);
  allow=true;const first=d.get('#lms-access-grant').handlers.click();await flush();
  assert.equal(d.get('#lms-access-grant').disabled,true);await d.get('#lms-access-grant').handlers.click();
  assert.equal(calls.filter(c=>c.action==='admin_grant_access').length,1);
  const posted=calls.find(c=>c.action==='admin_grant_access');assert.equal(posted.options.headers['X-CSRF-Token'],'server-csrf');
  assert.deepEqual(JSON.parse(posted.options.body),{reference:'DK000001',version:2});
  release();await first;assert.deepEqual(changed,['DK000001']);assert.equal(d.get('#lms-access-message').textContent,'SMTP chưa gửi được');
  held=false;controller.show({...detail,can_grant_access:false,access:{username:'HVTEST',new_account:true,mail_state:'failed',mail_label:'Lỗi SMTP',can_retry:true,history:[]}});
  assert.equal(d.get('#lms-access-grant').hidden,true);assert.equal(d.get('#lms-access-retry').hidden,false);
  await d.get('#lms-access-retry').handlers.click();assert(calls.some(c=>c.action==='admin_access_mail_retry'));
  controller.show({...detail,can_grant_access:false,access:{username:'HVTEST',mail_state:'sent',mail_label:'Đã gửi',can_retry:false,can_reissue:true,history:[]}});
  assert.equal(d.get('#lms-access-reissue').hidden,false);
  allow=false;const countBefore=calls.length;await d.get('#lms-access-reissue').handlers.click();assert.equal(calls.length,countBefore);
  allow=true;await d.get('#lms-access-reissue').handlers.click();
  assert(calls.some(c=>c.action==='admin_reissue_credentials'&&JSON.parse(c.options.body).reference==='DK000001'));
  controller.reset();assert.equal(d.get('#lms-access').hidden,true);assert.equal(d.get('#lms-access-info').textContent,'');

  async function studentPage(user,classesMode=false,search=''){
    const p=dom(),requests=[],redirects=[],events={};
    p.document.getElementById=id=>id==='lms-student-login'?(classesMode?null:{querySelector:p.get}):id==='lms-student-classes'?(classesMode?{querySelector:p.get}:null):p.get('#'+id);
    const api={request:async(action,options)=>{
      requests.push({action,options});if(action==='session')return {csrf:'csrf'};if(action==='auth_user')return {user};
      if(action==='auth_login')return {user:{role:'student',must_change_password:true}};
      if(action==='student_change_password')return {user:{role:'student',must_change_password:false}};
      if(action==='student_classes')return {classes:[{code:'CB-01',course_name:'Khóa thử',teacher:'Giáo viên',days:'Thứ 2',time:'19:00–21:00',message:'Nội dung lớp học đang được cập nhật.'}]};
      if(action==='class_certificates')return {certificates:[]};
      if(action==='learning_classes')return {can_edit:false,classes:[{code:'CB-01',course_name:'Khóa thử',teacher:'Giáo viên',days:'Thứ 2',time:'19:00–21:00'}]};
      throw new Error('Unexpected API');
    }};
    const c={TextEncoder,URLSearchParams,document:p.document,window:{THVP_LMS_API:api,addEventListener:(name,fn)=>events[name]=fn,location:{search,replace:url=>redirects.push(url),assign:url=>redirects.push(url)}}};
    await vm.runInNewContext(fs.readFileSync(path.join(root,classesMode?'lms-class.js':'lms-student.js'),'utf8'),c);
    return {...p,requests,redirects,events};
  }
  const login=await studentPage(null);assert.equal(login.get('#lms-student-login-form').hidden,false);
  login.get('#lms-student-username').value='HVTEST';login.get('#lms-student-password').value='temporary fixture';
  await login.get('#lms-student-login-form').handlers.submit({preventDefault(){}});
  assert.equal(login.get('#lms-student-password-form').hidden,false);assert.equal(login.redirects.length,0);
  login.get('#lms-student-new-password').value='new password fixture';login.get('#lms-student-repeat-password').value='different';
  await login.get('#lms-student-password-form').handlers.submit({preventDefault(){}});assert(!login.requests.some(c=>c.action==='student_change_password'));
  login.get('#lms-student-repeat-password').value='new password fixture';
  await login.get('#lms-student-password-form').handlers.submit({preventDefault(){}});
  assert.equal(login.redirects[0],'lop-hoc-cua-toi.html');assert.equal(login.get('#lms-student-current-password').value,'');
  const change=login.requests.find(c=>c.action==='student_change_password');assert.equal(change.options.headers['X-CSRF-Token'],'csrf');
  const limited=await studentPage({role:'student',must_change_password:true},true);assert.equal(limited.redirects[0],'dang-nhap-hoc-sinh.html');
  assert(!limited.requests.some(c=>c.action==='learning_classes'));
  const mine=await studentPage({role:'student',must_change_password:false},true);
  assert.equal(mine.get('#lms-student-class-list').children.length,1);
  assert.equal(mine.get('#lms-student-class-list').children[0].children[3].textContent,'Mở lớp');
  mine.events['lms:auth-change']({detail:{user:null}});assert.equal(mine.get('#lms-student-class-list').children.length,0);
  const admin=await studentPage({role:'admin'});assert.equal(admin.redirects[0],'quan-ly-dang-ky.html');
  const portal=await studentPage({role:'admin'},false,'?nguon=khoa-hoc');
  assert.equal(portal.redirects.length,0);assert.equal(portal.get('#lms-student-login-form').hidden,false);
  portal.get('#lms-student-username').value='HVTEST';portal.get('#lms-student-password').value='temporary fixture';
  await portal.get('#lms-student-login-form').handlers.submit({preventDefault(){}});
  assert.equal(JSON.parse(portal.requests.find(c=>c.action==='auth_login').options.body).expected_role,'student');
  assert.equal(portal.get('#lms-student-password-form').hidden,false);
  portal.get('#lms-student-new-password').value='new password fixture';portal.get('#lms-student-repeat-password').value='new password fixture';
  await portal.get('#lms-student-password-form').handlers.submit({preventDefault(){}});
  assert.equal(portal.redirects[0],'khoa-hoc-lms.html#khoa-hoc-hoc-sinh');
  const signedIn=await studentPage({role:'student',must_change_password:false},false,'?nguon=khoa-hoc');
  assert.equal(signedIn.redirects[0],'khoa-hoc-lms.html#khoa-hoc-hoc-sinh');
  const optional=await studentPage({role:'student',must_change_password:false},false,'?doi-mat-khau=1');
  assert.equal(optional.redirects.length,0);assert.equal(optional.get('#lms-student-password-form').hidden,false);
  assert.equal(optional.get('#lms-student-change-skip').hidden,false);
  optional.get('#lms-student-current-password').value='current fixture password';
  optional.get('#lms-student-new-password').value='changed fixture password';optional.get('#lms-student-repeat-password').value='changed fixture password';
  await optional.get('#lms-student-password-form').handlers.submit({preventDefault(){}});
  assert.equal(optional.redirects[0],'lop-hoc-cua-toi.html');
  console.log('PASS: per-profile grant/retry UI, CSRF and busy guard, no password in admin payload/view, temporary-password login/change gates, mismatch validation, student class rendering and admin routing (simulated DOM).');
})().catch(error=>{console.error(error);process.exitCode=1;});
