# Server operations

The local capacity override survives deployments because the deployer replaces
only docker-compose.yml, server.env and the replica-set init script. Install
capacity.override.yml as `/srv/iitmandi-latex/compose/docker-compose.override.yml`.
It sets 100 normal / 200 elastic editor sessions, eight active compile slots,
500 MB base / 5,000 MB flexible per-owner storage, and 15% disk reserve. It does
not create accounts or change the login allowlist. No capacity promise for 200
browsers follows from a sandbox compile benchmark.

Install these Python files in `/srv/iitmandi-latex/operations` (directory mode
0700), then run `python3 install-cron.py` as the deploy user. Host cron must use
UTC. It preserves unrelated crontab entries. Jobs survive logout and reboot:

- Daily 03:15 Asia/Kolkata: local backup, retaining fourteen successful snapshots.
- Sunday 03:45 Asia/Kolkata: isolated restore verification.
- Every five minutes: local HTTP/container/disk/memory/backup health checks.

Backups pause app writes while capturing MongoDB with oplog, a Redis RDB with
recent edits, all persistent app data except disposable cache/output/tmp, and
Compose configuration including secrets. A deployment lock prevents concurrent
configuration changes. A watchdog unpauses after five minutes if the backup
process dies. Timeout or capture failure never publishes a successful snapshot.
Current small dataset capture took about two seconds; freeze duration grows
with data. Before larger rollout, use host-managed coordinated filesystem
snapshots or a different consistency strategy to avoid long pauses. Failed
`.partial` directories are retained for diagnosis and need manual review.

Snapshot files and directories are private but **not encrypted at rest by these
scripts**. This is same-host recovery only. Do not publish data/config backups
to GitHub. Off-host encrypted backups and external uptime/push alerts remain
unconfigured. `health.json` and `*-attempt.json` expose local state; failures and
changes are logged with `logger` under `iitmandi-latex-*` in the system journal.

`verify-backup.py` hashes every backup file, reads every archive member, restores
MongoDB including indexes/oplog in an isolated no-network temporary container,
compares user/project/document counts, checks the Redis RDB, and boots an
isolated Redis instance from it. It never restores over production. The test
uses bounded scratch memory; expand its 2 GiB tmpfs for larger databases.
This is data restore verification, not a complete replacement-host login test.

For real disaster recovery, first preserve the broken deployment, stop app
writes and Redis, restore `app.tar.gz` with numeric ownership to the configured
app data directory, compare the saved Compose config, restore MongoDB with
`mongorestore --drop --oplogReplay --gzip --archive`, and restore Redis into a
fresh Redis data directory from `redis.rdb` (do not leave an old AOF that would
supersede the RDB). Start Redis and app with the snapshot's tested image and
compile-image alias; verify login, existing documents, compilation and downloads
before reopening access. Review host paths and credentials on a replacement
host. Never run live restore automatically as a scheduled check.

`load-check.py` runs eight disposable no-network / 1 CPU / 1.5 GiB / 256 PID
sandboxes, compiling a 36-page XeLaTeX document in each. No real project is
modified. This does not measure authenticated HTTP, browser sessions, or the
application queue under 200 users.
