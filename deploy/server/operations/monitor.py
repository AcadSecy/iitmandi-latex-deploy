#!/usr/bin/env python3
"""Local health alerts in operations/health.json and the system journal.
No outbound notification destination is configured. Monitor itself is local,
so an external uptime monitor is still required to detect total host failure.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request

ROOT = Path(os.environ.get('LATEX_ROOT', '/srv/iitmandi-latex'))

def check():
    issues = []
    data = {'at':time.time(), 'off_host_backup':False}
    try:
        with urllib.request.urlopen('http://127.0.0.1:8080/status', timeout=10) as r:
            if r.status != 200:
                issues.append('HTTP status unhealthy')
    except Exception as e:
        issues.append('HTTP status unavailable: '+str(e))
    try:
        result = subprocess.check_output(['docker','inspect', 'iitmandi-latex',
            'iitmandi-latex-mongo','iitmandi-latex-redis','iitmandi-latex-ldap'],timeout=15)
        containers = json.loads(result)
        data['containers'] = {c['Name'].lstrip('/'):c['State']['Status'] for c in containers}
        for c in containers:
            if not c['State']['Running'] or c['State'].get('Health',{}).get('Status','healthy') == 'unhealthy':
                issues.append(c['Name']+' is not healthy')
    except Exception as e:
        issues.append('container inspection failed: '+str(e))
    usage = shutil.disk_usage(ROOT)
    data['disk_used_percent'] = round(100 * usage.used/usage.total,2)
    data['disk_free_gib'] = round(usage.free/1024**3,2)
    if usage.used/usage.total >= .80 or usage.free < 20*1024**3:
        issues.append('disk storage threshold exceeded')
    memory = dict((k,int(v.split()[0])) for k,v in
                  (line.split(':',1) for line in Path('/proc/meminfo').read_text().splitlines()))
    data['memory_available_percent'] = round(100*memory['MemAvailable']/memory['MemTotal'],2)
    if data['memory_available_percent'] < 15:
        issues.append('less than 15% host memory available')
    try:
        backup = json.loads((ROOT/'backups/scheduled/last-success.json').read_text())
        data['backup_age_hours'] = round((time.time()-backup['created_at'])/3600,2)
        if data['backup_age_hours'] > 30:
            issues.append('backup older than 30 hours')
    except (OSError, ValueError):
        issues.append('no successful scheduled backup recorded')
    try:
        restore = json.loads((ROOT/'operations/last-restore-test.json').read_text())
        if time.time()-restore['at'] > 8*86400 or not restore['ok']:
            issues.append('restore verification overdue or failed')
    except (OSError,ValueError):
        issues.append('no successful restore verification recorded')
    for job in ('backup','restore'):
        attempt=ROOT/'operations'/(job+'-attempt.json')
        if attempt.exists():
            status=json.loads(attempt.read_text())
            if status['state']=='failed':
                issues.append(job+' job failed; inspect journal logs')
            elif status['state']=='running' and time.time()-status['at']>1200:
                issues.append(job+' job stalled')
    data['alerts'] = issues
    data['healthy'] = not issues
    state = ROOT/'operations'
    state.mkdir(mode=0o700, exist_ok=True)
    previous = json.loads((state/'health.json').read_text()) if (state/'health.json').exists() else {}
    tmp = state/'health.json.tmp'
    tmp.write_text(json.dumps(data,indent=2)+'\n')
    tmp.replace(state/'health.json')
    if issues != previous.get('alerts'):
        print(json.dumps(data))
    return not issues

if __name__ == '__main__':
    raise SystemExit(0 if check() else 1)
