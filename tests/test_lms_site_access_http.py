"""Public previews + unified PHP entitlement. Isolated DB; never uses main users or SMTP."""
import sys
sys.dont_write_bytecode=True
import json
import os
import secrets
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from test_lms_http import ROOT, PHP, Client, body, port

FEATURES=['on-luyen-thi-thu.html','luyen-go-phim.html','kiem-tra-ban-phim.html','tra-cuu-phim-tat.html','tim-hieu-ban-phim.html','dien-dan.html']

def fetch(client, file):
    try: response=client.http.open(client.base+'/'+file,timeout=20)
    except urllib.error.HTTPError as error: response=error
    return response.status,response.read().decode('utf-8'),response.headers

def main():
    process=None;db=None
    with tempfile.TemporaryDirectory(prefix='thvp-site-access-') as temporary:
        folder=Path(temporary);dbpath=folder/'test.sqlite';base='http://127.0.0.1:'+str(port())
        env=dict(os.environ,THVP_LMS_DB=str(dbpath),THVP_LMS_PAYMENT_CONFIG=str(folder/'no-bank.json'),THVP_LMS_MAIL_CONFIG=str(folder/'no-mail.json'))
        password=secrets.token_urlsafe(24)
        try:
            process=subprocess.Popen([str(PHP),'-S',base.removeprefix('http://'),'-t',str(ROOT),str(ROOT/'router.php')],env=env,cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            for _ in range(100):
                try:urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                except OSError:time.sleep(.05)
            guest=Client(base);assert guest.call('site_access')[1]['can_use_features'] is False
            admins=[]
            for i in range(1,4):
                subprocess.run([str(PHP),str(ROOT/'lms-server/admin-accounts.php'),'set-password','Giaovien'+str(i)],input=json.dumps({'password':password}).encode(),env=env,check=True,capture_output=True)
                admin=Client(base);assert admin.call('auth_login',dict(username='Giaovien'+str(i),password=password,expected_role='admin'))[0]==200;admins.append(admin)
                assert admin.call('site_access')[1]['can_use_features'] is True
                assert [x['code'] for x in admin.call('learning_classes&scope=mine')[1]['classes']]==['CB-0'+str(i),'NC-0'+str(i)]
            db=sqlite3.connect(dbpath);db.execute('PRAGMA foreign_keys=ON')
            hashed=db.execute("SELECT password_hash FROM users WHERE username='Giaovien1'").fetchone()[0]
            for username,role,change in [('Enrolled','student',0),('Unenrolled','student',0),('Pending','student',1),('LegacyAdmin','admin',0)]:
                db.execute('INSERT INTO users(username,fullname,password_hash,role,must_change_password) VALUES (?,?,?,?,?)',(username,'Fixture only',hashed,role,change))
            for username in ['Enrolled','Pending']:
                db.execute('INSERT INTO lms_enrollments(class_code,email,user_id) SELECT ?,?,id FROM users WHERE username=?',('CB-01',username.lower()+'@example.test',username))
            db.commit();students={}
            for username in ['Enrolled','Unenrolled','Pending','LegacyAdmin']:
                c=Client(base);assert c.call('auth_login',dict(username=username,password=password))[0]==200;students[username]=c
            for c in [guest,students['Unenrolled'],students['Pending'],students['LegacyAdmin']]:
                assert c.call('site_access&role=admin&username=Giaovien1')[1]['can_use_features'] is False
                for feature in FEATURES:
                    status,html,headers=fetch(c,feature)
                    assert status==200 and 'data-lms-feature-preview="true"' in html
                    assert 'khoa-hoc-lms.html#gioi-thieu' in html and 'THVP_SERVER_ACCESS' not in html
                    assert 'no-store' in headers['Cache-Control'] and 'Cookie' in headers['Vary']
                assert fetch(c,'dien-dan.js')[0]==403
            for c in [guest,*students.values()]:
                for file in ['index.html','lo-trinh-hoc-tap.html','khoa-hoc-lms.html','gioi-thieu-khoa-hoc.html?khoa=co-ban','dang-ky-khoa-hoc.html?lop=CB-01']:
                    status,html,_=fetch(c,file);assert status==200 and 'data-lms-feature-preview="true"' not in html
            member=students['Enrolled'];assert member.call('site_access')[1]['can_use_features'] is True
            for c in [*admins,member]:
                for feature in FEATURES:
                    status,html,_=fetch(c,feature)
                    assert status==200 and 'THVP_SERVER_ACCESS' in html and 'data-lms-feature-preview="true"' not in html
                assert fetch(c,'dien-dan.js')[0]==200
            for feature in ['luyen-go-phim.html','LUYEN-GO-PHIM.HTML','//luyen-go-phim.html','./luyen-go-phim.html','x/../luyen-go-phim.html','%2elms/luyen-go-phim.html']:
                status,html,_=fetch(guest,feature)
                assert status in (200,404) and (status==404 or 'data-lms-feature-preview="true"' in html),(feature,status)
            assert [x['code'] for x in member.call('learning_classes&scope=mine')[1]['classes']]==['CB-01']
            assert member.call('learning_class&class_code=NC-01&role=admin')[0]==404
            assert guest.call('admin_registrations')[0]==401 and member.call('admin_registrations')[0]==403
            assert guest.call('auth_login',dict(username='Giaovien1',password=password),csrf='bad')[0]==403
            assert member.call('auth_login',dict(username='Enrolled',password=password,expected_role='admin'))[0]==403
            print('PASS: three teachers retain own two classes/all-six management; student sees own class; guests, unenrolled, pending-password, legacy admin cannot use features or spoof role; public introduction/registration accessible.')
            db.execute("UPDATE lms_enrollments SET active=0 WHERE user_id=(SELECT id FROM users WHERE username='Enrolled')");db.commit()
            assert member.call('site_access')[1]['reason']=='enrollment_required' and 'data-lms-feature-preview="true"' in fetch(member,FEATURES[0])[1]
            db.execute("UPDATE lms_enrollments SET active=1,cycle_id=2 WHERE user_id=(SELECT id FROM users WHERE username='Enrolled')");db.commit()
            assert member.call('site_access')[1]['can_use_features'] is False
            db.execute("UPDATE lms_enrollments SET cycle_id=1 WHERE user_id=(SELECT id FROM users WHERE username='Enrolled')");db.commit()
            db.execute("INSERT INTO lms_class_lifecycle(class_code,state) VALUES ('CB-01','completed') ON CONFLICT(class_code) DO UPDATE SET state='completed'");db.commit()
            assert member.call('site_access')[1]['can_use_features'] is False
            assert admins[0].call('site_access')[1]['can_use_features'] is True
            db.execute("UPDATE lms_class_lifecycle SET state='ready' WHERE class_code='CB-01'");db.commit()
            db.execute("UPDATE users SET active=0 WHERE username='Enrolled'");db.commit()
            assert member.call('site_access')[1]['user'] is None
            db.execute("UPDATE users SET active=1 WHERE username='Enrolled'");db.commit()
            # Old cookie scope upgrades to root; registration token survives logout.
            owner=Client(base);assert owner.call('register',body(email='owner@example.test'))[0]==201
            record=owner.call('registration&class_code=CB-01')[1]
            private=next(c for c in owner.cookies if c.name=='thvp_lms_CB_01');private_value=private.value
            session=next(c for c in owner.cookies if c.name=='THVP_LMS_SESSION');owner.cookies.clear(session.domain,session.path,session.name);session.path='/lms-api.php';owner.cookies.set_cookie(session)
            old_session=folder/'sessions'/('sess_'+session.value)
            old_session.write_bytes(old_session.read_bytes().replace(b'cookie_scope_v2|b:1;',b''))
            assert owner.call('session')[0]==200
            assert any(c.name=='THVP_LMS_SESSION' and c.path=='/' for c in owner.cookies)
            assert not any(c.name=='THVP_LMS_SESSION' and c.path=='/lms-api.php' for c in owner.cookies)
            assert owner.call('auth_login',dict(username='Giaovien1',password=password))[0]==200
            assert owner.call('auth_logout',{})[0]==200
            assert owner.call('site_access')[1]['can_use_features'] is False
            assert owner.call('registration&class_code=CB-01')[1]==record
            assert next(c for c in owner.cookies if c.name=='thvp_lms_CB_01').value==private_value
            print('PASS: revoked membership/account/current cycle enforced live; cookie migration; logout revokes features without deleting private registration cookie; CSRF/admin boundaries intact.')
            if '--browser' in sys.argv:
                payload=dict(base_url=base,password=password,screenshots=str(ROOT.parent/'.lms-permissions-checks'))
                result=subprocess.run(['node',str(ROOT/'tests/test_lms_site_access_browser.cjs')],input=json.dumps(payload).encode(),cwd=ROOT,capture_output=True,timeout=180)
                print(result.stdout.decode(errors='replace').strip())
                if result.returncode:print(result.stderr.decode(errors='replace').strip());raise AssertionError('Browser check failed')
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and not db.execute('PRAGMA foreign_key_check').fetchall()
            print('PASS: SQLite integrity/foreign keys; no real email or main DB writes.')
        finally:
            if db is not None:db.close()
            if process:process.terminate();process.wait(timeout=10)

if __name__=='__main__':main()
