// Generates the platform's logos, favicons and app icons.
//
//   cd tools/branding && npm install && npm run generate
//
// Output files keep the upstream file names (e.g. overleaf-white.svg) so that
// no stylesheet or component has to change when the artwork changes.
// See README.md in this directory for the list of files and where they are used.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fontkit from 'fontkit'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = path.join(ROOT, 'services/web')
const FONTS = path.join(WEB, 'frontend/fonts')

// ---------------------------------------------------------------------------
// Brand settings
// ---------------------------------------------------------------------------

const NAME = 'IIT Mandi' // set in front of the LaTeX logo in the wordmark
const TAGLINE = 'Collaborative LaTeX writing at IIT Mandi'

const C = {
  navy: '#00237d', // IIT Mandi website header
  orange: '#ff652f', // IIT Mandi website accent
  brand50: '#2b5cc7', // $brand-50 in frontend/stylesheets/foundations/colors.scss
  white: '#ffffff',
  ink: '#1b222c', // $neutral-90
  grey: '#9b9b9b',
  positive: '#098842', // $positive-50
  warning: '#de8014', // $yellow-40
  danger: '#b83a33', // $red-50
}

const sans = fontkit.openSync(path.join(FONTS, 'noto-sans/NotoSans-SemiBold.woff2'))
const serif = fontkit.openSync(path.join(FONTS, 'merriweather/Merriweather-Bold.woff2'))

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const f = n => (Math.round(n * 100) / 100).toString()

// Intersection of the lines p1 + t*d1 and p2 + s*d2.
function intersect([p1, d1], [p2, d2]) {
  const den = d1[0] * d2[1] - d1[1] * d2[0]
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
  return [p1[0] + t * d1[0], p1[1] + t * d1[1]]
}

// The M: a polyline through two peaks (the M's humps) and the valley between
// them, stroked with mitred joins and cut at a flat baseline. Returned as an
// explicit polygon on a 64x64 grid, so it renders the same everywhere.
function mPolygon({ halfWidth = 4.3, baseline = 52 } = {}) {
  const pts = [
    [9, 56],
    [20.5, 16],
    [32, 38],
    [43.5, 16],
    [55, 56],
  ]
  const segs = pts.slice(1).map((p, i) => {
    const d = [p[0] - pts[i][0], p[1] - pts[i][1]]
    const len = Math.hypot(d[0], d[1])
    return { a: pts[i], d, n: [-d[1] / len, d[0] / len] }
  })
  const side = sign =>
    segs.map(s => [
      [s.a[0] + sign * halfWidth * s.n[0], s.a[1] + sign * halfWidth * s.n[1]],
      s.d,
    ])
  const base = [
    [0, baseline],
    [1, 0],
  ]
  const outline = sign => {
    const lines = side(sign)
    const out = [intersect(lines[0], base)]
    for (let i = 0; i < lines.length - 1; i++) {
      out.push(intersect(lines[i], lines[i + 1]))
    }
    out.push(intersect(lines[lines.length - 1], base))
    return out
  }
  return [...outline(1), ...outline(-1).reverse()]
}

const M_POLY = mPolygon()
const SUN = { cx: 32, cy: 14, r: 4.4 }

function markBounds() {
  const xs = M_POLY.map(p => p[0])
  const ys = M_POLY.map(p => p[1])
  return {
    minX: Math.min(...xs, SUN.cx - SUN.r),
    minY: Math.min(...ys, SUN.cy - SUN.r),
    maxX: Math.max(...xs, SUN.cx + SUN.r),
    maxY: Math.max(...ys, SUN.cy + SUN.r),
  }
}
const MB = markBounds()
const MARK_W = MB.maxX - MB.minX
const MARK_H = MB.maxY - MB.minY

// The mark scaled by `s` with its bounding box's top-left corner at (x, y).
function mark({ fg, sun }, x = 0, y = 0, s = 1) {
  const tx = px => f(x + (px - MB.minX) * s)
  const ty = py => f(y + (py - MB.minY) * s)
  const d = 'M' + M_POLY.map(([px, py]) => `${tx(px)} ${ty(py)}`).join('L') + 'Z'
  return (
    `<circle cx="${tx(SUN.cx)}" cy="${ty(SUN.cy)}" r="${f(SUN.r * s)}" fill="${sun}"/>` +
    `<path d="${d}" fill="${fg}"/>`
  )
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function boundsOf(paths) {
  const b = paths.map(p => p.bbox)
  return {
    minX: Math.min(...b.map(x => x.minX)),
    minY: Math.min(...b.map(x => x.minY)),
    maxX: Math.max(...b.map(x => x.maxX)),
    maxY: Math.max(...b.map(x => x.maxY)),
  }
}

// Glyph outlines for `text`, in a y-down coordinate system with the baseline
// at y=0 and the given font size.
function textRun(font, text, size, x0 = 0, y0 = 0) {
  const s = size / font.unitsPerEm
  const run = font.layout(text)
  const paths = []
  let x = x0
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i]
    paths.push(
      glyph.path.transform(s, 0, 0, -s, x + pos.xOffset * s, y0 - pos.yOffset * s)
    )
    x += pos.xAdvance * s
  })
  return { paths, advance: x - x0 }
}

// The LaTeX logo: L, raised small A, T, lowered E, X.
function latexLogo(font, size, x0 = 0) {
  const paths = []
  let x = x0
  const put = (ch, sz, dy, kernAfter) => {
    const r = textRun(font, ch, sz, x, dy)
    paths.push(...r.paths)
    x += r.advance + kernAfter * size
  }
  put('L', size, 0, -0.33)
  put('A', size * 0.75, -0.22 * size, -0.11)
  put('T', size, 0, -0.1)
  put('E', size, 0.2155 * size, -0.09)
  put('X', size, 0, 0)
  return { paths, advance: x - x0 }
}

const toD = paths => paths.map(p => p.toSVG()).join('')

// ---------------------------------------------------------------------------
// Compositions
// ---------------------------------------------------------------------------

const svg = (w, h, body, vb = `0 0 ${f(w)} ${f(h)}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="${vb}">${body}</svg>\n`

const THEMES = {
  // [M + sun, "IIT Mandi", LaTeX logo]
  onLight: { mark: { fg: C.navy, sun: C.orange }, name: C.navy, latex: C.brand50 },
  onDark: { mark: { fg: C.white, sun: C.orange }, name: C.white, latex: C.white },
  mono: { mark: { fg: C.ink, sun: C.ink }, name: C.ink, latex: C.ink },
}

// The mark on its own, cropped to its bounds; `width` is the intrinsic size in px.
function glyph({ fg, sun }, width = 136, pad = 1) {
  const s = width / (MARK_W + 2 * pad)
  const h = (MARK_H + 2 * pad) * s
  return svg(width, h, mark({ fg, sun }, pad * s, pad * s, s))
}

// App icon: the mark in white on an IIT Mandi navy tile.
function appIcon({ size = 64, radius = 14, badge = null } = {}) {
  const s = (size * 0.66) / MARK_W
  const x = (size - MARK_W * s) / 2
  const y = (size - MARK_H * s) / 2
  let body =
    `<rect width="${size}" height="${size}" rx="${f((radius * size) / 64)}" fill="${C.navy}"/>` +
    mark({ fg: C.white, sun: C.orange }, x, y, s)
  if (badge) body += statusBadge(badge, size)
  return svg(size, size, body)
}

// Compile status shown on the favicon while a project is open.
function statusBadge(kind, size) {
  const k = size / 64
  const cx = 48 * k
  const cy = 48 * k
  const r = 15 * k
  const fill = { compiling: C.warning, compiled: C.positive, error: C.danger }[kind]
  const stroke = `stroke="${C.white}" stroke-width="${f(4 * k)}" stroke-linecap="round" stroke-linejoin="round" fill="none"`
  const icon = {
    compiled: `<path d="M${f(41 * k)} ${f(48.5 * k)}L${f(46 * k)} ${f(53.5 * k)}L${f(55.5 * k)} ${f(43 * k)}" ${stroke}/>`,
    error: `<path d="M${f(42.5 * k)} ${f(42.5 * k)}L${f(53.5 * k)} ${f(53.5 * k)}M${f(53.5 * k)} ${f(42.5 * k)}L${f(42.5 * k)} ${f(53.5 * k)}" ${stroke}/>`,
    compiling: `<path d="M${f(55 * k)} ${f(48 * k)}A${f(7 * k)} ${f(7 * k)} 0 1 1 ${f(48 * k)} ${f(41 * k)}" ${stroke}/>`,
  }[kind]
  return (
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r + 2.5 * k)}" fill="${C.white}"/>` +
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"/>` +
    icon
  )
}

// Horizontal wordmark: mark, "IIT Mandi", LaTeX logo.
function wordmark(theme) {
  const size = 40
  const name = textRun(sans, NAME, size)
  const latex = latexLogo(serif, size * 1.02, name.advance + size * 0.3)
  const tb = boundsOf([...name.paths, ...latex.paths])
  const textH = tb.maxY - tb.minY
  const s = (textH * 1.45) / MARK_H
  const gap = size * 0.32
  const pad = 2
  const w = MARK_W * s + gap + (tb.maxX - tb.minX) + 2 * pad
  const h = Math.max(MARK_H * s, textH) + 2 * pad
  const tx = pad + MARK_W * s + gap - tb.minX
  const ty = (h - textH) / 2 - tb.minY
  const body =
    mark(theme.mark, pad, (h - MARK_H * s) / 2, s) +
    `<g transform="translate(${f(tx)} ${f(ty)})">` +
    `<path d="${toD(name.paths)}" fill="${theme.name}"/>` +
    `<path d="${toD(latex.paths)}" fill="${theme.latex}"/>` +
    `</g>`
  return svg(w, h, body)
}

// Stacked lockup for square-ish slots: mark beside "IIT Mandi" over the LaTeX logo.
function stacked(theme) {
  const size = 40
  const name = textRun(sans, NAME, size)
  const latex = latexLogo(serif, size * 1.3, 0)
  const nb = boundsOf(name.paths)
  const lb = boundsOf(latex.paths)
  const lineGap = size * 0.32
  const textW = Math.max(nb.maxX - nb.minX, lb.maxX - lb.minX)
  const textH = nb.maxY - nb.minY + lineGap + (lb.maxY - lb.minY)
  const s = textH / MARK_H
  const gap = size * 0.4
  const contentW = MARK_W * s + gap + textW
  // Keep the upstream canvas proportions (425 x 192) so existing <img> sizes still fit.
  const h = textH * 1.3
  const w = Math.max(contentW * 1.1, (h * 425) / 192)
  const x0 = (w - contentW) / 2
  const y0 = (h - textH) / 2
  const tx = x0 + MARK_W * s + gap
  const body =
    mark(theme.mark, x0, y0, s) +
    `<g transform="translate(${f(tx - nb.minX)} ${f(y0 - nb.minY)})"><path d="${toD(name.paths)}" fill="${theme.name}"/></g>` +
    `<g transform="translate(${f(tx - lb.minX)} ${f(y0 + nb.maxY - nb.minY + lineGap - lb.minY)})"><path d="${toD(latex.paths)}" fill="${theme.latex}"/></g>`
  return svg(w, h, body)
}

// Single line of text, centred on a fixed canvas (used for the email tagline).
function taglineSvg(w, h, color) {
  const size = h * 0.56
  const run = textRun(sans, TAGLINE, size)
  const b = boundsOf(run.paths)
  const tx = (w - (b.maxX - b.minX)) / 2 - b.minX
  const ty = (h - (b.maxY - b.minY)) / 2 - b.minY
  return svg(w, h, `<g transform="translate(${f(tx)} ${f(ty)})"><path d="${toD(run.paths)}" fill="${color}"/></g>`)
}

// ---------------------------------------------------------------------------
// Raster output
// ---------------------------------------------------------------------------

// Render an SVG string into a w x h PNG, fitting it inside with optional padding.
async function png(svgText, w, h, { pad = 0, background = null } = {}) {
  const inner = await sharp(Buffer.from(svgText), { density: 600 })
    .resize(Math.round(w - 2 * pad), Math.round(h - 2 * pad), {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

// ICO container holding PNG images (supported by every current browser).
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = header.length
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, e)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1)
    header.writeUInt8(0, e + 2)
    header.writeUInt8(0, e + 3)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(data.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...pngs.map(p => p.data)])
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

const written = []
function write(rel, data) {
  const file = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data)
  written.push(rel)
}

const W = 'services/web'
const wmLight = wordmark(THEMES.onLight)
const wmDark = wordmark(THEMES.onDark)

// Wordmarks (navbar, footer, interstitial pages)
for (const dir of [`${W}/frontend/js/shared/svgs`, `${W}/public/img/ol-brand`]) {
  write(`${dir}/overleaf-white.svg`, wmDark)
  write(`${dir}/overleaf-green.svg`, wmLight)
  write(`${dir}/overleaf.svg`, wmLight)
  write(`${dir}/overleaf-black.svg`, wordmark(THEMES.mono))
  write(`${dir}/overleaf-a-ds-solution-mallard.svg`, stacked(THEMES.onLight))
}
write(`${W}/frontend/js/shared/svgs/overleaf-a-ds-solution-mallard-dark.svg`, stacked(THEMES.onDark))

// The mark on its own (editor toolbar, loading screen, password pages, invites)
write(`${W}/public/img/ol-brand/overleaf-o.svg`, glyph(THEMES.onLight.mark))
write(`${W}/public/img/ol-brand/overleaf-o-dark.svg`, glyph(THEMES.onLight.mark))
write(`${W}/public/img/ol-brand/overleaf-o-white.svg`, glyph(THEMES.onDark.mark))
write(`${W}/public/img/ol-brand/overleaf-o-grey.svg`, glyph({ fg: C.grey, sun: C.grey }))
write(`${W}/frontend/js/shared/svgs/overleaf-logo.svg`, glyph(THEMES.onLight.mark, 104))

// App icon and favicons
write(`${W}/public/overleaf-logo.svg`, appIcon())
write(`${W}/public/favicon.svg`, appIcon())
for (const kind of ['compiling', 'compiled', 'error']) {
  write(`${W}/public/favicon-${kind}.svg`, appIcon({ badge: kind }))
}
write(`${W}/public/mask-favicon.svg`, glyph({ fg: '#000000', sun: '#000000' }))

const icon = appIcon()
const fullBleed = appIcon({ radius: 0 })
const icoImages = []
for (const size of [16, 32, 48]) {
  icoImages.push({ size, data: await png(icon, size, size) })
}
write(`${W}/public/favicon.ico`, ico(icoImages))
write(`${W}/public/favicon-16x16.png`, icoImages[0].data)
write(`${W}/public/favicon-32x32.png`, icoImages[1].data)
write(`${W}/public/apple-touch-icon.png`, await png(fullBleed, 180, 180))
write(`${W}/public/img/ol-brand/overleaf_og_logo.png`, await png(fullBleed, 256, 256))

// Emails (only used when the site runs in SaaS mode) and other raster logos
const white = { r: 255, g: 255, b: 255, alpha: 1 }
write(`${W}/public/img/ol-brand/email-logo@2x.png`, await png(wmLight, 277, 80, { pad: 6 }))
write(`${W}/public/img/ol-brand/logo-horizontal.png`, await png(wmLight, 410, 180, { pad: 30, background: white }))
write(`${W}/public/img/ol-brand/email-footer-tagline@2x.png`, await png(taglineSvg(904, 50, C.navy), 904, 50))

console.log(`Wrote ${written.length} files:\n  ${written.join('\n  ')}`)
