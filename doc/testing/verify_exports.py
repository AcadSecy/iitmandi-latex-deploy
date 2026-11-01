#!/usr/bin/env python3
"""Verify three source ZIP exports against a workspace's baseline manifest."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path
from collections import Counter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('workspace', type=Path, help='Workspace containing evidence and source-export-1.zip through source-export-3.zip')
args = parser.parse_args()
BASE = args.workspace.expanduser().resolve()
MANIFEST = BASE / "evidence/baseline-manifest.json"
output = BASE / "evidence/export-verification.json"
if output.exists() or output.is_symlink():
    raise SystemExit('Refusing to overwrite existing export evidence. Use a fresh workspace.')

baseline = json.loads(MANIFEST.read_text(encoding="utf-8"))
expected = {
    item["path"]: (item["sha256"], item["size_bytes"])
    for item in baseline["files"]
}

results = {}

for i in range(1, 4):
    archive = BASE / f"source-export-{i}.zip"

    print(f"\n{'=' * 55}")
    print(f"VERIFYING EXPORT {i}")
    print(f"{'=' * 55}")

    if not archive.exists():
        print("FAIL: ZIP file not found")
        results[f"export_{i}"] = "FAIL"
        continue

    try:
        with zipfile.ZipFile(archive) as z:
            entries = [e for e in z.infolist() if not e.is_dir()]
            paths = [e.filename for e in entries]

            duplicates = sorted(
                p for p, count in Counter(paths).items()
                if count > 1
            )

            actual = {}
            for entry in entries:
                with z.open(entry) as f:
                    digest = hashlib.sha256()
                    size = 0
                    for chunk in iter(lambda: f.read(65536), b""):
                        digest.update(chunk)
                        size += len(chunk)

                actual[entry.filename] = (digest.hexdigest(), size)

            missing = sorted(set(expected) - set(actual))
            extra = sorted(set(actual) - set(expected))
            modified = sorted(
                p for p in set(expected) & set(actual)
                if expected[p] != actual[p]
            )
            identical = sorted(
                p for p in set(expected) & set(actual)
                if expected[p] == actual[p]
            )

            print(f"Expected files:  {len(expected)}")
            print(f"Exported files:  {len(entries)}")
            print(f"Identical files: {len(identical)}")
            print(f"Missing files:   {len(missing)}")
            print(f"Extra files:     {len(extra)}")
            print(f"Modified files:  {len(modified)}")
            print(f"Duplicate paths: {len(duplicates)}")

            for label, items in [
                ("MISSING", missing),
                ("EXTRA", extra),
                ("MODIFIED", modified),
                ("DUPLICATE", duplicates),
            ]:
                for p in items:
                    print(f"  {label}: {p}")

            passed = not (missing or extra or modified or duplicates)
            status = "PASS" if passed else "FAIL"

            print(f"\nEXPORT {i}: {status}")
            results[f"export_{i}"] = status

    except (zipfile.BadZipFile, OSError, RuntimeError) as e:
        print(f"FAIL: {e}")
        results[f"export_{i}"] = "FAIL"

print(f"\n{'=' * 55}")
print("FINAL SUMMARY")
print(f"{'=' * 55}")

for name, status in results.items():
    print(f"{name}: {status}")

overall = (
    len(results) == 3
    and all(s == "PASS" for s in results.values())
)

print(f"\nOVERALL: {'PASS' if overall else 'FAIL'}")

output.parent.mkdir(parents=True, exist_ok=True)
with output.open('x', encoding='utf-8') as evidence_file:
    evidence_file.write(json.dumps(results, indent=2) + "\n")

print(f"Evidence saved: {output}")

if not overall:
    raise SystemExit(1)
