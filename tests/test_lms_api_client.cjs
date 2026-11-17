const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
function client(fetch,protocol='http:'){
  const window={location:{protocol}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lms-api-client.js'),'utf8'),{window,fetch,AbortController,setTimeout,clearTimeout});
  return window.THVP_LMS_API;
}
(async()=>{
  let calls=0;
  await assert.rejects(client(()=>{calls++;},'file:').request('session'),e=>e.code==='LMS_FILE_URL');
  assert.equal(calls,0,'File pages never send credentials or other requests');
  await assert.rejects(client(async()=>{throw new TypeError('Failed to fetch');}).request('session'),e=>e.code==='LMS_NETWORK'&&!e.message.includes('Failed to fetch'));
  await assert.rejects(client(async()=>{throw Object.assign(new Error(),{name:'AbortError'});}).request('session'),e=>e.code==='LMS_TIMEOUT');
  await assert.rejects(client(async()=>({ok:true,json:async()=>{throw new SyntaxError('PHP source or static HTML');}})).request('session'),e=>e.code==='LMS_NOT_JSON');
  for(const data of [null,[],false,'static'])await assert.rejects(client(async()=>({ok:true,json:async()=>data})).request('session'),e=>e.code==='LMS_NOT_JSON');
  let seen;
  const success=client(async(url,options)=>{seen={url,options};return {ok:true,json:async()=>({csrf:'test-only'})};});
  assert.equal((await success.request('session')).csrf,'test-only');
  assert.equal(seen.url,'lms-api.php?action=session');assert.equal(seen.options.credentials,'same-origin');
  assert.equal(seen.options.cache,'no-store');assert(seen.options.signal instanceof AbortSignal);
  const rejection=client(async()=>({ok:false,status:403,json:async()=>({error:'Phiên không hợp lệ',code:'CSRF',fields:{email:'Lỗi thử'},mail:{state:'failed'}})}));
  await assert.rejects(rejection.request('auth_login'),e=>e.status===403&&e.code==='CSRF'&&e.fields.email==='Lỗi thử'&&e.mail.state==='failed');
  console.log('PASS: file URL blocked before fetch, network/timeout/static-server errors explained, same-origin credentials and existing API error details preserved.');
})().catch(error=>{console.error(error);process.exitCode=1;});
