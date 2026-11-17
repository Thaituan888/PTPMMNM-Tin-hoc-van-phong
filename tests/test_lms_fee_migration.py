"""Legacy fixed-price SQLite fixtures, never opens the main database."""
import sys
sys.dont_write_bytecode=True
import json,os,secrets,sqlite3,subprocess,tempfile,time
from pathlib import Path
from test_lms_http import ROOT,PHP
with tempfile.TemporaryDirectory(prefix='thvp-fee-') as temporary:
    folder=Path(temporary);path=folder/'legacy.sqlite';db=sqlite3.connect(path)
    legacy=(ROOT/'lms-server/migration.sql').read_text(encoding='utf-8').replace('CHECK(fee_vnd > 0)','CHECK(fee_vnd = 1500000)')
    db.executescript(legacy)
    c=next(c for c in json.loads((ROOT/'lms-server/classes.json').read_text(encoding='utf-8')) if c['code']=='NC-01');now=int(time.time())
    db.execute('INSERT INTO lms_classes(code,course_key,course_name,teacher,days,time,fee_vnd) VALUES (?,?,?,?,?,?,1500000)',tuple(c.values()))
    db.execute('INSERT INTO lms_registrations(class_code,fullname,phone,email,class_snapshot,fee_vnd,created_at,expires_at,request_hash,owner_hash,payload_hash,access_hash) VALUES (?,?,?,?,?,1500000,?,?,?,?,?,?)',('NC-01','Hồ sơ cũ','0901234567','fixture@example.test',json.dumps(c),now,now+1800,*[secrets.token_hex(32) for _ in range(4)]))
    db.execute("INSERT INTO lms_payments VALUES (1,'Bank fixture','970436','000000','FIXTURE','VND',?)",(now,))
    db.execute("INSERT INTO lms_evidence(registration_id,storage_key,mime,size_bytes,source_sha256,request_hash,submitted_at,timeliness) VALUES (1,?,'image/png',100,?,?,?,'on_time')",(secrets.token_hex(32)+'.png',secrets.token_hex(32),secrets.token_hex(32),now))
    db.execute("UPDATE sqlite_sequence SET seq=50 WHERE name='lms_registrations'");db.commit()
    tables=['lms_registrations','lms_payments','lms_evidence','lms_enrollments'];columns={t:[r[1] for r in db.execute('PRAGMA table_info('+t+')')] for t in tables}
    before={t:db.execute('SELECT '+','.join(columns[t])+' FROM '+t).fetchall() for t in tables}
    env=dict(os.environ,THVP_LMS_DB=str(path))
    for _ in range(2):
        result=subprocess.run([str(PHP)],input=b"<?php require 'lms-server/bootstrap.php'; $db=lmsDB(lmsStorage()); echo $db->query('PRAGMA foreign_keys')->fetchColumn();",env=env,cwd=ROOT,capture_output=True,check=True)
        assert result.stdout==b'1',result.stderr
        for t in tables:assert db.execute('SELECT '+','.join(columns[t])+' FROM '+t).fetchall()==before[t]
        assert db.execute("SELECT fee_vnd FROM lms_classes WHERE code='NC-01'").fetchone()[0]==2500000
        assert db.execute("SELECT seq FROM sqlite_sequence WHERE name='lms_registrations'").fetchone()[0]==50
        assert db.execute('PRAGMA foreign_key_check').fetchall()==[] and db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    db.close()
print('PASS: legacy fee CHECK migration repeated safely, original profile/fee/bank/evidence/IDs/sequences preserved, NC price updated, foreign keys enabled and integrity valid; isolated DB only.')
