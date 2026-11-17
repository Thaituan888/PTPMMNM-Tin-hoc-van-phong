const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../lms-evidence.js'),'utf8');
function page({late=false,failOnce=false,state={}}={}) {
  const nodes=new Map(),calls=[],revoked=[],saved=[],history=[];
  let record={reference:'DK000123',status:late?'expired':'pending_payment',status_label:late?'Đã hết hạn':'Chưa xác nhận thanh toán',...state};
  let rejectUpload=failOnce,finish=null;
  class Node {
    constructor(){this.hidden=true;this.files=[];this.handlers={};this.attrs={};this.children=[];}
    set value(v){this.currentValue=v;if(v==='')this.files=[];}
    get value(){return this.currentValue;}
    setAttribute(k,v){this.attrs[k]=v;}
    removeAttribute(k){delete this[k];}
    addEventListener(k,fn){this.handlers[k]=fn;}
    replaceChildren(...children){this.children=children;}
    append(...children){this.children.push(...children);}
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
  class Form {constructor(){this.fields=[];}append(k,v){this.fields.push([k,v]);}}
  const window={};
  const context=vm.createContext({window,crypto:webcrypto,FormData:Form,
    URL:{createObjectURL:file=>'blob:test-'+file.name,revokeObjectURL:url=>revoked.push(url)},
    document:{createElement:()=>new Node(),createTextNode:text=>({textContent:text})}});
  vm.runInContext(source,context);
  const api={request:async(action,options)=>{
    calls.push({action,options});
    if(action.startsWith('evidence&'))return {registration:record,evidence:[...history],can_submit:!['approved_waiting_access','rejected'].includes(record.status),
      upload:{upload_available:true,configuration_error:null}};
    if(action.startsWith('evidence_upload&')) {
      await new Promise(resolve=>finish=resolve);
      if(rejectUpload){rejectUpload=false;throw new Error('Mất kết nối thử nghiệm');}
      record={...record,status:late?'late_review':'pending_review',status_label:late?'Minh chứng nộp muộn — chờ kiểm tra':'Chờ đối chiếu thanh toán'};
      const item={id:history.length+1,mime:'image/png',submitted_at:new Date().toISOString(),timeliness:late?'late':'on_time',
        image_url:'lms-api.php?action=evidence_image&class_code=CB-01&id='+(history.length+1)};
      history.push(item);return {registration:record,evidence:item};
    }
    throw new Error('Unexpected endpoint');
  }};
  const controller=window.THVP_LMS_EVIDENCE.create({querySelector:get},api,'csrf','CB-01',async r=>saved.push(r));
  function choose(file){get('#lms-evidence-file').files=[file];get('#lms-evidence-file').handlers.change();}
  return {get,controller,record,calls,revoked,saved,history,choose,finish:()=>finish()};
}
(async()=>{
  const file={name:'receipt.png',type:'image/png',size:100};
  const p=page({failOnce:true});await p.controller.show(p.record);
  assert.equal(p.get('#lms-evidence').hidden,false);
  p.choose(file);
  assert.equal(p.get('#lms-evidence-file').files[0],file);
  assert.equal(p.get('#lms-evidence-preview').src,'blob:test-receipt.png');
  assert.equal(p.get('#lms-evidence-send').disabled,false);
  const first=p.get('#lms-evidence-send').handlers.click();
  assert.equal(p.get('#lms-evidence-send').disabled,true);
  assert(!p.get('#lms-evidence-status').textContent.includes('Đã lưu'));
  await p.get('#lms-evidence-send').handlers.click();
  assert.equal(p.calls.filter(c=>c.action.startsWith('evidence_upload')).length,1);
  p.finish();await first;
  assert.equal(p.get('#lms-evidence-preview').hidden,false);
  assert.equal(p.get('#lms-evidence-file').files[0],file);
  const firstCall=p.calls.find(c=>c.action.startsWith('evidence_upload'));
  assert.equal(firstCall.options.headers['X-CSRF-Token'],'csrf');
  assert.equal(firstCall.options.headers['X-LMS-Registration'],p.record.reference);
  assert.equal(firstCall.options.timeoutMs,60000);
  assert(!('Content-Type' in firstCall.options.headers));
  const retry=p.get('#lms-evidence-send').handlers.click();
  const latest=p.calls[p.calls.length-1];
  assert.equal(latest.options.headers['Idempotency-Key'],firstCall.options.headers['Idempotency-Key']);
  assert.equal(latest.options.body.fields[0][1],file);
  p.finish();await retry;
  assert.equal(p.history.length,1);assert.equal(p.saved[0].status,'pending_review');
  assert(p.get('#lms-evidence-status').textContent.includes('Đã lưu minh chứng'));
  assert.equal(p.get('#lms-evidence-preview').hidden,true);
  assert.equal(p.get('#lms-evidence-history').children.length,1);
  assert(p.revoked.includes('blob:test-receipt.png'));
  p.choose({name:'bad.svg',type:'image/svg+xml',size:20});assert.equal(p.get('#lms-evidence-send').disabled,true);
  p.choose({name:'large.png',type:'image/png',size:5242881});assert(p.get('#lms-evidence-status').textContent.includes('5 MB'));
  const late=page({late:true});await late.controller.show(late.record);
  assert(late.get('#lms-evidence-note').textContent.includes('không giữ thêm chỗ'));
  late.choose(file);const sendLate=late.get('#lms-evidence-send').handlers.click();late.finish();await sendLate;
  assert.equal(late.saved[0].status,'late_review');assert.equal(late.get('#lms-new-request').hidden,true);
  await late.get('#lms-evidence-refresh').handlers.click();assert.equal(late.get('#lms-evidence-history').children.length,1);
  const more=page({state:{status:'needs_more',public_reason:'<script>Ảnh chưa rõ</script>',hold_reserved:true}});
  await more.controller.show(more.record);
  assert.equal(more.get('#lms-public-reason').hidden,false);
  assert.equal(more.get('#lms-public-reason').textContent,'Thông tin từ giáo viên: <script>Ảnh chưa rõ</script>');
  assert.equal(more.get('#lms-evidence-file').disabled,false);
  const lateMore=page({state:{status:'needs_more',public_reason:'Cần kiểm tra riêng',hold_reserved:false}});
  await lateMore.controller.show(lateMore.record);assert(lateMore.get('#lms-evidence-note').textContent.includes('không giữ thêm chỗ'));
  for(const status of ['approved_waiting_access','rejected']){
    const final=page({state:{status,public_reason:status==='rejected'?'Lý do từ chối':null}});
    await final.controller.show(final.record);final.choose(file);
    assert.equal(final.get('#lms-evidence-file').disabled,true);assert.equal(final.get('#lms-evidence-send').disabled,true);
    assert(final.get('#lms-evidence-note').textContent.includes(status==='rejected'?'không có xác nhận hoàn tiền':'chờ cấp quyền học'));
  }
  console.log('PASS: file selection/preview, invalid type/size, busy guard, error retains File + idempotency key, acknowledged save only, history restore, late notice, object URL cleanup and private image links.');
})().catch(()=>{console.error('FAIL: evidence frontend assertions');process.exitCode=1;});
