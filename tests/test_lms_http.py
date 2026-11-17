"""Real HTTP tests: two PHP processes share an isolated SQLite DB outside the web root."""
import concurrent.futures
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PHP = Path(os.environ['LOCALAPPDATA']) / 'THVP/php/php.exe'


def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Client:
    def __init__(self, base):
        self.base = base
        self.cookies = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        status, data = self.call('session')
        assert status == 200, data
        self.csrf = data['csrf']

    def call(self, action, body=None, key=None, csrf=None):
        headers = {}
        if body is not None:
            headers = {'Content-Type': 'application/json', 'X-CSRF-Token': csrf if csrf is not None else self.csrf,
                       'Idempotency-Key': key or secrets.token_hex(32)}
        req = urllib.request.Request(self.base + '/lms-api.php?action=' + action,
                                     data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            response = self.http.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, json.loads(response.read())


def body(code='CB-01', email='learner@example.test'):
    return {'class_code': code, 'fullname': 'Nguyễn Văn Kiểm Thử', 'phone': '0901234567', 'email': email,
            'fee_vnd': 1, 'capacity': 99999, 'teacher': 'Tampered'}


def main():
    servers = []
    with tempfile.TemporaryDirectory(prefix='thvp-lms-http-') as temporary:
        db_path = Path(temporary) / 'test.sqlite'
        env = dict(os.environ, THVP_LMS_DB=str(db_path), THVP_LMS_HOLD_SECONDS='1800')
        bases = ['http://127.0.0.1:' + str(port()) for _ in range(2)]
        try:
            for base in bases:
                process = subprocess.Popen([str(PHP), '-S', base.removeprefix('http://'), '-t', str(ROOT), str(ROOT / 'router.php')],
                                           cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                           creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                servers.append(process)
            for base in bases:
                for _ in range(100):
                    try:
                        urllib.request.urlopen(base + '/index.html', timeout=1).close()
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.05)
                else:
                    raise AssertionError('PHP server failed to start')
            alice = Client(bases[0])
            bob = Client(bases[1])
            db = sqlite3.connect(db_path)
            db.execute('PRAGMA foreign_keys=ON')
            status, result = alice.call('classes')
            assert status == 200 and len(result['classes']) == 6
            assert all(row['remaining'] == 99 and row['fee_vnd'] == 1500000 for row in result['classes'])
            before_tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            assert 'users' in before_tables
            initial_accounts = db.execute('SELECT id,username,fullname,role,password_hash FROM users ORDER BY id').fetchall()
            assert len(initial_accounts) == 3 and all(row[3] == 'admin' and row[4] is None for row in initial_accounts)
            key = secrets.token_hex(32)
            request = body()
            status, result = alice.call('register', request, key)
            assert status == 201, result
            record = result['registration']
            assert record['fee_vnd'] == 1500000 and record['class']['teacher'] == 'Tống Hoàng Thiên'
            assert record['transfer_content'] == 'CB-01 DK000001' and record['payment_confirmed'] is False
            assert record['fullname'] == request['fullname']
            assert alice.call('register', request, key)[1] == result
            assert db.execute('SELECT COUNT(*) FROM lms_registrations').fetchone()[0] == 1
            assert alice.call('registration&class_code=CB-01')[1] == result
            assert alice.call('classes')[1]['classes'][0]['remaining'] == 98
            assert bob.call('register', request, key)[0] == 409  # stolen idempotency key cannot reveal a record
            assert bob.call('register', request)[0] == 409       # same email cannot reserve another seat
            assert bob.call('registration&class_code=CB-01')[0] == 404
            cookie = next(c for c in alice.cookies if c.name == 'thvp_lms_CB_01')
            token = cookie.value
            assert len(token) == 64 and cookie.has_nonstandard_attr('HttpOnly')
            assert token not in db_path.read_bytes().decode('latin1')
            cookie.value = 'f' * 64
            assert alice.call('registration&class_code=CB-01')[0] == 404
            cookie.value = token
            alice.cookies.clear(cookie.domain, cookie.path, cookie.name)
            assert alice.call('registration&class_code=CB-01')[0] == 404
            assert alice.call('register', request, key) == (200, result)  # recover from a lost first-response cookie
            assert alice.call('registration&class_code=CB-01')[1] == result
            db.execute("UPDATE lms_classes SET teacher='Snapshot test' WHERE code='CB-01'")
            db.commit()
            assert alice.call('registration&class_code=CB-01')[1]['registration']['class']['teacher'] == 'Tống Hoàng Thiên'
            db.execute("UPDATE lms_classes SET teacher=? WHERE code='CB-01'", ('Tống Hoàng Thiên',))
            db.commit()
            assert bob.call('register', body(email='csrf@example.test'), csrf='invalid')[0] == 403
            status, invalid = bob.call('register', dict(body(), fullname='  ', phone='123', email='wrong'))
            assert status == 422 and set(invalid['fields']) == {'name', 'phone', 'email'}
            assert bob.call('register', body('INVALID'))[0] == 422
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments').fetchone()[0] == 0
            assert db.execute('SELECT COUNT(*) FROM lms_registrations').fetchone()[0] == 1
            print('PASS: real create, authoritative fee/snapshot, idempotency, guest CSRF, validation, email uniqueness, private hashed token and reload GET; no additional users/enrollments created.')

            # Expiration returns the reserved seat without deleting/reusing the registration ID.
            db.execute('UPDATE lms_registrations SET expires_at=? WHERE id=1', (int(time.time()) - 1,))
            db.commit()
            assert alice.call('classes')[1]['classes'][0]['remaining'] == 99
            assert alice.call('registration&class_code=CB-01')[1]['registration']['status'] == 'expired'
            db.execute("UPDATE sqlite_sequence SET seq=120 WHERE name='lms_registrations'")
            db.commit()
            status, result = bob.call('register', body())
            assert status == 201 and result['registration']['reference'] == 'DK000121'
            assert db.execute('SELECT status FROM lms_registrations WHERE id=1').fetchone()[0] == 'expired'
            assert db.execute('SELECT expires_at-created_at FROM lms_registrations WHERE id=121').fetchone()[0] == 1800

            # Existing closure flags survive repeated migration calls.
            db.execute("UPDATE lms_classes SET registration_open=0 WHERE code='NC-03'")
            db.executemany('INSERT INTO lms_enrollments(class_code,email) VALUES (?,?)',
                           [('NC-02', f'fixture{i}@example.test') for i in range(99)])
            db.executemany('INSERT INTO lms_enrollments(class_code,email) VALUES (?,?)',
                           [('CB-03', f'fixture{i}@example.test') for i in range(98)])
            db.commit()
            fixtures_before = db.execute('SELECT COUNT(*) FROM lms_enrollments').fetchone()[0]
            states = {r['code']: r for r in alice.call('classes')[1]['classes']}
            assert states['NC-03']['availability'] == 'closed' and states['NC-02']['availability'] == 'full'
            assert bob.call('register', body('NC-03'))[0] == 409
            assert bob.call('register', body('NC-02'))[0] == 409
            contenders = [Client(base) for base in bases]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                futures = [pool.submit(c.call, 'register', body('CB-03', f'race{i}@example.test')) for i, c in enumerate(contenders)]
                statuses = sorted(f.result()[0] for f in futures)
            assert statuses == [201, 409], statuses
            state = next(r for r in alice.call('classes')[1]['classes'] if r['code'] == 'CB-03')
            assert state['active_students'] + state['valid_holds'] == 99
            assert state['availability'] == 'held_full'
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments').fetchone()[0] == fixtures_before
            assert db.execute('SELECT id,username,fullname,role,password_hash FROM users ORDER BY id').fetchall() == initial_accounts
            print('PASS: 30-minute expiry returns a seat, IDs exceed 99 without reuse, class closure persists, active-full and held-full states; two concurrent PHP processes cannot overbook the final seat.')

            limited = Client(bases[0])
            for _ in range(10):
                assert limited.call('register', dict(body(), email='invalid'))[0] == 422
            assert limited.call('register', body(email='limited@example.test'))[0] == 429
            # Pending review is a hold even after the former payment deadline.
            db.execute("UPDATE lms_registrations SET status='pending_review', expires_at=? WHERE id=121", (int(time.time()) - 1,))
            db.commit()
            assert alice.call('classes')[1]['classes'][0]['remaining'] == 98
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
            for path in ['/lms-server/classes.json', '/lms-server/migration.sql', '/config.php', '/.git/config', '/database.sql', '/anything.sqlite', '/../.thvp-lms/lms.sqlite']:
                try:
                    urllib.request.urlopen(bases[0] + path)
                    raise AssertionError('Private path accessible')
                except urllib.error.HTTPError as error:
                    assert error.code == 404
            try:
                urllib.request.urlopen(bases[0] + '/api.php?action=get_user')
                raise AssertionError('Legacy hosting API must not connect locally')
            except urllib.error.HTTPError as error:
                assert error.code == 503
            db.close()
            print('PASS: rate limiting, pending-review hold structure, SQLite integrity/foreign keys, private-route protection and local hosting isolation. Main database untouched.')
        finally:
            for server in servers:
                server.terminate()
            for server in servers:
                server.wait(timeout=10)


if __name__ == '__main__':
    main()
