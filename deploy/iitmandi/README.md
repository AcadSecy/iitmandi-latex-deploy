# Production deployment

IIT Mandi LaTeX runs on the DCS server with the upstream [Toolkit](https://github.com/overleaf/toolkit), which starts the app, the git service, MongoDB and Redis as Docker containers. The site is `https://latex.iitmandi.ac.in`. The files here are templates for the Toolkit's `config/` directory.

| Template | Copy to (in the Toolkit checkout) |
| --- | --- |
| `overleaf.rc.example` | `config/overleaf.rc` (change the keys listed, keep the rest) |
| `variables.env.example` | `config/variables.env` |
| `docker-compose.override.yml.example` | `config/docker-compose.override.yml` |
| [`backup/`](backup/README.md) | Nightly off-host backups, installed separately |

## Images

Both images are built from this repository, on the server or any Linux machine with Docker, from the same commit, and pinned in `docker-compose.override.yml`:

| Image | What it is | Build |
| --- | --- | --- |
| `iitmandi/latex` | The web app and all its services | `cd server-ce && make build-base && OVERLEAF_TAG=iitmandi/latex:<tag> make build-community` |
| `iitmandi/latex-x-iit-mandi` | **Latex X IIT-Mandi**, git access to projects | `docker build -t iitmandi/latex-x-iit-mandi:<tag> services/git-bridge` |

Build from a clean checkout of a commit that is on `main`: `make build-community` refuses uncommitted changes. It packs the source of that commit into the image, and the app serves it to logged-in users at `/source`, linked from the footer and the License page. This is how we meet the AGPL-3.0, which entitles everyone who uses the platform to the source of the version they use. The archive covers both images, so the repository itself can stay private.

The git image has the same layout as the upstream one, so the Toolkit runs it unchanged. Git users see the name from `GIT_BRIDGE_SERVICE_NAME` ("Latex X IIT-Mandi"). Its error messages link to `OVERLEAF_SITE_URL/learn` and give `OVERLEAF_ADMIN_EMAIL` as the contact. Projects are cloned with `git clone https://git@latex.iitmandi.ac.in/git/<project id>`, using a git authentication token from the account settings as the password.

## Layout on the server

| Path | Contents |
| --- | --- |
| `/opt/iitmandi-latex/toolkit` | Toolkit checkout and its `config/` (holds the secrets) |
| `/srv/iitmandi-latex/data/app` | Uploaded files, project history, templates, compile cache |
| `/srv/iitmandi-latex/data/mongo` | MongoDB |
| `/srv/iitmandi-latex/data/redis` | Redis append-only file |
| `/srv/iitmandi-latex/data/git-bridge` | Git access data |
| `/srv/iitmandi-latex/images` | Archives of the TeX Live images, about 3 GB each |

Put `/srv/iitmandi-latex` on the 1 TB SSD. MongoDB recommends XFS for its data.

## Databases

- **MongoDB 8.0** holds accounts, projects, the text of every document, comments and the share-link tokens. It runs as a single-member replica set, which the app requires. Its cache is capped at 2 GB (`docker-compose.override.yml`) so that compiles keep their memory.
- **Redis 7.4** holds login sessions and edits that are not yet written to MongoDB. It writes an append-only file synced every second, so a restart or crash loses at most a second of typing. It must never get a memory limit or an eviction policy, because an evicted key is a lost edit.
- Neither database publishes a port. Both are reachable only from the app container on the internal Docker network.
- With `ENABLE_CRON_RESOURCE_DELETION=true`, hourly jobs move projects that have not been opened for a week out of Redis, and remove deleted projects and accounts for good after `OVERLEAF_*_HARD_DELETION_DELAY` (30 days). Without these jobs, storage only ever grows. See [Retention](#retention) for the rest.

At this scale (about 3,500 accounts, 50 people editing at once) the database stays at a few GB. The upstream project runs the same stack for far larger sites. On a single server the limits come from operations, not from the database:

- **No standby server.** If the VM is lost, the platform comes back from the last nightly backup, so up to a day of work can be lost. Run a restore drill before the pilot and after each upgrade.
- **Disk.** Storage is flexible rather than reserved: everyone always has `STORAGE_QUOTA_MB` (500 MB), and can go up to `STORAGE_MAX_MB` (5 GB) while more than `STORAGE_DISK_RESERVE_PERCENT` (15%) of the disk is free. 3,500 × 500 MB would be 1.75 TB, but real use is far lower, and when the disk gets low only the people above 500 MB are stopped and asked to free space. Alert at 80% full and watch the growth of `data/app`.

## Retention

Keeping everything for ever would fill the disk and keep personal data longer than needed, so data has a lifetime:

| What | Kept for | Setting |
| --- | --- | --- |
| Projects in their owner's trash | 30 days, then deleted (the trash says so) | `TRASH_RETENTION_DAYS` |
| Deleted projects and accounts | 30 days restorable by an admin, then removed for good | `OVERLEAF_PROJECT_HARD_DELETION_DELAY`, `OVERLEAF_USER_HARD_DELETION_DELAY` |
| Audit logs (logins, sharing, IP addresses) | 365 days | `AUDIT_LOG_RETENTION_DAYS` |
| Compile output of a project | 1 day after its last compile | built in |
| Container logs | 3 × 50 MB per container | `docker-compose.override.yml` |
| Logs inside the app container | 5 days | built in (logrotate) |
| Backups | 7 days | [`backup/`](backup/README.md) |

The trash and audit log jobs run daily at 02:40 (`server-ce/cron/retention.sh`), and only with `ENABLE_CRON_RESOURCE_DELETION=true`.

A project's history is kept as long as the project, so that any version can be restored; it goes when the project is deleted. Accounts of people who have left are not removed automatically. `modules/retention/scripts/inactive-accounts.mjs --days=730` lists accounts unused for two years with their project counts, and `--delete` removes them once that has been agreed.

## Compiles

Each compile runs in its own container with no network, 1 CPU and 2 GiB of memory (`COMPILE_GROUP_DOCKER_CONFIGS`). `COMPILE_QUEUE_SLOTS` compiles run at once; the rest wait in line.

- **Turns.** A compile that has run for `COMPILE_QUEUE_TURN_SECONDS` while someone waits is paused (`docker pause`: it keeps its memory but uses no CPU) and rejoins the line. A long thesis therefore still finishes on a busy server, and short compiles wait at most about one turn behind it. Paused time does not count towards `COMPILE_TIMEOUT`. `docker ps --filter status=paused` lists paused compiles. After a restart the compile service stops any it finds, since nobody would resume them.
- **Time limit and Stop.** At `COMPILE_TIMEOUT`, or when a user presses Stop, TeX is interrupted instead of killed: it finishes the PDF with the pages typeset so far, which the editor shows with a notice. The compile files stay, so the next compile reuses the `.aux`, `.bbl` and cached figures. Only when something had to be killed mid-write are the files thrown away, as before.
- **Proxy.** A compile request can take up to `COMPILE_QUEUE_MAX_REQUEST_SECONDS` (9 minutes). The app's own nginx allows 10 minutes; a reverse proxy in front of the server must allow at least as long, or long compiles end in a gateway timeout.

## Secrets and share links

`OVERLEAF_INVITE_TOKEN_SECRET` encrypts the share-link tokens in MongoDB, and `OVERLEAF_SESSION_SECRET` signs login cookies. Generate both once (`openssl rand -hex 32`) and never change them. If the invite secret changes or is lost, every share link and pending invitation stops working. The nightly backup includes the Toolkit config, but also keep an offline copy of both secrets with the backup password, in case the backup itself can't be read.

Share links, invitations and emails contain `OVERLEAF_SITE_URL`, which is `https://latex.iitmandi.ac.in`. If it ever has to change, keep the old name redirecting to the new one so that links already sent keep working.

Shared links open only after an IIT Mandi login. Whether people without an account may open view-only links is not decided yet. If it is approved, set `OVERLEAF_ALLOW_PUBLIC_ACCESS=true`, which also opens pages that need no account (help, licence, templates). Anonymous editing stays off.

## TeX Live images

Compiles run in the TeX Live images listed in [`texlive/images.txt`](texlive/images.txt). Each image is pinned by digest, the exact bytes rather than a tag like `latest`, which Docker Hub rebuilds every week. A document that compiles today therefore compiles the same way next semester, and CI tests the very image the server runs.

Install them once, before the first start (as root, or as a member of the docker group):

```sh
deploy/iitmandi/texlive/texlive-images.sh install
deploy/iitmandi/texlive/texlive-images.sh list
```

For each image this pulls the pinned digest, tags it under its local name (`iitmandi/texlive:2026.1`), compiles a test document with pdflatex, xelatex and lualatex as the compile service does, and saves an archive with a checksum in `/srv/iitmandi-latex/images`. The nightly backup includes the archives. If Docker Hub ever changes its terms, removes the images or is unreachable, `install` loads them from the archives instead. `SIBLING_CONTAINERS_PULL=false` in `overleaf.rc` stops the Toolkit from asking Docker Hub for these local names.

To move to a newer TeX Live (once a year, outside exam periods):

1. Get the digest of the new image, add a line with a new local name (`2027.1`) at the top of `images.txt`, and run CI with every job (`gh workflow run CI --ref main -f all=true`).
2. On the server, run `texlive-images.sh install`, put the new name first in `ALL_TEX_LIVE_DOCKER_IMAGES` and `TEX_LIVE_DOCKER_IMAGE` (and its label in `ALL_TEX_LIVE_DOCKER_IMAGE_NAMES`), then `bin/up -d`. New projects use the new image; existing projects keep theirs until their owners switch in the project settings.
3. Remove an old image only when no project uses it any more. Projects record the image they were created with, and the app checks at startup that every recorded image is in `ALL_TEX_LIVE_DOCKER_IMAGES`. To move projects off an old image: `bin/run-script scripts/update_project_image_name.mjs <old name> <new name>`.

Projects created before the switch to pinned images (for example while testing) still record `texlive/texlive:latest-full` or `texlive/texlive:TL2025-historic`. Move them with the same script to `iitmandi/texlive:2026.1` and `iitmandi/texlive:2025.1`.

## Upgrades

1. Take a backup (`systemctl start iitmandi-latex-backup.service`) and check that it finished.
2. Build and tag the new images from a clean checkout of `main` (see Images), set them in `docker-compose.override.yml`, then run `bin/up -d`. Database migrations run when the app starts. Check that `/source` downloads the archive of the new commit.
3. Upgrade MongoDB one major version at a time. After each step, set `featureCompatibilityVersion` to the new version before taking the next.
