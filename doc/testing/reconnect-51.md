# Reconnect and unsaved-change baseline

The editor retains pending and in-flight operations in the browser. `UnsavedDocsProvider` checks pending state, warns on unload and locks the editor after a configured stall. The default threshold in the code depends on the connection rollout and account tier. There is no durable default offline draft store. The warning alone cannot recover the browser buffer after a forced close. The test below uses a disposable document and two signed-in accounts to establish what survives a temporary transport interruption.

## Observed behavior

The fixture ran against a loopback-only test deployment on the Institute amd64 server at image revision `0cf789ca2328f64addc3b15266b062c5fe661e2b`. The spelling and reference changes were outside the test. The inspected connection manager, unsaved-context and editor transport files matched `staging` at `ef2bb8a264`.

1. The owner typed a marker and the document service acknowledged content containing it.
2. The owner's browser lost its socket and HTTP connectivity. It accepted another text edit in memory, while the server ZIP lacked that marker. The unsaved `beforeunload` handler cancelled a synthetic unload event.
3. The second account inserted a different comment at the same document position while still connected. The server recorded that edit.
4. When the first browser reconnected, both new markers appeared exactly once in the server copy. The owner downloaded the source ZIP and reloaded the editor, with both markers still present.

[Headless recording](evidence/issue51-reconnect.webm) · [Repeatable browser fixture](fixtures/reconnect-51.mjs).

The successful case covers one short interruption and concurrent single-line inserts. It does not establish long-outage, overlapping replacements, changed permissions, repeated disruptions, lost local buffers or an explicit Saved/Disconnected indicator. Earlier test iterations used too many ZIP downloads for polling and hit the existing rate limit. The fixture now polls the test stack's document service and uses ZIP at the proof points.

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

Use the existing pending/in-flight state for explicit saved, saving, disconnected and unsaved indicators. Clear the pending signal only after the server's acknowledgement. Add an explicit download action for pending text already in memory and keep persistent browser drafts out of the first design. Then test long outages, discarded reloads, overlapping replacements and access removal. Record the two-editor result for each new behavior. Build on the release acceptance of #45 and #50. Budget two to three engineering days for the download and state work plus one day for the broader browser matrix.
