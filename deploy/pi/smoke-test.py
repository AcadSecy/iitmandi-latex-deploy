#!/usr/bin/env python3
"""Use the platform the way a person does: log in, make a project from the example, compile it and
download the PDF. Then check the sandbox: upload a project whose document looks for files that only the
app container has, compile it, and read the log. CI runs this against every image before publishing it;
on the Pi it checks a deploy.

    python3 smoke-test.py http://127.0.0.1:8095 EMAIL PASSWORD [LDAP-USER LDAP-PASSWORD [REFUSED-USER PASSWORD]]

With an LDAP user, it also logs in as them by username, checks that a wrong password is refused, and that
a user who is in the directory but not on the allowlist is refused too. Standard library only. Leaves two projects behind in the account ("Smoke test", "Sandbox probe").
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

# A document that needs XeLaTeX, in a project left on the default pdfLaTeX, compiles all the same
archive = io.BytesIO()
with zipfile.ZipFile(archive, "w") as z:
    z.writestr("main.tex", "\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}\nUnicode: नमस्ते\n\\end{document}\n")
code, body = call("POST", "/project/new/upload", {"name": "Engine check.zip"},
                  files={"qqfile": ("Engine check.zip", archive.getvalue())})
step("upload a document that loads fontspec", code == 200 and b"project_id" in body, f"HTTP {code} {body[:200]!r}")
code, body = call("POST", f"/project/{json.loads(body)['project_id']}/compile?auto_compile=false",
                  {"check": "silent", "draft": False, "incrementalCompilesEnabled": True, "stopOnFirstError": False},
                  timeout=600)
result = json.loads(body) if code == 200 else {}
step("it compiles with XeLaTeX on its own, and the editor is told",
     result.get("status") == "success" and (result.get("engineSwitch") or {}).get("to") == "xelatex",
     f"status {result.get('status')}, engineSwitch {result.get('engineSwitch')}")


def fresh_login(user, pw):
    """Log in with a new session, as someone else would: (logged in, HTTP code)."""
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    page = op.open(base + "/login", timeout=60).read()
    token = re.search(rb'name="ol-csrfToken" content="([^"]+)"', page).group(1).decode()
    req = urllib.request.Request(base + "/login", method="POST",
                                 data=json.dumps({"email": user, "password": pw, "_csrf": token}).encode(),
                                 headers={"Content-Type": "application/json", "Accept": "application/json",
                                          "X-Csrf-Token": token})
    try:
        with op.open(req, timeout=60) as r:
            return r.status == 200 and b"redir" in r.read(), r.status
    except urllib.error.HTTPError as e:
        return False, e.code


# LDAP: an allowed user logs in with their username; one who is in the directory but not on the
# allowlist, and a wrong password, are refused
if len(sys.argv) >= 6:
    ldap_user, ldap_pw = sys.argv[4], sys.argv[5]
    ok, code = fresh_login(ldap_user, ldap_pw)
    step(f"LDAP login as {ldap_user}", ok, f"HTTP {code}")
    ok, code = fresh_login(ldap_user, ldap_pw + "x")
    step("LDAP login with a wrong password is refused", not ok, f"HTTP {code}")
    if len(sys.argv) >= 8:
        ok, code = fresh_login(sys.argv[6], sys.argv[7])
        step(f"LDAP login as {sys.argv[6]}, who is not on the allowlist, is refused", not ok, f"HTTP {code}")
print("all good")
