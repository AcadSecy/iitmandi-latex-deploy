# Production deployment

IIT Mandi LaTeX runs on the DCS server with the upstream [Toolkit](https://github.com/overleaf/toolkit), which starts the app, the git service, MongoDB and Redis as Docker containers. The site is `https://latex.iitmandi.ac.in`. The files here are templates for the Toolkit's `config/` directory.

| Template | Copy to (in the Toolkit checkout) |
| --- | --- |
| `overleaf.rc.example` | `config/overleaf.rc` (change the keys listed, keep the rest) |
| `variables.env.example` | `config/variables.env` |
| `docker-compose.override.yml.example` | `config/docker-compose.override.yml` |
| [`backup/`](backup/README.md) | Nightly off-host backups, installed separately |

## Images

Both images are built from this repository, on the server or any Linux machine with Docker, and pinned in `docker-compose.override.yml`:

| Image | What it is | Build |
| --- | --- | --- |
| `iitmandi/latex` | The web app and all its services | `cd server-ce && make build-base && OVERLEAF_TAG=iitmandi/latex:<tag> make build-community` |
| `iitmandi/latex-x-iit-mandi` | **Latex X IIT-Mandi**, git access to projects | `docker build -t iitmandi/latex-x-iit-mandi:<tag> services/git-bridge` |

The git image has the same layout as the upstream one, so the Toolkit runs it unchanged. Git users see the name from `GIT_BRIDGE_SERVICE_NAME` ("Latex X IIT-Mandi"). Its error messages link to `OVERLEAF_SITE_URL/learn` and give `OVERLEAF_ADMIN_EMAIL` as the contact. Projects are cloned with `git clone https://git@latex.iitmandi.ac.in/git/<project id>`, using a git authentication token from the account settings as the password.

## Layout on the server

| Path | Contents |
| --- | --- |
| `/opt/iitmandi-latex/toolkit` | Toolkit checkout and its `config/` (holds the secrets) |
| `/srv/iitmandi-latex/data/app` | Uploaded files, project history, templates, compile cache |
| `/srv/iitmandi-latex/data/mongo` | MongoDB |
| `/srv/iitmandi-latex/data/redis` | Redis append-only file |
| `/srv/iitmandi-latex/data/git-bridge` | Git access data |

Put `/srv/iitmandi-latex` on the 1 TB SSD. MongoDB recommends XFS for its data.

## Databases

- **MongoDB 8.0** holds accounts, projects, the text of every document, comments and the share-link tokens. It runs as a single-member replica set, which the app requires. Its cache is capped at 2 GB (`docker-compose.override.yml`) so that compiles keep their memory.
- **Redis 7.4** holds login sessions and edits that are not yet written to MongoDB. It writes an append-only file synced every second, so a restart or crash loses at most a second of typing. It must never get a memory limit or an eviction policy, because an evicted key is a lost edit.
- Neither database publishes a port. Both are reachable only from the app container on the internal Docker network.
- With `ENABLE_CRON_RESOURCE_DELETION=true`, hourly jobs move projects that have not been opened for a week out of Redis, and remove deleted projects and accounts for good after 90 days. Without these jobs, storage only ever grows.

At this scale (about 3,500 accounts, 50 people editing at once) the database stays at a few GB. The upstream project runs the same stack for far larger sites. On a single server the limits come from operations, not from the database:

- **No standby server.** If the VM is lost, the platform comes back from the last nightly backup, so up to a day of work can be lost. Run a restore drill before the pilot and after each upgrade.
- **Disk.** 3,500 users × 500 MB quota is 1.75 TB, more than the 1 TB SSD, though real use is far lower. Alert at 80% full and watch the growth of `data/app`.

## Secrets and share links

`OVERLEAF_INVITE_TOKEN_SECRET` encrypts the share-link tokens in MongoDB, and `OVERLEAF_SESSION_SECRET` signs login cookies. Generate both once (`openssl rand -hex 32`) and never change them. If the invite secret changes or is lost, every share link and pending invitation stops working. The nightly backup includes the Toolkit config, but also keep an offline copy of both secrets with the backup password, in case the backup itself can't be read.

Share links, invitations and emails contain `OVERLEAF_SITE_URL`, which is `https://latex.iitmandi.ac.in`. If it ever has to change, keep the old name redirecting to the new one so that links already sent keep working.

Shared links open only after an IIT Mandi login. Whether people without an account may open view-only links is not decided yet. If it is approved, set `OVERLEAF_ALLOW_PUBLIC_ACCESS=true`, which also opens pages that need no account (help, licence, templates). Anonymous editing stays off.

## Upgrades

1. Take a backup (`systemctl start iitmandi-latex-backup.service`) and check that it finished.
2. Build and tag the new images, set them in `docker-compose.override.yml`, then run `bin/up -d`. Database migrations run when the app starts.
3. Upgrade MongoDB one major version at a time. After each step, set `featureCompatibilityVersion` to the new version before taking the next.
