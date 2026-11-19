# Dropbox source portability feasibility

**Decision:** Proceed only with a disposable-account trial of owner-initiated, source-only ZIP export if the Institute approves provider terms and data transfer. Defer provider import until source-only export and portable ZIP round-trip pass. Keep bidirectional synchronization out of the pilot and leave the product UI hidden until configuration and approval are complete.

## Current staging inventory

Staging `ef2bb8a264` contains a Dropbox entitlement, user/history fields and third-party datastore hooks. `app/src/router.mjs` still has the site-admin `POST /admin/pollDropboxForUser` route. It delegates to `TpdsUpdateSender`; the enqueue path returns early without `Settings.apis.thirdPartyDataStore.url`. There is no Dropbox module under `services/web/modules` and the Institute compose files provision no provider service or credentials. That inventory shows legacy integration points and an entitlement, with no verified Dropbox connection in this deployment.

Use the existing project ZIP source manifest and upload paths reviewed in #45. Keep the separation between project permission and provider permission from #50. Store any persistent provider credential encrypted per account on the server, with an independent rotation and deletion procedure. Account disconnect must preserve both the LaTeX project and the provider files.

## Options

| Option | Cost and behavior | Milestone |
| --- | --- | --- |
| Owner confirms a new source ZIP in Dropbox App Folder | One immutable object per action. No remote file replacement or deletion. A ZIP is directly portable to the existing project importer. | Start here, with a disposable account only. |
| Manual import or pull | Reading a selected ZIP needs a new receiver scope and safe archive validation. Import into a new project after showing the file list and relevant loss warnings. | Consider after export and #45 round-trip acceptance. |
| Bidirectional file sync | Needs stable file identities, provider revisions, local versions, conflict/retry recovery, filter changes, permissions and reconciliation on every path. Provider storage and API consumption grow with edited files. | No-go for the first implementation. Require a new design and acceptance review. |

## Permissions, consent and limits

- Register a user-scoped **App Folder** integration. Export needs `files.content.write`, and `files.metadata.read` reads the expected path's receipt and Dropbox content hash after an uncertain response. The first milestone uses neither content download nor team/sharing scopes. Manual import would add `files.content.read` as a separate opt-in. [OAuth and App Folder](https://docs.dropboxapi.com/dropbox-api/docs/oauth) · [Upload endpoint](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload).
- Start with short-lived, online access and no background polling. A later refresh token requires an encrypted server-side record with key rotation, revocation and account deletion. Use exact HTTPS redirects, state and PKCE where applicable. Never put credentials or source text in URLs, client state, telemetry or exception bodies. On disconnect immediately invalidate local access and outstanding previews, revoke the provider token if available and direct the user to Dropbox security settings if revocation is uncertain. Keep the exported files and the local project. [OAuth lifecycle](https://docs.dropboxapi.com/dropbox-api/docs/oauth).
- Present the account, destination, byte size and exact list of selected files before each send. Default to the recognized LaTeX source/support and explicit required figures. Exclude generated PDFs, history, hidden and credential files. Some projects use a PDF as an input figure. Require deliberate selection for such a file and record its inclusion; blanket PDF export defeats the default. Users must review the source for research text and secrets. Obtain Institute review of storage, data transfer, consent and operational ownership before accepting terms on its behalf. [Dropbox Developer Terms](https://www.dropbox.com/developers/reference/tos).
- Use an opaque export operation ID for the destination and bind confirmation to account, project version and content hash. Send upload in add mode with strict conflict behavior and autorename disabled. An existing path with the same hash completes a retry; an existing path with different content goes back to preview. Treat ambiguous responses separately from access loss. Honor `Retry-After` and cap retries. Use current Dropbox revision and conditional updates for any future operation that modifies an existing provider object. [Upload endpoint](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload) · [Rate-limit guide](https://docs.dropboxapi.com/dropbox-api/docs/performance).
- Pilot limits can start with one in-flight export per user, a 20 MiB ZIP ceiling, one request per explicit confirmation and temporary data expiry after 15 minutes. Enforce the existing project and upload quotas independently, with a cap on expanded content and file count. A 20 MiB immutable export consumes up to 20 MiB of the user's Dropbox quota each time. A sequence of five maximum-size archives can occupy 100 MiB. Institute disk use is transient and bounded by both temp quotas and global worker slots. Keep storage-limit and quota errors visible.

## Mocked acceptance

Run `python3 doc/testing/fixtures/dropbox-export-70.py`. All four scenarios passed on synthetic data. The fixture uses no network, tokens, provider account or platform state.

| Scenario | Verified result |
| --- | --- |
| Add, rename and delete from source | Preview shows the change list before any write. The new ZIP contains the new names and source only. The project and all previous exports remain intact. |
| Stale local revision and remote destination conflict | A stale preview must be replaced before upload. An occupied destination containing other bytes is preserved. |
| Owner, editor, reader, unrelated and revoked access | Only the current connected owner can preview, confirm or disconnect. A provider authorization failure prevents export. Disconnect invalidates queued retries and existing previews. |
| Rate limit and response lost after remote commit | Retry waits for the mock's retry window, finds the matching receipt by hash after an uncertain response, and completes without another upload. Disconnect leaves the successful ZIP and project intact. |

This verifies the proposed state transitions and archive contents. The mock uses a pre-created app folder and in-memory roles and never invokes the actual ZIP route, provider SDK, encryption or OAuth flow.

## Disposable-account gate

Allow a day and a half to two days for a small source-manifest adapter and two-step UI, one day for error/credential tests, and one day for a disposable-account trial. Reserve ongoing ownership for credential rotation, provider-policy changes, support and quota monitoring. Budget separately for imports or a sync proposal.

After approval, create a disposable app and account with only the two export scopes. Verify the exact scope grant, user consent, the project owner/editor/reader matrix, app-folder boundary, upload/receipt hashes, 409 and observed rate-limit handling, and reconnect after provider revocation. Download the exported fixture ZIP and round-trip it through a new project using #45's procedure. Have the maintainer verify cleanup and the disabled/unconfigured UI on the Institute deployment before any real project export. Until then, use the built-in source ZIP and let the user move that file manually if Institute policy permits.
