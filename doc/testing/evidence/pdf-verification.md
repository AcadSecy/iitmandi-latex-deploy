# Retained PDF verification — Issue #45 / PR #59

## Scope and reproducible command

The retained `original.pdf` and `roundtrip.pdf` were checked locally using Poppler's
`pdfinfo` and `pdftotext -layout`. Both PDFs and the previously saved text files
remain in `~/zip-verification-work/evidence/`, outside the repository. This is a
local artifact check, not a new application compilation or browser test.

Run the following from the repository root with Python 3, Poppler, and `diff`
available. It runs `pdfinfo` on each PDF but publishes only the page count, page
size, and PDF version. Other metadata may contain local details and is omitted.
Fresh text is written only into a temporary directory, compared using `diff -u`,
and checked against the retained text files. Originals are opened read-only.
The command exits nonzero on a tool failure or failed assertion.

```bash
python3 - "$HOME/zip-verification-work/evidence" <<'PY'
from pathlib import Path
import subprocess
import sys
import tempfile

evidence = Path(sys.argv[1]).expanduser()
for tool in ("pdfinfo", "pdftotext"):
    version = subprocess.run([tool, "-v"], capture_output=True, text=True)
    version.check_returncode()
    print((version.stdout or version.stderr).splitlines()[0])

markers = {
    "title": "ZIP Portability Verification",
    "content marker": "ZIP-PORTABILITY-CONTENT-MARKER-2026.",
    "nested source": "This paragraph is loaded from a second TeX file inside the chapters directory.",
    "citation": "Citation marker: [1].",
    "bibliography entry": "[1] Alice Example. Reproducible zip portability tests.",
    "custom style": "CUSTOM-STYLE-LOADED",
}
with tempfile.TemporaryDirectory(prefix="zip-pdf-verification-") as temporary:
    fresh = {}
    for name in ("original", "roundtrip"):
        pdf = evidence / f"{name}.pdf"
        info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True)
        print(f"pdfinfo {name}.pdf: exit {info.returncode}")
        info.check_returncode()
        fields = dict(line.split(":", 1) for line in info.stdout.splitlines() if ":" in line)
        for field in ("Pages", "Page size", "PDF version"):
            print(f"{field}: {fields[field].strip()}")
        assert int(fields["Pages"].strip()) == 2, "Unexpected page count"

        output = Path(temporary) / f"{name}.txt"
        extract = subprocess.run(
            ["pdftotext", "-layout", str(pdf), str(output)], capture_output=True
        )
        print(f"pdftotext -layout {name}.pdf: exit {extract.returncode}")
        extract.check_returncode()
        fresh[name] = output
        data = output.read_bytes()
        assert data == (evidence / f"{name}.txt").read_bytes(), "Saved text differs"
        print(f"{name}: fresh extraction matches retained text: PASS")
        text = " ".join(data.decode("utf-8").split())
        for label, marker in markers.items():
            assert marker in text, f"Missing {label} in {name}"
            print(f"{name}: {label}: PASS ({marker})")

    comparison = subprocess.run(
        ["diff", "-u", str(fresh["original"]), str(fresh["roundtrip"])],
        capture_output=True, text=True,
    )
    print(f"diff -u fresh extracted text: exit {comparison.returncode}")
    comparison.check_returncode()
    assert not comparison.stdout and not comparison.stderr
    print("diff output: (empty; extracted text is identical)")
print("OVERALL: PASS")
print("Exit status: 0")
PY
```

## Captured sanitized output

```text
pdfinfo version 24.02.0
pdftotext version 24.02.0
pdfinfo original.pdf: exit 0
Pages: 2
Page size: 612 x 792 pts (letter)
PDF version: 1.7
pdftotext -layout original.pdf: exit 0
original: fresh extraction matches retained text: PASS
original: title: PASS (ZIP Portability Verification)
original: content marker: PASS (ZIP-PORTABILITY-CONTENT-MARKER-2026.)
original: nested source: PASS (This paragraph is loaded from a second TeX file inside the chapters directory.)
original: citation: PASS (Citation marker: [1].)
original: bibliography entry: PASS ([1] Alice Example. Reproducible zip portability tests.)
original: custom style: PASS (CUSTOM-STYLE-LOADED)
pdfinfo roundtrip.pdf: exit 0
Pages: 2
Page size: 612 x 792 pts (letter)
PDF version: 1.7
pdftotext -layout roundtrip.pdf: exit 0
roundtrip: fresh extraction matches retained text: PASS
roundtrip: title: PASS (ZIP Portability Verification)
roundtrip: content marker: PASS (ZIP-PORTABILITY-CONTENT-MARKER-2026.)
roundtrip: nested source: PASS (This paragraph is loaded from a second TeX file inside the chapters directory.)
roundtrip: citation: PASS (Citation marker: [1].)
roundtrip: bibliography entry: PASS ([1] Alice Example. Reproducible zip portability tests.)
roundtrip: custom style: PASS (CUSTOM-STYLE-LOADED)
diff -u fresh extracted text: exit 0
diff output: (empty; extracted text is identical)
OVERALL: PASS
Exit status: 0
```

Both `pdfinfo` calls, both `pdftotext -layout` calls, the extracted-text `diff`,
and the complete verification command returned exit status 0. The successful
`diff` produced no output. PDF binary hashes were not compared as a portability
criterion. Internal checks of artifact bytes, sizes, and modification times
before and after verification confirmed that the original PDFs, ZIPs, and saved
text files were unchanged; those checks were only safeguards against mutation.

## Compilation logs and settings evidence

At the time of the initial PDF review, no compilation logs were retained.
Two logs have since been downloaded following a later authorized recompilation;
see [compilation-verification.md](compilation-verification.md). Their headers show
2 November 2026. They are not the original 31 October session logs and are not
established as the generating logs for the PDFs checked here. No logs were
reconstructed or represented as captured original-session output.

In my original session, both projects compiled with zero errors and two matching
warnings related to custom class/style loading. These remain my UI observations.
PDF existence and readable text do not independently confirm those counts or
that both original application compilation sessions completed without errors.
The later logs separately support successful two-page PDF output with zero error
diagnostics and two matching LaTeX warnings; those diagnostic counts do not
independently establish application UI warning counters.

The original baseline manifest and fixture README specify the intended root
`chapters/main.tex`, compiler pdfLaTeX, and BibTeX bibliography. They are fixture
inputs, not a retained application settings record. The available JSON summaries,
PDFs, and extracted text do not independently establish that the imported
project automatically selected that root and compiler. I observed those selections
without manual restoration; no independent settings capture is retained.
PDF metadata does not prove automatic root-document or compiler selection.

## Limits of the PDF checks

- Page counts and extracted text are artifact-verified, including the title,
  nested-source text, resolved `[1]` citation, bibliography entry, and
  `CUSTOM-STYLE-LOADED` marker.
- Text extraction does not prove correct graphical rendering, figure placement,
  font appearance, or visual equivalence. PNG/PDF graphic rendering remains the
  my visual observation; captions alone are insufficient evidence.
- This check does not authenticate which application project generated a PDF,
  prove browser actions, establish automatic settings selection, or supply the
  missing original-session compilation logs or deployment environment record.
- Reproduction requires the external originals. No PDFs, extracted-text files,
  screenshots, logs, archive files, or private deployment information were copied
  into the repository for this update.

These limitations preserve the pending acceptance criteria in the
[main report](../zip-portability-45.md).
