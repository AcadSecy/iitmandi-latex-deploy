# Local PDF and image extraction feasibility

**Decision:** No-go for automatic PDF or image conversion to structured LaTeX. A text-only draft for clean printed pages merits a bounded pilot with explicit review. The examined tools either lose layout and math or need separate model, license and hardware evaluation.

## Existing deployment

The project ZIP route in `services/web/app/src/Features/Uploads/UploadsRouter.mjs` accepts a new upload through the authenticated project importer. The per-project upload route can keep an original image or PDF as an asset. It requires project write access. The optional Pandoc routes in the same router send supported document formats to CLSI through `DocumentConversionManager.mjs`. The checked `deploy/server` configuration does not enable Pandoc conversions or configure an OCR worker. The existing `pdftocairo` converter rasterizes PDFs for display. These paths establish ZIP import, file storage and rasterization. OCR, reading-order reconstruction and math recognition each need separate validation. The conversion issues #46 and #53 had no linked benchmark findings in their GitHub conversations when this spike ran.

## Measurements on the synthetic fixtures

Ran on Ubuntu 26.04, x86-64, Ryzen 5 5600H, with Poppler 26.01.0 `pdftotext`, Tesseract 5.5.0 and Ubuntu English `eng.traineddata`. The OCR process used one OpenMP thread and no GPU. Each extraction ran three times. Peak resident memory is the highest sample per process, while wall and CPU times are medians. The CER uses Levenshtein distance over whitespace-normalized text. It counts reading-order changes, so the embedded-text score measures an ordering failure even when the words are readable.

| Input and path | Edit or structure result | Wall / CPU | Peak RSS |
| --- | --- | --- | --- |
| Mixed PDF page 1, embedded text | 46 edits / 134 characters (34.3%). Default reading order interleaved the columns. `-raw` recovered this fixture's order because its content stream was written column by column. | 0.01 s / below 0.01 s | 19.5 MiB |
| Mixed PDF page 2, 150 DPI rasterization | PDF text layer empty. OCR required. | 0.02 s / 0.02 s | 14.0 MiB |
| Mixed PDF page 2, OCR | 0 / 92 edits. All three lines in order. | 0.15 s / 0.14 s | 42.2 MiB |
| Printed PNG, OCR | 0 / 119 edits, including `50%` and `A&B`. | 0.14 s / 0.13 s | 37.2 MiB |
| Equation and ruled-table PNG, OCR | 0 / 2 equations exact and 6 / 14 equation characters wrong (42.9%). Zero of three table lines retained. No table structure recovered. | 0.11 s / 0.10 s | 35.7 MiB |
| Mixed PDF editable draft, cached Tectonic 0.15.0 | Compiled successfully. PDF contained known text from both pages. Compiling did not correct the wrong column order. | 0.43 s / 0.42 s | 168.7 MiB |

The two OCR prose results describe clean, synthetic English only. Handwriting, Hindi, poor scans, mixed scripts and complex figures remain unmeasured. PDF and image fixtures total about 51 KiB. The English OCR model is 4,113,088 bytes. The locally unpacked Tesseract packages and extra shared libraries total about 12 MiB, excluding Poppler and shared system dependencies. Repeated extraction and compilation also succeeded in a Linux network namespace with no network access. The Institute host is x86-64 with 48 logical CPUs and approximately 61 GiB RAM. Neither extractor was present in the host shell and no run or model installation was performed there. These timings do not predict server capacity. The laptop's AMD RX 6500M was unused, and accelerator throughput and library support on either target remain unverified.

## Local candidates and redistribution

| Candidate | Appropriate use | License and resource evidence |
| --- | --- | --- |
| Poppler CLI | Extract existing PDF text and get layout cues without model weights. Rasterize image-only pages in a separate step. | GPL-family distribution terms apply to bundled Poppler and dependencies. Use distribution packages and retain the package notices. [Poppler project](https://poppler.freedesktop.org/) |
| Tesseract with an English model | Printed text from selected page regions or scans. The measured run shows why plain OCR output needs explicit uncertainty and why it cannot reconstruct math or tables. | Apache-2.0 engine and fast model family. Preserve notices if redistributed. Native CPU execution verified locally. [Engine](https://github.com/tesseract-ocr/tesseract) · [Fast model license](https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE) |
| pix2tex | A future study for explicit, cropped equation images. It does not address document reading order or table layout. | MIT software repository. The upstream release lists approximately 116 MiB for its two checkpoints combined, excluding PyTorch. Confirm redistribution terms for the specific weights before bundling. Hardware, memory and accuracy unmeasured here. [Project and requirements](https://github.com/lukas-blecher/LaTeX-OCR) · [Release assets](https://github.com/lukas-blecher/LaTeX-OCR/releases/tag/v0.0.1) |
| Nougat | Whole-page research candidate. Its model output would still need independent reading-order, formula and table checks. | MIT software with separate CC BY-NC 4.0 model terms. Keep weights out of the application image and require license review for institutional redistribution. Model size, memory use and local runtime unverified in this spike. [Project](https://github.com/facebookresearch/nougat) · [Model license](https://github.com/facebookresearch/nougat/blob/main/LICENSE-MODEL.md) |

## Preview and explicit acceptance

[The fixture script](fixtures/extraction-71.py) produces the original PDF, editable `main.tex`, a plain-text loss report and measurement JSON in a fresh directory. It accepts only generated fixtures. The draft escapes TeX special characters in extracted prose and adds page headings. Its report calls out uncertain reading order and scanned text and records that equations, tables, links, images and attachments were omitted from the draft.

An acceptance command creates a new ZIP only after receiving the displayed digest for the exact source, loss report and original. The test checked that generation alone creates no ZIP, a changed source invalidates earlier acceptance, the archive retains source text and the byte-identical original, and repeat acceptance cannot overwrite an existing archive. The ZIP is the input for the existing New Project upload flow. The rehearsal stopped at archive generation and compilation. It did not create an Institute project. A pilot should show the original and editable source side by side, flag regions needing review and give the user a separate **Create new project** action. Cancellation should discard the preview and leave existing projects untouched.

```bash
python3 doc/testing/fixtures/extraction-71.py /tmp/latex-extraction-demo
python3 doc/testing/fixtures/extraction-71.py /tmp/latex-extraction-demo --accept-preview <digest>
```

The harness requires Python with Pillow and ReportLab, DejaVu fonts, Poppler, Tesseract with English data and a cached Tectonic bundle. Intermediate raster and compile files use an automatically cleaned temporary directory. Commands time out after 25 seconds and cancellation terminates their process group.

## Bounded follow-up

Allow only selected, clean text-only pages in an internal pilot. Start with 10 MiB input, 10 pages, 4 megapixels per page and one job per user. Before accepting real uploads, run parser/OCR work in a networkless, unprivileged worker with a read-only root, per-job scratch, no credential mounts, a bounded queue, and independent CPU, RAM and output/decompression limits. Enforce file signatures, dimensions and page limits before generating rasters. Process raster pages individually, ignore active actions, links and embedded attachments, and confirm cleanup on timeout, cancellation and restart. Escape OCR to text and keep TeX compilation within the existing compile sandbox. These production limits and the worker are proposed rather than deployed.

Budget two engineering days for the worker and importer integration, and one to two days for the preview and Institute acceptance sweep. Test mixed English and Hindi, multi-column order, rotation, partial text layers, low contrast and manual cancellation on synthetic fixtures. Record performance from the actual target before choosing capacity. Until then, keep the original PDF or image as a reference asset and retype equations and tables from it in a new project. Prefer the original `.tex` or a source ZIP where one exists.
