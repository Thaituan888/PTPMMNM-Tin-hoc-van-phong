"""Local TLS+AUTH SMTP only. Does not send external mail or use the project's real DB/config."""
import sys
sys.dont_write_bytecode=True
import base64
from email import policy
from email.parser import BytesParser
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import socketserver
import sqlite3
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.request
from test_lms_http import ROOT, PHP, Client, body, port


class FakeSMTP(socketserver.ThreadingTCPServer):
    allow_reuse_address=True
    daemon_threads=True

    def __init__(self, context, username, password, mode='starttls'):
        self.context=context;self.username=username;self.password=password;self.mode=mode
        self.messages=[];self.authenticated=0;self.connected=0;self.events=[];self.stop_event=threading.Event()
        super().__init__(('127.0.0.1',0),SMTPHandler)
        self.thread=threading.Thread(target=self.serve_forever,daemon=True);self.thread.start()

    def close(self):
        self.stop_event.set();self.shutdown();self.server_close();self.thread.join(timeout=5)


class SMTPHandler(socketserver.BaseRequestHandler):
    def handle(self):
        server=self.server;connection=self.request;server.connected+=1
        if server.mode=='timeout':server.stop_event.wait(4);return
        secure=server.mode=='implicit'
        try:
            if secure:connection=server.context.wrap_socket(connection,server_side=True)
            connection.settimeout(6)
            stream=connection.makefile('rwb',buffering=0)
            def write(value):stream.write((value+'\r\n').encode('ascii'))
            def read():return stream.readline(8192).rstrip(b'\r\n')
            if server.mode=='unavailable':write('421 Service temporarily unavailable');stream.close();return
            write('220 localhost local test SMTP')
            authed=False
            while True:
                command=read()
                if not command:break
                upper=command.upper()
                server.events.append(upper.split(b' ',1)[0].decode('ascii',errors='replace'))
                if upper.startswith((b'EHLO ',b'HELO ')):
                    write('250-localhost')
                    if not secure:write('250-STARTTLS')
                    else:write('250-AUTH LOGIN PLAIN')
                    write('250 8BITMIME')
                elif upper==b'STARTTLS':
                    write('220 Start TLS');stream.close()
                    connection=server.context.wrap_socket(connection,server_side=True);secure=True
                    connection.settimeout(6);stream=connection.makefile('rwb',buffering=0)
                elif upper.startswith(b'AUTH LOGIN'):
                    assert secure
                    write('334 VXNlcm5hbWU6');username=base64.b64decode(read()).decode()
                    write('334 UGFzc3dvcmQ6');password=base64.b64decode(read()).decode()
                    authed=username==server.username and password==server.password
                    if authed:server.authenticated+=1;write('235 2.7.0 Authenticated')
                    else:write('535 5.7.8 Rejected credential '+password)  # malicious echo must never reach API/log
                elif upper.startswith(b'MAIL FROM:'):
                    write('250 Sender OK' if authed else '530 Authentication required')
                elif upper.startswith(b'RCPT TO:'):
                    write('250 Recipient OK' if authed else '530 Authentication required')
                elif upper==b'DATA':
                    write('354 End with dot');data=[]
                    while True:
                        line=stream.readline(65536)
                        if line in (b'.\r\n',b''):break
                        data.append(line[1:] if line.startswith(b'..') else line)
                    assert authed and secure
                    server.messages.append(b''.join(data));write('250 2.0.0 Accepted locally')
                elif upper==b'QUIT':write('221 Bye');break
                elif upper==b'RSET':write('250 Reset')
                else:write('502 Unsupported test command')
            stream.close()
        except (OSError,ValueError,ssl.SSLError) as error:
            server.events.append(type(error).__name__)  # No raw replies/credentials in diagnostics.
        finally:
            connection.close()


def main():
    servers=[];smtps=[];database=None
    with tempfile.TemporaryDirectory(prefix='thvp-mail-') as temporary:
        folder=Path(temporary);config_path=folder/'mail-config.json';db_path=folder/'test.sqlite'
        openssl=shutil.which('openssl') or r'C:\msys64\ucrt64\bin\openssl.exe'
        def cert_command(*args):
            subprocess.run([openssl,*args],cwd=folder,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        cert_command('req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=LMS LOCAL TEST CA',
                     '-keyout','ca.key','-out','ca.pem','-addext','basicConstraints=critical,CA:TRUE')
        cert_command('req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout','smtp.key','-out','smtp.csr')
        (folder/'extensions.txt').write_text('subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n',encoding='ascii')
        cert_command('x509','-req','-in','smtp.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1','-out','smtp.pem','-extfile','extensions.txt')
        mismatched_context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);mismatched_context.load_cert_chain(folder/'smtp.pem',folder/'smtp.key')
        (folder/'extensions.txt').write_text('subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',encoding='ascii')
        cert_command('x509','-req','-in','smtp.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1','-out','smtp-ip.pem','-extfile','extensions.txt')
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(folder/'smtp-ip.pem',folder/'smtp.key')
        password=secrets.token_urlsafe(24);username='local-auth-user'
        for mode in ['starttls','implicit','timeout']:
            smtps.append(FakeSMTP(context,username,password,mode))
        smtps.append(FakeSMTP(mismatched_context,username,password))
        smtps.append(FakeSMTP(context,username,password,'unavailable'))
        smtp,implicit,hanging,mismatched,unavailable=smtps
        settings=dict(enabled=True,smtp_host='127.0.0.1',smtp_port=smtp.server_address[1],smtp_encryption='tls',
                      smtp_username=username,smtp_password=password,from_email='sender@example.test',from_name='Tin học văn phòng',
                      base_url='http://127.0.0.1:8080',timeout_seconds=2)
        env=dict(os.environ,THVP_LMS_DB=str(db_path),THVP_LMS_MAIL_CONFIG=str(config_path))
        base='http://127.0.0.1:'+str(port());php_log=folder/'php.log';server_log=folder/'server.log'
        output=server_log.open('wb')
        try:
            servers.append(subprocess.Popen([str(PHP),'-d','display_errors=0','-d','log_errors=1','-d','error_log='+str(php_log),
                '-d','openssl.cafile='+str(folder/'ca.pem'),'-S',base.removeprefix('http://'),'-t',str(ROOT),str(ROOT/'router.php')],
                cwd=ROOT,env=env,stdout=output,stderr=output,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
            for _ in range(100):
                try:urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                except OSError:time.sleep(.05)
            guest=Client(base);admins=[]
            for i in range(1,4):
                subprocess.run([str(PHP),str(ROOT/'lms-server/admin-accounts.php'),'set-password','Giaovien'+str(i)],
                    input=json.dumps({'password':password}).encode(),env=env,cwd=ROOT,check=True,capture_output=True)
                admin=Client(base)
                assert admin.call('auth_login',{'username':'Giaovien'+str(i),'password':password})[0]==200
                admins.append(admin)
            database=sqlite3.connect(db_path);database.execute('PRAGMA foreign_keys=ON')
            for user,role in [('student_fixture','student'),('other_admin_fixture','admin')]:
                database.execute('INSERT INTO users(username,fullname,role,password_hash) SELECT ?,?,?,password_hash FROM users WHERE username=?',
                    (user,'Test only',role,'Giaovien1'))
            database.commit()
            student=Client(base);other=Client(base)
            for user,client in [('student_fixture',student),('other_admin_fixture',other)]:
                assert client.call('auth_login',{'username':user,'password':password})[0]==200
            assert guest.call('register',body())[0]==201
            tables=['users','lms_registrations','lms_payments','lms_evidence','lms_enrollments','lms_review_history']
            before={table:database.execute('SELECT * FROM '+table).fetchall() for table in tables}
            def write(values=settings):config_path.write_text(json.dumps(values,ensure_ascii=False),encoding='utf-8')
            def reset_rate():
                database.execute("DELETE FROM lms_rate_limits WHERE key LIKE 'mail:%'");database.commit()
            def status():
                code,data=admins[0].call('mail_status');assert code==200,data
                serialized=json.dumps(data)
                assert password not in serialized and username not in serialized and 'sender@example.test' not in serialized
                assert set(data['mail'])=={'state','enabled','configured','message','issues'}
                return data['mail']
            def send(client=admins[0],**kwargs):return client.call('mail_test',{'recipient':'recipient@example.test'},**kwargs)
            for client,expected in [(guest,401),(student,403),(other,403)]:
                assert client.call('mail_status&role=admin&username=Giaovien1')[0]==expected
                assert send(client)[0]==expected
            assert send(csrf='bad')[0]==403
            database.execute("UPDATE users SET role='student' WHERE username='Giaovien1'");database.commit()
            assert admins[0].call('mail_status&role=admin')[0]==403 and send()[0]==403
            database.execute("UPDATE users SET role='admin' WHERE username='Giaovien1'");database.commit()
            assert status()['state']=='missing';assert send()[0]==422
            write({});assert status()['state']=='disabled'
            write({**settings,'enabled':False});assert status()['state']=='disabled';assert send()[0]==422
            config_path.write_text('{"enabled":true,"smtp_password":"'+password,encoding='utf-8')
            assert status()['state']=='invalid';assert 'JSON' in send()[1]['error']
            config_path.write_bytes(b'\xef\xbb\xbf'+json.dumps(settings).encode());assert 'BOM' in ' '.join(status()['issues'])
            config_path.write_bytes(json.dumps(settings).encode('utf-16'));assert status()['state']=='invalid'
            config_path.write_text('[]',encoding='utf-8');assert status()['state']=='invalid'
            config_path.write_bytes(b' '*16385);assert status()['state']=='invalid'
            for field in ['smtp_host','smtp_port','smtp_encryption','smtp_username','smtp_password','from_email','from_name','base_url']:
                invalid={**settings};del invalid[field];write(invalid);assert status()['state']=='invalid',field
            for field,value in [('enabled','true'),('enabled',None),('smtp_port','587'),('smtp_port',0),('smtp_encryption','none'),
                ('smtp_host','localhost;example.test'),('from_email','bad\r\nBcc: hidden@example.test'),('from_name','Name\nInjected'),
                ('base_url','https://name:'+password+'@example.test'),('timeout_seconds',0)]:
                write({**settings,field:value});assert status()['state']=='invalid',field
            write({**settings,'SMTPOptions':{'ssl':{'verify_peer':False}}});assert status()['state']=='invalid'
            assert len(smtp.messages)==0
            print('PASS: missing/disabled/invalid JSON, UTF-8/BOM, required fields, TLS-only configuration, private path and three-admin allowlist; guest/student/other admin/CSRF denied; configuration API exposes no credentials.')

            write();reset_rate()
            for client in admins:
                assert client.call('mail_status')[1]['mail']['configured']
                code,result=send(client);assert code==200 and result['accepted_by_smtp'] is True,(result,smtp.events)
                assert result['message']=='Đã gửi qua SMTP; vui lòng kiểm tra hộp thư và thư rác'
            assert smtp.authenticated==3 and len(smtp.messages)==3
            parsed=BytesParser(policy=policy.default).parsebytes(smtp.messages[0])
            assert str(parsed['Subject'])=='Kiểm tra email LMS — Tin học văn phòng'
            assert 'Tin học văn phòng' in str(parsed['From'])
            assert parsed.is_multipart()
            plain=parsed.get_body(preferencelist=('plain',));html=parsed.get_body(preferencelist=('html',))
            for part in [plain,html]:
                assert part and part.get_content_charset().lower()=='utf-8'
                assert 'nội dung tiếng Việt' in part.get_content() and 'http://127.0.0.1:8080' in part.get_content()
                assert password not in part.get_content() and 'Nguyễn Văn Kiểm Thử' not in part.get_content()
            write({**settings,'smtp_port':implicit.server_address[1],'smtp_encryption':'ssl'})
            assert send()[0]==200 and implicit.authenticated==1 and len(implicit.messages)==1
            print('PASS: actual local SMTP authentication with trusted STARTTLS and implicit TLS, SMTP acceptance wording, UTF-8 Vietnamese subject/sender and multipart HTML + plain text; no student data or passwords in messages.')

            reset_rate()
            write({**settings,'smtp_password':'wrong-'+password})
            code,data=send();assert code==502 and data['code']=='smtp_auth',data
            assert password not in json.dumps(data) and 'wrong-'+password not in json.dumps(data)
            write({**settings,'smtp_port':port()})
            code,data=send();assert code in [502,504] and data['code'] in ['smtp_connect','smtp_timeout'],data
            write({**settings,'smtp_port':unavailable.server_address[1]})
            code,data=send();assert code==502 and data['code']=='smtp_connect',data
            write({**settings,'smtp_port':hanging.server_address[1],'timeout_seconds':1})
            started=time.monotonic();code,data=send()
            assert code==504 and data['code']=='smtp_timeout' and time.monotonic()-started<10,data
            # Certificate is valid for localhost only; direct IP must fail hostname verification.
            write({**settings,'smtp_port':mismatched.server_address[1]})
            code,data=send();assert code==502 and data['code']=='smtp_tls',data
            write()
            for recipient in ['', '  ', 'bad', 'a@example.test,b@example.test','a@example.test\r\nBcc:x@example.test']:
                assert admins[0].call('mail_test',{'recipient':recipient})[0]==422
            before_count=len(smtp.messages)
            for extra in [{'smtp_host':'attacker.example.test'},{'smtp_password':'attacker'},{'subject':'Injected'},{'bcc':'x@example.test'}]:
                assert admins[0].call('mail_test',{'recipient':'recipient@example.test',**extra})[0]==422
            assert len(smtp.messages)==before_count
            # Every failed configured request also consumes the shared rate-limit budget.
            reset_rate();write({**settings,'smtp_port':unavailable.server_address[1]})
            for _ in range(10):assert send()[0]==502
            assert send()[0]==429
            assert status()['configured']
            print('PASS: wrong auth, connection refused, bounded timeout, hostname/certificate verification, recipient/header-injection checks, rejected client SMTP overrides and server rate limiting; safe error categories, no echoed secret.')

            write()
            cli=subprocess.run([str(PHP),str(ROOT/'lms-server/check-mail-config.php')],env=env,cwd=ROOT,capture_output=True,check=True)
            decoded=json.loads(cli.stdout);assert decoded['configured'] and Path(decoded['config_path'])==config_path
            assert password.encode() not in cli.stdout+cli.stderr
            for unsafe_path in [str(ROOT/'lms-server/mail-config.example.json'),'relative-mail-config.json']:
                unsafe_env={**env,'THVP_LMS_MAIL_CONFIG':unsafe_path}
                invalid_cli=subprocess.run([str(PHP),str(ROOT/'lms-server/check-mail-config.php')],env=unsafe_env,cwd=ROOT,capture_output=True)
                assert invalid_cli.returncode==1 and json.loads(invalid_cli.stdout)['state']=='invalid'
            assert config_path.read_text(encoding='utf-8')==json.dumps(settings,ensure_ascii=False)
            assert {table:database.execute('SELECT * FROM '+table).fetchall() for table in tables}==before
            assert database.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert database.execute('PRAGMA foreign_key_check').fetchall()==[]
            assert admins[2].call('auth_logout',{})[0]==200 and admins[2].call('mail_status')[0]==401
            for url in ['/mail-config.json','/lms-server/mail-config.example.json','/lms-server/check-mail-config.php','/vendor/phpmailer/src/SMTP.php']:
                try:urllib.request.urlopen(base+url).close();raise AssertionError('Private route exposed')
                except urllib.error.HTTPError as error:assert error.code==404
            logs=(php_log.read_bytes() if php_log.exists() else b'')+server_log.read_bytes()
            for forbidden in [password,'wrong-'+password,base64.b64encode(password.encode()).decode(),base64.b64encode(('wrong-'+password).encode()).decode()]:
                assert forbidden.encode() not in logs
            print('PASS: safe local config checker, no profile/account/enrollment/payment/evidence/review changes, logout revokes mail access, private URLs blocked, no SMTP password in PHP/server logs, SQLite integrity/foreign keys. External email was never sent.')
        finally:
            if database is not None:database.close()
            for server in servers:server.terminate();server.wait(timeout=10)
            output.close()
            for smtp_server in smtps:smtp_server.close()


if __name__=='__main__':main()
