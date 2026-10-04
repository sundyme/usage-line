// What the shots share: the colour worlds, the chapter nav (the plugin's own row), the
// chapter's type column, the big ring, and the Claude Code window.
import * as THREE from 'three'
import { E, W, H, clamp, lerp, prog, tw } from './engine.js'
import { UNIT, glass, kin, panel, roundRectPath } from './kit.js'
import {
  AMBER, BLUE, DIM, F, FAINT, FG, GREY, RED, SURFACE, SURFACE2, TAU,
  clockText, measure, pie, rgba, ring, ringColor, rowItems, rowLayout, span, text,
} from './ui.js'

// ── colour worlds ───────────────────────────────────────────────────────────────────────────
export const WORLD = {
  open: { base: '#040408', blobs: [{ c: '#2c1670', x: 0.85, y: 0.85, r: 0.42, a: 1 }, { c: '#0a2c66', x: 0.1, y: 0.15, r: 0.5, a: 0.9 }, { c: '#120d2e', x: 0.5, y: 0.5, r: 0.7, a: 0.7 }] },
  cache: { base: '#03060d', blobs: [{ c: '#0b3aa8', x: 0.78, y: 0.62, r: 0.42, a: 1 }, { c: '#06607a', x: 0.95, y: 0.1, r: 0.4, a: 0.8 }, { c: '#151a55', x: 0.15, y: 0.85, r: 0.5, a: 0.7 }] },
  five: { base: '#07040e', blobs: [{ c: '#4c1d95', x: 0.78, y: 0.6, r: 0.42, a: 1 }, { c: '#7a1a8a', x: 0.98, y: 0.08, r: 0.4, a: 0.7 }, { c: '#1e1550', x: 0.12, y: 0.85, r: 0.5, a: 0.8 }] },
  seven: { base: '#0b0309', blobs: [{ c: '#8a1450', x: 0.78, y: 0.6, r: 0.42, a: 0.95 }, { c: '#5b1d8f', x: 0.98, y: 0.1, r: 0.4, a: 0.7 }, { c: '#3a0a22', x: 0.12, y: 0.85, r: 0.5, a: 0.8 }] },
  context: { base: '#020a0a', blobs: [{ c: '#0d6b62', x: 0.78, y: 0.6, r: 0.42, a: 0.95 }, { c: '#0a5570', x: 0.98, y: 0.1, r: 0.4, a: 0.7 }, { c: '#0a2a2a', x: 0.12, y: 0.85, r: 0.5, a: 0.8 }] },
  light: { base: '#f2f1ee', light: true, blobs: [{ c: '#cfdcff', x: 0.82, y: 0.78, r: 0.4, a: 0.9 }, { c: '#eadcff', x: 0.12, y: 0.2, r: 0.42, a: 0.8 }, { c: '#d6f5ee', x: 0.55, y: 0.05, r: 0.3, a: 0.6 }] },
  install: { base: '#050607', blobs: [{ c: '#18222e', x: 0.5, y: 0.5, r: 0.6, a: 1 }, { c: '#0f2f55', x: 0.1, y: 0.9, r: 0.4, a: 0.8 }, { c: '#0d3b2a', x: 0.9, y: 0.1, r: 0.35, a: 0.6 }] },
  payoff: { base: '#04040a', blobs: [{ c: '#1a2f8a', x: 0.3, y: 0.6, r: 0.5, a: 0.9 }, { c: '#3b1780', x: 0.75, y: 0.4, r: 0.45, a: 0.8 }] },
  finale: { base: '#04050b', blobs: [{ c: '#1440a8', x: 0.35, y: 0.55, r: 0.5, a: 1 }, { c: '#4a1d96', x: 0.85, y: 0.8, r: 0.42, a: 0.8 }, { c: '#06607a', x: 0.12, y: 0.1, r: 0.4, a: 0.6 }] },
}

// Each chapter's accent: a gradient for its words and the tint of its world.
export const ACCENT = {
  cache: ['#a9d4ff', '#4e8ff7'],
  five: ['#ddd0ff', '#8b5cf6'],
  seven: ['#ffc6e6', '#ec4899'],
  context: ['#b0f5e8', '#14b8a6'],
  blue: ['#a9d4ff', '#4e8ff7'],
  ink: ['#2f6fe8', '#7c3aed'],
  green: ['#b7f7c8', '#3fb950'],
}
export const CHAPTERS = ['cache', 'five', 'seven', 'context']

// ── the nav: the plugin's own row, the chapter you are in lit ────────────────────────────────
const NAV_SIZE = 25
export function navItems(i, cacheLeft = 3600) {
  return [
    rowItems({ cacheLeft })[0],
    rowItems({ five: 9, fiveReset: 248 })[1],
    rowItems({ seven: 67, sevenReset: 4620 })[2],
    rowItems({ ctx: 40 })[3],
  ].map((it, k) => ({ ...it, active: k === i }))
}
let navCtx = null
export function navLayout() {
  navCtx ??= document.createElement('canvas').getContext('2d')
  const items = navItems(0)
  const lay = rowLayout(navCtx, items, 'full', NAV_SIZE)
  const width = lay[lay.length - 1].x + lay[lay.length - 1].w
  const x0 = W / 2 - width / 2
  return { lay, x0, y: 986, width }
}
// screen position of nav ring i (px, y down)
export function navRing(i) {
  const { lay, x0, y } = navLayout()
  return [x0 + lay[i].ringX, y]
}
export function drawNav(ctx, active, { alpha = 1, accent = null, cacheLeft = 3600 } = {}) {
  if (alpha <= 0.001) return
  const { lay, x0, y } = navLayout()
  const items = navItems(active, cacheLeft)
  ctx.save()
  ctx.globalAlpha = alpha
  // the lit pill
  if (active >= 0) {
    const L = lay[active]
    const pad = 18
    roundRectPath(ctx, x0 + L.x - pad, y - 26, L.w + pad * 2, 52, 26)
    ctx.fillStyle = rgba(accent ?? BLUE, 0.16)
    ctx.fill()
    ctx.strokeStyle = rgba(accent ?? BLUE, 0.45)
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  items.forEach((it, k) => {
    const L = lay[k]
    ctx.save()
    ctx.globalAlpha = alpha * (it.active ? 1 : 0.38)
    ring(ctx, x0 + L.ringX, y, NAV_SIZE * 0.45, NAV_SIZE * 0.15, it.frac, it.color)
    text(ctx, it.value, x0 + L.valueX, y + NAV_SIZE * 0.36, F.med(NAV_SIZE), FG)
    if (L.label) text(ctx, L.label, x0 + L.labelX, y + NAV_SIZE * 0.36, F.reg(NAV_SIZE), DIM)
    ctx.restore()
  })
  ctx.restore()
}

// ── the chapter's type column ───────────────────────────────────────────────────────────────
// caption (mono, small), title (huge), and sublines that replace one another.
export function chapterType(ctx, t, { caption, title, titleAccent = null, subs = [], accent, t0, t1, x = 150 }) {
  const [c0, c1] = accent
  kin(ctx, caption, x, 372, F.mono(24), t, { t0, t1, style: 'type', align: 'left', stagger: 0.018, color: rgba(c0, 0.85) })
  kin(ctx, title, x, 520, F.bold(132), t, { t0: t0 + 0.1, t1, style: 'rise', align: 'left', stagger: 0.045, accent: titleAccent ? [...titleAccent, [c0, c1]] : null, tracking: -2 })
  subs.forEach(([s0, s1, str, acc, cols]) => {
    kin(ctx, str, x + 4, 612, F.med(46), t, { t0: s0, t1: Math.min(s1, t1), style: 'rise', align: 'left', stagger: 0.028, color: rgba(FG, 0.86), accent: acc ? [...acc, cols ?? [c0, c1]] : null, rise: 0.6 })
  })
}

// ── the big ring ────────────────────────────────────────────────────────────────────────────
// Two planes: the light (additive, above white so it blooms) and the type (crisp).
export function bigRing(size = 860) {
  const group = new THREE.Group()
  const lightP = panel(size, size, { res: 1.25, intensity: 1.35, blending: THREE.AdditiveBlending })
  const typeP = panel(size, size, { res: 1.5 })
  lightP.renderOrder = 10
  typeP.renderOrder = 11
  group.add(lightP, typeP)
  const c = size / 2
  const R = size * 0.38
  const lw = size * 0.04
  group.userData.draw = (key, { frac, color, value, valueFont, valueColor = FG, label, kicker, chip, marks = [], glowK = 1 }) => {
    lightP.userData.draw(key, ctx => {
      // ticks
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + (i / 60) * TAU
        const on = i / 60 < frac - 1e-6
        const r0 = R + lw * 1.6
        const r1 = R + lw * (i % 5 === 0 ? 2.5 : 2.1)
        ctx.strokeStyle = on ? rgba(color, 0.9) : 'rgba(255,255,255,0.13)'
        ctx.lineWidth = i % 5 === 0 ? 3 : 2
        ctx.beginPath()
        ctx.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0)
        ctx.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1)
        ctx.stroke()
      }
      // track
      ctx.lineWidth = lw
      ctx.strokeStyle = frac <= 0 && color !== GREY ? rgba(color, 0.5) : 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.arc(c, c, R, 0, TAU)
      ctx.stroke()
      if (frac > 0) {
        const a1 = -Math.PI / 2 + TAU * Math.min(0.99995, frac)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.shadowColor = rgba(color, 0.9 * glowK)
        ctx.shadowBlur = 50 * glowK
        const g = ctx.createConicGradient(-Math.PI / 2, c, c)
        g.addColorStop(0, rgba(color, 0.35))
        g.addColorStop(Math.max(0.01, frac), color)
        ctx.strokeStyle = g
        ctx.beginPath()
        ctx.arc(c, c, R, -Math.PI / 2, a1)
        ctx.stroke()
        ctx.restore()
        // a hot head
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = rgba(color, 1)
        ctx.shadowBlur = 30
        ctx.beginPath()
        ctx.arc(c + Math.cos(a1) * R, c + Math.sin(a1) * R, lw * 0.32, 0, TAU)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      // threshold marks
      for (const [f, col, lab] of marks) {
        const a = -Math.PI / 2 + TAU * f
        ctx.strokeStyle = col
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(c + Math.cos(a) * (R - lw * 1.1), c + Math.sin(a) * (R - lw * 1.1))
        ctx.lineTo(c + Math.cos(a) * (R + lw * 1.1), c + Math.sin(a) * (R + lw * 1.1))
        ctx.stroke()
      }
    })
    typeP.userData.draw(key, ctx => {
      if (kicker) text(ctx, kicker, c, c - size * 0.15, F.mono(size * 0.026), DIM, { align: 'center', tracking: 3 })
      text(ctx, value, c, c + size * 0.07, valueFont ?? F.monoB(size * 0.2), valueColor, { align: 'center' })
      if (label) text(ctx, label, c, c + size * 0.17, F.med(size * 0.05), DIM, { align: 'center' })
      if (chip) {
        const f = F.med(size * 0.034)
        const cw = measure(ctx, chip, f) + size * 0.06
        glass(ctx, c - cw / 2, c + size * 0.215, cw, size * 0.06, size * 0.03, { base: 'rgba(255,255,255,0.04)', fill: 0.04, border: 0.2, shadow: 0, top: 0.03 })
        text(ctx, chip, c, c + size * 0.257, f, FG, { align: 'center' })
      }
      for (const [f, col, lab] of marks) {
        const a = -Math.PI / 2 + TAU * f
        text(ctx, lab, c + Math.cos(a) * (R + lw * 3.6), c + Math.sin(a) * (R + lw * 3.6) + 8, F.monoB(24), col, { align: 'center' })
      }
    })
  }
  return group
}

// ── the Claude Code window ──────────────────────────────────────────────────────────────────
export const WIN = { w: 1600, h: 1000 }
export const ROW = { x: 80, y: 640, size: 30 }
export const wx = px => (px - WIN.w / 2) / UNIT
export const wy = py => (WIN.h / 2 - py) / UNIT

export function windowBase(ctx, w, h, { title = 'api-server', radius = 30 } = {}) {
  roundRectPath(ctx, 2, 2, w - 4, h - 4, radius)
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h)
  g.addColorStop(0, '#22211e')
  g.addColorStop(1, '#191816')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 2
  ctx.stroke()
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(34 + i * 26, 32, 8, 0, TAU)
    ctx.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i]
    ctx.globalAlpha = 0.85
    ctx.fill()
    ctx.globalAlpha = 1
  }
  text(ctx, title, w / 2, 40, F.med(21), DIM, { align: 'center' })
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(2, 64, w - 4, 2)
}

export function windowTalk(ctx, w, { s = 1 } = {}) {
  const ask = '把 token 统计拆成独立模块，顺便补上测试'
  const f = F.reg(27)
  const bw = measure(ctx, ask, f) + 48
  roundRectPath(ctx, w - 70 - bw, 40, bw, 64, 20)
  ctx.fillStyle = SURFACE2
  ctx.fill()
  text(ctx, ask, w - 70 - bw + 24, 82, f, FG)
  const ax = 86
  text(ctx, '好的。先读一下现有实现，再拆成三个文件。', ax, 172, f, FG)
  const tool = (verb, arg, extra, y, hi) => {
    ctx.beginPath()
    ctx.arc(ax + 6, y - 8, 6, 0, TAU)
    ctx.fillStyle = hi ? '#3fb950' : '#6f6b64'
    ctx.fill()
    text(ctx, verb, ax + 28, y, F.monoB(23), FG)
    text(ctx, arg, ax + 124, y, F.mono(23), DIM)
    if (extra) text(ctx, extra, ax + 124 + measure(ctx, arg, F.mono(23)) + 26, y, F.mono(23), hi ? '#3fb950' : DIM)
  }
  tool('Read', 'src/usage.ts', '', 236, false)
  tool('Edit', 'src/usage/tokens.ts', '+84 −12', 278, false)
  tool('Bash', 'bun test', '18 pass', 320, true)
  text(ctx, '拆分完成，测试全部通过。', ax, 392, f, FG)
}

export function windowPrompt(ctx, w, h = 170, { placeholder = '继续说点什么…' } = {}) {
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 24)
  ctx.fillStyle = SURFACE2
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.13)'
  ctx.lineWidth = 2
  ctx.stroke()
  text(ctx, placeholder, 32, 62, F.reg(28), FAINT)
  ctx.beginPath()
  ctx.arc(46, h - 46, 19, 0, TAU)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(w - 48, h - 46, 23, 0, TAU)
  ctx.fillStyle = 'rgba(236,233,226,0.9)'
  ctx.fill()
  ctx.strokeStyle = '#0d0c0b'
  ctx.lineWidth = 3.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(w - 48, h - 37)
  ctx.lineTo(w - 48, h - 55)
  ctx.moveTo(w - 56, h - 47)
  ctx.lineTo(w - 48, h - 55)
  ctx.lineTo(w - 40, h - 47)
  ctx.stroke()
}

// One row item on its own plane, so each can fly in by itself.
export function rowItemPanels(items, size = ROW.size, res = 4) {
  const c = document.createElement('canvas').getContext('2d')
  const lay = rowLayout(c, items, 'full', size)
  return lay.map((L, i) => {
    const w = L.w + 24
    const h = size * 2.2
    const p = panel(w, h, { res })
    p.userData.lay = L
    p.userData.redraw = (key, it, o = {}) =>
      p.userData.draw(key, ctx => {
        const yc = h / 2
        const r = size * 0.45
        ring(ctx, 12 + size * 0.55, yc, r, size * 0.15, it.frac, it.color, { glow: o.glow ?? 0 })
        text(ctx, it.value, 12 + L.valueX - L.x, yc + size * 0.36, F.med(size), FG)
        if (L.label) text(ctx, L.label, 12 + L.labelX - L.x, yc + size * 0.36, F.reg(size), DIM, { alpha: o.labelAlpha ?? 1 })
      })
    p.userData.cx = L.x + w / 2 - 12 // centre in row px
    return p
  })
}

// The terminal's row: pies and mono.
export function terminalRow(ctx, x, y, items, size = 24) {
  let cx = x
  items.forEach(it => {
    pie(ctx, cx + size * 0.4, y - size * 0.32, size * 0.36, it.frac, it.color)
    cx += size * 1.1
    text(ctx, it.value, cx, y, F.mono(size), FG)
    cx += measure(ctx, it.value, F.mono(size)) + size * 0.4
    text(ctx, it.label, cx, y, F.mono(size), DIM)
    cx += measure(ctx, it.label, F.mono(size)) + size * 1.4
  })
}

export { AMBER, BLUE, DIM, F, FAINT, FG, GREY, RED, SURFACE, SURFACE2, TAU, clockText, measure, rgba, ring, ringColor, rowItems, rowLayout, span, text }
