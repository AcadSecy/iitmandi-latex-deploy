#!/usr/bin/env python3
"""Restore snapshot into isolated temporary containers, never the live database.
Verify all archive hashes, file readability, MongoDB oplog replay, Redis RDB,
and read restored document content. Delete only this test's containers afterward.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess as sp
import tarfile
import time

ROOT = Path(os.environ.get('LATEX_ROOT', '/srv/iitmandi-latex'))

def run(*args, **kw):
    return sp.run(args, check=True, timeout=kw.pop('timeout',120), **kw)

def main():
    os.umask(0o077)
    info=json.loads((ROOT/'backups/scheduled/last-success.json').read_text())
    snap=Path(info['snapshot'])
    for name,digest in info['sha256'].items():
        with (snap/name).open('rb') as f:
            assert hashlib.file_digest(f,'sha256').hexdigest()==digest, f'hash mismatch: {name}'
    for name in ['app.tar.gz','compose.tar.gz']:
        with tarfile.open(snap/name) as t:
            for m in t:
                if m.isfile():
                    with t.extractfile(m) as f:
                        while f.read(1024*1024):
                            pass
    suffix=str(os.getpid())
    mongo='latex-restore-check-'+suffix
    redis='latex-redis-check-'+suffix
    try:
        run('docker','run','-d','--rm','--network','none','--memory','1g','--cpus','1',
            '--name',mongo,'--tmpfs','/data/db:size=2g','mongo:8.0',
            'mongod','--bind_ip','127.0.0.1','--wiredTigerCacheSizeGB','0.25', stdout=sp.DEVNULL)
        for _ in range(30):
            if sp.run(['docker','exec',mongo,'mongosh','--quiet','--eval','db.adminCommand({ping:1})'],stdout=sp.DEVNULL,stderr=sp.DEVNULL).returncode==0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('isolated restore database did not start')
        with (snap/'mongo.archive.gz').open('rb') as data:
            run('docker','exec','-i',mongo,'mongorestore','--quiet','--oplogReplay','--gzip','--archive',stdin=data)
        counts=sp.check_output(['docker','exec',mongo,'mongosh','--quiet','sharelatex','--eval',
            'print(JSON.stringify({users:db.users.countDocuments({}),projects:db.projects.countDocuments({}),docs:db.docs.countDocuments({})}))'],text=True)
        run('docker','run','--rm','--network','none','--memory','128m','--cpus','0.5',
            '--name',redis,'--mount',f'type=bind,src={snap},dst=/backup,readonly',
            '--entrypoint','redis-check-rdb','redis:7.4-alpine','/backup/redis.rdb',stdout=sp.DEVNULL)
        restored_counts=json.loads(counts)
        if (snap/'counts.json').exists():
            assert restored_counts==json.loads((snap/'counts.json').read_text()), 'Restored collection counts differ from snapshot'
        run('docker','run','-d','--rm','--network','none','--memory','128m',
            '--name',redis,'--mount',f'type=bind,src={snap},dst=/backup,readonly',
            '--user','0:0','--entrypoint','redis-server','redis:7.4-alpine',
            '--dir','/backup','--dbfilename','redis.rdb','--appendonly','no','--save','',
            stdout=sp.DEVNULL)
        for _ in range(20):
            if sp.run(['docker','exec',redis,'redis-cli','PING'],stdout=sp.DEVNULL,stderr=sp.DEVNULL).returncode==0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('isolated Redis did not load backup')
        redis_keys=int(sp.check_output(['docker','exec',redis,'redis-cli','DBSIZE'],text=True))
        result={'ok':True,'at':time.time(),'snapshot':str(snap),'restored_counts':restored_counts,'redis_keys':redis_keys}
        (ROOT/'operations/last-restore-test.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result))
    finally:
        for container in [mongo,redis]:
            sp.run(['docker','rm','-f',container],stdout=sp.DEVNULL,stderr=sp.DEVNULL)

if __name__=='__main__':
    main()
