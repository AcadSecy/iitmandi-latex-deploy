# LaTeX on the Institute server

Only IIT Mandi LaTeX moves here. The Pi's other apps and deployment branches
are unchanged. The campus address is http://172.19.17.79:8080; SSH uses port
2200 and user `latexiitm_user`. This instance is amd64.

## Pull requests and deployments

Contributions still use pull requests into `staging` in
`AcadSecy/iitmandi-latex-deploy`. The **Server image / Build and check** job
builds amd64 images, compiles every template, starts the server configuration,
and checks login, LDAP rejection, project creation, PDF/ZIP downloads and
compile sandbox isolation. The required check name stays `Build and check`.
The workflow file retains its old `pi-image.yml` path so existing links work.

After checks and review, a merge publishes
`ghcr.io/acadsecy/iitmandi-latex-server:<commit>`. A systemd timer on this server
polls `staging` every minute. It verifies the image's architecture and source
revision, saves the current configuration, installs that commit's compose
files, and waits for `/status`. A failed start restores the previous image,
compile-image alias and configuration. Database migrations are not undone by
an image rollback; take a full backup before schema upgrades.

A maintainer can dispatch the workflow on a candidate branch and explicitly
install its tested commit with `python3 /srv/iitmandi-latex/deploy.py --commit
<40-character-sha>`. Automatic deployment always follows `staging`.

## Installation and migration

1. Ensure the instance has working outgoing internet/DNS and Docker Compose.
2. Create `/srv/iitmandi-latex/{compose,data,deploy,backups}` owned by the deploy
   user. Copy this folder's compose files, `server.env` and replica-set init
   script to `compose/`, and `deploy.py` to `/srv/iitmandi-latex/deploy.py`.
3. Transfer the old `secrets.env`, `ldap.env`, `ldap.cfg` and admin credentials
   over SSH. Keep them private. Keep the invite secret unchanged so existing
   share tokens still decrypt. Set `site-url.env` to the chosen site URL.
4. In `compose/.env`, set `LATEX_DATA=/srv/iitmandi-latex/data`,
   `LATEX_PORT=8080` and the tested `LATEX_IMAGE`. Leave the Docker socket at
   `/var/run/docker.sock`. Do not copy the Pi's private Docker socket setting.
5. Stop writes on the old LaTeX instance. Back up MongoDB with `mongodump
   --oplog --archive --gzip`, the app data, Redis data and all private config.
   Exclude only disposable app `data/compiles`, `data/output`, `data/cache`
   and `tmp`. Never copy a running MongoDB database directory between hosts.
6. Restore app/Redis data with numeric ownership, start `mongo redis ldap`,
   then run `mongorestore --archive --gzip --oplogReplay` against the new
   replica set. Compare collection counts and file checksums before starting
   the app. The Pi's source backup remains available for rollback.
7. Run the deployed image through `deploy.py --commit <sha>`. The legacy
   `iitmandi/texlive-pi:2026.1` compile-image name is intentionally retained:
   existing projects refer to it, but the server's image is native amd64.
8. Run `../pi/smoke-test.py` against port 8080 with the transferred admin and
   LDAP credentials. Test an existing project too. Disable only the Pi's
   LaTeX deploy entry after verifying the new site. Keep other apps running.
9. Install the `.service` and `.timer` files under `/etc/systemd/system`, run
   `systemctl daemon-reload` and enable `iitmandi-latex-deploy.timer`.

`server.env` preserves the existing login policy, quotas and retention.
The app has 8 GiB/8 CPUs, MongoDB 4 GiB with a 2 GiB cache, and four parallel
compiles. Redis retains AOF persistence and has no eviction or memory cap.
MongoDB, Redis and LDAP publish no host ports. Each compile has no network
and sees only its project's files.

## Campus LDAP alongside test login

The optional campus LDAP profile adds an **IIT Mandi account** choice to the
existing login form. The **Existing test or local account** choice continues
to use the local test directory and app passwords. Leave the current
`compose/ldap.env` in place.

Ask DCS for an LDAPS or StartTLS endpoint reachable from the app container,
its CA if needed, and the search access to read `entryUUID`, `mail`,
`givenName` and `sn` in the eligible directory branches. The campus strategy
verifies the server certificate and hostname. The host at
`users.iitmandi.ac.in` accepted TCP on 389 on 2026-11-25, but rejected StartTLS
and timed out on 636 from the production container.

Once DCS supplies these settings, install a private copy of
[`campus-ldap.env.example`](campus-ldap.env.example) as
`compose/campus-ldap.env`. If DCS uses a private CA, use a read-only mount for
the CA certificate and set the corresponding container path in the profile.
After the application version with this provider is deployed, recreate only
the `sharelatex` container under the deployment lock. Use a DCS-approved
test account to verify campus login and the existing synthetic or pilot
account to verify test login. Run the local config and identity policy checks
with `node --test deploy/server/test-campus-ldap.mjs`.

An existing account with the same email keeps its current credentials and
projects. The campus provider refuses it until account ownership has been
verified and the directory identity linked through a reviewed migration.
New campus accounts require a single verified institute directory email and
its immutable `entryUUID`. If the Institute changes an email or reassigns an
address, reconcile the account and directory identity before reusing that
address. Keep the existing test directory's allowlist as-is during the pilot.
For rollback, disable the campus profile in `campus-ldap.env` and keep an
application image with the account separation checks after any campus
accounts have been created.

## Operations

```
cd /srv/iitmandi-latex/compose
docker compose ps
docker compose logs --tail=100 sharelatex
systemctl status iitmandi-latex-deploy.timer
journalctl -u iitmandi-latex-deploy.service --no-pager -n 100
cat /srv/iitmandi-latex/deploy/last-success.json
```

For a manual rollback, stop the deployment timer, restore the recorded
configuration backup and previous compile-image alias, then run
`docker compose up -d`. Resume the timer after fixing `staging`; otherwise
it will install the branch head again. Local migration backups are not
off-host disaster recovery: configure the institute's backup destination
before treating this service as production.
