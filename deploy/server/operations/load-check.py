#!/usr/bin/env python3
"""Eight concurrent disposable sandbox compiles; no real projects are modified.
This tests sandbox capacity, not 200-browser editor or HTTP queue throughput.
"""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import shutil
import subprocess as sp
import tempfile
import time

ROOT=Path('/srv/iitmandi-latex/operations')

def main():
    work=Path(tempfile.mkdtemp(prefix='load-check-',dir=ROOT))
    work.chmod(0o755)
    start=time.monotonic()
    try:
        def compile_one(i):
            directory=work/str(i)
            directory.mkdir(mode=0o777)
            directory.chmod(0o777)
            tex=r'''\documentclass{article}
\usepackage{fontspec,hyperref,longtable}
\setmainfont{Calibri}
\begin{document}
'''+((r'Capacity test: Unicode text, mathematics $E=mc^2$ and a complete page.\par\newpage'+'\n')*36)+r'\end{document}'
            (directory/'main.tex').write_text(tex)
            name=f'latex-load-check-{work.name}-{i}'
            t=time.monotonic()
            try:
                r=sp.run(['docker','run','--rm','--name',name,'--network','none',
                    '--memory','1536m','--cpus','1','--pids-limit','256',
                    '--read-only','--tmpfs','/tmp:size=128m,mode=1777',
                    '--user','33:33','--mount',f'type=bind,src={directory},dst=/compile',
                    '-w','/compile','--entrypoint','latexmk','iitmandi/texlive-pi:2026.1',
                    '-xelatex','-interaction=nonstopmode','-halt-on-error','main.tex'],
                    capture_output=True,text=True,timeout=120)
                pdf=directory/'main.pdf'
                ok=r.returncode==0 and pdf.exists() and pdf.stat().st_size>1000
                return {'job':i,'ok':ok,'seconds':round(time.monotonic()-t,2),
                        'pdf_bytes':pdf.stat().st_size if pdf.exists() else 0,
                        **({'error':r.stderr[-500:]+r.stdout[-500:]} if not ok else {})}
            finally:
                sp.run(['docker','rm','-f',name],stdout=sp.DEVNULL,stderr=sp.DEVNULL)
        with ThreadPoolExecutor(max_workers=8) as pool:
            jobs=list(pool.map(compile_one,range(8)))
        result={'at':time.time(),'parallel_compiles':8,'pages_per_job':36,
                'seconds':round(time.monotonic()-start,2),'ok':all(j['ok'] for j in jobs),'jobs':jobs}
        (ROOT/'load-check.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result))
        if not result['ok']:
            raise SystemExit(1)
    finally:
        shutil.rmtree(work)

if __name__=='__main__':
    main()
