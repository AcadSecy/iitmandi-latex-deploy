# Test deployment on the Raspberry Pi

Before the DCS server is ready, the platform runs in **test mode** on our Raspberry Pi, so that changes can be tried by real people as soon as they are merged. This is not production: the Pi is small, shared with other apps, and has no backups. For production, see [`deploy/iitmandi`](../iitmandi/README.md).

| | |
| --- | --- |
| From anywhere | **https://tayaladitya.github.io/tp-live/latex/**, which forwards to the Pi's Cloudflare tunnel |
| On the campus network | `http://<pi-address>:8095/` (the address is in https://tayaladitya.github.io/tp-live/address.txt) |
| Deploys | every commit on `staging` of [AcadSecy/iitmandi-latex-deploy](https://github.com/AcadSecy/iitmandi-latex-deploy) |
| Accounts | made by the admin in Admin > Manage Users; nobody can sign up |

## How a change gets to the Pi

1. Work on a branch and open a pull request into `staging`. The **Pi image** workflow builds the image for the Pi (arm64) and checks it: every template compiles, TeX cannot read files outside the compile folders, and the app starts with the Pi's settings and compiles a project for a logged-in user.
2. Once the checks pass and the pull request is approved, merge it.
3. The workflow runs again on `staging` and publishes `ghcr.io/acadsecy/iitmandi-latex:<commit>`. This takes about 30 to 60 minutes, mostly the web build.
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
| `/srv/iitmandi-latex/compose` | This folder as in the deployed commit, plus `.env` (the image), `secrets.env` and `site-url.env` |
| `/srv/iitmandi-latex/data/app` | Files, project history, templates |
| `/srv/iitmandi-latex/data/mongo`, `data/redis` | The databases |
| Containers | `iitmandi-latex`, `iitmandi-latex-mongo`, `iitmandi-latex-redis` (compose project `iitmandi-latex`) |

The image is the platform's usual image on a different base: TeX Live with the collections in [`Dockerfile-texlive`](Dockerfile-texlive) (the templates, most theses and reports; not the 1.5 GB of extra fonts), instead of separate TeX Live images. Compiles therefore run inside the app container, without the per-compile sandbox that production has. TeX may not open files outside the compile folders (`openin_any=p`), shell escape is off and nobody can sign up, but LuaLaTeX can still read files through Lua. **Give accounts only to people you trust**, and keep anything private off the test server.

### Staying within the card

The Pi has a 29 GB card that also holds eight other apps, so the platform is boxed in:

- Compile files live in RAM (1.5 GB at most), so they never fill the card and are rebuilt by the next compile after a restart.
- Everyone gets 50 MB, and up to 200 MB while more than 10% of the card is free. Uploads are limited to 20 MB.
- Trash, deleted projects and accounts go after 7 days; container logs are capped at 3 × 10 MB each.
- The app gets at most 3 of the 4 cores and 5 GB of memory, MongoDB 1 GB, Redis 512 MB. Two compiles run at once; the rest queue.
- pi-deploy refuses to pull a new image unless 4 GB are free, after clearing Docker's build cache. Only the image that is live and the one before it are kept; older ones are pulled again from the registry if anyone rolls back to them.
- pi-deploy watches the free space every five minutes. Below 1.5 GB it clears Docker's caches, and if that is not enough it **stops the platform**, so that the other apps keep working. It starts it again once 3 GB are free. The dashboard shows when this happens.

### The public link

pi-deploy runs a Cloudflare quick tunnel to port 8095, like the other public links on the Pi. The tunnel's address changes whenever it restarts, so the Pi publishes the current one to tp-live, and https://tayaladitya.github.io/tp-live/latex/ always forwards there. The app puts its own address into share links and invitations, so pi-deploy also writes the new address to `site-url.env` and restarts the app, which takes about a minute. Links shared before a tunnel restart stop working: share the tp-live link instead, and open the project from the project list.

A named Cloudflare tunnel, on a domain of ours, would give a fixed address and remove these restarts.

## Setting up the Pi

Once, on the Pi:

```sh
sudo bash setup.sh            # folders and secrets; safe to run again
```

Then add the app to pi-deploy's `apps.json` (kind `image`) and push pi-deploy. After the first deploy, make the admin account on the Pi:

```sh
bash /srv/iitmandi-latex/compose/create-admin.sh admin@iitmandi-latex.test
python3 /srv/iitmandi-latex/compose/smoke-test.py http://127.0.0.1:8095 admin@iitmandi-latex.test '<password>'
```

The password is kept in `~/.config/iitmandi-latex/admin.txt`.

## Moving to an external disk

When a disk is connected, put the data on it without changing any setting:

```sh
cd /srv/iitmandi-latex/compose && docker compose stop
sudo mount /dev/sda1 /mnt/latex-disk                  # the new disk, ext4
sudo rsync -aHAX /srv/iitmandi-latex/ /mnt/latex-disk/
sudo umount /mnt/latex-disk
sudo mv /srv/iitmandi-latex /srv/iitmandi-latex.card
sudo mkdir /srv/iitmandi-latex
echo 'UUID=<blkid of the disk> /srv/iitmandi-latex ext4 defaults,noatime,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount /srv/iitmandi-latex && docker compose up -d
```

Remove `/srv/iitmandi-latex.card` once the site works. With the space, raise the limits in `pi.env` (storage, compiles) through a pull request like any other change. The images themselves stay on the card; to move them as well, change Docker's `data-root`.

## Useful commands on the Pi

```sh
cd /srv/iitmandi-latex/compose
docker compose ps
docker compose logs -f --tail=100 sharelatex
docker exec iitmandi-latex tail -f /var/log/overleaf/web.log
df -h /srv/iitmandi-latex
```
