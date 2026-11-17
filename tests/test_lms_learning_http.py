"""Shared classroom and content authorization. Two PHP processes, isolated SQLite only."""
import sys
sys.dont_write_bytecode=True
import concurrent.futures
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import tempfile
import threading
import time
import urllib.request
from test_lms_http import ROOT,PHP,Client,body,port


def main():
    processes=[];db=None
    with tempfile.TemporaryDirectory(prefix='thvp-learning-') as temporary:
        folder=Path(temporary);db_path=folder/'test.sqlite'
        env=dict(os.environ,THVP_LMS_DB=str(db_path),THVP_LMS_MAIL_CONFIG=str(folder/'unused-mail.json'),THVP_LMS_PAYMENT_CONFIG=str(folder/'unused-bank.json'))
        bases=['http://127.0.0.1:'+str(port()) for _ in range(2)]
        password=secrets.token_urlsafe(20)
        try:
            for base in bases:
                processes.append(subprocess.Popen([str(PHP),'-d','display_errors=0','-S',base.removeprefix('http://'),'-t',str(ROOT),str(ROOT/'router.php')],
                  env=env,cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
            for base in bases:
                for _ in range(100):
                    try:urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                    except OSError:time.sleep(.05)
            guest=Client(bases[0]);admins=[]
            for i in range(1,4):
                subprocess.run([str(PHP),str(ROOT/'lms-server/admin-accounts.php'),'set-password','Giaovien'+str(i)],input=json.dumps({'password':password}).encode(),env=env,cwd=ROOT,check=True,capture_output=True)
                client=Client(bases[(i-1)%2]);assert client.call('auth_login',{'username':'Giaovien'+str(i),'password':password})[0]==200;admins.append(client)
            db=sqlite3.connect(db_path);db.execute('PRAGMA foreign_keys=ON')
            hashed=db.execute("SELECT password_hash FROM users WHERE username='Giaovien1'").fetchone()[0]
            for username,role,change in [('LearnerA','student',0),('LearnerB','student',0),('LearnerPending','student',1),('OtherAdmin','admin',0)]:
                db.execute('INSERT INTO users(username,fullname,password_hash,role,must_change_password) VALUES (?,?,?,?,?)',(username,'Fixture only',hashed,role,change))
            for username,code in [('LearnerA','CB-01'),('LearnerB','NC-01'),('LearnerPending','CB-01')]:
                db.execute('INSERT INTO lms_enrollments(class_code,email,user_id,active) SELECT ?,?,id,1 FROM users WHERE username=?',(code,username.lower()+'@example.test',username))
            db.commit()
            learners=[]
            for username in ['LearnerA','LearnerB','LearnerPending','OtherAdmin']:
                client=Client(bases[1]);assert client.call('auth_login',{'username':username,'password':password})[0]==200;learners.append(client)
            a,b,pending,other=learners
            classes_before=db.execute('SELECT * FROM lms_classes ORDER BY code').fetchall()
            users_before=db.execute('SELECT * FROM users ORDER BY id').fetchall()
            enrollments_before=db.execute('SELECT * FROM lms_enrollments ORDER BY id').fetchall()
            assert all(db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]==0 for table in ['lms_class_pages','lms_topics','lms_text_lessons'])
            def read(client=admins[0],code='CB-01',edit=True):
                status,data=client.call('learning_class&class_code='+code+'&editing='+('1' if edit else '0'));assert status==200,data
                return data
            def write(action,payload,admin=admins[0],expected=200):
                status,data=admin.call(action,payload);assert status==expected,data
                return data
            def topic_create(title,code='CB-01',admin=admins[0]):
                data=read(admin,code);write('content_topic_create',dict(class_code=code,structure_version=data['page']['structure_revision'],title=title,description='Mô tả\nGiữ xuống dòng'),admin)
                return read(admin,code)['topics'][-1]
            def topic(ident,code='CB-01'):return next(t for t in read(code=code)['topics'] if t['id']==ident)
            def lesson_create(parent,title='Bài thử',text='Nội dung bản nháp',code='CB-01',admin=admins[0]):
                parent=topic(parent['id'],code)
                write('content_lesson_create',dict(class_code=code,topic_id=parent['id'],version=parent['revision'],title=title,body=text),admin)
                return topic(parent['id'],code)['lessons'][-1]
            def lesson_save(parent,lesson,status='published',code='CB-01',admin=admins[0],text=None):
                write('content_lesson_save',dict(class_code=code,id=lesson['id'],topic_id=parent['id'],version=lesson['revision'],title=lesson['title'],body=text if text is not None else lesson['body'],status=status),admin)
                return next(l for l in topic(parent['id'],code)['lessons'] if l['id']==lesson['id'])
            def visibility(parent,value,code='CB-01'):
                parent=topic(parent['id'],code)
                write('content_topic_save',dict(class_code=code,id=parent['id'],version=parent['revision'],title=parent['title'],description=parent['description'],visible=value))
            assert guest.call('learning_classes')[0]==401 and guest.call('learning_class&class_code=CB-01')[0]==401
            assert pending.call('learning_classes')[0]==423 and pending.call('learning_class&class_code=CB-01')[0]==423
            assert other.call('learning_classes')[0]==403
            assert [r['code'] for r in a.call('learning_classes')[1]['classes']]==['CB-01']
            assert [r['code'] for r in a.call('learning_classes&scope=mine')[1]['classes']]==['CB-01']
            assert a.call('learning_classes&scope=invalid')[0]==422
            # Login choice verifies the existing DB role; it cannot replace or elevate it.
            assert a.call('auth_login',dict(username='LearnerA',password=password,expected_role='admin'))[0]==403
            assert a.call('auth_user')[1]['user']['role']=='student'
            assert admins[0].call('auth_login',dict(username='Giaovien1',password=password,expected_role='student'))[0]==403
            assert admins[0].call('auth_user')[1]['user']['username']=='Giaovien1'
            assert guest.call('auth_login',dict(username='LearnerA',password=password,expected_role='teacher'))[0]==422
            assert guest.call('auth_user')[1]['user'] is None
            for username,role in [('Giaovien1','admin'),('LearnerA','student')]:
                chosen=Client(bases[0]);assert chosen.call('auth_login',dict(username=username,password=password,expected_role=role))[0]==200
                assert chosen.call('auth_user')[1]['user']['role']==role
            assert a.call('learning_class&class_code=NC-01&role=admin&user_id=1')[0]==404
            # All three admins edit all six classes, regardless of assigned teacher.
            for index,admin in enumerate(admins,1):
                assert len(admin.call('learning_classes')[1]['classes'])==6
                assert [r['code'] for r in admin.call('learning_classes&scope=mine')[1]['classes']]==['CB-0'+str(index),'NC-0'+str(index)]
                for code in ['CB-01','CB-02','CB-03','NC-01','NC-02','NC-03']:
                    data=read(admin,code)
                    write('content_save_class',dict(class_code=code,version=data['page']['revision'],introduction='Giới thiệu lớp\nDòng hai',online_title='Vào lớp trực tuyến',online_url='https://example.test/meeting'),admin)
                    assert read(admin,code)['page']['introduction']=='Giới thiệu lớp\nDòng hai'
            print('PASS: teacher personal lists contain their two assigned classes, student list only enrolled classes; role choice verified against DB without session change on mismatch; three equal admins retain all-six editing; guest/other admin/unconverted password denied.')

            parent=topic_create('Chủ đề đầu tiên');xss='<script>window.__LMS_XSS=1</script>\n<img src=x onerror="window.__LMS_XSS=1">\nTiếng Việt nguyên vẹn'
            draft=lesson_create(parent,text='DRAFT_PRIVATE_MARKER '+xss)
            assert draft['status']=='draft'
            student=read(a,edit=False);assert student['topics'][0]['lessons']==[] and 'DRAFT_PRIVATE_MARKER' not in json.dumps(student)
            assert a.call('student_classes')[1]['classes'][0]['content_available'] is False
            assert read(admins[0],edit=False)['topics'][0]['lessons']==[]
            for client in [a,b,guest]:
                assert client.call('learning_lesson&class_code=CB-01&id='+str(draft['id']))[0] in [401,404]
            assert a.call('learning_class&class_code=CB-01&editing=1&role=admin')[0]==403
            assert a.call('learning_lesson&class_code=CB-01&editing=1&id='+str(draft['id']))[0]==403
            assert admins[0].call('learning_lesson&class_code=CB-01&editing=1&id='+str(draft['id']))[0]==200
            published=lesson_save(parent,draft,text=xss)
            assert read(a,edit=False)['topics'][0]['lessons'][0]['body']==xss
            assert a.call('student_class&class_code=CB-01')[1]['class']['content_available'] is True
            assert a.call('learning_lesson&class_code=CB-01&id='+str(draft['id']))[1]['lesson']['body']==xss
            hidden_marker='HIDDEN_TOPIC_MARKER'
            p=topic(parent['id']);write('content_topic_save',dict(class_code='CB-01',id=p['id'],version=p['revision'],title=p['title'],description=hidden_marker,visible=False))
            hidden=read(a,edit=False);assert hidden['topics']==[] and hidden_marker not in json.dumps(hidden)
            assert a.call('student_classes')[1]['classes'][0]['content_available'] is False
            assert a.call('learning_lesson&class_code=CB-01&id='+str(published['id']))[0]==404
            assert read(admins[1],edit=False)['topics']==[] and len(read(admins[1],edit=True)['topics'])==1
            published=lesson_save(parent,published,status='draft');visibility(parent,True)
            assert read(a,edit=False)['topics'][0]['lessons']==[]
            published=lesson_save(parent,published,text=xss)
            assert read(a,edit=False)['topics'][0]['lessons'][0]['body']==xss
            secret_parent=topic_create('Chủ đề ẩn riêng');secret_lesson=lesson_create(secret_parent,text='HIDDEN_LESSON_MARKER');secret_lesson=lesson_save(secret_parent,secret_lesson);visibility(secret_parent,False)
            private_draft=lesson_create(parent,text='DRAFT_PRIVATE_MARKER')
            print('PASS: drafts and hidden topic bodies never returned in student/default-view APIs, direct lesson IDs and forged editing flags blocked; publish/unpublish/hide/show persist after fresh reads; XSS stored as literal text.')

            third=topic_create('Chủ đề thứ ba');data=read();third=topic(third['id'])
            write('content_topic_move',dict(class_code='CB-01',id=third['id'],version=third['revision'],structure_version=data['page']['structure_revision'],direction='up'),admins[2])
            assert [r['id'] for r in read()['topics']]==[parent['id'],third['id'],secret_parent['id']]
            wrong_topic=topic_create('Lớp khác','NC-01');wrong_lesson=lesson_create(wrong_topic,code='NC-01')
            write('content_lesson_save',dict(class_code='CB-01',id=wrong_lesson['id'],topic_id=parent['id'],version=wrong_lesson['revision'],title='Không được sửa',body='bad',status='published'),expected=404)
            write('content_lesson_create',dict(class_code='CB-01',topic_id=wrong_topic['id'],version=wrong_topic['revision'],title='bad',body='bad'),expected=404)
            assert admins[0].call('learning_lesson&class_code=CB-01&editing=1&id='+str(wrong_lesson['id']))[0]==404
            data=read();base=dict(class_code='CB-01',version=data['page']['revision'],introduction='Giữ nguyên',online_title='Tên',online_url='https://example.test')
            for url in ['javascript:alert(1)','data:text/html,x','ftp://example.test/x','https://name:pass@example.test','https://example.test/a b','https://example.test\r\nx','not-a-url']:
                write('content_save_class',{**base,'online_url':url},expected=422)
            for payload in [{**base,'introduction':'a'*5001},{**base,'online_title':''},{**base,'online_url':''},{**base,'version':'1'}]:write('content_save_class',payload,expected=422)
            version=read()['page']['revision'];assert admins[0].call('content_save_class',base,csrf='wrong')[0]==403
            assert read()['page']['revision']==version
            for action in ['content_save_class','content_topic_create','content_topic_save','content_topic_move','content_lesson_create','content_lesson_save']:
                assert a.call(action,{'class_code':'CB-01','role':'admin'})[0]==403
                assert guest.call(action,{'class_code':'CB-01'})[0]==401
            stale=dict(class_code='CB-01',id=published['id'],topic_id=parent['id'],version=published['revision'],title='Stale',body='Should not replace',status='published')
            # The parent gained another lesson; lesson revision remains independent of parent ordering/version.
            current=next(l for l in topic(parent['id'])['lessons'] if l['id']==published['id']);stale['version']=current['revision']
            lesson_save(parent,current,admin=admins[1],text=xss+'\nNew revision')
            write('content_lesson_save',stale,expected=409)
            assert 'New revision' in a.call('learning_lesson&class_code=CB-01&id='+str(published['id']))[1]['lesson']['body']
            current=next(l for l in topic(parent['id'])['lessons'] if l['id']==published['id'])
            barrier=threading.Barrier(2)
            def race(pair):
                admin,text=pair;barrier.wait()
                return admin.call('content_lesson_save',dict(class_code='CB-01',id=current['id'],topic_id=parent['id'],version=current['revision'],title=current['title'],body=text,status='published'))
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(race,[(admins[0],xss+'\nAdmin one'),(admins[1],xss+'\nAdmin two')]))
            assert sorted(r[0] for r in results)==[200,409]
            assert next(l for l in topic(parent['id'])['lessons'] if l['id']==current['id'])['revision']==current['revision']+1
            print('PASS: ordered topics, scoped IDs, invalid URLs/lengths/types/CSRF denied, students cannot call writes; stale and concurrent admin edits return 409 rather than overwrite.')

            db.execute("UPDATE lms_enrollments SET active=0 WHERE user_id=(SELECT id FROM users WHERE username='LearnerA')");db.commit()
            assert a.call('learning_class&class_code=CB-01')[0]==404
            db.execute("UPDATE lms_enrollments SET active=1 WHERE user_id=(SELECT id FROM users WHERE username='LearnerA')");db.commit()
            db.execute("UPDATE users SET role='student' WHERE username='Giaovien3'");db.commit()
            assert admins[2].call('content_save_class',base)[0]==403
            db.execute("UPDATE users SET role='admin' WHERE username='Giaovien3'");db.commit()
            if '--browser' in sys.argv:
                payload=dict(base_url=bases[0],admin_username='Giaovien1',admin_password=password,student_username='LearnerA',student_password=password,
                  draft_id=private_draft['id'],hidden_id=secret_lesson['id'],screenshots=str(ROOT.parent/'.lms-learning-checks'))
                result=subprocess.run(['node',str(ROOT/'tests/test_lms_learning_browser.cjs')],input=json.dumps(payload).encode(),cwd=ROOT,capture_output=True,timeout=180)
                print(result.stdout.decode(errors='replace').strip())
                if result.returncode:print(result.stderr.decode(errors='replace').strip());raise AssertionError('Browser checks failed')
            assert db.execute('SELECT * FROM lms_classes ORDER BY code').fetchall()==classes_before
            assert db.execute('SELECT * FROM users ORDER BY id').fetchall()==users_before
            assert db.execute('SELECT * FROM lms_enrollments ORDER BY id').fetchall()==enrollments_before
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and db.execute('PRAGMA foreign_key_check').fetchall()==[]
            assert db.execute("SELECT COUNT(*) FROM lms_schema_migrations WHERE name='learning_content_v1'").fetchone()[0]==1
            assert db.execute('SELECT COUNT(*) FROM lms_access_grants').fetchone()[0]==0
            print('PASS: revoked enrollment/live DB role enforced, repeatable migration, six class records/accounts/enrollments preserved, SQLite integrity/foreign keys. No main DB, real SMTP or payment changes.')
        finally:
            if db is not None:db.close()
            for process in processes:process.terminate();process.wait(timeout=10)


if __name__=='__main__':main()
