"""HTTP uploads and private image reads; only temporary SQLite and image storage."""
import sys
sys.dont_write_bytecode = True
import base64
import concurrent.futures
import copy
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from test_lms_http import ROOT, PHP, Client, body, port


def upload(client, reference, code='CB-01', data=None, filename='receipt.png', mime='image/png', key=None, csrf=None):
    boundary='lms-'+secrets.token_hex(12)
    raw=b''
    if data is not None:
        raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n').encode()+data+b'\r\n'
    raw+=f'--{boundary}--\r\n'.encode()
    request=urllib.request.Request(client.base+'/lms-api.php?action=evidence_upload&class_code='+code,data=raw,headers={
        'Content-Type':'multipart/form-data; boundary='+boundary,'X-CSRF-Token':csrf or client.csrf,
        'Idempotency-Key':key or secrets.token_hex(32),'X-LMS-Registration':reference})
    try:r=client.http.open(request,timeout=30)
    except urllib.error.HTTPError as e:r=e
    return r.status,json.loads(r.read())


def image(client, url):
    try:r=client.http.open(client.base+'/'+url,timeout=10)
    except urllib.error.HTTPError as e:r=e
    return r.status,r.headers,r.read()


def main():
    fixture_script=b'''<?php
      $out=[];
      foreach (['red'=>[255,0,0],'blue'=>[0,0,255],'green'=>[0,255,0]] as $key=>$rgb) {
        $im=imagecreatetruecolor(24,24);imagefill($im,0,0,imagecolorallocate($im,...$rgb));
        ob_start();imagepng($im);$out[$key.'.png']=base64_encode(ob_get_clean());
        ob_start();imagejpeg($im);$out[$key.'.jpg']=base64_encode(ob_get_clean());imagedestroy($im);
      }
      echo json_encode($out);
    '''
    fixtures={k:base64.b64decode(v) for k,v in json.loads(subprocess.check_output([str(PHP),'-d','extension=gd'],input=fixture_script,cwd=ROOT)).items()}
    servers=[]
    with tempfile.TemporaryDirectory(prefix='thvp-evidence-') as temporary:
        folder=Path(temporary);db_path=folder/'test.sqlite';images=folder/'private-images'
        env=dict(os.environ,THVP_LMS_DB=str(db_path),THVP_LMS_EVIDENCE_DIR=str(images),THVP_LMS_PAYMENT_CONFIG=str(folder/'blank-bank.json'))
        bases=['http://127.0.0.1:'+str(port()) for _ in range(2)]
        db=None
        try:
            for base in bases:
                servers.append(subprocess.Popen([str(PHP),'-d','extension=gd','-d','display_errors=0','-S',base.removeprefix('http://'),'-t',str(ROOT),str(ROOT/'router.php')],
                    cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0)))
            for base in bases:
                for _ in range(100):
                    try:urllib.request.urlopen(base+'/index.html',timeout=1).close();break
                    except OSError:time.sleep(.05)
            alice,bob=Client(bases[0]),Client(bases[1])
            status,created=alice.call('register',body());assert status==201
            ref=created['registration']['reference']
            status,bcreated=bob.call('register',body('NC-01','late@example.test'));assert status==201
            bref=bcreated['registration']['reference']
            db=sqlite3.connect(db_path);db.execute('PRAGMA foreign_keys=ON')
            settings=alice.call('evidence&class_code=CB-01')[1]['upload']
            assert settings['upload_available'] and settings['max_bytes']==5*1024*1024
            key=secrets.token_hex(32)
            status,saved=upload(alice,ref,data=fixtures['red.png'],key=key);assert status==201,saved
            assert saved['registration']['status']=='pending_review' and not saved['registration']['payment_confirmed']
            first=saved['evidence'];assert first['timeliness']=='on_time'
            status,headers,content=image(alice,first['image_url'])
            assert status==200 and headers['Content-Type']=='image/png' and headers['X-Content-Type-Options']=='nosniff'
            assert 'no-store' in headers['Cache-Control'] and content.startswith(b'\x89PNG')
            assert upload(alice,ref,data=fixtures['red.png'],key=key)[0]==200
            assert upload(alice,ref,data=fixtures['red.png'])[0]==200  # same file/new key also deduplicates
            assert upload(alice,ref,data=fixtures['blue.png'],key=key)[0]==409
            assert db.execute('SELECT COUNT(*) FROM lms_evidence').fetchone()[0]==1
            assert upload(alice,ref,data=fixtures['red.jpg'],filename='receipt.jpg',mime='image/jpeg')[0]==201
            history=alice.call('evidence&class_code=CB-01')[1]
            assert len(history['evidence'])==2 and history['registration']['status']=='pending_review'
            assert all('storage_key' not in item and 'path' not in item and 'token' not in item['image_url'] for item in history['evidence'])
            assert image(bob,first['image_url'])[0]==404
            assert image(bob,first['image_url'].replace('class_code=CB-01','class_code=NC-01'))[0]==404
            assert upload(alice,ref,data=fixtures['blue.png'],csrf='wrong')[0]==403
            assert upload(alice,'DK999999',data=fixtures['blue.png'])[0]==409
            cookie=next(c for c in alice.cookies if c.name=='thvp_lms_CB_01');token=cookie.value;cookie.value='0'*64
            assert upload(alice,ref,data=fixtures['blue.png'])[0]==404
            assert alice.call('evidence&class_code=CB-01')[0]==404
            cookie.value=token
            print('PASS: real PNG/JPG save/read, token+CSRF, exact-profile guard, cross-profile ID denial, idempotent retries/content deduplication, history and restore; private no-store image handler.')

            def authorized_client(base=bases[0]):
                client=Client(base)
                for c in alice.cookies:
                    if c.name=='thvp_lms_CB_01':client.cookies.set_cookie(copy.copy(c))
                return client
            invalids=[(None,'receipt.png','image/png',422),
                (b'<svg xmlns="http://www.w3.org/2000/svg"/>','receipt.svg','image/svg+xml',422),
                (b'<html>not image</html>','receipt.png','image/png',422),
                (b'<?php echo 1; ?>','receipt.jpg','image/jpeg',422),
                (fixtures['blue.png'],'receipt.exe','image/png',422),
                (fixtures['blue.png'][:33]+fixtures['blue.png'][-12:],'receipt.png','image/png',422),
                (fixtures['blue.jpg']+b'<?php echo 1; ?>','receipt.jpg','image/jpeg',422),
                (b'x'*(5*1024*1024+1),'receipt.png','image/png',413),
                (b'x'*(7*1024*1024),'receipt.png','image/png',413),
                (b'x'*(9*1024*1024),'receipt.png','image/png',413)]
            for data,filename,mime,expected in invalids:
                status,result=upload(authorized_client(),ref,data=data,filename=filename,mime=mime)
                assert status==expected,(filename,status,result)
            assert db.execute('SELECT COUNT(*) FROM lms_evidence').fetchone()[0]==2
            before_files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in images.iterdir()}
            db.execute("CREATE TRIGGER test_evidence_failure BEFORE INSERT ON lms_evidence BEGIN SELECT RAISE(ABORT,'test failure'); END");db.commit()
            failing=authorized_client();failure_key=secrets.token_hex(32)
            assert upload(failing,ref,data=fixtures['green.png'],key=failure_key)[0]==503
            assert {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in images.iterdir()}==before_files
            db.execute('DROP TRIGGER test_evidence_failure');db.commit()
            assert upload(failing,ref,data=fixtures['green.png'],key=failure_key)[0]==201
            print('PASS: missing file, oversized uploads/PHP POST limit, SVG/HTML/executable/fake extension/corrupt image rejection; DB failure cleans only the new file and preserves prior images; retry works.')

            racers=[authorized_client(base) for base in bases];race_key=secrets.token_hex(32)
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                replies=list(pool.map(lambda client:upload(client,ref,data=fixtures['blue.png'],key=race_key),racers))
            assert sorted(s for s,_ in replies)==[200,201]
            assert len({result['evidence']['id'] for _,result in replies})==1
            assert db.execute('SELECT COUNT(*) FROM lms_evidence').fetchone()[0]==len(list(images.iterdir()))==4
            db.execute("UPDATE lms_registrations SET expires_at=? WHERE class_code='CB-01'",(int(time.time())-1,));db.commit()
            assert alice.call('registration&class_code=CB-01')[1]['registration']['status']=='pending_review'
            assert next(c for c in alice.call('classes')[1]['classes'] if c['code']=='CB-01')['remaining']==98
            assert not alice.call('payment&class_code=CB-01',{})[1]['payment']['eligible']
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments').fetchone()[0]==0
            db.execute("UPDATE lms_registrations SET expires_at=? WHERE class_code='NC-01'",(int(time.time())-1,))
            db.executemany('INSERT INTO lms_enrollments(class_code,email) VALUES (?,?)',[('NC-01',f'fixture{i}@example.test') for i in range(99)]);db.commit()
            status,late=upload(bob,bref,'NC-01',fixtures['blue.jpg'],'late.jpg','image/jpeg')
            assert status==201 and late['registration']['status']=='late_review' and late['evidence']['timeliness']=='late'
            assert not late['registration']['payment_confirmed']
            assert upload(bob,bref,'NC-01',fixtures['green.jpg'],'extra.jpg','image/jpeg')[0]==201
            assert len(bob.call('evidence&class_code=NC-01')[1]['evidence'])==2
            full=next(c for c in bob.call('classes')[1]['classes'] if c['code']=='NC-01')
            assert full['active_students']==99 and full['valid_holds']==0 and full['remaining']==0
            assert db.execute('SELECT COUNT(*) FROM lms_enrollments').fetchone()[0]==99
            assert db.execute('SELECT COUNT(*) FROM users').fetchone()[0] == 3
            assert db.execute("SELECT COUNT(*) FROM users WHERE role!='admin' OR password_hash IS NOT NULL").fetchone()[0] == 0
            storage_key=db.execute('SELECT storage_key FROM lms_evidence LIMIT 1').fetchone()[0]
            for suffix in ['/evidence/'+storage_key,'/.thvp-lms/evidence/'+storage_key,'/../.thvp-lms/evidence/'+storage_key,'/lms-server/evidence.php']:
                try:urllib.request.urlopen(bases[0]+suffix);raise AssertionError('Private evidence accessible')
                except urllib.error.HTTPError as e:assert e.code==404
            limited=authorized_client()
            for _ in range(10):assert upload(limited,ref)[0]==422
            assert upload(limited,ref)[0]==429
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
            db.close()
            print('PASS: concurrent retries keep one image, on-time evidence retains its seat after original expiry, late evidence keeps history but never overbooks 99; direct paths blocked, rate limit, no additional users/enrollment/payment confirmation, SQLite integrity/foreign keys.')
        finally:
            if db is not None:db.close()
            for server in servers:server.terminate()
            for server in servers:server.wait(timeout=10)


if __name__=='__main__':main()
