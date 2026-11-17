"""TLS probe regression: local certificates/server only; no AUTH, recipients or messages."""
import sys
sys.dont_write_bytecode=True
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import tempfile
from test_lms_http import ROOT,PHP
from test_lms_mail_http import FakeSMTP


def main():
    smtp_servers=[]
    with tempfile.TemporaryDirectory(prefix='thvp-tls-probe-') as temporary:
        folder=Path(temporary);openssl=shutil.which('openssl') or r'C:\msys64\ucrt64\bin\openssl.exe'
        def command(*args):
            subprocess.run([openssl,*args],cwd=folder,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        command('req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=LOCAL TEST CA',
                '-keyout','ca.key','-out','ca.pem','-addext','basicConstraints=critical,CA:TRUE')
        command('req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout','server.key','-out','server.csr')
        (folder/'ext.txt').write_text('subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',encoding='ascii')
        command('x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-days','1',
                '-out','server.pem','-extfile','ext.txt')
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(folder/'server.pem',folder/'server.key')
        config_path=folder/'mail-config.json'
        settings=dict(enabled=True,smtp_host='127.0.0.1',smtp_port=1,smtp_encryption='tls',smtp_username='private_fixture',
          smtp_password='PRIVATE_FIXTURE_NEVER_TRANSMIT',from_email='private@example.test',from_name='Private fixture',
          base_url='http://127.0.0.1:8080',timeout_seconds=2)
        env=dict(os.environ,THVP_LMS_DB=str(folder/'unused.sqlite'),THVP_LMS_MAIL_CONFIG=str(config_path))
        try:
            for mode,encryption in [('starttls','tls'),('implicit','ssl')]:
                server=FakeSMTP(context,settings['smtp_username'],settings['smtp_password'],mode);smtp_servers.append(server)
                settings.update(smtp_port=server.server_address[1],smtp_encryption=encryption)
                config_path.write_text(json.dumps(settings),encoding='utf-8')
                for trusted in [True,False]:
                    args=[str(PHP),'-d','display_errors=0']
                    if trusted:args+=['-d','openssl.cafile='+str(folder/'ca.pem')]
                    result=subprocess.run([*args,str(ROOT/'lms-server/diagnose-mail.php')],cwd=ROOT,env=env,capture_output=True,timeout=20)
                    data=json.loads(result.stdout)
                    assert result.returncode==(0 if trusted else 1),data
                    assert data['checks'][0]['tls_verified'] is trusted,data
                    assert data['verify_peer'] and data['verify_peer_name'] and not data['allow_self_signed']
                    assert data['authentication_attempted'] is False and data['mail_sent'] is False
                    for field in ['smtp_username','smtp_password','from_email','from_name']:
                        assert settings[field].encode() not in result.stdout+result.stderr
                assert server.authenticated==0 and server.messages==[]
                assert not any(command in server.events for command in ['AUTH','MAIL','RCPT','DATA']),server.events
            assert not (folder/'unused.sqlite').exists()
            print('PASS: real local STARTTLS/implicit TLS, trusted CA succeeds and unknown CA rejected, sanitized diagnostics, no AUTH/MAIL/RCPT/DATA or messages, no database opened.')
        finally:
            for server in smtp_servers:server.close()


if __name__=='__main__':main()
