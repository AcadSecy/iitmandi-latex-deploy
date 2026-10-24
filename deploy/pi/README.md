# Test deployment on the Raspberry Pi

Before the DCS server is ready, the platform runs in **test mode** on our Raspberry Pi, so that changes can be tried by real people as soon as they are merged. This is not production: the Pi is small, shared with other apps, and has no backups. For production, see [`deploy/iitmandi`](../iitmandi/README.md).

| | |
| --- | --- |
| From anywhere | **https://tayaladitya.github.io/tp-live/latex/**, which forwards to the Pi's Cloudflare tunnel |
| On the campus network | `http://<pi-address>:8095/` (the address is in https://tayaladitya.github.io/tp-live/address.txt) |
| Deploys | every commit on `staging` of [AcadSecy/iitmandi-latex-deploy](https://github.com/AcadSecy/iitmandi-latex-deploy) |
| Accounts | made by the admin in Admin > Manage Users; nobody can sign up |

## How a change gets to the Pi

1. Work on a branch and open a pull request into `staging`. The **Pi image** workflow builds the image for the Pi (arm64) and checks it: every template compiles in the compile image, and the app starts with the Pi's settings, compiles a project for a logged-in user, and compiles a probe that must not see the app's files (the sandbox).
2. Once the checks pass and the pull request is approved, merge it.
3. The workflow runs again on `staging` and publishes `ghcr.io/acadsecy/iitmandi-latex:<commit>`. This takes about 10 minutes when only the platform's code changed, longer when the base image (TeX Live) has to be rebuilt.
4. pi-deploy on the Pi checks `staging` every minute. When the commit's image is published, it pulls it, starts it, waits until the site answers and runs that commit, and otherwise puts the previous version back. Its dashboard (campus network, port 8099) shows each deploy with its log, and https://tayaladitya.github.io/tp-live/deploy/ shows the state from anywhere.

Nothing on GitHub can reach the Pi. The Pi only looks outwards, at the branch and at the registry, so a pull request from a fork can never run anything on it.

### Who can push

- **Anyone** can fork the repository and open a pull request. The workflows of first-time contributors from forks wait for a maintainer to approve them.
- **Collaborators** (Settings > Collaborators) can create branches in the repository itself.
- **`staging` and `main`** take changes only through pull requests with one approval and a passing **Build and check**. They cannot be deleted or force-pushed. The repository owner can bypass this in an emergency.
- `main` is what has been tried on the Pi: open a pull request from `staging` into `main` when a batch has been tested.

## What runs on the Pi

| | |
| --- | --- |
| `/srv/iitmandi-latex` | The platform's own disk, a 16 GB USB stick ([`disk-setup.sh`](disk-setup.sh)), holding everything below |
| `/srv/iitmandi-latex/docker` | The platform's own Docker ([`docker-latex/`](docker-latex/), socket `/run/docker-latex.sock`): its images and containers |
| `/srv/iitmandi-latex/compose` | This folder as in the deployed commit, plus `.env` (the image and the socket), `secrets.env` and `site-url.env` |
| `/srv/iitmandi-latex/data/app` | Files, project history, templates |
| `/srv/iitmandi-latex/data/mongo`, `data/redis` | The databases |
| Containers | `iitmandi-latex`, `iitmandi-latex-mongo`, `iitmandi-latex-redis` (compose project `iitmandi-latex`), on the network `br-latex` with fixed addresses |

The image is the platform's usual image on a different base: TeX Live with the collections in [`Dockerfile-texlive`](Dockerfile-texlive) (the templates, most theses and reports; not the 1.5 GB of extra fonts) and biber, which TeX Live has no working arm64 build of.

### Compiles

Compiles are sandboxed as in production: each one runs in a container of its own, with no network, 1.5 GiB of memory, one CPU and 256 processes, and sees only its project's files. The compile image is the base image itself, so it costs no extra disk: its layers are already there as part of the app image. pi-deploy tags it as `iitmandi/texlive-pi:2026.1` (`TEX_LIVE_DOCKER_IMAGE` in [`pi.env`](pi.env)), the name projects record. A long compile takes turns of a minute when others are waiting, and shell escape is on, as in production.

A sandbox is needed: TeX Live 2026 no longer restricts what TeX may read (`openin_any` now applies to writing only), so without it any document could read the app's secrets and other people's files. CI checks the sandbox on every image with a probe document that looks for the app's settings and code.

**The price:** to start compile containers, the app container has a Docker socket. It is the platform's own Docker, which runs nothing but the platform's containers, but like any Docker it can mount the Pi's files, so it still amounts to root on the Pi and its eight other apps. A security hole in the platform would therefore reach the whole Pi. Production avoids this by running on a server that hosts nothing else. Accounts are made by the admin only, so give them to people you know.

### Staying within its disk

The platform has a disk of its own: a 16 GB USB stick mounted at `/srv/iitmandi-latex`, with a Docker of its own on it. Its images, containers and data never touch the card, which the Pi's eight other apps use. Without the stick, its Docker does not start, so nothing is written to the card instead. The first deploy showed why this is needed: in the Pi's own Docker, which keeps a compressed and an unpacked copy of every image, the platform's image took 6.2 GB of the card. The platform's Docker keeps one copy.

The stick is USB 2, so images pull and the app starts more slowly than from the card; editing and compiling are not affected much, since compile files live in RAM.

- Compile files live in RAM: `data/app/data/compiles` (1.5 GB) and `data/app/data/output` (768 MB) are RAM disks of the Pi, set up by `setup.sh` in `/etc/fstab`. They never fill the disk and are rebuilt by the next compile after a restart.
- Everyone gets 50 MB, and up to 200 MB while more than 10% of the disk is free. Uploads are limited to 20 MB.
- Trash, deleted projects and accounts go after 7 days; container logs are capped at 3 × 10 MB each.
- The app gets at most 3 of the 4 cores and 3.5 GB of memory, MongoDB 1 GB, Redis 512 MB, each compile 1.5 GiB. Two compiles run at once and two more may be paused; the rest queue.
- pi-deploy refuses to pull a new image unless 6 GB are free on the stick, after clearing its Docker's build cache. Only the image that is live and the one before it are kept; older ones are pulled again from the registry if anyone rolls back to them.
- pi-deploy watches the stick's free space every five minutes. Below 1.5 GB it clears its Docker's caches, and if that is not enough it **stops the platform** before the stick fills up. It starts it again once 3 GB are free. The dashboard shows when this happens.

### The public link

pi-deploy runs a Cloudflare quick tunnel to port 8095, like the other public links on the Pi. The tunnel's address changes whenever it restarts, so the Pi publishes the current one to tp-live, and https://tayaladitya.github.io/tp-live/latex/ always forwards there. The app puts its own address into share links and invitations, so pi-deploy also writes the new address to `site-url.env` and restarts the app, which takes about a minute. Links shared before a tunnel restart stop working: share the tp-live link instead, and open the project from the project list.

A named Cloudflare tunnel, on a domain of ours, would give a fixed address and remove these restarts.

## Setting up the Pi

Once, on the Pi:

```sh
sudo bash setup.sh                              # folders, secrets, compile RAM disks; safe to run again
sudo FORMAT=yes bash disk-setup.sh /dev/sda     # the platform's own disk and Docker: ERASES that disk
```

Then add the app to pi-deploy's `apps.json` (kind `image`, with `"docker_host": "unix:///run/docker-latex.sock"` and `"disk": "/srv/iitmandi-latex"`) and push pi-deploy. After the first deploy, make the admin account on the Pi:

```sh
bash /srv/iitmandi-latex/compose/create-admin.sh admin@iitmandi-latex.test
python3 /srv/iitmandi-latex/compose/smoke-test.py http://127.0.0.1:8095 admin@iitmandi-latex.test '<password>'
```

The password is kept in `~/.config/iitmandi-latex/admin.txt`.

## Run it on your own machine

Test your change before you push it, on Linux or WSL2 with Docker (about 15 GB of disk), with the same compose file and settings as the Pi:

```sh
# 1. The base image: system packages, TeX Live and biber (slow, once; again only if
#    server-ce/Dockerfile-base or deploy/pi/Dockerfile-texlive change)
cd server-ce && make build-base OVERLEAF_BASE_TAG=iitmandi-latex-base:upstream && cd ..
docker build -f deploy/pi/Dockerfile-texlive \
  --build-arg OVERLEAF_BASE_TAG=iitmandi-latex-base:upstream -t iitmandi-latex-base:local deploy/pi
docker tag iitmandi-latex-base:local iitmandi/texlive-pi:2026.1      # the compile image

# 2. The app image from your working tree (repeat after every change: 5 to 15 minutes)
cd server-ce && ALLOW_DIRTY=true OVERLEAF_BASE_TAG=iitmandi-latex-base:local \
  OVERLEAF_TAG=iitmandi-latex:local make build-community && cd ..

# 3. Start it, and make yourself an admin (the first time)
cd deploy/pi
[ -s secrets.env ] || printf 'OVERLEAF_INVITE_TOKEN_SECRET=%s\nOVERLEAF_SESSION_SECRET=%s\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > secrets.env
export LATEX_IMAGE=iitmandi-latex:local LATEX_DATA=$HOME/iitmandi-latex-data
docker compose up -d
bash create-admin.sh you@iitmandi-latex.test
python3 smoke-test.py http://localhost:8095 you@iitmandi-latex.test '<password>'   # what CI checks
```

Then open http://localhost:8095. `secrets.env` and the data folder stay between runs; `docker compose down` stops everything. `ALLOW_DIRTY=true` is for your own machine only: images for the Pi are built by CI from committed code.

## Moving to a bigger disk

Plug the new disk in (USB 3, the blue ports) and run `disk-setup.sh` with it, from this folder on the Pi:

```sh
lsblk -o NAME,SIZE,MODEL,TRAN                   # find the new disk, for example /dev/sdb
sudo FORMAT=yes bash disk-setup.sh /dev/sdb     # ERASES /dev/sdb
```

It stops the platform's Docker, copies everything from the stick (data, secrets and images) onto the new disk, mounts that at `/srv/iitmandi-latex` instead and starts the Docker again; the stick is left as it was, so take it out afterwards. With the space, raise the limits in `pi.env` (storage, compiles) through a pull request, and `min_free_gb` in pi-deploy's `apps.json`.

## Useful commands on the Pi

```sh
cd /srv/iitmandi-latex/compose
export DOCKER_HOST=unix:///run/docker-latex.sock      # the platform's own Docker
docker compose ps
docker compose logs -f --tail=100 sharelatex
docker exec iitmandi-latex tail -f /var/log/overleaf/web.log
df -h /srv/iitmandi-latex
```
