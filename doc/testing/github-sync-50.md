# GitHub sync configuration and first acceptance pass

This audit covers the GitHub integration in the editor. The student Git bridge has a separate deployment and acceptance path in #19. The baseline is Institute `staging` at `ef2bb8a264`.

## Current behavior

| Area | Source and observed behavior |
| --- | --- |
| Server gate | `services/web/modules/github-sync/index.mjs` requires `GITHUB_SYNC_ENABLED=true` and both `GITHUB_SYNC_CLIENT_ID` and `GITHUB_SYNC_CLIENT_SECRET` before registering the router. The callback uses `Settings.siteUrl` and `/user/github-sync/oauth2/callback`. The checked-in Institute server configuration provides none of these values. |
| UI gate | The feature predicate and `ExpressLocals.mjs` now advertise the router's effective status. Account settings expose the connection, the project list exposes GitHub import and the editor integrations panel offers export or sync. |
| Access | Every route requires a signed-in user. Project routes check write access through the common authorization middleware. Export additionally verifies project ownership. Repository-state, overview and merge paths use the caller's token and check GitHub push permission before sending linked-repository details. The live owner/editor/reader matrix, including sharing links and revoked provider access, remains pending. |
| Import | Import obtains the default branch head and calls the existing ZIP project importer using the repository snapshot. It records the branch and base commit after import. An imported project can exist if recording its sync state fails. Verify portable-source limits and user-visible recovery from #45. |
| Export and sync | Export creates a repository, checks its initialized branch and uploads the project as a child of that commit. The ref updater always requests a fast-forward. Sync state is recorded only after GitHub accepts the update. Subsequent sync compares against a stored revision and has a conflict branch and reconciliation UI. The detached-history flow can write reconciliation commits before the user resolves a conflict. Require a preview and explicit direction and verify partially failed syncs before activation. [Git references](https://docs.github.com/en/rest/git/refs#update-a-reference). |
| Storage | The module stores a per-user encrypted token in MongoDB and separate per-project sync metadata. `GITHUB_TOKEN_CIPHER_PASSWORD` and `GITHUB_TOKEN_CIPHER_LABEL` can select a server-side key. The fallback key file lives under `/var/lib/overleaf/data`; backups containing both the database and key must receive equivalent protection. Keep the key out of source and student exports, and document rotation and recovery before enabling the feature. |

## Verified with local mocks

- A failed OAuth code exchange now returns a generic client error. Invalid state rejects before the exchange and a successful exchange saves the token for the signed-in account.
- Local disconnect atomically removes the signed-in user's credential, then requests revocation for the removed token. A missing credential is an idempotent success. Decryption or provider errors leave the app disconnected and produce a sanitized warning. A failed local database operation returns a generic error. Project files and project sync metadata are separate from account disconnect.
- Mocks cover disabled or incomplete configuration, owner-only export, private repository permission denial, and movement of the remote branch before and during export. A rejected update creates no local sync state.
- The account tests use synthetic tokens and mock the provider and credential collection. No real provider calls, live authorizations or repository operations were performed for this audit.

## Minimum permissions for a pilot

The current OAuth App requests `read:org`, `repo`, and `workflow`. Keep it disabled on the Institute instance. Start with an institute-owned GitHub App limited to an approved disposable repository. For read-only import, request repository Metadata and read-only Contents. Add Contents write only when the push preview and branch protections have passed review. Exclude organization listing, workflow write, repository administration and unrelated installations from the first pilot. Use short-lived tokens and store any persisted credentials only on the server. [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) · [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

Before enabling provider traffic, review error logging in the remaining data routes. Log only operation, status class and a support request ID. Keep raw provider errors and repository identifiers out of telemetry and browser responses where the user lacks access. Verify credentials are absent from project ZIPs and browser metadata. Treat HTTP 429, quota exhaustion and non-fast-forward rejection as explicit retryable states. Honor the provider's rate-limit headers and avoid automatic retries of uncertain mutations. [GitHub API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

## Remaining acceptance

Use a disposable repository and synthetic LaTeX after a maintainer approves the app and repository. Verify import and project ZIP round-trip, pull and push with a reviewable diff, concurrent branch advancement and a divergent edit. Check that owner, editor, reader, unrelated account and revoked GitHub access receive only the intended results. Confirm disconnect in the app and verify revocation in GitHub settings; if GitHub was unavailable during disconnect, revoke the app there directly before reconnecting.

The student guide and screenshots follow the approved pilot. Until then students can transfer source with the project ZIP or use the separately approved Git bridge. Assign the service owner responsibility for app credentials, callback configuration, quota, support and disconnect incidents before the pilot. Budget two to three engineering days for sync preview and partial-failure recovery and one day for the disposable-repository run and guide after access is available. Keep #50 open until the live matrix and deployment decision are recorded.
