# Selected-text assistance

The existing external-link flow now reviews every request. A previous browser
notice never bypasses that review. Users can edit the excerpt, see its exact
request text and HTTPS destination, review visible credential redactions, and
cancel without opening the provider. Oversized requests are rejected rather than
silently truncated. Error prompts no longer add filenames automatically.

The optional managed flow displays an explanation and a before/after replacement.
Apply is separate and uses the normal collaborative editor transaction/history
path. Any intervening document edit, document switch or loss of write access
invalidates Apply. Undo/Redo works as with ordinary editing. Error-only requests
cannot target or modify a document. No tools, shell, automatic uploads or model
initiated actions are configured.

## Configuration on the Institute amd64 deployment

Managed inference is **off by default**. Existing `ASK_AI_URL`/`ASK_AI_NAME`
settings continue to configure the external-link button. To disable both flows,
leave `ASK_AI_URL` empty and `ASK_AI_MANAGED_MODE=off`. Managed mode never falls
back to the external website when its own configuration/provider fails.

Put reviewed server-only settings in the deployment's private environment, loaded
by `deploy/server/docker-compose.yml`; never expose an API key through
`ExposedSettings`, an endpoint URL, a browser build or a committed environment.

| Variable                              | Meaning                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ASK_AI_MANAGED_MODE`                 | `off`, `local` or `api`; default `off`                                                                                                                             |
| `ASK_AI_ENDPOINT`                     | Fixed chat-completions endpoint, without credentials/query/fragment; HTTPS required for `api`, HTTP permitted for an explicitly reviewed internal `local` endpoint |
| `ASK_AI_MODEL`                        | Approved model; the browser cannot override it                                                                                                                     |
| `ASK_AI_API_KEY`                      | Server credential; required for `api`, optional for `local`                                                                                                        |
| `ASK_AI_POLICY_SUMMARY`               | Accurate administrator-approved retention/processing notice shown before sending                                                                                   |
| `ASK_AI_BUDGET_EPOCH`                 | Stable operator-chosen identifier for a reconciled budget ledger                                                                                                   |
| `ASK_AI_INPUT_NANODOLLARS_PER_TOKEN`  | Reviewed input price in integer USD billionths/token; e.g. USD 1/million tokens = `1000`                                                                           |
| `ASK_AI_OUTPUT_NANODOLLARS_PER_TOKEN` | Reviewed output price; e.g. USD 5/million = `5000`                                                                                                                 |
| `ASK_AI_USER_DAILY_NANODOLLARS`       | Positive hard reservation allowance; USD 0.15 = `150000000`                                                                                                        |
| `ASK_AI_GLOBAL_DAILY_NANODOLLARS`     | Positive hard reservation allowance; USD 10 = `10000000000`                                                                                                        |
| `ASK_AI_PRICE_VALID_UNTIL`            | Price/policy review expiry as an ISO date/time, required for `api`; expired prices disable requests                                                                |

This implementation accepts at most **2,000 UTF-8 bytes of context**, not an
automatic project/log expansion. Total serialized input is further limited to a
conservative 3,000-token byte-level-BPE bound, with 1,000 output tokens maximum.
For an API pilot, verify the chosen model's byte-level tokenizer, framing,
completion-token cap (including reasoning), prices and endpoint compatibility.
The implemented context cap is deliberately smaller than the original design
proposal's 16 KiB. JSON escaping may make a smaller excerpt necessary.

The adapter uses the documented
[chat-completions request](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
with `store: false`, no tools and JSON output, validated again on return.
This does not grant Zero Data Retention; review the provider's current terms.
Local runtimes must implement the compatible JSON/text route and enforce the
output cap. Local inference is not automatically free of logging or telemetry.

Limits are 3 requests/user/minute, 20/user/UTC day, one in-flight request/user and
two globally. The Redis ledger atomically reserves the full worst-case cost
before dispatch. It retains that reservation even if a provider call fails,
times out or uses fewer tokens. The ledger is a conservative allowance counter,
not an invoice. No retry, refund or fallback request happens automatically.
`local` mode reserves zero monetary cost but retains request/concurrency limits;
the two daily allowance settings must still be positive.

## Initialize once; fail closed on ledger loss

Before enabling a new, approved pilot, run inside the web service with the same
private settings and Redis configuration:

```sh
cd /overleaf/services/web
node modules/ask-ai/scripts/initialize-budget.mjs --initialize-new-ledger
```

The command refuses to overwrite existing budget state. Missing state, a changed
epoch or Redis failure blocks inference; it never silently resets today's
spending. UTC rollover is atomic and requires the previous ledger to exist.
Daily records expire after eight days; after a longer idle period an operator
must reconcile and restore the ledger before requests resume. Do not delete
budget keys to clear an error or reset limits without reconciling possible
provider charges. App restarts preserve the ledger in the existing persistent
Redis deployment. No prompt, response, project ID or filename is stored there.

Before real enablement, review provider/model/license, allowed document categories,
actual pricing, retention and the student-facing deployment's HTTPS. The current
source configuration activates no managed provider and spends no money.

## Verification

The module tests use synthetic context, a fake provider and, when
`AI_TEST_REDIS_SOCKET` names a private `/tmp/latex-redis/` socket, real Redis.
They cover authorization, disabled/stale configuration, context boundaries,
credential detection, malformed responses, budget races, concurrency, ledger loss,
UTC rollover, per-request consent and replacement/undo/stale-document behavior.
Browser evidence is a component harness with the actual project stylesheet;
it is not a claim of real model quality, production capacity or production login
and compilation testing. The normal amd64 server CI remains required before merge.
