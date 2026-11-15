# Optional LaTeX assistance: scope and decision proposal

Issue: [#47](https://github.com/AcadSecy/iitmandi-latex-deploy/issues/47).
Owner: TayalAditya. Audit date: 16 November 2026.
Baseline: `staging` at `1ff3043ca34eaa2c24767fe8c42658acfdc25d09`.
Status: design for review; the controls below are proposed, not implemented.

## Decision requested

Approve one workflow: explain a selected LaTeX fragment or one chosen compile
error, then offer an optional replacement for a selection. Start with a mocked
provider and synthetic examples. Keep assistance disabled until the Institute
has chosen a provider, reviewed its data terms and approved limits. Ordinary
login, editing, compile diagnostics and PDF viewing must work independently.

Prefer a server-managed API pilot if external processing is approved. If the
Institute requires local processing, benchmark a model on a separately reserved
host before choosing it. The existing amd64 deployment is the baseline; the
retired Pi is not an inference host. This proposal activates no service, changes
no deployment configuration and sends no project text to a provider.

## Existing behavior and gaps

Paths in this inventory are relative to the repository root.

| Source                                                                                                | Observed behavior                                                                                                                       | Gap for the proposed workflow                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `services/web/config/settings.defaults.js`, `deploy/server/server.env`                                | An empty `ASK_AI_URL` disables the buttons. The checked server configuration enables a ChatGPT query URL.                               | Default-off library behavior does not mean this deployment is off. The source configuration does not prove the live host's effective settings.                           |
| `services/web/app/src/infrastructure/ExpressLocals.mjs`                                               | Exposes the configured URL and display name to the browser.                                                                             | A future API key must never be included here or embedded in that URL.                                                                                                    |
| `services/web/modules/ask-ai/frontend/js/components/ask-ai-toolbar-button.tsx`                        | Reads the main editor selection, trims it and wraps it in a LaTeX prompt. No selection opens an empty prompt.                           | No explicit preview of the outbound prompt or destination. It does not automatically read the whole project.                                                             |
| `services/web/modules/ask-ai/frontend/js/components/ask-ai-log-entry-action.tsx`, `open-assistant.ts` | Builds a prompt from one error/warning's file, line, message and content; falls back to that entry's raw text.                          | Filenames, paths or sensitive material can occur in this text. No redaction. No adjacent source is fetched automatically.                                                |
| `services/web/modules/ask-ai/frontend/js/use-ask-ai.tsx`                                              | Shows an external-service notice once, then remembers `ask-ai.notice-accepted` in browser local storage. Later clicks send immediately. | Consent is not per request, account or destination. The modal does not show the exact text.                                                                              |
| `services/web/modules/ask-ai/frontend/js/open-assistant.ts`                                           | Slices the constructed prompt to 6,000 JavaScript string units, URL-encodes it and opens a named popup. Attempts to clear its opener.   | Silent truncation can remove important context. Query strings can enter browser/provider history and logs. This is a character limit, not a token or encoded-URL budget. |
| `services/web/modules/ask-ai/test/frontend/open-assistant.test.ts`                                    | Covers settings, prompt formatting, URL truncation and popup behavior with a stubbed window.                                            | No tests for per-request consent, secret handling, budgets, inline suggestions or collaborative edits.                                                                   |

The current module delegates to an outside website using the student's account.
It has no server inference route, managed API billing, model tools or automatic
patch application. API data controls below must not be attributed to that
consumer website. The one-time notice is not sufficient for the proposed flow.

## One interaction, explicit context

1. The student chooses **Explain selection** or **Explain this error**. Capture
   an immutable snapshot of that selection or log entry. For an error, omit
   filenames and paths by default. Additional source must be explicitly selected.
2. Open an accessible review dialog using the existing `OLModal` components.
   Show the destination hostname, local/external status, retention summary,
   complete outgoing instructions and an editable context excerpt. Never send
   automatically from opening the dialog or accepting an earlier notice.
3. Mark likely secrets locally, replace them with visible placeholders and
   require review of the resulting text. Block private-key blocks and remaining
   recognized credentials; request a smaller excerpt. Do not offer an override
   for those detections. Detection is incomplete: ordinary research text may
   still be confidential. Do not claim anonymization.
4. Bound the entire prompt, including instructions, to 2,500 model tokens and
   16 KiB UTF-8; bound generated output to 1,000 tokens. Reject oversize input
   visibly rather than truncating. Token counting must match the selected model.
   Disallow model selection by the browser. Require a fresh explicit Send after
   any change to context, destination, redaction or the consent-policy version.
5. Send only the reviewed payload by an authenticated, CSRF-protected same-origin
   POST. The server validates size and secrets again, then sends to a fixed,
   administrator-configured destination over HTTPS. No project archive, full
   log, document title, author email, session cookie or unsolicited background
   context is forwarded. No content in URL query parameters.
6. Display an explanation and optional replacement as escaped text and a diff.
   A compile error alone receives an explanation; it cannot invent an editable
   target. The student explicitly chooses a selection before requesting a patch.
   There is no automatic application, compilation or retry.
7. **Apply** is a separate action, available only to an editor with write access.
   Bind a suggestion to the original document ID, selected range, source text
   and document version. If local or remote edits changed that document while
   waiting, disable Apply and request a new suggestion. Reuse CodeMirror's
   existing transaction and collaborative history path, giving one undoable
   change; test Undo/Redo with a second editor. Never overwrite a changed range.

For the initial selection-only prototype, conservative invalidation on any
document edit is preferable to guessing how a range moved. An explanation may
remain visible after invalidation. Leaving the document or closing the dialog
clears its in-memory draft and suggestion. No prompt or response in local storage,
analytics, exception reports or server request-body logs.

## Local model versus managed API

| Consideration | Institute-local model                                                                                                                                                                                                                                                                                 | Server-managed API                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate     | A reviewed, licensed 3–8B instruction model served by `llama-server`; exact weights and digest remain undecided.                                                                                                                                                                                      | One fixed text model and adapter, selected after quality and account-access checks. No consumer-site automation.                                                                                                                                                                                                                                                                                                    |
| Hardware      | Four-bit weights alone are approximately 1.5–4 GB by parameter arithmetic; KV cache, runtime and concurrency add memory. Reserve and measure RAM/VRAM and CPU separately from editing/compiles. The server's GPU availability is unknown.                                                             | No model weights on the app host; still budget tokenization, network, bounded response memory and concurrent requests.                                                                                                                                                                                                                                                                                              |
| Latency       | Unknown on institute hardware. At an assumed 5–20 output tokens/s, 1,000 output tokens alone would take 50–200 seconds; this is a sizing illustration, not a benchmark.                                                                                                                               | Network, queue and model latency are unknown. Pilot target: p95 below 20 seconds for short explanations, with a 30-second request deadline; measure before promising it.                                                                                                                                                                                                                                            |
| Cost          | No provider token charge, but reserved hardware, electricity and maintenance cost money. Compute energy cost from measured kW × running hours × institute tariff. All three inputs remain unknown.                                                                                                    | Token billing plus operational costs; example and caps below. No free/unlimited claim.                                                                                                                                                                                                                                                                                                                              |
| Data terms    | With a reviewed offline image, disabled content logging, restricted egress and no model telemetry, inference can stay on Institute infrastructure. Verify the chosen model's license, training provenance, logs, backup access and runtime configuration. Local execution alone proves none of these. | OpenAI is a concrete comparison, not an approved provider: API content is not used for training by default; abuse-monitoring logs may be retained up to 30 days, with exceptions. `store: false` does not itself confer Zero Data Retention. Account eligibility, contractual terms, region and caching behavior require review. [Official data controls](https://developers.openai.com/api/docs/guides/your-data). |
| Capacity risk | Sharing the production app's CPU/RAM can delay edits and compiles. Admit only a separately budgeted inference workload; no unannounced production load test.                                                                                                                                          | An outage or exhausted budget must affect assistance only. No automatic fallback to a different destination.                                                                                                                                                                                                                                                                                                        |

`llama-server` supports CPU/GPU inference, quantized models and compatible text
API routes ([server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)).
Its build documentation includes Vulkan as a backend
([build documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)).
Neither source establishes throughput on the Institute host. Do not assume CUDA
or that this laptop's GPU exists on that server.

### Illustrative API budget

As checked on 16 November 2026, standard `gpt-6.1-terra` pricing lists USD 1 per
million input tokens and USD 5 per million output tokens
([official pricing](https://developers.openai.com/api/docs/pricing)). This is a
cost example, not a model-quality recommendation or approved purchase.

At the proposed maximum of 2,500 input and 1,000 output tokens, the example
ceiling is `(2500 × 1 + 1000 × 5) / 1,000,000 = USD 0.0075` per request;
1,000 maximum-size requests would be USD 7.50. This excludes taxes, currency
conversion and applicable regional surcharges and assumes no tools, caching
charges or other paid features. The configured output limit must bound all
billed output, including reasoning where applicable.

Proposed pilot limits: 3 requests/minute and 20/day per authenticated user,
one in-flight request/user, two globally, USD 0.15/user/day and USD 10/global/day.
These are values for approval, not existing settings. Reprice before enabling
a different model, tier or rate. Missing or stale pricing disables requests.

Enforce monetary limits in Redis with an atomic per-user/global reservation
of the worst-case charge **before** dispatch. Reconcile against provider usage;
keep the full reservation when timeout or missing usage makes billing uncertain.
No blind retries. Use integer currency units and UTC budget days, communicate
reset times clearly, and fail closed if Redis or the budget ledger is unavailable.
Counters must survive app restarts; a missing ledger after recovery must not
silently create fresh spending allowance. Provider dashboard warnings are not
the application's hard spending control.

## Server boundary and failure handling

Extend `modules/ask-ai` instead of adding a parallel chat product. Proposed routes
are `GET /project/:id/ai-assistance/config` and
`POST /project/:id/ai-assistance/suggest`; these do not exist today. Reuse
`AuthenticationController`, project authorization middleware,
`services/web/app/src/Features/Security/RateLimiterMiddleware.mjs`,
`@overleaf/redis-wrapper` and the
current editor components. Require project membership for explanations and write
permission for replacement requests. Anonymous share-link visitors receive no
billable API access, including read-only links. Validate authorization server-side.

Proposed server-only configuration: mode (`off` by default, `local` or `api`),
approved model ID and destination, price/policy versions, context/output limits,
timeouts and budget limits. Put API credentials in deployment secrets loaded only
by the server adapter. Expose only a sanitized enabled flag, destination label,
limits and policy summary through `ExposedSettings`. Do not accept a client URL,
model override or arbitrary provider parameters. Local inference uses an internal
network endpoint inaccessible from public clients; redirects must not bypass the
approved destination.

Treat project text, LaTeX comments, log messages and model output as untrusted.
Separate fixed task instructions from the excerpt; instructions embedded in the
excerpt do not authorize additional data retrieval or changes. Configure no tools,
shell, browsing, retrieval or file uploads. Validate structured output with an
allowlisted schema and render it without executable HTML. Only plain replacement
text for the captured selection can reach Apply. A model-generated request to
upload another file has no executable path. Suspect LaTeX remains untrusted source
and uses the existing compile sandbox if the student later compiles it.

| State                                       | Student-visible behavior                               | Server behavior                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Off or unconfigured                         | Assistance unavailable; local diagnostics stay usable. | No provider call; no secret-dependent exception in the editor boot path.                                                                        |
| Permission denied                           | Explain that this account cannot use assistance here.  | Reject before reserving budget or contacting a provider.                                                                                        |
| Oversize or detected secret                 | Show the problem and retain the editable draft.        | Reject locally; no provider call.                                                                                                               |
| Rate/budget exhausted                       | Show a safe explanation and reset time.                | Return 429; do not queue indefinitely or change providers.                                                                                      |
| Timeout, malformed output, provider 429/5xx | Retain the draft; offer a deliberate retry.            | Cancel where possible, settle conservatively, return a sanitized error. Cancellation cannot guarantee an already-started inference is unbilled. |
| Destination/policy changed                  | Require review and consent again.                      | Reject stale policy versions before dispatch.                                                                                                   |
| Editor changed or became read-only          | Keep explanation; disable Apply.                       | Existing authorization and collaboration rules remain authoritative.                                                                            |

Log only request IDs, coarse error classes, duration and aggregate token/cost
counters; exclude excerpts, responses, filenames and credentials. Disable automatic
body capture in adapters and error reporting. Retain budget records only for the
approved accounting period, restrict per-user counters to operational support,
and keep editor text out of backups and metrics.

## Delivery, estimate and approval gates

Estimate: **8–12 engineering days**, excluding procurement, institutional review
and model benchmarking lead time. One implementation is active at a time.

| Stage                           | Estimate                   | Reviewable result                                                                                                     |
| ------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| This design task                | Delivered by this document | Source inventory, provider comparison, bounded flow, cost model and test plan. No inference enabled.                  |
| Mocked flow                     | 2–3 days                   | Per-request preview/redaction, synthetic explanation/diff, stale-document rejection and undo, behind a disabled flag. |
| Chosen adapter and controls     | 3–4 days                   | Authorization, CSRF, limits, atomic spending ledger and timeout/error handling, tested with a fake provider.          |
| Validation and restricted pilot | 3–5 days                   | amd64 regression checks, reviewed provider terms, measured latency/cost, demo and rollback instructions.              |

Before an implementation PR, record the plan on #47 and its agreed track and get
maintainer agreement per `CONTRIBUTING.md`. Before any real provider request,
approve the provider/model/license, data terms and allowed document categories;
designate a credential/budget owner; approve hard caps and retention; establish
HTTPS for the student-facing Institute deployment (the checked README currently
documents HTTP). Server-to-provider HTTPS alone does not protect browser traffic.
No paid activation or confidential external upload is part of this scoping task.

Keep subsequent PRs focused and based on current `staging`. Do not merge this
design as a claim that assistance or #52's capacity dashboard is implemented.
Rollback of a future pilot is mode `off`; changes must not disable local compile
diagnostics or require a provider during application startup.

## Validation required before a pilot

- Stub all external requests during development. Assert zero calls before Send,
  after Cancel, in disabled mode, with stale consent, oversized text, detected
  secrets, missing budget state, or insufficient permissions. Old local-storage
  acceptance must never bypass review, including after changing account/provider.
- Verify that the final displayed instructions and redacted excerpt exactly match
  the transmitted payload. Exercise Unicode boundaries, encoded secrets, embedded
  prompt instructions and fake HTML without promising perfect secret detection.
- Race simultaneous requests against per-user and global caps; test midnight,
  app restart, Redis failure, ledger loss, timeout and missing usage. Assert that
  reservations prevent overspend and uncertain charges are not refunded blindly.
- Test Apply/Undo/Redo, collaborator edits while waiting, document switches,
  permission changes, empty selections and errors with no source target. A second
  editor must see the same collaborative edit; stale suggestions must not apply.
- Exercise unauthenticated, share-link, reader and editor requests directly at
  the API. Reject client-controlled destinations/model parameters and redirects.
- Inspect request logs, errors, browser storage and telemetry using synthetic
  secret markers. Confirm markers never persist outside the reviewed request.
- On an isolated amd64 deployment, check login, existing project editing,
  compilation, sandboxing, PDF and ZIP downloads with assistance off and with
  the fake provider unavailable. Use headless desktop/mobile browsers; include
  keyboard/screen-reader checks for preview, cancellation and the diff.
- Before the approved pilot, benchmark synthetic short/long prompts at concurrency
  1 and 2: p50/p95 latency, memory, CPU, billable tokens and editing/compile impact.
  Record failures as well as successes; no production capacity claim from config.

## Scoping verification

This audit inspected the five current module source/test files, settings exposure,
server configuration, help text and contributor workflow at the baseline above.
The inventory distinguishes source configuration from unknown live state. Linked
primary provider/runtime documentation was read on the audit date. No live
provider inference, billing activation, deployment, browser upload, login or
compile smoke test was performed for this documentation-only change.

A dependency-free Node harness evaluated the unmodified `open-assistant.ts`
with synthetic metadata and a stubbed `window`. Settings, prompt formatting,
error-entry fallback, 6,000-unit truncation, opener clearing and blocked-popup
handling matched the inventory. Source inspection confirmed that remembered
consent bypasses later previews. Full repository source references, the cost
arithmetic, Markdown formatting and whitespace checks passed. These checks
validate the audit; they do not demonstrate the proposed controls working.
