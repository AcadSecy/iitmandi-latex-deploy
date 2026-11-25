# Later recompilation log verification — Issue #45 / PR #59

## Provenance and scope

The local evidence review analyzed `original-output.log` and
`roundtrip-output.log`, downloaded from the disposable projects after a later
authorized recompilation. Their headers show
2 November 2026, at 11:46 and 11:48 respectively; the log timezone is unspecified.
These are **not the original 31 October test-session logs** and cannot establish
the exact diagnostics from those earlier sessions. Download origin is based on
my account of obtaining the logs; their contents do not independently authenticate
the application project or download history.

The raw logs remain outside the repository under
`~/zip-verification-work/evidence/compile-logs/`. Only selected, sanitized findings
are published here. No application was accessed or recompiled during this local
analysis. The command below opens both logs read-only, records their hashes, and
prints parsed compiler details and fixture-specific diagnostic excerpts. It does
not print internal build paths, identifiers, account details, or complete logs.

## Reproducible analysis

Run from the repository root with Python 3. The error count uses the standard
TeX `!` diagnostic plus explicit LaTeX/package errors and fatal-stop markers;
it is a count of matching log lines, not an application UI counter. The command
requires successful PDF output and no matching errors in each retained log.

```bash
python3 - "$HOME/zip-verification-work/evidence/compile-logs" <<'PY'
from pathlib import Path
from itertools import zip_longest
import hashlib
import json
import re
import sys

base = Path(sys.argv[1]).expanduser()
logs = []
warning_messages = (
    "LaTeX Warning: You have requested document class `styles/custom', but the document class provides `custom'.",
    "LaTeX Warning: You have requested package `styles/custom', but the package provides `custom'.",
)
summaries = []
for name in ("original-output.log", "roundtrip-output.log"):
    raw = (base / name).read_bytes()
    text = raw.decode("utf-8")
    lines = text.splitlines()
    logs.append(lines)
    header = re.search(
        r"^This is pdfTeX, Version ([0-9.\-]+) \(TeX Live ([0-9]+)\) "
        r"\(preloaded format=(pdflatex [0-9.]+)\)\s+([0-9 A-Z:]+)$",
        lines[0],
    )
    assert header, "Unrecognized compiler header"
    root = re.search(r"^\*\*(.+)$", text, re.M)
    assert root and root[1] == "main.tex", "Unexpected root invocation"
    output = re.search(r"^Output written on .+ \(([0-9]+) pages?, ([0-9]+) bytes\)\.$", text, re.M)
    assert output, "No successful PDF output marker"
    warnings = re.findall(r"^(?:LaTeX|Package \S+|Class \S+) Warning:.*", text, re.M)
    errors = re.findall(
        r"^(?:!|LaTeX Error:|Package \S+ Error:|Class \S+ Error:).*"
        r"|^.*(?:Emergency stop|Fatal error occurred|no output PDF file produced).*$",
        text, re.M,
    )
    normalized = " ".join(text.split())
    matched_warnings = [message for message in warning_messages if message in normalized]
    summary = {
        "log": name,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "pdftex_version": header[1],
        "tex_live": header[2],
        "preloaded_format": header[3],
        "header_time_timezone_unspecified": header[4].strip(),
        "root_invocation": "**main.tex",
        "successful_output_sanitized": f"Output written on [build-path]/output.pdf ({output[1]} pages, {output[2]} bytes).",
        "error_diagnostic_lines": len(errors),
        "warning_diagnostic_lines": len(warnings),
        "known_warning_excerpts": matched_warnings,
        "png_loaded": "<use images/figure.png>" in text,
        "pdf_figure_loaded": "<use images/included-figure.pdf>" in text,
        "png_embedded_in_output": "figure.png (PNG copy)>" in text,
        "pdf_figure_embedded_in_output": "included-figure.pdf>" in text,
        "bibliography_bbl_read": bool(re.search(r"\([^()\n]*[/]output\.bbl\b", text)),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    assert not errors, "Error diagnostics found"
    assert len(warnings) == len(matched_warnings) == 2, "Unexpected warnings"
    assert all(summary[key] for key in (
        "png_loaded", "pdf_figure_loaded", "png_embedded_in_output",
        "pdf_figure_embedded_in_output", "bibliography_bbl_read",
    )), "Missing figure or bibliography evidence"
    assert output[1] == "2", "Unexpected page count"
    summaries.append(summary)

different_lines = [index + 1 for index, (a, b) in enumerate(zip_longest(*logs)) if a != b]
print("Raw logs identical:", "YES" if logs[0] == logs[1] else "NO")
print("Line counts:", len(logs[0]), len(logs[1]))
print("Differing line numbers:", different_lines)
print("All lines after compiler header identical:", "YES" if logs[0][1:] == logs[1][1:] else "NO")
print("Warning excerpts identical:", "YES" if summaries[0]["known_warning_excerpts"] == summaries[1]["known_warning_excerpts"] else "NO")
print("OVERALL: PASS")
print("Exit status: 0")
PY
```

## Captured sanitized output

```text
{
  "log": "original-output.log",
  "sha256": "2b52bd966b40995cb3994f10c4b617747bfa5301c7559e8f18c46cd3e7ca4ad2",
  "pdftex_version": "3.141592653-2.6-1.40.29",
  "tex_live": "2026",
  "preloaded_format": "pdflatex 2026.10.29",
  "header_time_timezone_unspecified": "2 NOV 2026 11:46",
  "root_invocation": "**main.tex",
  "successful_output_sanitized": "Output written on [build-path]/output.pdf (2 pages, 72920 bytes).",
  "error_diagnostic_lines": 0,
  "warning_diagnostic_lines": 2,
  "known_warning_excerpts": [
    "LaTeX Warning: You have requested document class `styles/custom', but the document class provides `custom'.",
    "LaTeX Warning: You have requested package `styles/custom', but the package provides `custom'."
  ],
  "png_loaded": true,
  "pdf_figure_loaded": true,
  "png_embedded_in_output": true,
  "pdf_figure_embedded_in_output": true,
  "bibliography_bbl_read": true
}
{
  "log": "roundtrip-output.log",
  "sha256": "96c624cc05fef0e0aacfb58e79e48ee5b1a1c8864139df3aec91bc0022ad363f",
  "pdftex_version": "3.141592653-2.6-1.40.29",
  "tex_live": "2026",
  "preloaded_format": "pdflatex 2026.10.29",
  "header_time_timezone_unspecified": "2 NOV 2026 11:48",
  "root_invocation": "**main.tex",
  "successful_output_sanitized": "Output written on [build-path]/output.pdf (2 pages, 72920 bytes).",
  "error_diagnostic_lines": 0,
  "warning_diagnostic_lines": 2,
  "known_warning_excerpts": [
    "LaTeX Warning: You have requested document class `styles/custom', but the document class provides `custom'.",
    "LaTeX Warning: You have requested package `styles/custom', but the package provides `custom'."
  ],
  "png_loaded": true,
  "pdf_figure_loaded": true,
  "png_embedded_in_output": true,
  "pdf_figure_embedded_in_output": true,
  "bibliography_bbl_read": true
}
Raw logs identical: NO
Line counts: 127 127
Differing line numbers: [1]
All lines after compiler header identical: YES
Warning excerpts identical: YES
OVERALL: PASS
Exit status: 0
```

## Findings and comparison

Both later compilations used pdfTeX **3.141592653-2.6-1.40.29**, **TeX Live
2026**, and the preloaded `pdflatex 2026.10.29` format. Both logs identify the
input as `**main.tex` and report a successfully written PDF of **2 pages and
72,920 bytes**. Neither contains a standard TeX/LaTeX error diagnostic or fatal
stop marker. Together with the successful output marker, this supports zero
logged LaTeX errors for these later runs; it is not an application process exit
code or proof of the original sessions' UI result.

Each log contains the same two LaTeX warning diagnostics: the requested class
`styles/custom` provides the name `custom`, and the requested package
`styles/custom` likewise provides `custom`. These are log diagnostic counts,
not independently measured application UI warning counters. The prior UI
observation of two warnings remains separate from this log count.

Both logs record `<use images/figure.png>` and
`<use images/included-figure.pdf>`, along with figure references during page
output, including `(PNG copy)`. This supports image loading and inclusion in
these later compilations. It does not prove visual correctness or that the
earlier retained PDFs were produced by these particular runs.

Both logs read `[build-path]/output.bbl`. This demonstrates consumption of a
prepared bibliography, not a separately captured BibTeX invocation. No BibTeX
`.blg` log was supplied. The resolved citation and bibliography entry in the
[PDF evidence](pdf-verification.md) provide separate artifact evidence; the logs
alone do not establish every bibliography-processing step.

The raw logs are not identical: only their first lines differ, with header times
11:46 and 11:48. Each has 127 lines, and all lines after the compiler header are
identical. There are no other observed differences in diagnostics, figure
handling, bibliography loading, output page count, or output byte count.

## Settings and provenance limitations

The logged root input is `main.tex` in the compilation context. The logs do not
independently establish its mapping to the project path `chapters/main.tex` or
how the root was selected. They establish use of the pdfTeX/pdfLaTeX toolchain
for the later runs, not automatic compiler selection at ZIP import. The
application's automatic root/compiler selection and lack of manual restoration
remain my browser observations, without an independent settings capture.

The supplied later logs do not fill the missing original 31 October logs,
authenticate application project identity, establish original deployment
configuration, or independently prove browser settings. Header times are log
contents, not independently verified wall-clock timestamps. Raw logs were not
published; their SHA-256 digests identify the exact retained inputs used for
this analysis. Both input hashes, sizes, and modification times were unchanged
after the check. The analysis command returned process exit status 0.
