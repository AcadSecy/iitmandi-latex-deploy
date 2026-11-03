# ZIP export/import portability report — Issue #45

## 1. Purpose and scope

I tested ZIP export/import, compilation, and error handling with a disposable
project on IIT Mandi LaTeX on 31 October 2026. This report records my results for
Issue #45 and PR #59 on branch `test/zip-portability-45`, together with subsequent
local artifact checks and verifier regression tests. It changes only testing
documentation and helpers; maintainer acceptance remains pending.

ZIP integrity and portability checks passed for this fixture. Remaining coverage
and acceptance status are listed under
[Remaining Acceptance Tests](#remaining-acceptance-tests).
These results do not establish that all projects, compilers, or deployment
configurations behave identically.

### Independent merge scope

I am submitting PR #59 only for portability documentation, verification scripts,
regression tests, and sanitized evidence under `doc/testing/`. No application
authorization, sharing, source ZIP endpoints, or deployment logic has been
modified. This limited scope allows the PR to be considered for independent
merge, subject to maintainer review and approval, without waiting for the
separate security fix.

I have now submitted the access-control vulnerability through GitHub's private
vulnerability reporting workflow. Merging this PR does not fix that vulnerability
or satisfy all Issue #45 acceptance criteria. Permission-related remediation and
retesting require private coordination with the maintainers. Collaborator-specific
permissions, cancellation during an active upload, and deployment verification
remain pending; the deployed release/image commit must be captured on the next
authorized verification run. Issue #45 should remain open until the remaining
acceptance criteria are met.

## 2. Test environment

| Item | Recorded environment or limitation |
| --- | --- |
| Application | Institute self-hosted IIT Mandi LaTeX platform, based on Overleaf Community Edition |
| Test data | Disposable 10-file project; no production project content |
| Initial test date | 31 October 2026; my browser test session |
| Local OS | Ubuntu 24.04, as used for testing; `/etc/os-release` during the final local review reports Ubuntu 24.04.4 LTS. This is not the server OS. |
| Browser | Firefox; version **Not independently recorded** |
| Observed import settings | Root `chapters/main.tex`, compiler pdfLaTeX; automatic selection is my browser observation |
| Bibliography | BibTeX fixture; the later logs show a prepared `output.bbl` being read, not a captured BibTeX run |
| Local verification tools | Python 3.12.3; Poppler `pdfinfo` and `pdftotext` 24.02.0. These are review-tool versions, not proof of the initial session's tool versions. |
| Later recompilation logs | 2 November 2026; pdfTeX 3.141592653-2.6-1.40.29, TeX Live 2026, preloaded `pdflatex 2026.10.29` |
| Deployed server release/image commit and OS | **Not independently recorded**; the local Git revision does not establish the deployed version |
| Original-session environment details | Exact browser version, original compiler/tool versions, and session times **Not independently recorded** |
| External workspace | `~/zip-verification-work/`; raw ZIPs, PDFs, text extracts, and logs stay outside the repository |

I used the platform to export, import, and compile the disposable project. The
saved artifacts were subsequently checked locally using the reproducible commands
linked below; those checks did not access the application. The logs downloaded
after the authorized 2 November recompilations are separate evidence from the
original 31 October sessions.

## 3. Fixture description

I used a 10-file fixture with these exact, case-sensitive relative paths, recorded
in the baseline manifest:

```text
README.txt
chapters/introduction.tex
chapters/main.tex
data files/notes with spaces.txt
data files/नमस्ते-notes.txt
images/figure.png
images/included-figure.pdf
references/sources.bib
styles/custom.cls
styles/custom.sty
```

The fixture covers nested directories, spaces and Unicode in filenames, PNG and
PDF assets, a BibTeX bibliography, and custom class/style files. The main document
loads the nested TeX source, both figures, the bibliography citation, and the
`CUSTOM-STYLE-LOADED` marker. The files under `data files/` test path and byte
preservation; their text is not included in the compiled PDF.

[generate_zip_fixture.py](generate_zip_fixture.py) creates the fixture and a
baseline containing each file's relative path, byte count, and SHA-256 digest.
The manifest is outside
the fixture and must not be included in the upload archive. The generator refuses
to overwrite an existing fixture or baseline. Both repository helpers require an
explicit workspace argument and use exclusive creation for their output files.
The included copies are adapted for workspace selection and overwrite protection;
fixture contents and export comparison rules are unchanged from the external
scripts used for the recorded run. Neither helper makes network requests or
extracts archive members to disk.

## 4. Reproduction checklist

Use only disposable projects and accounts authorized for testing. Keep artifacts,
logs, and screenshots outside the checkout. Do not put project URLs, account
identifiers, tokens, or deployment addresses in a public report.

The checklist below describes how to repeat the tests. Unchecked boxes are for a
future run; the completed run's results are recorded in sections 5 and 6.

- [ ] Record the deployed image/commit, browser/OS, TeX Live version, compiler,
  root document, relevant sharing configuration, test time, and local tool
  versions. Record sensitive configuration privately.
- [ ] From the repository root, run the included helpers with Python 3. Use a
  fresh temporary workspace so prior evidence stays intact. Keep `ZIP_WORK` set
  in the same shell for the remaining commands. The scripts may also be invoked
  by absolute path from another directory; their workspace argument, rather than
  the script location or current directory, determines all artifact paths.

  ```bash
  ZIP_WORK=$(mktemp -d "${TMPDIR:-/tmp}/zip-portability-45.XXXXXX")
  python3 doc/testing/generate_zip_fixture.py "$ZIP_WORK"
  python3 - "$ZIP_WORK" <<'PY'
  import sys
  import zipfile
  from pathlib import Path

  base = Path(sys.argv[1])
  fixture = base / "zip-portability-test"
  with zipfile.ZipFile(base / "fixture-upload.zip", "x", zipfile.ZIP_DEFLATED) as archive:
      for source in sorted(fixture.rglob("*")):
          if source.is_file():
              archive.write(source, source.relative_to(fixture).as_posix())
  PY
  ```

  Inspect the archive paths before uploading. They must match the manifest
  exactly, with no enclosing `zip-portability-test/` directory or baseline file.

- [ ] Upload `fixture-upload.zip` to a disposable original project. Verify the
  file tree, set `chapters/main.tex` and pdfLaTeX if necessary for this initial
  project, and compile until the bibliography resolves. Record errors, warnings,
  and the final settings. Save the compiled PDF as `evidence/original.pdf`.
- [ ] Download the original project's **source ZIP** independently three times.
  Keep the source unchanged between downloads. Save the downloads as
  `source-export-1.zip`, `source-export-2.zip`, and `source-export-3.zip` in
  `ZIP_WORK`. Do not use a compiled-PDF download as a source export.
- [ ] From the repository root, run
  `python3 doc/testing/verify_exports.py "$ZIP_WORK"`. Review its printed counts
  and `$ZIP_WORK/evidence/export-verification.json`; require all three exports to
  pass. It compares uncompressed file bytes by SHA-256 and size, checks exact
  path sets,
  ignores directory entries, and detects duplicate file paths. Whole-ZIP hashes
  are not the acceptance criterion because container metadata may differ.
  The verifier exits with status 0 only when all three exports pass, and status 1
  for failed verification. It refuses to replace an existing result JSON; use a
  fresh workspace for another run, including after a failed verification.
- [ ] Import `source-export-1.zip` into a fresh project. Before making settings
  changes, record the automatically selected root document and compiler. If
  restoration is needed, record it explicitly rather than reporting automatic
  portability. Compile and save `evidence/roundtrip.pdf`.
- [ ] Download that project's source ZIP as `roundtrip-export.zip`. Compare it
  with the baseline using the read-only check below, retaining the output outside
  the checkout. Require 10 file entries and 10 identical files, with no missing,
  extra, modified, or duplicate paths.

  ```bash
  python3 - "$ZIP_WORK" <<'PY'
  import hashlib
  import json
  import sys
  import zipfile
  from collections import Counter
  from pathlib import Path

  base = Path(sys.argv[1])
  manifest = json.loads((base / "evidence/baseline-manifest.json").read_text())
  expected = {f["path"]: (f["sha256"], f["size_bytes"]) for f in manifest["files"]}
  with zipfile.ZipFile(base / "roundtrip-export.zip") as archive:
      entries = [entry for entry in archive.infolist() if not entry.is_dir()]
      counts = Counter(entry.filename for entry in entries)
      actual = {}
      for entry in entries:
          data = archive.read(entry)
          actual[entry.filename] = (hashlib.sha256(data).hexdigest(), len(data))
  missing = sorted(expected.keys() - actual.keys())
  extra = sorted(actual.keys() - expected.keys())
  modified = sorted(p for p in expected.keys() & actual.keys() if expected[p] != actual[p])
  duplicates = sorted(p for p, count in counts.items() if count > 1)
  identical = sum(expected[p] == actual[p] for p in expected.keys() & actual.keys())
  passed = not (missing or extra or modified or duplicates)
  print(json.dumps({
      "expected_files": len(expected), "actual_files": len(entries),
      "identical_files": identical, "missing": missing, "extra": extra,
      "modified": modified, "duplicates": duplicates,
      "status": "PASS" if passed else "FAIL",
  }, indent=2, ensure_ascii=False))
  raise SystemExit(0 if passed else 1)
  PY
  ```

- [ ] Compare PDF page counts and extracted text:

  ```bash
  pdfinfo "$ZIP_WORK/evidence/original.pdf"
  pdfinfo "$ZIP_WORK/evidence/roundtrip.pdf"
  pdftotext -layout "$ZIP_WORK/evidence/original.pdf" "$ZIP_WORK/evidence/original.txt"
  pdftotext -layout "$ZIP_WORK/evidence/roundtrip.pdf" "$ZIP_WORK/evidence/roundtrip.txt"
  diff -u "$ZIP_WORK/evidence/original.txt" "$ZIP_WORK/evidence/roundtrip.txt"
  ```

  Visually inspect both PDFs for the PNG and included PDF graphic. Confirm the
  resolved citation, nested-source text, and custom-style marker. Compare compile
  logs and retain sanitized error/warning counts. Do not require identical binary
  PDF hashes: generated metadata can differ.

- [ ] Repeat the error-handling cases in section 6, recording each outcome.
- [ ] Coordinate permission acceptance privately with the maintainer. Authorized
  collaborator-specific behavior remains a separate unvalidated criterion; do
  not mark it passed based on owner-only portability tests.

## 5. Verification results

I downloaded three source ZIPs from the original project, then imported the first
ZIP into a fresh project and exported its source again. The table records the
results of that run.

“Verified” means a result can be reproduced from the retained artifacts using the
linked commands. “Observed” means a result from my browser session without an
independent settings capture or original-session log.

The [retained archive verification record](evidence/archive-verification.md)
captures a reproducible local recheck of all four original ZIPs, including each
archive's SHA-256, exact file counts, discrepancy lists, and command exit status.
It strengthens the file-integrity evidence without establishing browser actions
or application settings independently.

The [PDF verification record](evidence/pdf-verification.md) provides reproducible
`pdfinfo`, `pdftotext -layout`, and text-comparison checks with sanitized captured
output and exit codes. Both PDFs have two pages, and their extracted text matches
exactly, including the title, content marker, bibliography citation, and
custom-style marker. These artifact checks do not establish graphical rendering,
automatic settings selection, or compilation error/warning counts.

The [compilation verification record](evidence/compilation-verification.md)
analyzes retained logs from the later 2 November recompilations. Both show
successful two-page PDF output, zero error diagnostics, two matching LaTeX
warnings, figure inclusion, and bibliography-file loading. These logs support
the later runs, not the original 31 October session counts or automatic import
settings.

| Check | Result | Evidence and qualification |
| --- | --- | --- |
| Fixture baseline | PASS, verified | 10 source files match baseline paths, sizes, and SHA-256 digests |
| Source export 1 | PASS, verified | 10/10 identical; no missing, extra, modified, or duplicate file paths |
| Source export 2 | PASS, verified | Same checks passed independently |
| Source export 3 | PASS, verified | Same checks passed independently |
| Imported project's source export | PASS, verified | Expected 10; actual 10; identical 10; missing 0; extra 0; modified 0; duplicate paths 0 |
| Imported root/compiler selection | PASS, observed | I observed `chapters/main.tex` and pdfLaTeX selected automatically; no manual restoration was required |
| Original 31 October compilation | PASS, observed | I compiled both projects successfully; the UI showed 0 errors and 2 warnings each. Original-session logs are unavailable. |
| Later 2 November recompilation | PASS, verified | Both logs report 2-page PDF output, 0 recognized error diagnostics, and 2 matching LaTeX warnings; these are not UI-counter measurements |
| PDF pagination | PASS, verified | Original 2 pages; imported 2 pages; checked with `pdfinfo` |
| PDF extracted text | PASS, verified | Fresh `pdftotext -layout` output is identical for both PDFs and matches the saved text files |
| Bibliography and custom-style marker | PASS, verified | Resolved `[1]` citation, bibliography entry, and `CUSTOM-STYLE-LOADED` occur in both PDF text extracts |
| PNG and included PDF graphic rendered | PASS, observed | I saw both graphics in the output. Later logs also support inclusion; neither text extraction nor log entries prove visual correctness. |
| Permissions | DID NOT PASS | See [Remaining Acceptance Tests](#remaining-acceptance-tests) for status and required scope |

I observed the same two warnings in the original compilations, related to custom
class/style loading. Original-session logs remain unavailable. The later retained
logs independently show two warnings about the class/package name `styles/custom`
providing `custom`, with no error diagnostics and successful output. They do not
independently establish the original sessions' counts or the application UI
warning counter. The baseline's root/compiler fields document intended settings;
the later logs show `**main.tex` and a pdfLaTeX format, but neither proves automatic
selection of the project root `chapters/main.tex` or compiler after import.

## 6. Error-handling tests

I tested the following error-handling cases. These outcomes are my observations
from the browser session. The saved invalid fixture is plain UTF-8 text rather
than a ZIP, and the saved empty fixture is a valid ZIP with zero entries; their
structure was checked locally. No retained UI record independently verifies the
application's responses.

| Case | Reported result |
| --- | --- |
| Import plain text with a `.zip` extension | Rejected |
| Import a valid but empty ZIP | Rejected |
| Cancel the import dialog before upload | Worked |
| Retry the invalid ZIP | Rejected again |
| Import a valid ZIP after an invalid ZIP | Succeeded without refreshing |
| Import using an existing project name | Created a separate project |
| Check the older project with that duplicate name | Remained intact and compiled successfully |

I tested cancellation before upload, but **did not test cancellation during an
active upload**. The dialog cancellation result does not cover upload
interruption.

For a repeat run, create fresh invalid and empty fixtures outside the checkout:

```bash
python3 - "$ZIP_WORK" <<'PY'
import sys
import zipfile
from pathlib import Path

base = Path(sys.argv[1])
with (base / "invalid-test.zip").open("x", encoding="utf-8") as output:
    output.write("This is plain text, not a ZIP archive.\n")
with zipfile.ZipFile(base / "empty-test.zip", "x"):
    pass
PY
```

Use disposable projects for the duplicate-name case and record the older
project's content and compilation result before and after import.

### Verification-script regression tests

[test_zip_verification.py](test_zip_verification.py) checks the Python verifier
itself. These automated tests use temporary workspaces, synthetic source
files, and subprocess calls to the existing `verify_exports.py WORKSPACE` CLI.
They do not access the deployed application or any retained original archive.
They do not establish how the web application's ZIP importer handles bad input.

The nine tests cover:

- Valid exports passing with process exit status 0.
- A missing expected file.
- An unexpected extra file.
- Modified contents with the original byte count, requiring a digest check.
- A duplicate entry with the same path and contents.
- Plain text presented as a ZIP archive.
- A structurally recognizable `.zip` with a corrupted compressed payload.
- A failed middle export returning status 1 even when the other two pass.
- A changed relative path with unchanged contents.

Each failing case asserts process exit status 1, an overall FAIL, an appropriate
diagnostic without a traceback, and a result JSON that marks only the affected
export as failed. The original checks and CLI remain unchanged. The corruption
test initially exposed an uncaught `zlib.error`; the verifier's existing ZIP-error
handler now catches that exception and records FAIL while checking the remaining
exports.

Run from the repository root:

```bash
python3 -m unittest discover -s doc/testing -p 'test_zip_verification.py' -v
python3 -m py_compile \
  doc/testing/generate_zip_fixture.py \
  doc/testing/verify_exports.py \
  doc/testing/test_zip_verification.py
git diff --check
git status --short
```

### Final local validation

The commands above and the three linked evidence procedures were rerun locally
on 3 November 2026. All recorded archive, PDF, and compilation outputs matched
the fresh outputs exactly. These are local checks, not new browser tests.

| Check | Actual result | Exit status |
| --- | --- | --- |
| Unittest command above | 9 tests passed; all failure cases returned verifier status 1 as expected | 0 |
| `py_compile` command above | No output; all three Python files compiled | 0 |
| Archive evidence command | All four retained archives passed; captured output reproduced exactly | 0 |
| PDF evidence command | Both PDFs have 2 pages; fresh text and marker checks passed; captured output reproduced exactly | 0 |
| Compilation-log analysis | Both later logs passed; captured output reproduced exactly | 0 |
| Real-archive verifier CLI batches | Both batches passed, including the round-trip export | 0 |
| JSON evidence and Markdown links | Three JSON files match the external originals; file and heading links resolve | 0 |
| `git diff --check` | No output | 0 |

Unittest output excerpt from this review:

```text
Ran 9 tests in 0.320s

OK
```

The final review also checked fixture generation and ZIP packaging in a fresh
temporary workspace: all ten paths, sizes, and SHA-256 values matched the recorded
baseline. Repeat generator/verifier invocations refused existing outputs with
status 1. Python bytecode was directed to a temporary cache during the review.
External archive, PDF, text, and log hashes, sizes, and modification times were
checked before and after; no originals changed. No deployment or permission test
was performed.

The verifier CLI was also checked against the real archives using two fresh
workspaces, with read-only symlinks to the originals and the baseline. The first
batch checked the three source exports. The second checked source exports 1 and
2 plus the round-trip export, mapped to the third expected input name only inside
that temporary workspace. Both batches must pass, and result JSON stays in the
temporary workspaces. The separate four-archive procedure checks each original
by its retained filename and records its whole-archive digest.

## 7. Permissions finding and limitation

ZIP integrity results do not establish correct access control. The permission
acceptance status and follow-up requirements are recorded under
[Remaining Acceptance Tests](#remaining-acceptance-tests).

Security details must remain private. This report does not include project URLs,
account identifiers, affected endpoints, reproduction instructions, or screenshots
of the access-control concern. Further permission-related testing requires
maintainer-approved scope.

## 8. Evidence inventory

The contribution includes the helper scripts
[generate_zip_fixture.py](generate_zip_fixture.py) and
[verify_exports.py](verify_exports.py), and the regression suite
[test_zip_verification.py](test_zip_verification.py). They contain no credentials,
private project URLs, tokens, or deployment addresses. Their workspace and overwrite
safeguards were checked locally using disposable temporary files. These helper
checks are separate from the platform's export/import test.

The minimal repository evidence package contains unchanged copies of three
reviewed JSON files. Their contents are limited to disposable fixture paths,
file sizes, SHA-256 digests, intended settings, and recorded verification results;
they contain no credentials, access tokens, private URLs, account identifiers, or
deployment-specific information.

| Repository evidence | Purpose |
| --- | --- |
| [baseline-manifest.json](evidence/baseline-manifest.json) | Intended root/compiler; paths, byte counts, and SHA-256 digests for the 10-file baseline |
| [export-verification.json](evidence/export-verification.json) | Records `export_1`, `export_2`, and `export_3` as `PASS` |
| [roundtrip-verification.json](evidence/roundtrip-verification.json) | Records expected/actual/identical counts of 10, empty discrepancy lists, and `PASS` |
| [archive-verification.md](evidence/archive-verification.md) | Exact verification command and captured output for all four retained ZIPs, with archive hashes, comparison counts, and exit-status confirmation |
| [pdf-verification.md](evidence/pdf-verification.md) | Reproducible PDF page-count, extracted-text, and marker checks with sanitized output and exit codes; compilation-log and settings limitations |
| [compilation-verification.md](evidence/compilation-verification.md) | Sanitized reproducible analysis of later recompilation logs: versions, successful output, warnings/errors, figures, bibliography loading, and provenance limitations |

These JSON files demonstrate the recorded file-integrity results. They are a
baseline and result summaries, not the raw exported contents or independent
proof of browser interactions, imported settings, or compilation. The local
archive checks described in section 5 used artifacts retained outside the
repository. Browser interactions and compilation settings remain my reported
observations unless separately supported by retained evidence. The baseline's
intended settings do not establish what the application selected automatically.

The remaining artifact paths below are relative to the external workspace
`~/zip-verification-work/` and are not included in this contribution. The original
external helper scripts were inspected before their adapted copies were added
beside this report.

| Evidence | Purpose |
| --- | --- |
| `zip-portability-test/` | Original source fixture; independently matched against the manifest |
| `fixture-upload.zip` | Initial upload archive; independently matched against the manifest |
| `source-export-1.zip`, `source-export-2.zip`, `source-export-3.zip` | Independently checked source exports |
| `roundtrip-export.zip` | Imported project's source export; independently matched against the baseline |
| `evidence/original.pdf`, `evidence/roundtrip.pdf` | Saved output PDFs used for page-count and text-extraction checks |
| `evidence/original.txt`, `evidence/roundtrip.txt` | Identical saved PDF text; independently reproduced from the PDFs |
| `invalid-test.zip`, `empty-test.zip` | Error-handling input fixtures; structure independently checked |
| `evidence/compile-logs/original-output.log`, `evidence/compile-logs/roundtrip-output.log` | Later authorized recompilations; raw logs retained privately outside the repository |

The archive filenames identify the roles I recorded during testing; matching
contents alone do not authenticate the browser sequence or project of origin.
Later recompilation logs are now retained, but the original-session logs and
application settings capture remain unavailable. The complete original
environment record is also missing. Automatic selection of `chapters/main.tex`
and pdfLaTeX remains my observation; the baseline and PDF metadata do not prove
that selection. I can provide sanitized screenshots of portability testing
separately after checking them for sensitive content. Security-finding
screenshots or demonstrations must not be shared publicly.
Only Markdown reports, the two helper scripts, the regression suite, and three
JSON evidence files are included. ZIPs, PDFs, raw logs, screenshots, private
identifiers, and credentials remain outside the contribution.

## 9. Final status and remaining acceptance criteria

- **Passed:** ZIP integrity and portability for the specified fixture, including
  all three original exports, the imported project's export, equal PDF page
  counts, and identical extracted PDF text.
- **Verified for the later recompilations:** successful two-page output, zero
  logged error diagnostics, two matching LaTeX warnings, and figure/bibliography
  loading. These results do not replace original-session evidence.
- **Reported successful, with evidence limitations:** automatic root/compiler
  selection without restoration, original-session UI compilation counts and
  warning equivalence,
  graphic rendering, and the error-handling interactions described above.
- **Verifier regression checks:** all nine local tests passed. These test the
  verification script, not the web application's import/export behavior.

### Remaining Acceptance Tests

| Acceptance test | Status | Coverage and required follow-up |
| --- | --- | --- |
| Authorized collaborator access | **NOT VALIDATED** | I did not separately test the owner-to-invited-collaborator workflow. This requires coordinated testing with authorized disposable accounts and projects under privately approved scope. |
| Unauthorized source ZIP download denial | **DID NOT PASS** | I have submitted the concern through GitHub's private vulnerability reporting workflow. Submission does not resolve the failed criterion; remediation and retesting require private coordination with the maintainers and approved scope. |
| Cancellation during an active ZIP upload | **NOT VALIDATED** | Cancelling the import dialog before upload was tested successfully. Cancelling an upload already in progress was not tested; these are different actions. |
| Deployment environment and acceptance | **INCOMPLETE** | The deployed server release/image commit and complete environment metadata have not been independently recorded. The later compiler logs do not establish the full deployment environment. Missing metadata must be recorded during an authorized rerun. Maintainer review and final acceptance remain pending. |

I am submitting the portability results for review. Maintainer acceptance and the
remaining checks in this table are still outstanding. The original-session logs
and independently retained application settings evidence also remain unavailable;
the later recompilation logs do not replace them. I am not marking Issue #45 as
fully accepted or ready to close.
