// v5 · the stage every shot stands on: a graphite studio, two type layers (one behind the glass,
// so the glass bends it, one in front), and glass pieces that carry their own crisp faces.
import * as THREE from 'three'
import { H, W, makeShot } from './engine.js'
import { UNIT, dist, ground, panel, typeLayer } from './kit.js'
import { BACK, FRONT, glassRender, onLayer } from './glass.js'
import { liquid } from './liquid.js'

export const FOV = 30
export const D = dist(FOV)

export const INK = '#f4f3ef'
export const MUTE = '#8e9097'
export const QUIET = '#5d6067'

// a studio, not a nebula: graphite, lit softly from the top left
export const GRAPHITE = {
  base: '#111215',
  blobs: [
    { c: '#262b36', x: 0.18, y: 0.92, r: 0.62, a: 1 },
    { c: '#1a1c21', x: 0.8, y: 0.62, r: 0.5, a: 0.8 },
    { c: '#0b0c0e', x: 0.6, y: 0.0, r: 0.5, a: 0 },
  ],
}

export function stage(world = GRAPHITE) {
  const s = makeShot()
  const bg = ground(s.scene, { warp: 0.02, ...world })
  const back = typeLayer(s.scene)
  const front = typeLayer(s.scene)
  onLayer(front.mesh, FRONT)
  s.render = glassRender(s)
  return { s, bg, back, front }
}

// A piece of glass with a face. w × h is the face; the glass plane is larger by m on each side
// so the shadow has room. Shapes default to one card that fills the face.
export function piece(scene, { w, h, r = 28, m = 120, res = 2, ...glassOpts } = {}) {
  const group = new THREE.Group()
  const glass = liquid({ w: w + m * 2, h: h + m * 2, ...glassOpts })
  glass.userData.set([{ x: 0, y: 0, w, h, r }])
  const face = panel(w, h, { res })
  onLayer(face, FRONT)
  face.renderOrder = 60
  face.position.z = 0.001
  group.add(glass, face)
  scene.add(group)
  return { group, glass, face, w, h }
}

// a screen px (x right, y down) on the z = 0 plane at the reference camera
export const at = (px, py) => [(px - W / 2) / UNIT, (H / 2 - py) / UNIT]

export { BACK, FRONT, UNIT }

// ── motion ──────────────────────────────────────────────────────────────────────────────────
import { E, clamp, lerp, prog } from './engine.js'
import { cursor, kin, roundRectPath } from './kit.js'
import { BLUE, F, measure, rgba, text } from './ui.js'

// a liquid spring: quick, one soft overshoot, settled by p = 1
export const spring = p => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-7 * p) * Math.cos(8.2 * p) * (1 - p * p * p))
export const sp = (t, a, dur = 0.6) => spring(prog(t, a, a + dur))

// ── type ────────────────────────────────────────────────────────────────────────────────────
// Two lines in the house style: the first in ink, the second quieter. Glyphs rise a little out
// of a soft blur and leave the same way.
const HEAD = { stagger: 0.026, dur: 0.75, rise: 0.22, outRise: 0.12, blurK: 12, outDur: 0.34 }
export function line(ctx, str, x, y, size, t, { t0, t1 = 1e9, color = INK, align = 'left', font = F.med, ...o } = {}) {
  return kin(ctx, str, x, y, font(size), t, { ...HEAD, t0, t1, color, align, ...o })
}
export function head(ctx, t, a, b, { t0, t1 = 1e9, x = 150, y = 400, size = 84, align = 'left', gap = 1.28, lag = 0.22, bsize = size, ...o } = {}) {
  line(ctx, a, x, y, size, t, { t0, t1, align, ...o })
  if (b) line(ctx, b, x, y + size * gap, bsize, t, { t0: t0 + lag, t1: t1 + 0.04, align, color: MUTE, ...o })
}

// ── the cursor and its click ────────────────────────────────────────────────────────────────
export function pointer(ctx, t, x, y, clicks = [], alpha = 1) {
  for (const c of clicks) {
    const q = prog(t, c, c + 0.55)
    if (q <= 0 || q >= 1) continue
    ctx.save()
    ctx.globalAlpha = alpha * (1 - E.outCubic(q)) * 0.7
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x + 2, y + 2, 10 + 46 * E.outCubic(q), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  const press = clicks.reduce((m, c) => Math.max(m, 1 - Math.abs(t - c - 0.04) / 0.1), 0)
  cursor(ctx, x, y, 1.05 - 0.12 * clamp(press), alpha)
}

// ── Claude Code's prompt box, drawn as it is ────────────────────────────────────────────────
export const INPUT = { w: 1400, h: 140, r: 36 }
export function drawInput(ctx, t, { w = INPUT.w, h = INPUT.h, typed = '', caret = false, placeholder = '继续说点什么…', icon = 1, iconHi = 0 } = {}) {
  const y1 = 58
  if (typed) {
    text(ctx, typed, 40, y1, F.mono(29), INK)
    if (caret && Math.floor(t * 2.2) % 2 === 0) {
      ctx.fillStyle = BLUE
      roundRectPath(ctx, 44 + measure(ctx, typed, F.mono(29)), y1 - 26, 3, 34, 1.5)
      ctx.fill()
    }
  } else {
    text(ctx, placeholder, 40, y1, F.reg(29), MUTE)
    if (caret && Math.floor(t * 2.2) % 2 === 0) {
      ctx.fillStyle = BLUE
      roundRectPath(ctx, 38, y1 - 26, 3, 34, 1.5)
      ctx.fill()
    }
  }
  text(ctx, '+', 40, h - 30, F.light(34), MUTE)
  text(ctx, 'Opus 5.5', 82, h - 34, F.reg(23), QUIET)
  // the usage icon: a small dial
  if (icon > 0) {
    const ix = w - 112
    const iy = h - 42
    ctx.save()
    ctx.globalAlpha = icon
    if (iconHi > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 * iconHi})`
      ctx.beginPath()
      ctx.arc(ix, iy, 24, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath()
    ctx.arc(ix, iy, 11, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#c9cbd1'
    ctx.beginPath()
    ctx.arc(ix, iy, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.4)
    ctx.stroke()
    ctx.restore()
  }
  // send
  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.arc(w - 52, h - 42, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#17181b'
  ctx.lineWidth = 3.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(w - 52, h - 32)
  ctx.lineTo(w - 52, h - 52)
  ctx.moveTo(w - 60, h - 44)
  ctx.lineTo(w - 52, h - 52)
  ctx.lineTo(w - 44, h - 44)
  ctx.stroke()
}

// ── a session behind the glass: something for the glass to bend ─────────────────────────────
export function drawSession(ctx, w) {
  const ask = '把 token 统计拆成独立模块，顺便补上测试'
  roundRectPath(ctx, w - 720, 40, 660, 62, 20)
  ctx.fillStyle = '#26282d'
  ctx.fill()
  text(ctx, ask, w - 696, 80, F.reg(26), INK)
  text(ctx, '好的。先读一下现有实现，再拆成三个文件。', 60, 170, F.reg(27), '#d9d8d3')
  const code = [
    [['export ', '#c792ea'], ['function ', '#c792ea'], ['countTokens', '#82aaff'], ['(msgs) {', '#d6deeb']],
    [['  const ', '#c792ea'], ['cached ', '#d6deeb'], ['= ', '#89ddff'], ['usage.cache_read', '#ffcb6b']],
    [['  return ', '#c792ea'], ['msgs.', '#d6deeb'], ['reduce', '#82aaff'], ['((n, m) => n + m.tokens, ', '#d6deeb'], ['0', '#f78c6c'], [')', '#d6deeb']],
    [['}', '#d6deeb']],
  ]
  roundRectPath(ctx, 50, 205, w - 100, 220, 18)
  ctx.fillStyle = '#18191d'
  ctx.fill()
  code.forEach((ln, i) => {
    let x = 84
    ln.forEach(([s, c]) => {
      text(ctx, s, x, 262 + i * 44, F.mono(25), c)
      x += measure(ctx, s, F.mono(25))
    })
  })
  const tool = (verb, arg, extra, y, col) => {
    ctx.beginPath()
    ctx.arc(70, y - 8, 6, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.fill()
    text(ctx, verb, 90, y, F.monoB(24), INK)
    text(ctx, arg, 180, y, F.mono(24), MUTE)
    if (extra) text(ctx, extra, 180 + measure(ctx, arg, F.mono(24)) + 22, y, F.mono(24), col)
  }
  tool('Edit', 'src/usage/tokens.ts', '+84 −12', 490, '#e5a33a')
  tool('Bash', 'bun test', '18 pass', 534, '#3fb950')
  text(ctx, '拆分完成，测试全部通过。', 60, 604, F.reg(27), '#d9d8d3')
}

// a soft pool of light on a type layer
export function pool(ctx, x, y, r, color, a) {
  if (a <= 0.001) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, rgba(color, a))
  g.addColorStop(0.5, rgba(color, a * 0.32))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}
