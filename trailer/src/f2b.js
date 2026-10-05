// The film, v2 · 04–06: the cache dial in three layers with the camera going round it; then
// 5h, 7d, the thresholds and the context laid out on one tilted table, one camera travelling.
import * as THREE from 'three'
import { E, clamp, keys, lerp, prog, tw } from './engine.js'
import { AMBER, BLUE, DIM, F, FG, RED, TAU, clockText, glowSpot, measure, mix, reveal, rgba, ring, ringColor, span, text } from './ui.js'
import { D, at, orbit, panel, rr, world } from './f2kit.js'
import { SUB, ripple } from './f2a.js'

// ═══ 04 · the cache ═════════════════════════════════════════════════════════════════════════
function cacheLeftHero(t) {
  if (t < 16.6) return 3600
  if (t < 18.0) return 3600 - (t - 16.6)
  if (t < 20.0) return lerp(3598.6, 60, E.inOutCubic(prog(t, 18.0, 20.0)))
  if (t < 21.2) return lerp(60, 0, E.inQuad(prog(t, 20.0, 21.2)) * 0.4 + prog(t, 20.0, 21.2) * 0.6)
  if (t < 21.95) return 0
  return 3600 - Math.max(0, t - 22.5)
}
const C = { x: 600, y: 540, r: 292, w: 30 }
const COL = { x: 1000, y: 250, w: 900, h: 720 } // the right column's panel, in frame px
function cacheState(t) {
  const left = cacheLeftHero(t)
  const refill = tw(t, 21.95, 22.65, E.outBack)
  const expired = t >= 21.2 && t < 21.95
  const amber = left < 60 && left > 0
  const color = expired ? RED : amber ? mix(BLUE, AMBER, prog(t, 20.0, 20.2)) : BLUE
  const frac = t >= 21.95 ? clamp(refill, 0, 1.0) : left / 3600
  return { left, expired, amber, color, frac }
}

function drawTicks(ctx, t, c, { frac, color }) {
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i / 60) * TAU
    const major = i % 5 === 0
    const lit = i / 60 < frac - 0.002
    const r1 = C.r + 44
    const r2 = r1 + (major ? 22 : 10)
    ctx.strokeStyle = lit ? rgba(color, major ? 0.9 : 0.6) : rgba(FG, major ? 0.22 : 0.1)
    ctx.lineWidth = major ? 3 : 2
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1)
    ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2)
    ctx.stroke()
  }
  // the minute numerals, small, outside the ticks
  ;[[0, '60'], [15, '15'], [30, '30'], [45, '45']].forEach(([m, l]) => {
    const a = -Math.PI / 2 + (m / 60) * TAU
    text(ctx, l, c + Math.cos(a) * (C.r + 100), c + Math.sin(a) * (C.r + 100) + 8, F.mono(22), DIM, { align: 'center' })
  })
}
function drawDial(ctx, t, c, { frac, expired, color }) {
  glowSpot(ctx, c, c, 560, color, expired ? 0.12 : 0.1)
  ring(ctx, c, c, C.r, C.w, expired ? 0 : frac, expired ? RED : color, { glow: 34, minArc: 0 })
  ripple(ctx, c, c, C.r, t, 21.2, RED, { dur: 1.0, grow: 1.35, width: 6 })
  ripple(ctx, c, c, C.r, t, 21.95, BLUE, { dur: 1.1, grow: 1.4, width: 6 })
  ripple(ctx, c, c, C.r, t, 20.0, AMBER, { dur: 1.0, grow: 1.3, width: 5 })
  text(ctx, '缓存', c, c + 18, F.med(52), FG, { align: 'center', alpha: 0.9 })
  text(ctx, 'PROMPT CACHE', c, c + 64, F.mono(18), DIM, { align: 'center' })
}
function drawColumn(ctx, t, { left, expired, amber }) {
  const X = 1010
  reveal(ctx, '剩余时间  ·  TIME LEFT', X, 318, F.mono(20), DIM, tw(t, 16.2, 16.9, E.lin), { dy: 10, blur: 4 })
  const chip = expired ? ['已过期', 'EXPIRED', RED] : amber ? ['最后一分钟', 'LAST MINUTE', AMBER] : t >= 21.95 && t < 23.4 ? ['新请求 · 已续上', 'REFRESHED', BLUE] : t >= 18.0 && t < 20.0 ? ['时间推移', 'TIME-LAPSE', DIM] : ['实时', 'LIVE', BLUE]
  const ca = tw(t, 16.5, 17.0)
  if (ca > 0) {
    const cw = measure(ctx, chip[0], F.med(20)) + measure(ctx, chip[1], F.mono(15)) + 64
    const chx = X + 400
    ctx.save()
    ctx.globalAlpha *= ca
    rr(ctx, chx, 292, cw, 38, 19)
    ctx.fillStyle = rgba(chip[2], 0.14)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(chx + 20, 311, 5, 0, TAU)
    ctx.fillStyle = chip[2]
    ctx.fill()
    text(ctx, chip[0], chx + 34, 318, F.med(20), chip[2] === DIM ? FG : chip[2])
    text(ctx, chip[1], chx + 44 + measure(ctx, chip[0], F.med(20)), 317, F.mono(15), DIM)
    ctx.restore()
  }
  const na = tw(t, 16.15, 16.75, E.outExpo)
  const value = expired ? '过期' : clockText(left)
  const ncol = expired ? RED : amber ? AMBER : FG
  const shake = expired ? Math.sin((t - 21.2) * 70) * 10 * Math.exp(-(t - 21.2) * 7) : 0
  ctx.save()
  ctx.globalAlpha *= na
  ctx.translate(X + shake, 560 + (1 - na) * 40)
  if (expired) text(ctx, value, 0, 0, F.bold(236), ncol)
  else text(ctx, value, -8, 0, F.monoB(262), ncol)
  ctx.restore()
  reveal(ctx, '缓存倒计时，精确到秒。', X, 702, F.bold(68), FG, tw(t, 16.6, 17.45, E.lin), { dy: 30, spread: 4, blur: 10 })
  reveal(ctx, 'Know the moment your prompt cache goes cold.', X, 758, F.serif(40), SUB, tw(t, 16.9, 17.9, E.lin), { dy: 12, spread: 10, blur: 5 })
  const FACTS = [['1h', '订阅缓存时长'], ['5m', '超额用量，自动识别'], ['子代理', '不打断计时']]
  let fx = X
  FACTS.forEach(([k, v], i) => {
    const p = tw(t, 22.7 + i * 0.14, 23.25 + i * 0.14, E.outExpo)
    const kf = /^[0-9]/.test(k) ? F.monoB(30) : F.med(26)
    if (p > 0) {
      ctx.save()
      ctx.globalAlpha *= p
      ctx.fillStyle = rgba(FG, 0.18)
      ctx.fillRect(fx, 852, 2, 70)
      text(ctx, k, fx + 20, 884 + (1 - p) * 16, kf, FG)
      text(ctx, v, fx + 20, 916 + (1 - p) * 16, F.reg(22), DIM)
      ctx.restore()
    }
    fx += Math.max(measure(ctx, v, F.reg(22)), measure(ctx, k, kf)) + 74
  })
}

export function cache() {
  const { s, bg, grid, front } = world()
  const DIAL = 1300
  const ticks = panel(1000, 1000, { res: 1.4 })
  const dial = panel(DIAL, DIAL, { res: 1.1 })
  const col = panel(COL.w, COL.h, { res: 1.5 })
  s.scene.add(ticks, dial, col)
  const ZT = -1.2
  const ZC = 0.9
  // each layer placed so the frontal camera frames it as v1 did
  const put = (m, px, py, z) => {
    const k = (D - z) / D
    const [x, y] = at(px, py)
    m.position.set(x * k, y * k, z)
    m.scale.setScalar(k)
  }
  s.update = t => {
    const st = cacheState(t)
    const tint = mix('#0b1220', st.expired ? '#2a0d0c' : st.amber ? '#2a1c08' : '#0b1220', st.expired || st.amber ? 1 : 0)
    bg.userData.set([{ c: tint, x: 0.33, y: 0.5, r: 0.5, a: 1 }, { c: '#100e0b', x: 0.85, y: 0.9, r: 0.5, a: 1 }])
    bg.userData.tick(t)
    put(ticks, C.x, C.y, ZT)
    ticks.rotation.z = -0.5 * (1 - tw(t, 15.85, 17.0, E.outExpo))
    put(dial, C.x, C.y, 0)
    put(col, COL.x + COL.w / 2, COL.y + COL.h / 2, ZC)
    const k = `${Math.round(st.frac * 900)}${st.color}${Math.round(t * 30)}`
    ticks.userData.draw(`${Math.round(st.frac * 120)}${st.color}`, ctx => drawTicks(ctx, t, 500, st))
    dial.userData.draw(k, ctx => drawDial(ctx, t, DIAL / 2, st))
    col.userData.draw(`${clockText(st.left)}${Math.round(t * 30)}`, ctx => {
      ctx.translate(-COL.x, -COL.y)
      drawColumn(ctx, t, st)
    })
    // the camera goes slowly round the dial; each event leans in a little
    const lean = [20.0, 21.2, 21.95].reduce((m, e) => m + (t >= e ? 0.03 * Math.exp(-(t - e) * 4) : 0), 0)
    const shake = t >= 21.2 ? 0.05 * Math.exp(-(t - 21.2) * 6) : 0
    const tgt = at(keys(t, [[15.85, 700], [17.0, 930, E.outCubic]]), 545)
    orbit(s.camera, t, tgt, {
      yaw: keys(t, [[15.85, -0.3], [17.2, -0.17, E.outCubic], [24.3, 0.16, E.inOutSine]]),
      pitch: keys(t, [[15.85, 0.1], [17.2, 0.05, E.outCubic], [24.3, -0.04, E.inOutSine]]),
      dist: keys(t, [[15.85, 0.8], [17.2, 1.07, E.outCubic], [24.3, 1.02, E.inOutSine]]) - lean,
      shake,
    })
    grid.material.opacity = 0.1
    front.draw(() => false)
  }
  return s
}

// ═══ 05–06 · the usage windows and the context, on one table ═════════════════════════════════
const FIVE = [[24.3, 0], [25.2, 13, E.outCubic], [25.55, 13], [26.15, 47], [26.45, 47], [27.0, 74], [27.35, 74], [27.9, 93]]
const SEVEN = [[24.42, 0], [25.35, 63, E.outCubic], [26.75, 63], [27.4, 71]]
const crossAmber5 = 26.45 + (27.0 - 26.45) * 0.62
const crossRed5 = 27.35 + (27.9 - 27.35) * 0.6
const crossAmber7 = 26.75 + (27.4 - 26.75) * 0.5
const RA = { x: 690, y: 560 }
const RB = { x: 1230, y: 560 }
const BAR = { x: 1640, y: 600 }
const CTX = { x: 2900, y: 540 }

function drawMeter(ctx, c, r, t) {
  const col = ringColor(r.v)
  const e = tw(t, r.at, r.at + 0.8, E.outExpo)
  ctx.save()
  ctx.globalAlpha *= e
  ctx.translate(c, c + (1 - e) * 60)
  glowSpot(ctx, 0, 0, 330, col, 0.08)
  ring(ctx, 0, 0, 176, 22, r.v / 100, col, { glow: 26, minArc: 0 })
  r.cross.forEach((tc, j) => ripple(ctx, 0, 0, 176, t, tc, j === 0 && r.cross.length > 1 ? AMBER : r.cross.length > 1 ? RED : AMBER, { dur: 0.9, grow: 1.32, width: 5 }))
  text(ctx, `${Math.round(r.v)}%`, 0, 36, F.monoB(104), col === BLUE ? FG : col, { align: 'center' })
  text(ctx, r.name, 0, 176 + 78, F.med(34), FG, { align: 'center' })
  text(ctx, `↻ ${r.reset} 后重置`, 0, 176 + 124, F.mono(25), DIM, { align: 'center' })
  ctx.restore()
}
function drawBar(ctx, t, five, seven) {
  // thresholds: the plugin turns amber at 70% and red at 90%
  const bx = 120
  const bt = 60
  const bh = 400
  const ba = tw(t, 24.8, 25.6, E.outExpo)
  if (ba <= 0) return
  ctx.save()
  ctx.globalAlpha *= ba
  const seg = (a, b, c) => {
    ctx.fillStyle = c
    ctx.fillRect(bx, bt + bh * (1 - b / 100), 6, bh * ((b - a) / 100) * ba)
  }
  seg(0, 70, rgba(BLUE, 0.7))
  seg(70, 90, rgba(AMBER, 0.85))
  seg(90, 100, rgba(RED, 0.9))
  ;[[0, '0'], [70, '70%'], [90, '90%'], [100, '100%']].forEach(([v, l]) => {
    const y = bt + bh * (1 - v / 100)
    ctx.fillStyle = rgba(FG, 0.35)
    ctx.fillRect(bx + 12, y - 1, 12, 2)
    text(ctx, l, bx + 34, y + 8, F.mono(22), v === 70 ? AMBER : v === 90 ? RED : DIM)
  })
  text(ctx, '≥70% 琥珀', bx - 10, bt + bh + 64, F.reg(26), AMBER)
  text(ctx, '≥90% 红色', bx - 10, bt + bh + 104, F.reg(26), RED)
  ;[[five, '5h'], [seven, '7d']].forEach(([v, l]) => {
    const y = bt + bh * (1 - v / 100)
    ctx.fillStyle = ringColor(v)
    ctx.beginPath()
    ctx.moveTo(bx - 8, y)
    ctx.lineTo(bx - 22, y - 8)
    ctx.lineTo(bx - 22, y + 8)
    ctx.closePath()
    ctx.fill()
    text(ctx, l, bx - 32, y + 8, F.monoB(22), FG, { align: 'right', alpha: 0.9 })
  })
  ctx.restore()
}
function drawContext(ctx, c, t) {
  const e = tw(t, 29.7, 30.6, E.outExpo)
  const v = keys(t, [[30.15, 0], [30.95, 25, E.outCubic], [31.25, 25], [31.95, 40]])
  ctx.save()
  ctx.globalAlpha *= e
  glowSpot(ctx, c, c, 420, BLUE, 0.1)
  ring(ctx, c, c, 210, 26, v / 100, BLUE, { glow: 30, minArc: 0 })
  text(ctx, `${Math.round(v)}%`, c, c + 28, F.monoB(112), FG, { align: 'center' })
  text(ctx, '上下文', c, c + 86, F.med(30), DIM, { align: 'center' })
  ctx.restore()
}

export function meters() {
  const { s, bg, grid, front } = world()
  const G = new THREE.Group()
  s.scene.add(G)
  const M = 760
  const ra = panel(M, M, { res: 1.5 })
  const rb = panel(M, M, { res: 1.5 })
  const bar = panel(360, 640, { res: 1.5 })
  const cx = panel(900, 900, { res: 1.5 })
  ra.position.set(...at(RA.x, RA.y), 0)
  rb.position.set(...at(RB.x, RB.y), 0)
  bar.position.set(...at(BAR.x, BAR.y), 0)
  cx.position.set(...at(CTX.x, CTX.y), 0)
  G.add(ra, rb, bar, cx)
  const v3 = new THREE.Vector3()
  const wpos = (px, py) => v3.set(...at(px, py), 0).applyMatrix4(G.matrixWorld).toArray()
  s.update = t => {
    bg.userData.tick(t)
    // the table leans back and away; it straightens as the camera reaches the context
    const toCtx = tw(t, 29.4, 30.7, E.inOutCubic)
    G.rotation.set(lerp(-0.2, -0.06, toCtx), lerp(0.24, 0.05, toCtx), 0)
    G.updateMatrixWorld(true)
    const five = keys(t, FIVE)
    const seven = keys(t, SEVEN)
    const fiveReset = keys(t, [[24.3, 174], [28.2, 118, E.inOutSine]])
    const sevenReset = keys(t, [[24.3, 6060], [28.2, 5952, E.inOutSine]])
    ra.userData.draw(`${five.toFixed(1)}${Math.round(t * 30)}`, ctx => drawMeter(ctx, M / 2, { v: five, name: '5 小时额度', reset: span(fiveReset), at: 24.15, cross: [crossAmber5, crossRed5] }, t))
    rb.userData.draw(`${seven.toFixed(1)}${Math.round(t * 30)}`, ctx => drawMeter(ctx, M / 2, { v: seven, name: '7 天额度', reset: span(sevenReset), at: 24.3, cross: [crossAmber7] }, t))
    bar.userData.draw(`${five.toFixed(1)}${seven.toFixed(1)}${Math.round(t * 30)}`, ctx => drawBar(ctx, t, five, seven))
    cx.visible = t > 29.3
    if (cx.visible) cx.userData.draw(`${Math.round(t * 30)}`, ctx => drawContext(ctx, 450, t))
    // one camera across the table: 5h → both → the scale → along to the context
    const path = keys(t, [
      [23.9, [RA.x, RA.y, 0.66, -0.3]],
      [25.1, [980, 530, 0.88, -0.06], E.outCubic],
      [28.4, [1130, 525, 0.85, 0.05], E.inOutSine],
      [29.4, [1190, 525, 0.84, 0.07], E.inOutSine],
      [30.7, [CTX.x, CTX.y + 40, 0.9, 0.1], E.inOutCubic],
      [32.9, [CTX.x, CTX.y + 60, 0.8, 0.02], E.inOutSine],
    ])
    orbit(s.camera, t, wpos(path[0], path[1]), { dist: path[2], yaw: path[3], pitch: 0.04 })
    grid.material.opacity = 0.1
    front.draw(ctx => {
      const a1 = 1 - tw(t, 29.3, 29.8, E.inCubic)
      if (a1 > 0) {
        ctx.save()
        ctx.globalAlpha *= a1
        reveal(ctx, '额度用了多少，何时重置。', 168, 232, F.bold(72), FG, tw(t, 24.05, 24.95, E.lin), { dy: 30, spread: 4, blur: 10 })
        reveal(ctx, "How much you've used, and when it resets.", 168, 300, F.serif(44), SUB, tw(t, 24.35, 25.35, E.lin), { dy: 12, spread: 10, blur: 5 })
        ctx.restore()
      }
      if (t > 30.2) {
        reveal(ctx, '上下文占用，一直在眼前。', 960, 880, F.bold(68), FG, tw(t, 30.3, 31.1, E.lin), { align: 'center', dy: 26, spread: 4, blur: 8 })
        reveal(ctx, 'Context fill, always in sight.  /clear and compaction re-read it.', 960, 944, F.serif(40), SUB, tw(t, 30.6, 31.7, E.lin), { align: 'center', dy: 10, spread: 10, blur: 5 })
      }
    })
  }
  return s
}
