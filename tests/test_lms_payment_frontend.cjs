const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../lms-payment.js'),'utf8');
const start = Date.now();
const record = {reference:'DK000123',status:'pending_payment',expires_at:new Date(start+5000).toISOString()};
const base = {reference:record.reference,eligible:true,configured:true,status:'pending_payment',
  expires_at:record.expires_at,server_time_ms:start,amount_vnd:1500000,transfer_content:'CB-01 DK000123',
  bank:{bank_name:'Test only',bank_bin:'970422',account_name:'TEST ONLY',account_number:'000000000000'},
  qr_payload:'test-payload',message:'Vui lòng chuyển đúng số tiền và giữ nguyên nội dung chuyển khoản.'};
function setup() {
  const nodes=new Map(),timers=new Map(),events={},calls=[],copies=[],downloads=[];
  let now=0,failQR=false,result={...base};
  class Node {
    constructor(){this.hidden=true;this.value='';this.attrs={};this.handlers={};}
    replaceChildren(...children){this.children=children;}
    removeAttribute(k){delete this[k];}
    addEventListener(k,fn){this.handlers[k]=fn;}
    click(){downloads.push({href:this.href,filename:this.download});}
    select(){this.selected=true;}
  }
  const get=s=>{if(!nodes.has(s))nodes.set(s,new Node());return nodes.get(s);};
  const context=vm.createContext({window:{addEventListener:(k,fn)=>events[k]=fn,THVP_LMS_QR:{png:()=>{
    if(failQR)throw new Error('Simulated canvas error');return 'data:image/png;base64,dGVzdA==';
  }}},document:{createElement:()=>new Node()},performance:{now:()=>now},
    navigator:{clipboard:{writeText:async text=>copies.push(text)}},
    setInterval:fn=>{timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id)});
  vm.runInContext(code,context);
  const api={request:async(action,options)=>{calls.push({action,options});return {payment:result};}};
  const controller=context.window.THVP_LMS_PAYMENT.create({querySelector:get},api,'csrf','CB-01');
  return {get,controller,calls,copies,downloads,events,setResult:r=>result=r,setFail:v=>failQR=v,
    advance:ms=>{now+=ms;for(const fn of timers.values())fn();}};
}
(async()=>{
  const p=setup();await p.controller.show(record);
  assert.equal(p.get('#lms-payment-details').hidden,false);
  assert.equal(p.get('#lms-qr-image').hidden,false);
  assert.equal(p.get('#lms-amount').value,'1500000');
  assert.equal(p.get('#lms-countdown').textContent,'Thời gian giữ chỗ còn lại: 0 phút 5 giây');
  for(const id of ['#lms-account-copy','#lms-amount-copy','#lms-copy'])await p.get(id).handlers.click();
  assert.deepEqual(p.copies,['000000000000','1500000','CB-01 DK000123']);
  await p.get('#lms-qr-download').handlers.click();
  assert.equal(p.downloads.length,1);assert.equal(p.downloads[0].filename,'DK000123-vietqr.png');
  assert(p.calls.every(c=>c.action==='payment&class_code=CB-01'));
  assert(p.calls.every(c=>c.options.body==='{}' && c.options.headers['X-CSRF-Token']==='csrf'));
  p.advance(5001);
  assert.equal(p.get('#lms-payment-details').hidden,true);
  assert.equal(p.get('#lms-qr-image').src,undefined);
  assert.equal(p.get('#lms-transfer').value,'');
  assert(p.get('#lms-payment-message').textContent.includes('hết hạn'));
  await p.get('#lms-copy').handlers.click();assert.equal(p.copies.length,3);
  const failed=setup();failed.setFail(true);await failed.controller.show(record);
  assert.equal(failed.get('#lms-payment-details').hidden,false);
  assert.equal(failed.get('#lms-qr-image').hidden,true);
  assert.equal(failed.get('#lms-transfer').value,'CB-01 DK000123');
  assert(failed.get('#lms-qr-error').textContent.includes('thủ công'));
  failed.setFail(false);await failed.get('#lms-qr-retry').handlers.click();
  assert.equal(failed.get('#lms-qr-image').hidden,false);
  const missing=setup();missing.setResult({...base,configured:false,qr_payload:undefined,message:'Thông tin thanh toán chưa được cấu hình'});
  await missing.controller.show(record);assert.equal(missing.get('#lms-payment-details').hidden,true);
  assert.equal(missing.get('#lms-qr-image').src,undefined);
  const expired=setup();expired.setResult({...base,eligible:false,status:'expired'});
  await expired.controller.show(record);assert.equal(expired.get('#lms-payment-details').hidden,true);
  assert.equal(expired.get('#lms-qr-image').src,undefined);
  const review=setup();review.setResult({...base,eligible:false,status:'pending_review',expires_at:new Date(start-1).toISOString()});
  await review.controller.show(record);
  assert.equal(review.get('#lms-new-request').hidden,true);
  assert(!review.get('#lms-countdown').textContent.includes('hết hạn'));
  console.log('PASS: payment-only requests, configured/unconfigured UI, three copy actions, reauthorized PNG download, manual fallback + retry, countdown expiration clears QR/instructions, pending review stays distinct from expiration.');
})().catch(()=>{console.error('FAIL: payment UI assertions');process.exitCode=1;});
