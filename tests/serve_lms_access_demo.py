"""Temporary browser demo: separate SQLite, local TLS SMTP and a fake approved profile."""
import sys
sys.dont_write_bytecode=True
import argparse
import base64
from email import policy
from email.parser import BytesParser
import getpass
import json
import os
from pathlib import Path
import secrets
import shutil
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.request
from test_lms_http import ROOT,PHP,Client,body,port
from test_lms_mail_http import FakeSMTP
from test_lms_evidence_http import upload


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--smoke',action='store_true');options=parser.parse_args()
    password=secrets.token_urlsafe(20) if options.smoke else getpass.getpass('Nhap mat khau admin THU (12-72 byte; khong dung mat khau that): ')
    if len(password)<12 or len(password.encode())>72:raise SystemExit('Mat khau thu phai tu 12 ky tu, toi da 72 byte UTF-8.')
    process=None;smtp=None
    with tempfile.TemporaryDirectory(prefix='thvp-browser-demo-') as temporary:
        folder=Path(temporary);inbox=folder/'inbox';inbox.mkdir()
        env=dict(os.environ,THVP_LMS_DB=str(folder/'demo.sqlite'),THVP_LMS_MAIL_CONFIG=str(folder/'mail.json'),
          THVP_LMS_PAYMENT_CONFIG=str(folder/'bank.json'),THVP_LMS_EVIDENCE_DIR=str(folder/'evidence'),THVP_LMS_ACCESS_KEY=str(folder/'mail.key'))
        openssl=shutil.which('openssl') or r'C:\msys64\ucrt64\bin\openssl.exe'
        def command(*args):subprocess.run([openssl,*args],cwd=folder,check=True,capture_output=True)
        command('req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=LMS DEMO CA','-keyout','ca.key','-out','ca.pem','-addext','basicConstraints=critical,CA:TRUE')
        command('req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout','smtp.key','-out','smtp.csr')
        (folder/'ext.txt').write_text('subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',encoding='ascii')
        command('x509','-req','-in','smtp.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1','-out','smtp.pem','-extfile','ext.txt')
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(folder/'smtp.pem',folder/'smtp.key')
        smtp_password=secrets.token_urlsafe(24);smtp=FakeSMTP(context,'demo-smtp',smtp_password)
        lock=threading.Lock()
        class Inbox(list):
            def append(self,message):
                with lock:
                    # Received fake messages, not application logs/outbox; never used with real data.
                    filename='message-'+secrets.token_hex(8)
                    (inbox/(filename+'.eml')).write_bytes(message)
                    text=BytesParser(policy=policy.default).parsebytes(message).get_body(preferencelist=('plain',)).get_content()
                    (inbox/(filename+'.txt')).write_text(text,encoding='utf-8')
                    super().append(message)
        smtp.messages=Inbox()
        base='http://127.0.0.1:'+str(port())
        (folder/'mail.json').write_text(json.dumps(dict(enabled=True,smtp_host='127.0.0.1',smtp_port=smtp.server_address[1],smtp_encryption='tls',smtp_username='demo-smtp',
          smtp_password=smtp_password,from_email='sender@example.test',from_name='LMS DEMO',base_url=base,timeout_seconds=3)),encoding='utf-8')
        (folder/'bank.json').write_text(json.dumps(dict(bank_name='DEMO ONLY',bank_bin='970436',account_number='123456789',account_name='DEMO ONLY')),encoding='utf-8')
        try:
            process=subprocess.Popen([str(PHP),'-d','extension=gd','-d','display_errors=0','-d','openssl.cafile='+str(folder/'ca.pem'),'-S',base.removeprefix('http://'),
              '-t',str(ROOT),str(ROOT/'router.php')],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            for _ in range(100):
                try:urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                except OSError:time.sleep(.05)
            admin=Client(base)
            for username in ['Giaovien1','Giaovien2','Giaovien3']:
                subprocess.run([str(PHP),str(ROOT/'lms-server/admin-accounts.php'),'set-password',username],input=json.dumps({'password':password}).encode(),env=env,cwd=ROOT,check=True,capture_output=True)
            assert admin.call('auth_login',{'username':'Giaovien1','password':password})[0]==200
            owner=Client(base);status,data=owner.call('register',body('CB-01','browser-demo@example.test'));assert status==201
            ref=data['registration']['reference'];assert owner.call('payment&class_code=CB-01',{})[0]==200
            png=base64.b64decode(subprocess.check_output([str(PHP),'-d','extension=gd','-r','ob_start();imagepng(imagecreatetruecolor(8,8));echo base64_encode(ob_get_clean());'],cwd=ROOT))
            assert upload(owner,ref,'CB-01',png)[0]==201
            detail=admin.call('admin_registration&reference='+ref)[1]
            assert admin.call('admin_review',dict(reference=ref,version=detail['revision'],decision='approve',received_vnd=1500000,bank_transaction='DEMO-ONLY',funds_verified=True))[0]==200
            for page in ['quan-ly-dang-ky.html','dang-nhap-hoc-sinh.html','lop-hoc-cua-toi.html']:
                with urllib.request.urlopen(base+'/'+page) as response:assert response.status==200
            if options.smoke:
                assert smtp.messages==[]
                print('PASS: isolated browser demo starts, prepares one approved fake profile and all pages, sends no email automatically; main DB/config untouched.');return
            print('DEMO ONLY - Open in a private browser window (cookies share host across ports).')
            print('Admin: '+base+'/quan-ly-dang-ky.html')
            print('Accounts: Giaovien1 / Giaovien2 / Giaovien3; use the test password you just entered.')
            print('Student login: '+base+'/dang-nhap-hoc-sinh.html')
            print('Fake received email files (.eml): '+str(inbox))
            print('Optional failure test: edit enabled=false in '+str(folder/'mail.json')+' before granting, then restore true and retry.')
            print('No external mail or real money. Temporary data removed on Ctrl+C.')
            while True:time.sleep(.5)
        except KeyboardInterrupt:pass
        finally:
            if process is not None:process.terminate();process.wait(timeout=10)
            if smtp is not None:smtp.close()


if __name__=='__main__':main()
