// 2D drawing for the textures the 3D world shows: the plugin's UI, exact to its source, and
// the film's type. Canvas 2D, so every texture is redrawn crisp for the frame it is in.
import * as THREE from 'three'
import { clamp, lerp, E } from './engine.js'

export const BG = '#0d0c0b'
export const SURFACE = '#1b1a18'
export const SURFACE2 = '#23211e'
export const FG = '#ece9e2'
export const DIM = '#8c8780'
export const FAINT = '#56524c'
export const BLUE = '#4e8ff7'
export const AMBER = '#e5a33a'
export const RED = '#e5534b'
export const GREY = '#8a8a8a'
export const TAU = Math.PI * 2

export const F = {
  light: s => `${s}px "SC Light"`,
  reg: s => `${s}px "SC Regular"`,
  med: s => `${s}px "SC Medium"`,
  bold: s => `${s}px "SC Bold"`,
  black: s => `${s}px "SC Black"`,
  mono: s => `${s}px "Mono", "SC Regular"`,
  monoB: s => `${s}px "Mono SemiBold", "SC Medium"`,
  serif: s => `${s}px "Serif Italic"`,
}

export const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
export const rgba = (hex, a = 1) => `rgba(${rgb(hex).join(',')},${a})`
export const mix = (h1, h2, p) => {
  const a = rgb(h1)
  const b = rgb(h2)
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(p))).toString(16).padStart(2, '0')).join('')
}
export const ringColor = p => (p >= 90 ? RED : p >= 70 ? AMBER : BLUE)

export const clockText = sec => {
  const s = Math.max(0, Math.ceil(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export function span(min) {
  const m = Math.max(0, Math.round(min))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d) return `${d}d${h}h`
  if (h) return `${h}h${m % 60}m`
  return `${m}m`
}

// ── a texture you draw into ─────────────────────────────────────────────────────────────────
export function canvasTexture(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.premultiplyAlpha = true
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  let last = null
  return {
    canvas,
    ctx,
    tex,
    w,
    h,
    // redraw only when the key changes
    draw(key, fn) {
      if (key !== undefined && key === last) return
      last = key
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.filter = 'none'
      ctx.clearRect(0, 0, w, h)
      fn(ctx)
      tex.needsUpdate = true
    },
  }
}

// ── glyph and text ──────────────────────────────────────────────────────────────────────────
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

export function measure(ctx, str, font) {
  ctx.font = font
  if (!str.includes(RELOAD)) return ctx.measureText(str).width
  return str.split(RELOAD).reduce((w, part, i) => w + ctx.measureText(part).width + (i ? fontPx(font) * 0.84 : 0), 0)
}

export function text(ctx, str, x, y, font, color, { align = 'left', alpha = 1, blur = 0, tracking = 0 } = {}) {
  if (alpha <= 0.001) return
  ctx.save()
  ctx.globalAlpha *= alpha
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'alphabetic'
  if (blur > 0.2) ctx.filter = `blur(${blur.toFixed(2)}px)`
  if (tracking) ctx.letterSpacing = `${tracking}px`
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

// Glyph-by-glyph entrance: each rises, sharpens and fades in, staggered.
export function reveal(ctx, str, x, y, font, color, p, o = {}) {
  const { align = 'left', dy = 36, spread = 5, blur = 10, alpha = 1, ease = E.outCubic, tracking = 0 } = o
  if (p <= 0 || alpha <= 0.001) return
  if (p >= 1) return text(ctx, str, x, y, font, color, { align, alpha, tracking })
  ctx.font = font
  const chars = [...str]
  const widths = chars.map(c => ctx.measureText(c).width + tracking)
  const total = widths.reduce((a, b) => a + b, 0)
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  const n = chars.length
  chars.forEach((c, i) => {
    const q = ease(clamp((p * (n + spread) - i) / spread))
    if (q > 0.001) text(ctx, c, cx, y + (1 - q) * dy, font, color, { alpha: alpha * q, blur: (1 - q) * blur })
    cx += widths[i]
  })
}

export function typed(ctx, str, x, y, font, color, p, { caret = true, caretColor = FG, t = 0, size = 30 } = {}) {
  const chars = [...str]
  const n = Math.floor(clamp(p) * chars.length + 1e-6)
  const shown = chars.slice(0, n).join('')
  text(ctx, shown, x, y, font, color)
  if (caret && (p < 1 || Math.floor(t * 2.2) % 2 === 0)) {
    const cx = x + measure(ctx, shown, font) + 4
    ctx.fillStyle = rgba(caretColor, 0.9)
    ctx.fillRect(cx, y - size * 0.78, size * 0.52, size * 0.98)
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// The plugin's ring: grey track, arc from twelve o'clock; an empty ring that has a colour
// wears it on its track.
export function ring(ctx, cx, cy, r, w, frac, color, { alpha = 1, glow = 0, minArc = 0.04 } = {}) {
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
    const a = Math.min(0.99995, Math.max(p, minArc))
    const arc = () => {
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * a)
      ctx.strokeStyle = color
      ctx.stroke()
    }
    if (glow > 0) {
      ctx.save()
      ctx.shadowColor = rgba(color, 0.85)
      ctx.shadowBlur = glow
      arc()
      ctx.restore()
    }
    arc()
  }
  ctx.restore()
}

export function pie(ctx, cx, cy, r, frac, color) {
  const f = clamp(frac)
  const q = f === 0 ? 0 : Math.max(1, Math.round(f * 4))
  ctx.save()
  ctx.lineWidth = Math.max(1.5, r * 0.22)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.stroke()
  ctx.beginPath()
  if (q === 4) ctx.arc(cx, cy, r, 0, TAU)
  else if (q > 0) {
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (TAU * q) / 4)
    ctx.closePath()
  }
  if (q > 0) ctx.fill()
  ctx.restore()
}

export function glowSpot(ctx, x, y, r, color, a) {
  if (a <= 0.001) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, a))
  g.addColorStop(0.45, rgba(color, a * 0.35))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

export function check(ctx, x, y, s, color, p) {
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

// ── the row: the plugin's AbovePrompt band ─────────────────────────────────────────────────
export function rowLayout(ctx, items, mode, size) {
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

export function drawRow(ctx, x, yc, items, o = {}) {
  const { size = 24, mode = 'full', from = null, p = 1, reveal: rv = () => 1, alpha = 1, glow = 0 } = o
  const a = rowLayout(ctx, items, mode, size)
  const b = from ? rowLayout(ctx, items, from, size) : a
  const q = E.inOutCubic(clamp(p))
  const r = size * 0.45
  items.forEach((it, i) => {
    const s = rv(i)
    if (s <= 0) return
    const dx = lerp(b[i].x, a[i].x, q) - a[i].x
    ctx.save()
    ctx.globalAlpha *= alpha * clamp(s * 1.5)
    ring(ctx, x + a[i].ringX + dx, yc, r, size * 0.15, it.frac * E.outCubic(s), it.color, { glow })
    text(ctx, it.value, x + a[i].valueX + dx, yc + size * 0.36, F.med(size), FG)
    const lab = (lbl, la) => text(ctx, lbl, x + a[i].labelX + dx, yc + size * 0.36, F.reg(size), DIM, { alpha: la })
    if (from && b[i].label !== a[i].label) {
      if (b[i].label) lab(b[i].label, 1 - E.outCubic(clamp(p * 2.2)))
      if (a[i].label) lab(a[i].label, E.outCubic(clamp(p * 2 - 1)))
    } else if (a[i].label) lab(a[i].label, 1)
    ctx.restore()
  })
  return a
}

export function rowItems({ cacheLeft = null, ttl = 3600, five = 13, seven = 63, ctx: cp = 25, fiveReset = 174, sevenReset = 6060 } = {}) {
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
