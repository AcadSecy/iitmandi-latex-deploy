# Branding

Logos, icons and colours for IIT Mandi LaTeX, and the scripts that keep them consistent.

## Colours

The palette lives in `services/web/frontend/stylesheets/foundations/colors.scss`:

| Token | Value | Use |
| --- | --- | --- |
| `$iitm-navy` | `#00237d` | Navbar, app icon (IIT Mandi website header colour) |
| `$iitm-orange` | `#ff652f` | The sun in the logo (IIT Mandi website accent) |
| `$brand-10` … `$brand-70` | `#edf3fe` … `#093495` | Accent: primary buttons, links, selected items, active tabs |
| `$positive-10` … `$positive-70` | `#eaf6ef` … `#195936` | Success states (kept green on purpose) |

Upstream styles refer to the accent as `$green-*` / `var(--green-*)`. Those names are aliases of `$brand-*`, so upstream stylesheets pick up the brand colour without changes. Use `$positive-*` for anything that means "success".

Email colours are in `services/web/app/src/Features/Email/emailStyles.mjs`.

## Logos and icons

`generate.mjs` draws every logo and icon from code, using fonts that ship with the web app (Noto Sans SemiBold for "IIT Mandi", Merriweather Bold for the LaTeX logo). The mark is an "M" whose two humps are mountain peaks, with the sun rising over the valley.

```sh
cd tools/branding
npm install
npm run generate
```

This overwrites the files below. They keep their upstream file names, so no stylesheet or component needs to change when the artwork does.

| Files | Used for |
| --- | --- |
| `overleaf-white.svg`, `overleaf-green.svg`, `overleaf.svg`, `overleaf-black.svg` (in `frontend/js/shared/svgs` and `public/img/ol-brand`) | Horizontal wordmark: navbar (white on navy), light navbar, interstitial pages, footer |
| `overleaf-a-ds-solution-mallard(-dark).svg` | Stacked lockup in the project list sidebar (light and dark theme) |
| `public/img/ol-brand/overleaf-o*.svg`, `frontend/js/shared/svgs/overleaf-logo.svg` | The mark on its own: editor toolbar, loading screen, password pages, invites |
| `public/favicon*.svg`, `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` | Browser tab icon; the editor swaps in the compiling / compiled / error variants |
| `public/apple-touch-icon.png`, `public/overleaf-logo.svg`, `public/mask-favicon.svg` | Home-screen icon, web app manifest icon, Safari pinned tab |
| `public/img/ol-brand/overleaf_og_logo.png` | Link previews |
| `public/img/ol-brand/email-*.png`, `logo-horizontal.png` | Email header and footer (only used in SaaS mode; Community Edition emails use the app name as text) |

To change the name or colours, edit the settings at the top of `generate.mjs`, run it, and review the result before committing. If you only change the app name (`OVERLEAF_APP_NAME`), the wordmark still shows the old name until you regenerate it; set `OVERLEAF_NAV_TITLE` to show text in the navbar instead.

## Locale strings

```sh
node tools/branding/rebrand-locales.mjs          # rewrite
node tools/branding/rebrand-locales.mjs --check  # CI: fail if any string needs rewriting
```

Replaces the upstream product name in `services/web/locales/*.json` with `__appName__`, which the UI fills in from `settings.appName`. Run it after merging upstream changes. CI runs the `--check` form.
