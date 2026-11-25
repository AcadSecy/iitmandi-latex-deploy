#!/usr/bin/env python3
"""Generate an entirely disposable LaTeX ZIP-portability fixture and manifest."""
import argparse
import hashlib
import json
import pathlib
import struct
import zlib


def png_bytes():
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    width, height = 160, 80
    rows = []
    for y in range(height):
        row = b'\x00' + b''.join(bytes((30 + x // 4, 80 + y, 170)) for x in range(width))
        rows.append(row)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b''))


def pdf_bytes():
    # Minimal one-page PDF graphic; standard PDF 1.4 format and no dependencies.
    stream = b'0.10 0.55 0.25 rg\n25 25 250 100 re f\n'
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << >> /Contents 4 0 R >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'endstream',
    ]
    payload = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(payload))
        payload += f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n'
    pos = len(payload)
    payload += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode()
    for offset in offsets[1:]:
        payload += f'{offset:010d} 00000 n \n'.encode()
    payload += f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{pos}\n%%EOF\n'.encode()
    return bytes(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workspace', type=pathlib.Path, help='Fresh workspace for the fixture and evidence directory')
    args = parser.parse_args()
    base = args.workspace.expanduser().resolve()
    project = base / 'zip-portability-test'
    evidence = base / 'evidence'
    manifest_path = evidence / 'baseline-manifest.json'
    if project.exists() or project.is_symlink() or manifest_path.exists() or manifest_path.is_symlink():
        raise SystemExit('Refusing to overwrite an existing fixture or manifest. Use a fresh workspace.')

    files = {
        'chapters/main.tex': r'''\documentclass{styles/custom}
\usepackage{graphicx}
\usepackage{styles/custom}
\title{ZIP Portability Verification}
\author{Disposable Test Project}
\date{}
\begin{document}
\maketitle
\section{Introduction}
ZIP-PORTABILITY-CONTENT-MARKER-2026.
\input{chapters/introduction}
\section{Figures}
\begin{figure}[htbp]
\centering
\includegraphics[width=.38\linewidth]{images/figure.png}
\caption{PNG fixture image}
\end{figure}
\begin{figure}[htbp]
\centering
\includegraphics[width=.38\linewidth]{images/included-figure.pdf}
\caption{PDF fixture graphic}
\end{figure}
\section{Bibliography}
Citation marker: \cite{fixture2026}. \FixtureSignature
\bibliographystyle{plain}
\bibliography{references/sources}
\end{document}
''',
        'chapters/introduction.tex': r'''\subsection{Nested source inclusion}
This paragraph is loaded from a second TeX file inside the chapters directory.
''',
        'references/sources.bib': r'''@article{fixture2026,
  author = {Example, Alice},
  title = {Reproducible ZIP Portability Tests},
  journal = {Fixture Testing Notes},
  year = {2026},
  volume = {1},
  pages = {1--2}
}
''',
        'styles/custom.cls': r'''\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{custom}[2026/10/31 ZIP test custom class]
\LoadClass{article}
''',
        'styles/custom.sty': r'''\NeedsTeXFormat{LaTeX2e}
\ProvidesPackage{custom}[2026/10/31 ZIP test custom style]
\newcommand{\FixtureSignature}{CUSTOM-STYLE-LOADED}
''',
        'data files/notes with spaces.txt': 'Filename with spaces preserved.\n',
        'data files/नमस्ते-notes.txt': 'नमस्ते — Unicode filename preserved.\n',
        'README.txt': 'Disposable LaTeX portability test. Root: chapters/main.tex. Compiler: pdfLaTeX. Bibliography: BibTeX.\n',
        'images/figure.png': png_bytes(),
        'images/included-figure.pdf': pdf_bytes(),
    }
    project.mkdir(parents=True, exist_ok=False)
    for rel, content in files.items():
        target = project / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as output:
            output.write(content if isinstance(content, bytes) else content.encode('utf-8'))
    evidence.mkdir(parents=True, exist_ok=True)
    manifest = {'root_document': 'chapters/main.tex', 'compiler': 'pdfLaTeX', 'files': []}
    for path in sorted(project.rglob('*')):
        if path.is_file():
            data = path.read_bytes()
            manifest['files'].append({'path': path.relative_to(project).as_posix(), 'size_bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    with manifest_path.open('x', encoding='utf-8') as output:
        output.write(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'Fixture created: {project}')
    print(f'Manifest saved OUTSIDE fixture: {evidence / "baseline-manifest.json"}')
    print(f'Source files: {len(manifest["files"])}')
    print('Root document: chapters/main.tex | Compiler: pdfLaTeX | BibTeX bibliography')
    print('All set. No source ZIP exports have been tested yet.')

if __name__ == '__main__':
    main()
