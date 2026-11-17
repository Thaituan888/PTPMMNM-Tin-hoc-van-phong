"""Payment tests use only a temporary database and an explicit temporary bank configuration."""
import sys
sys.dont_write_bytecode = True
import binascii
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
from test_lms_http import ROOT, PHP, Client, body, port


def fields(text):
    result = {}
    while text:
        key, length = text[:2], int(text[2:4])
        assert key not in result and len(text) >= 4 + length
        result[key] = text[4:4+length]
        text = text[4+length:]
    return result


def main():
    with tempfile.TemporaryDirectory(prefix='thvp-payment-') as directory:
        folder = Path(directory)
        config, db_path = folder/'bank.json', folder/'test.sqlite'
        env = dict(os.environ, THVP_LMS_DB=str(db_path), THVP_LMS_PAYMENT_CONFIG=str(config), THVP_LMS_HOLD_SECONDS='1800')
        base = 'http://127.0.0.1:' + str(port())
        server = subprocess.Popen([str(PHP), '-S', base.removeprefix('http://'), '-t', str(ROOT), str(ROOT/'router.php')],
                                  cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,
                                  creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(100):
                try:
                    urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                except OSError: time.sleep(0.05)
            alice, bob = Client(base), Client(base)
            status, created = alice.call('register',body('NC-01'))
            assert status == 201
            record = created['registration']
            assert record['fee_vnd']==2500000
            prices=alice.call('classes')[1]['classes']
            assert all(r['fee_vnd']==(2500000 if r['code'].startswith('NC-') else 1500000) for r in prices)
            db = sqlite3.connect(db_path)
            before = db.execute('SELECT id,expires_at,status FROM lms_registrations').fetchall()
            action = 'payment&class_code=NC-01'
            status, data = alice.call(action, {})
            assert status == 200 and data['payment']['configured'] is False
            assert data['payment']['message'] == 'Thông tin thanh toán chưa được cấu hình'
            assert 'qr_payload' not in data['payment']
            assert db.execute('SELECT COUNT(*) FROM lms_payments').fetchone()[0] == 0
            config.write_text((ROOT/'lms-server/payment-config.example.json').read_text(encoding='utf-8'),encoding='utf-8')
            assert alice.call(action,{})[1]['payment']['configured'] is False
            assert bob.call(action,{'reference':record['reference'],'email':record['email']})[0] == 404
            assert alice.call(action,{},csrf='wrong')[0] == 403
            cookie = next(c for c in alice.cookies if c.name == 'thvp_lms_NC_01')
            token = cookie.value; cookie.value = '0'*64
            assert alice.call(action,{})[0] == 404
            cookie.value = token
            # These values are synthetic test-only data, never written to the main DB/config.
            bank = dict(bank_name='Ngân hàng kiểm thử',bank_bin='970422',account_number='000000000000',account_name='TAI KHOAN KIEM THU')
            config.write_text(json.dumps(dict(bank,bank_bin='9704')),encoding='utf-8')
            invalid_config = alice.call(action,{})[1]['payment']
            assert not invalid_config['configured'] and '6' in invalid_config['configuration_error']
            assert 'qr_payload' not in invalid_config
            config.write_text(json.dumps(bank,ensure_ascii=False),encoding='utf-8')
            status, response = alice.call(action,{'amount_vnd':1,'transfer_content':'TAMPERED','bank_bin':'000000','account_number':'999'})
            payment = response['payment']
            assert status == 200 and payment['configured'] and payment['eligible']
            assert payment['bank'] == bank and payment['amount_vnd'] == 2500000
            assert payment['transfer_content'] == record['transfer_content']
            assert payment['reference'] == record['reference'] and not payment['payment_confirmed']
            payload = payment['qr_payload']
            assert payload[-4:] == f'{binascii.crc_hqx(payload[:-4].encode(),0xFFFF):04X}'
            top=fields(payload);merchant=fields(top['38']);account=fields(merchant['01'])
            assert top['00']=='01' and top['01']=='12' and top['53']=='704' and top['54']=='2500000' and top['58']=='VN'
            assert merchant['00']=='A000000727' and merchant['02']=='QRIBFTTA'
            assert account=={'00':bank['bank_bin'],'01':bank['account_number']}
            assert fields(top['62'])=={'08':record['transfer_content']}
            for secret in [record['fullname'],record['email'],record['phone'],token]: assert secret not in payload
            decoded = json.loads(subprocess.check_output(['node',str(ROOT/'tests/qr_roundtrip.cjs')],input=payload.encode(),cwd=ROOT))
            assert decoded['format']=='PNG' and decoded['decoded']==payload
            assert db.execute('SELECT COUNT(*) FROM lms_payments').fetchone()[0] == 1
            print('PASS: token/CSRF authorization, absent/blank bank config, server-owned amount/reference, valid VietQR TLV+CRC, production PNG renderer decoded independently by jsQR; no payer PII/token in QR.')

            changed = dict(bank,bank_bin='970436',account_number='111111111111',account_name='KHAC KIEM THU')
            config.write_text(json.dumps(changed,ensure_ascii=False),encoding='utf-8')
            for _ in range(4):
                again = alice.call(action,{})[1]['payment']
                assert again['bank']==bank and again['qr_payload']==payload
                assert again['expires_at']==payment['expires_at']
                assert alice.call('registration&class_code=NC-01')[1]==created
            config.unlink()
            assert alice.call(action,{})[1]['payment']['bank']==bank
            assert db.execute('SELECT id,expires_at,status FROM lms_registrations').fetchall()==before
            assert db.execute('SELECT COUNT(*) FROM lms_payments').fetchone()[0]==1
            # New profiles use the new config; old ones retain their recipient snapshot.
            config.write_text(json.dumps(changed),encoding='utf-8')
            assert bob.call('register',body('CB-02','other@example.test'))[0]==201
            other=bob.call('payment&class_code=CB-02',{})[1]['payment']
            assert other['bank']==changed
            assert other['amount_vnd']==1500000
            assert alice.call(action,{})[1]['payment']['bank']==bank
            # Simulate a pre-change advanced profile and legacy class prices.
            db.execute("UPDATE lms_registrations SET fee_vnd=1500000 WHERE class_code='NC-01'")
            db.execute("UPDATE lms_classes SET fee_vnd=1500000 WHERE code LIKE 'NC-%'")
            db.execute("DELETE FROM lms_schema_migrations WHERE name='advanced_fee_2500000_v1'");db.commit()
            prices=alice.call('classes')[1]['classes']
            assert all(r['fee_vnd']==2500000 for r in prices if r['code'].startswith('NC-'))
            legacy=alice.call(action,{})[1]['payment']
            assert legacy['amount_vnd']==1500000 and fields(legacy['qr_payload'])['54']=='1500000'
            assert legacy['bank']==bank and legacy['expires_at']==payment['expires_at']
            db.execute("UPDATE lms_registrations SET expires_at=? WHERE class_code='NC-01'",(int(time.time())-1,));db.commit()
            expired = alice.call(action,{})[1]['payment']
            assert not expired['eligible'] and expired['status']=='expired'
            assert 'qr_payload' not in expired and 'bank' not in expired and 'transfer_content' not in expired
            db.execute("UPDATE lms_registrations SET status='pending_review' WHERE class_code='CB-02'");db.commit()
            assert not bob.call('payment&class_code=CB-02',{})[1]['payment']['eligible']
            assert db.execute('SELECT COUNT(*) FROM lms_registrations').fetchone()[0]==2
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments').fetchone()[0]==0
            assert db.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 3
            assert db.execute("SELECT COUNT(*) FROM users WHERE role!='admin' OR password_hash IS NOT NULL").fetchone()[0] == 0
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
            db.close()
            print('PASS: recipient snapshot survives config replacement/removal, new profiles use new config, refresh/retry never create profiles or extend holds; expired/pending-review profiles receive no QR; SQLite and existing data preserved.')
        finally:
            server.terminate();server.wait(timeout=10)


if __name__ == '__main__': main()
