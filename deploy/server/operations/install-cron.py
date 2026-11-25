#!/usr/bin/env python3
"""Install just this app's user crontab block; host timezone must be UTC."""
import subprocess as sp
start='# BEGIN IITMANDI LATEX OPERATIONS'
end='# END IITMANDI LATEX OPERATIONS'
zone=sp.check_output(['timedatectl','show','-p','Timezone','--value'],text=True).strip()
if zone not in ('UTC','Etc/UTC'):
    raise SystemExit('Review cron schedules for non-UTC server timezone: '+zone)
r=sp.run(['crontab','-l'],capture_output=True,text=True)
if r.returncode not in (0,1):
    raise RuntimeError(r.stderr)
old=r.stdout
if start in old:
    before,tail=old.split(start,1)
    _,after=tail.split(end,1)
    old=before+after
block='''# BEGIN IITMANDI LATEX OPERATIONS
# Host UTC: daily 03:15 IST, Sunday restore check 03:45 IST.
45 21 * * * /usr/bin/python3 /srv/iitmandi-latex/operations/job.py backup 2>&1 | /usr/bin/logger -t iitmandi-latex-backup
15 22 * * 6 /usr/bin/python3 /srv/iitmandi-latex/operations/job.py restore 2>&1 | /usr/bin/logger -t iitmandi-latex-restore
*/5 * * * * /usr/bin/python3 /srv/iitmandi-latex/operations/monitor.py 2>&1 | /usr/bin/logger -t iitmandi-latex-monitor
# END IITMANDI LATEX OPERATIONS
'''
sp.run(['crontab','-'],input=old.rstrip()+'\n'+block,check=True,text=True)
print('Installed daily backup, weekly restore verification, five-minute local health monitoring')
