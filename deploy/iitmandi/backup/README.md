# Backups

Nightly, off-host, encrypted backups of IIT Mandi LaTeX with 7 days of retention, as required by the implementation plan. They run on the host that runs the Overleaf Toolkit, without stopping the platform.

## What is backed up

| Data | How |
| --- | --- |
| Users, projects, documents, comments (MongoDB) | `mongodump --oplog`, consistent at one point in time |
| Uploaded files, project history, templates (`OVERLEAF_DATA_PATH`) | Files, excluding compile output and caches |
| Git access data (`GIT_BRIDGE_DATA_PATH`) | Files, if git-bridge is enabled |
| Toolkit config (`config/`, includes secrets) | Files |

Before the dump, edits still held in Redis are flushed to the database. Redis itself is not backed up: it only holds sessions and in-flight edits, and a restore empties it.

Backups go to a [restic](https://restic.net) repository on another machine (an SFTP account on a backup server, or an S3-compatible bucket). restic encrypts and deduplicates, so each night only uploads what changed. One snapshot per day is kept for `KEEP_DAILY` days (default 7). Every Sunday a 5% sample of the stored data is read back to detect corruption.

## Setup (once, as root)

1. Install restic 0.14 or newer. On Ubuntu 24.04: `apt install restic`. On 22.04 the packaged version is too old, so install the release binary from GitHub.
2. Create the settings and the repository password. **Store a copy of the password somewhere safe and offline**: without it, the backups cannot be read.

   ```sh
   mkdir -p /etc/iitmandi-latex
   install -m 600 backup.env.example /etc/iitmandi-latex/backup.env   # then edit it
   openssl rand -base64 32 > /etc/iitmandi-latex/restic-password
   chmod 600 /etc/iitmandi-latex/restic-password
   ```

3. For an SFTP repository, give root's SSH key access to the backup account (`ssh-copy-id backup@BACKUP_HOST`) and connect once to accept the host key.
4. Create the repository:

   ```sh
   set -a; . /etc/iitmandi-latex/backup.env; set +a
   restic init
   ```

5. Install the scripts and the timer:

   ```sh
   install -m 750 backup.sh /usr/local/sbin/iitmandi-latex-backup
   install -m 750 restore.sh /usr/local/sbin/iitmandi-latex-restore
   install -m 644 iitmandi-latex-backup.service iitmandi-latex-backup.timer /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now iitmandi-latex-backup.timer
   ```

6. Run a first backup and check it:

   ```sh
   systemctl start iitmandi-latex-backup.service
   journalctl -u iitmandi-latex-backup.service
   restic snapshots
   ```

The timer runs at about 02:30 server time. If the server was off at that time, the backup runs at the next boot.

## Restoring

```sh
iitmandi-latex-restore            # latest snapshot
iitmandi-latex-restore 4bba301e   # a specific snapshot, IDs from `restic snapshots`
```

The script asks for confirmation, stops the platform, replaces the data directories and the database with the snapshot, empties Redis and starts the platform again. Compile output is rebuilt on the next compile, and everyone has to log in again. The snapshot's Toolkit config is restored next to the staging directory for comparison, not over the live config.

`STAGING_DIR` (or `RESTORE_DIR`) needs free space for a full copy of the data.

## Restore drill

Restore the latest snapshot on a separate test VM at least once a month, and before each upgrade. Then log in, open a few projects and compile them. A backup that has never been restored is not known to work.

## Monitoring

- `journalctl -u iitmandi-latex-backup.service` shows each run. A failed run marks the service as failed (`systemctl --failed`).
- Set `HEALTHCHECK_URL` to have each successful run ping a monitoring check, which alerts when pings stop.
