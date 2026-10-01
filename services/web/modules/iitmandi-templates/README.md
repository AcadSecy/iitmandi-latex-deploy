# IIT Mandi templates

LaTeX templates for the IIT Mandi template gallery, and the script that publishes them.

| Folder | Gallery name | Category | Notes |
|---|---|---|---|
| `thesis` | IIT Mandi Thesis | thesis | PhD, MS (by Research), M.Tech (by Research), I-PhD |
| `project-report` | IIT Mandi Project Report | report | DP, ISTP, MTP, M.Tech and M.Sc projects; one or more students |
| `lab-report` | IIT Mandi Lab Report | report | |
| `assignment` | IIT Mandi Assignment | homework | Problems with marks, and solutions |
| `presentation` | IIT Mandi Presentation | presentation | Beamer theme in `beamerthemeIITMandi.sty` |
| `poster` | IIT Mandi Research Poster | poster | A0 portrait (tikzposter) |
| `formal-letter` | IIT Mandi Formal Letter | formal-letter | A personal letter, not the official letterhead |
| `cv` | IIT Mandi Resume | cv | One page, for placements and internships |

Each folder is one template. Its `template.json` gives the gallery name, category, description, license (`lppl_1.3c`, `cc_by_4.0` or `other`), main file and compiler, and lists the files it uses from `templates/shared`:

- `iitmandi-logo.jpg`: the Institute logo, from the official logo page (<https://www.iitmandi.ac.in/institute/iitmandilogo>), resized to 1600 px.
- `iitmandi-thesis.cls`: the class for the thesis and the project report. Page geometry, fonts and spacing are set in one place at the top.

These files live in the image under `/overleaf/services/web/modules/iitmandi-templates`, so the publish script can reach them.

## Editing a template

1. Edit the files in its folder (or in `shared`).
2. Build it locally:

   ```sh
   node scripts/assemble.mjs /tmp/templates thesis   # copies the template and its shared files
   cd /tmp/templates/thesis && latexmk -pdf main.tex
   ```

3. CI compiles every template with the platform's TeX Live image (job "Templates") and fails on errors and undefined references.
4. Publish again (below). The gallery keeps the template's name and gives it a new version.

## Publishing to the gallery

Turn on the gallery first (`OVERLEAF_TEMPLATE_GALLERY=true`). Then, inside the app container, run this as the user who should own the templates: an admin, or the user in `OVERLEAF_TEMPLATES_USER_ID`.

```sh
cd /overleaf/services/web
node modules/iitmandi-templates/scripts/publish-templates.mjs --owner=templates@iitmandi.ac.in
```

With the Toolkit: `bin/run-script modules/iitmandi-templates/scripts/publish-templates.mjs --owner=...`.

Options:

- `--only=thesis,cv` publishes only some templates.
- `--dry-run` lists what would be published.
- `--keep-projects` keeps the projects the script builds the templates from; by default they are deleted.

For each template, the script imports the folder as a project, sets its compiler and main file, compiles it, and publishes the project with its PDF preview. A template that fails to compile is reported and skipped.

## Where the format comes from

The official thesis-format circular is on the intranet and was not available, so the thesis and project report follow:

- an IIT Mandi MS (by Research) thesis from the School of Computing and Electrical Engineering (2023): title-page order and wording, the scholar's declaration and the supervisor's certificate, 12 pt type, 1.5 line spacing, one-sided printing, and a list of publications at the end;
- the Ph.D. Ordinance (2026 onwards), R.22: a plagiarism report must accompany the thesis, with at most 20% overall similarity and 2% from any single source. The thesis template reminds students of this;
- the Institute's official documents for the name, address (Kamand, Mandi, Himachal Pradesh 175075) and logo.

The declaration and certificate are written for these templates, not copied from another document. Times (via `newtx`) and the margins (30 mm left, 25 mm elsewhere) are common conventions, chosen because the IIT Mandi example does not fix them.

## Open questions for the Academic Section

- Confirm or correct the thesis format: margins, font, spacing, title-page wording, and whether a Hindi title or abstract is needed.
- Whether an official letterhead template should be offered, and who may use it. The `formal-letter` template deliberately does not reproduce the letterhead.
- Whether the Career and Placement Cell prescribes a resume format.
