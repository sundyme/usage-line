// v6 · the film, re-cut to open on the product. Shots from v5 are reused on a new clock.
//
//   0.0  OPEN     macro on the cache ring filling; pull back to the row; it docks above the prompt
//   5.0  CACHE    the countdown: hit, away, refill, the last minute, expiry, refill
//  13.0  LIMITS   5h · 7d · context on a table of glass
//  18.0  SIDE     the native panel (click to see, no cache) beside usage-line (always there)
//  22.0  ADAPT    narrow windows, the terminal
//  25.0  INSTALL  two commands
//  28.0  TABLE    the drop
//  31.3  END      the name
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, prog, tw } from './engine.js'
import { panel, shoot } from './kit.js'
import { BLUE, F, RED, measure, ring, rowItems, text } from './ui.js'
import { FRONT, onLayer } from './glass.js'
import { liquid } from './liquid.js'
import { CC, POP, drawPopover, drawPrompt, drawUsageRow } from './cc.js'
import { D, FOV, INK, MUTE, UNIT, at, head, line, pointer, pool, sp, stage } from './stage.js'
import { cache } from './v5b.js'
import { adapt, end, install, limits, tableShot } from './v5c.js'

export const DUR6 = 35
const lp = (x, y) => ({ x: x - W / 2, y: H / 2 - y })
const v3 = new THREE.Vector3()

// ═══ OPEN ═══════════════════════════════════════════════════════════════════════════════════
const CAP = { x: 960, y: 540, w: 1110, h: 92, size: 30 }
const RING0 = { x: CAP.x - CAP.w / 2 + 46 + 15.75, y: CAP.y } // the cache ring, screen px
const PROMPT6 = { x: 340, y: 800, w: 1240, h: 132 }
const FLAT = { x: PROMPT6.x + 14, y: PROMPT6.y - 36 }
const HIT = 1.0
function openItems(t) {
  const fill = E.outQuart(prog(t, 0.15, 0.95))
  const up = i => E.outCubic(prog(t, 1.2 + i * 0.25, 1.75 + i * 0.25))
  const left = t < 1.0 ? 3600 * fill : 3600 - (t - 1.0)
  return rowItems({ cacheLeft: Math.max(0.001, left), five: 9 * up(0), seven: 67 * up(1), ctx: 40 * up(2), fiveReset: 248, sevenReset: 4620 })
}
export function open6() {
  const { s, bg, back, front } = stage()
  const glass = liquid({ w: 2600, h: 1600, refr: 26, bevel: 24, frost: 0.4, tintA: 0.16, sat: 1.55, lift: 0.05 })
  s.scene.add(glass)
  const face = panel(CAP.w, CAP.h, { res: 2 })
  const macro = panel(240, CAP.h, { res: 9 })
  for (const f of [face, macro]) {
    onLayer(f, FRONT)
    f.renderOrder = 60
    s.scene.add(f)
  }
  const prompt = panel(PROMPT6.w + 20, PROMPT6.h + 20, { res: 1.6 })
  prompt.position.set(...at(PROMPT6.x + PROMPT6.w / 2, PROMPT6.y + PROMPT6.h / 2), 0)
  const flat = panel(900, 56, { res: 2 })
  flat.position.set(...at(FLAT.x + 450, FLAT.y), 0.001)
  s.scene.add(prompt, flat)
  s.update = t => {
    bg.userData.tick(t)
    const items = openItems(t)
    // the capsule docks above the prompt, and the glass melts away into the flat row
    const dock = E.inOutCubic(prog(t, 2.45, 3.3))
    const melt = tw(t, 3.1, 3.55)
    const rowW = 690
    const cx = lerp(CAP.x, FLAT.x - 10 + rowW / 2, dock)
    const cy = lerp(CAP.y, FLAT.y, dock)
    const cw = lerp(CAP.w, rowW + 36, dock)
    const ch = lerp(CAP.h, 50, dock)
    glass.userData.set([{ ...lp(cx, cy), w: cw, h: ch, r: ch / 2 }])
    glass.userData.u.opacity.value = (1 - melt) * tw(t, 0, 0.12)
    const k = lerp(1, 22 / CAP.size, dock)
    face.position.set(...at(cx + (CAP.w / 2) * (k - 1) * 0 , cy), 0.01)
    face.scale.set(k, k, 1)
    const macroOn = t < 1.6
    face.material.opacity = 1 - melt
    face.userData.draw(`${items.map(i => i.value).join()}${macroOn}`, ctx =>
      drawUsageRow(ctx, 46, CAP.h / 2, items, { size: CAP.size, reveal: i => (i === 0 ? (macroOn ? 0 : 1) : E.outCubic(prog(t, 1.2 + (i - 1) * 0.25, 1.6 + (i - 1) * 0.25))) }),
    )
    // the first ring, drawn sharp enough to hold a macro
    macro.visible = macroOn
    macro.position.set(...at(CAP.x - CAP.w / 2 + 120 * k, cy), 0.012)
    macro.userData.draw(items[0].value, ctx => drawUsageRow(ctx, 46 - 0, CAP.h / 2, [items[0]], { size: CAP.size }))
    // the real prompt rises to receive it
    const up = E.outQuint(prog(t, 2.3, 3.3))
    prompt.position.y = at(0, PROMPT6.y + PROMPT6.h / 2 + (1 - up) * 500)[1]
    prompt.material.opacity = up
    prompt.userData.draw(Math.floor(t * 2.2) % 2, ctx => drawPrompt(ctx, 10, 10, t, { w: PROMPT6.w, caret: true }))
    flat.material.opacity = melt
    flat.userData.draw(items[0].value, ctx => drawUsageRow(ctx, 6, 28, items, { size: 22 }))
    // camera: a macro on the ring, a hard pull back on the hit, a settle, a lean into the flat ring
    const pull = E.outExpo(prog(t, HIT, HIT + 1.5))
    const [rx, ry] = at(RING0.x, RING0.y)
    const [fx, fy] = at(FLAT.x + 14, FLAT.y)
    const push = E.inCubic(prog(t, 4.45, 5.0))
    const settle = E.inOutSine(prog(t, 2.3, 4.4))
    const [, sy] = at(960, 640)
    const tx = lerp(lerp(rx, 0, pull), fx, push)
    const ty = lerp(lerp(lerp(ry, 0, pull), sy, settle), fy, push)
    const dz = lerp(lerp(lerp(0.15, 0.125, prog(t, 0, HIT)), 0.84, pull) * lerp(1, 0.98, settle), 0.4, push)
    shoot(s.camera, t, [tx, ty, D * dz], [tx, ty, 0], FOV, { drift: 0.01, roll: lerp(-9, 0, E.outCubic(prog(t, HIT, HIT + 1.6))) })
    back.draw(ctx => {
      const L = (1 - dock) * tw(t, 0.05, 0.6)
      const kick = t >= HIT ? Math.exp(-(t - HIT) * 3.5) : 0
      pool(ctx, 560, 540, 600, '#3a6df0', 0.34 * L + 0.2 * kick)
      pool(ctx, 980, 580, 520, '#7c4dff', 0.24 * L)
      pool(ctx, 1320, 500, 480, '#14b8a6', 0.18 * L)
      return true
    })
    front.draw(ctx => {
      const wm = tw(t, 3.05, 3.6, E.outQuint) * (1 - tw(t, 4.4, 4.7))
      if (wm > 0) {
        ctx.save()
        ctx.globalAlpha = wm
        ring(ctx, 990 - 352, 300, 28, 8.5, 0.72 * E.outCubic(prog(t, 3.05, 3.9)), BLUE)
        ctx.restore()
      }
      line(ctx, 'usage-line', 990, 336, 100, t, { t0: 3.05, t1: 4.4, font: F.monoB, align: 'center', stagger: 0.035 })
      line(ctx, 'Claude Code 的用量，一行看清。', 960, 440, 46, t, { t0: 3.4, t1: 4.45, align: 'center', color: MUTE })
    })
  }
  return s
}

// ═══ SIDE BY SIDE ═══════════════════════════════════════════════════════════════════════════
const SW = { w: 820, h: 780 }
const S0 = 18.0
function sidePanel(ctx, t, kind) {
  const w = SW.w
  const h = SW.h
  ctx.beginPath()
  ctx.roundRect(1, 1, w - 2, h - 2, 18)
  ctx.fillStyle = CC.bg
  ctx.fill()
  ctx.strokeStyle = CC.line
  ctx.lineWidth = 1.5
  ctx.stroke()
  ;['#ed6a5e', '#f4bf4f', '#61c554'].forEach((c, i) => {
    ctx.beginPath()
    ctx.arc(28 + i * 22, 24, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
  })
  ctx.fillStyle = CC.line
  ctx.fillRect(0, 48, w, 1.5)
  text(ctx, '好的。先读一下现有实现，再拆成三个文件。', 30, 100, F.reg(23), CC.ink)
  text(ctx, '● Bash  bun test  18 pass', 30, 146, F.mono(20), CC.dim)
  text(ctx, '拆分完成，测试全部通过。', 30, 192, F.reg(23), CC.ink)
  const py = h - 30 - 120
  if (kind === 'row') {
    const items = rowItems({ cacheLeft: 3600 - (t - S0) * 1.0, five: 9, seven: 67, ctx: 40, fiveReset: 248, sevenReset: 4620 })
    drawUsageRow(ctx, 36, py - 30, items, { size: 21 })
  }
  drawPrompt(ctx, 20, py, t, { w: w - 40, h: 120, caret: true, iconHi: kind === 'pop' ? clamp(1 - Math.abs(t - (S0 + 0.85)) / 0.3) : 0 })
  if (kind === 'pop') {
    const v = tw(t, S0 + 0.88, S0 + 1.05)
    if (v > 0) {
      const sc = 0.82 * lerp(0.965, 1, v)
      ctx.save()
      ctx.globalAlpha = v
      ctx.translate(w - 20, py - 100)
      ctx.scale(sc, sc)
      ctx.translate(-POP.w, -POP.h)
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 40
      ctx.fillStyle = 'rgba(0,0,0,0.01)'
      drawPopover(ctx)
      // the row that isn't there
      const m = tw(t, S0 + 1.7, S0 + 2.0)
      if (m > 0) {
        ctx.globalAlpha = v * m
        ctx.setLineDash([10, 8])
        ctx.strokeStyle = RED
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(12, POP.h + 14, POP.w - 24, 74, 14)
        ctx.stroke()
        ctx.setLineDash([])
        text(ctx, 'Prompt cache', 28, POP.h + 62, F.reg(25), CC.dim)
        text(ctx, '– – : – –', POP.w - 28, POP.h + 62, F.monoB(25), RED, { align: 'right' })
      }
      ctx.restore()
    }
    const path = keys(t, [[S0 + 0.2, [w - 60, h + 40]], [S0 + 0.75, [w - 20 - 100 * 1 + 2, py + 120 - 36 - 4], E.outCubic]])
    pointer(ctx, t, path[0], path[1], [S0 + 0.85], tw(t, S0 + 0.2, S0 + 0.35))
  }
}
export function side() {
  const { s, bg, back, front } = stage()
  const L = panel(SW.w, SW.h, { res: 1.6 })
  const R = panel(SW.w, SW.h, { res: 1.6 })
  s.scene.add(L, R)
  s.update = t => {
    bg.userData.tick(t)
    const a = E.outQuint(prog(t, S0, S0 + 0.9))
    L.position.set(...at(lerp(380, 510, a), 575), 0)
    R.position.set(...at(lerp(1540, 1410, a), 575), 0)
    L.rotation.y = 0.16
    R.rotation.y = -0.16
    L.material.opacity = R.material.opacity = a
    L.userData.draw(Math.round(t * 30), ctx => sidePanel(ctx, t, 'pop'))
    R.userData.draw(Math.round(t * 30), ctx => sidePanel(ctx, t, 'row'))
    const cam = keys(t, [
      [S0, [0, -0.2, 1.04]],
      [S0 + 2.3, [0, -0.2, 0.96], E.inOutSine],
      [S0 + 4.35, [at(1400, 0)[0], at(0, 790)[1], 0.6], E.inOutCubic],
    ])
    shoot(s.camera, t, [cam[0], cam[1], D * cam[2]], [cam[0], cam[1], 0], FOV, { drift: 0.01 })
    back.draw(ctx => {
      pool(ctx, 1410, 700, 520, BLUE, 0.16 * tw(t, S0 + 1.9, S0 + 2.6))
      return true
    })
    front.draw(ctx => {
      line(ctx, 'Claude Code 用量面板', 510, 150, 40, t, { t0: S0 + 0.3, t1: S0 + 3.1, align: 'center', color: MUTE })
      line(ctx, 'usage-line', 1410, 150, 44, t, { t0: S0 + 0.45, t1: S0 + 3.15, align: 'center', font: F.monoB })
      line(ctx, '要点开才看得到，也没有缓存时间。', 510, 1012, 38, t, { t0: S0 + 1.75, t1: S0 + 3.1, align: 'center', color: MUTE })
      line(ctx, '一直都在，缓存精确到秒。', 1410, 1012, 38, t, { t0: S0 + 2.05, t1: S0 + 3.2, align: 'center', color: INK })
    })
  }
  return s
}

// ═══ the cut ════════════════════════════════════════════════════════════════════════════════
// a v5 shot on this clock: it sees t + dt
const shifted = (shot, dt) => {
  const up = shot.update
  shot.update = t => up(t + dt)
  return shot
}
export const SHOTS6 = {
  open: [0, 5.0],
  cache: [4.65, 13.35],
  limits: [13.0, 18.35],
  side: [18.0, 22.35],
  adapt: [22.0, 25.3],
  install: [25.0, 28.0],
  table: [28.0, 31.65],
  end: [31.3, 35.0],
}
// [from, to, start, end, kind] · 1 cross · 3 zoom-through · 7 blur-zoom · 8 push
export const CUTS6 = [
  ['open', 'cache', 4.65, 5.0, 3],
  ['cache', 'limits', 13.0, 13.35, 3],
  ['limits', 'side', 18.0, 18.35, 8],
  ['side', 'adapt', 22.0, 22.35, 7],
  ['adapt', 'install', 25.0, 25.3, 1],
  ['table', 'end', 31.3, 31.65, 7],
]
export const DROPS6 = [1.0, 28.0]

export function buildShots() {
  const shots = {
    open: open6(),
    cache: shifted(cache(), 17),
    limits: shifted(limits(), 17),
    side: side(),
    adapt: shifted(adapt(), 13),
    install: shifted(install(), 13),
    table: shifted(tableShot(), 13),
    end: shifted(end(), 13),
  }
  const extra = {
    open_cache: () => ({ center: [0.5, 0.5], tint: '#000000' }),
    cache_limits: () => ({ center: [1220 / W, 1 - 540 / H], tint: '#000000' }),
    limits_side: () => ({ dir: [1, 0] }),
  }
  const plan = t => {
    const cut = CUTS6.find(([, , a, b]) => t >= a && t < b)
    if (cut) {
      const [from, to, a, b, kind] = cut
      const p = prog(t, a, b)
      return { a: shots[from], b: shots[to], kind, p: kind === 8 ? E.inOutQuart(p) : E.inOutCubic(p), bloomStrength: 0, ...(extra[`${from}_${to}`]?.(t, p) ?? {}) }
    }
    const name = Object.keys(SHOTS6).find(k => t >= SHOTS6[k][0] && t < SHOTS6[k][1]) ?? 'end'
    return { a: shots[name], bloomStrength: 0 }
  }
  return { shots, plan }
}
export function drawHud() {}
export function look(t) {
  const hit = DROPS6.reduce((m, d) => Math.max(m, t >= d ? Math.exp(-(t - d) * 7) : 0), 0)
  return { ca: hit * 0.002, exposure: 1 + hit * 0.1, vignette: 0.22, roll: false, grain: 0.006, fade: tw(t, 0, 0.12) * (1 - tw(t, 34.2, 35, E.inOutSine)) }
}
