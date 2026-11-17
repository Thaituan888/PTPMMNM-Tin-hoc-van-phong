"""Read real configuration, but create/inspect profiles only in an isolated temporary database.
Never prints bank values, QR payloads, personal data or tokens.
"""
import sys
sys.dont_write_bytecode = True
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
from test_lms_http import ROOT, PHP, Client, body, port


def main():
    check = subprocess.run([str(PHP), str(ROOT/'lms-server/check-payment-config.php')],
                           capture_output=True, check=False, cwd=ROOT)
    report = json.loads(check.stdout)
    assert report['valid'], report['error']
    config_path, main_db = Path(report['config_path']), Path(report['database_path'])
    bank = json.loads(config_path.read_text(encoding='utf-8'))
    fingerprint = hashlib.sha256(main_db.read_bytes()).digest() if main_db.exists() else None
    with tempfile.TemporaryDirectory(prefix='thvp-configured-payment-') as folder:
        env = dict(os.environ, THVP_LMS_DB=str(Path(folder)/'test.sqlite'), THVP_LMS_PAYMENT_CONFIG=str(config_path))
        base = 'http://127.0.0.1:'+str(port())
        server = subprocess.Popen([str(PHP),'-S',base.removeprefix('http://'),'-t',str(ROOT),str(ROOT/'router.php')],
                                  cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                                  creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(100):
                try:
                    urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                except OSError:time.sleep(.05)
            client=Client(base)
            status,created=client.call('register',body())
            assert status==201
            status,result=client.call('payment&class_code=CB-01',{})
            payment=result['payment']
            assert status==200 and payment['configured'] and payment['eligible']
            assert payment['bank']=={k:v.strip() for k,v in bank.items()}
            assert payment['amount_vnd']==1500000 and payment['qr_payload']
            decoded=json.loads(subprocess.check_output(['node',str(ROOT/'tests/qr_roundtrip.cjs')],
                                input=payment['qr_payload'].encode(),cwd=ROOT))
            assert decoded['decoded']==payment['qr_payload'] and decoded['format']=='PNG'
            for _ in range(2):
                assert client.call('payment&class_code=CB-01',{})[1]['payment']['qr_payload']==payment['qr_payload']
            assert client.call('registration&class_code=CB-01')[1]==created
            db = sqlite3.connect(Path(folder)/'test.sqlite')
            try:
                assert db.execute('SELECT COUNT(*) FROM lms_registrations').fetchone()[0]==1
            finally:
                db.close()
            print('PASS: actual configured bank read by PHP, valid held test profile, HTTP payment=200/configured=true, PNG decoded, repeat preserves profile and expiry. No real transfer.')
        finally:
            server.terminate();server.wait(timeout=10)
    if fingerprint is not None:assert hashlib.sha256(main_db.read_bytes()).digest()==fingerprint
    print('PASS: main database byte fingerprint unchanged. Test data stayed in temporary SQLite.')


if __name__=='__main__':main()
