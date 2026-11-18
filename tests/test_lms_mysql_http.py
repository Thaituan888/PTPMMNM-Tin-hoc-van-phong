"""Run against a disposable MySQL fixture imported from database-lms-infinityfree.sql.

THVP_LMS_HOSTING_CONFIG must point to its PHP connection configuration.
THVP_TEST_TEACHER_PASSWORDS is a JSON object of the three test teacher passwords.
The fixture student MysqlStudent uses Giaovien1's password and is enrolled in CB-01.
Never point this test at a production database: it creates learning content and registrations.
"""
import sys
sys.dont_write_bytecode = True
import concurrent.futures
import base64
import json
import os
import secrets
import subprocess
import time
import urllib.request
from test_lms_http import ROOT, PHP, Client, port, body
from test_lms_evidence_http import upload as upload_evidence


def main():
    assert os.environ.get('THVP_LMS_HOSTING_CONFIG'), 'Use a disposable test database configuration.'
    passwords = json.loads(os.environ['THVP_TEST_TEACHER_PASSWORDS'])
    servers = []
    logs = []
    bases = ['http://127.0.0.1:' + str(port()) for _ in range(2)]
    try:
        for i, base in enumerate(bases):
            log = open(ROOT / 'scratch' / f'mysql-http-{i}.log', 'w', encoding='utf-8')
            logs.append(log)
            servers.append(subprocess.Popen([str(PHP), '-d', 'extension=pdo_mysql', '-d', 'extension=gd', '-d', 'upload_max_filesize=8M', '-d', 'post_max_size=9M', '-d', 'display_errors=0',
                '-S', base[7:], '-t', str(ROOT), str(ROOT/'router.php')], env=os.environ.copy(),
                stdout=log, stderr=log, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
        for base in bases:
            for _ in range(100):
                try:
                    urllib.request.urlopen(base+'/index.html',timeout=1).close()
                    break
                except OSError:
                    time.sleep(.05)
        teachers=[]
        for i in range(1,4):
            c=Client(bases[(i-1)%2])
            status,result=c.call('auth_login', {'username':f'Giaovien{i}','password':passwords[f'Giaovien{i}'],'expected_role':'admin'})
            assert status==200,(status,result)
            assert c.call('auth_user')[1]['user']['role']=='admin'
            assert len(c.call('learning_classes')[1]['classes'])==6
            assert len(c.call('learning_classes&scope=mine')[1]['classes'])==2
            teachers.append(c)
        teacher=teachers[0]
        student=Client(bases[1])
        assert student.call('auth_login',{'username':'MysqlStudent','password':passwords['Giaovien1']})[0]==200
        assert student.call('content_save_class', {'class_code':'CB-01','version':0})[0]==403
        page=teacher.call('learning_class&class_code=CB-01&editing=1')[1]['page']
        data={'class_code':'CB-01','version':page['revision'],'introduction':'Nội dung MySQL tiếng Việt', 'online_title':'','online_url':''}
        assert teacher.call('content_save_class',data)[0]==200
        assert teachers[1].call('content_save_class',data)[0]==409
        page=student.call('learning_class&class_code=CB-01')[1]['page']
        assert page['introduction']==data['introduction']
        page=teacher.call('learning_class&class_code=CB-01&editing=1')[1]['page']
        assert teacher.call('content_topic_create',{'class_code':'CB-01','structure_version':page['structure_revision'],'title':'Chủ đề MySQL','description':''})[0]==200
        assert teacher.call('content_quiz_save', {'class_code':'CB-01','id':0,'version':0,'title':'Kiểm tra MySQL','status':'published',
            'questions':[{'text':'1 + 1 = ?','choices':['2','3'],'answer':0}]})[0]==200
        quiz=student.call('learning_quizzes&class_code=CB-01')[1]['quizzes'][0]
        assert 'answer' not in quiz['questions'][0]
        status,result=student.call('quiz_submit',{'class_code':'CB-01','id':quiz['id'],'version':quiz['revision'],'answers':[0]})
        assert status==200 and result['result']['correct_count']==1,(status,result)
        assert teacher.call('admin_registrations&status=pending_payment')[0]==200
        # Same email, two workers: admission remains serialized, not two valid holds.
        guests=[Client(bases[0]),Client(bases[1])]
        email=secrets.token_hex(8)+'@example.test'
        with concurrent.futures.ThreadPoolExecutor() as pool:
            results=list(pool.map(lambda c:c.call('register',body(email=email)),guests))
        assert sorted(s for s,_ in results)==[201,409],results
        winner=next(c for c,r in zip(guests,results) if r[0]==201)
        registration=next(r[1]['registration'] for r in results if r[0]==201)
        reference=registration['reference']
        status,payment=winner.call('payment&class_code=CB-01',{})
        assert status==200,(status,payment)
        image=subprocess.check_output([str(PHP),'-d','extension=gd'], input=b'<?php $im=imagecreatetruecolor(24,24); imagepng($im);')
        status,proof=upload_evidence(winner,reference,data=image)
        assert status==201,(status,proof)
        detail=teacher.call('admin_registration&reference='+reference)[1]
        status,review=teacher.call('admin_review',{'reference':reference,'version':detail['revision'],'decision':'approve','notes':'MySQL integration test','funds_verified':True})
        assert status==200,(status,review)
        detail=teacher.call('admin_registration&reference='+reference)[1]
        status,granted=teacher.call('admin_grant_access',{'reference':reference,'version':detail['revision']})
        assert status==200,(status,granted)
        assert teacher.call('admin_registration&reference='+reference)[1]['registration']['status']=='enrolled'
        # Lifecycle upsert and repeat replay exercise the second SQLite-specific upsert.
        life=teacher.call('class_lifecycle&class_code=NC-03')[1]['lifecycle']
        summary=teacher.call('class_lifecycle&class_code=NC-03')[1]
        if not summary['registration_open']:
            assert teacher.call('class_transition',{'class_code':'NC-03','version':life['revision'],'action':'reopen'})[0]==200
            life=teacher.call('class_lifecycle&class_code=NC-03')[1]['lifecycle']
        key=secrets.token_hex(32)
        payload={'class_code':'NC-03','version':life['revision'],'action':'close_registration'}
        assert teacher.call('class_transition',payload,key=key)[0]==200
        assert teacher.call('class_transition',payload,key=key)[0]==200
        print('PASS: MySQL three teacher logins, assigned classes, student access, content UTF-8, stale revisions, quiz grading, filtered admin list, concurrent registration capacity lock, payment QR snapshot, evidence upload, approval, new student grant, lifecycle upsert and replay. No SMTP delivery attempted.')
    finally:
        for p in servers:
            p.terminate()
            p.wait(timeout=10)
        for log in logs: log.close()


if __name__=='__main__': main()
