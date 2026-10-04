// usage-line — launch film.
//
// Every frame is drawn here, in code, with Skia (@napi-rs/canvas): no editor, no templates,
// no footage. Each output frame averages several sub-frames across a 180° shutter for real
// motion blur, and the raw pixels go straight into ffmpeg. The score is score.py.
//
//   node render.mjs                     render the film (parallel chunks) → out/usage-line.mp4
//   node render.mjs --still 6.5,12.8    write single frames → out/stills/
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

import { DUR, S } from './timeline.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
const W = 1920
const H = 1080
const FPS = 60
const SAMPLES = 6
const SHUTTER = 0.5

for (const [file, family] of [
  ['SC-Light.ttf', 'SC Light'],
  ['SC-Regular.ttf', 'SC Regular'],
  ['SC-Medium.ttf', 'SC Medium'],
  ['SC-Black.ttf', 'SC Black'],
  ['Mono-Regular.ttf', 'Mono'],
  ['Mono-SemiBold.ttf', 'Mono SemiBold'],
  ['Serif-Italic.ttf', 'Serif Italic'],
]) GlobalFonts.registerFromPath(path.join(HERE, 'fonts', file), family)

const F = {
  light: s => `${s}px "SC Light"`,
  reg: s => `${s}px "SC Regular"`,
  med: s => `${s}px "SC Medium"`,
  black: s => `${s}px "SC Black"`,
  mono: s => `${s}px "Mono", "SC Regular"`,
  monoB: s => `${s}px "Mono SemiBold", "SC Medium"`,
  serif: s => `${s}px "Serif Italic"`,
}

// ── palette: the plugin's own ring colours on a warm graphite ground ──────────────────────
const BG = '#121110'
const SURFACE = '#1b1a18'
const SURFACE2 = '#23211e'
const FG = '#ece9e2'
const DIM = '#8c8780'
const FAINT = '#56524c'
const BLUE = '#4e8ff7'
const AMBER = '#e5a33a'
const RED = '#e5534b'
const GREY = '#8a8a8a'

const TAU = Math.PI * 2
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, p) => a + (b - a) * p
const prog = (t, a, b) => clamp((t - a) / (b - a))
const E = {
  lin: p => p,
  outCubic: p => 1 - (1 - p) ** 3,
  inCubic: p => p ** 3,
  inOutCubic: p => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  outQuint: p => 1 - (1 - p) ** 5,
  outExpo: p => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  inExpo: p => (p <= 0 ? 0 : 2 ** (10 * p - 10)),
  inOutExpo: p => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (-20 * p + 10)) / 2),
  inQuad: p => p * p,
  outBack: p => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2,
  inOutSine: p => -(Math.cos(Math.PI * p) - 1) / 2,
}
const tw = (t, a, b, ease = E.outCubic) => ease(prog(t, a, b))
// Piecewise keys: [[t, v], [t, v, ease], ...]; each segment eases into its own key.
function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1]
  for (let i = 1; i < ks.length; i++) {
    const [t1, v1, ease = E.inOutCubic] = ks[i]
    const [t0, v0] = ks[i - 1]
    if (t <= t1) return lerp(v0, v1, ease(prog(t, t0, t1)))
  }
  return ks[ks.length - 1][1]
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const rgba = (hex, a = 1) => `rgba(${rgb(hex).join(',')},${a})`
const mix = (h1, h2, p) => {
  const a = rgb(h1)
  const b = rgb(h2)
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(p))).toString(16).padStart(2, '0')).join('')
}
const ringColor = p => (p >= 90 ? RED : p >= 70 ? AMBER : BLUE)

// ── the plugin's figures, formatted exactly as the plugin formats them ─────────────────────
const clockText = sec => {
  const s = Math.max(0, Math.ceil(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function span(min) {
  const m = Math.max(0, Math.round(min))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d) return `${d}d${h}h`
  if (h) return `${h}h${m % 60}m`
  return `${m}m`
}

// ── drawing primitives ─────────────────────────────────────────────────────────────────────
function withAlpha(ctx, a, fn) {
  if (a <= 0.001) return
  ctx.save()
  ctx.globalAlpha *= a
  fn()
  ctx.restore()
}

// No font here carries ↻, so it is drawn: an open circle arrow, clockwise, one em wide.
const RELOAD = '↻'
const fontPx = font => Number(/(\d+(?:\.\d+)?)px/.exec(font)[1])
function reloadGlyph(ctx, x, y, px) {
  const r = px * 0.3
  const cx = x + px * 0.42
  const cy = y - px * 0.34
  const a0 = -Math.PI * 0.62
  const a1 = a0 + Math.PI * 1.62
  ctx.save()
  ctx.lineWidth = Math.max(1.4, px * 0.075)
  ctx.lineCap = 'round'
  ctx.strokeStyle = ctx.fillStyle
  ctx.beginPath()
  ctx.arc(cx, cy, r, a0, a1)
  ctx.stroke()
  // arrowhead at the start of the arc, pointing on clockwise
  const hx = cx + Math.cos(a0) * r
  const hy = cy + Math.sin(a0) * r
  const tx = -Math.sin(a0)
  const ty = Math.cos(a0)
  const k = px * 0.17
  ctx.beginPath()
  ctx.moveTo(hx + tx * k * 1.1, hy + ty * k * 1.1)
  ctx.lineTo(hx - ty * k - tx * k * 0.2, hy + tx * k - ty * k * 0.2)
  ctx.lineTo(hx + ty * k - tx * k * 0.2, hy - tx * k - ty * k * 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function measure(ctx, str, font) {
  ctx.font = font
  if (!str.includes(RELOAD)) return ctx.measureText(str).width
  return str.split(RELOAD).reduce((w, part, i) => w + ctx.measureText(part).width + (i ? fontPx(font) * 0.84 : 0), 0)
}

function text(ctx, str, x, y, font, color, { align = 'left', alpha = 1, baseline = 'alphabetic', blur = 0 } = {}) {
  if (alpha <= 0.001) return
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = baseline
  if (blur > 0.2) ctx.filter = `blur(${blur.toFixed(2)}px)`
  if (!str.includes(RELOAD)) {
    ctx.textAlign = align
    ctx.fillText(str, x, y)
  } else {
    const w = measure(ctx, str, font)
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    ctx.textAlign = 'left'
    str.split(RELOAD).forEach((part, i) => {
      if (i) {
        reloadGlyph(ctx, cx, y, fontPx(font))
        cx += fontPx(font) * 0.84
      }
      ctx.fillText(part, cx, y)
      cx += ctx.measureText(part).width
    })
  }
  ctx.restore()
}

// Character-by-character entrance: each glyph rises, sharpens and fades in, staggered.
function reveal(ctx, str, x, y, font, color, p, o = {}) {
  const { align = 'left', dy = 36, spread = 5, blur = 10, alpha = 1, ease = E.outCubic } = o
  if (p <= 0 || alpha <= 0.001) return
  if (p >= 1) return text(ctx, str, x, y, font, color, { align, alpha })
  ctx.font = font
  const chars = [...str]
  const widths = chars.map(c => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  const n = chars.length
  chars.forEach((c, i) => {
    const q = ease(clamp((p * (n + spread) - i) / spread))
    if (q > 0.001) text(ctx, c, cx, y + (1 - q) * dy, font, color, { alpha: alpha * q, blur: (1 - q) * blur })
    cx += widths[i]
  })
}

// Typewriter with a block caret.
function typed(ctx, str, x, y, font, color, p, { caret = true, caretColor = FG, t = 0, size = 30 } = {}) {
  const chars = [...str]
  const n = Math.floor(clamp(p) * chars.length + 1e-6)
  const shown = chars.slice(0, n).join('')
  text(ctx, shown, x, y, font, color)
  if (caret) {
    const cx = x + measure(ctx, shown, font) + 4
    const on = p < 1 || Math.floor(t * 2.2) % 2 === 0
    if (on) {
      ctx.fillStyle = rgba(caretColor, 0.9)
      ctx.fillRect(cx, y - size * 0.78, size * 0.52, size * 0.98)
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// The plugin's ring: a grey track and an arc from twelve o'clock; an empty ring that has a
// colour wears it on the track (an expired cache reads red, not idle grey).
function ring(ctx, cx, cy, r, w, frac, color, { alpha = 1, glow = 0, minArc = 0.04 } = {}) {
  if (alpha <= 0.001) return
  const p = clamp(frac)
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.strokeStyle = p === 0 && color !== GREY ? rgba(color, 0.6) : rgba(GREY, 0.35)
  ctx.stroke()
  if (p > 0) {
    // a sweep of exactly 2π draws nothing in Skia: stop a hair short
    const a = Math.min(0.99995, Math.max(p, minArc))
    if (glow > 0) {
      ctx.save()
      ctx.shadowColor = rgba(color, 0.85)
      ctx.shadowBlur = glow
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * a)
      ctx.strokeStyle = color
      ctx.stroke()
      ctx.restore()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * a)
    ctx.strokeStyle = color
    ctx.stroke()
  }
  ctx.restore()
}

// The terminal's text pie (○ ◔ ◑ ◕ ●), drawn as vectors so it matches any font.
function pie(ctx, cx, cy, r, frac, color) {
  const f = clamp(frac)
  const q = f === 0 ? 0 : Math.max(1, Math.round(f * 4))
  ctx.save()
  ctx.lineWidth = Math.max(1.5, r * 0.22)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.stroke()
  if (q === 4) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, TAU)
    ctx.fill()
  } else if (q > 0) {
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (TAU * q) / 4)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

function ripple(ctx, cx, cy, r, t, t0, color, { dur = 0.8, grow = 2.2, width = 2 } = {}) {
  const p = prog(t, t0, t0 + dur)
  if (p <= 0 || p >= 1) return
  ctx.save()
  ctx.globalAlpha *= (1 - p) ** 2 * 0.9
  ctx.strokeStyle = color
  ctx.lineWidth = width * (1 - p * 0.6)
  ctx.beginPath()
  ctx.arc(cx, cy, r * lerp(1, grow, E.outCubic(p)), 0, TAU)
  ctx.stroke()
  ctx.restore()
}

function glowSpot(ctx, x, y, r, color, a) {
  if (a <= 0.001) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, a))
  g.addColorStop(0.45, rgba(color, a * 0.35))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

function check(ctx, x, y, s, color, p) {
  if (p <= 0) return
  const pts = [
    [x, y],
    [x + s * 0.36, y + s * 0.34],
    [x + s, y - s * 0.42],
  ]
  const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])
  const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])
  const d = (l1 + l2) * clamp(p)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = s * 0.16
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(...pts[0])
  if (d <= l1) ctx.lineTo(lerp(pts[0][0], pts[1][0], d / l1), lerp(pts[0][1], pts[1][1], d / l1))
  else {
    ctx.lineTo(...pts[1])
    const q = (d - l1) / l2
    ctx.lineTo(lerp(pts[1][0], pts[2][0], q), lerp(pts[1][1], pts[2][1], q))
  }
  ctx.stroke()
  ctx.restore()
}

// ── the row: the plugin's AbovePrompt band, at video scale ─────────────────────────────────
// mode 'full' | 'short' | 'none', as labelsFor() chooses by width.
function rowLayout(ctx, items, mode, size) {
  const d = size * 1.1
  const g1 = size * 0.4
  const g2 = size * 1.15
  const vf = F.med(size)
  const lf = F.reg(size)
  let x = 0
  return items.map(it => {
    const vw = it.minW ? Math.max(measure(ctx, it.value, vf), measure(ctx, '00:00', vf)) : measure(ctx, it.value, vf)
    const label = mode === 'full' ? it.label : mode === 'short' ? it.short : ''
    const lw = label ? measure(ctx, label, lf) : 0
    const L = { x, ringX: x + d / 2, valueX: x + d + g1, labelX: x + d + g1 + vw + g1, label, w: d + g1 + vw + (label ? g1 + lw : 0) }
    x += L.w + g2
    return L
  })
}

function drawRow(ctx, x, yc, items, o) {
  const { size = 24, mode = 'full', from = null, p = 1, reveal: rv = () => 1, alpha = 1 } = o
  const a = rowLayout(ctx, items, mode, size)
  const b = from ? rowLayout(ctx, items, from, size) : a
  const q = E.inOutCubic(clamp(p))
  const r = size * 0.45
  items.forEach((it, i) => {
    const s = rv(i)
    if (s <= 0) return
    const ox = lerp(b[i].x, a[i].x, q)
    const dx = ox - a[i].x
    withAlpha(ctx, alpha * clamp(s * 1.5), () => {
      ring(ctx, x + a[i].ringX + dx, yc, r, size * 0.15, it.frac * E.outCubic(s), it.color)
      text(ctx, it.value, x + a[i].valueX + dx, yc + size * 0.36, F.med(size), FG)
      const lab = (lbl, la) => text(ctx, lbl, x + a[i].labelX + dx, yc + size * 0.36, F.reg(size), DIM, { alpha: la })
      if (from && b[i].label !== a[i].label) {
        if (b[i].label) lab(b[i].label, 1 - E.outCubic(clamp(p * 2.2)))
        if (a[i].label) lab(a[i].label, E.outCubic(clamp(p * 2 - 1)))
      } else if (a[i].label) lab(a[i].label, 1)
    })
  })
  return a
}

function rowItems({ cacheLeft = null, ttl = 3600, five = 13, seven = 63, ctx: cp = 25, fiveReset = 174, sevenReset = 6060 }) {
  const warm = cacheLeft !== null && cacheLeft > 0
  return [
    {
      frac: warm ? cacheLeft / ttl : 0,
      color: cacheLeft === null ? GREY : !warm ? RED : cacheLeft < 60 ? AMBER : BLUE,
      value: cacheLeft === null ? '--:--' : warm ? clockText(cacheLeft) : '过期',
      label: '缓存',
      short: '缓存',
      minW: true,
    },
    { frac: five / 100, color: ringColor(five), value: `${Math.round(five)}%`, label: `5h ↻${span(fiveReset)}`, short: '5h' },
    { frac: seven / 100, color: ringColor(seven), value: `${Math.round(seven)}%`, label: `7d ↻${span(sevenReset)}`, short: '7d' },
    { frac: cp / 100, color: ringColor(cp), value: `${Math.round(cp)}%`, label: '上下文', short: '上下文' },
  ]
}

// ── the mark: a ring that runs out into a line ──────────────────────────────────────────────
const LOCK = (() => {
  const R = 46
  const ringCx = 0
  const tailA = R + 20
  const tailB = R + 96
  const wordX = R + 128
  return { R, ringCx, tailA, tailB, wordX, size: 100 }
})()

function lockup(ctx, cx, cy, scale, o) {
  const { ringP = 1, tailA = LOCK.tailA, tailB = LOCK.tailB, word = 1, alpha = 1, glow = 0, caret = false, t = 0 } = o
  const m = ctx.measureText ? measure(ctx, 'usage-line', F.mono(LOCK.size)) : 0
  const total = LOCK.wordX + m + LOCK.R
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-total / 2 + LOCK.R, 0)
  ring(ctx, 0, 0, LOCK.R, 13, ringP, BLUE, { glow, minArc: 0 })
  if (tailB > tailA) {
    ctx.strokeStyle = FG
    ctx.lineWidth = 13
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(tailA, 0)
    ctx.lineTo(tailB, 0)
    ctx.stroke()
  }
  if (word > 0) typed(ctx, 'usage-line', LOCK.wordX, 34, F.mono(LOCK.size), FG, word, { caret, t, size: LOCK.size })
  ctx.restore()
}

// ── background and chrome ──────────────────────────────────────────────────────────────────
const vignette = (() => {
  const c = createCanvas(W, H)
  const g = c.getContext('2d')
  g.fillStyle = BG
  g.fillRect(0, 0, W, H)
  const v = g.createRadialGradient(W / 2, H * 0.46, H * 0.25, W / 2, H / 2, H * 1.05)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.55)')
  g.fillStyle = v
  g.fillRect(0, 0, W, H)
  return c
})()

function background(ctx, t) {
  ctx.drawImage(vignette, 0, 0)
  // One slow light that wanders with the story and takes the scene's colour.
  const hue = t < S.limits.at + 3.5 ? BLUE : t < S.limits.at + 5.8 ? mix(BLUE, AMBER, prog(t, S.limits.at + 2.8, S.limits.at + 3.6)) : BLUE
  const amberCache = prog(t, 20.0, 20.4) * (1 - prog(t, 21.9, 22.4))
  const gx = 960 + Math.sin(t * 0.21) * 380
  const gy = 520 + Math.cos(t * 0.17) * 160
  glowSpot(ctx, gx, gy, 900, mix(hue, AMBER, amberCache), 0.075 * (1 - prog(t, 43.2, 44)))
  // A fine dot grid, barely there, that drifts.
  ctx.save()
  ctx.globalAlpha = 0.07 * (1 - prog(t, 43.2, 44))
  ctx.fillStyle = FG
  const off = (t * 6) % 48
  for (let y = -48 + off; y < H + 48; y += 48) for (let x = 24; x < W; x += 48) ctx.fillRect(x, y, 1.6, 1.6)
  ctx.restore()
}

const CHAPTERS = [
  ['01', '问题', 'THE QUESTIONS'],
  ['02', '一行', 'ONE LINE'],
  ['03', '原位', 'IN PLACE'],
  ['04', '缓存', 'CACHE'],
  ['05', '额度', 'LIMITS'],
  ['06', '上下文', 'CONTEXT'],
  ['07', '自适应', 'ADAPTIVE'],
  ['08', '安装', 'INSTALL'],
]

function chrome(ctx, t, frame) {
  const a = tw(t, 0.15, 0.9) * (1 - tw(t, 40.9, 41.5)) * 0.62
  if (a <= 0.001) return
  ctx.save()
  ctx.globalAlpha = a
  // corner registration marks
  ctx.strokeStyle = rgba(FG, 0.35)
  ctx.lineWidth = 1.5
  const m = 40
  const l = 18
  for (const [x, y, sx, sy] of [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x, y + sy * l)
    ctx.lineTo(x, y)
    ctx.lineTo(x + sx * l, y)
    ctx.stroke()
  }
  const starts = S.chapters
  let i = 0
  while (i + 1 < starts.length && t >= starts[i + 1]) i++
  const sw = prog(t, starts[i], starts[i] + 0.45)
  const [num, zh, en] = CHAPTERS[i]
  text(ctx, num, 76, 82, F.monoB(18), BLUE, { alpha: 0.4 + 0.6 * sw })
  reveal(ctx, zh, 112, 82, F.med(18), FG, sw, { dy: 8, blur: 4, spread: 2 })
  reveal(ctx, en, 112 + measure(ctx, zh, F.med(18)) + 14, 82, F.mono(15), DIM, sw, { dy: 8, blur: 4, spread: 4 })
  text(ctx, 'USAGE-LINE  ·  FOR CLAUDE CODE', W - 76, 82, F.mono(15), DIM, { align: 'right' })
  const tc = `${String(Math.floor(frame / FPS / 60)).padStart(2, '0')}:${String(Math.floor(frame / FPS) % 60).padStart(2, '0')}:${String(frame % FPS).padStart(2, '0')}`
  text(ctx, tc, W - 76, H - 66, F.mono(15), DIM, { align: 'right' })
  ring(ctx, 84, H - 71, 6, 2.2, keys(t, [[0, 0], [DUR - 3, 1, E.lin]]), BLUE)
  text(ctx, 'v1.0', 100, H - 66, F.mono(15), DIM)
  ctx.restore()
}

// ── 01 · the questions ─────────────────────────────────────────────────────────────────────
const QUESTIONS = [
  { zh: '缓存还剩几分钟？', en: 'How long until the prompt cache goes cold?', tag: '无从得知', x: 168, y: 300, align: 'left', at: 0.35 },
  { zh: '5 小时额度，用掉多少了？', en: 'How much of the five-hour window is gone?', tag: '/usage', x: 1752, y: 492, align: 'right', at: 1.3 },
  { zh: '这周的额度，哪天重置？', en: 'When does the weekly limit reset?', tag: '/usage', x: 168, y: 684, align: 'left', at: 2.25 },
  { zh: '上下文，还装得下吗？', en: 'Is there still room in the context?', tag: '/context', x: 1752, y: 876, align: 'right', at: 3.15 },
]

function sceneQuestions(ctx, t) {
  const push = lerp(1, 1.045, tw(t, 0, 4.6, E.inOutSine))
  ctx.save()
  ctx.translate(960, 540)
  ctx.scale(push, push)
  ctx.translate(-960, -540)
  QUESTIONS.forEach((q, i) => {
    const next = QUESTIONS[i + 1]
    const dim = next ? 1 - 0.6 * tw(t, next.at, next.at + 0.7) : 1
    const c0 = 4.5 + i * 0.07
    const c = tw(t, c0, c0 + 0.75, E.inExpo)
    const drift = (q.align === 'left' ? 1 : -1) * 14 * tw(t, q.at, 5, E.lin)
    ctx.save()
    ctx.translate(lerp(q.x + drift, 960 + (q.x - 960) * 0.25, c), lerp(q.y, 540, c))
    ctx.scale(lerp(1, 0.72, c), lerp(1, 0.02, c))
    withAlpha(ctx, dim * (1 - prog(t, c0 + 0.55, c0 + 0.8)), () => {
      reveal(ctx, q.zh, 0, 0, F.black(78), FG, tw(t, q.at, q.at + 0.85, E.lin), { align: q.align, dy: 44, spread: 4, blur: 14 })
      reveal(ctx, q.en, 0, 62, F.serif(38), DIM, tw(t, q.at + 0.25, q.at + 1.2, E.lin), { align: q.align, dy: 16, spread: 10, blur: 6 })
      // where you would have to go to find out
      const tp = tw(t, q.at + 0.55, q.at + 1.0, E.outBack)
      if (tp > 0) {
        const zw = measure(ctx, q.zh, F.black(78))
        const tf = q.tag.startsWith('/') ? F.mono(22) : F.reg(22)
        const tw2 = measure(ctx, q.tag, tf) + 28
        const tx = q.align === 'left' ? zw + 26 : -zw - 26 - tw2
        withAlpha(ctx, clamp(tp), () => {
          ctx.save()
          ctx.translate(tx + tw2 / 2, -26)
          ctx.scale(lerp(0.7, 1, tp), lerp(0.7, 1, tp))
          roundRect(ctx, -tw2 / 2, -20, tw2, 40, 20)
          ctx.strokeStyle = rgba(FG, 0.22)
          ctx.lineWidth = 1.5
          ctx.stroke()
          text(ctx, q.tag, 0, 8, tf, DIM, { align: 'center' })
          ctx.restore()
        })
      }
    })
    ctx.restore()
  })
  ctx.restore()
}

// ── 02 · one line, and the mark ───────────────────────────────────────────────────────────
function sceneOneLine(ctx, t) {
  const y = 540
  const L = 880 * tw(t, 4.95, 5.7, E.outExpo)
  // line → tail of the mark
  const lockCx = 960
  const lockScale = 1
  const m = measure(ctx, 'usage-line', F.mono(LOCK.size))
  const total = LOCK.wordX + m + LOCK.R
  const originX = lockCx - total / 2 + LOCK.R
  const shrink = tw(t, 8.25, 8.95, E.inOutExpo)
  const left = lerp(960 - L, originX + LOCK.tailA, shrink)
  const right = lerp(960 + L, originX + LOCK.tailB, shrink)
  const exit = tw(t, 9.75, 10.35, E.inCubic)
  const flash = Math.exp(-Math.max(0, t - 6.0) * 3.2) * prog(t, 5.8, 6.0)

  // the words rise from behind the line, and sink back into it
  const rise = tw(t, 6.0, 6.95, E.outExpo) * (1 - tw(t, 7.75, 8.25, E.inCubic))
  if (rise > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, y - 7)
    ctx.clip()
    reveal(ctx, '一行，全看清。', 960, y - 52 + (1 - rise) * 170, F.black(132), FG, tw(t, 6.0, 6.7, E.lin), { align: 'center', dy: 0, spread: 3, blur: 6 })
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, y + 7, W, H)
    ctx.clip()
    text(ctx, 'Everything you need to know, in one line.', 960, y + 86 - (1 - tw(t, 6.25, 7.1, E.outExpo) * (1 - tw(t, 7.7, 8.2, E.inCubic))) * 120, F.serif(54), DIM, { align: 'center' })
    ctx.restore()
  }

  if (t < 10.4) {
    withAlpha(ctx, 1 - exit, () => {
      const ly = lerp(y, 220, exit)
      if (t < 8.95 || shrink < 1) {
        ctx.save()
        ctx.strokeStyle = FG
        ctx.lineCap = 'round'
        ctx.lineWidth = lerp(2.5, 13, shrink)
        if (flash > 0.01) {
          ctx.shadowColor = rgba(BLUE, 0.9 * flash)
          ctx.shadowBlur = 40 * flash
        }
        ctx.beginPath()
        ctx.moveTo(left, y)
        ctx.lineTo(right, y)
        ctx.stroke()
        ctx.restore()
        glowSpot(ctx, 960, y, 520, BLUE, 0.16 * flash)
      }
      if (shrink >= 1) {
        const rp = tw(t, 8.8, 9.6, E.outCubic) * (5 / 6)
        const pop = lerp(0.82, 1, tw(t, 8.8, 9.3, E.outBack))
        lockup(ctx, lockCx, ly, lockScale * lerp(1, 0.5, exit), {
          ringP: rp,
          word: tw(t, 9.0, 9.75, E.lin),
          caret: t < 9.95,
          t,
          glow: 18 * (1 - prog(t, 9.0, 10)),
        })
        void pop
        reveal(ctx, 'Claude Code 插件  ·  a plugin for Claude Code', 960, ly + 128, F.light(30), DIM, tw(t, 9.25, 9.9, E.lin), { align: 'center', dy: 12, spread: 8, blur: 5 })
      }
    })
  }
}

// ── 03 · in place: the desktop app, the row, the push ──────────────────────────────────────
const WIN = { x: 250, y: 150, w: 1420, h: 820 }
const PROMPT = { x: WIN.x + 60, y: WIN.y + 618, w: 1300, h: 150 }
const ROW_Y = PROMPT.y - 36
const ROW_X = PROMPT.x + 14
const ROW_SIZE = 24
const SEND_AT = 12.35

function cacheLeftDesk(t) {
  return t < SEND_AT + 0.1 ? null : 3600 - (t - (SEND_AT + 0.1))
}

function drawWindowBody(ctx, t, { prompt = '', withRow = true } = {}) {
  roundRect(ctx, WIN.x, WIN.y, WIN.w, WIN.h, 26)
  ctx.fillStyle = SURFACE
  ctx.fill()
  ctx.strokeStyle = rgba(FG, 0.09)
  ctx.lineWidth = 1.5
  ctx.stroke()
  // title bar
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(WIN.x + 30 + i * 24, WIN.y + 29, 7, 0, TAU)
    ctx.fillStyle = '#3a3835'
    ctx.fill()
  }
  text(ctx, 'api-server', WIN.x + WIN.w / 2, WIN.y + 36, F.med(19), DIM, { align: 'center' })
  ctx.fillStyle = rgba(FG, 0.06)
  ctx.fillRect(WIN.x, WIN.y + 58, WIN.w, 1.5)

  // transcript
  const lines = (i, fn) => withAlpha(ctx, tw(t, 10.35 + i * 0.09, 10.85 + i * 0.09), () => {
    ctx.save()
    ctx.translate(0, (1 - tw(t, 10.35 + i * 0.09, 10.95 + i * 0.09, E.outQuint)) * 18)
    fn()
    ctx.restore()
  })
  const ask = '把 token 统计拆成独立模块，顺便补上测试'
  lines(0, () => {
    const bw = measure(ctx, ask, F.reg(24)) + 44
    roundRect(ctx, WIN.x + WIN.w - 64 - bw, WIN.y + 96, bw, 58, 18)
    ctx.fillStyle = SURFACE2
    ctx.fill()
    text(ctx, ask, WIN.x + WIN.w - 64 - bw + 22, WIN.y + 134, F.reg(24), FG)
  })
  const ax = WIN.x + 76
  lines(1, () => text(ctx, '好的。先读一下现有实现，再拆成三个文件。', ax, WIN.y + 222, F.reg(24), FG))
  const tool = (i, verb, arg, extra, y) =>
    lines(i, () => {
      ctx.beginPath()
      ctx.arc(ax + 6, y - 7, 5, 0, TAU)
      ctx.fillStyle = i === 4 ? BLUE : '#6f6b64'
      ctx.fill()
      text(ctx, verb, ax + 26, y, F.monoB(20), FG)
      text(ctx, arg, ax + 110, y, F.mono(20), DIM)
      if (extra) text(ctx, extra, ax + 110 + measure(ctx, arg, F.mono(20)) + 24, y, F.mono(20), extra.includes('pass') ? BLUE : DIM)
    })
  tool(2, 'Read', 'src/usage.ts', '', WIN.y + 280)
  tool(3, 'Edit', 'src/usage/tokens.ts', '+84 −12', WIN.y + 318)
  tool(4, 'Bash', 'bun test', '18 pass', WIN.y + 356)
  lines(5, () => text(ctx, '拆分完成，测试全部通过。', ax, WIN.y + 420, F.reg(24), FG))

  // the prompt
  roundRect(ctx, PROMPT.x, PROMPT.y, PROMPT.w, PROMPT.h, 22)
  ctx.fillStyle = SURFACE2
  ctx.fill()
  ctx.strokeStyle = rgba(FG, 0.11)
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (prompt) typed(ctx, prompt, PROMPT.x + 28, PROMPT.y + 54, F.reg(25), FG, 1, { caret: true, t, size: 25 })
  else text(ctx, '继续说点什么…', PROMPT.x + 28, PROMPT.y + 54, F.reg(25), FAINT)
  ctx.beginPath()
  ctx.arc(PROMPT.x + 40, PROMPT.y + 110, 17, 0, TAU)
  ctx.strokeStyle = rgba(FG, 0.2)
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.strokeStyle = DIM
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PROMPT.x + 33, PROMPT.y + 110)
  ctx.lineTo(PROMPT.x + 47, PROMPT.y + 110)
  ctx.moveTo(PROMPT.x + 40, PROMPT.y + 103)
  ctx.lineTo(PROMPT.x + 40, PROMPT.y + 117)
  ctx.stroke()
  const press = 1 - 0.14 * Math.sin(Math.PI * prog(t, SEND_AT - 0.06, SEND_AT + 0.16))
  const sx = PROMPT.x + PROMPT.w - 42
  const sy = PROMPT.y + 110
  ctx.save()
  ctx.translate(sx, sy)
  ctx.scale(press, press)
  ctx.beginPath()
  ctx.arc(0, 0, 21, 0, TAU)
  ctx.fillStyle = prompt ? FG : rgba(FG, 0.35)
  ctx.fill()
  ctx.strokeStyle = BG
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 8)
  ctx.lineTo(0, -8)
  ctx.moveTo(-7, -1)
  ctx.lineTo(0, -8)
  ctx.lineTo(7, -1)
  ctx.stroke()
  ctx.restore()
  void withRow
}

function deskItems(t) {
  return rowItems({ cacheLeft: cacheLeftDesk(t) })
}

function sceneInPlace(ctx, t, frame) {
  const enter = tw(t, 9.95, 11.0, E.outExpo)
  const items = deskItems(t)
  // row geometry in window space
  const layout = rowLayout(ctx, items, 'full', ROW_SIZE)
  const rowW = layout[layout.length - 1].x + layout[layout.length - 1].w
  const rowCx = ROW_X + rowW / 2
  const cacheX = ROW_X + layout[0].ringX

  // camera: settle → push onto the row → dive into the cache ring
  const push = tw(t, 12.9, 15.0, E.inOutCubic)
  const dive = tw(t, 15.35, 16.1, E.inExpo)
  let s = lerp(1, 1.85, push)
  let fx = lerp(960, rowCx, push)
  let fy = lerp(540, ROW_Y + 40, push)
  const aim = tw(t, 14.95, 15.65, E.inOutCubic)
  fx = lerp(fx, cacheX, aim)
  fy = lerp(fy, ROW_Y, aim)
  s = lerp(s, 32, dive)
  const toScreen = (x, y) => [960 + (x - fx) * s, 540 + (y - fy) * s]

  const typedP = tw(t, 11.55, 12.2, E.lin)
  const prompt = t < SEND_AT ? [...'再跑一遍覆盖率'].slice(0, Math.floor(typedP * 7)).join('') : ''

  const layer = scratch()
  const lc = layer.getContext('2d')
  lc.clearRect(0, 0, W, H)
  lc.save()
  lc.translate(960, 540 + (1 - enter) * 760)
  lc.scale(s * lerp(0.94, 1, enter), s * lerp(0.94, 1, enter))
  lc.translate(-fx, -fy)
  drawWindowBody(lc, t, { prompt })
  lc.restore()

  const fade = (1 - tw(t, 15.3, 15.9)) * clamp(enter * 1.4) * (1 - 0.55 * push)
  withAlpha(ctx, fade, () => {
    // window shadow
    ctx.save()
    ctx.globalAlpha *= 0.55
    const [wx, wy] = toScreen(WIN.x + WIN.w / 2, WIN.y + WIN.h / 2 + 40)
    glowSpot(ctx, wx, wy + (1 - enter) * 760, 900 * s, '#000000', 0.9)
    ctx.restore()
    const dof = 7 * push * (1 - dive)
    if (dof > 0.3) ctx.filter = `blur(${dof.toFixed(2)}px)`
    ctx.drawImage(layer, 0, 0)
    ctx.filter = 'none'
  })

  // the row, sharp, on top
  const [rx, ry] = toScreen(ROW_X, ROW_Y)
  const rs = s * lerp(0.94, 1, enter)
  ctx.save()
  ctx.translate(rx, ry + (1 - enter) * 760)
  ctx.scale(rs, rs)
  const rowAlpha = 1 - tw(t, 15.75, 16.1)
  // the cache ring keeps its full presence into the dive; the rest fades
  drawRow(ctx, 0, 0, items, {
    size: ROW_SIZE,
    alpha: rowAlpha,
    reveal: i => (i === 0 ? tw(t, 10.85, 11.5) : tw(t, 10.95 + i * 0.09, 11.75 + i * 0.09)) * (i === 0 ? 1 : 1 - tw(t, 15.2, 15.7)),
  })
  // the cache wakes: sweep and ripple when the request goes out
  ripple(ctx, layout[0].ringX, 0, ROW_SIZE * 0.45, t, SEND_AT + 0.1, BLUE, { dur: 0.9, grow: 3, width: 2 })
  ripple(ctx, layout[0].ringX, 0, ROW_SIZE * 0.45, t, SEND_AT + 0.28, BLUE, { dur: 0.9, grow: 2.2, width: 1.5 })
  ctx.restore()

  // callouts, in screen space
  const CALL = [
    ['缓存倒计时', 'CACHE TTL'],
    ['5 小时额度', '5-HOUR WINDOW'],
    ['7 天额度', '7-DAY WINDOW'],
    ['上下文占用', 'CONTEXT'],
  ]
  const callOut = 1 - tw(t, 15.0, 15.45, E.inCubic)
  layout.forEach((L, i) => {
    const p = tw(t, 13.55 + i * 0.16, 14.25 + i * 0.16, E.outExpo)
    if (p <= 0 || callOut <= 0) return
    const [cx, cy] = toScreen(ROW_X + L.ringX, ROW_Y)
    const top = cy - 64 - 150 * p
    withAlpha(ctx, callOut, () => {
      ctx.strokeStyle = rgba(FG, 0.45)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx, cy - 42)
      ctx.lineTo(cx, top)
      ctx.stroke()
      ctx.fillStyle = i === 0 ? BLUE : FG
      ctx.beginPath()
      ctx.arc(cx, top, 4, 0, TAU)
      ctx.fill()
      reveal(ctx, CALL[i][0], cx, top - 22, F.med(30), FG, prog(t, 13.65 + i * 0.16, 14.35 + i * 0.16), { align: 'center', dy: 14, spread: 3, blur: 6 })
      text(ctx, CALL[i][1], cx, top - 64, F.mono(15), DIM, { align: 'center', alpha: tw(t, 13.8 + i * 0.16, 14.4 + i * 0.16) })
    })
  })
  void frame
}

let _scratch
function scratch() {
  _scratch ??= createCanvas(W, H)
  return _scratch
}

// ── 04 · the cache ───────────────────────────────────────────────────────────────────────────
// Seconds left, as the scene shows it: live, then a time-lapse, the last minute, expiry, a refill.
function cacheLeftHero(t) {
  if (t < 16.6) return 3600
  if (t < 18.0) return 3600 - (t - 16.6)
  if (t < 20.0) return lerp(3598.6, 60, E.inOutCubic(prog(t, 18.0, 20.0)))
  if (t < 21.2) return lerp(60, 0, E.inQuad(prog(t, 20.0, 21.2)) * 0.4 + prog(t, 20.0, 21.2) * 0.6)
  if (t < 21.95) return 0
  return 3600 - Math.max(0, t - 22.5)
}

function sceneCache(ctx, t) {
  const C = { x: 600, y: 540, r: 292, w: 30 }
  const enter = tw(t, 15.85, 16.55, E.outExpo)
  const exit = tw(t, 23.7, 24.25, E.inCubic)
  const left = cacheLeftHero(t)
  const refill = tw(t, 21.95, 22.65, E.outBack)
  const expired = t >= 21.2 && t < 21.95
  const amber = left < 60 && left > 0
  const color = expired ? RED : amber ? mix(BLUE, AMBER, prog(t, 20.0, 20.2)) : BLUE
  const frac = t >= 21.95 ? clamp(refill, 0, 1.0) : left / 3600

  const cx = lerp(960, C.x, enter) - exit * 140
  const sc = lerp(1.08, 1, enter) * lerp(1, 0.6, exit)
  const alpha = clamp(prog(t, 15.85, 16.05)) * (1 - exit)

  withAlpha(ctx, alpha, () => {
    glowSpot(ctx, cx, C.y, 560 * sc, color, expired ? 0.12 : 0.1)
    // the minute ticks around the dial, lit beneath the arc
    ctx.save()
    ctx.translate(cx, C.y)
    ctx.scale(sc, sc)
    for (let i = 0; i < 60; i++) {
      const a = -Math.PI / 2 + (i / 60) * TAU
      const major = i % 5 === 0
      const lit = i / 60 < frac - 0.002
      const r1 = C.r + 44
      const r2 = r1 + (major ? 22 : 10)
      ctx.strokeStyle = lit ? rgba(color, major ? 0.9 : 0.6) : rgba(FG, major ? 0.22 : 0.1)
      ctx.lineWidth = major ? 3 : 2
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1)
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2)
      ctx.stroke()
    }
    ring(ctx, 0, 0, C.r, C.w, expired ? 0 : frac, expired ? RED : color, { glow: 34, minArc: 0 })
    ripple(ctx, 0, 0, C.r, t, 21.2, RED, { dur: 1.0, grow: 1.35, width: 6 })
    ripple(ctx, 0, 0, C.r, t, 21.95, BLUE, { dur: 1.1, grow: 1.4, width: 6 })
    ripple(ctx, 0, 0, C.r, t, 20.0, AMBER, { dur: 1.0, grow: 1.3, width: 5 })
    // centre: the plugin's own label
    text(ctx, '缓存', 0, 18, F.med(52), FG, { align: 'center', alpha: 0.9 })
    text(ctx, 'PROMPT CACHE', 0, 64, F.mono(18), DIM, { align: 'center' })
    ctx.restore()
  })

  // right column
  const X = 1010
  withAlpha(ctx, 1 - exit, () => {
    reveal(ctx, '剩余时间  ·  TIME LEFT', X, 318, F.mono(20), DIM, tw(t, 16.2, 16.9, E.lin), { dy: 10, blur: 4 })
    // status chip
    const chip = expired
      ? ['已过期', 'EXPIRED', RED]
      : amber
        ? ['最后一分钟', 'LAST MINUTE', AMBER]
        : t >= 21.95 && t < 23.4
          ? ['新请求 · 已续上', 'REFRESHED', BLUE]
          : t >= 18.0 && t < 20.0
            ? ['时间推移', 'TIME-LAPSE', DIM]
            : ['实时', 'LIVE', BLUE]
    const ca = tw(t, 16.5, 17.0)
    if (ca > 0) {
      const cw = measure(ctx, chip[0], F.med(20)) + measure(ctx, chip[1], F.mono(15)) + 64
      const chx = X + 400
      roundRect(ctx, chx, 292, cw, 38, 19)
      ctx.fillStyle = rgba(chip[2], 0.14)
      ctx.globalAlpha = ca
      ctx.fill()
      ctx.beginPath()
      ctx.arc(chx + 20, 311, 5, 0, TAU)
      ctx.fillStyle = chip[2]
      ctx.fill()
      text(ctx, chip[0], chx + 34, 318, F.med(20), chip[2] === DIM ? FG : chip[2])
      text(ctx, chip[1], chx + 44 + measure(ctx, chip[0], F.med(20)), 317, F.mono(15), DIM)
      ctx.globalAlpha = 1
    }
    // the numerals
    const na = tw(t, 16.15, 16.75, E.outExpo)
    const value = expired ? '过期' : clockText(left)
    const ncol = expired ? RED : amber ? AMBER : FG
    const shake = expired ? Math.sin((t - 21.2) * 70) * 10 * Math.exp(-(t - 21.2) * 7) : 0
    ctx.save()
    ctx.globalAlpha = na
    ctx.translate(X + shake, 560 + (1 - na) * 40)
    if (expired) text(ctx, value, 0, 0, F.black(236), ncol)
    else text(ctx, value, -8, 0, F.monoB(262), ncol)
    ctx.restore()
    reveal(ctx, '缓存倒计时，精确到秒。', X, 702, F.black(64), FG, tw(t, 16.6, 17.45, E.lin), { dy: 30, spread: 4, blur: 10 })
    reveal(ctx, 'Know the moment your prompt cache goes cold.', X, 758, F.serif(40), DIM, tw(t, 16.9, 17.9, E.lin), { dy: 12, spread: 10, blur: 5 })
    // facts
    const FACTS = [
      ['1h', '订阅缓存时长'],
      ['5m', '超额用量，自动识别'],
      ['子代理', '不打断计时'],
    ]
    let fx = X
    FACTS.forEach(([k, v], i) => {
      const p = tw(t, 22.7 + i * 0.14, 23.25 + i * 0.14, E.outExpo)
      if (p <= 0) return
      const kf = /^[0-9]/.test(k) ? F.monoB(30) : F.med(26)
      withAlpha(ctx, p, () => {
        ctx.fillStyle = rgba(FG, 0.18)
        ctx.fillRect(fx, 852, 2, 70)
        text(ctx, k, fx + 20, 884 + (1 - p) * 16, kf, FG)
        text(ctx, v, fx + 20, 916 + (1 - p) * 16, F.reg(22), DIM)
      })
      fx += Math.max(measure(ctx, v, F.reg(22)), measure(ctx, k, kf)) + 74
    })
  })
}

// ── 05 · the usage windows ──────────────────────────────────────────────────────────────────
const FIVE = [[24.3, 0], [25.2, 13, E.outCubic], [25.55, 13], [26.15, 47], [26.45, 47], [27.0, 74], [27.35, 74], [27.9, 93]]
const SEVEN = [[24.42, 0], [25.35, 63, E.outCubic], [26.75, 63], [27.4, 71]]
const crossAmber5 = 26.45 + (27.0 - 26.45) * 0.62
const crossRed5 = 27.35 + (27.9 - 27.35) * 0.6
const crossAmber7 = 26.75 + (27.4 - 26.75) * 0.5

function sceneLimits(ctx, t) {
  const exit = tw(t, 29.6, 30.25, E.inCubic)
  const five = keys(t, FIVE)
  const seven = keys(t, SEVEN)
  const fiveReset = keys(t, [[24.3, 174], [28.2, 118, E.inOutSine]])
  const sevenReset = keys(t, [[24.3, 6060], [28.2, 5952, E.inOutSine]])
  withAlpha(ctx, 1 - exit, () => {
    reveal(ctx, '额度用了多少，何时重置。', 168, 236, F.black(64), FG, tw(t, 24.05, 24.95, E.lin), { dy: 30, spread: 4, blur: 10 })
    reveal(ctx, "How much you've used, and when it resets.", 168, 292, F.serif(40), DIM, tw(t, 24.35, 25.35, E.lin), { dy: 12, spread: 10, blur: 5 })
    const R = [
      { cx: 690, v: five, name: '5 小时额度', reset: span(fiveReset), at: 24.15, cross: [crossAmber5, crossRed5] },
      { cx: 1230, v: seven, name: '7 天额度', reset: span(sevenReset), at: 24.3, cross: [crossAmber7] },
    ]
    R.forEach(r => {
      const cy = 560
      const e = tw(t, r.at, r.at + 0.8, E.outExpo)
      const col = ringColor(r.v)
      ctx.save()
      ctx.translate(r.cx, cy + (1 - e) * 60)
      ctx.globalAlpha *= e
      glowSpot(ctx, 0, 0, 330, col, 0.07)
      ring(ctx, 0, 0, 176, 22, r.v / 100, col, { glow: 26, minArc: 0 })
      r.cross.forEach((tc, j) => ripple(ctx, 0, 0, 176, t, tc, j === 0 && r.cross.length > 1 ? AMBER : r.cross.length > 1 ? RED : AMBER, { dur: 0.9, grow: 1.32, width: 5 }))
      text(ctx, `${Math.round(r.v)}%`, 0, 36, F.monoB(104), col === BLUE ? FG : col, { align: 'center' })
      text(ctx, r.name, 0, 176 + 76, F.med(32), FG, { align: 'center' })
      text(ctx, `↻ ${r.reset} 后重置`, 0, 176 + 120, F.mono(24), DIM, { align: 'center' })
      ctx.restore()
    })
    // thresholds: the plugin turns amber at 70% and red at 90%
    const bx = 1560
    const bt = 360
    const bh = 400
    const ba = tw(t, 24.8, 25.6, E.outExpo)
    withAlpha(ctx, ba, () => {
      const seg = (a, b, c) => {
        ctx.fillStyle = c
        ctx.fillRect(bx, bt + bh * (1 - b / 100), 6, bh * ((b - a) / 100) * ba)
      }
      seg(0, 70, rgba(BLUE, 0.7))
      seg(70, 90, rgba(AMBER, 0.85))
      seg(90, 100, rgba(RED, 0.9))
      ;[
        [0, '0'],
        [70, '70%'],
        [90, '90%'],
        [100, '100%'],
      ].forEach(([v, l]) => {
        const y = bt + bh * (1 - v / 100)
        ctx.fillStyle = rgba(FG, 0.35)
        ctx.fillRect(bx + 12, y - 1, 12, 2)
        text(ctx, l, bx + 34, y + 7, F.mono(18), v === 70 ? AMBER : v === 90 ? RED : DIM)
      })
      text(ctx, '≥70% 琥珀', bx - 10, bt + bh + 60, F.reg(22), AMBER, { align: 'left' })
      text(ctx, '≥90% 红色', bx - 10, bt + bh + 94, F.reg(22), RED, { align: 'left' })
      // markers
      ;[
        [five, '5h'],
        [seven, '7d'],
      ].forEach(([v, l], k) => {
        const y = bt + bh * (1 - v / 100)
        ctx.fillStyle = ringColor(v)
        ctx.beginPath()
        ctx.moveTo(bx - 8, y)
        ctx.lineTo(bx - 22, y - 8)
        ctx.lineTo(bx - 22, y + 8)
        ctx.closePath()
        ctx.fill()
        text(ctx, l, bx - 32, y + 7, F.monoB(18), FG, { align: 'right', alpha: 0.9 })
        void k
      })
    })
  })
}

// ── 06 · the context ───────────────────────────────────────────────────────────────────────
function sceneContext(ctx, t) {
  const e = tw(t, 30.0, 30.75, E.outExpo)
  const exit = tw(t, 32.3, 32.8, E.inCubic)
  const v = keys(t, [[30.15, 0], [30.95, 25, E.outCubic], [31.25, 25], [31.95, 40]])
  withAlpha(ctx, (1 - exit) * clamp(e * 1.3), () => {
    ctx.save()
    ctx.translate(960, 470)
    const sc = lerp(0.86, 1, e) * lerp(1, 1.12, exit)
    ctx.scale(sc, sc)
    glowSpot(ctx, 0, 0, 420, BLUE, 0.09)
    ring(ctx, 0, 0, 210, 26, v / 100, BLUE, { glow: 30, minArc: 0 })
    text(ctx, `${Math.round(v)}%`, 0, 28, F.monoB(112), FG, { align: 'center' })
    text(ctx, '上下文', 0, 86, F.med(30), DIM, { align: 'center' })
    ctx.restore()
    reveal(ctx, '上下文占用，一直在眼前。', 960, 840, F.black(60), FG, tw(t, 30.3, 31.1, E.lin), { align: 'center', dy: 26, spread: 4, blur: 8 })
    reveal(ctx, 'Context fill, always in sight.  /clear and compaction re-read it.', 960, 896, F.serif(36), DIM, tw(t, 30.6, 31.7, E.lin), { align: 'center', dy: 10, spread: 10, blur: 5 })
  })
}

// ── 07 · it folds; it is in the terminal too ─────────────────────────────────────────────────
function sceneAdaptive(ctx, t) {
  const e = tw(t, 32.5, 33.3, E.outExpo)
  const toTerm = tw(t, 35.25, 35.95, E.inOutExpo)
  const exit = tw(t, 37.75, 38.25, E.inCubic)
  const width = keys(t, [[33.3, 1584], [34.25, 1120, E.inOutExpo], [34.95, 1120], [35.6, 700, E.inOutExpo]])
  const mode = width > 1300 ? 'full' : width > 860 ? 'short' : 'none'
  const switchAt = mode === 'full' ? null : mode === 'short' ? 33.75 : 35.25
  const from = mode === 'short' ? 'full' : mode === 'none' ? 'short' : null
  const p = switchAt ? prog(t, switchAt, switchAt + 0.4) : 1
  const live = 3540 - (t - 32.5)
  const items = rowItems({ cacheLeft: live })

  withAlpha(ctx, 1 - exit, () => {
    // headline swaps with the scene's second half
    withAlpha(ctx, 1 - toTerm, () => {
      reveal(ctx, '窗口再窄，也不挤压。', 168, 236, F.black(64), FG, tw(t, 32.6, 33.45, E.lin), { dy: 30, spread: 4, blur: 10 })
      reveal(ctx, 'Narrow window? It folds, it never squeezes.', 168, 292, F.serif(40), DIM, tw(t, 32.85, 33.85, E.lin), { dy: 12, spread: 10, blur: 5 })
    })
    withAlpha(ctx, toTerm, () => {
      reveal(ctx, '终端里，一样原生。', 168, 236, F.black(64), FG, tw(t, 35.45, 36.25, E.lin), { dy: 30, spread: 4, blur: 10 })
      reveal(ctx, 'And right at home in the terminal.', 168, 292, F.serif(40), DIM, tw(t, 35.7, 36.6, E.lin), { dy: 12, spread: 10, blur: 5 })
    })

    // desktop panel
    const px = 960 - width / 2
    const py = 480 - toTerm * 140
    withAlpha(ctx, e * (1 - toTerm), () => {
      ctx.save()
      ctx.translate(0, (1 - e) * 120)
      roundRect(ctx, px, py, width, 300, 26)
      ctx.fillStyle = SURFACE
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.09)
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.save()
      roundRect(ctx, px, py, width, 300, 26)
      ctx.clip()
      drawRow(ctx, px + 38, py + 62, items, { size: 32, mode, from, p })
      roundRect(ctx, px + 24, py + 112, width - 48, 164, 22)
      ctx.fillStyle = SURFACE2
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.1)
      ctx.stroke()
      text(ctx, '继续说点什么…', px + 52, py + 176, F.reg(28), FAINT)
      ctx.restore()
      // width gauge
      text(ctx, `${Math.round(width)} px`, px + width, py - 22, F.mono(20), DIM, { align: 'right' })
      ctx.strokeStyle = rgba(FG, 0.25)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, py - 52)
      ctx.lineTo(px, py - 40)
      ctx.moveTo(px, py - 46)
      ctx.lineTo(px + width, py - 46)
      ctx.moveTo(px + width, py - 52)
      ctx.lineTo(px + width, py - 40)
      ctx.stroke()
      ctx.restore()
    })

    // terminal
    withAlpha(ctx, toTerm, () => {
      const tx = 168
      const ty = 430 + (1 - toTerm) * 140
      const tw2 = 1584
      roundRect(ctx, tx, ty, tw2, 330, 18)
      ctx.fillStyle = '#0b0b0a'
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.12)
      ctx.lineWidth = 1.5
      ctx.stroke()
      // the input box, Claude Code style
      roundRect(ctx, tx + 40, ty + 60, tw2 - 80, 92, 12)
      ctx.strokeStyle = rgba(FG, 0.3)
      ctx.lineWidth = 2
      ctx.stroke()
      text(ctx, '>', tx + 70, ty + 118, F.monoB(28), FG)
      if (Math.floor(t * 2.2) % 2 === 0) {
        ctx.fillStyle = rgba(FG, 0.85)
        ctx.fillRect(tx + 104, ty + 92, 15, 32)
      }
      // the hint row with the line as its dim tail
      const hy = ty + 214
      const tf = F.mono(27)
      let x = tx + 70
      const put = (s, color = DIM) => {
        text(ctx, s, x, hy, tf, color)
        x += measure(ctx, s, tf)
      }
      const reach = tw(t, 35.9, 36.9, E.lin)
      put('? for shortcuts')
      x += 60
      const segs = items.map(it => ({ frac: it.frac, s: `${it.value} ${it.label.replace(' ', ' ')}` }))
      const cw = measure(ctx, ' ', tf)
      segs.forEach((g, i) => {
        const a = clamp(reach * 5 - i)
        if (a <= 0) return
        withAlpha(ctx, a, () => {
          pie(ctx, x + cw * 0.5, hy - 9, 10, g.frac, DIM)
          x += cw * 2
          put(g.s)
        })
        x += cw * 3
      })
      text(ctx, 'PromptHint · 终端', tx + tw2 - 40, ty + 296, F.mono(16), FAINT, { align: 'right' })
    })
  })
}

// ── 08 · install, and the mark ─────────────────────────────────────────────────────────────
const CMD1 = '/plugin marketplace add sundyme/usage-line'
const CMD2 = '/plugin install usage-line@usage-line'

function sceneInstall(ctx, t) {
  const e = tw(t, 37.95, 38.7, E.outExpo)
  const out = tw(t, 40.85, 41.35, E.inCubic)
  withAlpha(ctx, 1 - out, () => {
    reveal(ctx, '两行命令，即刻装好。', 168, 236, F.black(64), FG, tw(t, 38.05, 38.9, E.lin), { dy: 30, spread: 4, blur: 10 })
    reveal(ctx, 'Two commands, and it is there.', 168, 292, F.serif(40), DIM, tw(t, 38.3, 39.3, E.lin), { dy: 12, spread: 10, blur: 5 })
    withAlpha(ctx, e, () => {
      const cx = 168
      const cy = 400 + (1 - e) * 80
      roundRect(ctx, cx, cy, 1584, 380, 18)
      ctx.fillStyle = '#0b0b0a'
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.12)
      ctx.lineWidth = 1.5
      ctx.stroke()
      const f = F.mono(36)
      text(ctx, '›', cx + 60, cy + 110, F.monoB(36), BLUE)
      typed(ctx, CMD1, cx + 104, cy + 110, f, FG, tw(t, 38.45, 39.45, E.lin), { caret: t < 39.5, t, size: 36 })
      if (t > 39.5) {
        text(ctx, '›', cx + 60, cy + 190, F.monoB(36), BLUE)
        typed(ctx, CMD2, cx + 104, cy + 190, f, FG, tw(t, 39.55, 40.3, E.lin), { caret: t < 40.45, t, size: 36 })
      }
      const ok = tw(t, 40.45, 40.85, E.outCubic)
      if (ok > 0) {
        check(ctx, cx + 62, cy + 286, 30, BLUE, ok)
        text(ctx, '已启用 usage-line', cx + 112, cy + 296, F.med(32), FG, { alpha: ok })
        text(ctx, 'enabled', cx + 112 + measure(ctx, '已启用 usage-line', F.med(32)) + 18, cy + 294, F.mono(22), DIM, { alpha: ok })
      }
    })
  })
  // the end card
  const fin = tw(t, 41.15, 41.9, E.outExpo)
  if (fin > 0) {
    const close = tw(t, 41.35, 42.4, E.inOutCubic)
    const fade = 1 - tw(t, 43.3, 44.0, E.inOutSine)
    withAlpha(ctx, fade, () => {
      glowSpot(ctx, 960, 470, 700, BLUE, 0.1 * fin)
      lockup(ctx, 960, 470 + (1 - fin) * 30, lerp(1.08, 1.2, fin), {
        ringP: lerp(0, 1, close),
        word: tw(t, 41.3, 41.95, E.lin),
        caret: false,
        glow: 26 * close,
        alpha: fin,
      })
      reveal(ctx, '一行，全看清。', 960, 650, F.light(46), FG, tw(t, 41.7, 42.4, E.lin), { align: 'center', dy: 14, spread: 4, blur: 6 })
      text(ctx, 'github.com/sundyme/usage-line', 960, 716, F.mono(26), DIM, { align: 'center', alpha: tw(t, 42.0, 42.6) })
    })
  }
}

// ── composition ───────────────────────────────────────────────────────────────────────────
const SCENES = [
  [S.questions, sceneQuestions],
  [S.oneLine, sceneOneLine],
  [S.inPlace, sceneInPlace],
  [S.cache, sceneCache],
  [S.limits, sceneLimits],
  [S.context, sceneContext],
  [S.adaptive, sceneAdaptive],
  [S.install, sceneInstall],
]

function drawFrame(ctx, t, frame) {
  ctx.save()
  background(ctx, t)
  for (const [win, fn] of SCENES) if (t >= win.from && t < win.to) fn(ctx, t, frame)
  chrome(ctx, t, frame)
  ctx.restore()
}

// Average SAMPLES sub-frames across the shutter: true motion blur.
function renderFrame(canvas, frame) {
  const ctx = canvas.getContext('2d')
  const acc = new Float32Array(W * H * 4)
  for (let s = 0; s < SAMPLES; s++) {
    const t = (frame + ((s + 0.5) / SAMPLES - 0.5) * SHUTTER) / FPS
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    drawFrame(ctx, Math.max(0, t), frame)
    const d = ctx.getImageData(0, 0, W, H).data
    for (let i = 0; i < d.length; i++) acc[i] += d[i]
  }
  const out = Buffer.allocUnsafe(W * H * 4)
  for (let i = 0; i < out.length; i++) out[i] = Math.round(acc[i] / SAMPLES)
  return out
}

function ffmpeg(args) {
  return spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] })
}

async function renderChunk(a, b, file) {
  const canvas = createCanvas(W, H)
  const ff = ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', file])
  for (let f = a; f < b; f++) {
    const buf = renderFrame(canvas, f)
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
    if (process.send && (f - a) % 30 === 0) process.send({ done: f - a })
  }
  ff.stdin.end()
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`)))))
}

async function main() {
  const args = process.argv.slice(2)
  fs.mkdirSync(OUT, { recursive: true })
  if (args[0] === '--still') {
    fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true })
    const canvas = createCanvas(W, H)
    for (const ts of args[1].split(',')) {
      const f = Math.round(Number(ts) * FPS)
      const buf = renderFrame(canvas, f)
      const c = createCanvas(W, H)
      const id = c.getContext('2d').createImageData(W, H)
      id.data.set(buf)
      c.getContext('2d').putImageData(id, 0, 0)
      fs.writeFileSync(path.join(OUT, 'stills', `${Number(ts).toFixed(2)}.png`), await c.encode('png'))
    }
    return
  }
  if (args[0] === '--chunk') {
    const [a, b] = args[1].split(':').map(Number)
    await renderChunk(a, b, args[2])
    return
  }
  // the whole film, in parallel chunks
  const total = Math.round(DUR * FPS)
  const N = Number(process.env.JOBS || 9)
  const size = Math.ceil(total / N)
  const t0 = Date.now()
  const { fork } = await import('node:child_process')
  const done = new Array(N).fill(0)
  const files = []
  await Promise.all(
    Array.from({ length: N }, (_, i) => {
      const a = i * size
      const b = Math.min(total, a + size)
      const file = path.join(OUT, `chunk-${String(i).padStart(2, '0')}.mkv`)
      files.push(file)
      return new Promise((res, rej) => {
        const c = fork(fileURLToPath(import.meta.url), ['--chunk', `${a}:${b}`, file])
        c.on('message', m => {
          done[i] = m.done
          const n = done.reduce((x, y) => x + y, 0)
          process.stdout.write(`\r  ${n}/${total} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s   `)
        })
        c.on('exit', code => (code === 0 ? res() : rej(new Error(`chunk ${i} exited ${code}`))))
      })
    }),
  )
  process.stdout.write('\n')
  fs.writeFileSync(path.join(OUT, 'chunks.txt'), files.map(f => `file '${f}'`).join('\n'))
  const audio = path.join(OUT, 'score.wav')
  const final = path.join(OUT, 'usage-line.mp4')
  const enc = ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'chunks.txt'),
    ...(fs.existsSync(audio) ? ['-i', audio] : []),
    // film grain, also a dither against banding in the dark gradients
    '-vf', 'noise=c0s=5:c0f=t+u,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-tune', 'film', '-x264-params', 'aq-mode=3',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    ...(fs.existsSync(audio) ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
    '-movflags', '+faststart', final,
  ])
  await new Promise((res, rej) => enc.on('close', c => (c === 0 ? res() : rej(new Error(`encode ${c}`)))))
  console.log(`  → ${final}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}

// the banner (banner.mjs) draws with the same primitives
export { F, BG, SURFACE, SURFACE2, FG, DIM, FAINT, BLUE, AMBER, RED, TAU, rgba, text, measure, ring, drawRow, rowItems, lockup, glowSpot, roundRect }

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
