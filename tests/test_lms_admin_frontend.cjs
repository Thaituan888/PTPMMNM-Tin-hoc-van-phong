const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
const flush=()=>new Promise(setImmediate);
class Node {
  constructor(){this.hidden=true;this.value='';this.children=[];this.handlers={};this.dataset={};}
  append(...children){this.children.push(...children);}
  after(...nodes){this.siblings=nodes;}
  remove(){this.removed=true;}
  replaceChildren(...children){this.children=children;}
  addEventListener(key,fn){this.handlers[key]=fn;}
  setAttribute(key,value){this[key]=value;}
  scrollIntoView(){this.scrolled=true;}
  focus(){this.focused=true;}
}
function setup(){
  const nodes=new Map(),events={},calls=[],redirects=[];
  const get=s=>{if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s);};
  const context={URLSearchParams,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    document:{getElementById:id=>get('#'+id),createElement:()=>new Node(),createTextNode:text=>({textContent:text})},
    localStorage:{clear(){throw new Error('Storage must stay intact');}},
    window:{location:{assign:p=>redirects.push(p),replace:p=>redirects.push(p)},addEventListener:(k,fn)=>events[k]=fn,
      dispatchEvent:event=>events[event.type]?.(event),matchMedia:()=>({matches:false})}};
  get('#lms-admin').querySelector=get;get('#lms-admin-login').querySelector=get;
  return {get,events,calls,redirects,context};
}
async function management(role='admin'){
  const p=setup();
  let approved=false;
  p.context.crypto=webcrypto;p.context.window.confirm=()=>true;
  const item={reference:'DK000001',fullname:'<script>test only</script>',class_code:'CB-01',course_name:'Tin học cơ bản',
    fee_vnd:1500000,transfer_content:'CB-01 DK000001',created_at:new Date().toISOString(),last_evidence_at:null,status_label:'Chưa xác nhận thanh toán'};
  p.context.window.THVP_LMS_API={request:async (action,options)=>{
    p.calls.push(action);
    if(action==='auth_user')return {user:role?{id:1,role,fullname:'Test admin'}:null};
    if(action==='session')return {csrf:'server-csrf'};
    if(action==='admin_review'){
      assert.equal(options.headers['X-CSRF-Token'],'server-csrf');assert.equal(JSON.parse(options.body).version,1);
      approved=true;return {registration:{reference:item.reference,status_label:'Đã duyệt — chờ cấp quyền học'}};
    }
    if(action==='classes')return {classes:[{code:'CB-01',course_name:'Tin học cơ bản'}]};
    if(action.startsWith('admin_registrations&')){
      const params=new URLSearchParams(action.split('&').slice(1).join('&'));
      return {items:[{...item,status_label:approved?'Đã duyệt — chờ cấp quyền học':item.status_label}],page:Number(params.get('page')),pages:2,total:21};
    }
    if(action.startsWith('admin_registration&'))return {revision:approved?2:1,actions:{approve:!approved,request_more:!approved,reject:!approved},history:[],registration:{...item,phone:'0901234567',email:'fixture@example.test',
      class:{code:item.class_code,course_name:item.course_name,teacher:'Teacher fixture',days:'Thứ 2, thứ 4',time:'19:00–21:00'},
      expires_at:new Date().toISOString(),status_label:approved?'Đã duyệt — chờ cấp quyền học':item.status_label},created_at:item.created_at,hold:{label:'Đang giữ chỗ trong thời hạn đăng ký'},payment_snapshot:null,evidence:[]};
    throw new Error('Unexpected action');
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lms-review.js'),'utf8'),p.context);
  await vm.runInNewContext(fs.readFileSync(path.join(root,'lms-admin.js'),'utf8'),p.context);
  return p;
}
(async()=>{
  const guest=await management(null);assert.equal(guest.get('#lms-admin-content').hidden,true);assert(!guest.calls.some(s=>s.startsWith('admin_registrations')));
  const student=await management('student');assert.equal(student.get('#lms-admin-content').hidden,true);
  const p=await management();assert.equal(p.get('#lms-admin-content').hidden,false);
  const row=p.get('#lms-admin-rows').children[0];
  assert.equal(row.children[0].children[1].textContent,'<script>test only</script>');
  await row.children[6].children[0].handlers.click();
  assert.equal(p.get('#lms-admin-detail').hidden,false);assert.equal(p.get('#lms-admin-no-images').hidden,false);
  p.get('#lms-review-approve').handlers.click();p.get('#lms-review-amount').value='1500000';
  p.get('#lms-review-transaction').value='BANK-TEST';p.get('#lms-review-verified').checked=true;
  await p.get('#lms-review-form').handlers.submit({preventDefault(){}});
  assert.equal(p.get('#lms-admin-rows').children[0].children[5].children[0].textContent,'Đã duyệt — chờ cấp quyền học');
  assert.equal(p.get('#lms-review-approve').disabled,true);assert.equal(p.get('#lms-admin-close').disabled,false);
  p.get('#lms-admin-next').handlers.click();await flush();assert(p.calls.some(s=>s.includes('page=2')));
  p.get('#lms-admin-class').value='CB-01';p.get('#lms-admin-status').value='late_review';
  p.get('#lms-admin-filters').handlers.submit({preventDefault(){}});await flush();
  assert(p.calls.some(s=>s.includes('class_code=CB-01')&&s.includes('status=late_review')&&s.includes('page=1')));
  p.events['lms:auth-change']({detail:{user:null}});
  assert.equal(p.get('#lms-admin-content').hidden,true);assert.equal(p.get('#lms-admin-rows').children.length,0);
  assert.equal(p.get('#lms-admin-images').children.length,0);

  const login=setup();let allow=false;
  login.context.window.THVP_LMS_API={request:async(action,options)=>{
    login.calls.push({action,options});
    if(action==='session')return {csrf:'csrf'};
    if(action==='auth_user')return {user:null};
    if(action==='auth_login'){
      if(!allow)throw Object.assign(new Error('Login rejected'),{status:401});
      return {user:{role:'admin'}};
    }
    throw new Error('Unexpected action');
  }};
  await vm.runInNewContext(fs.readFileSync(path.join(root,'lms-admin-login.js'),'utf8'),login.context);
  login.get('#lms-login-username').value='Giaovien1';login.get('#lms-login-password').value='test secret';
  await login.get('form').handlers.submit({preventDefault(){}});assert.equal(login.redirects.length,0);
  assert.equal(login.get('#lms-login-submit').disabled,false);assert.equal(login.get('#lms-login-message').textContent,'Login rejected');
  allow=true;await login.get('form').handlers.submit({preventDefault(){}});
  assert.equal(login.redirects[0],'quan-ly-dang-ky.html');assert.equal(login.get('#lms-login-password').value,'');
  const posted=login.calls.find(c=>c.action==='auth_login');assert.equal(posted.options.headers['X-CSRF-Token'],'csrf');
  assert.equal(Object.keys(JSON.parse(posted.options.body)).sort().join(','),'password,username');

  const teacher=setup();teacher.context.window.location.search='?nguon=khoa-hoc';
  teacher.context.window.THVP_LMS_API={request:async(action,options)=>{
    teacher.calls.push({action,options});if(action==='session')return {csrf:'csrf'};
    if(action==='auth_user')return {user:{role:'student'}};
    if(action==='auth_login')return {user:{role:'admin'}};
    throw new Error('Unexpected API');
  }};
  await vm.runInNewContext(fs.readFileSync(path.join(root,'lms-admin-login.js'),'utf8'),teacher.context);
  assert.equal(teacher.redirects.length,0);assert.equal(teacher.get('h1').textContent,'Đăng nhập giáo viên');
  teacher.get('#lms-login-username').value='Giaovien1';teacher.get('#lms-login-password').value='fixture';
  await teacher.get('form').handlers.submit({preventDefault(){}});
  assert.equal(JSON.parse(teacher.calls.find(c=>c.action==='auth_login').options.body).expected_role,'admin');
  assert.equal(teacher.redirects[0],'khoa-hoc-lms.html#khoa-hoc-giao-vien');

  const account=setup(),bar=new Node(),header=new Node();
  account.context.document.querySelectorAll=s=>s==='[data-lms-account]'?[bar]:[header];
  account.context.window.THVP_LMS_API={request:async(action,options)=>{
    account.calls.push({action,options});
    if(action==='session')return {csrf:'csrf'};
    if(action==='auth_user')return {user:{role:'admin',fullname:'Teacher fixture'}};
    if(action==='auth_logout')return {user:null};
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lms-account.js'),'utf8'),account.context);await flush();
  assert.equal(header.hidden,true);assert.equal(bar.hidden,true);assert.equal(bar.children.length,0);
  const menu=header.siblings[0];assert.equal(menu.children[0].textContent,'Tài khoản');
  assert.equal(menu.children[1].children.filter(n=>n.textContent==='Quản lý đăng ký').length,1);
  await menu.children[1].children.find(n=>n.textContent==='Đăng xuất').handlers.click();
  assert.equal(menu.removed,true);assert.equal(header.hidden,false);
  assert.equal(header.href,'khoa-hoc-lms.html#khoa-hoc');
  assert(account.calls.some(c=>c.action==='auth_logout'&&c.options.headers['X-CSRF-Token']==='csrf'));
  console.log('PASS: server-session UI gate, safe text rendering, detail/no-image display, class/status pagination, logout clears private view, login error/success and CSRF; no localStorage role or password persistence.');
})().catch(()=>{console.error('FAIL: admin frontend assertions');process.exitCode=1;});
