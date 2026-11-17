# Issue #16: collaboration and review acceptance checklist

## Purpose and scope

Repeatable manual acceptance checks for [Issue #16](https://github.com/AcadSecy/iitmandi-latex-deploy/issues/16): comments, Track Changes, Reviewer permissions, and simultaneous use of one project by three users. TC-01 through TC-30 follow the expanded plan supplied by the issue owner. All TC-01–TC-30 are reported PASS through manual UI acceptance testing. This document preserves expanded procedures, records the actual executed variants, and separates those reported passes from unverified backend, evidence, and automated-regression requirements. Results below remain tester-reported. All 14 screenshots were visually reviewed; all six recordings decoded to the end and were reviewed through one-second sampled frames and selected full-resolution frames, not exhaustive playback. Evidence limits and privacy findings are recorded below.

Use **three independent authenticated browser sessions on the authorized institute test server**. Separate browser profiles or different browsers are suitable; ordinary tabs sharing one login are not independent sessions. Keep A and B side by side for the required review-session recording and maintain C as a third independent session. Additional users may be added for the issue's optional four/five-user session; record them separately without changing these IDs.

Only use disposable projects containing the baseline below. Do not test against confidential projects. Do not change deployment configuration, restart services, run migrations, access databases, or manipulate Docker volumes for this checklist. Obtain the test-account access from the authorized maintainer privately; do not put credentials in this document or evidence.

## Test environment and revision

| Field | Value before execution |
| --- | --- |
| Run ID and tester | NOT RECORDED |
| Start/end time and timezone | NOT RECORDED; use explicit timezone, e.g. Asia/Kolkata |
| Authorized environment | Institute test server; documented address http://172.19.17.79:8080; confirm authorization and current address before testing |
| Deployed revision | UNKNOWN — not queried during preparation |
| Revision discovery method and time | NOT RECORDED |
| Checklist branch | `c/collaboration-review-tests` |
| Checklist staging base | `1ff3043ca34eaa2c24767fe8c42658acfdc25d09` |
| Network conditions | NOT RECORDED |
| Document-operation type | UNKNOWN — record per disposable project/document |
| Operation-type discovery method | NOT RECORDED |
| Track Changes feature availability | VERIFIED (manual UI): Track Changes was available and functional during the executed tests. Backend entitlement and authorization enforcement were not independently verified. |
| Maintainer go-ahead / plan reference | NOT RECORDED; confirm before acceptance execution |

The checklist base SHA is **not evidence of the deployed revision**. If revision information is available through an authorized application UI, a public build/source artifact, or a maintainer-provided deployment record, record the full SHA and provenance. Do not infer it from current staging, file timestamps, or a server address. If unavailable, leave UNKNOWN and record the limitation; ask the maintainer without accessing deployment services yourself.

Record document-operation type as `legacy ShareJS (sharejs-text-ot)`, `history-OT (history-ot)`, or `UNKNOWN`. If discoverable, inspect only the test document's already-received, read-only browser join/document metadata or OT messages in DevTools. A declared OT type is stronger evidence than payload shape: legacy text operations commonly contain `{i, p}` / `{d, p}` and `meta.tc`; history-OT operations commonly use `textOperation`, tracking properties, and comment operations. Shapes alone are clues, not definitive proof. Record the method and a sanitized observation. Do not modify runtime state, manufacture operations to discover the type, or save full WebSocket/HTTP dumps. If inconclusive, ask the maintainer and keep UNKNOWN. If both types are available, run separate copies of this checklist and evidence for each type. Do not migrate documents to obtain coverage.

## Accounts and browsers

| Label | Initial role | Role during Reviewer tests | Browser/version | OS/version | Session/profile label |
| --- | --- | --- | --- | --- | --- |
| A | Owner | Owner | NOT RECORDED | NOT RECORDED | A |
| B | Editor | Editor | NOT RECORDED | NOT RECORDED | B |
| C | Editor | Reviewer for TC-17–TC-24 and TC-30; Editor for TC-25–TC-29 | NOT RECORDED | NOT RECORDED | C |

Record full browser versions using the browser's About page before the run. Use only A/B/C in shared evidence and notes. Do not record account emails, real names, passwords, tokens, cookies, share links, or confidential project URLs. If the UI exposes identity or project URLs in a capture, crop/redact before saving it to the evidence directory. Use browser-local credentials; never export authenticated session state.

## Disposable project setup and baseline

1. In A's independent session, sign in to the authorized test server and create an empty disposable project named `Issue16-<run-id>-<case-or-group>` (no private identifiers).
2. Set `main.tex` as the root document, choose pdfLaTeX, and replace its contents with the baseline below.
3. Invite B and C as Editors using the normal sharing UI. Accept invitations privately; do not save invitation URLs in evidence.
4. Open the same project/main.tex in all three authenticated sessions and verify the member list and role labels.
5. Compile successfully as A before testing. Record any baseline failure and mark dependent cases BLOCKED instead of attributing it to collaboration.
6. Start with Track Changes off for everyone and no comments/suggestions. Enable it only where a test requires it. Confirm the owner's project feature allows tracking; otherwise mark dependent cases BLOCKED.
7. Create a fresh disposable copy for every case that requests one. Reusing the shared TC-01–TC-05 thread is intentional. For other cases, seed their explicit preconditions through ordinary UI actions; if a dependency fails, recreate the fixture or mark BLOCKED.
8. Before a concurrent test, wait for all clients to finish synchronizing. Use a spoken countdown; record the timing and outcome without assuming simultaneous clicks imply an exact server order.

```latex
\documentclass{article}
\begin{document}
\section*{Issue 16 disposable collaboration fixture}

COMMENT-ANCHOR alpha beta gamma.

INSERT-ANCHOR one two three.

DELETE-ANCHOR delta epsilon zeta.

REPLACE-ANCHOR red green white.

NEARBY-ANCHOR north south east west.

REVIEW-ANCHOR lambda mu nu.

PARALLEL-A apple.

PARALLEL-B banana.

PARALLEL-C cherry.

Final paragraph remains unchanged.
\end{document}
```

## Procedure, results, and evidence rules

- Allowed case statuses: **NOT RUN**, **PASS**, **FAIL**, **BLOCKED**. Every case starts NOT RUN. Record actual observations only after execution.
- Final PASS statuses record the tester-confirmed manual UI scenario, with executed variants and unverified expanded substeps disclosed in Actual result. They do not assert every originally proposed step was performed. A denied operation may correctly pass a permissions test; hidden/disabled controls do not prove server authorization. TC-22 backend probes remain an explicitly unexecuted follow-up, separate from its manual UI PASS.
- FAIL means an observed expected outcome was violated. BLOCKED means a precondition or required subcheck cannot be completed; identify why. UNKNOWN environment metadata must be disclosed and must not be presented as deployment/type coverage.
- After an outcome, update Actual result with A/B/C observations, timing, operation type, and revision reference. Update evidence paths and the linked bug issue. Do not use a blank issue field to imply a failing test is resolved.
- Record concurrent cases and at least one full review session with two browsers side by side. Include before/after screenshots for failures. Avoid recording login or opening DevTools panels containing credentials.
- Use local `~/issue16-evidence/{screenshots,recordings,logs,test-results}/`; its `index.csv` maps IDs to proposed artifact names. An indexed planned filename is not proof an artifact exists.
- Screenshots/recordings stay outside Git. Logs must contain sanitized notes/status codes only: no raw HAR, cookies, authorization headers, tokens, account identifiers, private URLs, or source from other projects. Never save secrets and rely on later redaction.
- For a failure, record exact reproduction, expected/actual result, revision/type/browser, sanitized evidence, and an issue URL once one is actually filed. Do not invent bug numbers. File issues/fixes only in a separately authorized phase; do not file automatically while preparing this document.
- For retries, preserve the original observation and use an attempt suffix, e.g. `TC-28-A-B-attempt-02.png`. A later pass does not erase a previous failure.

## First comment-testing round: coverage and evidence

TC-01–TC-08 are marked PASS for the tester-reported scope. TC-04 covers A resolving via the checkmark with automatic disappearance in A/B/C; history/reopening and B-resolution checks remain unverified. TC-05 covers only the resolved comment staying absent from the active panel after all three refreshes. TC-08 covers synchronized deletion, retained visible comment/navigation, refresh persistence, and successful compilation; undo/redo remains unverified. These scoped passes do not assert that every original procedure subcheck ran.

TC-06 and TC-07 are PASS following explicit tester confirmation. TC-06 covers three separate correctly attributed comments visible in A/B/C and surviving refresh. TC-07 covers two concurrent senders (A/B) replying to C’s thread, both replies appearing exactly once in A/B/C and surviving refresh; the original three-sender variant remains unverified. No TC-06/TC-07 recordings or dedicated post-refresh artifacts were found. TC-09–TC-30 results are recorded below; all 30 manual UI cases are now reported PASS. Execution time, browser versions, deployed revision, and document-operation type have not been supplied; do not infer them from file timestamps or this worktree's base commit.

The evidence directory currently contains 14 PNG screenshots and six WEBM recordings. No standalone TC-05 evidence was found. Four screenshot basenames begin with a literal tab. References below display that character as `<TAB>`; `index.csv` preserves the actual character in `actual_evidence` paths. No evidence file was renamed or altered. Filenames establish artifact presence only, not content coverage or sanitization; review contents before sharing.

## Track Changes testing round: coverage and evidence

TC-09–TC-16 are PASS for the manually verified scenarios supplied by the tester. A switched to Reviewing mode independently of B/C and authored the insertion `fully` and deletion `during`. A accepted `fully`; B rejected the deletion of `during`. The final sentence persisted after all three refreshes as `This sentence will be fully modified during review.`, neither processed suggestion returned, compilation succeeded, and A remained in Reviewing mode. TC-16 separately verified mixed processing of the A-authored `carefully` insertion / `multiple` deletion and B-authored `simultaneously` insertion, with cross-account agreement, refresh persistence, and successful compilation.

The original planned procedures are retained below for repeatability; each Actual result explicitly records the executed variant and its coverage limits. In particular, TC-13 did not accept a deletion, TC-14 did not reject an insertion, and TC-15 verified processed outcomes rather than repeating the pending-suggestion procedure. TC-12 supplies the reported pending-suggestion refresh check. These results do not establish unreported fixture words, actor roles, replacement variants, or follow-up actions.

Existing evidence for this round consists of A/B screenshots for TC-10 and TC-11 and A/B recordings reported for TC-13 and TC-14. TC-09, TC-12, TC-15, and TC-16 have no dedicated artifacts and rely on manual reports. No C screenshot or recording for this round was found. Sampled video review supports the visible acceptance/rejection actions in TC-13/TC-14 and shows sequential session views, not side-by-side participant views. It does not independently establish every account, timing, or persistence claim. Actual test dates/times, browser versions, deployed revision, and document-operation type remain unrecorded; this documentation update is not a test execution.

## Manual test cases

### TC-01: Owner creates a comment.

**Area:** Comments

**Preconditions:** A is Owner; B and C are Editors. All sessions have the baseline main.tex open with Track Changes off.

**Steps:**

1. As A, select only `COMMENT-ANCHOR alpha beta gamma` in the source editor.
2. Use Add comment in the review UI; enter `A TC-01 initial comment` and submit once.
3. Inspect the highlighted selection and the review thread in A; do not resolve it.

**Expected result:** One thread is attached to exactly the selected text, attributed to A, with the submitted message. Source text is unchanged. Leave the thread for TC-02 through TC-05.

**Actual result:** PASS. Account A created an anchored comment, as reported by the tester.

**Status:** PASS

**Evidence reference:** `screenshots/TC-01-owner-comment.png`. All associated screenshots were visually inspected at readable/native resolution and support the displayed comment or suggestion state. Still images alone do not prove submission timing, active account identity, or refresh persistence. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-02: Collaborator sees the comment.

**Area:** Comments

**Preconditions:** TC-01 created an unresolved thread; B and C were already connected before A submitted it.

**Steps:**

1. Without refreshing B, open the review panel and locate `A TC-01 initial comment`.
2. Select the thread and verify its source highlight; repeat in C without refreshing.
3. Compare message, author label, selected text, and thread count across A/B/C; record observed propagation delay.

**Expected result:** B and C receive one matching thread and anchor through synchronization without a manual refresh. No duplicate message or source edit appears.

**Actual result:** PASS. Accounts B and C saw Account A's comment, as reported by the tester.

**Status:** PASS

**Evidence reference:** `screenshots/TC-02-editor-sees-comment.png`; `screenshots/<TAB>TC-02-third-user-sees-comment.png`. All associated screenshots were visually inspected at readable/native resolution and support the displayed comment or suggestion state. Still images alone do not prove submission timing, active account identity, or refresh persistence. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-03: Collaborator replies.

**Area:** Comments

**Preconditions:** TC-01 thread exists and is unresolved; B is Editor.

**Steps:**

1. As B, open the existing TC-01 thread and submit `B TC-03 reply` using Reply.
2. In A and C, observe that same thread without refreshing.
3. Compare the original comment and reply order, attribution, and source highlight in all sessions.

**Expected result:** One B reply appears in the existing A thread in all sessions; the original message and anchor remain intact. A second thread is not created.

**Actual result:** PASS. Account B replied to Account A's comment; Accounts A and C saw B's reply, as reported by the tester.

**Status:** PASS

**Evidence reference:** `screenshots/TC-03-B-replies-to-A.png`; `screenshots/<TAB>TC-03-A-sees-B-reply.png`; `screenshots/<TAB>TC-03-C-sees-B-reply.png`. All associated screenshots were visually inspected at readable/native resolution and support the displayed comment or suggestion state. Still images alone do not prove submission timing, active account identity, or refresh persistence. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-04: Comment resolution.

**Area:** Comments

**Preconditions:** The TC-01 thread contains the TC-03 reply. A is Owner and B is Editor.

**Steps:**

1. As B, resolve the TC-01 thread using its review-panel action.
2. In A and C, confirm the thread leaves the unresolved list without refreshing.
3. Open the resolved-thread list in each session and inspect the messages and resolver.
4. As A, reopen the thread and verify it returns in B/C; resolve it once more as A.

**Expected result:** Resolution and reopening synchronize across sessions. Resolved messages remain available in the resolved list with correct attribution. No source text is deleted.

**Actual result:** PASS for the observed resolution flow. Account A used the checkmark button to resolve the comment. It disappeared automatically from the active Review panel in A, B, and C without refreshing. The tester captured a recording. Coverage limitation: resolution by B, resolved-thread history, resolver metadata, and reopening were not verified in the supplied observations; those original procedure subchecks remain unverified.

**Status:** PASS

**Evidence reference:** `recordings/TC-04-comment-resolution.webm`. Sampled recording frames show local resolution and disappearance from the active panel in one editor view. Cross-account synchronization remains tester-reported; the video does not independently show B/C receiving the resolution. All six recordings decode to the end; content review used one-second sampled frames and selected full-resolution frames, not exhaustive playback. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-05: Comment persistence after refresh.

**Area:** Comments

**Preconditions:** The TC-01 thread and reply exist, with the final resolved state from TC-04.

**Steps:**

1. Record the thread messages and resolved state before refresh.
2. Refresh A, B, and C independently, reopen main.tex and the resolved-thread list.
3. Compare text, attribution, order, and state with the pre-refresh observation.
4. Reopen the thread as A, then refresh B and verify the unresolved state and anchor survive.

**Expected result:** Original comment, reply, and last successful resolve/reopen state survive refresh in every session without duplication or loss.

**Actual result:** PASS for persistence of the active-comment state only. After refreshing all three accounts, the resolved comment did not reappear in the active Review panel. Access to resolved-comment history was not verified. This result does not establish preservation of message/reply contents in history or reopening/anchor persistence. No standalone TC-05 artifact was found; this result is based on the tester report.

**Status:** PASS

**Evidence reference:** Tester report only; no standalone TC-05 screenshot, recording, log, or test-result file found. The TC-04 recording is indexed for resolution only; refresh coverage in that recording has not been verified.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-06: Comments from multiple users.

**Area:** Comments

**Preconditions:** A/B/C have main.tex open; all three currently have comment permission.

**Steps:**

1. As A, comment `A TC-06` on the token `COMMENT-ANCHOR`.
2. As B, comment `B TC-06` on `NEARBY-ANCHOR`; as C, comment `C TC-06` on `REVIEW-ANCHOR`.
3. In each session, select all three threads and compare author, message, and selected text.
4. Refresh B and confirm all three threads are still present.

**Expected result:** All three separately anchored threads are visible to every user with correct attribution and persist after refresh.

**Actual result:** PASS. The tester verified that A, B, and C each created a separately anchored comment; all three comments were visible in all three accounts with correct authors and persisted after browser refresh. Existing screenshots cover A/B/C views by filename; no dedicated post-refresh artifact was found, so refresh persistence relies on the tester report.

**Status:** PASS

**Evidence reference:** `screenshots/TC-06-A-all-comments.png`; `screenshots/TC-06-B-all-comments.png`; `screenshots/TC-06-C-all-comments.png`. All associated screenshots were visually inspected at readable/native resolution and support the displayed comment or suggestion state. Still images alone do not prove submission timing, active account identity, or refresh persistence. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-07: Concurrent replies.

**Area:** Comments

**Preconditions:** One unresolved shared thread exists. Choose the TC-01 thread; A/B/C can all see it.

**Steps:**

1. Prepare unsent replies `A TC-07`, `B TC-07`, and `C TC-07` in the same thread.
2. Use a spoken countdown and submit from all three sessions as closely together as possible.
3. Wait for synchronization, then compare complete message lists in A/B/C.
4. Refresh each session and compare again; record ordering if timestamps coincide.

**Expected result:** Each submitted reply appears exactly once with its author. All sessions converge to the same order after synchronization/refresh; no reply is overwritten.

**Actual result:** PASS for the verified two-sender scenario. A and B submitted replies almost simultaneously to the same thread created by C. Both replies appeared exactly once in A/B/C, with no duplicates or missing replies, and persisted after refreshing all three browsers. Coverage limitation: the original procedure describes three concurrent senders; that variant was not verified. Only a C-session screenshot exists; simultaneous submission, A/B views, and post-refresh persistence rely on the tester report rather than dedicated artifacts.

**Status:** PASS

**Evidence reference:** `screenshots/TC-07-C-concurrent-replies.png`. All associated screenshots were visually inspected at readable/native resolution and support the displayed comment or suggestion state. Still images alone do not prove submission timing, active account identity, or refresh persistence. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-08: Delete text containing an attached comment.

**Area:** Comments

**Preconditions:** Use a fresh disposable project copy with Track Changes off and one A comment attached exactly to `COMMENT-ANCHOR alpha beta gamma`.

**Steps:**

1. Keep A/C viewing the thread while B deletes the complete selected anchor text, leaving surrounding paragraphs intact.
2. Observe the thread, any detached-comment indication, source text, and review panel in all sessions.
3. Undo once in B; inspect whether text and the original comment attachment return in A/C.
4. Redo the deletion, refresh all sessions, and inspect the remaining thread state; record the product behavior explicitly.

**Expected result:** All sessions agree on deletion and comment state; unrelated text/threads are untouched and no crash or silent loss of message history occurs. If deletion detaches the thread, it is represented consistently and undo restores the attachment. Any inaccessible/lost thread or unclear retention behavior needs a linked issue; do not invent a retention policy.

**Actual result:** PASS for the observed deletion/retention flow. Account B deleted text containing a comment anchor. The deletion synchronized to A and C, while the comment remained visible to all three users. Clicking the comment navigated to the original location of the deleted text. After refreshing A/B/C, the text remained absent and the comment remained visible. LaTeX compilation succeeded. Coverage limitation: undo/redo restoration from the original procedure was not verified in the supplied observations.

**Status:** PASS

**Evidence reference:** `recordings/TC-08-comment-after-text-deletion.webm`. Sampled recording frames show text deletion with the comment retained. The later segment contains two editor sessions side by side, supporting two-session consistency; all-three-account and complete refresh/compilation coverage remain tester-reported. All six recordings decode to the end; content review used one-second sampled frames and selected full-resolution frames, not exhaustive playback. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-09: Enable Track Changes.

**Area:** Track Changes

**Preconditions:** Use a fresh baseline copy. A is Owner, B/C are Editors; tracking starts off for all.

**Steps:**

1. As A, enable Track Changes for A using the available review-mode control; record whether it affects self, selected members, or everyone.
2. Inspect the displayed mode in A/B/C without typing; document which users are now tracked.
3. Refresh A and verify its tracking state remains enabled.
4. Explicitly enable tracking for B and C, using per-user controls or each user's own control, and verify each session is in review mode.

**Expected result:** Enabled state is visible and survives refresh. Control scope matches the users it affects; other users are not silently toggled. All three are ready to submit tracked edits.

**Actual result:** PASS. Account A (Owner) switched from Editing to Reviewing mode. B and C remained in Editing mode; changing A's mode did not automatically change their modes. A's Reviewing mode also persisted through the later refresh in TC-15. Coverage limitation: enabling tracking for B/C, as described in the original procedure, was not reported for this case.

**Status:** PASS

**Evidence reference:** Manual verification reported by the tester; no dedicated TC-09 screenshot, recording, log, or test-result file was found. No artifact reference is inferred from another case.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-10: Suggest insertion.

**Area:** Track Changes

**Preconditions:** Tracking is enabled for B; no pending suggestion touches INSERT-ANCHOR.

**Steps:**

1. As B, insert the exact text ` B-TC10` immediately after `INSERT-ANCHOR one two three`.
2. Inspect the source decoration and corresponding suggestion in the review panel.
3. Record suggested text, insertion location, and author; leave the suggestion pending.

**Expected result:** The addition is represented as an attributed insertion suggestion at the intended location. It remains pending rather than being silently accepted.

**Actual result:** PASS. Account A created a suggested insertion of `fully`, highlighted as an addition. It appeared in the Review panel with the correct author and was visible to B and C. Screenshots were captured for A and B. Execution variant: A authored `fully`, rather than B inserting the planned fixture token.

**Status:** PASS

**Evidence reference:** `screenshots/<TAB>TC-10-A-suggested-insertion.png`; `screenshots/TC-10-B-sees-insertion.png`. All associated screenshots were visually inspected at readable/native resolution and support the displayed comment or suggestion state. Still images alone do not prove submission timing, active account identity, or refresh persistence. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-11: Suggest deletion.

**Area:** Track Changes

**Preconditions:** Tracking is enabled for C; DELETE-ANCHOR is unchanged.

**Steps:**

1. As C, select only `delta epsilon` in `DELETE-ANCHOR delta epsilon zeta` and delete it.
2. Inspect the deletion decoration and review-panel entry; record the deleted text and author.
3. Leave the deletion suggestion pending and keep the document open in all sessions.

**Expected result:** A pending deletion suggestion retains enough information to identify and restore `delta epsilon`, is attributed to C, and leaves surrounding text unchanged.

**Actual result:** PASS. Account A created a suggested deletion of `during`. The Review panel displayed the deletion with deleted-text styling, the previous insertion suggestion remained intact, and the suggestion was visible across accounts. Screenshots were captured for A and B. Execution variant: A suggested deleting `during`, rather than C deleting the planned fixture words.

**Status:** PASS

**Evidence reference:** `screenshots/TC-11-A-suggested-deletion.png`; `screenshots/TC-11-B-sees-deletion.png`. All associated screenshots were visually inspected at readable/native resolution and support the displayed comment or suggestion state. Still images alone do not prove submission timing, active account identity, or refresh persistence. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-12: Suggestions visible across users.

**Area:** Track Changes

**Preconditions:** TC-10 insertion and TC-11 deletion are both pending.

**Steps:**

1. Without refreshing A, open its review panel and locate both suggestions.
2. Compare A/B/C: insertion/deletion text, author, location, and pending status.
3. Navigate to another document or close/reopen main.tex in B, then compare again.

**Expected result:** All three users see the same two pending suggestions and text state without requiring refresh. Switching documents does not lose or duplicate suggestions.

**Actual result:** PASS. B and C received both suggestions without refreshing. All three accounts retained both suggestions after refreshing, with correct authorship confirmed. Manual verification only; no screenshots were captured. Coverage limitation: switching documents or closing/reopening main.tex from the original procedure was not reported.

**Status:** PASS

**Evidence reference:** Manual verification reported by the tester; no dedicated TC-12 screenshot, recording, log, or test-result file was found. No artifact reference is inferred from another case.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-13: Accept a suggestion.

**Area:** Track Changes

**Preconditions:** Use pending insertion from TC-10 and deletion from TC-11; A has write permission.

**Steps:**

1. As A, accept only the TC-10 insertion through its review action.
2. Check B/C without refreshing: inserted text stays and its pending suggestion disappears.
3. As A, accept the TC-11 deletion; check that the deleted words remain absent and the pending deletion disappears.
4. Refresh B and verify both accepted text outcomes.

**Expected result:** Insertion acceptance retains the inserted text; deletion acceptance finalizes the deletion. Both pending entries disappear consistently and remain accepted after reload.

**Actual result:** PASS. Account A accepted the insertion of `fully`. The insertion became normal document text, its suggestion disappeared from the active Review panel, and the deletion suggestion remained pending. B and C displayed the expected result. Video evidence captured A and B. Coverage limitation: deletion acceptance from the original procedure was not exercised; the deletion was intentionally left pending for TC-14. Final refresh persistence is reported in TC-15.

**Status:** PASS

**Evidence reference:** `recordings/TC-13-accept-suggestion.webm`. Sampled recording frames show acceptance of fully, removal of its pending entry, and the deletion remaining pending. Two session appearances are shown sequentially, not side by side; C coverage remains tester-reported. All six recordings decode to the end; content review used one-second sampled frames and selected full-resolution frames, not exhaustive playback. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-14: Reject a suggestion.

**Area:** Track Changes

**Preconditions:** Use a fresh copy with B tracking an insertion ` B-TC14` after INSERT-ANCHOR and C tracking deletion of `delta epsilon`.

**Steps:**

1. As A, reject the B insertion and observe A/B/C.
2. As A, reject the C deletion and observe A/B/C.
3. Compare final source to the baseline and refresh C to verify it persists.

**Expected result:** Rejecting the insertion removes only ` B-TC14`; rejecting the deletion restores exactly `delta epsilon`. Pending entries disappear, all sessions agree, and baseline source is restored.

**Actual result:** PASS. Account B (Editor) rejected A's suggested deletion of `during`. The word remained in the document, the pending deletion disappeared, and the previously accepted insertion remained. A and C displayed the expected result. Video evidence captured A and B. Coverage limitation: insertion rejection from the original procedure was not exercised; the previously accepted insertion was retained. Final refresh persistence is reported in TC-15.

**Status:** PASS

**Evidence reference:** `recordings/TC-14-reject-suggestion.webm`. Sampled recording frames show rejection of the deletion, restoration of during, and removal of the pending entry; later session/reload views retain the result. Two sessions are shown sequentially. A transient service hostname needs redaction. All six recordings decode to the end; content review used one-second sampled frames and selected full-resolution frames, not exhaustive playback. Needs privacy review and redaction before public sharing.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-15: Suggestion persistence after refresh.

**Area:** Track Changes

**Preconditions:** Use a fresh copy with one pending B insertion ` B-TC15` and one pending C deletion of `delta epsilon`.

**Steps:**

1. Record both suggestion texts, authors, and locations without accepting or rejecting.
2. Refresh A, B, and C independently and reopen main.tex/review panel.
3. Compare suggestions and rendered source with the pre-refresh state.
4. As A, reject both and verify the baseline is restored in all sessions.

**Expected result:** Both pending suggestions survive refresh with matching content and attribution, remain actionable, and reject cleanly without duplicated text.

**Actual result:** PASS for processed-suggestion persistence. After refreshing A, B, and C, the final sentence remained `This sentence will be fully modified during review.` Neither processed suggestion reappeared, compilation succeeded, and A remained in Reviewing mode. Manual verification only. Execution variant: this case verified the accepted/rejected outcome from TC-13/TC-14 rather than the original pending-suggestion/reject-both procedure; pending-suggestion persistence was verified in TC-12.

**Status:** PASS

**Evidence reference:** Manual verification reported by the tester; no dedicated TC-15 screenshot, recording, log, or test-result file was found. No artifact reference is inferred from another case.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-16: Multiple suggestions with mixed acceptance/rejection.

**Area:** Track Changes

**Preconditions:** Use a fresh copy. B/C tracking enabled; A can accept/reject. No other pending edits exist.

**Steps:**

1. As B, insert ` KEEP-TC16` after INSERT-ANCHOR and ` DROP-TC16` after REPLACE-ANCHOR.
2. As C, suggest deletion of `delta epsilon`; then replace `red` with `blue` at REPLACE-ANCHOR, observing the paired deletion/insertion.
3. As A, accept KEEP-TC16, reject DROP-TC16, reject the delta/epsilon deletion, and accept both parts of the red-to-blue replacement.
4. Compare source and pending entries across A/B/C; refresh all sessions and compile once.

**Expected result:** Only KEEP-TC16 and the red-to-blue replacement remain. Delta/epsilon are restored, DROP-TC16 is absent, no completed entries remain pending, and source compiles. Mixed actions do not shift or corrupt adjacent ranges.

**Actual result:** PASS. A suggested inserting `carefully` and deleting `multiple`; B suggested inserting `simultaneously`. All three suggestions remained independent, appeared across A, B, and C, and showed correct authors. A accepted `carefully` and rejected the deletion of `multiple`; B accepted `simultaneously`. All three accounts showed the expected final text, processed suggestions disappeared from the active Review panel, changes persisted after refresh, and compilation succeeded. Manual verification only; no screenshots were captured. Execution variant: these three suggestions were used instead of the original fixture's KEEP/DROP tokens and red-to-blue replacement. No exact final sentence was supplied for this case, so none is inferred.

**Status:** PASS

**Evidence reference:** Manual verification reported by the tester; no dedicated TC-16 screenshot, recording, log, or test-result file was found. No artifact reference is inferred from another case.

**Linked issue:** None linked; no product failure reported for the observed scope.

### TC-17: Assign Reviewer role.

**Area:** Reviewer

**Preconditions:** Fresh baseline copy; A Owner, B Editor, C Editor; all connected. C has no unsent edits.

**Steps:**

1. As A, open project sharing and change C from Editor to Reviewer.
2. Observe the member list in A/B and any disconnect/reconnect or reload required in C.
3. After C reconnects, inspect its available modes and record how the role change reached the active session.

**Expected result:** Only A or another authorized project administrator can assign the role. C is listed as Reviewer and receives review-only capability with tracked suggestions instead of unrestricted writes. A/B retain their roles.

**Executed procedure (tester-reported):**

1. Keep C on the open document while A changes C from Editor to Reviewer in Share.
2. Check C's effective modes immediately without manually refreshing.

**Actual result:** PASS. A changed C from Editor to Reviewer. The permission change took effect without a browser refresh. This establishes the observed role transition, not authorization of arbitrary role-assignment requests.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-17. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-18: Reviewer opens document and review panel.

**Area:** Reviewer

**Preconditions:** C is Reviewer from TC-17. At least one A comment and one B tracked suggestion exist.

**Steps:**

1. As C, leave the editor page and reopen the disposable project from the project list.
2. Open main.tex and its review panel; navigate to the comment and pending suggestion.
3. Compare source, thread content, attribution, and suggestion text with A/B.

**Expected result:** Reviewer can read the project and open its review panel, comments, and suggestions. Reopening does not grant direct-write capability or permission to accept/reject another user's suggestion; own-suggestion withdrawal remains allowed.

**Executed procedure (tester-reported):**

1. As C, open the document and Review panel.
2. Inspect Reviewing availability and the visible-but-disabled Editing option.
3. Refresh C and repeat the mode/access checks.

**Actual result:** PASS. C could access the document and Review panel. Reviewing mode was available; Editing mode was visible but disabled. Restrictions persisted after refreshing.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-18. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-19: Reviewer attempts direct editing.

**Area:** Reviewer

**Preconditions:** C Reviewer; B Editor; A Owner. Record source before the attempt and keep A/B viewing it.

**Steps:**

1. In C, try to choose ordinary edit mode or disable tracking through the normal UI.
2. Type ` C-TC19` after REVIEW-ANCHOR, then attempt deletion of `mu` in that paragraph.
3. Inspect review entries and A/B source; verify any accepted-looking change is actually tracked.
4. As A, reject any C suggestions created by this test and compare restored source.

**Expected result:** Reviewer cannot make untracked source changes or switch into unrestricted edit mode. Typing is either blocked or submitted as attributed suggestions. Rejection restores the previous source in all sessions.

**Executed procedure (tester-reported):**

1. As C in Reviewer role, type into the document.
2. Check that a suggestion is created, Editing stays disabled, and A/B can see it.

**Actual result:** PASS. When C typed, the change became a suggestion rather than a direct edit. A and B could see the suggestion, and Editing mode remained disabled. Only the observed UI restriction is established; the planned deletion/reject-cleanup variant was not separately reported.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-19. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-20: Reviewer creates comments and replies.

**Area:** Reviewer

**Preconditions:** C Reviewer; an unresolved A thread exists on COMMENT-ANCHOR.

**Steps:**

1. As C, create `C TC-20 comment` on REVIEW-ANCHOR.
2. As C, reply `C TC-20 reply` to A's existing thread.
3. Check both messages and anchors in A/B without refreshing, then refresh C.

**Expected result:** Reviewer can create a comment and reply to another user's thread. Attribution, anchoring, and message persistence are correct in all sessions.

**Executed procedure (tester-reported):**

1. As C, create an anchored comment and reply to another existing thread.
2. Observe A/B without refreshing and check persistence. The tester reported persistence but did not specify the persistence-check method for this case.

**Actual result:** PASS. C created a comment and replied to another thread. A and B saw both changes without refreshing, and the changes persisted. This records the reported comment/reply behavior without inferring exact fixture wording.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-20. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-21: Reviewer suggests edits.

**Area:** Reviewer

**Preconditions:** C Reviewer with Track Changes available; use clean INSERT-ANCHOR and DELETE-ANCHOR regions.

**Steps:**

1. As C, insert ` C-TC21` after INSERT-ANCHOR and suggest deletion of `delta epsilon`.
2. Inspect C's insertion/deletion suggestions in A/B without refresh.
3. As A, accept the insertion and reject the deletion; verify the result in C.

**Expected result:** Reviewer produces attributed pending insert/delete suggestions. Authorized A can act on them; C receives the outcome without turning either suggestion into an unauthorized direct edit.

**Executed procedure (tester-reported):**

1. As C, suggest insertion of `collaboratively` and deletion of `multiple`.
2. Check both entries and their authors in A/B, then refresh and compare pending suggestions.

**Actual result:** PASS. C suggested inserting `collaboratively` and deleting `multiple`. A and B saw both suggestions with correct authorship; suggestions persisted after refresh. Execution variant: these words replaced the original planned fixture tokens. The originally planned accept/reject follow-up was not reported in this case.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-21. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-22: Reviewer attempts accepting/rejecting suggestions.

**Area:** Reviewer

**Preconditions:** C is Reviewer. Use a fresh disposable copy with one C-authored suggestion for withdrawal checks and a separate A-authored suggestion for other-user permission checks. A/B can observe the UI. This replaces the initial B-authored fixture for the executed UI variant.

**Steps (manual UI scope):**

1. As C, inspect the actions on a suggestion authored by C and confirm Reject change withdraws it.
2. Confirm C cannot accept its own suggestion.
3. Inspect a separate suggestion by A; verify C cannot accept or reject it using the UI.
4. In A/B, confirm the withdrawal is reflected in the document/review panel. Do not infer this final synchronization subcheck was observed unless recorded.

**Expected result:** Reviewer may withdraw its own suggestion; Reviewer cannot accept its own suggestion or accept/reject another user's suggestion through the UI. Own-suggestion withdrawal is not a security defect. UI controls alone do not establish backend authorization.

**Scope reconciliation:** The initial checklist combined UI checks with direct HTTP/socket authorization probes and would have marked an unperformed required backend subcheck BLOCKED. This final result is explicitly scoped to manual UI acceptance. Those original backend probes remain a separate unexecuted follow-up: test request/operation enforcement only in an independently authorized disposable environment, and record denied/allowed mutations without exposing session data. No such probes were executed or inferred here.

**Executed procedure (tester-reported):**

1. As C, create an own suggestion and inspect its actions; use Reject change to withdraw it.
2. Check that C cannot accept its own suggestion.
3. Create a separate A suggestion and inspect C's available actions; verify C cannot accept/reject A's suggestion through the UI.

**Actual result:** PASS for observed UI behavior. C could reject/withdraw its own suggestion using "Reject change", could not accept its own suggestion, and could not accept or reject A's suggestion through the UI. Withdrawing one's own suggestion is allowed behavior, not a security defect. Backend authorization was not independently tested.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-22. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-23: Reviewer role persists after refresh.

**Area:** Reviewer

**Preconditions:** C Reviewer; TC-17 assignment complete. Record tracking state and member list.

**Steps:**

1. Refresh C, reopen main.tex, and inspect its role and review mode.
2. Sign out of C and sign back in independently; reopen the same disposable project.
3. Verify C remains Reviewer and repeat a small typing attempt, then have A reject the resulting suggestion.

**Expected result:** Reviewer assignment survives refresh and a new login. C retains read/comment/suggest capabilities and cannot regain direct-write or other-user accept/reject rights. Own-suggestion withdrawal remains allowed.

**Executed procedure (tester-reported):**

1. Reopen the project in C and inspect Reviewer role, Reviewing mode, and disabled Editing mode.
2. Create a suggestion in C and inspect the unavailable accept/reject actions on A's suggestion.
3. Confirm C's Reviewer role in A's Share dialog.

**Actual result:** PASS. After reopening the project, C remained Reviewer: Reviewing mode was active, Editing was disabled, C could suggest changes, and C could not accept or reject A's suggestions. A's Share dialog confirmed the Reviewer role. Refresh restrictions were also observed in TC-18. A separate sign-out/new-login cycle from the original procedure was not reported.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-23. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-24: Role changes during an active session.

**Area:** Reviewer

**Preconditions:** C Reviewer and connected; A Owner; B Editor. No unsent edits or in-flight operations in C.

**Steps:**

1. As A, promote C to Editor while C remains on main.tex; observe reconnect and mode changes.
2. After authorization refresh, disable C tracking and make one small direct edit ` C-TC24`; verify A/B receive it.
3. As A, demote C to Reviewer again while C remains connected.
4. In C, attempt ordinary editing/acceptance; verify the old Editor capability no longer works. If C is disconnected, reconnect normally and repeat.
5. Inspect role lists in A/B and refresh C once more.

**Expected result:** Promotion and demotion update both UI and effective authorization. Stale connected sessions cannot continue unrestricted writes or acceptance after demotion. All sessions agree on C's final Reviewer role.

**Executed procedure (tester-reported):**

1. Keep C in the document while A promotes C from Reviewer to Editor.
2. Without refresh, inspect Editing availability and make a direct edit as C.
3. As A, demote C to Reviewer; without refresh, verify Editing is disabled again.

**Actual result:** PASS. A changed C from Reviewer to Editor and then back to Reviewer during the active session. Editing became available immediately after promotion and C could make direct edits. Editing became disabled immediately after demotion. No refresh was necessary. This verifies UI behavior during the reported transition, not forged requests or all stale/in-flight backend operations.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-24. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-25: Three users edit simultaneously.

**Area:** Simultaneous collaboration

**Preconditions:** Fresh copy. A Owner, B/C Editors, tracking off for all. Reassign C to Editor explicitly and wait for reconnect.

**Steps:**

1. Position A after PARALLEL-A, B after PARALLEL-B, and C after PARALLEL-C.
2. On a countdown, type ` A-TC25`, ` B-TC25`, and ` C-TC25` at the respective locations.
3. Compare all three source buffers without refresh; then have A/B type different short tokens at the same position after NEARBY-ANCHOR.
4. Wait for synchronization, compare text/order in every session, refresh each, and compile.

**Expected result:** Every submitted edit survives exactly once. Separate-position and same-position edits converge to identical source/order in all sessions, persist after refresh, and compile without synchronization errors.

**Executed procedure (tester-reported):**

1. With A Owner and B/C Editors, keep all three accounts active in the same document.
2. Have all three type simultaneously and observe convergence, lag, and any missing/corrupted text.
3. Refresh all accounts and compile; record the interaction.

**Actual result:** PASS. A, B, and C actively edited the same document simultaneously. All three could type; changes synchronized with minor real-time lag. No missing or corrupted text was reported. Changes persisted after refresh and LaTeX compilation succeeded. The tester confirms A/B/C actively edited simultaneously, the test passed, and this is the intended recording; no additional recording is required. The recording shows collaborative activity from one editor view rather than three independent browser sessions. Its visible Reviewing/tracked state differs from the original tracking-off fixture and is disclosed as an evidence limitation, without changing PASS. The original same-position token-ordering subcheck was not separately reported; this manual observation is not a deterministic concurrency test.

**Status:** PASS

**Evidence reference:** `recordings/TC-25-three-account-concurrent-editing.webm`. The tester confirms A/B/C edited simultaneously and the test passed. The existing recording is the intended evidence and no additional recording is required. Sampled frames show collaborative activity from one editor view, including labelled lines and cursors, not three independent browser sessions. The visible view includes Reviewing mode/tracked entries, unlike the original tracking-off fixture; this does not change the reported PASS or establish deterministic concurrency safety. All six recordings decode to the end; content review used one-second sampled frames and selected full-resolution frames, not exhaustive playback. Needs privacy review and redaction before public sharing.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-26: Concurrent comments and nearby edits.

**Area:** Simultaneous collaboration

**Preconditions:** Fresh copy. A Owner, B/C Editors, tracking off. All view COMMENT-ANCHOR.

**Steps:**

1. A selects `alpha beta gamma` and prepares unsent comment `A TC-26`.
2. On a countdown, A submits the comment while B inserts ` B-TC26` immediately before COMMENT-ANCHOR and C inserts ` C-TC26` in the following paragraph.
3. Inspect the thread anchor, both edits, and attribution in all sessions without refresh.
4. Refresh B/C, then undo B's edit in B if its undo history remains available; record anchor behavior.

**Expected result:** All edits and the comment survive and converge. The anchor follows the intended selected text, rather than a stale offset or unrelated paragraph. No comment or neighboring edit is lost.

**Executed procedure (tester-reported):**

1. A prepares a comment while B prepares a nearby edit; C observes.
2. Coordinate comment submission and editing, then compare anchor and source across sessions.
3. Refresh and compile to check persistence.

**Actual result:** PASS. A created a comment while B edited nearby text; C observed. The comment remained correctly anchored, edits synchronized, changes persisted after refresh, and compilation succeeded. Execution variant: C observed rather than submitting the additional edit in the original procedure. Undo behavior was not reported.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-26. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-27: Concurrent suggestions.

**Area:** Simultaneous collaboration

**Preconditions:** A is Owner and observer; B and C are Editors and the two active participants, both in Reviewing mode. All three use independent authenticated sessions on the same disposable project. Choose two separate text locations and wait for pending operations to synchronize.

**Steps:**

1. Keep A observing the document. B and C each prepare an insertion containing `and testing` at separate locations.
2. Coordinate B and C submitting their suggestions at approximately the same time.
3. Compare both pending insertion entries and their B/C authorship; check for duplicated or missing suggestions.
4. Refresh the participant sessions and verify persistence; compile the resulting document.
5. Use the existing `recordings/TC-27-concurrent-suggestions.webm` as evidence of the actual test. Its single editor view does not independently display both participant sessions; do not infer a side-by-side recording.

**Expected result:** Both B/C insertion suggestions remain independently attributed and visible, with no duplication or loss. The reported refresh and compilation checks succeed. Manually coordinated timing does not establish all possible operation schedules.

**Executed procedure (tester-confirmed correction):** A observed while B and C concurrently created the separate-location insertions containing `and testing`. The existing recording is from this actual test. The previously recorded participant/text description was inaccurate and is superseded; it is not an additional trial.

**Actual result:** PASS. B and C were the active participants; A was the observer. Both suggestions appeared with correct authors, without duplication or loss, persisted after refreshing, and compilation succeeded according to the tester. Sampled media frames show the B/C-attributed `and testing` insertions from one editor view. Separate participant browser views and the complete refresh/compilation sequence are not independently demonstrated by this recording. The initial expanded overlap/deletion/reject-all variants remain unverified.

**Status:** PASS

**Evidence reference:** `recordings/TC-27-concurrent-suggestions.webm`. Opens/decodes to the end using existing GStreamer tools; content was reviewed using one-second sampled frames and selected full-resolution frames, not exhaustive playback. This is the actual B/C test, shown through one editor view. Needs privacy review and redaction before public sharing.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-28: Two authorized users accept the same suggestion.

**Area:** Simultaneous collaboration

**Preconditions:** A Owner and B Editor, both authorized to accept. C creates one tracked insertion ` C-TC28`; A/B display that same pending suggestion.

**Steps:**

1. Record source and pending suggestion before the race; show A/B side by side in the recording.
2. On a countdown, A and B click Accept for the same suggestion as closely together as possible.
3. Record both visible responses and any sanitized error status; compare A/B/C source and pending entries.
4. Refresh all sessions and compile. Repeat in a fresh copy for a tracked deletion of `delta epsilon`, recording the attempt separately.

**Expected result:** Acceptance occurs once logically: inserted text appears once or deleted text stays removed once, with no pending entry. A duplicate request is a safe no-op or clear conflict; all sessions converge after refresh without data loss.

**Executed procedure (tester-reported):**

1. Create one pending insertion containing `TC28-CONCURRENT-ACCEPT` and show its Accept action in A/B.
2. Coordinate A/B clicking Accept at approximately the same time.
3. Check that the insertion occurs once and its suggestion disappears; refresh and compile.

**Actual result:** PASS. A and B clicked Accept on the same pending insertion `TC28-CONCURRENT-ACCEPT` at approximately the same time. The insertion appeared exactly once, its processed suggestion disappeared, the result persisted after refresh, and compilation succeeded. This was a manually coordinated attempt, not a deterministic race test. The deletion variant and server ordering/duplicate-request behavior from the expanded procedure were not independently established.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-28. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-29: Concurrent accept versus reject.

**Area:** Simultaneous collaboration

**Preconditions:** A Owner and B Editor; C creates one tracked insertion ` C-TC29`. Both authorized actors display the same pending suggestion.

**Steps:**

1. Show A/B side by side and agree on a countdown; A chooses Accept while B chooses Reject for the same suggestion.
2. Trigger both actions together, then wait for synchronization and record responses and final source in A/B/C.
3. Refresh all sessions; confirm the pending entry is gone and compare source again.
4. Repeat on a fresh copy with a C deletion of `delta epsilon`; note each attempt's outcome separately and compile.

**Expected result:** Each attempt settles to one consistent accepted or rejected outcome across sessions. Race ordering need not be predetermined, but no partial/duplicated inverse edit, unrelated text loss, or permanently divergent state is allowed. A losing operation is handled safely.

**Executed procedure (tester-reported):**

1. Create one pending suggestion containing `TC29-CONFLICT-TEST` and show its actions in A/B.
2. Coordinate A clicking Accept and B clicking Reject at approximately the same time.
3. Compare the resulting text in both accounts; refresh and compile. Record the winner of this attempt without assuming a global priority rule.

**Actual result:** PASS. A clicked Accept and B clicked Reject on the same suggestion `TC29-CONFLICT-TEST` at approximately the same time. Reject won this particular attempt. Both accounts displayed the same final result, which remained consistent after refresh; compilation succeeded. This does not imply Reject always takes priority or that all conflict schedules were tested. A C-session comparison and deletion variant were not separately reported.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-29. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.

### TC-30: Editor modifies content while Reviewer comments.

**Area:** Simultaneous collaboration

**Preconditions:** Fresh copy. A Owner, B Editor with tracking off, C Reviewer. All connected and viewing REVIEW-ANCHOR.

**Steps:**

1. C selects `lambda mu nu` and prepares comment `C TC-30 reviewer`.
2. On a countdown, C submits while B inserts ` B-TC30` immediately before REVIEW-ANCHOR; A observes both sessions.
3. B then edits a neighboring sentence while C replies `C TC-30 reply` to the new thread.
4. Compare source, original comment anchor, reply, and roles in all sessions; refresh A/B/C and compile as B.
5. Confirm C still cannot switch to direct editing after this interaction.

**Expected result:** Editor edits and Reviewer comments/replies synchronize and persist without changing roles. The comment follows its intended text, Reviewer capability remains restricted, and the resulting source compiles.

**Executed procedure (tester-reported):**

1. Set B to Editor and C to Reviewer; keep A observing the shared document.
2. Coordinate B editing and C commenting on nearby text.
3. Compare edits, comment anchor, and C's disabled direct-edit UI across accounts; refresh and compile.

**Actual result:** PASS. B was Editor and C was Reviewer. B edited while C commented on nearby text. Edits synchronized across all three accounts, the comment remained correctly anchored, Reviewer editing restrictions remained enforced through the UI, both changes persisted after refresh, and compilation succeeded. A separate subsequent reply from the original expanded procedure was not reported.

**Status:** PASS

**Evidence reference:** Written tester observation only; no dedicated screenshot, recording, log, or test-result artifact was located for TC-30. No placeholder artifact is created.

**Linked issue:** None supplied; no product failure reported for the observed manual scope.


## Automated validation: recorded local results

The existing focused runs used isolated Node 24.22.1, bundled Corepack 0.36.0, Yarn 4.18.0, and focused PnP dependencies with immutable installs enabled. No package manifest, lockfile, or Yarn configuration changed. The original consolidated report, exact commands, structured results, and logs are preserved locally under `~/issue16-evidence/test-results/local-focused-unit-run/`. Their contents are unchanged; this investigation adds `failure-investigation.md` and source-comparison metadata separately. No new test execution or default-mode change occurred while updating this summary.

| Local suite | PASS | FAIL | Outcome |
| --- | --- | --- | --- |
| Web AuthorizationManager | 128 | 0 | PASS |
| Web authorization / collaborator roles / chat | 235 | 7 | FAIL in default log mode |
| Real-time authorization / sockets | 147 | 0 | PASS |
| Mocked document operations | 142 | 0 | PASS |
| Ranges tracker | 15 | 0 | PASS |
| Editor-core operations / rebase | 90 | 0 | PASS |
| Frontend comments / history / realtime | 42 | 0 | PASS exit status, with JSDOM/CodeMirror runtime warnings |
| **Initial total** | **799** | **7** | **806 executed; not all PASS** |
| Additional CollaboratorsController enforce diagnostic | 60 | 0 | PASS with invocation-only `REQ_VALIDATION_MODE=enforce`; repeats existing tests |

All seven failures are malformed-ID / unexpected-field rejection assertions in CollaboratorsController. In default `log` mode, `logOnly` permits raw input and fallback schemas can accept otherwise invalid bodies: four promise-rejection checks instead fulfill, one callback-waiting test times out, another body check fulfills, and one malformed ID reaches BSON conversion instead of producing InvalidParamsError. With `enforce`, primary validation rejects before handlers run, and all 60 controller tests pass. The test file, its bootstrap/config, and the inspected CI workflows do not set the mode; the assertions implicitly expect enforcement. CI's selected Web suites do not currently include this controller test file.

**Classification remains provisional:** seven configuration-dependent failures, pending final maintainer classification. Evidence supports an existing test-versus-rollout-policy mismatch, not an Issue #16 code regression. The tested HEAD equals the original staging base `1ff3043ca34eaa2c24767fe8c42658acfdc25d09`. Live staging is now `ef2bb8a2640fd293fc07c4828300d623b3c70519`; read-only blob comparisons found identical controller, test, parseReq, and lockfile content, while CI differs. This is not a live-staging runtime rerun; no baseline checkout/dependency tree was created. See local `failure-investigation.md` and `current-staging-comparison.json` for exact assertions, explanations, and comparison limits.

Frontend logs contain `TypeError: textRange(...).getClientRects is not a function` from JSDOM/CodeMirror despite 42 passing assertions and exit 0. Browser geometry is not established. Existing peer-version and deprecation warnings remain in the logs; no dependency changes were made to suppress them.

Cypress component tests, database-backed acceptance tests, and GitHub **Build and check** have **not executed**. Mocked units do not establish complete backend authorization, real multi-service synchronization, or deterministic race safety. All **30 tester-reported manual PASS statuses remain unchanged** and are separate from the automated counts.

## Minimum regression checks before submission

The table distinguishes manual coverage, recorded local unit results, and outstanding checks. No new tests, deployment checks, or GitHub workflows ran during this documentation update; the existing local results are preserved above.

| Check | Procedure / coverage | Current coverage | Evidence / issue |
| --- | --- | --- | --- |
| Login | A/B/C can sign in independently through normal authorized login; no shared identity/session | Not separately recorded | Three authenticated sessions reported; standalone login regression not documented |
| Project opening | All three can open the disposable project/main.tex with correct roles | Manual coverage reported | TC-18/TC-23; no dedicated artifact |
| Compilation | Baseline compiles; repeat after mixed suggestions and simultaneous edits (TC-16, TC-25, TC-28–TC-30) | Manual success reported | TC-08, TC-15/TC-16, TC-25–TC-30 where applicable |
| Comments | TC-01–TC-08, including replies, resolution, reload, deletion, and concurrency | Manual PASS, scoped | TC-01–TC-08; history/reopening/undo limits remain |
| Track Changes | TC-09–TC-16; insertion/deletion, accept/reject, mixed actions, persistence | Manual PASS, scoped | TC-09–TC-16; executed variants recorded |
| Reviewer permissions | TC-17–TC-24 and TC-30, UI scope only; backend authorization remains a separate unexecuted check | UI PASS only | TC-17–TC-24/TC-30; backend NOT RUN |
| Simultaneous editing | TC-25–TC-30; identical source/ranges after synchronization and refresh | Manual PASS, sampled | TC-25–TC-30; minor lag TC-25; no deterministic schedule coverage |
| Relevant automated tests | Existing focused local units; exact commands in preserved report | Initial 799 PASS / 7 FAIL; diagnostic 60 PASS | `~/issue16-evidence/test-results/local-focused-unit-run/`; classification pending |
| GitHub required workflow | `Server image` workflow, `.github/workflows/pi-image.yml`, job `Build and check`, on the exact PR revision | NOT RUN | Not recorded |
| Post-merge institute verification | Rerun affected cases on the confirmed deployed revision and attach sanitized evidence | NOT RUN | Not recorded |

### Relevant automated commands and remaining coverage

The preserved report records the exact subset already executed using Node 24.22.1 and Yarn 4.18.0. The broader example commands below are not claims of full-suite execution. Parser generation produced only ignored build artifacts; Cypress execution remains deferred. Full application TypeScript checking has an existing baseline; use `.github/workflows/ci.yml`'s changed-file comparison rather than claiming all baseline errors are regressions. Some legacy package scripts refer to absent `bin` runners; the direct commands below avoid those runners.

From `services/web` in this worktree:

```bash
yarn vitest run --project=Parallel \
  test/unit/src/Authorization \
  test/unit/src/Collaborators \
  test/unit/src/Chat \
  test/unit/src/DocumentUpdater \
  test/unit/src/Project/ProjectEditorHandler.test.mjs

NODE_ENV=test TZ=GMT yarn mocha --timeout 5000 --exit \
  --extension js,jsx,mjs,ts,tsx \
  --require test/frontend/bootstrap.js \
  test/frontend/features/source-editor/extensions/changes/comments.test.ts \
  test/frontend/features/source-editor/extensions/history-ot.test.ts \
  test/frontend/features/source-editor/extensions/realtime.test.ts \
  test/frontend/features/review-panel/utils/snapshot-ranges.test.ts

yarn run cypress:run-ct \
  --spec 'test/frontend/features/review-panel/review-panel.spec.tsx,test/frontend/features/review-panel/deep-link.spec.tsx'
```

From the worktree root, include service/range unit tests when the corresponding behavior changes:

```bash
yarn workspace @overleaf/document-updater run test:unit
yarn workspace @overleaf/real-time run test:unit --run
yarn workspace @overleaf/ranges-tracker run test:unit
yarn workspace overleaf-editor-core run test:unit
```

The chat package's unit script targets an absent `test/unit/js` directory; executed web Chat wrapper units do not substitute for the chat service acceptance tests.

Integration suites worth running in a separately configured **disposable local test environment** include `services/chat/test/acceptance/js/`, `services/document-updater/test/acceptance/js/RangesTests.js`, `ApplyingUpdatesToADocTests.js`, and `services/real-time/test/acceptance/js/ApplyUpdateTests.js`. They need local service/database dependencies; chat/document-updater test hooks run migrations. Never point them at the institute deployment or existing user databases. Configuring/running these is outside this preparation task.

The `Build and check` job builds the server image, checks deployment scripts/templates, and performs login/project/compile/download/sandbox smoke checks. It does not replace this multi-user checklist. Inspect its actual outcome: the current workflow has a repository-visibility condition that can skip the build job for private repositories; a skipped check is not execution evidence. The separate `CI` workflow is manually dispatched and currently runs selected suites rather than all collaboration tests. Do not dispatch workflows, publish images, or access deployment services during preparation.

## Known limitations and investigation targets

- All 30 manual UI cases are recorded from tester observations, including Reviewer and concurrency results. TC-06/TC-07 are confirmed by the tester, with the evidence/coverage limitations recorded in their results. Deployed revision, browser versions, and document-operation type remain unrecorded; sampled media inspection does not supply those metadata or establish exhaustive playback coverage; no runtime defect is established by these notes.
- There are two operation paths. Legacy acceptance uses HTTP and tracked ranges; history-OT acceptance/rejection uses document operations. A result for one type cannot stand in for the other.
- Source inspection found broad read-access middleware on collaboration mutation routes, while frontend permissions are stricter. TC-22 establishes UI restrictions only, including permitted own-suggestion withdrawal; backend enforcement remains untested; do not claim this is already a reproduced defect.
- Source inspection also found a frontend own-message deletion URL without a matching route, unused thread ownership middleware, and possible Reviewer comment-state permission mismatches. These are follow-up candidates, not executed outcomes; they do not add or renumber the owner's 30 cases.
- Comment messages and anchors persist separately. Broadcast/persistence ordering and failures can cause inconsistent views; refresh checks are necessary but do not replace an explicitly authorized durability/restart test. No service restart is part of this plan.
- TC-25 used three active accounts and showed minor synchronization lag without reported text loss/corruption. TC-27 used B/C near-simultaneous suggestions with A observing; TC-28/TC-29 were manually coordinated attempts. These sample interleavings, not deterministic concurrency correctness. Reject won TC-29 once; no general priority or all-ordering claim is supported.
- TC-08 reports that a comment remains visible and navigates to the former text location after anchor-text deletion and refresh. Undo/redo restoration, detached-state labeling, and cut/paste behavior remain unverified; do not generalize beyond the reported flow.
- Existing component tests mock networking and do not prove complete multi-user synchronization or backend authorization.
- Keep test-server documentation current: `deploy/server/README.md` describes the institute server; parts of `deploy/pi/README.md` and older deployment timing descriptions are historical. Do not equate staging HEAD with the deployed image.

## Final evidence audit and acceptance gaps

Artifact presence and filenames were inspected directly on disk; SHA-256 hashes confirm all original evidence bytes are preserved. All 14 screenshots were visually inspected. Existing GStreamer tools decoded all six recordings to the end; visual review used one-second sampled frames and selected full-resolution frames, not exhaustive playback or a guarantee against brief exposures between samples. The following associations reflect tester reports and existing case-index mappings. Four screenshot basenames begin with a literal tab, displayed as `<TAB>` here and preserved literally in the CSV. No evidence was renamed, overwritten, deleted, or synthesized.

| Test | Result | Evidence type | Actual local path(s), relative to `~/issue16-evidence/` | Inspection / limitation |
| --- | --- | --- | --- | --- |
| TC-01 | PASS (manual scope) | Screenshot(s) | `screenshots/TC-01-owner-comment.png` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-02 | PASS (manual scope) | Screenshot(s) | `screenshots/TC-02-editor-sees-comment.png`; `screenshots/<TAB>TC-02-third-user-sees-comment.png` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-03 | PASS (manual scope) | Screenshot(s) | `screenshots/TC-03-B-replies-to-A.png`; `screenshots/<TAB>TC-03-A-sees-B-reply.png`; `screenshots/<TAB>TC-03-C-sees-B-reply.png` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-04 | PASS (manual scope) | Video | `recordings/TC-04-comment-resolution.webm` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-05 | PASS (manual scope) | Written observation | None located | No screenshots or dedicated recording; active-panel persistence only, not resolved history. |
| TC-06 | PASS (manual scope) | Screenshot(s) | `screenshots/TC-06-A-all-comments.png`; `screenshots/TC-06-B-all-comments.png`; `screenshots/TC-06-C-all-comments.png` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-07 | PASS (manual scope) | Screenshot(s) | `screenshots/TC-07-C-concurrent-replies.png` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-08 | PASS (manual scope) | Video | `recordings/TC-08-comment-after-text-deletion.webm` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-09 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-10 | PASS (manual scope) | Screenshot(s) | `screenshots/<TAB>TC-10-A-suggested-insertion.png`; `screenshots/TC-10-B-sees-insertion.png` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-11 | PASS (manual scope) | Screenshot(s) | `screenshots/TC-11-A-suggested-deletion.png`; `screenshots/TC-11-B-sees-deletion.png` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-12 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-13 | PASS (manual scope) | Video | `recordings/TC-13-accept-suggestion.webm` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-14 | PASS (manual scope) | Video | `recordings/TC-14-reject-suggestion.webm` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-15 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-16 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-17 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-18 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-19 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-20 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-21 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-22 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-23 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-24 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-25 | PASS (manual scope) | Video | `recordings/TC-25-three-account-concurrent-editing.webm` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-26 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-27 | PASS (manual scope) | Video | `recordings/TC-27-concurrent-suggestions.webm` | Visually reviewed screenshot(s) or sampled video frames; needs privacy review/redaction; see case-specific limits. |
| TC-28 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-29 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |
| TC-30 | PASS (manual scope) | Written observation | None located | Manual report only; no dedicated artifact. |

TC-25 and TC-27 recordings were located as `.webm`, rather than the anticipated `.mp4`; actual filenames are preserved. TC-04 demonstrates local resolution only; cross-account synchronization remains tester-reported. TC-08 contains a two-session side-by-side segment in its later portion, providing the requested visual format but not a complete three-account action sequence. TC-25 shows one editor view; the tester confirms all three accounts actively edited simultaneously, the recording is the intended evidence, and no additional recording is required. TC-27 is the actual test with A observing and B/C creating `and testing` suggestions, visible from one editor view rather than both participant sessions. These evidence limitations do not change any tester-reported PASS.

**Privacy classification: all 20 originals need privacy review and redaction before public sharing.** Visible account identifiers require neutral A/B/C labels; a transient service hostname is visible in TC-14. No sensitive values are reproduced here. No email addresses, tokens, cookies, or session identifiers were observed in the reviewed images/frames, but sampled review cannot certify their absence between samples. The document content appears to be a testing fixture. Retain originals unchanged; no redaction, renaming, upload, or replacement was performed. A final review of approved redacted copies is still needed before publication. No further TC-25 capture is requested.

Other outstanding items: actual execution dates/times, browser/OS versions, deployed SHA and provenance, document-operation type, unexecuted expanded procedure variants, resolved-comment history, backend request/socket authorization checks, deterministic concurrency tests, remaining automated regressions and classification of the seven default-mode failures, `Build and check` on the eventual PR revision, and post-merge verification. No bug issue links were supplied or created; untested safeguards remain investigation targets, not reproduced defects. The manual passes alone do not close Issue #16 or establish parent Issue #15 completion.

## Final acceptance summary

| Measure | Current reported result |
| --- | --- |
| Total planned test cases | 30 |
| PASS | 30 (TC-01–TC-30, tester-reported manual UI scope) |
| FAIL | 0 |
| BLOCKED | 0 |
| NOT RUN | 0 manual case statuses; separate follow-up checks remain unexecuted |
| Browser/session matrix completed | No |
| Deployed revision / operation type established | No |
| Side-by-side recording | TC-08 includes two sessions side by side; TC-25/TC-27 show one editor view. Final public-evidence approval awaits privacy review/redaction; no additional TC-25 recording required |
| Manual failure screenshots and linked issues | No manual failure or bug issue reported; seven automated failures are documented separately above |
| Focused local automated units | Initial 799 PASS / 7 FAIL; additional enforce-mode diagnostic 60 PASS; classification pending |
| Cypress / database-backed acceptance / Build and check | NOT RUN |
| Acceptance decision | READY FOR DOCUMENTATION REVIEW; issue acceptance remains pending privacy review/redaction, environment metadata, and required checks; no additional TC-25 recording required |
| Reviewer / date | Not recorded |

All 30 cases are reported PASS on the institute test server in the observed manual scope. Before requesting final issue acceptance, verify the recorded deployment/environment and evidence coverage, and disclose unexecuted expanded subchecks; manual status totals do not establish those checks. Disclose any BLOCKED/NOT RUN items and coverage limitations; do not count them as passes. Attach the sanitized two-browser review-session recording and failure evidence. Follow `CONTRIBUTING.md` for maintainer review, PR checks, and post-merge verification; preparation alone does not close Issue #16.
