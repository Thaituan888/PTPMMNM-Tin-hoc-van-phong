const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
process.chdir(path.join(__dirname, '..'));
const rows = JSON.parse(fs.readFileSync('lms-server/classes.json', 'utf8')).map(r => ({...r,
  fee_vnd: 1500000, capacity: 99, remaining: 99, availability: 'open'}));
const record = {reference: 'DK000123', class: rows[0], fullname: 'Nguyễn Văn Thử',
  phone: '0901234567', email: 'learner@example.test', fee_vnd: 1500000,
  transfer_content: 'CB-01 DK000123', expires_at: new Date(Date.now() + 1800000).toISOString(), status: 'pending_payment'};

async function page({saved = null, closed = false, create, newEntry = false} = {}) {
  const nodes = new Map();
  class Node {
    constructor() { this.hidden = true; this.value = ''; this.children = []; this.attrs = {}; this.handlers = {};
      this.validity = {typeMismatch: false}; }
    querySelector(s) { return get(s); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(k,v) { this.attrs[k] = v; }
    removeAttribute(k) { delete this.attrs[k]; }
    getAttribute(k) { return this.attrs[k]; }
    addEventListener(k,v) { this.handlers[k] = v; }
    focus() { this.focused = true; }
    select() { this.selected = true; }
  }
  const get = s => { if (!nodes.has(s)) nodes.set(s, new Node()); return nodes.get(s); };
  const calls = [];
  const api = {availability: row => row.availability === 'open' ? `Còn nhận ${row.remaining} học sinh` : 'Tạm hết chỗ',
    request: async (action, options) => {
      calls.push({action, options});
      if (action === 'session') return {csrf: 'test-csrf'};
      if (action === 'classes') return {classes: rows.map(r => closed ? {...r, availability: 'held_full'} : r)};
      if (action.startsWith('registration&')) {
        if (saved) return {registration: saved};
        throw Object.assign(new Error('No access cookie'), {status: 404});
      }
      if (action === 'register') return create ? create() : {registration: record};
      if (action.startsWith('payment&')) return {payment: {reference: record.reference, eligible: true, configured: false,
        expires_at: record.expires_at, server_time: new Date().toISOString(), status: 'pending_payment', message: 'Thông tin thanh toán chưa được cấu hình'}};
      if (action.startsWith('evidence&')) return {evidence:[],registration:saved || record,can_submit:true,
        upload:{upload_available:true,max_bytes:5242880,configuration_error:null}};
      throw new Error('Unexpected API call');
    }};
  const storage = new Map();
  let copied;
  const window = {location: {search: '?lop=CB-01'+(newEntry?'&dang-ky=moi':'')}, history:{replaceState(){}}, THVP_LMS_API: api, addEventListener(){}};
  const context = vm.createContext({window, URLSearchParams, crypto: webcrypto, performance,
    setInterval: ()=>1, clearInterval(){},
    navigator: {clipboard: {writeText: async text => {copied = text;}}},
    sessionStorage: {getItem: k=>storage.get(k), setItem: (k,v)=>storage.set(k,v)},
    document: {getElementById: id=>get('#'+id), createElement: ()=>new Node()}});
  vm.runInContext(fs.readFileSync('lms-data.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('lms-payment.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('lms-evidence.js', 'utf8'), context);
  for (const r of rows) {
    const client = window.THVP_LMS_DATA.classes[r.code];
    assert.equal(client.teacher, r.teacher); assert.equal(client.days, r.days); assert.equal(client.courseName, r.course_name);
    assert.equal(client.fee,r.code.startsWith('NC-')?'2.500.000đ/khóa':'1.500.000đ/khóa');
  }
  await vm.runInContext(fs.readFileSync('dang-ky-khoa-hoc.js', 'utf8'), context);
  return {get, calls, storage, copied:()=>copied};
}

(async () => {
  const p = await page();
  assert.equal(p.get('#lms-create').disabled, false);
  assert(p.storage.has('thvp_lms_request_CB-01'));
  p.get('#lms-name').value = 'Nguyễn Văn Thử';
  p.get('#lms-phone').value = '0901234567';
  p.get('#lms-email').value = 'learner@example.test';
  p.get('#lms-learner-form').handlers.submit({preventDefault(){}});
  assert.equal(p.get('#lms-confirmation').hidden, false);
  p.get('#lms-edit').handlers.click();
  assert.equal(p.get('#lms-name').value, 'Nguyễn Văn Thử');
  p.get('#lms-learner-form').handlers.submit({preventDefault(){}});
  await p.get('#lms-create').handlers.click();
  assert.equal(p.calls.filter(c=>c.action === 'register').length, 1);
  const payload = JSON.parse(p.calls.find(c=>c.action === 'register').options.body);
  assert.equal(Object.keys(payload).sort().join(','), 'class_code,email,fullname,phone');
  assert.equal(p.get('#lms-saved').hidden, false);
  assert.equal(p.get('#lms-transfer').value, '');
  await p.get('#lms-copy').handlers.click(); assert.equal(p.copied(), undefined);
  assert.equal(p.get('#lms-payment-details').hidden, true);
  const reload = await page({saved: record});
  assert.equal(reload.get('#lms-saved').hidden, false);
  assert.equal(reload.get('#lms-restored-notice').hidden, false);
  assert(!reload.calls.some(c=>c.action === 'register'));
  const fresh=await page({saved:record,newEntry:true});
  assert.equal(fresh.get('#lms-saved').hidden,true);
  assert.equal(fresh.get('#lms-existing-record').hidden,false);
  assert.equal(fresh.get('#lms-name').value,'');assert.equal(fresh.get('#lms-email').value,'');
  assert(!fresh.calls.some(c=>c.action.startsWith('payment&')||c.action.startsWith('evidence&')||c.action==='register'));
  assert(fresh.storage.has('thvp_lms_new_request_CB-01'));
  await fresh.get('#lms-resume-record').handlers.click();
  assert.equal(fresh.get('#lms-saved').hidden,false);
  assert(fresh.calls.some(c=>c.action.startsWith('evidence&')));
  const full = await page({closed: true}); assert.equal(full.get('#lms-create').disabled, true);
  let finish;
  const delayed = await page({create: () => new Promise(resolve => {finish = resolve;})});
  const first = delayed.get('#lms-create').handlers.click();
  await delayed.get('#lms-create').handlers.click();
  assert.equal(delayed.calls.filter(c=>c.action === 'register').length, 1);
  finish({registration: record}); await first;
  const invalid = await page({create: () => {throw Object.assign(new Error('Validation'), {status: 422, fields: {email: 'Email không hợp lệ'}});}});
  await invalid.get('#lms-create').handlers.click();
  assert.equal(invalid.get('#lms-email-error').textContent, 'Email không hợp lệ');
  assert.equal(invalid.get('#lms-entry').hidden, false);
  const expired = await page({saved: {...record, status: 'expired'}});
  assert.equal(expired.get('#lms-new-request').hidden, false);
  expired.get('#lms-name').value='Thông tin cũ';expired.get('#lms-email').value='old@example.test';
  await expired.get('#lms-new-request').handlers.click();
  assert.equal(expired.get('#lms-name').value,'');assert.equal(expired.get('#lms-email').value,'');
  assert.equal(expired.get('#lms-entry').hidden,false);
  assert(!expired.calls.some(c=>c.action==='register'));
  console.log('PASS: server/client catalog agreement, confirmation/edit, authenticated create payload, CSRF/idempotency headers, double-click guard, restore via GET only, closed class, server validation, copy and expired state.');
})().catch(() => { console.error('FAIL: frontend assertion failed'); process.exitCode = 1; });
