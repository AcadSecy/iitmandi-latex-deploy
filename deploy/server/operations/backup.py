#!/usr/bin/env python3
"""Private local snapshots; freeze app writes while Mongo, Redis and files are captured.
Redis is included because it holds recent edits not yet flushed to MongoDB.
No raw Mongo database directory is copied. A separate watchdog unpauses the app
within five minutes even if this process is killed. Failed snapshots are never
published or counted as successful. Local snapshots are NOT off-host recovery.
"""
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess as sp
import tarfile
import time

ROOT = Path(os.environ.get('LATEX_ROOT', '/srv/iitmandi-latex'))
STORE = ROOT / 'backups' / 'scheduled'
APP = 'iitmandi-latex'
MONGO = APP + '-mongo'
REDIS = APP + '-redis'

def run(*args, **kw):
    return sp.run(args, check=True, timeout=kw.pop('timeout', 180), **kw)

def capture(path, *cmd):
    with path.open('wb') as out:
        run(*cmd, stdout=out)
    if not path.stat().st_size:
        raise RuntimeError(f'empty backup: {path.name}')

def main():
    os.umask(0o077)
    STORE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (ROOT / 'deploy' / 'lock').open('a') as lock:
        deadline = time.monotonic() + 180
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('deployment/backup lock busy for three minutes')
                time.sleep(1)
        if shutil.disk_usage(ROOT).free < 20 * 1024**3:
            raise RuntimeError('backup refused: less than 20 GiB free')
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        work = STORE / (stamp + '.partial')
        work.mkdir(mode=0o700)
        image = sp.check_output(['docker', 'inspect', '-f', '{{.Config.Image}}', APP], text=True).strip()
        paused = False
        watchdog = None
        start = time.time()
        try:
            # Watchdog is independent of this process, including on SIGKILL.
            watchdog = sp.Popen(['sh', '-c', 'sleep 300; docker unpause iitmandi-latex >/dev/null 2>&1'],
                                start_new_session=True, stdout=sp.DEVNULL, stderr=sp.DEVNULL)
            run('docker', 'pause', APP)
            paused = True
            capture(work/'counts.json', 'docker', 'exec', MONGO, 'mongosh', '--quiet', 'sharelatex',
                    '--eval', 'print(JSON.stringify({users:db.users.countDocuments({}),projects:db.projects.countDocuments({}),docs:db.docs.countDocuments({})}))')
            capture(work/'mongo.archive.gz', 'docker', 'exec', MONGO,
                    'mongodump', '--quiet', '--oplog', '--gzip', '--archive')
            run('docker', 'exec', REDIS, 'redis-cli', 'SAVE', stdout=sp.DEVNULL)
            capture(work/'redis.rdb', 'docker', 'exec', REDIS, 'cat', '/data/dump.rdb')
            capture(work/'app.tar.gz', 'docker', 'run', '--rm', '--network', 'none', '--read-only',
                    '--user', '33:33', '--volumes-from', APP + ':ro', '--entrypoint', 'tar', image,
                    '-czf', '-', '--exclude=./data/compiles', '--exclude=./data/output',
                    '--exclude=./data/cache', '--exclude=./tmp', '-C', '/var/lib/overleaf', '.')
            with tarfile.open(work/'compose.tar.gz', 'w:gz') as archive:
                archive.add(ROOT/'compose', arcname='compose')
            if watchdog.poll() is not None or time.time()-start >= 290:
                raise RuntimeError('snapshot exceeded safe freeze window')
        finally:
            if paused:
                run('docker', 'unpause', APP, timeout=30)
            if watchdog is not None:
                # Terminate the whole process group, including sleep.
                import signal
                try:
                    os.killpg(watchdog.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        files = {}
        for path in work.iterdir():
            if path.is_file():
                with path.open('rb') as stream:
                    files[path.name] = hashlib.file_digest(stream, 'sha256').hexdigest()
        manifest = {'created_at': time.time(), 'freeze_seconds': round(time.time()-start, 2),
                    'image': image, 'sha256': files, 'off_host': False}
        (work/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
        final = STORE/stamp
        work.rename(final)
        (STORE/'last-success.json').write_text(json.dumps(manifest | {'snapshot':str(final)}, indent=2)+'\n')
        # Retain fourteen completed snapshots; never delete partials silently.
        snapshots = sorted(p for p in STORE.iterdir() if p.is_dir() and (p/'manifest.json').exists())
        for old in snapshots[:-14]:
            shutil.rmtree(old)
        print(json.dumps(manifest | {'snapshot':str(final)}))

if __name__ == '__main__':
    main()
