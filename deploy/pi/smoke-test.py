#!/usr/bin/env python3
"""Use the platform the way a person does: log in, make a project from the example, compile it and
download the PDF. CI runs it against every image before publishing it; on the Pi it checks a deploy.

    python3 smoke-test.py http://127.0.0.1:8095 EMAIL PASSWORD

Standard library only. Leaves the project behind (in the account's project list as "Smoke test").
"""
import http.cookiejar
import json
import re
import sys
import time
import urllib.error
import urllib.request

base, email, password = sys.argv[1].rstrip("/"), sys.argv[2], sys.argv[3]
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = None


def call(method, path, body=None, timeout=60):
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
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
code, body = call("POST", f"/project/{project}/compile?auto_compile=false",
                  {"check": "silent", "draft": False, "incrementalCompilesEnabled": True, "stopOnFirstError": False},
                  timeout=600)
result = json.loads(body) if code == 200 else {}
step("compile", result.get("status") == "success", f"HTTP {code} {body[:300]!r}")
pdf = next((f for f in result.get("outputFiles", []) if f.get("path") == "output.pdf"), None)
step("compile made a PDF", pdf is not None, json.dumps(result)[:300])

code, data = call("GET", pdf["url"])
step(f"download the PDF ({int(time.time() - started)} s)", code == 200 and data.startswith(b"%PDF"), f"HTTP {code}")
print(f"all good: project {project}, {len(data) // 1024} KB PDF")
