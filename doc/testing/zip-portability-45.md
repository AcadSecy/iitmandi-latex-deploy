# ZIP export/import portability report — Issue #45

## 1. Purpose and scope

I tested source ZIP integrity, import/export portability, compilation, and error
handling using a disposable project on IIT Mandi LaTeX. This report records my
results for Issue #45 on branch `test/zip-portability-45`. The contribution is
documentation-only; maintainer acceptance remains pending.

ZIP integrity and portability checks passed for this fixture. Permission checks
did not pass; the access-control finding will be reported separately at the
maintainer's request. These results do not establish that all
projects, compilers, or deployment configurations behave identically.

## 2. Test environment

| Item | Recorded environment or limitation |
| --- | --- |
| Application | Institute self-hosted IIT Mandi LaTeX platform, based on Overleaf Community Edition |
| Test data | Disposable 10-file project; no production project content |
| Root document | `chapters/main.tex` |
| Compiler and bibliography | pdfLaTeX and BibTeX |
| Local tools | Python 3 standard library; Poppler `pdfinfo` and `pdftotext` for PDF inspection |
| External workspace | `~/zip-verification-work/`; only the three reviewed JSON evidence files are copied into the repository |
| Deployment image/commit, TeX Live version, browser/OS, tool versions, execution times | Not recorded in the retained evidence; to be captured on the next run |

I used the platform to export, import, and compile the disposable project, then
checked the saved fixture, ZIP contents, and PDFs. This report distinguishes
results supported by retained files from my observations of browser behavior
and compilation settings. The artifact review did not involve another run of
the browser or compilation tests.

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

[generate_zip_fixture.py](generate_zip_fixture.py) creates the fixture and writes a baseline containing
each file's relative path, byte count, and SHA-256 digest. The manifest is outside
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
  pass. It compares uncompressed file bytes by SHA-256 and size, checks exact path sets,
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

“Artifact-checked” identifies results checked against the saved local files.
“Tester-reported” identifies my observations during testing for which the retained
evidence does not independently establish the browser action or compiler-log
outcome.

| Check | Result | Evidence and qualification |
| --- | --- | --- |
| Fixture baseline | PASS | 10 source files match baseline paths, sizes, and SHA-256 digests; artifact-checked |
| Source export 1 | PASS | 10/10 identical; no missing, extra, modified, or duplicate file paths; artifact-checked |
| Source export 2 | PASS | Same checks passed independently; artifact-checked |
| Source export 3 | PASS | Same checks passed independently; artifact-checked |
| Imported project's source export | PASS | Expected 10; actual 10; identical 10; missing 0; extra 0; modified 0; duplicate paths 0; artifact-checked |
| Imported root/compiler selection | PASS, tester-reported | `chapters/main.tex` and pdfLaTeX selected automatically; no manual restoration required in this test |
| Compilation | PASS, tester-reported | Both projects compiled successfully; 0 errors and 2 warnings each |
| PDF pagination | PASS | Original 2 pages; imported 2 pages; artifact-checked with `pdfinfo` |
| PDF extracted text | PASS | Saved text files are byte-identical and match fresh `pdftotext -layout` extraction from the saved PDFs |
| Bibliography and custom-style marker | PASS | Resolved `[1]` citation, bibliography entry, and `CUSTOM-STYLE-LOADED` occur in both PDF text extracts |
| PNG and included PDF graphic rendered | PASS, tester-reported | I observed both graphics in the output; captions exist in extracted text, which alone does not prove graphic rendering |
| Permissions | DID NOT PASS | Access-control finding will be reported separately; see section 7 |

I observed the same two warnings in both compilations, related to custom
class/style loading. Compile logs are not included in the retained evidence, so
the exact warning messages and error/warning counts cannot be independently
verified from that evidence. Likewise, the baseline's root/compiler fields
document intended settings, not proof of the imported project's automatic
selection.

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

## 7. Permissions finding and limitation

During permission testing, I identified an access-control finding. The maintainer
requested a separate issue; I have not created it yet and will report the finding
separately. **The permissions acceptance criterion did not pass.** I have omitted
the details from this public report. I did not separately validate authorized
collaborator-specific behavior.

ZIP integrity results do not establish correct access control. Permission
acceptance requires separate maintainer verification.

I will share the security finding's details privately with the maintainers. It
must not be described or demonstrated publicly; reproduction details and
sensitive screenshots are excluded from the public evidence.

## 8. Evidence inventory

I have included the helper scripts
[generate_zip_fixture.py](generate_zip_fixture.py) and
[verify_exports.py](verify_exports.py). They contain no credentials, private
project URLs, tokens, or deployment addresses. Their workspace and overwrite
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

These JSON files demonstrate the recorded file-integrity results. They are a
baseline and result summaries, not the raw exported contents or independent
proof of browser interactions, imported settings, or compilation. The local
archive checks described in section 5 used artifacts retained outside the
repository. Browser interactions and compilation settings remain my reported
observations unless separately supported by retained evidence. The baseline's intended
settings do not establish what the application selected automatically.

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

The imported project's provenance and the sequence of browser actions are based
on my test observations; matching archives establish content equality, not that
sequence. I have not included compile logs or an environment-version record in
the retained evidence. I can provide sanitized screenshots of portability testing
separately after checking them for sensitive content; no screenshots are included
here. Security-finding screenshots or demonstrations must not be shared publicly.
Only this report, the two helper scripts, and the three JSON files are included
in this contribution; no PDFs, ZIPs, screenshots, private identifiers,
credentials, or bulk copies of the external evidence directory are included.

## 9. Final status and remaining acceptance criteria

- **Passed:** ZIP integrity and portability for the specified fixture, including
  all three original exports, the imported project's export, equal PDF page
  counts, and identical extracted PDF text.
- **Reported successful, with evidence limitations:** automatic root/compiler
  selection without restoration, compilation counts and warning equivalence,
  graphic rendering, and the error-handling interactions described above.
- **Did not pass:** permissions acceptance; the access-control finding will be
  reported separately at the maintainer's request. That separate issue has not
  yet been created.
- **Not separately validated:** authorized collaborator-specific behavior and
  cancellation during an active upload.
- **Pending:** maintainer review and acceptance, any required deployment-specific
  verification, and confirmation of the missing environment/UI/log evidence.

I am submitting the portability results for review. Maintainer acceptance and the
remaining checks above are still pending, so I am not marking Issue #45 as fully
accepted or ready to close.
