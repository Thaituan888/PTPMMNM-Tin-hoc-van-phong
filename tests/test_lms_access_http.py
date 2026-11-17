"""Provisioning, encrypted email retries and student access. Private DB + loopback SMTP only."""
import sys
sys.dont_write_bytecode=True
import base64
import concurrent.futures
from email import policy
from email.parser import BytesParser
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.request
from test_lms_http import ROOT,PHP,Client,body,port
from test_lms_evidence_http import upload
from test_lms_mail_http import FakeSMTP


def main():
    processes=[];db=None;smtp=None;gate=threading.Event();gate.set()
    with tempfile.TemporaryDirectory(prefix='thvp-access-') as temporary:
        folder=Path(temporary);db_path=folder/'test.sqlite';mail_path=folder/'mail.json';log_path=folder/'php.log'
        openssl=shutil.which('openssl') or r'C:\msys64\ucrt64\bin\openssl.exe'
        def openssl_command(*args):subprocess.run([openssl,*args],cwd=folder,check=True,capture_output=True)
        openssl_command('req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=ACCESS TEST CA','-keyout','ca.key','-out','ca.pem','-addext','basicConstraints=critical,CA:TRUE')
        openssl_command('req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout','smtp.key','-out','smtp.csr')
        (folder/'extensions.txt').write_text('subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',encoding='ascii')
        openssl_command('x509','-req','-in','smtp.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1','-out','smtp.pem','-extfile','extensions.txt')
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(folder/'smtp.pem',folder/'smtp.key')
        smtp_password=secrets.token_urlsafe(24);smtp=FakeSMTP(context,'fixture-smtp',smtp_password)
        entered=threading.Event()
        class Capture(list):
            def append(self,message):entered.set();gate.wait(10);super().append(message)
        smtp.messages=Capture()
        bases=['http://127.0.0.1:'+str(port()) for _ in range(2)]
        config=dict(enabled=True,smtp_host='127.0.0.1',smtp_port=smtp.server_address[1],smtp_encryption='tls',smtp_username='fixture-smtp',smtp_password=smtp_password,
                    from_email='sender@example.test',from_name='LMS kiểm thử',base_url=bases[0],timeout_seconds=3)
        def mail_config(fail=False):mail_path.write_text(json.dumps({**config,'smtp_password':('wrong-'+smtp_password if fail else smtp_password)}),encoding='utf-8')
        mail_config()
        (folder/'bank.json').write_text(json.dumps(dict(bank_name='Test bank',bank_bin='970436',account_number='123456789',account_name='TEST ONLY')),encoding='utf-8')
        env=dict(os.environ,THVP_LMS_DB=str(db_path),THVP_LMS_MAIL_CONFIG=str(mail_path),THVP_LMS_PAYMENT_CONFIG=str(folder/'bank.json'),
                 THVP_LMS_EVIDENCE_DIR=str(folder/'images'),THVP_LMS_ACCESS_KEY=str(folder/'mail.key'))
        admin_password=secrets.token_urlsafe(20);old_password=secrets.token_urlsafe(20)
        hash_script='<?php $v=json_decode(stream_get_contents(STDIN),true);echo password_hash($v["password"],PASSWORD_DEFAULT);'
        def password_hash(value):
            return subprocess.check_output([str(PHP),'-r',hash_script.removeprefix('<?php ')],input=json.dumps({'password':value}).encode(),cwd=ROOT).decode()
        # Pre-existing local accounts and duplicate emails survive migration unchanged.
        db=sqlite3.connect(db_path)
        db.execute("CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE COLLATE NOCASE,fullname TEXT,role TEXT,active INTEGER DEFAULT 1,password_hash TEXT,email TEXT)")
        old_hash=password_hash(old_password)
        for username,email in [('ExistingStudent',' Student@Example.Test '),('DuplicateA','dupe@example.test'),('DuplicateB',' DUPE@example.test ')]:
            db.execute("INSERT INTO users(username,fullname,role,password_hash,email) VALUES (?,?,'student',?,?)",(username,'Học sinh cũ',old_hash,email))
        db.commit()
        try:
            for base in bases:
                processes.append(subprocess.Popen([str(PHP),'-d','extension=gd','-d','display_errors=0','-d','log_errors=1','-d','error_log='+str(log_path),
                  '-d','openssl.cafile='+str(folder/'ca.pem'),'-S',base.removeprefix('http://'),'-t',str(ROOT),str(ROOT/'router.php')],cwd=ROOT,env=env,
                  stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
            for base in bases:
                for _ in range(100):
                    try:urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                    except OSError:time.sleep(.05)
            guest=Client(bases[0]);admins=[]
            for i in range(1,4):
                subprocess.run([str(PHP),str(ROOT/'lms-server/admin-accounts.php'),'set-password','Giaovien'+str(i)],input=json.dumps({'password':admin_password}).encode(),env=env,cwd=ROOT,check=True,capture_output=True)
                client=Client(bases[(i-1)%2]);assert client.call('auth_login',{'username':'Giaovien'+str(i),'password':admin_password})[0]==200;admins.append(client)
            db.execute("UPDATE users SET email='admin@example.test' WHERE username='Giaovien3'");db.commit()
            existing=Client(bases[1]);assert existing.call('auth_login',{'username':'ExistingStudent','password':old_password})[0]==200
            png=base64.b64decode(subprocess.check_output([str(PHP),'-d','extension=gd','-r','ob_start();imagepng(imagecreatetruecolor(8,8));echo base64_encode(ob_get_clean());'],cwd=ROOT))
            serial=0
            def reset_rate():
                db.execute("DELETE FROM lms_rate_limits WHERE key LIKE 'access:%' OR key LIKE 'review:%'");db.commit()
            def fixture(code='CB-01',email=None,approved=True):
                nonlocal serial
                serial+=1;reset_rate();owner=Client(bases[serial%2])
                code_status,data=owner.call('register',body(code,email or f'learner{serial}@example.test'));assert code_status==201
                ref=data['registration']['reference'];ident=int(ref[2:])
                assert owner.call('payment&class_code='+code,{})[0]==200
                assert upload(owner,ref,code,png)[0]==201
                if approved:
                    detail=admins[0].call('admin_registration&reference='+ref)[1]
                    result=admins[0].call('admin_review',dict(reference=ref,version=detail['revision'],decision='approve',funds_verified=True))
                    assert result[0]==200
                return owner,ref,ident,code
            def request(fixture):
                detail=admins[0].call('admin_registration&reference='+fixture[1])[1]
                return {'reference':fixture[1],'version':detail['revision']}
            def grant(fixture,admin=admins[0],key=None):return admin.call('admin_grant_access',request(fixture),key)
            def occupancy(code):
                row=next(r for r in guest.call('classes')[1]['classes'] if r['code']==code)
                return row['active_students']+row['valid_holds']
            def plaintext(message):return BytesParser(policy=policy.default).parsebytes(message).get_body(preferencelist=('plain',)).get_content()
            def credentials(message):
                text=plaintext(message);return re.search(r'Tên đăng nhập: ([^\r\n]+)',text).group(1),re.search(r'Mật khẩu: (\S+)',text).group(1)
            def forbidden(data,*values):
                text=json.dumps(data,ensure_ascii=False)
                for value in values:assert value not in text
                for field in ['encrypted_payload','lease_hash','password_hash','smtp_password']:assert field not in text

            first=fixture()
            payload=request(first)
            assert guest.call('admin_grant_access',payload)[0]==401
            assert existing.call('admin_grant_access',{**payload,'role':'admin'})[0]==403
            assert admins[0].call('admin_grant_access',payload,csrf='bad')[0]==403
            assert admins[0].call('admin_grant_access',{**payload,'email':'other@example.test'})[0]==422
            pending=fixture('CB-03',approved=False);assert grant(pending)[0]==409
            before=occupancy(first[3]);key=secrets.token_hex(32)
            status,result=admins[0].call('admin_grant_access',payload,key);assert status==200 and result['access']['mail_state']=='sent'
            username,temporary=credentials(smtp.messages[-1]);forbidden(result,temporary,smtp_password)
            assert occupancy(first[3])==before
            row=db.execute('SELECT username,email,password_hash,must_change_password FROM users WHERE username=?',(username,)).fetchone()
            assert row[1]=='learner1@example.test' and row[2]!=temporary and row[3]==0
            assert re.fullmatch(r'\d{2,8} '+re.escape(db.execute('SELECT fullname FROM lms_registrations WHERE id=?',(first[2],)).fetchone()[0]),username)
            assert 'bắt buộc đổi' not in plaintext(smtp.messages[-1])
            assert db.execute('SELECT encrypted_payload FROM lms_access_grants WHERE registration_id=?',(first[2],)).fetchone()[0] is None
            assert len((folder/'mail.key').read_bytes())==64
            assert 'Đăng nhập: '+bases[0]+'/dang-nhap-hoc-sinh.html' in plaintext(smtp.messages[-1])
            assert 'Đổi mật khẩu (không bắt buộc): '+bases[0]+'/dang-nhap-hoc-sinh.html?doi-mat-khau=1' in plaintext(smtp.messages[-1])
            assert 'chỉ truy cập được trên máy đang chạy server' in plaintext(smtp.messages[-1])
            count=len(smtp.messages)
            assert admins[0].call('admin_grant_access',payload,key)[0]==200
            assert grant(first,admins[1])[0]==200 and len(smtp.messages)==count
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments WHERE registration_id=?',(first[2],)).fetchone()[0]==1
            assert first[0].call('registration&class_code='+first[3])[1]['registration']['status']=='enrolled'
            print('PASS: checkbox approval → fullname username + hashed password + direct login + enrollment + encrypted outbox; SMTP UTF-8 credentials, no double capacity/repeated mail, guest/student/CSRF denied.')

            reused=fixture('NC-01','student@example.test');baseline_hash=db.execute("SELECT password_hash FROM users WHERE username='ExistingStudent'").fetchone()[0]
            status,data=grant(reused,admins[1]);assert status==200 and not data['access']['new_account']
            assert db.execute("SELECT password_hash FROM users WHERE username='ExistingStudent'").fetchone()[0]==baseline_hash
            assert 'Mật khẩu tạm:' not in plaintext(smtp.messages[-1]) and old_password not in plaintext(smtp.messages[-1])
            assert existing.call('student_classes')[1]['classes'][0]['code']=='NC-01'
            for email in ['dupe@example.test','admin@example.test']:
                item=fixture('NC-02',email);users=db.execute('SELECT COUNT(*) FROM users').fetchone()[0]
                assert grant(item,admins[2])[0]==409
                assert db.execute('SELECT COUNT(*) FROM users').fetchone()[0]==users
                assert db.execute('SELECT COUNT(*) FROM lms_access_grants WHERE registration_id=?',(item[2],)).fetchone()[0]==0
            print('PASS: unique normalized email reuses student without password changes; legacy duplicate/admin emails stop atomically without linking or new users.')

            failed=fixture('CB-02');mail_config(True)
            users=db.execute('SELECT COUNT(*) FROM users').fetchone()[0]
            status,data=grant(failed,admins[2]);assert status==200 and data['access']['mail_state']=='failed'
            assert db.execute('SELECT COUNT(*) FROM users').fetchone()[0]==users+1
            envelope=db.execute('SELECT encrypted_payload FROM lms_access_grants WHERE registration_id=?',(failed[2],)).fetchone()[0]
            assert envelope and 'temporary_password' not in envelope
            retry_payload=request(failed);retry_key=secrets.token_hex(32)
            assert admins[2].call('admin_access_mail_retry',retry_payload,retry_key)[1]['access']['mail_state']=='failed'
            attempts=db.execute('SELECT attempts FROM lms_access_grants WHERE registration_id=?',(failed[2],)).fetchone()[0]
            admins[2].call('admin_access_mail_retry',retry_payload,retry_key)
            assert db.execute('SELECT attempts FROM lms_access_grants WHERE registration_id=?',(failed[2],)).fetchone()[0]==attempts
            mail_config();gate.clear();entered.clear();count=len(smtp.messages)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                job=pool.submit(admins[1].call,'admin_access_mail_retry',retry_payload)
                assert entered.wait(10)
                # Other PHP process sees the lease and must not send a second email.
                second=admins[0].call('admin_access_mail_retry',retry_payload);assert second[0]==200 and second[1]['access']['mail_state']=='sending'
                gate.set();assert job.result()[1]['access']['mail_state']=='sent'
            assert len(smtp.messages)==count+1
            retry_username,retry_password=credentials(smtp.messages[-1]);assert retry_password not in envelope
            assert retry_username!=username and re.fullmatch(r'\d{2,8} .+',retry_username)
            direct=Client(bases[0]);assert direct.call('auth_login',{'username':retry_username,'password':retry_password})[0]==200
            assert direct.call('learning_class&class_code='+failed[3])[0]==200
            forbidden(admins[0].call('admin_registration&reference='+failed[1])[1],retry_password,smtp_password)
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments WHERE registration_id=?',(failed[2],)).fetchone()[0]==1
            print('PASS: SMTP failure retains account/enrollment and authenticated encrypted payload; request replay and concurrent retries do not duplicate sends/accounts, successful retry erases encrypted payload; no API password leak.')

            racing=fixture('NC-03');reset_rate()
            db.executemany("INSERT INTO lms_enrollments(class_code,email,active) VALUES ('NC-03',?,1)",[(f'capacity{i}@example.test',) for i in range(98)]);db.commit()
            assert occupancy('NC-03')==99
            request_data=request(racing);gate.clear();entered.clear();count=len(smtp.messages)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                job=pool.submit(admins[0].call,'admin_grant_access',request_data)
                assert entered.wait(10)
                second=admins[1].call('admin_grant_access',request_data);assert second[0]==200
                gate.set();assert job.result()[0]==200
            assert len(smtp.messages)==count+1 and occupancy('NC-03')==99
            assert db.execute('SELECT COUNT(*) FROM lms_access_grants WHERE registration_id=?',(racing[2],)).fetchone()[0]==1
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments WHERE registration_id=?',(racing[2],)).fetchone()[0]==1

            learner=Client(bases[0]);status,data=learner.call('auth_login',{'username':username,'password':temporary})
            assert status==200 and not data['user']['must_change_password']
            assert learner.call('student_classes')[0]==200
            assert learner.call('learning_class&class_code='+first[3])[0]==200
            # Legacy accounts explicitly marked for a change keep their established flow.
            db.execute('UPDATE users SET must_change_password=1 WHERE username=?',(username,));db.commit()
            assert learner.call('student_classes')[0]==423
            assert learner.call('student_class&class_code='+first[3])[0]==423
            assert learner.call('admin_registrations&role=admin')[0]==403
            assert learner.call('student_change_password',{'current_password':temporary,'new_password':'short'})[0]==422
            new_password=secrets.token_urlsafe(24)
            assert learner.call('student_change_password',{'current_password':'wrong','new_password':new_password})[0]==422
            assert learner.call('student_change_password',{'current_password':temporary,'new_password':new_password},csrf='bad')[0]==403
            assert learner.call('student_change_password',{'current_password':temporary,'new_password':new_password})[1]['user']['must_change_password'] is False
            rows=learner.call('student_classes&user_id=1&role=admin')[1]['classes'];assert [r['code'] for r in rows]==[first[3]]
            assert learner.call('student_class&class_code='+first[3])[1]['class']['content_available'] is False
            assert learner.call('student_class&class_code=NC-01&user_id=1')[0]==404
            assert learner.call('admin_grant_access',request_data)[0]==403
            assert Client(bases[1]).call('auth_login',{'username':username,'password':temporary})[0]==401
            assert Client(bases[1]).call('auth_login',{'username':username,'password':new_password})[0]==200
            assert admins[0].call('auth_user')[1]['user']['role']=='admin'
            print('PASS: two admins provisioning concurrently create one account/enrollment/mail, class remains at 99; student is blocked until password change, old password revoked, only enrolled class visible, forged IDs/roles and administration denied; admins unchanged.')

            shared_a=fixture('CB-01','shared@example.test');shared_b=fixture('NC-01','shared@example.test');reset_rate()
            pairs=[(admins[0],request(shared_a)),(admins[1],request(shared_b))];count=len(smtp.messages)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(lambda pair:pair[0].call('admin_grant_access',pair[1]),pairs))
            assert all(result[0]==200 for result in results)
            assert sorted(result[1]['access']['new_account'] for result in results)==[False,True]
            assert db.execute("SELECT COUNT(*) FROM users WHERE lower(trim(email))='shared@example.test'").fetchone()[0]==1
            assert len(smtp.messages)==count+2 and sum('Mật khẩu:' in plaintext(m) for m in smtp.messages[-2:])==1
            print('PASS: different classes sharing a new email, provisioned concurrently, reuse exactly one student account and send credentials only for the creating registration.')

            rollback=fixture('CB-03');before_users=db.execute('SELECT COUNT(*) FROM users').fetchone()[0]
            db.execute("CREATE TRIGGER test_grant_failure BEFORE INSERT ON lms_access_grants BEGIN SELECT RAISE(ABORT,'fixture failure');END");db.commit()
            assert grant(rollback)[0]==503
            assert db.execute('SELECT COUNT(*) FROM users').fetchone()[0]==before_users
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments WHERE registration_id=?',(rollback[2],)).fetchone()[0]==0
            assert db.execute('SELECT review_status FROM lms_registrations WHERE id=?',(rollback[2],)).fetchone()[0]=='approved_waiting_access'
            db.execute('DROP TRIGGER test_grant_failure');db.commit()
            expiring=fixture('NC-02');mail_config(True);assert grant(expiring)[1]['access']['mail_state']=='failed'
            db.execute('UPDATE lms_access_grants SET payload_expires_at=? WHERE registration_id=?',(int(time.time())-1,expiring[2]));db.commit()
            assert admins[0].call('admin_registration&reference='+expiring[1])[1]['access']['mail_state']=='expired'
            assert db.execute('SELECT encrypted_payload FROM lms_access_grants WHERE registration_id=?',(expiring[2],)).fetchone()[0] is None
            before_hash=db.execute('SELECT password_hash FROM users WHERE username=?',(retry_username,)).fetchone()[0]
            db.execute('UPDATE users SET must_change_password=1 WHERE username=?',(retry_username,))
            db.execute("DELETE FROM lms_schema_migrations WHERE name='student_direct_login_v1'");db.commit()
            count=len(smtp.messages)
            assert direct.call('auth_user')[1]['user']['must_change_password'] is False
            assert db.execute('SELECT password_hash FROM users WHERE username=?',(retry_username,)).fetchone()[0]==before_hash
            assert direct.call('learning_class&class_code='+failed[3])[0]==200 and len(smtp.messages)==count
            # Recover a reused account whose notification did not include a password.
            reset_rate();mail_config();reissue=request(reused);reissue_key=secrets.token_hex(32)
            assert guest.call('admin_reissue_credentials',reissue)[0]==401
            assert existing.call('admin_reissue_credentials',reissue)[0]==403
            assert admins[0].call('admin_reissue_credentials',reissue,csrf='bad')[0]==403
            assert admins[0].call('admin_reissue_credentials',{**reissue,'email':'other@example.test'})[0]==422
            uid=db.execute("SELECT id FROM users WHERE username='ExistingStudent'").fetchone()[0]
            enrollment_before=db.execute('SELECT * FROM lms_enrollments WHERE user_id=? ORDER BY id',(uid,)).fetchall()
            user_count=db.execute('SELECT COUNT(*) FROM users').fetchone()[0]
            mail_config(True)
            code,data=admins[0].call('admin_reissue_credentials',reissue,reissue_key)
            assert code==200 and data['access']['mail_state']=='failed'
            hash_after=db.execute('SELECT password_hash FROM users WHERE id=?',(uid,)).fetchone()[0]
            assert hash_after!=baseline_hash
            assert admins[0].call('admin_reissue_credentials',reissue,reissue_key)[0]==200
            assert db.execute('SELECT password_hash FROM users WHERE id=?',(uid,)).fetchone()[0]==hash_after
            assert admins[1].call('admin_reissue_credentials',reissue)[0]==409
            assert existing.call('auth_user')[1]['user'] is None
            mail_config();count=len(smtp.messages)
            assert admins[1].call('admin_access_mail_retry',request(reused))[1]['access']['mail_state']=='sent'
            assert len(smtp.messages)==count+1
            recovered_name,recovered_password=credentials(smtp.messages[-1])
            assert re.fullmatch(r'\d{2,8} .+',recovered_name)
            forbidden(admins[0].call('admin_registration&reference='+reused[1])[1],recovered_password)
            recovered=Client(bases[1]);login=recovered.call('auth_login',dict(username=recovered_name,password=recovered_password))
            assert login[0]==200 and not login[1]['user']['must_change_password']
            assert recovered.call('learning_class&class_code='+reused[3])[0]==200
            assert db.execute('SELECT * FROM lms_enrollments WHERE user_id=? ORDER BY id',(uid,)).fetchall()==enrollment_before
            # Two admins with the same displayed revision cannot reset the password twice.
            reset_rate();next_request=request(reused);gate.clear();entered.clear();count=len(smtp.messages)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                job=pool.submit(admins[0].call,'admin_reissue_credentials',next_request)
                assert entered.wait(10)
                assert admins[1].call('admin_reissue_credentials',next_request)[0]==409
                gate.set();assert job.result()[1]['access']['mail_state']=='sent'
            assert len(smtp.messages)==count+1
            final_name,final_password=credentials(smtp.messages[-1]);assert final_name==recovered_name and final_password!=recovered_password
            assert recovered.call('auth_user')[1]['user'] is None
            assert Client(bases[0]).call('auth_login',dict(username=final_name,password=final_password))[1]['user']['must_change_password'] is False
            assert db.execute('SELECT COUNT(*) FROM users').fetchone()[0]==user_count
            assert db.execute('SELECT * FROM lms_enrollments WHERE user_id=? ORDER BY id',(uid,)).fetchall()==enrollment_before
            print('PASS: legacy missing-password email repaired through admin reissue, numeric-prefix username, SMTP failure/retry keeps one password, replay/concurrent/stale/auth/CSRF checks, old sessions revoked, immediate class access, no new account or enrollment.')
            # Optional changes for a normal account with must_change_password=0.
            changer,other_session=Client(bases[0]),Client(bases[1])
            for c in [changer,other_session]:assert c.call('auth_login',dict(username=final_name,password=final_password))[0]==200
            chosen_password=secrets.token_urlsafe(24)
            change_body=dict(current_password=final_password,new_password=chosen_password)
            assert guest.call('student_change_password',change_body)[0]==401
            assert admins[0].call('student_change_password',change_body)[0]==403
            assert changer.call('student_change_password',change_body,csrf='bad')[0]==403
            assert changer.call('student_change_password',{**change_body,'current_password':'incorrect'})[0]==422
            assert changer.call('student_change_password',{**change_body,'new_password':final_password})[0]==422
            assert changer.call('student_change_password',{**change_body,'user_id':1,'role':'admin'})[0]==200
            assert changer.call('learning_class&class_code='+reused[3])[0]==200
            assert other_session.call('auth_user')[1]['user'] is None
            assert Client(bases[1]).call('auth_login',dict(username=final_name,password=final_password))[0]==401
            assert Client(bases[1]).call('auth_login',dict(username=final_name,password=chosen_password))[0]==200
            next_chosen=secrets.token_urlsafe(24)
            assert changer.call('student_change_password',dict(current_password=chosen_password,new_password=next_chosen))[0]==200
            assert changer.call('student_classes')[0]==200
            print('PASS: optional password change from ordinary student session, current-password/policy/CSRF/role checks, repeated changes, own account only, old passwords/sessions revoked, current session keeps class access.')
            dump='\n'.join(db.iterdump());logs=log_path.read_text(errors='replace') if log_path.exists() else ''
            for secret in [temporary,retry_password,new_password,old_password,smtp_password,recovered_password,final_password,chosen_password,next_chosen]:assert secret not in dump and secret not in logs
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and db.execute('PRAGMA foreign_key_check').fetchall()==[]
            for target in ['/.thvp-lms/mail-outbox.key','/mail-outbox.key','/lms-server/access.php']:
                try:urllib.request.urlopen(bases[0]+target).close();raise AssertionError('Private resource exposed')
                except urllib.error.HTTPError as error:assert error.code==404
            print('PASS: DB failure rolls back grant/account/enrollment together; secret expiry wipes envelope; plaintext absent from DB/API/log, private key blocked, SQLite integrity/foreign keys. No real accounts, profiles or external email touched.')
        finally:
            gate.set()
            if db is not None:db.close()
            for process in processes:process.terminate();process.wait(timeout=10)
            if smtp is not None:smtp.close()


if __name__=='__main__':main()
