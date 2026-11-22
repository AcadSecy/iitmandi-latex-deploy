# Long compiles and TeX Live years

## Scope

Refs #7. This document records a local synthetic rehearsal and prepares later
acceptance measurements. It approves no deployment change. The Institute amd64
test stack is the primary acceptance target; Pi measurements must remain separate.
Real-document acceptance needs owner consent and an isolated window approved by
Track E or the authorized maintainer. Do not occupy all live slots or change limits.

The original plan is narrowed by the reviewer: evaluate 2025 and 2026 first,
retain existing images and aliases, and make any later retention proposal from
project-dependency, compatibility, size and rollback evidence. The docs PR should
say `Refs #7`. A synthetic thesis does not establish that the real 126-page thesis
arrives in full.

## Inventory: checked-in settings and runtime readers

All citations below are **read in code** at baseline `628a88ae1e` (including the
turn-timer fix `0266908fbc`). Values in files are not proof of deployed settings.
Seconds are used unless stated otherwise.

| Setting | Server files | Institute example | Pi files | Runtime reader / enforcement |
| --- | --- | --- | --- | --- |
| `COMPILE_TIMEOUT` | 120, `deploy/server/server.env:35` | 180, `deploy/iitmandi/variables.env.example:154` | 120, `deploy/pi/pi.env:75` | `server-ce/config/settings.js:308` reads the env, default 180; `services/web/config/settings.defaults.js:398` also defaults to 180. `services/web/app/src/Features/Compile/CompileManager.mjs:235` selects the project owner's `features.compileTimeout` or the default. |
| `COMPILE_QUEUE_SLOTS` | 4, `deploy/server/server.env:37`; optional capacity override 8, `deploy/server/operations/capacity.override.yml:10` | 8, `deploy/iitmandi/variables.env.example:170` | 2, `deploy/pi/pi.env:80` | `services/web/config/settings.defaults.js:876` reads env, default 0 (queue disabled); `services/web/app/src/Features/Compile/CompileManager.mjs:15` constructs the queue; `CompileQueue.mjs:281` dispatches within the slot count. |
| `COMPILE_QUEUE_MAX_WAIT_SECONDS` | 300, `deploy/server/server.env:38` | 300, `deploy/iitmandi/variables.env.example:172` | 300, `deploy/pi/pi.env:81` | `services/web/config/settings.defaults.js:877` reads env, default 300; `CompileQueue.mjs:131` times out the initial wait; removal of that timer is at `CompileQueue.mjs:422`. |
| `COMPILE_QUEUE_TURN_SECONDS` | 60, `deploy/server/server.env:39` | 60, `deploy/iitmandi/variables.env.example:178` | 60, `deploy/pi/pi.env:85` | `services/web/config/settings.defaults.js:878` reads env, default 0 (no turns). `CompileQueue.mjs:316` checks elapsed turn time and budget urgency; `CompileQueue.mjs:356` schedules the remaining turn. |
| `COMPILE_QUEUE_MAX_PAUSED` (count) | 2, `deploy/server/server.env:40`; also 2 in `deploy/server/operations/capacity.override.yml:11` | 8, `deploy/iitmandi/variables.env.example:181` | 2, `deploy/pi/pi.env:86` | `services/web/config/settings.defaults.js:879` reads env, default 0; `CompileQueue.mjs:82` substitutes slots for nonpositive values; `CompileQueue.mjs:302` subtracts paused and pausing jobs. |
| `COMPILE_QUEUE_MAX_REQUEST_SECONDS` | 540, `deploy/server/server.env:41` | 540, `deploy/iitmandi/variables.env.example:184` | 540, `deploy/pi/pi.env:87` | `services/web/config/settings.defaults.js:881` reads env, default 540; `CompileQueue.mjs:121` stores a deadline; `CompileQueue.mjs:266` uses it to prioritize paused jobs with remaining budget. |
| One compile per user | Shared web code | Shared web code | Shared web code | `CompileQueue.mjs:271` blocks another job while that user runs or is paused. Distinct projects under one account do not create slot contention. |
| Compile memory / CPU / processes | 1.5 GiB / 1 CPU / 256, `deploy/server/server.env:34` | 2 GiB / 1 CPU / 256, `deploy/iitmandi/variables.env.example:162` | 1.5 GiB / 1 CPU / 256, `deploy/pi/pi.env:73` | `services/clsi/config/settings.defaults.cjs:167` parses `COMPILE_GROUP_DOCKER_CONFIGS`; `services/clsi/app/js/DockerRunner.mjs:338` applies per-group overrides to Docker options. These files override only the standard group. |

`CompileQueue.mjs` above means
`services/web/app/src/Features/Compile/CompileQueue.mjs`. The server compose reads
`server.env` at `deploy/server/docker-compose.yml:30`, alongside additional env
files, and sets sandbox and host paths at line 41. The Pi compose reads `pi.env`
at `deploy/pi/docker-compose.yml:49`, with sandbox paths at line 68. Institute
examples require copying into the Toolkit configuration
(`deploy/iitmandi/README.md:5`). No effective Toolkit config was inspected.

**Read in code:** 540 seconds is a scheduling budget, not an independently armed
request-kill timer. The only queue wait timer is removed when a job starts.
`CompileQueue.mjs:266` and `:325` use the deadline to order jobs and avoid further
pauses. **Inference:** total response time can include sync and graceful-stop
overhead beyond that budget. Measure it; do not promise a hard 540-second bound.

### Other bounds that affect a measurement

| Bound | Value / runtime evidence |
| --- | --- |
| CLSI timeout cap and units | `services/clsi/app/js/RequestParser.js:6` defines 600; line 73 defaults missing timeout to 600; line 160 clamps higher values and converts to milliseconds. `ClsiManager.mjs:1225` sends the owner's selected timeout. |
| Runner time budget | `services/clsi/app/js/LatexRunner.js:42` falls back to 60,000 ms. `DockerRunner.mjs:496` initializes the remaining timeout; line 633 subtracts running time on pause, and line 666 restarts the timer on resume. Paused time is excluded. |
| Abandoned paused-container timer | `DockerRunner.mjs:31` reads `Settings.clsi.docker.maxPausedTime`, default 600,000 ms; line 638 arms it on each pause. This is a duration cap, separate from the paused count. No env mapping was found in `services/clsi/config/settings.defaults.cjs`. |
| Graceful stop / process CPU | `services/clsi/app/js/GracefulStop.js:184` defaults grace to 10,000 ms; `DockerRunner.mjs:606` allows twice the grace plus 5,000 ms for the stop command. Line 304 sets per-process CPU soft/hard limits to timeout + grace + 5/10 seconds. These are not whole-container CPU usage measurements. |
| App proxy | `server-ce/nginx/overleaf.conf.template:20`, `:37`, `:50`, `:76` set `proxy_read_timeout 10m` (600 seconds). This is a proxy read inactivity timeout; an external reverse proxy still needs confirmation. |
| Web response and web-to-CLSI request | `services/web/app/src/Features/Compile/CompileController.mjs:34` defines 720,000 ms and applies it at line 418 (compile) and 660 (submission). `ClsiManager.mjs:45` defines the same web-to-CLSI request bound, used at line 688. |
| CLSI HTTP socket | `services/clsi/app.js:41` sets request and response timeouts to 630,000 ms (10.5 minutes). The adjacent web comment about ten minutes is less precise than this code. |
| Output download | `ClsiManager.mjs:41` sets 60,000 ms, used at line 898. Compile-output streaming initially has a 10-second abort timer, then a ten-minute download timeout (`CompileController.mjs:1062`, `:1090`); CLSI cache streaming follows the same 10-second / ten-minute pattern (`ClsiCacheController.mjs:89`, `:138`). |
| Pause/resume and service-cookie calls | `ClsiManager.mjs:254`, `ClsiCookieManager.mjs:96`, `:149`: 30,000 ms. `ClsiCacheHandler.mjs:15`, `:97`: 4,000 ms for cache service request. |
| Same-project request throttle | `CompileManager.mjs:361` and `:364`: one-second Redis key per project/user. Space repeat phases by at least two seconds. |
| Auto-compile request rate | `services/web/config/settings.defaults.js:858` / `:859`: 100 globally and 25 standard-group points; `CompileManager.mjs:409` sets a 20-second window. Manual requests bypass this at lines 368 and 384. |
| CLSI concurrency | `services/clsi/config/settings.defaults.cjs:116`: 32 for `PREEMPTIBLE=TRUE`, otherwise 64. `services/clsi/app/js/LockManager.js:42` rejects excess requests. Distinct from web slots. |
| Compile input budget | `services/web/config/settings.defaults.js:942`: `COMPILE_BODY_SIZE_LIMIT_MB`, default 7; `services/web/app/src/Features/Compile/ClsiFormatChecker.mjs:35` applies 7,000,000 bytes. CLSI separately reads `COMPILE_SIZE_LIMIT`, default `7mb` (`services/clsi/config/settings.defaults.cjs:9`, `services/clsi/app.js:51`). |
| Downloads and auxiliary operations | `services/clsi/app/js/UrlFetcher.js:53`, `:62`: 60,000 ms. SyncTeX and word count each get 60,000 ms (`CompileManager.js:697`, `:813`). Conversion timeout defaults to 60 seconds (`services/clsi/config/settings.defaults.cjs:30`). These are not full-document compile limits. |
| Cache/container lifetime | `services/clsi/config/settings.defaults.cjs:97`: one-day project cache. `services/clsi/app/js/ProjectPersistenceManager.js:96` consumes it (fallback 2.5 days); sandbox project expiry is one day with ten-minute checks (`settings.defaults.cjs:157`). `DockerRunner.mjs:734` defaults container age to one hour; lines 758 and 767 check age and last access before cleanup. |

`ClsiManager.mjs`, `CompileController.mjs`, `ClsiCookieManager.mjs`,
`ClsiCacheController.mjs`, `ClsiCacheHandler.mjs` and `CompileManager.mjs` in this
table are under `services/web/app/src/Features/Compile/`. `DockerRunner.mjs` and
`CompileManager.js` are under `services/clsi/app/js/`.

An owner-specific timeout may be 1 through 600 inclusive; the admin script checks
this at `services/web/modules/server-ce-scripts/scripts/change-compile-timeout.mjs:23`.
Template overrides can raise the selected timeout to at least 20
(`CompileManager.mjs:210`). The supplied files do not establish either condition
for a test account. The non-Docker runner explicitly warns that timeout and
sandbox enforcement are disabled (`services/clsi/app/js/LocalCommandRunner.js:55`).

### TeX Live names, years and selection

| Reference | Names / years | Runtime use |
| --- | --- | --- |
| `deploy/iitmandi/texlive/images.txt:14` | `iitmandi/texlive:2026.1`, source `texlive/texlive:latest-full@sha256:16c556aeb4095b47245fcd05db47061529e5df8fc8c04d97fb0f049055244526`, year 2026 | `texlive-images.sh:37` reads the manifest, line 117 pulls by digest, line 118 tags locally, line 68 checks the actual TeX Live year. |
| `deploy/iitmandi/texlive/images.txt:15` | `iitmandi/texlive:2025.1`, source `texlive/texlive:TL2025-historic@sha256:7056390eac37715fd3e01875037ceb4016cb17d44c611f7bbbfa7a012007979f`, year 2025 | Same manifest reader; archives use `iitmandi-texlive-2025.1.tar.gz` / `iitmandi-texlive-2026.1.tar.gz` (`texlive-images.sh:55`, `:91`). |
| Institute image lists | Both above, labels “TeX Live 2026” and “TeX Live 2025”, default 2026 (`deploy/iitmandi/variables.env.example:144`) | `services/web/modules/sandboxed-compiles/index.mjs:12` maps `ALL_TEX_LIVE_DOCKER_IMAGES` and matching `ALL_TEX_LIVE_DOCKER_IMAGE_NAMES` to the allowed menu list; line 18 falls back to the first name, line 21 sets `currentImageName`. |
| Server and Pi image lists | Only `iitmandi/texlive-pi:2026.1`, label “TeX Live 2026” (`deploy/server/server.env:30`, `deploy/pi/pi.env:67`) | The server retains the alias on amd64; `deploy/server/deploy.py:87` verifies amd64 and revision, line 89 reads `org.iitmandi.compile-image`, line 102 reads the compile alias. An alias containing “pi” does not prove arm64. |
| Compose / Pi build / direct load check | App images are chosen via `LATEX_IMAGE` (`deploy/server/docker-compose.yml:12`, `deploy/pi/docker-compose.yml:31`); neither compose adds a TeX-year list. `deploy/pi/Dockerfile-texlive:25` installs from a rolling mirror. `deploy/server/operations/load-check.py:37` names the 2026 Pi alias. | `deploy/pi/docker-compose.yml:14` documents the compile-image label. Confirm installed year and architecture separately; the direct load check bypasses web queue behavior. |
| Historical compatibility names | `texlive/texlive:latest-full`, `texlive/texlive:TL2025-historic` (`deploy/iitmandi/README.md:103`) | Documented as possible stored project names. Preserve them until the maintainer establishes actual use and approves migration. No older year is listed in the scoped deploy manifests. |
| CLSI image alternatives | `TEXLIVE_IMAGE`, then `TEX_LIVE_DOCKER_IMAGE`, then first `ALL_TEX_LIVE_DOCKER_IMAGES` (`services/clsi/config/settings.defaults.cjs:145`); optional `TEX_LIVE_DOCKER_IMAGE_ROOT` at line 101, `ALLOWED_IMAGES` at line 228, and `TEXLIVE_IMAGE_USER` at line 154 | `DockerRunner.mjs:59` falls back to the configured image, line 64 validates its allowlist, line 70 prepends the optional image root, and line 283 derives a year-specific PATH (or `rolling`). |

Other references are development examples and fixtures, not a production retention
list: `services/clsi/patch-texlive-dockerfile:1` and
`services/clsi/test/acceptance/js/SimpleLatexFileTests.js:31` name
`quay.io/sharelatex/texlive-full:2017.1`;
`services/clsi/README.md:31` uses the registry example
`us-east1-docker.pkg.dev/overleaf-ops/ol-docker/texlive-full:2026.1`.
`services/clsi/app/js/CompileManager.js:944` describes `texlive-full:2026.1` and
`:2026.1.checkpointing`; line 955 conditionally selects a `.checkpointing` variant
only when allowed. Unit tests use `example.com/texlive-full:2025.1` and its
checkpointing variant (`services/clsi/test/unit/js/CompileManager.test.js:503`, `:559`).

Web fixture names include `texlive-full:2024.1`
(`services/web/cypress/support/shared/commands/compile.ts:57`,
`services/web/test/frontend/helpers/editor-providers.tsx:153`,
`services/web/test/frontend/features/source-editor/helpers/mock-project.ts:66`),
`texlive-full:2023.1`
(`services/web/test/frontend/features/ide-react/components/alerts/alerts.spec.tsx:27`),
`sharelatex/texlive:2021`, `:2022`, `:2023`
(`services/web/modules/server-ce-scripts/test/acceptance/src/ServerCEScriptsTests.mjs:514`),
`TL2017`, `wl_texlive:2018.1`
(`services/web/test/unit/src/Templates/TemplatesManager.test.mjs:13`, `:232`), and
`texlive-full:2018.1`, `:2019.1`, `:2020.1`, `:2021.1`
(`services/web/test/unit/src/Project/ProjectHelper.test.mjs:37`). Legacy saved logs
mention TeX Live 2011 (`services/clsi/test/acceptance/fixtures/examples/glossaries/output.glg:1`)
and 2014 (`services/web/test/frontend/helpers/fixtures/logs/bibtex.blg:1`);
`services/clsi/app/js/LatexRunner.js:96` distinguishes log handling for 2022+
versus 2021 and earlier. These references establish no installed image or dependent
real project. Their internal image and path identifiers are kept verbatim.

New projects store `Settings.currentImageName` unless an image is already present
(`services/web/app/src/Features/Project/ProjectCreationHandler.mjs:288`). The
database field is `imageName` (`services/web/app/src/models/Project.mjs:54`). On
editor load, missing names are filled with the current default
(`services/web/app/src/Features/Project/ProjectController.mjs:811`). A user chooses
the year in project settings (`services/web/frontend/js/features/ide-settings/components/compiler-settings/image-name-setting.tsx:19`),
which POSTs settings at `services/web/app/src/router.mjs:615`; the controller at
`ProjectController.mjs:212` updates the image through `ProjectOptionsHandler.mjs:38`
and `:51` after exact allowlist validation. `ClsiManager.mjs:1226` forwards the
stored project image to the runner. Changing the default does not migrate projects
that already have an image name. The startup checker compares stored image use
against the configured list (`services/web/modules/server-ce-scripts/scripts/check-texlive-images.mjs:68`).

## Method

The external script `pr-proof/scripts/long-7.py` uses the sibling scripts' cookie
and CSRF login pattern and the regular project compile endpoint. Each concurrent
job needs a different account and project. Upload generated content only. A cold
run means the first manual compile of a fresh project; check initial-build evidence
because an editor or upload hook might have compiled it already. Repeat warm,
then replace only `chapters/results.tex` with one edited plot in the same project.
Do not replace the project or clear its cache for the small-edit run.

Before submission, the script requests `/source` and requires its
`X-Source-Revision` header. This header is set at
`services/web/modules/source-code/app/src/SourceCodeController.mjs:23`; authenticated
access is routed at `SourceCodeRouter.mjs:28`. The build writes the revision at
`server-ce/Makefile:56` and labels it as `com.overleaf.ce.revision` at line 64.
Record both the deployed source SHA and architecture; do not substitute worktree HEAD.

The script measures request start/end and wall seconds, status, download success,
and PDF page count with the existing `pdfinfo` executable. Without it, pages remain
unknown. `full_pdf` requires success and the supplied expected page count; visual
inspection still needs to check that the correct final page arrived. It does not
save PDFs or logs. The HTTP response does **not** currently contain a timeout
(`CompileController.mjs:616`); `timeout_response_s` stays unknown. Separate editor
metadata (`ProjectController.mjs:1197`, `services/web/app/views/project/editor/_meta.pug:49`)
can supply an owner timeout, but may omit a default. Track E must confirm the
effective default and owner override. CLSI caps the submitted value at 600 seconds.

Queue polling uses `GET /project/:Project_id/compile/queue`
(`services/web/app/src/router.mjs:643`, `CompileController.mjs:642`,
`CompileQueue.mjs:221`). State, paused flag, position, slots and turn seconds are
observed once per second. Approximate waiting, paused and running time is integrated
from the last observed state; unavailable/idle observations are counted as unknown.
Polling includes time outside actual engine execution and can miss transitions.
It is not precise container running time or a fairness guarantee.

Capture Docker events live before any compile starts. Historical queries return
only the last 256 events (Docker CLI reference:
<https://github.com/docker/cli/blob/master/docs/reference/commandline/system_events.md>).
The `events` helper reads JSONL start/pause/unpause/die events and pairs complete
container lifecycles with each project's request interval. Containers are named
`project-<project[-user]>-<fingerprint>` (`DockerRunner.mjs:115`). Ambiguous or
incomplete matches produce unknown durations. Keep browser auto-compiles, SyncTeX
and word-count requests out of this window; reconcile any ambiguous matches with
maintainer-confirmed container IDs. Use synchronized clocks. Pre-container wall
time includes sync/setup as well as queue wait. Running seconds include startup,
engine work and graceful cleanup, and are not CPU seconds.

The HTTP output list supplies path/build/content identifiers, not a cache-hit flag
(`ClsiManager.mjs:745`; `services/clsi/app/js/OutputFileFinder.js:35`). Comparing
download hashes across phases records unchanged versus changed/new content only.
It cannot prove an unchanged file was not regenerated. For stronger evidence, add
an exact maintainer-confirmed `compile_dir` to each private job manifest: the
script compares generated-file mtime, size and hash before/after, excluding source
extensions and recording only counts and hashed names. Retained metadata is cache
evidence; changed metadata means rewritten/new, not necessarily changed figure
content. Missing host access leaves these cache counts unknown. Successful graceful
stops preserve compile files; abrupt stops clear them
(`services/clsi/app/js/CompileManager.js:293`). Observe timeout/retry outcomes.

CSV, Markdown and JSON contain measurement metadata. Keep private manifests,
credentials, fingerprints and event files outside Git and public screenshots.
The local measurements below were run on a disposable stack. Private measurement
files remain outside the repo.

## Results: local synthetic rehearsal

The rehearsal used the disposable local `deploy/pi` stack on an amd64 laptop
(Ryzen 7 7445HS, 6 cores/12 threads, 14 GB RAM).
The measurement bundle does not contain a hardware inventory. These results are
neither Institute amd64 acceptance nor measurements on a physical Pi.

The running app was `iitmandi-latex:staging628`, source revision
`628a88ae1e235d7770f5aea541c4edcd2e1723ce` (`acadsecy/staging`, including
`0266908fbc`). `pr-proof/issue7/run1/deployed.txt` records the image/revision and,
in its final six lines, settings read from the running container's environment:

| Local synthetic rehearsal setting | Observed value |
| --- | --- |
| Compile timeout | 120 s |
| Slots / turn duration / paused count cap | 2 / 60 s / 2 |
| Initial wait / request scheduling budget | 300 s / 540 s |
| Editor-reported timeout | 120 s for all three separate accounts |

Recorded Docker events identify compile image `iitmandi/texlive-pi:2026.1`.
The compile resource configuration is 1.5 GiB and 1 CPU per container
(`deploy/pi/pi.env:73`); the bundle does not independently record container
resource-limit inspection. Use this stack's measured behavior only for this rehearsal.

The fixture was generated from the thesis template by `make-fig-thesis.py` with
60 pgfplots figures, 1500 samples each and `--flush 20`: a `\clearpage` after every
20 figures. Every successful PDF had 39 pages. An earlier run of the
unflushed fixture exhausted its queued floats with
“Output loop---100 consecutive dead cycles” and an emergency stop without a PDF.
No failed-run log was retained in this bundle, so the exact float count and timing
are unverified and omitted from the measured results. The reported failure concerns the
fixture's unprocessed floats, not evidence that a compile limit was reached. The
unflushed 60-plot runs in #5 should be checked for the same error before interpreting
them as timeout evidence.

### Run 1: local synthetic rehearsal

All times are seconds. Container running/paused time comes from Docker events;
queue wait comes from polling. All rows returned HTTP 200 / `success`, downloaded
39-page PDFs and had no recorded pauses. Single-project phases were sequential.

| Phase / job | Wall s | Container running s | Queue wait s (approx.) | LaTeX runs |
| --- | --- | --- | --- | --- |
| Cold | 63.5 | 63.3 | 0.0 | 4 |
| Warm, unchanged | 1.6 | 1.5 | 0.0 | 1 |
| Small edit, one plot changed | 4.7 | 4.6 | 0.0 | 3 |
| Two concurrent: warm / cold | 1.5 / 57.7 | 1.4 / 57.5 | 0.0 / 0.0 | 1 / 4 |
| Three concurrent: warm / warm / cold | 1.6 / 1.6 / 67.5 | 1.5 / 1.4 / 65.8 | 0.0 / 0.0 / 1.0 | 1 / 1 / 4 |

The cold run's polling estimate was 62.46 s running, versus 63.282 s from events.
For the third job in the last row, polling estimated 65.488 s running; events
recorded 65.769 s running and 1.689 s before container start. These measures include
different overheads and must not share an unqualified “running” label.

The measurement bundle is outside Git under `pr-proof/issue7/`. Run 1 sources:
`run1/cold.json`, `warm.json`, `small-edit.json`, `concurrent-2.json`,
`one-beyond-slots.json`, and their `-events.json` / `.md` counterparts. Request
start/end UTC and source SHA are retained in those records. The cold request ran
from `2026-11-21T20:53:47.159705+00:00` to
`2026-11-21T20:54:50.632405+00:00`.

### Run 2: local synthetic rehearsal, cold contention

Three fresh copies and three accounts submitted together to two slots. All three
returned HTTP 200 / `success`, downloaded all 39 pages and took four LaTeX runs.

| Job | Wall s | Container running s | Queue wait s (polling) | Pre-container wall s (events) | Container paused s / pause count |
| --- | --- | --- | --- | --- | --- |
| A, started immediately | 66.3 | 62.9 | 0.0 | 0.143 | 3.234 / 1 |
| B, started immediately | 63.3 | 63.1 | 0.0 | 0.143 | 0.022 / 1 |
| C, initially queued | 122.9 | 62.7 | 59.3 | 60.161 | 0.000 / 0 |

At about the 60-second boundary, A paused for 3.234 s and resumed; B also had a
brief 0.022 s pause/resume that polling missed. C's 60.161 s pre-container interval
includes setup as well as waiting. The worst wall time was 122.943 s (about
123 s), below the configured 540 s scheduling budget in this run. This does not
establish a hard request deadline or a guarantee for longer documents.

Sources: `pr-proof/issue7/run2/cold-contention-3.json`,
`cold-contention-3-events.json`, their `.md` files and `events.jsonl`. C's request
ran from `2026-11-21T21:01:22.747815+00:00` to
`2026-11-21T21:03:25.690711+00:00`.

All compile-response timeouts were absent; editor metadata reported 120 s.
Host cache-retention/regeneration counts remain unknown. HTTP hashes showed
198 unchanged / 4 changed-or-new output files on the warm repeat, and
193 unchanged / 12 changed-or-new after the small edit; identical content is not
proof that a file was not regenerated. No timed-out real document was tested.

Still open: the real 126-page thesis (owner consent pending), Institute amd64 and
physical Pi runs (Track E's isolated window pending), production project counts
per year, rollback timing and real-document cache reuse after a timeout.

## TeX Live 2025 versus 2026

### Local synthetic rehearsal: direct image compiles

The same 39-page fixture was compiled directly in each amd64 image, bypassing
the web queue, with 1 CPU, 1.5 GiB and no network. `pr-proof/issue7/years.sh:15`
records those resource flags and the compile command:
`latexmk -cd -jobname=output -auxdir=/compile -outdir=/compile -synctex=1 -interaction=batchmode -f -pdf main.tex`.
These are the recorded latexmk flags, not a claim that every environment flag
or the service user matched an end-to-end web compile.

| Local synthetic rehearsal image | Cold s | Warm s | Pages | Recorded LaTeX errors / warnings | TeX Live / latexmk | memoize |
| --- | --- | --- | --- | --- | --- | --- |
| `iitmandi/texlive:2025.1` | 82.1 | 0.9 | 39 | 0 / 0 | 2025 / 4.87 | Present |
| `iitmandi/texlive:2026.1` | 66.2 | 0.3 | 39 | 0 / 0 | 2026 / 4.88 | Present |

Source: `pr-proof/issue7/years/years.csv` and `years/2025.1-versions.txt` /
`years/2026.1-versions.txt`. All four direct compiles exited 0. A single synthetic
document does not test real older theses, all templates or all engines.

### Local synthetic rehearsal: image sizes and retention evidence

| Year / local image | Archive size (bytes) | Installed size (bytes; shared/unique separately) | Dependent projects (maintainer inventory) | Compatibility notes | Rollback cost |
| --- | --- | --- | --- | --- | --- |
| 2025 / `iitmandi/texlive:2025.1` | 2,547,199,855; export 68 s | 8,659,157,105; unique 8.539 GB; shared 120.2 MB | Unknown; no production inventory | Synthetic fixture passed; real older theses untested | Restore/rollback time not measured |
| 2026 / `iitmandi/texlive:2026.1` | 2,698,669,420; export 72 s | 9,019,353,281; unique 8.899 GB; shared 120.2 MB | Unknown; no production inventory | Synthetic fixture passed; real older theses untested | Restore/rollback time not measured |

Sources: `pr-proof/issue7/sizes/installed.txt`, `sizes/df.txt` and
`sizes/archive.txt`. Both inspected images were amd64; their recorded digests
match the pinned 2025/2026 manifest entries in the inventory. Archive format was
`docker save | gzip --rsyncable`, matching `texlive-images.sh:91`. Shared and
unique sizes are rounded decimal display values from Docker, not exact byte counts.
An export duration is not a restore duration.

For each additional year, add actual project counts and reasons for dependence,
compatibility results, archive and installed bytes, unique/shared layers, archive
checksum verification, restore duration, and alias/migration reversal cost before
proposing retention. Use anonymous project codes in shared evidence. An image's
inspect size is cumulative; it is not the incremental disk cost of keeping that
year. Record Docker version/storage backend and `docker system df -v` alongside it.
Proposal for explicit approval: keep 2025 and 2026 for now; decide after real old
theses compile on both. This is not a production retention decision. Retain
existing images and aliases through evaluation; no evidence currently supports
deleting a year.

## Consent and request checklist

- Owner: identify the document owner and obtain explicit opt-in for the named tests.
- Document type: thesis (including the 126-page target), long illustrated report,
  Beamer deck, or older thesis; agree expected pages and an anonymous evidence code.
- Allowed environment: specify the isolated amd64 test instance, accounts, named
  operators and window; ask separately about any Pi run.
- Retention/deletion: agree where private copies and derived outputs may be kept,
  who can access them, the deletion date and who confirms deletion. No content in
  Git, logs or public screenshots. Obtain separate permission before any private
  screenshot containing document content.
- Use synthetic fixtures until consent is recorded. No owner documents were accessed.

## Open items for Track E and the authorized maintainer

- Confirm deployed SHA, image ID/digest, amd64 architecture and current non-secret
  effective slots, turn duration, compile timeout, paused count/duration cap,
  initial-wait budget, request scheduling budget, proxy timeout and compile-group
  resource limits. Confirm test-owner overrides and per-user compile-directory mode.
  Checked-in env and override files do not answer this.
- Schedule a disposable isolated contention window, define how to identify each
  container and map its host compile directory, and reserve separate test accounts.
- Approve the one-beyond-slots test explicitly, including its account count and
  memory allowance. Do not infer approval from a two- or three-job rehearsal.
- Confirm the real-document consent and expected page counts; run full-document
  cold, warm, small-edit and contention acceptance within the approved limits.
- Supply anonymous image-dependency counts and any older-year requirements. Approve
  a retention choice only after sizes, compatibility and rollback are measured.
- Review the missing response timeout and the scheduling-only 540-second budget
  observation before any limits or completion-time claim is published.
