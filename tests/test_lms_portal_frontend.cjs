const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),flush=()=>new Promise(setImmediate);
const classes=JSON.parse(fs.readFileSync(path.join(root,'lms-server/classes.json'),'utf8'));
class Node{
  constructor(id=''){this.id=id;this.hidden=false;this.children=[];this.handlers={};this.attrs={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  setAttribute(name,value){this.attrs[name]=value;}
  getAttribute(name){return this.attrs[name];}
  focus(){this.focused=true;}
}
async function page(response,hash='#khoa-hoc'){
  const nodes=new Map(),events={},calls=[];let handler=response;
  const get=s=>{if(!nodes.has(s))nodes.set(s,new Node(s.slice(1)));return nodes.get(s);};
  const tabs=[get('#lms-tab-intro'),get('#lms-tab-courses')],panels=[get('#lms-panel-intro'),get('#lms-panel-courses')];
  tabs.forEach((tab,i)=>tab.setAttribute('aria-controls',panels[i].id));
  const container=get('#lms');container.querySelector=get;container.querySelectorAll=s=>s==='[role="tab"]'?tabs:panels;
  const window={location:{hash,protocol:'http:'},history:{replaceState:(_a,_b,next)=>window.location.hash=next},addEventListener:(name,fn)=>events[name]=fn,
    THVP_LMS_API:{request:async action=>{calls.push(action);return handler(action);}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'lms.js'),'utf8'),{window,document:{getElementById:id=>get('#'+id),createElement:()=>new Node()}});
  await flush();return {get,tabs,panels,events,calls,window,setResponse:next=>handler=next};
}
(async()=>{
  const guest=await page(action=>{assert.equal(action,'auth_user');return {user:null};});
  assert.equal(guest.get('#lms-courses-picker').hidden,false);assert.equal(guest.get('#lms-courses-refresh').hidden,true);
  assert.equal(guest.get('#lms-courses-actions').children[0].href,'#gioi-thieu');
  const mine=classes.filter(row=>['CB-01','NC-01'].includes(row.code));
  const adminResponse=action=>action==='auth_user'?{user:{role:'admin'}}:{can_edit:true,classes:mine};
  for(const hash of ['#khoa-hoc','#khoa-hoc-giao-vien','#khoa-hoc-hoc-sinh']){
    const admin=await page(adminResponse,hash);
    assert.equal(admin.get('#lms-courses-picker').hidden,true);assert.equal(admin.get('#lms-courses-list').children.length,2);
    assert.equal(admin.get('#lms-courses-title').textContent,'Lớp tôi phụ trách');
    assert.deepEqual(admin.calls,['auth_user','learning_classes&scope=mine']);
    for(let i=0;i<mine.length;i++)assert.equal(admin.get('#lms-courses-list').children[i].children[4].href,'lop-hoc-cua-toi.html?lop='+mine[i].code);
    assert.equal(admin.get('#lms-courses-actions').children[0].href,'lop-hoc-cua-toi.html');
    admin.tabs[1].handlers.click();await flush();assert.equal(admin.get('#lms-courses-list').children.length,2);
  }
  const studentResponse=action=>action==='auth_user'?{user:{role:'student'}}:{can_edit:false,classes:[classes[0]]};
  const student=await page(studentResponse,'#khoa-hoc-giao-vien');
  assert.equal(student.get('#lms-courses-list').children.length,1);assert.equal(student.get('#lms-courses-title').textContent,'Lớp học của tôi');
  const pending=await page(action=>{if(action==='auth_user')return {user:{role:'student'}};throw Object.assign(new Error('Password required'),{status:423});});
  assert.equal(pending.get('#lms-courses-actions').children[0].textContent,'Đổi mật khẩu tạm');
  const failure=await page(()=>{throw new Error('Network fixture');});assert.equal(failure.get('#lms-courses-refresh').disabled,false);
  failure.setResponse(action=>action==='auth_user'?{user:{role:'student'}}:{can_edit:false,classes:[]});
  await failure.get('#lms-courses-refresh').handlers.click();assert(failure.get('#lms-courses-status').textContent.includes('chưa có lớp được ghi danh'));
  assert.equal(failure.get('#lms-courses-actions').children[0].href,'#gioi-thieu');
  const intro=await page(adminResponse,'');assert.equal(intro.calls.length,0);
  intro.tabs[0].handlers.keydown({key:'ArrowRight',preventDefault(){}});await flush();
  assert.equal(intro.window.location.hash,'#khoa-hoc');assert.equal(intro.get('#lms-courses-list').children.length,2);
  intro.tabs[0].handlers.click();assert.equal(intro.panels[0].hidden,false);
  let release;const stale=await page(action=>action==='auth_user'?{user:{role:'admin'}}:new Promise(resolve=>release=resolve));
  stale.setResponse(()=>({user:null}));stale.events['lms:auth-change']({detail:{user:null}});await flush();
  release({can_edit:true,classes});await flush();assert.equal(stale.get('#lms-courses-list').children.length,0);assert.equal(stale.get('#lms-courses-picker').hidden,false);
  const xss=await page(action=>action==='auth_user'?{user:{role:'student'}}:{can_edit:false,classes:[{...classes[0],course_name:'<script>fixture</script>'}]});
  assert.equal(xss.get('#lms-courses-list').children[0].children[1].textContent,'<script>fixture</script>');
  console.log('PASS: guest login choices/registration link; verified role auto-opens own classes on click/reload/forged hashes; no repeat role selection; error/password/empty states; keyboard tabs; stale logout response discarded; safe text.');
})().catch(error=>{console.error(error);process.exitCode=1;});
