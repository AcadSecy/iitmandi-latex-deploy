# Reconnect and unsaved-change baseline

The editor retains pending and in-flight operations in the browser. `UnsavedDocsProvider` checks pending state, warns on unload and locks the editor after a configured stall. The default threshold in the code depends on the connection rollout and account tier. The existing `intermittent-connection-improvements` rollout can store the original document and queued operations in tab-scoped session storage. It keys the records by account, project and document, clears them when acknowledged, and clears the active tab's records on sign-out. The test below uses a disposable document and two signed-in accounts to establish what survives a temporary transport interruption.

## Observed behavior

The fixture ran against a loopback-only test deployment on the Institute amd64 server at image revision `0cf789ca2328f64addc3b15266b062c5fe661e2b`. The spelling and reference changes were outside the test. The inspected connection manager, unsaved-context and editor transport files matched `staging` at `ef2bb8a264`.

1. The owner typed a marker and the document service acknowledged content containing it.
2. The owner's browser lost its socket and HTTP connectivity. It accepted another text edit in memory, while the server ZIP lacked that marker. The unsaved `beforeunload` handler cancelled a synthetic unload event.
3. The second account inserted a different comment at the same document position while still connected. The server recorded that edit.
4. When the first browser reconnected, both new markers appeared exactly once in the server copy. The owner downloaded the source ZIP and reloaded the editor, with both markers still present.

[Headless recording](evidence/issue51-reconnect.webm) · [Repeatable browser fixture](fixtures/reconnect-51.mjs).

Earlier test iterations hit the download rate limit while polling the ZIP endpoint. The fixture now polls the test stack's document service and downloads the ZIP at the proof points.

## Running editor with local download

A headless, two-account run on the Institute amd64 test stack used the cached `0cf789ca` server and a locally built frontend containing draft commits `2e63539d` and `def0f85f`. The published candidate images still need separate validation.

- During a short interruption, the warning identified changes in `main.tex` waiting to sync. The server ZIP lacked the pending edit, and the editor offered a UTF-8 `unsaved-main.tex` containing it. The warning cleared after both users' inserts reached the server once and survived reload.
- During a second interruption longer than 33 seconds, both users replaced the same line. The editor locked and the local download still contained the disconnected user's replacement. The unload warning fired. A forced reload after the outage kept the other user's replacement on the server. The local replacement was available in the download.
- An earlier run verified the local download and timed out waiting for the first edit to sync after a synthetic unload event during the short outage. The revised fixture checks unload during the long-outage case and exercises the existing retry action when shown.

## Reproduce

Start an isolated test stack with its own MongoDB, Redis and synthetic LDAP accounts. Bind it to loopback and use a container name such as `latex51-candidate`. If the test stack is remote, open a loopback SSH tunnel. The fixture requires two generated `username password` lines in a private file. The second listed account becomes project owner, and the first becomes the invited editor. Use an address from the disposable LDAP domain. The fixture grants the invited editor membership to the newly created synthetic project. It requires Playwright, headless Chrome, Python 3 and Docker access to the isolated container.

```bash
LATEX_PREVIEW_URL=http://127.0.0.1:18082 \
LATEX_PREVIEW_CONTAINER=latex51-candidate \
LATEX_PREVIEW_ACCOUNTS=/path/to/disposable-ldap-accounts.txt \
LATEX_PREVIEW_COLLABORATOR_EMAIL=b00001@students.iitmandi.ac.in \
LATEX_PREVIEW_VIDEO_DIR=/tmp/latex51-recordings \
CHROME_BIN="$(command -v google-chrome)" \
node doc/testing/fixtures/reconnect-51.mjs
```

Set `PLAYWRIGHT_MODULE` to the installed Playwright package path if it is outside this repository. Set `LATEX_PREVIEW_SSH` to the test host's SSH alias if Docker runs remotely. Only the synthetic test container should match `LATEX_PREVIEW_CONTAINER`.

## Remaining work

All seven headless browser component tests passed, including UTF-8 source, missing buffers and the enhanced connection mode. The download action rendered at a 390 px viewport. The rollout's existing tab-storage policy requires a review of expiry, size, shared-device behavior and recovery eligibility before expansion.

Outstanding acceptance covers the published image, access removal, overlapping replacements during reconnect without a reload, and a distinct server-acknowledged save state. The work follows release acceptance of #45 and #50. Budget two to three engineering days for the remaining implementation and browser matrix.
