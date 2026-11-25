# Retained ZIP archive verification — Issue #45 / PR #59

## Scope and provenance

The four retained archives were rechecked against the original baseline manifest
using Python 3's standard library during the local evidence review. The command
below reads each original archive independently, hashes its complete bytes,
then compares every non-directory ZIP
entry with the baseline's exact relative path, uncompressed size, and SHA-256
digest. It checks duplicate file paths before constructing the content mapping.
Directory entries are ignored; file paths are not normalized, stripped, or
renamed, so an added enclosing directory, case change, or filename change fails.

The four original ZIPs remain outside the repository in
`~/zip-verification-work/`. They were opened read-only, not modified, regenerated,
or copied into the repository. The original manifest is also read-only; the
command requires it to match the [repository copy](baseline-manifest.json)
byte-for-byte and records its SHA-256 digest to identify the baseline used.

## Reproducible verification command

Run this command from the repository root with the original archives and
manifest available in the external workspace. It prints only artifact names,
digests, counts, discrepancy paths, and status. It writes no files and extracts
no archive members to disk. Any failed comparison makes the final exit status 1;
all four comparisons passing produces exit status 0. Missing or unreadable inputs
and invalid ZIP data also prevent a successful result.

```bash
python3 - "$HOME/zip-verification-work" doc/testing/evidence/baseline-manifest.json <<'PY'
import hashlib
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path

workspace = Path(sys.argv[1]).expanduser()
baseline_bytes = (workspace / "evidence/baseline-manifest.json").read_bytes()
if baseline_bytes != Path(sys.argv[2]).read_bytes():
    raise SystemExit("FAIL: external and repository baselines differ")
baseline = json.loads(baseline_bytes)
expected = {
    item["path"]: (item["sha256"], item["size_bytes"])
    for item in baseline["files"]
}
if len(expected) != 10 or len(baseline["files"]) != 10:
    raise SystemExit("FAIL: baseline must contain ten unique file paths")
print("Baseline SHA-256:", hashlib.sha256(baseline_bytes).hexdigest())
print("External baseline matches repository copy: YES")

overall = True
for filename in (
    "source-export-1.zip",
    "source-export-2.zip",
    "source-export-3.zip",
    "roundtrip-export.zip",
):
    with (workspace / filename).open("rb") as source:
        archive_digest = hashlib.sha256()
        for chunk in iter(lambda: source.read(65536), b""):
            archive_digest.update(chunk)
        source.seek(0)
        with zipfile.ZipFile(source, "r") as archive:
            entries = [entry for entry in archive.infolist() if not entry.is_dir()]
            counts = Counter(entry.filename for entry in entries)
            duplicates = sorted(path for path, count in counts.items() if count > 1)
            actual = {}
            for entry in entries:
                digest = hashlib.sha256()
                size = 0
                with archive.open(entry, "r") as content:
                    for chunk in iter(lambda: content.read(65536), b""):
                        digest.update(chunk)
                        size += len(chunk)
                actual[entry.filename] = (digest.hexdigest(), size)

    shared = expected.keys() & actual.keys()
    missing = sorted(expected.keys() - actual.keys())
    extra = sorted(actual.keys() - expected.keys())
    modified = sorted(path for path in shared if expected[path] != actual[path])
    identical = sum(expected[path] == actual[path] for path in shared)
    passed = (
        len(entries) == len(expected) == identical
        and not (missing or extra or modified or duplicates)
    )
    overall = overall and passed
    print(json.dumps({
        "archive": filename,
        "archive_sha256": archive_digest.hexdigest(),
        "expected_source_files": len(expected),
        "actual_file_entries": len(entries),
        "identical_files": identical,
        "missing": missing,
        "extra": extra,
        "modified": modified,
        "duplicates": duplicates,
        "result": "PASS" if passed else "FAIL",
    }, indent=2, ensure_ascii=False))

print("OVERALL:", "PASS" if overall else "FAIL")
print("Exit status:", 0 if overall else 1)
raise SystemExit(0 if overall else 1)
PY
```

## Captured output

The output below is captured from running the exact command above against the
four retained archives. It is a local re-verification, not a new application
export/import run.

```text
Baseline SHA-256: 3f52b866a3b9405c114b0706f40d9a43e529dbb976658b986c0ec6ef0e83c9ac
External baseline matches repository copy: YES
{
  "archive": "source-export-1.zip",
  "archive_sha256": "9b05973ad2c7fc9125ae60085e90b995b135ccccd958e234edd46ee66b8908c0",
  "expected_source_files": 10,
  "actual_file_entries": 10,
  "identical_files": 10,
  "missing": [],
  "extra": [],
  "modified": [],
  "duplicates": [],
  "result": "PASS"
}
{
  "archive": "source-export-2.zip",
  "archive_sha256": "9b69f1f23e185c99c4513f396e500ea5332244e59b2b462f7683f77b2525c6e7",
  "expected_source_files": 10,
  "actual_file_entries": 10,
  "identical_files": 10,
  "missing": [],
  "extra": [],
  "modified": [],
  "duplicates": [],
  "result": "PASS"
}
{
  "archive": "source-export-3.zip",
  "archive_sha256": "b3ed2acd196564a9f84bfe9639d107113cb0b2638d25c2d4159fbc6cbce6eba3",
  "expected_source_files": 10,
  "actual_file_entries": 10,
  "identical_files": 10,
  "missing": [],
  "extra": [],
  "modified": [],
  "duplicates": [],
  "result": "PASS"
}
{
  "archive": "roundtrip-export.zip",
  "archive_sha256": "dcd2fc97972d4e8012e0d0f879f92950feb884c269bed1111b14c13c4fc9d375",
  "expected_source_files": 10,
  "actual_file_entries": 10,
  "identical_files": 10,
  "missing": [],
  "extra": [],
  "modified": [],
  "duplicates": [],
  "result": "PASS"
}
OVERALL: PASS
Exit status: 0
```

## Exit-status confirmation

The real-archive run returned process exit status 0. To confirm the failure path,
the same Python procedure was run in a separate process with one expected digest
changed to 64 zeroes **in memory only**, immediately before the archive loop.
The original manifest, repository manifest, and ZIPs were not changed. All four
comparisons detected the deliberate mismatch and the process returned status 1.
This was only a check of the verification command's exit behavior; it is not an
application negative/regression test or a result for an altered archive.

Captured check summary:

```text
Failure-exit check (in-memory expected-digest mismatch): exit status 1
Original archives unchanged: SHA-256, size, and modification time match before/after.
```

## Interpreting the hashes

The archive SHA-256 identifies the exact bytes of each retained ZIP, including
its container metadata and compressed representation. The four archive hashes
are different. This does not indicate a portability failure: ZIP metadata or
compression can differ while the enclosed source files stay identical.

The baseline records a separate SHA-256 and byte count for each uncompressed
source file. PASS requires exact relative filenames and matching file digests
and sizes, with ten file entries and no missing, extra, modified, or duplicate
paths. This verifies source integrity independently of whole-archive equality.

## Evidence limitations

These results bind the reported content comparisons to the specific retained
archive bytes and baseline identified above. The ZIPs remain outside the
repository, so reproducing the comparison requires access to those originals.
The hashes and retained archives do not independently prove when or how downloads
occurred, that three separate browser downloads were performed, or which project
produced each archive. The filenames identify their recorded roles, not
independently authenticated provenance.

The archives also do not independently prove browser interactions, automatic root
document or compiler selection, compilation success, PDF rendering, or application
settings. Those observations retain the qualifications in the
[main report](../zip-portability-45.md). This re-verification does not supply the
missing browser, original-session logs, or deployment metadata, and does not
change the pending acceptance criteria. Later recompilation logs and local
verifier tests are documented separately in the main report.
