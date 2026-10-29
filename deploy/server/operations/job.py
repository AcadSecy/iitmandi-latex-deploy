#!/usr/bin/env python3
"""Record scheduled job failures for the health monitor, retaining journal logs."""
import json
from pathlib import Path
import subprocess
import sys
import time
ROOT=Path('/srv/iitmandi-latex/operations')
name=sys.argv[1]
script={'backup':'backup.py','restore':'verify-backup.py'}[name]
path=ROOT/(name+'-attempt.json')
def record(state,code=None):
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps({'at':time.time(),'state':state,'exit_code':code})+'\n')
    tmp.replace(path)
record('running')
try:
    result=subprocess.run([sys.executable,str(ROOT/script)],timeout=900)
    code=result.returncode
except Exception as e:
    print(str(e),file=sys.stderr)
    code=1
record('success' if code==0 else 'failed',code)
raise SystemExit(code)
