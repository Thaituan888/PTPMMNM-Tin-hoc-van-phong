"""Private fixtures only: classroom files, quiz imports, authorization and grading races."""
import sys
sys.dont_write_bytecode=True
import concurrent.futures
import json
import os
import secrets
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
from pathlib import Path
from test_lms_http import ROOT,PHP,Client,port

def upload(client,fields,data=None,name='lesson.txt',key=None,csrf=None):
    boundary='fixture'+secrets.token_hex(12);parts=[]
    for k,v in fields.items():parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    if data is not None:parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+data+b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    req=urllib.request.Request(client.base+'/lms-api.php?action=content_resource_save',data=b''.join(parts),headers={'Content-Type':'multipart/form-data; boundary='+boundary,'X-CSRF-Token':csrf or client.csrf,'Idempotency-Key':key or secrets.token_hex(32)})
    try:response=client.http.open(req,timeout=20)
    except urllib.error.HTTPError as e:response=e
    return response.status,json.loads(response.read())

def main():
    servers=[];db=None
    with tempfile.TemporaryDirectory(prefix='thvp-resources-') as tmp:
        folder=Path(tmp);env=dict(os.environ,THVP_LMS_DB=str(folder/'test.sqlite'),THVP_LMS_MAIL_CONFIG=str(folder/'unused.json'))
        bases=['http://127.0.0.1:'+str(port()) for _ in range(2)];password=secrets.token_urlsafe(24)
        try:
            for base in bases:servers.append(subprocess.Popen([str(PHP),'-d','display_errors=0','-d','upload_max_filesize=8M','-d','post_max_size=9M','-S',base[7:],'-t',str(ROOT),str(ROOT/'router.php')],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
            for base in bases:
                for _ in range(100):
                    try:urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                    except OSError:time.sleep(.05)
            guest=Client(bases[0]);admins=[]
            for i in range(1,4):
                subprocess.run([str(PHP),str(ROOT/'lms-server/admin-accounts.php'),'set-password','Giaovien'+str(i)],input=json.dumps({'password':password}).encode(),cwd=ROOT,env=env,check=True,capture_output=True)
                c=Client(bases[(i-1)%2]);assert c.call('auth_login',{'username':'Giaovien'+str(i),'password':password})[0]==200;admins.append(c)
            db=sqlite3.connect(folder/'test.sqlite');db.execute('PRAGMA foreign_keys=ON');hashed=db.execute("SELECT password_hash FROM users WHERE username='Giaovien1'").fetchone()[0]
            for name,code,change in [('StudentA','CB-01',0),('StudentB','NC-01',0),('Pending','CB-01',1)]:
                db.execute("INSERT INTO users(username,fullname,password_hash,role,must_change_password) VALUES (?,?,?,'student',?)",(name,name,hashed,change))
                uid=db.execute('SELECT id FROM users WHERE username=?',(name,)).fetchone()[0]
                db.execute('INSERT INTO lms_enrollments(class_code,email,user_id,active) VALUES (?,?,?,1)',(code,name+'@example.test',uid))
            db.commit();students=[]
            for name in ['StudentA','StudentB','Pending']:
                c=Client(bases[1]);assert c.call('auth_login',{'username':name,'password':password})[0]==200;students.append(c)
            a,b,pending=students
            baseline={t:db.execute('SELECT * FROM '+t+' ORDER BY id').fetchall() for t in ['users','lms_enrollments']}
            fields=dict(class_code='CB-01',kind='material',title='Tài liệu tiếng Việt',body='<script>literal</script>',url='',status='draft',id=0,version=0)
            for c in [guest,a]:assert upload(c,fields,b'hello')[0] in [401,403]
            assert upload(admins[0],fields,b'hello',csrf='wrong')[0]==403
            for name,data in [('fake.pdf',b'not pdf'),('x.php',b'<?php echo 1;'),('x.svg',b'<svg/>'),('x.txt',b'\xff\xfe')]:assert upload(admins[0],fields,data,name)[0]==422
            assert upload(admins[0],fields,b'x'*(5*1024*1024+1))[0]==413
            key=secrets.token_hex(32);s,r=upload(admins[0],fields,'Tài liệu UTF-8'.encode(),key=key);assert s==200,r;row=r['resource']
            assert 'storage_key' not in row
            assert upload(admins[0],fields,'Tài liệu UTF-8'.encode(),key=key)[1]['resource']['id']==row['id']
            assert db.execute('SELECT COUNT(*) FROM lms_class_resources').fetchone()[0]==1
            assert a.call('learning_resources&class_code=CB-01')[1]['resources']==[]
            assert a.call('learning_file&class_code=CB-01&id='+str(row['id']))[0]==404
            assert a.call('learning_resources&class_code=CB-01&editing=1')[0]==403
            assert pending.call('learning_resources&class_code=CB-01')[0]==423
            assert b.call('learning_resources&class_code=CB-01')[0]==404
            edited={**fields,'id':row['id'],'version':row['revision'],'status':'published'}
            assert upload(admins[1],edited)[0]==200
            assert upload(admins[2],edited)[0]==409
            read=a.http.open(a.base+'/'+row['download_url']);assert read.read()=='Tài liệu UTF-8'.encode();assert 'attachment' in read.headers['Content-Disposition']
            assert b.call('learning_file&class_code=NC-01&id='+str(row['id']))[0]==404
            assert guest.call('learning_file&class_code=CB-01&id='+str(row['id']))[0]==401
            for admin in admins:
                for code in ['CB-01','CB-02','CB-03','NC-01','NC-02','NC-03']:
                    assert upload(admin,{**fields,'class_code':code,'kind':'notice','status':'published','title':'Thông báo','body':'Nội dung'})[0]==200
            print('PASS: all three admins edit all six classes; files persist privately; MIME/extension/size/UTF-8, CSRF, draft/download/class authorization, idempotency and version conflicts enforced.')
            quiz=dict(class_code='CB-01',id=0,version=0,title='Bài kiểm tra',status='draft',questions=[dict(text='Sao chép?',choices=['Ctrl+C','Ctrl+V'],answer=0),dict(text='Dán?',choices=['Ctrl+C','Ctrl+V'],answer=1)])
            assert a.call('content_quiz_save',quiz)[0]==403
            assert admins[0].call('content_quiz_save',quiz,csrf='wrong')[0]==403
            assert admins[0].call('content_quiz_save',{**quiz,'questions':[dict(text='Q',choices=['A','B'],answer=9)]})[0]==422
            quiz_key=secrets.token_hex(32)
            assert admins[0].call('content_quiz_save',quiz,key=quiz_key)[0]==200
            assert admins[0].call('content_quiz_save',quiz,key=quiz_key)[0]==200
            assert db.execute('SELECT COUNT(*) FROM lms_quizzes').fetchone()[0]==1
            assert a.call('learning_quizzes&class_code=CB-01')[1]['quizzes']==[]
            q=admins[0].call('learning_quizzes&class_code=CB-01&editing=1')[1]['quizzes'][0]
            assert admins[1].call('content_quiz_save',{**quiz,'id':q['id'],'version':q['revision'],'status':'published'})[0]==200
            q=a.call('learning_quizzes&class_code=CB-01')[1]['quizzes'][0];assert all('answer' not in x for x in q['questions'])
            assert b.call('learning_quizzes&class_code=CB-01')[0]==404
            assert a.call('learning_quizzes&class_code=CB-01&editing=1')[0]==403
            submission=dict(class_code='CB-01',id=q['id'],version=q['revision'],answers=[0,0],score=10)
            assert a.call('quiz_submit',{**submission,'answers':[]})[0]==422
            assert a.call('quiz_submit',submission,csrf='wrong')[0]==403
            assert b.call('quiz_submit',{**submission,'class_code':'NC-01'})[0]==404
            second=Client(bases[0]);assert second.call('auth_login',{'username':'StudentA','password':password})[0]==200
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda c:c.call('quiz_submit',submission),[a,second]))
            assert all(x[0]==200 and x[1]['result']['correct_count']==1 and x[1]['result']['total']==2 for x in results)
            assert db.execute('SELECT COUNT(*) FROM lms_quiz_attempts').fetchone()[0]==1
            assert a.call('quiz_submit',{**submission,'answers':[0,1]})[1]['result']['correct_count']==1
            assert a.call('learning_quizzes&class_code=CB-01')[1]['quizzes'][0]['result']['correct_count']==1
            changed={**quiz,'id':q['id'],'version':q['revision'],'status':'published','questions':[dict(text='Changed',choices=['A','B'],answer=0)]}
            assert admins[2].call('content_quiz_save',changed)[0]==409
            for admin in admins:
                for code in ['CB-01','CB-02','CB-03','NC-01','NC-02','NC-03']:
                    assert admin.call('content_quiz_save',{**quiz,'class_code':code,'title':'Đề thử quyền mọi lớp'})[0]==200
            db.execute("UPDATE lms_enrollments SET active=0 WHERE user_id=(SELECT id FROM users WHERE username='StudentA')");db.commit()
            assert a.call('quiz_submit',submission)[0]==404
            db.execute("UPDATE lms_enrollments SET active=1 WHERE user_id=(SELECT id FROM users WHERE username='StudentA')");db.commit()
            for t,rows in baseline.items():assert db.execute('SELECT * FROM '+t+' ORDER BY id').fetchall()==rows
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok';assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
            for file in (folder/'learning-files').iterdir():
                try:guest.http.open(guest.base+'/learning-files/'+file.name);raise AssertionError('Private file became public')
                except urllib.error.HTTPError as error:assert error.code==404
            print('PASS: JSON quiz validation, unpublished/answer secrecy, class/password gates, server grading ignores forged score, concurrent/repeated submission stores one result, results survive reload, answered questions cannot be silently replaced; SQLite integrity/FKs and accounts/enrollments unchanged. No main DB or email touched.')
        finally:
            if db:db.close()
            for server in servers:server.terminate();server.wait(timeout=10)
if __name__=='__main__':main()
