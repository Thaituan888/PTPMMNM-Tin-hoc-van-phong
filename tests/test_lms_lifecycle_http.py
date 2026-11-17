"""Opening/completion/reopening and private certificates: isolated SQLite + TLS fake SMTP."""
import sys
sys.dont_write_bytecode=True
import base64,concurrent.futures,datetime,json,os,re,secrets,shutil,sqlite3,ssl,subprocess,tempfile,time,urllib.request,urllib.error
from email import policy
from email.parser import BytesParser
from pathlib import Path
from test_lms_http import ROOT,PHP,Client,body,port
from test_lms_evidence_http import upload
from test_lms_mail_http import FakeSMTP

def main():
    processes=[];db=None;smtp=None
    with tempfile.TemporaryDirectory(prefix='thvp-lifecycle-') as temporary:
        folder=Path(temporary);db_path=folder/'test.sqlite';mail_path=folder/'mail.json'
        openssl=shutil.which('openssl') or r'C:\msys64\ucrt64\bin\openssl.exe'
        def openssl_run(*args):subprocess.run([openssl,*args],cwd=folder,check=True,capture_output=True)
        openssl_run('req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=LIFECYCLE TEST CA','-keyout','ca.key','-out','ca.pem','-addext','basicConstraints=critical,CA:TRUE')
        openssl_run('req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout','smtp.key','-out','smtp.csr')
        (folder/'extensions.txt').write_text('subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',encoding='ascii')
        openssl_run('x509','-req','-in','smtp.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1','-out','smtp.pem','-extfile','extensions.txt')
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(folder/'smtp.pem',folder/'smtp.key')
        smtp_password=secrets.token_urlsafe(24);smtp=FakeSMTP(context,'fixture',smtp_password)
        bases=['http://127.0.0.1:'+str(port()) for _ in range(2)]
        config=dict(enabled=True,smtp_host='127.0.0.1',smtp_port=smtp.server_address[1],smtp_encryption='tls',smtp_username='fixture',smtp_password=smtp_password,from_email='sender@example.test',from_name='LMS thử nghiệm',base_url=bases[0],timeout_seconds=3)
        def mail_config(fail=False):mail_path.write_text(json.dumps({**config,'smtp_password':'wrong' if fail else smtp_password}),encoding='utf-8')
        mail_config();(folder/'bank.json').write_text(json.dumps(dict(bank_name='Fixture bank',bank_bin='970422',account_number='000000',account_name='TEST ONLY')),encoding='utf-8')
        env=dict(os.environ,THVP_LMS_DB=str(db_path),THVP_LMS_MAIL_CONFIG=str(mail_path),THVP_LMS_PAYMENT_CONFIG=str(folder/'bank.json'),THVP_LMS_EVIDENCE_DIR=str(folder/'images'))
        password=secrets.token_urlsafe(24)
        try:
            for base in bases:processes.append(subprocess.Popen([str(PHP),'-d','extension=gd','-d','display_errors=0','-d','openssl.cafile='+str(folder/'ca.pem'),'-S',base[7:],'-t',str(ROOT),str(ROOT/'router.php')],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
            for base in bases:
                for _ in range(100):
                    try:urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                    except OSError:time.sleep(.05)
            guest=Client(bases[0]);admins=[]
            for i in range(1,4):
                subprocess.run([str(PHP),str(ROOT/'lms-server/admin-accounts.php'),'set-password','Giaovien'+str(i)],input=json.dumps({'password':password}).encode(),cwd=ROOT,env=env,check=True,capture_output=True)
                c=Client(bases[(i-1)%2]);assert c.call('auth_login',dict(username='Giaovien'+str(i),password=password))[0]==200;admins.append(c)
            db=sqlite3.connect(db_path);db.execute('PRAGMA foreign_keys=ON')
            png=base64.b64decode(subprocess.check_output([str(PHP),'-d','extension=gd','-r','ob_start();imagepng(imagecreatetruecolor(8,8));echo base64_encode(ob_get_clean());'],cwd=ROOT))
            def plain(raw):return BytesParser(policy=policy.default).parsebytes(raw).get_body(preferencelist=('plain',)).get_content()
            def detail(owner,code,email,name):
                status,data=owner.call('register',{**body(code,email),'fullname':name});assert status==201,data
                record=data['registration'];ref=record['reference'];assert owner.call('payment&class_code='+code,{})[0]==200
                assert upload(owner,ref,code,png)[0]==201
                admin_detail=admins[0].call('admin_registration&reference='+ref)[1]
                assert admins[0].call('admin_review',dict(reference=ref,version=admin_detail['revision'],decision='approve',funds_verified=True))[0]==200
                return ref
            def grant(ref):
                d=admins[0].call('admin_registration&reference='+ref)[1]
                status,result=admins[0].call('admin_grant_access',dict(reference=ref,version=d['revision']));assert status==200,result
                return result
            def student(code,email,name):
                owner=Client(bases[0]);ref=detail(owner,code,email,name);grant(ref)
                text=plain(smtp.messages[-1]);username=re.search(r'Tên đăng nhập: ([^\r\n]+)',text).group(1);pw=re.search(r'Mật khẩu: (\S+)',text).group(1)
                c=Client(bases[1]);assert c.call('auth_login',dict(username=username,password=pw))[0]==200
                return c,owner,ref,username,pw
            a,owner_a,ref_a,name_a,pw_a=student('CB-01','a@example.test','Nguyễn Văn Kiểm Thử')
            b,owner_b,ref_b,name_b,pw_b=student('CB-01','b@example.test','Trần Thị Mẫu')
            other,_,_,_,_=student('NC-01','other@example.test','Học Sinh Khác Lớp')
            old_pending=Client(bases[0]);old_ref=detail(old_pending,'CB-01','pending@example.test','Hồ Sơ Đợt Cũ')
            smtp.messages.clear();original_users=db.execute('SELECT * FROM users ORDER BY id').fetchall()
            def life(code='CB-01'):return admins[0].call('class_lifecycle&class_code='+code)[1]
            def start_date(code):
                days=next(c['days'] for c in guest.call('classes')[1]['classes'] if c['code']==code).lower()
                date=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date()+datetime.timedelta(days=1)
                for _ in range(7):
                    label='chủ nhật' if date.weekday()==6 else 'thứ '+str(date.weekday()+2)
                    if label in days:return date.isoformat()
                    date+=datetime.timedelta(days=1)
            def transition(action,code='CB-01',admin=None,**extra):
                return (admin or admins[0]).call('class_transition',dict(class_code=code,version=life(code)['lifecycle']['revision'],action=action,**extra))
            request=dict(class_code='CB-01',version=0,action='start',start_date=start_date('CB-01'))
            assert guest.call('class_transition',request)[0]==401
            assert a.call('class_transition',{**request,'role':'admin'})[0]==403
            assert admins[0].call('class_transition',request,csrf='wrong')[0]==403
            assert transition('complete')[0]==409
            assert transition('start',start_date='2020-01-01')[0]==422
            key=secrets.token_hex(32);status,opened=admins[0].call('class_transition',request,key);assert status==200,opened
            assert opened['mail']['total']==2 and opened['mail']['pending']==2
            assert admins[0].call('class_transition',request,key)[1]['event_id']==opened['event_id']
            assert admins[1].call('class_transition',request)[0]==409
            assert next(c for c in guest.call('classes')[1]['classes'] if c['code']=='CB-01')['availability']=='closed'
            assert Client(bases[0]).call('register',body('CB-01','new@example.test'))[0]==409
            assert a.call('learning_class&class_code=CB-01')[0]==200
            assert a.call('class_send_mail',dict(event_id=opened['event_id']))[0]==403
            assert admins[0].call('class_send_mail',dict(event_id=opened['event_id']),csrf='bad')[0]==403
            db.execute('UPDATE users SET email=? WHERE username=?',('changed@example.test',name_a));db.commit()
            changed=admins[0].call('class_send_mail',dict(event_id=opened['event_id']))[1]['mail']
            assert changed['failed']==1 and changed['errors']['recipient_changed']==1 and len(smtp.messages)==0
            db.execute('UPDATE users SET email=? WHERE username=?',('a@example.test',name_a));db.commit()
            mail_config(True);assert admins[0].call('class_send_mail',dict(event_id=opened['event_id']))[1]['mail']['failed']==2
            mail_config();assert admins[1].call('class_send_mail',dict(event_id=opened['event_id'],retry=True))[0]==200
            while admins[0].call('class_send_mail',dict(event_id=opened['event_id']))[1]['mail']['pending']:pass
            assert len(smtp.messages)==2
            for raw in smtp.messages:
                message=plain(raw);assert 'đã được mở' in message and '19:00' in message and request['start_date'][8:]+'/'+request['start_date'][5:7]+'/'+request['start_date'][:4] in message
                assert pw_a not in message and pw_b not in message
            assert admins[0].call('class_send_mail',dict(event_id=opened['event_id']))[1]['mail']['sent']==2 and len(smtp.messages)==2
            print('PASS: opening date/schedule, all role/CSRF gates, closed registration, stable event replay/versioning, SMTP failure/resume and no duplicate sends; student access remains.')
            end_request=dict(class_code='CB-01',version=life()['lifecycle']['revision'],action='complete');end_key=secrets.token_hex(32)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda pair:pair[0].call('class_transition',end_request,pair[1]),[(admins[0],end_key),(admins[1],secrets.token_hex(32))]))
            assert sorted(r[0] for r in results)==[200,409],results
            closed=next(r[1] for r in results if r[0]==200);assert closed['mail']['total']==2
            assert db.execute("SELECT COUNT(*) FROM lms_certificates WHERE class_code='CB-01'").fetchone()[0]==2
            assert a.call('learning_class&class_code=CB-01')[0]==404 and a.call('learning_resources&class_code=CB-01')[0]==404 and a.call('learning_quizzes&class_code=CB-01')[0]==404
            assert a.call('student_classes')[1]['classes']==[]
            assert other.call('learning_class&class_code=NC-01')[0]==200
            cert=a.call('class_certificates')[1]['certificates'][0];assert cert['fullname']=='Nguyễn Văn Kiểm Thử' and cert['cycle_id']==1
            assert guest.call('class_certificate&id='+str(cert['id']))[0]==401 and b.call('class_certificate&id='+str(cert['id']))[0]==404
            raw=a.http.open(a.base+'/'+cert['download_url']).read();assert raw[:8]==b'\x89PNG\r\n\x1a\n'
            assert admins[2].http.open(admins[2].base+'/'+cert['download_url']).read()==raw
            sample=ROOT.parent/'.lms-lifecycle-checks';sample.mkdir(exist_ok=True);(sample/'certificate-fixture.png').write_bytes(raw)
            storage_key=db.execute('SELECT storage_key FROM lms_certificates WHERE id=?',(cert['id'],)).fetchone()[0]
            try:urllib.request.urlopen(bases[0]+'/certificates/'+storage_key);raise AssertionError('Public certificate')
            except urllib.error.HTTPError as e:assert e.code==404
            # Complete mail/certificates remain available even after the next cohort is reopened.
            assert life()['registration_open'] is False
            assert transition('reopen',admin=admins[2])[0]==200
            assert life()['lifecycle']['cycle_id']==2 and life()['lifecycle']['state']=='ready'
            assert a.call('learning_class&class_code=CB-01')[0]==404
            assert old_pending.call('payment&class_code=CB-01',{})[1]['payment']['eligible'] is False
            same_email=Client(bases[1]);assert same_email.call('register',body('CB-01','pending@example.test'))[0]==201
            stale_detail=admins[0].call('admin_registration&reference='+old_ref)[1]
            assert admins[0].call('admin_grant_access',dict(reference=old_ref,version=stale_detail['revision']))[0]==409
            mail_config(True);assert admins[0].call('class_send_mail',dict(event_id=closed['event_id']))[1]['mail']['failed']==1
            mail_config();admins[0].call('class_send_mail',dict(event_id=closed['event_id'],retry=True))
            while admins[0].call('class_send_mail',dict(event_id=closed['event_id']))[1]['mail']['pending']:pass
            assert len(smtp.messages)==4
            for message in smtp.messages[-2:]:
                parsed=BytesParser(policy=policy.default).parsebytes(message);attachments=list(parsed.iter_attachments());assert len(attachments)==1 and attachments[0].get_content_type()=='image/png'
                assert attachments[0].get_payload(decode=True)[:8]==b'\x89PNG\r\n\x1a\n'
                assert 'chúc mừng và công nhận' in plain(message)
            # The same email may join the next cohort; no old hold or enrollment silently reactivates.
            new_owner=Client(bases[0]);new_ref=detail(new_owner,'CB-01','a@example.test','Nguyễn Văn Kiểm Thử');grant(new_ref)
            assert a.call('learning_class&class_code=CB-01')[0]==200
            assert db.execute("SELECT cycle_id,active FROM lms_enrollments WHERE user_id=(SELECT id FROM users WHERE username=?) AND class_code='CB-01' ORDER BY id",(name_a,)).fetchall()==[(1,0),(2,1)]
            assert a.call('class_certificates')[1]['certificates'][0]==cert
            print('PASS: concurrent completion creates one decision/two named certificates, all student content blocked, private PNG attachments/downloads, completion email retry, manual reopening/new cohort, old students and pending profiles cannot enter new cohort without a new grant.')
            # All three admins can control any assigned/unassigned class; no fake main data.
            for i,code in enumerate(['CB-02','CB-03','NC-02','NC-03']):
                result=transition('start',code,admins[i%3],start_date=start_date(code));assert result[0]==200,result
                assert transition('complete',code,admins[(i+1)%3])[0]==200
                assert transition('reopen',code,admins[(i+2)%3])[0]==200
                assert life(code)['lifecycle']['cycle_id']==2
            assert db.execute('SELECT * FROM users ORDER BY id').fetchall()==original_users
            if '--browser' in sys.argv:
                db.execute("DELETE FROM lms_rate_limits WHERE key LIKE 'lifecycle:%'");db.commit()
                payload=dict(base_url=bases[0],admin_password=password,student_username=name_a,student_password=pw_a,start_date=start_date('CB-01'),screenshots=str(ROOT.parent/'.lms-lifecycle-checks'))
                result=subprocess.run(['node',str(ROOT/'tests/test_lms_lifecycle_browser.cjs')],input=json.dumps(payload).encode(),cwd=ROOT,capture_output=True,timeout=180)
                print(result.stdout.decode(errors='replace').strip())
                assert result.returncode==0,result.stderr.decode(errors='replace')
                assert a.call('learning_class&class_code=CB-01')[0]==404
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and db.execute('PRAGMA foreign_key_check').fetchall()==[]
            print('PASS: equal admin permissions on all classes, account/password preservation, SQLite integrity/foreign keys, no real mail or main database mutations.')
        finally:
            if db:db.close()
            for process in processes:process.terminate();process.wait(timeout=10)
            if smtp:smtp.close()
if __name__=='__main__':main()
