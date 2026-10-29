#!/usr/bin/env python3
"""Deploy a tested, commit-tagged amd64 image; poll staging from a systemd timer.

Only the public staging branch is followed automatically. A candidate can be
installed explicitly with --commit after its GitHub Actions checks pass.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(os.environ.get("LATEX_ROOT", "/srv/iitmandi-latex"))
REPO = "https://github.com/AcadSecy/iitmandi-latex-deploy.git"
IMAGE = "ghcr.io/acadsecy/iitmandi-latex-server"
COMPOSE = ROOT / "compose"
STATE = ROOT / "deploy"


def run(*args, cwd=None, capture=False):
    return subprocess.run(args, cwd=cwd, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def env(path):
    if not path.exists():
        return {}
    return dict(line.split("=", 1) for line in path.read_text().splitlines()
                if line and not line.startswith("#") and "=" in line)


def compose(*args):
    run("docker", "compose", *args, cwd=COMPOSE)


def wait_ready(image):
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        try:
            actual = run("docker", "inspect", "-f", "{{.Config.Image}} {{.State.Running}}",
                         "iitmandi-latex", capture=True).strip()
            with urllib.request.urlopen("http://127.0.0.1:8080/status", timeout=5) as response:
                if actual == image + " true" and response.status == 200:
                    return
        except (OSError, subprocess.CalledProcessError):
            pass
        time.sleep(5)
    raise RuntimeError("app did not become ready within 15 minutes")


def deploy(commit=None):
    STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / "lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("another deployment is running", flush=True)
            return
        sha = commit or run("git", "ls-remote", REPO, "refs/heads/staging", capture=True).split()[0]
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise ValueError("a full commit SHA is required")
        image = IMAGE + ":" + sha
        current = env(COMPOSE / ".env")
        if current.get("LATEX_IMAGE") == image and (STATE / "deployed-commit").exists() and (STATE / "deployed-commit").read_text().strip() == sha:
            wait_ready(image)
            print("already running " + sha, flush=True)
            return
        # An unpublished commit is still being checked by GitHub Actions.
        published = subprocess.run(["docker", "manifest", "inspect", image], stdout=subprocess.DEVNULL)
        if published.returncode:
            if commit:
                raise RuntimeError("candidate image has not been published")
            print("waiting for the checked image of " + sha, flush=True)
            return
        if shutil.disk_usage(ROOT).free < 15 * 1024**3:
            raise RuntimeError("less than 15 GiB free; deployment refused")
        run("docker", "pull", image)
        info = json.loads(run("docker", "image", "inspect", image, capture=True))[0]
        labels = info["Config"].get("Labels") or {}
        if info["Architecture"] != "amd64" or labels.get("com.overleaf.ce.revision") != sha:
            raise RuntimeError("image architecture or source revision does not match")
        base = labels.get("org.iitmandi.compile-image", "")
        if not base.startswith("ghcr.io/acadsecy/iitmandi-latex-server-base:"):
            raise RuntimeError("unexpected compile image")
        run("docker", "pull", base)
        with tempfile.TemporaryDirectory(dir=STATE) as work:
            checkout = Path(work) / "source"
            run("git", "init", "-q", str(checkout))
            run("git", "-C", str(checkout), "fetch", "--depth=1", REPO, sha)
            run("git", "-C", str(checkout), "checkout", "--detach", "FETCH_HEAD")
            source = checkout / "deploy/server"
            if not (source / "docker-compose.yml").is_file():
                raise RuntimeError("commit has no server deployment configuration")
            compile_name = env(source / "server.env")["TEX_LIVE_DOCKER_IMAGE"]
            previous_base = subprocess.run(["docker", "image", "inspect", "-f", "{{.Id}}", compile_name],
                                           text=True, capture_output=True).stdout.strip()
            backup = STATE / ("before-" + time.strftime("%Y%m%d-%H%M%S"))
            shutil.copytree(COMPOSE, backup)
            os.chmod(backup, 0o700)
            old_image = current.get("LATEX_IMAGE")
            try:
                for name in ("docker-compose.yml", "server.env", "mongodb-init-replica-set.js"):
                    shutil.copy2(source / name, COMPOSE / name)
                current["LATEX_IMAGE"] = image
                (COMPOSE / ".env").write_text("".join(f"{k}={v}\n" for k, v in current.items()))
                run("docker", "tag", base, compile_name)
                compose("config", "--quiet")
                compose("up", "-d", "--remove-orphans")
                wait_ready(image)
            except Exception:
                print("deployment failed; restoring previous configuration and image", flush=True)
                for saved in backup.iterdir():
                    if saved.is_file():
                        shutil.copy2(saved, COMPOSE / saved.name)
                if previous_base:
                    run("docker", "tag", previous_base, compile_name)
                if old_image:
                    compose("up", "-d", "--remove-orphans")
                    wait_ready(old_image)
                else:
                    compose("stop", "sharelatex")
                raise
            # Keep the deployed script in step with its source revision.
            shutil.copy2(source / "deploy.py", ROOT / "deploy.py")
            (STATE / "deployed-commit").write_text(sha + "\n")
            (STATE / "last-success.json").write_text(json.dumps({
                "commit": sha, "image": image, "previous_image": old_image,
                "config_backup": str(backup), "at": time.time(),
            }, indent=2) + "\n")
            print("live: " + sha, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", help="explicitly deploy a tested full commit SHA")
    args = parser.parse_args()
    deploy(args.commit)
