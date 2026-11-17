const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../lms-review.js'),'utf8');
const flush=()=>new Promise(setImmediate);
function page(){
  class Node{
    constructor(){this.hidden=true;this.value='';this.checked=false;this.children=[];this.handlers={};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    addEventListener(key,fn){this.handlers[key]=fn;}
    setAttribute(key,value){this[key]=value;}
    focus(){this.focused=true;}
  }
  const nodes=new Map(),calls=[],confirmations=[],changed=[],denied=[];
  let confirm=true,resolve=null,reject=null,hold=false,failure=null;
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
  const window={confirm:text=>{confirmations.push(text);return confirm;}};
  const context={window,crypto:webcrypto,document:{createElement:()=>new Node()}};
  vm.runInNewContext(source,context);
  const api={request:async(action,options)=>{
    calls.push({action,options});
    if(action==='session')return {csrf:'server-csrf'};
    if(action==='admin_review'){
      if(hold)await new Promise((a,b)=>{resolve=a;reject=b;});
      if(failure)throw failure;
      return {registration:{reference:'DK000123',status:'approved_waiting_access',status_label:'Đã duyệt — chờ cấp quyền học'}};
    }
    throw new Error('Unexpected API');
  }};
  const controller=window.THVP_LMS_REVIEW.create({querySelector:get},api,async reference=>changed.push(reference),error=>denied.push(error.status));
  const detail={registration:{reference:'DK000123',fee_vnd:1500000,transfer_content:'NC-01 DK000123'},revision:3,
    actions:{approve:true,request_more:true,reject:true},history:[{decision:'request_more',actor_name:'Test admin',actor_username:'Giaovien2',
      created_at:new Date().toISOString(),before_status:'pending_review',after_status:'needs_more',public_reason:'<script>fixture</script>',
      notes:'Internal fixture',received_vnd:null}]};
  function approval(){
    get('#lms-review-approve').handlers.click();get('#lms-review-amount').value='1500000';
    get('#lms-review-transaction').value='BANK-123';get('#lms-review-verified').checked=true;
  }
  const submit=()=>get('#lms-review-form').handlers.submit({preventDefault(){}});
  controller.show(detail);
  return {get,calls,confirmations,changed,denied,controller,detail,approval,submit,
    confirm:value=>confirm=value,hold:value=>hold=value,resolve:()=>resolve(),reject:error=>reject(error),failure:value=>failure=value};
}
(async()=>{
  const p=page();
  assert.equal(p.get('#lms-review-actions').hidden,false);
  assert.equal(p.get('#lms-review-history').children[0].children[3].textContent,'Lý do gửi người đăng ký: <script>fixture</script>');
  p.approval();assert(p.get('#lms-review-snapshot').textContent.includes('NC-01 DK000123'));
  p.get('#lms-review-verified').checked=false;await p.submit();assert.equal(p.calls.length,0);
  p.get('#lms-review-verified').checked=true;p.hold(true);const first=p.submit();await flush();
  assert(p.controller.isBusy());assert.equal(p.get('#lms-review-submit').disabled,true);assert.equal(p.get('#lms-admin-close').disabled,true);
  await p.submit();assert.equal(p.calls.filter(c=>c.action==='admin_review').length,1);
  const posted=p.calls.find(c=>c.action==='admin_review');const payload=JSON.parse(posted.options.body);
  assert.equal(payload.version,3);assert(!('received_vnd' in payload));assert(!('bank_transaction' in payload));assert.equal(payload.funds_verified,true);assert.equal(p.confirmations.length,0);
  assert.equal(posted.options.headers['X-CSRF-Token'],'server-csrf');assert.equal(posted.options.headers['Idempotency-Key'].length,64);
  p.resolve();await first;assert.deepEqual(p.changed,['DK000123']);assert(!p.controller.isBusy());

  const retry=page();retry.approval();retry.failure(new Error('Response lost fixture'));
  await retry.submit();const firstKey=retry.calls.find(c=>c.action==='admin_review').options.headers['Idempotency-Key'];
  assert.equal(retry.get('#lms-review-transaction').value,'BANK-123');assert.equal(retry.get('#lms-review-verified').checked,true);
  retry.failure(null);await retry.submit();
  assert.equal(retry.calls.filter(c=>c.action==='admin_review')[1].options.headers['Idempotency-Key'],firstKey);
  assert.equal(retry.changed.length,1);

  const stale=page();stale.approval();stale.failure(Object.assign(new Error('Changed fixture'),{status:409}));
  await stale.submit();assert.equal(stale.changed.length,0);assert.equal(stale.get('#lms-review-approve').disabled,true);
  assert(stale.get('#lms-review-message').textContent.includes('Xem chi tiết'));
  stale.controller.show({...stale.detail,revision:4,actions:{approve:false,reject:false,request_more:false}});
  assert.equal(stale.get('#lms-review-reject').disabled,true);

  const more=page();more.get('#lms-review-request_more').handlers.click();
  assert.equal(more.get('#lms-review-payment-fields').hidden,true);assert.equal(more.get('#lms-review-reason').required,true);
  await more.submit();assert.equal(more.calls.length,0);
  more.get('#lms-review-reason').value=' Bổ sung ảnh rõ hơn ';more.get('#lms-review-notes').value='Private note fixture';
  await more.submit();assert.equal(more.confirmations.length,0);
  const body=JSON.parse(more.calls.find(c=>c.action==='admin_review').options.body);
  assert.equal(body.reason,'Bổ sung ảnh rõ hơn');assert(!('notes' in body));assert(!('funds_verified' in body));
  const rejected=page();rejected.get('#lms-review-reject').handlers.click();rejected.get('#lms-review-reason').value='Sai hồ sơ';
  rejected.confirm(false);await rejected.submit();assert.equal(rejected.calls.length,0);
  assert(rejected.confirmations[0].includes('không hoàn tiền'));
  rejected.confirm(true);rejected.failure(Object.assign(new Error('Forbidden fixture'),{status:403}));await rejected.submit();assert.deepEqual(rejected.denied,[403]);
  rejected.controller.reset();assert.equal(rejected.get('#lms-review-history').children.length,0);
  assert.equal(rejected.get('#lms-review-reason').value,'');
  console.log('PASS: decision forms, saved fee/reference, public reason/internal notes, required verification/reason, approve/reject confirmations, busy/double-click guard, CSRF + revision, retry key preservation, stale-decision lock, auth errors and private-view reset (simulated DOM).');
})().catch(error=>{console.error(error);process.exitCode=1;});
