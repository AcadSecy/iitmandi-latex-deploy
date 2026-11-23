#!/usr/bin/env python3
"""Benchmark local extraction on synthetic fixtures, then rehearse ZIP acceptance."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PRINTED = (
    'This is a synthetic campus worksheet.',
    'Keep 50% of sample A&B for the next session.',
    'The trial uses no student documents.',
)
LEFT_COLUMN = ('Left alpha starts the instructions.', 'Left beta continues the instructions.')
RIGHT_COLUMN = ('Right gamma lists the results.', 'Right delta ends the results.')
SCAN = ('Scan orange begins the second page.', 'Scan plum follows orange.', 'Final line: keep the original.')
EQUATIONS = ('E=mc²', 'x²+y²=z²')
TABLE = ('Group Value Unit', 'A 12 kg', 'B 30 kg')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def make_fixtures(directory):
    font = ImageFont.truetype(FONT, 34)
    for filename, lines in [('printed.png', PRINTED), ('scan.png', SCAN)]:
        image = Image.new('L', (1060, 264), color='white')
        draw = ImageDraw.Draw(image)
        for index, line in enumerate(lines):
            draw.text((36, 30 + index * 65), line, font=font, fill='black')
        image.save(directory / filename)

    image = Image.new('L', (900, 445), color='white')
    draw = ImageDraw.Draw(image)
    math_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', 40)
    draw.text((40, 25), 'E = mc²', font=math_font, fill='black')
    draw.text((40, 92), 'x² + y² = z²', font=math_font, fill='black')
    for y in (186, 250, 314, 378):
        draw.line((36, y, 780, y), width=2, fill='black')
    for x in (36, 315, 550, 780):
        draw.line((x, 186, x, 378), width=2, fill='black')
    for row, line in enumerate(TABLE):
        for x, word in zip((52, 334, 569), line.split()):
            draw.text((x, 199 + row * 64), word, font=font, fill='black')
    image.save(directory / 'equation-table.png')

    pdfmetrics.registerFont(TTFont('FixtureSans', FONT))
    pdf = canvas.Canvas(str(directory / 'mixed.pdf'), pagesize=letter, invariant=True)
    pdf.setFont('FixtureSans', 11)
    for x, column in [(44, LEFT_COLUMN), (320, RIGHT_COLUMN)]:
        for index, line in enumerate(column):
            pdf.drawString(x, 720 - index * 26, line)
    pdf.showPage()
    pdf.drawImage(str(directory / 'scan.png'), 44, 577, width=524, height=130.5)
    pdf.showPage()
    pdf.save()


def measure(args, log_path, env):
    with subprocess.Popen(
        ['/usr/bin/time', '-f', '%e %U %S %M', '-o', str(log_path), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=True,
        env=env,
    ) as process:
        try:
            output, errors = process.communicate(timeout=25)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            os.killpg(process.pid, signal.SIGKILL)
            process.communicate()
            raise
    if process.returncode:
        raise RuntimeError(f'{args[0]} exited {process.returncode}: {errors.decode(errors="replace")}')
    wall, user, system, rss = (float(value) for value in log_path.read_text().split())
    return output.decode(), {'wall_s': wall, 'cpu_s': round(user + system, 3), 'peak_kib': int(rss)}


def normalized(text):
    return ' '.join(text.split())


def distance(reference, actual):
    prev = list(range(len(actual) + 1))
    for index, ref_char in enumerate(reference, 1):
        current = [index]
        for offset, actual_char in enumerate(actual, 1):
            current.append(min(current[-1] + 1, prev[offset] + 1, prev[offset - 1] + (ref_char != actual_char)))
        prev = current
    return prev[-1]


def score(reference_lines, text):
    reference = normalized(' '.join(reference_lines))
    actual = normalized(text)
    errors = distance(reference, actual)
    return {'edits': errors, 'reference_chars': len(reference), 'cer': round(errors / len(reference), 4)}


def safe_tex(text):
    special = {
        '\\': r'\textbackslash{}', '&': r'\&', '%': r'\%', '$': r'\$',
        '#': r'\#', '_': r'\_', '{': r'\{', '}': r'\}', '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
    }
    return text.translate(str.maketrans(special)).strip()


def preview_digest(directory):
    files = ('main.tex', 'loss-report.txt', 'mixed.pdf')
    hashes = {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name in files}
    return hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()


def make_preview(directory, page_one, page_two):
    tex = (
        '\\documentclass{article}\n\\begin{document}\n'
        '\\section*{Page 1 \\textendash{} embedded text}\n'
        f'{safe_tex(page_one)}\n\n'
        '\\section*{Page 2 \\textendash{} OCR draft}\n'
        f'{safe_tex(page_two)}\n\\end{{document}}\n'
    )
    (directory / 'main.tex').write_text(tex)
    (directory / 'loss-report.txt').write_text(
        'Page 1: Embedded text. Verify column order against the original.\n'
        'Page 2: OCR draft. Verify punctuation and readings against the scan.\n'
        'Layout, tables, equations, images, links and attachments were not reconstructed.\n'
        'Review the editable main.tex and this report before accepting a fresh project ZIP.\n'
    )


def benchmark(directory, tesseract):
    make_fixtures(directory)
    pdf = str(directory / 'mixed.pdf')
    env = {**os.environ, 'OMP_THREAD_LIMIT': '1'}
    with TemporaryDirectory(prefix='latex-extraction-71-') as work:
        scratch = Path(work)
        timing = scratch / 'time.txt'
        raster = scratch / 'scan'

        def run(*args):
            return measure(args, timing, env)

        def ocr(image):
            return run(tesseract, str(image), 'stdout', '--psm', '6', '-l', 'eng')

        embedded_ref = (*LEFT_COLUMN, *RIGHT_COLUMN)
        results = []
        for _ in range(3):
            page_one, poppler = run('pdftotext', '-f', '1', '-l', '1', pdf, '-')
            blank_text, _ = run('pdftotext', '-f', '2', '-l', '2', pdf, '-')
            _, raster_stats = run('pdftoppm', '-r', '150', '-f', '2', '-l', '2', '-singlefile', '-gray', pdf, str(raster))
            page_two, scan_stats = ocr(raster.with_suffix('.pgm'))
            printed_text, printed_stats = ocr(directory / 'printed.png')
            math_table, math_stats = ocr(directory / 'equation-table.png')
            results.append({
                'embedded': poppler, 'rasterize': raster_stats, 'scanned': scan_stats,
                'printed': printed_stats, 'equation_table': math_stats,
            })
        raw_page_one, _ = run('pdftotext', '-raw', '-f', '1', '-l', '1', pdf, '-')
        make_preview(directory, page_one, page_two)
        _, compile_stats = run('tectonic', '--only-cached', '--untrusted', '-o', str(scratch), str(directory / 'main.tex'))
        compiled, _ = run('pdftotext', str(scratch / 'main.pdf'), '-')
        math_lines = [re.sub(r'\s+', '', line) for line in math_table.splitlines() if '=' in line]
        report = {
            'embedded': score(embedded_ref, page_one),
            'embedded_order_correct': normalized(page_one) == normalized(' '.join(embedded_ref)),
            'embedded_raw_fixture_order_correct': normalized(raw_page_one) == normalized(' '.join(embedded_ref)),
            'scanned_text_layer_empty': not blank_text.strip(),
            'scanned': score(SCAN, page_two),
            'printed': score(PRINTED, printed_text),
            'equations_exact': sum(line in math_lines for line in EQUATIONS),
            'equations_total': len(EQUATIONS),
            'equation_characters': score(EQUATIONS, ' '.join(math_lines)),
            'table_lines_retained': sum(line in {normalized(line) for line in math_table.splitlines()} for line in TABLE),
            'table_lines_total': len(TABLE),
            'structured_table_recovered': False,
            'raw_equation_table_ocr': math_table.strip(),
            'compile_retained_text': LEFT_COLUMN[0] in normalized(compiled) and SCAN[0] in normalized(compiled),
            'resources': results,
            'compile': compile_stats,
        }
        (directory / 'measurements.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'Review {directory / "main.tex"} and loss-report.txt and compare mixed.pdf.')
    print(f'Preview acceptance digest: {preview_digest(directory)}')


def accept(directory, digest):
    if digest != preview_digest(directory):
        raise SystemExit('Preview changed or confirmation is missing. Review the source and report first.')
    with ZipFile(directory / 'accepted-extraction.zip', 'x', compression=ZIP_DEFLATED) as archive:
        for source, target in [('main.tex', 'main.tex'), ('loss-report.txt', 'loss-report.txt'), ('mixed.pdf', 'original.pdf')]:
            archive.write(directory / source, target)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--tesseract', default='tesseract')
    parser.add_argument('--accept-preview')
    args = parser.parse_args()
    if args.accept_preview:
        accept(args.directory, args.accept_preview)
    else:
        args.directory.mkdir(parents=True, exist_ok=False)
        benchmark(args.directory, args.tesseract)
