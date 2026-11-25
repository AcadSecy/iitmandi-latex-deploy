"""Exercise the verifier CLI with temporary synthetic data, never real exports."""

import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile


VERIFIER = Path(__file__).with_name("verify_exports.py").resolve()


class ZipVerificationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="zip-verification-test-")
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name)
        self.files = {
            "main.tex": b"\\documentclass{article}\n",
            "chapters/introduction.tex": b"Nested source.\n",
            "data files/नमस्ते-notes.txt": "नमस्ते\n".encode("utf-8"),
        }
        evidence = self.workspace / "evidence"
        evidence.mkdir()
        manifest = {"files": [
            {"path": path, "size_bytes": len(data),
             "sha256": hashlib.sha256(data).hexdigest()}
            for path, data in self.files.items()
        ]}
        (evidence / "baseline-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
        )
        for index in range(1, 4):
            self.write_archive(index, self.files.items())

    def write_archive(self, index, entries):
        path = self.workspace / f"source-export-{index}.zip"
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, data in entries:
                archive.writestr(name, data)
        return path

    def run_verifier(self):
        return subprocess.run(
            [sys.executable, str(VERIFIER), str(self.workspace)],
            cwd=self.workspace, capture_output=True, text=True, timeout=30,
        )

    def assert_failed(self, diagnostic, index=1):
        result = self.run_verifier()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(diagnostic, result.stdout)
        self.assertIn("OVERALL: FAIL", result.stdout)
        self.assertNotIn("Traceback", result.stdout + result.stderr)
        expected = {f"export_{i}": "FAIL" if i == index else "PASS"
                    for i in range(1, 4)}
        recorded = json.loads(
            (self.workspace / "evidence/export-verification.json").read_text()
        )
        self.assertEqual(recorded, expected)
        return result

    def test_valid_archives_pass(self):
        result = self.run_verifier()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OVERALL: PASS", result.stdout)
        recorded = json.loads(
            (self.workspace / "evidence/export-verification.json").read_text()
        )
        self.assertEqual(recorded, {f"export_{i}": "PASS" for i in range(1, 4)})

    def test_missing_expected_file_fails(self):
        self.write_archive(1, ((p, d) for p, d in self.files.items() if p != "main.tex"))
        self.assert_failed("MISSING: main.tex")

    def test_unexpected_extra_file_fails(self):
        self.write_archive(1, [*self.files.items(), ("extra.txt", b"extra")])
        self.assert_failed("EXTRA: extra.txt")

    def test_modified_file_contents_fail(self):
        # Same byte count: this must fail the digest check, not just the size check.
        changed = dict(self.files)
        changed["main.tex"] = b"X" * len(changed["main.tex"])
        self.write_archive(1, changed.items())
        self.assert_failed("MODIFIED: main.tex")

    def test_duplicate_entry_path_fails(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            self.write_archive(1, [*self.files.items(), ("main.tex", self.files["main.tex"])])
        self.assert_failed("DUPLICATE: main.tex")

    def test_invalid_zip_archive_fails(self):
        (self.workspace / "source-export-1.zip").write_bytes(b"This is not a ZIP.\n")
        self.assert_failed("FAIL: File is not a zip file")

    def test_corrupt_zip_payload_fails_without_traceback(self):
        path = self.workspace / "source-export-1.zip"
        with zipfile.ZipFile(path) as archive:
            entry = archive.infolist()[0]
        payload = bytearray(path.read_bytes())
        name_size, extra_size = struct.unpack_from("<HH", payload, entry.header_offset + 26)
        data_offset = entry.header_offset + 30 + name_size + extra_size
        # Keep the ZIP directory and .zip extension, but corrupt the DEFLATE block.
        payload[data_offset] = 0x07  # Reserved DEFLATE block type.
        path.write_bytes(payload)
        self.assertTrue(zipfile.is_zipfile(path))
        self.assert_failed("FAIL:")

    def test_failed_comparison_returns_nonzero_even_between_valid_exports(self):
        self.write_archive(2, [])
        self.assert_failed("MISSING: main.tex", index=2)

    def test_changed_relative_path_fails_with_identical_content(self):
        renamed = dict(self.files)
        renamed["Main.tex"] = renamed.pop("main.tex")
        self.write_archive(1, renamed.items())
        result = self.assert_failed("MISSING: main.tex")
        self.assertIn("EXTRA: Main.tex", result.stdout)


if __name__ == "__main__":
    unittest.main()
