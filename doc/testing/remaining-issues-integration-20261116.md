# Remaining issue integration verification

The `verify/remaining-issues-20261116` branch combines the pending issue fixes for
review. Its tested code revision is `8d7f965ec14534ae0aabc995deda47bb4f982166`;
the following documentation commit changes no runtime behavior.

| PR | Included head | Work |
| --- | --- | --- |
| #55 | `93e2e7494b` | Missing assets, valid/stale PDF handling |
| #56 | `12a4663bbf` | Help guides and review accuracy corrections |
| #57 | `cae43a5e0a` | Report preview and unavailable support-address correction |
| #58 | `571b7eeb4c` | Reference search, duplicate-source warning and regressions |
| #61 | `6573b7d5ec` | Stopped/timed-out PDF recovery and updated verification |
| #62 | `ce31f74603` | ZIP verification evidence and explicit remaining acceptance |
| #63 | `d72dd58077` | Explicit AI context/consent and bounded optional managed mode |
| #64 | `0cf789ca23` | Aggregate admin capacity dashboard |
| #65 | `4b4f414803` | Table paste escaping, caret preservation and compile fixture |

Integration resolved one module-registration conflict by keeping both `ask-ai`
and `support`. Two CI-list conflicts were resolved by keeping every support,
reference and table regression entry. These resolutions are on this verification
branch; staging and the individual issue PR bases remain unchanged.

## Results on 16 November 2026

- **140 backend tests passed**, including isolated Unix-socket Redis budget
  checks, AI routes/service, support, capacity sources/view, editor places,
  compile telemetry/manager/queue.
- **80 frontend tests passed** across AI consent/context/edit application,
  references, support modal, table filtering and compile logs/banner.
- **58 Cypress tests passed** together in headless Chrome, retries disabled:
  all 50 PDF preview cases and all 8 table input cases.
- Separate focused runs passed 202 CLSI tests, 36 existing table/read-only
  Cypress tests and 7 hybrid-toolbar Cypress tests.
- Focused table TypeScript check: zero diagnostics in the five changed source/
  test files. The complete upstream graph reports 240 diagnostics, so this is
  not a claim that the complete graph type-checks.
- PR #65 required [Build and check run](https://github.com/AcadSecy/iitmandi-latex-deploy/actions/runs/43770138667)
  passed for `4b4f414803`. Its log confirms the saved editor-output fixture
  compiles with pdfLaTeX, XeLaTeX and LuaLaTeX, followed by the server settings,
  login/compile and sandbox smoke checks. This is an ephemeral CI stack.
- Required checks for the corrected #56, #57 and #58 heads and updated #61
  evidence head also passed. Details and screenshots remain in their issue
  verification files.

## Acceptance and remaining backlog

Issue closure still needs maintainer review and the Institute deployment check.
The Institute server is reachable, but `/learn` redirects to login; authenticated
feature flags, reload/persistence, real phones and actual support-mail receipt
were not verified in this pass. Managed AI stays off by default.

- #4, #5, #6 and #41 already have merged implementation PRs; avoid duplicating
  them. Their deployed acceptance is separate from source completion.
- #11 and #12 require actual institutional sign-off and office-staff sessions.
- #7 requires permitted long-thesis benchmarks and TeX Live retention decisions.
- #13, #16–#20, #27 and #45 retain their broader audits, live collaboration,
  mail/history measurements, mobile checks or independent ZIP acceptance.
- #22–#25 and #38 retain host/load, external alert delivery, off-host/full restore,
  DNS/mail/deployment acceptance. Local tests cannot establish these results.
- #46, #48–#51 and #53 remain assigned conversion, writing, project-health,
  GitHub-sync and editing-resilience work; this batch does not claim to complete
  those implementations or feasibility reports.
- Track issues #3, #8, #15 and #21 remain open until their children are accepted.
