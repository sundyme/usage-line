// The film, v2 · 01–03: the questions at depth, one line and the mark, and the drop: the row's
// four pieces fall onto a Claude Code window lying in perspective, which turns to face us.
import * as THREE from 'three'
import { E, clamp, keys, lerp, prog, tw } from './engine.js'
import { glow, toPx } from './kit.js'
import { AMBER, BLUE, DIM, F, FAINT, FG, RED, SURFACE, SURFACE2, TAU, drawRow, glowSpot, measure, mix, reveal, rgba, ring, rowItems, rowLayout, text, typed } from './ui.js'
import { D, at, orbit, panel, rr, shadow, snap, world, GRID, edge } from './f2kit.js'

export const SUB = '#a8a299'
const BG = '#121110'

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
export { ripple }

// ── the mark: a ring that runs out into a line ──────────────────────────────────────────────
export const LOCK = { R: 46, tailA: 66, tailB: 142, wordX: 174, size: 100 }
export function lockup(ctx, cx, cy, scale, o) {
  const { ringP = 1, tailA = LOCK.tailA, tailB = LOCK.tailB, word = 1, alpha = 1, glow = 0, caret = false, t = 0 } = o
  const m = measure(ctx, 'usage-line', F.mono(LOCK.size))
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

// ═══ 01 · the questions, each on its own plane ═══════════════════════════════════════════════
const QUESTIONS = [
  { zh: '缓存还剩几分钟？', en: 'How long until the prompt cache goes cold?', tag: '无从得知', x: 168, y: 300, align: 'left', at: 0.35, z: 1.4 },
  { zh: '5 小时额度，用掉多少了？', en: 'How much of the five-hour window is gone?', tag: '/usage', x: 1752, y: 492, align: 'right', at: 1.3, z: -1.2 },
  { zh: '这周的额度，哪天重置？', en: 'When does the weekly limit reset?', tag: '/usage', x: 168, y: 684, align: 'left', at: 2.25, z: 0.8 },
  { zh: '上下文，还装得下吗？', en: 'Is there still room in the context?', tag: '/context', x: 1752, y: 876, align: 'right', at: 3.15, z: -2.0 },
]
const QW = 1500
const QH = 200
// where a question's tag sits on its plane: the point the question condenses into (T2)
const scratch = document.createElement('canvas').getContext('2d')
function tagAnchor(q) {
  const left = q.align === 'left'
  const x = left ? 20 : QW - 20
  const zw = measure(scratch, q.zh, F.bold(78))
  const tf = q.tag.startsWith('/') ? F.mono(22) : F.reg(22)
  const tw2 = measure(scratch, q.tag, tf) + 28
  return [left ? x + zw + 26 + tw2 / 2 : x - zw - 26 - tw2 / 2, 74]
}
function drawQuestion(ctx, q, t, c = 0, color = BLUE) {
  if (c <= 0) return drawQuestionBody(ctx, q, t)
  const [ax, ay] = tagAnchor(q)
  ctx.save()
  ctx.translate(ax, ay)
  ctx.scale(1 - 0.94 * c, 1 - 0.7 * c)
  ctx.translate(-ax, -ay)
  ctx.globalAlpha *= 1 - c * c
  ctx.filter = `blur(${(c * 9).toFixed(1)}px)`
  drawQuestionBody(ctx, q, t)
  ctx.restore()
  glowSpot(ctx, ax, ay, 90, color, Math.sin(Math.PI * Math.min(1, c * 1.2)) * 0.8)
}
function drawQuestionBody(ctx, q, t) {
  const left = q.align === 'left'
  const x = left ? 20 : QW - 20
  reveal(ctx, q.zh, x, 100, F.bold(78), FG, tw(t, q.at, q.at + 0.85, E.lin), { align: q.align, dy: 44, spread: 4, blur: 14 })
  reveal(ctx, q.en, x, 162, F.light(33), SUB, tw(t, q.at + 0.25, q.at + 1.2, E.lin), { align: q.align, dy: 16, spread: 10, blur: 6, tracking: 0.8 })
  const tp = tw(t, q.at + 0.55, q.at + 1.0, E.outBack)
  if (tp <= 0) return
  const zw = measure(ctx, q.zh, F.bold(78))
  const tf = q.tag.startsWith('/') ? F.mono(22) : F.reg(22)
  const tw2 = measure(ctx, q.tag, tf) + 28
  const tx = left ? x + zw + 26 : x - zw - 26 - tw2
  ctx.save()
  ctx.globalAlpha *= clamp(tp)
  ctx.translate(tx + tw2 / 2, 74)
  ctx.scale(lerp(0.7, 1, tp), lerp(0.7, 1, tp))
  rr(ctx, -tw2 / 2, -20, tw2, 40, 20)
  ctx.strokeStyle = rgba(FG, 0.22)
  ctx.lineWidth = 1.5
  ctx.stroke()
  text(ctx, q.tag, 0, 8, tf, DIM, { align: 'center' })
  ctx.restore()
}

// ═══ 02 · the answers line up, and the line becomes the mark ═══════════════════════════════
// Each question turns into its answer, a ring, which flies into one large usage-line row. The row
// zips left into a single ring; the travel leaves a line behind it, which is the mark's tail.
const BIG = 56
const BIG_Y = 556
const BIG_ITEMS = rowItems({ cacheLeft: 3600, five: 13, seven: 63, ctx: 25 })
const FLY0 = 4.85
const FLY_GAP = 0.07
const FLY_DUR = 1.0
const MERGE = [8.2, 8.85]
// The 4–6 s transition, chosen by ?tr=: 't1' (the film's: the camera flies through the questions
// to the row waiting behind them), 't2' (each question condenses into its ring), 'now' (v2.1).
const TR = new URLSearchParams(location.search).get('tr') || 't1'
const T1 = { push: [3.9, 6.0], row: 4.75 }
const COL0 = 4.5
const COL_GAP = 0.17
const COL_DUR = 0.4
const SPAWN = 0.22
const FLY2 = 0.78
const colAt = i => COL0 + i * COL_GAP
const LANDED = colAt(3) + SPAWN + FLY2
const bigLayout = (() => {
  const c = document.createElement('canvas').getContext('2d')
  const L = rowLayout(c, BIG_ITEMS, 'short', BIG)
  const w = L[3].x + L[3].w
  return { L, w, x0: 960 - w / 2 }
})()
const markOrigin = ctx => {
  const m = measure(ctx, 'usage-line', F.mono(LOCK.size))
  return 960 - (LOCK.wordX + m + LOCK.R) / 2 + LOCK.R
}
// one item of the big row: ring, value, label, each with its own presence
function bigItem(ctx, it, x, yc, { fill = 1, textA = 1, r = BIG * 0.45, lw = BIG * 0.15, glow = 18 } = {}) {
  ring(ctx, x, yc, r, lw, it.frac * fill, it.color, { glow, minArc: 0, track: TR === 'now' ? 0.35 : 0.6 })
  if (textA <= 0.001) return
  ctx.save()
  ctx.globalAlpha *= textA
  text(ctx, it.value, x + BIG * 0.55 + BIG * 0.4, yc + BIG * 0.36, F.med(BIG), FG)
  const vw = it.minW ? Math.max(measure(ctx, it.value, F.med(BIG)), measure(ctx, '00:00', F.med(BIG))) : measure(ctx, it.value, F.med(BIG))
  text(ctx, it.short, x + BIG * 0.55 + BIG * 0.8 + vw, yc + BIG * 0.36, F.reg(BIG), DIM)
  ctx.restore()
}
function drawRowToMark(ctx, t) {
  const { L, x0 } = bigLayout
  const ox = markOrigin(ctx)
  const settled = TR === 't1' ? t >= T1.row : TR === 't2' ? t >= LANDED : t >= FLY0 + 3 * FLY_GAP + FLY_DUR * 0.6
  const fill = i => (TR === 't2' ? 1 : TR === 't1' ? tw(t, 4.5 + i * 0.1, 6.0, E.inOutCubic) : tw(t, FLY0 + i * FLY_GAP + 0.45, 6.0, E.inOutCubic))
  const flash = t >= 6.0 ? Math.exp(-(t - 6.0) * 3) : 0
  // the headline above, the English below, between the landing and the zip
  const hA = tw(t, 6.0, 6.6) * (1 - tw(t, 7.85, 8.25, E.inCubic))
  if (hA > 0) {
    reveal(ctx, '一行，全看清。', 960, 380 - 24 * tw(t, 7.85, 8.25, E.inCubic), F.bold(112), FG, tw(t, 6.0, 6.75, E.lin), { align: 'center', dy: 40, spread: 3, blur: 10, alpha: hA })
    reveal(ctx, 'Everything you need, in one line.', 960, 712, F.light(38), SUB, tw(t, 6.3, 7.2, E.lin), { align: 'center', dy: 14, spread: 10, blur: 5, alpha: hA, tracking: 1.2 })
  }
  if (!settled && t < MERGE[0]) return
  // the zip: every ring slides into the first, which grows into the mark's ring
  const zip = i => E.inOutExpo(prog(t, MERGE[0] + (3 - i) * 0.04, MERGE[1] - i * 0.03))
  const textA = 1 - tw(t, 7.85, 8.3)
  const rightmost = Math.max(...[1, 2, 3].map(i => lerp(x0 + L[i].ringX, ox, zip(i))))
  // the trail the row leaves: from the mark's ring out to the last ring still travelling
  const trail = tw(t, MERGE[0] + 0.05, MERGE[0] + 0.2)
  if (trail > 0 && t < 10.4) {
    const exit = tw(t, 9.75, 10.35, E.inCubic)
    ctx.save()
    ctx.globalAlpha *= trail * (1 - exit)
    ctx.translate(960, lerp(0, -320, exit) + lerp(BIG_Y, 540, zip(0)))
    ctx.scale(lerp(1, 0.6, exit), lerp(1, 0.6, exit))
    ctx.translate(-960, 0)
    ctx.strokeStyle = FG
    ctx.lineCap = 'round'
    ctx.lineWidth = lerp(BIG * 0.15, 13, zip(0))
    ctx.beginPath()
    ctx.moveTo(ox + LOCK.tailA, 0)
    ctx.lineTo(Math.max(ox + LOCK.tailB, rightmost - 20), 0)
    ctx.stroke()
    ctx.restore()
  }
  if (t < MERGE[0] + 0.02) {
    BIG_ITEMS.forEach((it, i) => bigItem(ctx, it, x0 + L[i].ringX, BIG_Y, { fill: fill(i), textA, glow: 18 + 30 * flash }))
    return
  }
  // the mark
  const exit = tw(t, 9.75, 10.35, E.inCubic)
  ctx.save()
  ctx.globalAlpha *= 1 - exit
  ctx.translate(960, lerp(0, -320, exit))
  ctx.scale(lerp(1, 0.6, exit), lerp(1, 0.6, exit))
  ctx.translate(-960, 0)
  ;[3, 2, 1].forEach(i => {
    const z = zip(i)
    if (z >= 1) return
    ctx.save()
    ctx.globalAlpha *= 1 - z * z
    bigItem(ctx, BIG_ITEMS[i], lerp(x0 + L[i].ringX, ox, z), lerp(BIG_Y, 540, z), { textA, r: lerp(BIG * 0.45, LOCK.R * 0.7, z), lw: lerp(BIG * 0.15, 11, z) })
    ctx.restore()
  })
  const z0 = zip(0)
  const arrive = t >= MERGE[1] ? Math.exp(-(t - MERGE[1]) * 4) : 0
  ring(ctx, lerp(x0 + L[0].ringX, ox, z0), lerp(BIG_Y, 540, z0), lerp(BIG * 0.45, LOCK.R, z0), lerp(BIG * 0.15, 13, z0), 1, BLUE, { glow: 18 + 34 * arrive, minArc: 0 })
  if (t >= MERGE[1] - 0.1) {
    const word = tw(t, 9.0, 9.75, E.lin)
    if (word > 0) typed(ctx, 'usage-line', ox + LOCK.wordX, 540 + 34, F.mono(LOCK.size), FG, word, { caret: t < 9.95, t, size: LOCK.size })
    reveal(ctx, 'Claude Code 插件  ·  a plugin for Claude Code', 960, 540 + 128, F.light(30), SUB, tw(t, 9.25, 9.9, E.lin), { align: 'center', dy: 12, spread: 8, blur: 5, tracking: 0.8 })
  }
  ctx.restore()
}

export function intro() {
  const { s, bg, grid, front } = world()
  const qs = QUESTIONS.map(q => {
    const p = panel(QW, QH, { res: 1.5 })
    s.scene.add(p)
    return p
  })
  // the answers: one card per question, flying from it into the big row
  const { L, x0 } = bigLayout
  const flyers = BIG_ITEMS.map((it, i) => {
    const w = L[i].w + 120
    const card = panel(w, BIG * 2.6, { res: 2 })
    s.scene.add(card)
    return { card, w, tx: x0 + L[i].x - 60 + w / 2, t0: FLY0 + i * FLY_GAP }
  })
  const stage = panel(1920, 1080, { res: 1 })
  s.scene.add(stage)
  const PXU = at(961, 0)[0] - at(960, 0)[0] // one frame px in world units
  const ZF = D * 1.3 // T1: how far behind the questions the row waits
  s.update = t => {
    bg.userData.tick(t)
    // T1: the whole field comes at the camera, as if we flew forward through it
    const S = TR === 't1' ? ZF * E.inOutCubic(prog(t, ...T1.push)) : 0
    QUESTIONS.forEach((q, i) => {
      const p = qs[i]
      const next = QUESTIONS[i + 1]
      const dim = next ? 1 - 0.55 * tw(t, next.at, next.at + 0.7) : 1
      const left = q.align === 'left'
      const cx = left ? q.x - 20 + QW / 2 : q.x + 20 - QW / 2
      const k = (D - q.z) / D
      const [wx, wy] = at(cx, q.y - 100 + QH / 2)
      const drift = (left ? 1 : -1) * 0.18 * tw(t, q.at, 5, E.lin)
      if (TR === 't1') {
        // nearest first, each plane parts from the centre as it passes us, and is gone before it fills the frame
        const order = [0, 2, 1, 3].indexOf(i)
        const part = E.inCubic(prog(t, 4.0 + order * 0.12, 5.4 + order * 0.12))
        const z = q.z + S
        const near = clamp((z - 0.38 * D) / (0.3 * D))
        p.position.set(wx * k + drift + (left ? -1 : 1) * 900 * PXU * part, wy * k * (1 + 0.4 * part), z)
        p.scale.setScalar(1)
        p.material.opacity = lerp(dim, 1, tw(t, 3.9, 4.6)) * (1 - near)
        p.visible = t >= q.at && p.material.opacity > 0.003
        if (p.visible) p.userData.draw(`${Math.round(t * 60)}`, ctx => drawQuestion(ctx, q, t))
        flyers[i].card.visible = false
        return
      }
      if (TR === 't2') {
        // the question condenses into its tag; from that point its ring, already reading, flies to the row
        const c = tw(t, colAt(i), colAt(i) + COL_DUR, E.inCubic)
        const rest = 1 - 0.6 * tw(t, 4.2, 4.5)
        p.position.set(wx * k + drift, wy * k, q.z)
        p.scale.setScalar(1)
        p.material.opacity = lerp(dim * rest, 1, tw(t, colAt(i) - 0.2, colAt(i)))
        p.visible = t >= q.at && c < 1
        const color = BIG_ITEMS[i].color
        if (p.visible) p.userData.draw(`${Math.round(t * 60)}`, ctx => drawQuestion(ctx, q, t, c, color))
        const F2 = flyers[i]
        const t0 = colAt(i) + SPAWN
        const e = E.inOutCubic(prog(t, t0, t0 + FLY2))
        const sc = lerp(0.45, 1, E.outCubic(prog(t, t0, t0 + FLY2)))
        const [ax, ay] = tagAnchor(q)
        const [sx, sy] = at(cx - QW / 2 + ax, q.y - 100 + ay)
        const [ex, ey] = at(F2.tx, BIG_Y)
        const dx = (60 + BIG * 0.45 - F2.w / 2) * PXU // the ring's offset from the card's centre
        F2.card.position.set(lerp(sx * k + drift, ex + dx, e) - dx * sc, lerp(sy * k, ey, e), lerp(q.z, 0, e) + 1.0 * Math.sin(Math.PI * e))
        F2.card.rotation.set(0, (left ? -0.35 : 0.35) * (1 - e), 0)
        F2.card.scale.setScalar(sc)
        const a = tw(t, t0 - 0.06, t0 + 0.12)
        F2.card.visible = a > 0 && t < LANDED
        F2.card.material.opacity = a
        if (F2.card.visible) {
          const fill = E.outCubic(prog(t, t0, t0 + 0.55))
          const textA = tw(t, t0 + 0.15, t0 + 0.5)
          F2.card.userData.draw(`${Math.round(fill * 60)}${Math.round(textA * 30)}`, ctx => bigItem(ctx, BIG_ITEMS[i], 60 + BIG * 0.45, BIG * 1.3, { fill, textA }))
        }
        return
      }
      // the question gives way to its answer: it sinks back and blurs out as the ring leaves it
      const go = tw(t, FLY0 + i * FLY_GAP - 0.15, FLY0 + i * FLY_GAP + 0.35, E.inCubic)
      p.position.set(wx * k + drift, wy * k, q.z - 1.5 * go)
      p.scale.setScalar(1 - 0.1 * go)
      p.material.opacity = dim * (1 - go)
      p.visible = t >= q.at && go < 1
      if (p.visible) p.userData.draw(`${Math.round(t * 60)}`, ctx => drawQuestion(ctx, q, t))
      // its ring, flying in an arc out of the question into its place in the row
      const F2 = flyers[i]
      const e = E.outExpo(prog(t, F2.t0, F2.t0 + FLY_DUR))
      const [sx, sy] = [wx * k + drift, wy * k]
      const [ex, ey] = at(F2.tx, BIG_Y)
      F2.card.position.set(lerp(sx, ex, e), lerp(sy, ey, e), lerp(q.z, 0, e) + 1.6 * Math.sin(Math.PI * e))
      F2.card.rotation.set(0, (left ? -0.5 : 0.5) * (1 - e), 0)
      F2.card.scale.setScalar(lerp(0.85, 1, e))
      const a = tw(t, F2.t0, F2.t0 + 0.2)
      const handoff = t >= FLY0 + 3 * FLY_GAP + FLY_DUR * 0.6
      F2.card.visible = a > 0 && !handoff
      F2.card.material.opacity = a
      if (F2.card.visible) {
        const fill = tw(t, F2.t0 + 0.45, 6.0, E.inOutCubic)
        F2.card.userData.draw(`${Math.round(fill * 60)}${Math.round(e * 30)}`, ctx => bigItem(ctx, BIG_ITEMS[i], 60 + BIG * 0.45, BIG * 1.3, { fill, textA: tw(t, F2.t0 + 0.3, F2.t0 + 0.7) }))
      }
    })
    if (TR === 't1') {
      stage.visible = t >= T1.row
      stage.position.z = S - ZF
      stage.material.opacity = tw(t, T1.row, T1.row + 0.6)
      grid.position.z = -10 + 0.3 * S
    } else stage.visible = TR === 't2' ? t >= LANDED : t >= FLY0 + 3 * FLY_GAP + FLY_DUR * 0.6 - 0.02
    if (stage.visible) stage.userData.draw(`${Math.round(t * 120)}`, ctx => drawRowToMark(ctx, t))
    const cam = keys(t, TR === 'now' ? [
      [0, [-0.12, 0.05, 1.06]],
      [4.6, [0.1, -0.035, 0.92], E.inOutSine],
      [5.7, [0, 0, 1.0], E.inOutCubic],
      [8.1, [-0.03, 0.01, 0.95], E.inOutSine],
      [10.5, [0.03, 0.01, 0.9], E.inOutSine],
    ] : [
      // one unbroken move from the first question to the row, landing on the downbeat
      [0, [-0.12, 0.05, 1.06]],
      [6.2, [0, 0, 1.0], E.inOutSine],
      [8.1, [-0.03, 0.01, 0.95], E.inOutSine],
      [10.5, [0.03, 0.01, 0.9], E.inOutSine],
    ])
    orbit(s.camera, t, [0, 0, 0], { yaw: cam[0], pitch: cam[1], dist: cam[2] })
    grid.material.opacity = GRID
    front.draw(() => false)
  }
  return s
}

// ═══ 03 · the drop ══════════════════════════════════════════════════════════════════════════
// The window in v1's frame coordinates; the group maps them 1:1 to world units at z = 0.
const WIN = { x: 250, y: 150, w: 1420, h: 820 }
const PROMPT = { x: WIN.x + 60, y: WIN.y + 618, w: 1300, h: 150 }
const ROW_Y = PROMPT.y - 36
const ROW_X = PROMPT.x + 14
const ROW_SIZE = 24
export const SEND_AT = 12.35
const DROP0 = 10.6
const DROP_GAP = 0.2
const DROP_DUR = 1.15

const cacheLeftDesk = t => (t < SEND_AT + 0.1 ? null : 3600 - (t - (SEND_AT + 0.1)))

function drawWindowBody(ctx, t, prompt) {
  rr(ctx, WIN.x, WIN.y, WIN.w, WIN.h, 26)
  ctx.fillStyle = SURFACE
  ctx.fill()
  ctx.strokeStyle = rgba(FG, 0.1)
  ctx.lineWidth = 1.5
  ctx.stroke()
  edge(ctx, WIN.x, WIN.y, WIN.w, WIN.h, 26)
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(WIN.x + 30 + i * 24, WIN.y + 29, 7, 0, TAU)
    ctx.fillStyle = '#3a3835'
    ctx.fill()
  }
  text(ctx, 'api-server', WIN.x + WIN.w / 2, WIN.y + 36, F.med(19), DIM, { align: 'center' })
  ctx.fillStyle = rgba(FG, 0.06)
  ctx.fillRect(WIN.x, WIN.y + 58, WIN.w, 1.5)
  const lines = (i, fn) => {
    const a = tw(t, 10.35 + i * 0.09, 10.85 + i * 0.09)
    if (a <= 0) return
    ctx.save()
    ctx.globalAlpha *= a
    ctx.translate(0, (1 - tw(t, 10.35 + i * 0.09, 10.95 + i * 0.09, E.outQuint)) * 18)
    fn()
    ctx.restore()
  }
  const ask = '把 token 统计拆成独立模块，顺便补上测试'
  lines(0, () => {
    const bw = measure(ctx, ask, F.reg(24)) + 44
    rr(ctx, WIN.x + WIN.w - 64 - bw, WIN.y + 96, bw, 58, 18)
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
  // the slot the row lands in: a faint guide until the pieces arrive
  const slot = tw(t, 10.5, 10.8) * (1 - tw(t, 11.6, 12.0))
  if (slot > 0) {
    ctx.save()
    ctx.globalAlpha *= slot * 0.55
    ctx.setLineDash([6, 8])
    ctx.strokeStyle = rgba(FG, 0.35)
    ctx.lineWidth = 1.5
    rr(ctx, ROW_X - 14, ROW_Y - 24, 760, 48, 12)
    ctx.stroke()
    ctx.restore()
  }
  rr(ctx, PROMPT.x, PROMPT.y, PROMPT.w, PROMPT.h, 22)
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
  ctx.save()
  ctx.translate(PROMPT.x + PROMPT.w - 42, PROMPT.y + 110)
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
}

const CALL = [
  ['缓存倒计时', 'CACHE TTL'],
  ['5 小时额度', '5-HOUR WINDOW'],
  ['7 天额度', '7-DAY WINDOW'],
  ['上下文占用', 'CONTEXT'],
]

export function inPlace() {
  const { s, bg, grid, front } = world()
  const G = new THREE.Group()
  s.scene.add(G)
  const win = panel(WIN.w + 4, WIN.h + 4, { res: 1.6 })
  win.position.set(...at(WIN.x + WIN.w / 2, WIN.y + WIN.h / 2), 0)
  const winShadow = shadow(WIN.w, WIN.h, 26, { blur: 40, k: 0.7 })
  winShadow.position.set(...at(WIN.x + WIN.w / 2, WIN.y + WIN.h / 2 + 30), -0.02)
  G.add(winShadow, win)
  // the four pieces of the row, each its own card with its own shadow
  const probe = document.createElement('canvas').getContext('2d')
  const layout0 = rowLayout(probe, rowItems({ cacheLeft: 3600 }), 'full', ROW_SIZE)
  const PAD = 34
  const PH = 96
  const pieces = layout0.map((L, i) => {
    const w = L.w + PAD * 2
    const card = panel(w, PH, { res: 4 })
    const sh = shadow(L.w + 8, 36, 18, { blur: 14, k: 0.9 })
    const cx = ROW_X + L.x - PAD + w / 2
    // a soft light where it lands
    const lit = glow(2.4, BLUE, 1)
    lit.position.set(...at(ROW_X + L.ringX, ROW_Y), 0.003)
    G.add(lit, sh, card)
    card.renderOrder = 10 + i
    sh.renderOrder = 5
    lit.renderOrder = 6
    return { card, sh, lit, w, cx, L, t0: DROP0 + i * DROP_GAP, flip: i % 2 ? 1 : -1 }
  })
  const rowW = layout0[3].x + layout0[3].w
  const v3 = new THREE.Vector3()
  const wpos = (px, py, z = 0) => v3.set(...at(px, py), z).applyMatrix4(G.matrixWorld).toArray()

  s.update = t => {
    bg.userData.tick(t)
    // the window rises in, lying back at three-quarters; then turns to face us
    const enter = tw(t, 9.95, 11.0, E.outExpo)
    G.position.set(0, lerp(-7.5, 0, enter), lerp(-3, 0, enter))
    G.rotation.x = keys(t, [[9.95, -0.8], [11.0, -0.68, E.outCubic], [11.75, -0.62, E.lin], [12.75, 0, E.inOutCubic]])
    G.rotation.y = keys(t, [[9.95, 0.4], [11.75, 0.28, E.outCubic], [12.75, 0, E.inOutCubic]])
    G.rotation.z = keys(t, [[9.95, 0.1], [11.75, 0.06, E.outCubic], [12.75, 0, E.inOutCubic]])
    G.updateMatrixWorld(true)

    const items = rowItems({ cacheLeft: cacheLeftDesk(snap(t)) })
    const typedP = tw(t, 11.55, 12.2, E.lin)
    const prompt = t < SEND_AT ? [...'再跑一遍覆盖率'].slice(0, Math.floor(typedP * 7)).join('') : ''
    win.userData.draw(t < 12.7 ? `${Math.round(t * 60)}` : `${prompt}${Math.floor(t * 2.2) % 2}`, ctx => {
      ctx.translate(-WIN.x + 2, -WIN.y + 2)
      drawWindowBody(ctx, t, prompt)
    })
    const push = tw(t, 12.9, 15.0, E.inOutCubic)
    const dive = tw(t, 15.35, 16.1, E.inExpo)
    win.material.opacity = (1 - 0.9 * push) * (1 - tw(t, 15.3, 15.9))
    winShadow.material.opacity = 0.9 * win.material.opacity

    // each piece falls, turns flat, slows, and settles with the faintest give
    pieces.forEach((P, i) => {
      const p = prog(t, P.t0, P.t0 + DROP_DUR)
      const f = E.outCubic(p)
      const land = P.t0 + DROP_DUR * 0.62
      const give = Math.sin(Math.PI * prog(t, land - 0.04, land + 0.3)) * 0.05
      const z = 4.4 * (1 - f)
      P.card.position.set(...at(P.cx, ROW_Y - 230 * (1 - f)), z + 0.004)
      const flash = t >= land - 0.05 ? Math.exp(-(t - land + 0.05) * 3.5) : 0
      P.lit.userData.set(i === 0 ? BLUE : '#9db8ef', 0.55 * flash * (1 - push))
      P.card.rotation.set(0.75 * (1 - f), 0.1 * P.flip * (1 - f), 0.16 * P.flip * (1 - f))
      P.card.scale.setScalar(1 + give)
      const a = tw(t, P.t0, P.t0 + 0.12) * (i === 0 ? 1 : 1 - tw(t, 15.2, 15.7)) * (1 - tw(t, 15.75, 16.1))
      P.card.material.opacity = a
      P.card.visible = a > 0.001
      P.sh.position.set(...at(P.cx, ROW_Y + 10 + 30 * (1 - f)), 0.002)
      P.sh.scale.setScalar(lerp(1.7, 1, f))
      P.sh.material.opacity = a * lerp(0.12, 0.5, f) * (1 - push * 0.6)
      const reveal = tw(t, P.t0 + 0.35, P.t0 + 1.0)
      const k = `${items[i].value}${Math.round(reveal * 40)}${i === 0 ? Math.round(prog(t, SEND_AT, SEND_AT + 1.3) * 60) : ''}`
      P.card.userData.draw(k, ctx => {
        drawRow(ctx, PAD, PH / 2, [items[i]], { size: ROW_SIZE, reveal: () => Math.max(0.001, reveal) })
        if (i === 0) {
          const rx = PAD + P.L.ringX - P.L.x
          ripple(ctx, rx, PH / 2, ROW_SIZE * 0.45, t, SEND_AT + 0.1, BLUE, { dur: 0.9, grow: 3, width: 2 })
          ripple(ctx, rx, PH / 2, ROW_SIZE * 0.45, t, SEND_AT + 0.28, BLUE, { dur: 0.9, grow: 2.2, width: 1.5 })
        }
      })
    })

    // camera: a high three-quarter view while they fall; it comes round to the front, pushes
    // onto the row, finds the cache ring and dives into it
    const cacheX = ROW_X + layout0[0].ringX
    const rowC = wpos(ROW_X + rowW / 2, ROW_Y + 40)
    const ringC = wpos(cacheX, ROW_Y)
    const mid = wpos(960, 600)
    const aim = tw(t, 14.95, 15.65, E.inOutCubic)
    const near = 0.75 * (1 - tw(t, 11.85, 12.75, E.inOutCubic)) // during the drop the camera favours the row
    const tgt = [0, 1, 2].map(k => lerp(lerp(mid[k], rowC[k], Math.max(push, near)), ringC[k], aim))
    const dist = keys(t, [[9.95, 0.95], [11.0, 0.76, E.outCubic], [11.85, 0.72, E.lin], [12.75, 1.0, E.inOutCubic], [12.9, 1.0], [15.0, 0.54, E.inOutCubic]])
    const yaw = keys(t, [[9.95, -0.1], [11.75, -0.04, E.inOutSine], [12.75, 0, E.inOutCubic], [15.0, 0.05, E.inOutSine]])
    orbit(s.camera, t, tgt, { dist: lerp(dist, 0.07, dive), yaw: yaw * (1 - dive), pitch: keys(t, [[9.95, 0.08], [12.75, 0, E.inOutCubic]]), drift: 0.01 * (1 - dive) })
    grid.material.opacity = GRID * (1 - dive)

    // callouts, in screen space, from where each ring lands
    front.draw(ctx => {
      const callOut = 1 - tw(t, 15.0, 15.45, E.inCubic)
      if (t < 13.5 || callOut <= 0) return false
      layout0.forEach((L, i) => {
        const p = tw(t, 13.55 + i * 0.16, 14.25 + i * 0.16, E.outExpo)
        if (p <= 0) return
        const [cx, cy] = toPx(s.camera, wpos(ROW_X + L.ringX, ROW_Y))
        const bot = cy + 46 + 120 * p
        ctx.save()
        ctx.globalAlpha *= callOut
        ctx.strokeStyle = rgba(FG, 0.4)
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx, cy + 34)
        ctx.lineTo(cx, bot)
        ctx.stroke()
        ctx.fillStyle = i === 0 ? BLUE : FG
        ctx.beginPath()
        ctx.arc(cx, bot, 4, 0, TAU)
        ctx.fill()
        reveal(ctx, CALL[i][0], cx, bot + 48, F.med(32), FG, prog(t, 13.65 + i * 0.16, 14.35 + i * 0.16), { align: 'center', dy: -14, spread: 3, blur: 6 })
        text(ctx, CALL[i][1], cx, bot + 80, F.mono(16), DIM, { align: 'center', alpha: tw(t, 13.8 + i * 0.16, 14.4 + i * 0.16) })
        ctx.restore()
      })
    })
  }
  return s
}

export { mix, AMBER, RED }
