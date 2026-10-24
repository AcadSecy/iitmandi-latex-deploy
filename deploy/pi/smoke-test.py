#!/usr/bin/env python3
"""Use the platform the way a person does: log in, make a project from the example, compile it and
download the PDF. Then check the sandbox: upload a project whose document looks for files that only the
app container has, compile it, and read the log. CI runs this against every image before publishing it;
on the Pi it checks a deploy.

    python3 smoke-test.py http://127.0.0.1:8095 EMAIL PASSWORD

Standard library only. Leaves two projects behind in the account ("Smoke test", "Sandbox probe").
"""
import http.cookiejar
import io
import json
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
import zipfile

base, email, password = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = None

# Files that exist in the app container but not in a compile container. A sandboxed compile must not see
# them; without the sandbox TeX would find both.
PROBE = r"""\documentclass{article}
\begin{document}
\IfFileExists{/etc/overleaf/settings.js}{\typeout{SANDBOX-LEAK app settings}}{\typeout{SANDBOX-OK app settings}}
\IfFileExists{/overleaf/services/web/package.json}{\typeout{SANDBOX-LEAK app code}}{\typeout{SANDBOX-OK app code}}
Sandbox probe.
\end{document}
"""


def call(method, path, body=None, timeout=60, files=None):
    headers = {"Accept": "application/json"}
    data = None
    if files is not None:  # multipart: form fields in body, files as {field: (filename, bytes)}
        boundary = secrets.token_hex(16)
        parts = []
        for k, v in (body or {}).items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (fname, content) in files.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{fname}"\r\n'
                         f'Content-Type: application/zip\r\n\r\n'.encode() + content + b"\r\n")
        data = b"".join(parts) + f"--{boundary}--\r\n".encode()
        headers.update({"Content-Type": f"multipart/form-data; boundary={boundary}", "X-Csrf-Token": csrf})
    elif body is not None:
        data = json.dumps({**body, "_csrf": csrf}).encode()
        headers.update({"Content-Type": "application/json", "X-Csrf-Token": csrf})
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def step(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + (f": {detail}" if detail and not ok else ""), flush=True)
    if not ok:
        sys.exit(1)


def compile_project(project):
    code, body = call("POST", f"/project/{project}/compile?auto_compile=false",
                      {"check": "silent", "draft": False, "incrementalCompilesEnabled": True, "stopOnFirstError": False},
                      timeout=600)
    result = json.loads(body) if code == 200 else {}
    step("compile", result.get("status") == "success", f"HTTP {code} {body[:300]!r}")
    return {f.get("path"): f for f in result.get("outputFiles", [])}


code, page = call("GET", "/login")
m = re.search(rb'name="ol-csrfToken" content="([^"]+)"', page)
step("login page", code == 200 and m is not None, f"HTTP {code}")
csrf = m.group(1).decode()

code, body = call("POST", "/login", {"email": email, "password": password})
step("log in", code == 200 and b"redir" in body, f"HTTP {code} {body[:200]!r}")
code, page = call("GET", "/project")
m = re.search(rb'name="ol-csrfToken" content="([^"]+)"', page)
step("project list", code == 200 and m is not None, f"HTTP {code}")
csrf = m.group(1).decode()

code, body = call("POST", "/project/new", {"projectName": f"Smoke test {time.strftime('%Y-%m-%d %H:%M')}", "template": "example"})
step("new project from the example", code == 200 and b"project_id" in body, f"HTTP {code} {body[:200]!r}")
project = json.loads(body)["project_id"]

started = time.time()
outputs = compile_project(project)
step("compile made a PDF", "output.pdf" in outputs, ", ".join(outputs))
code, data = call("GET", outputs["output.pdf"]["url"])
step(f"download the PDF ({int(time.time() - started)} s)", code == 200 and data.startswith(b"%PDF"), f"HTTP {code}")
print(f"example project {project}, {len(data) // 1024} KB PDF")

archive = io.BytesIO()
with zipfile.ZipFile(archive, "w") as z:
    z.writestr("main.tex", PROBE)
code, body = call("POST", "/project/new/upload", {"name": "Sandbox probe.zip"},
                  files={"qqfile": ("Sandbox probe.zip", archive.getvalue())})
step("upload the sandbox probe", code == 200 and b"project_id" in body, f"HTTP {code} {body[:200]!r}")
outputs = compile_project(json.loads(body)["project_id"])
code, log = call("GET", outputs.get("output.log", {}).get("url", "/missing"))
found = re.findall(rb"SANDBOX-(OK|LEAK) ([a-z ]+)", log)
step("the compile ran in the sandbox: it cannot see the app's settings or code",
     code == 200 and len(found) == 2 and all(r == b"OK" for r, _ in found),
     ", ".join(f"{r.decode()} {w.decode()}" for r, w in found) or f"HTTP {code}, no probe lines in the log")
print("all good")
