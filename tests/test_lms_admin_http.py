"""Actual PHP sessions, password hashes, admin reads and private images; isolated SQLite only."""
import sys
sys.dont_write_bytecode=True
import base64
import copy
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
from test_lms_http import ROOT,PHP,Client,body,port
from test_lms_evidence_http import upload,image


def main():
    processes=[]
    with tempfile.TemporaryDirectory(prefix='thvp-admin-') as temporary:
        folder=Path(temporary);db_path=folder/'test.sqlite'
        env=dict(os.environ,THVP_LMS_DB=str(db_path),THVP_LMS_EVIDENCE_DIR=str(folder/'images'),THVP_LMS_PAYMENT_CONFIG=str(folder/'bank.json'))
        db=None;legacy=None
        def start(local_env):
            base='http://127.0.0.1:'+str(port())
            processes.append(subprocess.Popen([str(PHP),'-d','extension=gd','-d','display_errors=0','-S',base.removeprefix('http://'),'-t',str(ROOT),str(ROOT/'router.php')],
                cwd=ROOT,env=local_env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
            for _ in range(100):
                try:urllib.request.urlopen(base+'/index.html',timeout=1).close();return base
                except OSError:time.sleep(.05)
            raise AssertionError('PHP did not start')
        def account_tool(args,local_env=env,payload=None):
            return subprocess.run([str(PHP),str(ROOT/'lms-server/admin-accounts.php'),*args],
                input=json.dumps(payload).encode() if payload else None,capture_output=True,env=local_env,cwd=ROOT,check=True).stdout
        try:
            base=start(env);owner=Client(base);guest=Client(base)
            db=sqlite3.connect(db_path);db.execute('PRAGMA foreign_keys=ON')
            expected={'Giaovien1':'Tống Hoàng Thiên','Giaovien2':'Nguyễn Thái Tuấn','Giaovien3':'Trần Anh Khoa'}
            listing=json.loads(account_tool(['list']))['accounts']
            assert {r['username']:r['fullname'] for r in listing}==expected
            assert all(r['role']=='admin' and not r['password_configured'] for r in listing)
            passwords={username:secrets.token_urlsafe(20) for username in expected}
            for username,password in passwords.items():account_tool(['set-password',username],payload={'password':password})
            hashes=db.execute('SELECT username,password_hash FROM users ORDER BY id').fetchall()
            assert all(value.startswith('$2y$') and value not in passwords.values() for _,value in hashes)
            account_tool(['list'])
            assert db.execute('SELECT username,password_hash FROM users ORDER BY id').fetchall()==hashes
            classes=['CB-01','CB-02','CB-03','NC-01','NC-02','NC-03']
            references=[]
            for index,code in enumerate(classes):
                status,result=owner.call('register',body(code,f'fixture{index}@example.test'));assert status==201
                references.append(result['registration']['reference'])
            status,extra=guest.call('register',body('CB-01','extra@example.test'));assert status==201
            extra_ref=extra['registration']['reference']
            fixture=subprocess.check_output([str(PHP),'-d','extension=gd'],input=b'<?php $i=imagecreatetruecolor(8,8);ob_start();imagepng($i);echo base64_encode(ob_get_clean());',cwd=ROOT)
            png=base64.b64decode(fixture)
            status,proof=upload(owner,references[0],data=png);assert status==201
            proof_url=proof['evidence']['image_url']
            db.execute("UPDATE lms_registrations SET expires_at=? WHERE class_code='NC-01'",(int(time.time())-1,));db.commit()
            assert upload(owner,references[3],'NC-01',png)[1]['registration']['status']=='late_review'
            status,extra_proof=upload(guest,extra_ref,data=png);assert status==201
            other_same_class_url=extra_proof['evidence']['image_url']
            before_profiles=db.execute('SELECT * FROM lms_registrations ORDER BY id').fetchall()
            assert owner.call('admin_registrations&role=admin&username=Giaovien1')[0]==401
            assert guest.call('admin_registration&reference='+references[0])[0]==401
            assert image(guest,proof_url)[0]==404
            assert owner.call('auth_login',{'username':'Giaovien1','password':passwords['Giaovien1']},csrf='wrong')[0]==403
            assert owner.call('auth_login',{'username':'Giaovien1','password':'wrong'})[0]==401
            admins=[]
            for username,password in passwords.items():
                admin=Client(base);admins.append(admin)
                session_id=next(c.value for c in admin.cookies if c.name=='THVP_LMS_SESSION')
                status,data=admin.call('auth_login',{'username':username,'password':password,'role':'student','id':999})
                assert status==200 and data['user']['fullname']==expected[username] and data['user']['role']=='admin'
                assert next(c.value for c in admin.cookies if c.name=='THVP_LMS_SESSION')!=session_id
                status,data=admin.call('admin_registrations&page_size=50')
                assert status==200 and data['total']==7 and {r['class_code'] for r in data['items']}==set(classes)
                for reference in [references[0],references[3],extra_ref]:
                    status,detail=admin.call('admin_registration&reference='+reference)
                    assert status==200 and detail['registration']['reference']==reference
                    if reference==references[3]:assert detail['registration']['status']=='late_review' and not detail['hold']['reserved']
                    for item in detail['evidence']:assert image(admin,item['image_url'])[0]==200
                    flat=json.dumps(detail)
                    for forbidden in ['access_hash','request_hash','owner_hash','payload_hash','password_hash','storage_key','credential_stamp',str(folder)]:assert forbidden not in flat
                assert admin.call('admin_registration&reference='+references[1])[1]['evidence']==[]
                assert upload(admin,references[0],data=png)[0]==404  # read-only admin role cannot upload as another owner
            # An admin's personal token for one profile must not restrict viewing another profile in the same class.
            for cookie in owner.cookies:
                if cookie.name=='thvp_lms_CB_01':admins[0].cookies.set_cookie(copy.copy(cookie))
            assert image(admins[0],other_same_class_url)[0]==200
            print('PASS: three equal server-authenticated admins, session rotation, all six classes, late status, contacts/detail/history and private image handler; guest/API parameter impersonation denied.')

            admin=admins[0]
            first=admin.call('admin_registrations&page_size=2&page=1')[1]
            second=admin.call('admin_registrations&page_size=2&page=2')[1]
            assert first['pages']==4 and len(first['items'])==2 and not {r['reference'] for r in first['items']} & {r['reference'] for r in second['items']}
            filtered=admin.call('admin_registrations&class_code=CB-01')[1];assert filtered['total']==2
            filtered=admin.call('admin_registrations&status=late_review')[1];assert filtered['total']==1 and filtered['items'][0]['class_code']=='NC-01'
            empty=admin.call('admin_registrations&class_code=NC-03&status=late_review')[1];assert empty['total']==0 and empty['items']==[]
            for query in ['page=0','page_size=500','class_code=INVALID','status=INVALID']:
                assert admin.call('admin_registrations&'+query)[0]==422
            assert admin.call('admin_registration&reference=DK999999')[0]==404
            assert admin.call('admin_registrations',{'role':'admin'})[0]==404
            # A genuine student session still cannot elevate itself by adding role, username or another reference.
            student_password=secrets.token_urlsafe(20)
            encoded=subprocess.check_output([str(PHP)],input=('<?php echo password_hash('+json.dumps(student_password)+',PASSWORD_DEFAULT);').encode(),cwd=ROOT).decode()
            db.execute("INSERT INTO users(username,fullname,role,password_hash) VALUES ('student_fixture','Student fixture','student',?)",(encoded,));db.commit()
            student=Client(base)
            assert student.call('auth_login',{'username':'student_fixture','password':student_password,'role':'admin','id':1})[1]['user']['role']=='student'
            assert student.call('admin_registrations&role=admin&username=Giaovien1')[0]==403
            for reference in references:assert student.call('admin_registration&reference='+reference+'&role=admin')[0]==403
            assert image(student,proof_url+'&role=admin')[0]==404
            # Permissions and active status are checked in the database on every request.
            db.execute("UPDATE users SET role='student' WHERE username='Giaovien3'");db.commit()
            assert admins[2].call('admin_registrations')[0]==403
            assert db.execute("SELECT role FROM users WHERE username='Giaovien3'").fetchone()[0]=='student'
            db.execute("UPDATE users SET role='admin',active=0 WHERE username='Giaovien3'");db.commit()
            assert admins[2].call('admin_registrations')[0]==401
            fresh_password=secrets.token_urlsafe(20)
            account_tool(['set-password','Giaovien2'],payload={'password':fresh_password})
            assert admins[1].call('admin_registrations')[0]==401
            before_cookie=next(c.value for c in admins[0].cookies if c.name=='thvp_lms_CB_01')
            assert admins[0].call('auth_logout',{})[0]==200
            assert admins[0].call('auth_user')[1]['user'] is None and admins[0].call('admin_registrations')[0]==401
            assert next(c.value for c in admins[0].cookies if c.name=='thvp_lms_CB_01')==before_cookie
            assert image(admins[0],proof_url)[0]==200  # owner access remains after admin logout
            assert image(admins[0],other_same_class_url)[0]==404
            assert admins[0].call('session')[1]['csrf']==admins[0].csrf
            assert db.execute('SELECT * FROM lms_registrations ORDER BY id').fetchall()==before_profiles
            assert db.execute('SELECT COUNT(*) FROM lms_payments').fetchone()[0]==0
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments').fetchone()[0]==0
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and not db.execute('PRAGMA foreign_key_check').fetchall()
            print('PASS: filters/pagination/empty/no-image cases, student denial, live DB role/active checks, password-change revocation, logout revocation while owner cookies survive, read-only profiles and no enrollment/payment mutations.')

            legacy_path=folder/'legacy.sqlite';legacy=sqlite3.connect(legacy_path)
            legacy.execute('CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT UNIQUE,fullname TEXT,role TEXT,password TEXT NOT NULL)')
            existing_hash=encoded
            legacy.execute("INSERT INTO users VALUES (42,'Giaovien1','Old requested identity','student',?)",(existing_hash,))
            legacy.execute("INSERT INTO users VALUES (43,'OldAdmin','Existing other admin','admin',?)",(existing_hash,));legacy.commit()
            legacy.execute("INSERT INTO users VALUES (44,'LegacyPlain','Existing local student','student',?)",(student_password,));legacy.commit()
            legacy_env=dict(env,THVP_LMS_DB=str(legacy_path))
            old_list=json.loads(account_tool(['list'],legacy_env))['accounts']
            assert any(r['username']=='OldAdmin' and r['fullname']=='Existing other admin' and r['role']=='admin' for r in old_list)
            assert legacy.execute('SELECT password FROM users WHERE id=42').fetchone()[0]==existing_hash
            old_client=Client(start(legacy_env))
            assert old_client.call('auth_login',{'username':'Giaovien1','password':student_password})[0]==200
            assert old_client.call('admin_registrations')[0]==200
            assert old_client.call('admin_registrations')[1]['items']==[]
            assert legacy.execute('SELECT password FROM users WHERE id=43').fetchone()[0]==existing_hash
            plain_client=Client(old_client.base)
            assert plain_client.call('auth_login',{'username':'LegacyPlain','password':student_password})[1]['user']['role']=='student'
            assert legacy.execute("SELECT password_hash FROM users WHERE username='LegacyPlain'").fetchone()[0].startswith('$2y$')
            assert plain_client.call('admin_registrations')[0]==403
            print('PASS: pre-existing users table/password preserved, requested name/role unified once, other old admin identity preserved; no duplicate account store.')
        finally:
            if db is not None:db.close()
            if legacy is not None:legacy.close()
            for process in processes:process.terminate()
            for process in processes:process.wait(timeout=10)


if __name__=='__main__':main()
