"""Real decision transactions on two PHP processes, private fixtures only. Never touches the main DB."""
import sys
sys.dont_write_bytecode = True
import base64
import concurrent.futures
import copy
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
from test_lms_http import ROOT, PHP, Client, body, port
from test_lms_evidence_http import upload, image


def check_existing_migration(folder):
    """An old CHECK/status schema with rows survives additive migration, twice."""
    path = folder/'existing.sqlite'
    database = sqlite3.connect(path)
    try:
        database.execute('PRAGMA foreign_keys=ON')
        database.executescript((ROOT/'lms-server/migration.sql').read_text(encoding='utf-8'))
        row = json.loads((ROOT/'lms-server/classes.json').read_text(encoding='utf-8'))[0]
        database.execute('INSERT INTO lms_classes(code,course_key,course_name,teacher,days,time,fee_vnd) VALUES (?,?,?,?,?,?,1500000)', tuple(row.values()))
        now = int(time.time())
        database.execute('INSERT INTO lms_registrations (class_code,fullname,phone,email,class_snapshot,fee_vnd,status,created_at,expires_at,proof_submitted_at,request_hash,owner_hash,payload_hash,access_hash) VALUES (?,?,?,?,?,1500000,?,?,?,?,?,?,?,?)',
            (row['code'],'Hồ sơ cũ thử nghiệm','0901234567','existing@example.test',json.dumps(row),'pending_review',now,now+1800,now,*[secrets.token_hex(32) for _ in range(4)]))
        database.execute("INSERT INTO lms_payments VALUES (1,'Test bank','970436','123456789','TEST ONLY','VND',?)",(now,))
        database.execute("INSERT INTO lms_evidence(registration_id,storage_key,mime,size_bytes,source_sha256,request_hash,submitted_at,timeliness) VALUES (1,?,'image/png',100,?,?,?,'on_time')",
            (secrets.token_hex(32)+'.png',secrets.token_hex(32),secrets.token_hex(32),now))
        database.commit()
        tables = ['lms_classes','lms_registrations','lms_payments','lms_evidence','lms_enrollments']
        columns = {table:[r[1] for r in database.execute('PRAGMA table_info('+table+')')] for table in tables}
        before = {table:database.execute('SELECT '+','.join(columns[table])+' FROM '+table).fetchall() for table in tables}
        env = dict(os.environ,THVP_LMS_DB=str(path))
        script = "<?php require 'lms-server/bootstrap.php'; lmsDB(lmsStorage());"
        for _ in range(2):
            subprocess.run([str(PHP)],input=script.encode(),cwd=ROOT,env=env,check=True,capture_output=True)
        for table in tables[1:]:
            assert database.execute('SELECT '+','.join(columns[table])+' FROM '+table).fetchall() == before[table]
        # The migration may add the five missing seed classes, without changing the existing class.
        assert database.execute('SELECT '+','.join(columns['lms_classes'])+' FROM lms_classes WHERE code=?',(row['code'],)).fetchall() == before['lms_classes']
        assert database.execute('SELECT review_status,review_version,review_reason FROM lms_registrations').fetchall() == [(None,0,None)]
        assert database.execute('SELECT COUNT(*) FROM lms_review_history').fetchone()[0] == 0
        # Rebuild the legacy history schema with a real row, then migrate twice.
        database.execute('DROP TABLE lms_review_history')
        legacy=(ROOT/'lms-server/review-migration.sql').read_text(encoding='utf-8').replace(' manual_confirmation INTEGER NOT NULL DEFAULT 0 CHECK(manual_confirmation IN (0,1)),\n','').replace('(bank_transaction IS NOT NULL OR manual_confirmation=1)','bank_transaction IS NOT NULL')
        database.executescript(legacy)
        actor=database.execute("SELECT id,username,fullname FROM users WHERE username='Giaovien1'").fetchone()
        database.execute("INSERT INTO lms_review_history(registration_id,actor_id,actor_username,actor_name,decision,before_status,after_status,notes,received_vnd,bank_transaction,receiver_key,created_at,from_version,to_version,request_hash,payload_hash) VALUES (1,?,?,?,'approve','pending_review','approved_waiting_access','Preserve',1500000,'LEGACY-TX','receiver',?,0,1,'old-key','old-payload')",(*actor,now))
        columns=[r[1] for r in database.execute('PRAGMA table_info(lms_review_history)')]
        history=database.execute('SELECT '+','.join(columns)+' FROM lms_review_history').fetchall();database.commit()
        for _ in range(2):subprocess.run([str(PHP)],input=script.encode(),cwd=ROOT,env=env,check=True,capture_output=True)
        assert database.execute('SELECT '+','.join(columns)+' FROM lms_review_history').fetchall()==history
        assert database.execute('SELECT manual_confirmation FROM lms_review_history').fetchall()==[(0,)]
        assert database.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert database.execute('PRAGMA foreign_key_check').fetchall() == []
    finally:
        database.close()
    print('PASS: pre-existing status CHECK, registration IDs/content, bank snapshot and evidence rows survive repeated additive migration.')


def main():
    servers = []
    with tempfile.TemporaryDirectory(prefix='thvp-review-') as temporary:
        folder = Path(temporary)
        db_path = folder / 'test.sqlite'
        bank = dict(bank_name='Test bank', bank_bin='970436', account_number='123456789', account_name='TEST ONLY')
        (folder/'bank.json').write_text(json.dumps(bank), encoding='utf-8')
        env = dict(os.environ, THVP_LMS_DB=str(db_path), THVP_LMS_PAYMENT_CONFIG=str(folder/'bank.json'),
                   THVP_LMS_EVIDENCE_DIR=str(folder/'evidence'))
        bases = ['http://127.0.0.1:'+str(port()) for _ in range(2)]
        db = None
        try:
            check_existing_migration(folder)
            for base in bases:
                servers.append(subprocess.Popen([str(PHP), '-d', 'extension=gd', '-d', 'display_errors=0', '-S',
                    base.removeprefix('http://'), '-t', str(ROOT), str(ROOT/'router.php')], cwd=ROOT, env=env,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)))
            for base in bases:
                for _ in range(100):
                    try:
                        urllib.request.urlopen(base+'/index.html', timeout=1).close()
                        break
                    except OSError:
                        time.sleep(.05)
                else:
                    raise AssertionError('PHP did not start')
            guest = Client(bases[0])
            db = sqlite3.connect(db_path)
            db.execute('PRAGMA foreign_keys=ON')
            passwords = {f'Giaovien{i}':secrets.token_urlsafe(20) for i in range(1,4)}
            for username, password in passwords.items():
                subprocess.run([str(PHP), str(ROOT/'lms-server/admin-accounts.php'), 'set-password', username],
                    input=json.dumps({'password':password}).encode(), env=env, cwd=ROOT, check=True, capture_output=True)
            admins = []
            for i, (username,password) in enumerate(passwords.items()):
                client = Client(bases[i%2])
                assert client.call('auth_login', {'username':username,'password':password})[0] == 200
                admins.append(client)
            student_password = secrets.token_urlsafe(20)
            hashed = subprocess.check_output([str(PHP)], input=('<?php echo password_hash('+json.dumps(student_password)+',PASSWORD_DEFAULT);').encode(), cwd=ROOT).decode()
            db.execute("INSERT INTO users(username,fullname,role,password_hash) VALUES ('student_fixture','Student fixture','student',?)", (hashed,))
            db.commit()
            student = Client(bases[1])
            assert student.call('auth_login', {'username':'student_fixture','password':student_password})[0] == 200
            baseline_users = db.execute('SELECT * FROM users ORDER BY id').fetchall()

            def png(color):
                script = '<?php $i=imagecreatetruecolor(8,8);imagefill($i,0,0,'+str(color)+');ob_start();imagepng($i);echo base64_encode(ob_get_clean());'
                return base64.b64decode(subprocess.check_output([str(PHP),'-d','extension=gd'], input=script.encode(), cwd=ROOT))
            first_png, second_png = png(1234), png(5678)
            sequence = 0
            def fixture(code='CB-01', late=False, proof=True):
                nonlocal sequence
                sequence += 1
                owner = Client(bases[sequence%2])
                status, data = owner.call('register', body(code, f'fixture{sequence}@example.test'))
                assert status == 201, data
                reference = data['registration']['reference']
                ident = int(reference[2:])
                status, payment = owner.call('payment&class_code='+code, {'amount_vnd':1})
                assert status == 200 and payment['payment']['configured'] and payment['payment']['amount_vnd'] == data['registration']['fee_vnd']
                if late:
                    db.execute('UPDATE lms_registrations SET expires_at=? WHERE id=?', (int(time.time())-1,ident));db.commit()
                if proof:
                    status, evidence = upload(owner, reference, code, first_png)
                    assert status == 201, evidence
                return owner, reference, ident, code
            def detail(client, fixture):
                status, data = client.call('admin_registration&reference='+fixture[1]);assert status == 200, data
                return data
            def action(client, fixture, decision='approve', **extra):
                current = detail(client, fixture)
                revision = current['revision']
                request = dict(reference=fixture[1], version=revision, decision=decision, received_vnd=current['registration']['fee_vnd'],
                               bank_transaction='BANK-'+fixture[1], funds_verified=True, notes='INTERNAL: verified fixture')
                if decision != 'approve':request['reason'] = 'Lý do tiếng Việt cho người học'
                request.update(extra)
                return request
            def reset_rate():
                db.execute("DELETE FROM lms_rate_limits WHERE key LIKE 'review:%'");db.commit()
            def occupied(code):
                status, data = guest.call('classes');assert status == 200
                row = next(r for r in data['classes'] if r['code'] == code)
                return row['active_students']+row['valid_holds']

            simple=fixture('CB-02')
            simple_payload=dict(reference=simple[1],version=detail(admins[0],simple)['revision'],decision='approve',funds_verified=True)
            assert admins[0].call('admin_review',{**simple_payload,'funds_verified':False})[0]==422
            simple_key=secrets.token_hex(32)
            assert admins[0].call('admin_review',simple_payload,simple_key)[0]==200
            assert admins[0].call('admin_review',simple_payload,simple_key)[1]['replayed']
            assert db.execute('SELECT received_vnd,bank_transaction,manual_confirmation FROM lms_review_history WHERE registration_id=?',(simple[2],)).fetchone()==(1500000,None,1)
            # Subsequent assertions count only their own newly written decisions.
            baseline_history=db.execute('SELECT COUNT(*) FROM lms_review_history').fetchone()[0]

            a = fixture()
            request = action(admins[0],a)
            assert guest.call('admin_review',request)[0] == 401
            assert student.call('admin_review',{**request,'role':'admin','username':'Giaovien1'})[0] == 403
            assert admins[0].call('admin_review',request,csrf='bad')[0] == 403
            for extra in [dict(funds_verified=False),dict(funds_verified='true'),dict(received_vnd=1),dict(received_vnd='1500000'),dict(bank_transaction='')]:
                status, data = admins[0].call('admin_review',{**request,**extra});assert status == 422,data
            assert db.execute('SELECT COUNT(*) FROM lms_review_history').fetchone()[0] == baseline_history
            assert not a[0].call('registration&class_code=CB-01')[1]['registration']['payment_confirmed']
            reset_rate()
            count = occupied('CB-01')
            key = secrets.token_hex(32)
            status, result = admins[0].call('admin_review',request,key)
            assert status == 200 and result['registration']['status'] == 'approved_waiting_access',result
            assert occupied('CB-01') == count and result['registration']['payment_confirmed']
            status, replay = admins[0].call('admin_review',request,key)
            assert status == 200 and replay['replayed']
            assert db.execute('SELECT COUNT(*) FROM lms_review_history WHERE registration_id=?',(a[2],)).fetchone()[0] == 1
            assert admins[1].call('admin_review',request)[0] == 409
            assert admins[0].call('admin_review',{**request,'notes':'changed'},key)[0] == 409
            assert upload(a[0],a[1],a[3],second_png)[0] == 409
            evidence_state = a[0].call('evidence&class_code=CB-01')[1]
            assert not evidence_state['can_submit'] and len(evidence_state['evidence']) == 1
            assert not a[0].call('payment&class_code=CB-01',{})[1]['payment']['eligible']
            owner_result = a[0].call('registration&class_code=CB-01')[1]
            assert 'INTERNAL' not in json.dumps(owner_result) and 'bank_transaction' not in json.dumps(owner_result)

            duplicate = fixture('NC-01')
            status, data = admins[1].call('admin_review',action(admins[1],duplicate,bank_transaction='  bank-'+a[1].lower()+'  '))
            assert status == 409,data
            assert detail(admins[1],duplicate)['registration']['status'] == 'pending_review'
            # Same bank transaction ID may exist on a different receiving account (snapshot, not current config).
            changed_bank = {**bank,'account_number':'987654321'}
            (folder/'bank.json').write_text(json.dumps(changed_bank),encoding='utf-8')
            other_account = fixture('NC-02')
            assert admins[2].call('admin_review',action(admins[2],other_account,bank_transaction='BANK-'+a[1]))[0] == 200
            (folder/'bank.json').write_text(json.dumps(bank),encoding='utf-8')
            snapshot = detail(admins[1],duplicate)['payment_snapshot']
            assert snapshot['account_number'] == bank['account_number']
            assert admins[1].call('admin_review',action(admins[1],duplicate))[0] == 200
            for admin in admins:
                assert detail(admin,a)['registration']['status'] == 'approved_waiting_access'
                assert detail(admin,duplicate)['registration']['status'] == 'approved_waiting_access'
            print('PASS: equal admins across courses; guest/student/CSRF denied; exact stored fee + verification required; receiver-scoped unique bank transaction; idempotent approval, no extra seat, no owner/internal data leak, approved uploads blocked.')

            reset_rate()
            supplement = fixture('CB-02')
            old_approval = action(admins[0],supplement)
            before = occupied('CB-02')
            request_more = action(admins[1],supplement,'request_more')
            assert admins[1].call('admin_review',{**request_more,'reason':' \t '})[0] == 422
            key = secrets.token_hex(32)
            assert admins[1].call('admin_review',request_more,key)[0] == 200
            assert occupied('CB-02') == before
            owner_state = supplement[0].call('registration&class_code=CB-02')[1]['registration']
            assert owner_state['status'] == 'needs_more' and owner_state['public_reason'] == request_more['reason'] and owner_state['hold_reserved']
            assert 'INTERNAL' not in json.dumps(owner_state)
            filtered = admins[0].call('admin_registrations&class_code=CB-02&status=needs_more')[1]
            assert filtered['total'] == 1 and filtered['items'][0]['reference'] == supplement[1]
            status, added = upload(supplement[0],supplement[1],supplement[3],second_png)
            assert status == 201 and added['registration']['status'] == 'pending_review' and added['registration']['public_reason'] is None
            assert len(supplement[0].call('evidence&class_code=CB-02')[1]['evidence']) == 2
            assert admins[0].call('admin_review',old_approval)[0] == 409
            assert admins[1].call('admin_review',request_more,key)[0] == 409  # replay cannot overwrite a new image
            assert admins[2].call('admin_review',action(admins[2],supplement))[0] == 200
            history = detail(admins[0],supplement)['history']
            assert [r['decision'] for r in history] == ['approve','request_more']
            assert all(r['actor_name'] and r['created_at'] and r['to_version']==r['from_version']+1 for r in history)

            reject = fixture('CB-03')
            before = occupied('CB-03')
            request = action(admins[2],reject,'reject')
            assert admins[2].call('admin_review',{**request,'reason':''})[0] == 422
            assert admins[2].call('admin_review',request)[0] == 200
            assert occupied('CB-03') == before-1
            owner_state = reject[0].call('registration&class_code=CB-03')[1]['registration']
            assert owner_state['status'] == 'rejected' and owner_state['public_reason'] == request['reason'] and not owner_state['hold_reserved']
            assert upload(reject[0],reject[1],reject[3],second_png)[0] == 409
            evidence = detail(admins[0],reject)['evidence']
            assert len(evidence) == 1 and image(reject[0],evidence[0]['image_url'])[0] == 200
            for state in ['approved_waiting_access','needs_more','rejected']:
                data = admins[0].call('admin_registrations&status='+state)[1]
                assert all(r['status'] == state for r in data['items'])
            print('PASS: mandatory public reasons, private notes, supplement → new evidence → pending review; stale request/replay denied, complete image/decision histories; rejection releases seat and preserves private evidence.')

            reset_rate()
            late = fixture('NC-03',late=True)
            assert not detail(admins[0],late)['hold']['reserved']
            before = occupied('NC-03')
            assert admins[0].call('admin_review',action(admins[0],late))[0] == 200
            assert occupied('NC-03') == before+1
            assert late[0].call('registration&class_code=NC-03')[1]['registration']['hold_reserved']
            assert not late[0].call('payment&class_code=NC-03',{})[1]['payment']['eligible']

            # Two true competing PHP processes each acquire the same SQLite write lock.
            last_a = fixture('CB-03',late=True)
            last_b = fixture('CB-03',late=True)
            db.executemany("INSERT INTO lms_enrollments(class_code,email,active) VALUES ('CB-03',?,1)", [(f'active{i}@example.test',) for i in range(98)])
            db.commit()
            baseline_enrollments = db.execute('SELECT * FROM lms_enrollments ORDER BY id').fetchall()
            assert occupied('CB-03') == 98
            requests = [(admins[0],action(admins[0],last_a)),(admins[1],action(admins[1],last_b))]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda pair:pair[0].call('admin_review',pair[1]),requests))
            assert sorted(r[0] for r in results) == [200,409],results
            assert occupied('CB-03') == 99
            loser = last_a if results[0][0] == 409 else last_b
            assert not detail(admins[0],loser)['hold']['reserved']
            assert admins[2].call('admin_review',action(admins[2],loser,'request_more'))[0] == 200
            late_reason = loser[0].call('registration&class_code=CB-03')[1]['registration']
            assert late_reason['status'] == 'needs_more' and not late_reason['hold_reserved']
            status, added = upload(loser[0],loser[1],loser[3],second_png)
            assert status == 201 and added['registration']['status'] == 'late_review' and not added['registration']['hold_reserved']
            assert occupied('CB-03') == 99
            assert admins[2].call('admin_review',action(admins[2],loser))[0] == 409
            assert admins[2].call('admin_review',action(admins[2],loser,'reject'))[0] == 200
            assert occupied('CB-03') == 99

            reset_rate()
            same = fixture('CB-02')
            r1 = action(admins[0],same)
            r2 = action(admins[1],same,'reject')
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda pair:pair[0].call('admin_review',pair[1]),[(admins[0],r1),(admins[1],r2)]))
            assert sorted(r[0] for r in results) == [200,409],results
            assert db.execute('SELECT COUNT(*) FROM lms_review_history WHERE registration_id=?',(same[2],)).fetchone()[0] == 1
            # A new image also invalidates a previously opened review screen.
            fresh = fixture('NC-02')
            stale = action(admins[0],fresh)
            assert upload(fresh[0],fresh[1],fresh[3],second_png)[0] == 201
            assert admins[0].call('admin_review',stale)[0] == 409
            db.execute("UPDATE lms_classes SET registration_open=0 WHERE code='NC-02'");db.commit()
            assert admins[0].call('admin_review',action(admins[0],fresh))[0] == 409
            db.execute("UPDATE lms_classes SET registration_open=1 WHERE code='NC-02'");db.commit()
            assert admins[0].call('admin_review',action(admins[0],fresh))[0] == 200
            # Concurrent attempts to spend the same transaction on different profiles cannot both win.
            reset_rate()
            transaction_a = fixture('CB-01')
            transaction_b = fixture('NC-01')
            pairs = [(admins[0],action(admins[0],transaction_a,bank_transaction='BANK-CONCURRENT')),
                     (admins[1],action(admins[1],transaction_b,bank_transaction='bank-concurrent'))]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda pair:pair[0].call('admin_review',pair[1]),pairs))
            assert sorted(r[0] for r in results) == [200,409],results
            assert db.execute("SELECT COUNT(*) FROM lms_review_history WHERE bank_transaction='BANK-CONCURRENT'").fetchone()[0] == 1
            # Pending-review and approved places persist beyond the initial payment deadline.
            db.execute("UPDATE lms_registrations SET expires_at=? WHERE status='pending_review'",(int(time.time())-10000,));db.commit()
            assert occupied('CB-03') == 99
            print('PASS: late approval acquires exactly one place; two requests competing for final place remain ≤99; late supplemental evidence never reserves extra; concurrent decisions/duplicate bank transaction yield one success; image revision + closed-class guards.')

            assert db.execute('SELECT * FROM users ORDER BY id').fetchall() == baseline_users
            assert db.execute('SELECT * FROM lms_enrollments ORDER BY id').fetchall() == baseline_enrollments
            assert all(image(admins[0],e['image_url'])[0] == 200 for e in detail(admins[0],supplement)['evidence'])
            for url in ['/lms-server/review.php','/lms-server/review-migration.sql','/.thvp-lms/test.sqlite','/evidence/']:
                try:urllib.request.urlopen(bases[0]+url).close();raise AssertionError('Private URL exposed')
                except urllib.error.HTTPError as error:assert error.code == 404
            assert admins[0].call('auth_logout',{})[0] == 200
            assert admins[0].call('admin_review',request)[0] == 401
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert db.execute('PRAGMA foreign_key_check').fetchall() == []
            assert db.execute("SELECT COUNT(*) FROM lms_schema_migrations WHERE name='registration_review_v1'").fetchone()[0] == 1
            print('PASS: restored owner state, filters, preserved users/enrollments/images/bank snapshots, logout revocation, private URLs; repeatable migration, SQLite integrity and foreign keys. No main data, real money or email used.')
        finally:
            if db is not None:db.close()
            for server in servers:
                server.terminate();server.wait(timeout=10)


if __name__ == '__main__':
    main()
