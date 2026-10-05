// v5 · act three. The limits and the context on glass; the real row through a narrowing
// window and a terminal; two commands; a table of glass at the drop; the name.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, prog, tw } from './engine.js'
import { glow, panel, shoot } from './kit.js'
import { AMBER, BLUE, F, RED, check, measure, pie, ring, ringColor, rowItems, text } from './ui.js'
import { FRONT, onLayer } from './glass.js'
import { liquid } from './liquid.js'
import { CC, PROMPT, drawPrompt, drawUsageRow, drawWindow } from './cc.js'
import { D, FOV, INK, MUTE, QUIET, UNIT, at, head, line, pointer, pool, sp, stage } from './stage.js'

const v3 = new THREE.Vector3()
const world = (obj, x, y, z = 0) => v3.set(x / UNIT, y / UNIT, z).applyMatrix4(obj.matrixWorld).toArray()

// glass pieces on a group: one liquid plane, faces on top, light underneath
function table(scene, { w = 2600, h = 1500, rot = [-0.5, 0.12, 0.3], ...gopts } = {}) {
  const g = new THREE.Group()
  g.rotation.set(...rot)
  scene.add(g)
  const glass = liquid({ w, h, ...gopts })
  g.add(glass)
  const face = (fw, fh, x, y, res = 2) => {
    const p = panel(fw, fh, { res })
    onLayer(p, FRONT)
    p.renderOrder = 60
    p.position.set(x / UNIT, y / UNIT, 0.01)
    g.add(p)
    return p
  }
  const light = (size, color, x, y, k = 1) => {
    const m = glow(size / UNIT, color, k)
    m.position.set(x / UNIT, y / UNIT, -0.05)
    g.add(m)
    return m
  }
  return { g, glass, face, light }
}

// ═══ E · LIMITS ═════════════════════════════════════════════════════════════════════════════
const CARD = { w: 440, h: 520, r: 64 }
const CX = [-600, 0, 600]
const five = t => (t < 30.8 ? 9 : t < 31.3 ? lerp(9, 47, E.outCubic(prog(t, 30.8, 31.2))) : t < 31.7 ? lerp(47, 72, E.inOutCubic(prog(t, 31.3, 31.65))) : lerp(72, 93, E.inOutCubic(prog(t, 31.75, 32.1))))
const seven = t => 67 * E.inOutCubic(prog(t, 32.3, 33.1))
const ctxp = t => (t < 34.85 ? lerp(40, 82, E.inOutCubic(prog(t, 33.75, 34.35))) : lerp(82, 2, E.outExpo(prog(t, 34.85, 35.3))))
function gauge(ctx, { kicker, pct, label, sub, col, typed = '' }) {
  const c = CARD.w / 2
  const cy = 236
  text(ctx, kicker, c, 70, F.mono(19), MUTE, { align: 'center', tracking: 3 })
  ring(ctx, c, cy, 118, 18, pct / 100, col)
  text(ctx, `${Math.round(pct)}%`, c, cy + 26, F.monoB(74), INK, { align: 'center' })
  text(ctx, label, c, 428, F.med(36), INK, { align: 'center' })
  if (typed) text(ctx, `› ${typed}`, c, 474, F.monoB(28), '#9ff5e6', { align: 'center' })
  else text(ctx, sub, c, 474, F.reg(25), MUTE, { align: 'center' })
}
export function limits() {
  const { s, bg, back, front } = stage()
  const T = table(s.scene, { refr: 34, bevel: 34, frost: 0.5, tintA: 0.14, sat: 1.5, spread: 60, dy: 34 })
  const faces = CX.map(x => T.face(CARD.w, CARD.h, x, 0))
  const lights = CX.map(x => T.light(900, BLUE, x, 0, 0.5))
  s.update = t => {
    bg.userData.tick(t)
    const p5 = five(t)
    const p7 = seven(t)
    const pc = ctxp(t)
    const typed = '/clear'.slice(0, clamp(Math.floor((t - 34.4) / 0.065) + 1, 0, 6))
    const shot = t >= 34.85 ? Math.exp(-(t - 34.85) * 6) : 0
    const shapes = CX.map((x, i) => {
      const s0 = sp(t, 30.05 + i * 0.12, 0.8)
      const sq = i === 2 ? 1 + 0.06 * shot : 1
      return { x, y: 0, w: CARD.w * s0 * sq, h: CARD.h * s0 / sq, r: CARD.r }
    })
    T.glass.userData.set(shapes)
    const vals = [p5, p7, pc]
    faces.forEach((f, i) => (f.material.opacity = clamp(sp(t, 30.05 + i * 0.12, 0.8) * 2 - 0.8)))
    faces[0].userData.draw(Math.round(p5 * 3), ctx => gauge(ctx, { kicker: '5-HOUR LIMIT', pct: p5, label: '5 小时额度', sub: '↻ 4h8m 后重置', col: ringColor(p5) }))
    faces[1].userData.draw(Math.round(p7 * 3), ctx => gauge(ctx, { kicker: '7-DAY LIMIT', pct: p7, label: '7 天额度', sub: '↻ 周五 4:00 重置', col: ringColor(p7) }))
    faces[2].userData.draw(`${Math.round(pc * 3)}${typed}`, ctx => gauge(ctx, { kicker: 'CONTEXT', pct: pc, label: '上下文', sub: pc < 10 ? '/clear 之后，重新开始' : '398.8k / 1M', col: ringColor(pc), typed: t > 34.35 && t < 34.95 ? typed : '' }))
    lights.forEach((m, i) => m.userData.set(ringColor(vals[i]), 0.45 * sp(t, 30.05 + i * 0.12, 0.8) + (i === 2 ? shot * 0.8 : 0)))
    // the camera glides along the table, card to card
    T.g.updateMatrixWorld(true)
    const fx = keys(t, [
      [30.0, -900],
      [30.9, -600, E.outCubic],
      [32.0, -560, E.lin],
      [32.45, 0, E.inOutCubic],
      [33.55, 40, E.lin],
      [34.0, 600, E.inOutCubic],
      [35.35, 650, E.lin],
    ])
    const tgt = world(T.g, fx, -30)
    const zoom = keys(t, [[30.0, 1.25], [30.9, 0.92, E.outCubic], [35.35, 0.88]])
    s.camera.updateMatrixWorld()
    const pos = [tgt[0] + 0.9, tgt[1] - 2.6 * zoom, tgt[2] + D * 0.78 * zoom]
    shoot(s.camera, t, pos, tgt, FOV, { drift: 0.02, shake: shot * 0.02 })
    back.draw(() => false)
    front.draw(ctx => {
      head(ctx, t, '额度和上下文，', '同样一眼看清。', { t0: 30.25, t1: 35.0, x: 120, y: 170, size: 60, lag: 0.25 })
      const subs = [
        [30.95, 32.15, '5 小时额度：70% 琥珀，90% 变红。'],
        [32.35, 33.6, '7 天额度：重置时间，一并显示。'],
        [33.75, 35.0, '上下文：何时 /clear，一看便知。'],
      ]
      subs.forEach(([a, b, str]) => line(ctx, str, 122, 330, 32, t, { t0: a, t1: b, color: INK }))
    })
  }
  return s
}

// ═══ F · ADAPT ══════════════════════════════════════════════════════════════════════════════
// the real thing, flat: the window narrows, the row folds its labels; then a terminal
const AW = { h: 470 }
function compactWindow(ctx, w, t, items, mode) {
  const h = AW.h
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(1, 1, w - 2, h - 2, 18)
  ctx.fillStyle = CC.bg
  ctx.fill()
  ctx.strokeStyle = CC.line
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.clip()
  ;['#ed6a5e', '#f4bf4f', '#61c554'].forEach((c, i) => {
    ctx.beginPath()
    ctx.arc(30 + i * 24, 26, 7, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
  })
  ctx.fillStyle = CC.line
  ctx.fillRect(0, 52, w, 1.5)
  text(ctx, '好的。先读一下现有实现，再拆成三个文件。', 40, 112, F.reg(25), CC.ink)
  text(ctx, '● Bash  bun test  18 pass', 40, 162, F.mono(22), CC.dim)
  text(ctx, '拆分完成，测试全部通过。', 40, 212, F.reg(25), CC.ink)
  drawUsageRow(ctx, 46, 264, items, { size: 22, mode })
  drawPrompt(ctx, 30, 296, t, { w: w - 60, h: 134, caret: true })
  ctx.restore()
}
function terminal(ctx, w, h, t, items) {
  ctx.beginPath()
  ctx.roundRect(1, 1, w - 2, h - 2, 16)
  ctx.fillStyle = '#0c0c0c'
  ctx.fill()
  ctx.strokeStyle = '#2b2b2b'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ;['#ed6a5e', '#f4bf4f', '#61c554'].forEach((c, i) => {
    ctx.beginPath()
    ctx.arc(28 + i * 22, 24, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
  })
  text(ctx, '~/api-server — claude', w / 2, 30, F.mono(18), '#777', { align: 'center' })
  text(ctx, '✻ Welcome to Claude Code', 36, 96, F.mono(24), CC.orange)
  text(ctx, '> 把 token 统计拆成独立模块', 36, 146, F.mono(24), '#cfcfcf')
  text(ctx, '⏺ 拆分完成，测试全部通过。', 36, 192, F.mono(24), '#cfcfcf')
  ctx.strokeStyle = '#3a3a3a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(28, 226, w - 56, 58, 8)
  ctx.stroke()
  text(ctx, '>', 46, 264, F.mono(24), '#cfcfcf')
  if (Math.floor(t * 2.2) % 2 === 0) {
    ctx.fillStyle = '#cfcfcf'
    ctx.fillRect(72, 244, 13, 26)
  }
  // the row, as the terminal draws it: pie glyphs
  let x = 40
  items.forEach(it => {
    pie(ctx, x + 9, 318, 9, it.frac, it.color)
    text(ctx, it.value, x + 26, 326, F.mono(22), '#d6d6d6')
    const lw = measure(ctx, it.value, F.mono(22))
    text(ctx, it.short, x + 34 + lw, 326, F.mono(22), '#777')
    x += 34 + lw + measure(ctx, it.short, F.mono(22)) + 34
  })
}
export function adapt() {
  const { s, bg, back, front } = stage()
  const win = panel(1400, AW.h, { res: 1.6 })
  win.position.set(...at(960, 600), 0)
  s.scene.add(win)
  const term = panel(1100, 360, { res: 1.6 })
  s.scene.add(term)
  s.update = t => {
    bg.userData.tick(t)
    const items = rowItems({ cacheLeft: 3540 - (t - 35), five: 9, seven: 67, ctx: 40, fiveReset: 246, sevenReset: 4618 })
    const w = keys(t, [[35.0, 1400], [36.05, 980, E.inOutQuint], [36.55, 980], [37.25, 660, E.inOutQuint]])
    const mode = w > 1150 ? 'full' : w > 800 ? 'short' : 'none'
    win.userData.draw(`${Math.round(w)}${mode}${items[0].value}${Math.floor(t * 2.2) % 2}`, ctx => compactWindow(ctx, w, t, items, mode))
    win.position.set(...at(960 + (1400 - w) / 2, 600), 0)
    const tin = E.outQuint(prog(t, 37.2, 38.0))
    const away = E.inOutCubic(prog(t, 37.15, 37.9))
    win.position.x -= away * 5
    win.material.opacity = 1 - away
    term.position.set(...at(lerp(1500, 1000, tin), 620), 0.2)
    term.material.opacity = tin
    term.userData.draw(`${items[0].value}${Math.floor(t * 2.2) % 2}`, ctx => terminal(ctx, 1100, 360, t, items))
    shoot(s.camera, t, [0.4, -0.5, D * lerp(0.8, 0.74, prog(t, 35, 38.35))], [0.4, -0.5, 0], FOV, { drift: 0.012 })
    back.draw(() => false)
    front.draw(ctx => {
      head(ctx, t, '窗口再窄，', '也不拥挤。', { t0: 35.25, t1: 37.05, x: 120, y: 190, size: 64 })
      head(ctx, t, '终端里，', '一样原生。', { t0: 37.3, t1: 38.25, x: 120, y: 190, size: 64 })
    })
  }
  return s
}

// ═══ G · INSTALL ════════════════════════════════════════════════════════════════════════════
const CMD1 = '/plugin marketplace add sundyme/usage-line'
const CMD2 = '/plugin install usage-line'
export function install() {
  const { s, bg, back, front } = stage()
  const P = { w: 1240, h: 132 }
  const box = panel(P.w + 20, 420, { res: 1.6 })
  box.position.set(...at(960, 600), 0)
  s.scene.add(box)
  s.update = t => {
    bg.userData.tick(t)
    const n1 = clamp(Math.floor((t - 38.3) / 0.019), 0, CMD1.length)
    const n2 = clamp(Math.floor((t - 39.45) / 0.022), 0, CMD2.length)
    const sent1 = t >= 39.25
    const sent2 = t >= 40.05
    const typed = !sent1 ? CMD1.slice(0, n1) : !sent2 ? CMD2.slice(0, n2) : ''
    const rowIn = E.outCubic(prog(t, 40.3, 40.8))
    const items = rowItems({ cacheLeft: 3600, five: 9, seven: 67, ctx: 2, fiveReset: 246, sevenReset: 4618 })
    box.userData.draw(`${typed}${sent1}${sent2}${Math.round(rowIn * 30)}${Math.floor(t * 2.2) % 2}`, ctx => {
      const ok = (y, str, a) => {
        if (a <= 0) return
        ctx.save()
        ctx.globalAlpha = a
        check(ctx, 18, y - 8, 20, CC.green, a)
        text(ctx, str, 52, y, F.mono(24), CC.dim)
        ctx.restore()
      }
      ok(60, '已添加插件市场 sundyme/usage-line', tw(t, 39.3, 39.5))
      ok(108, '已安装 usage-line', tw(t, 40.1, 40.3))
      drawUsageRow(ctx, 22, 198 + (1 - rowIn) * 10, items, { size: 24, reveal: i => E.outCubic(prog(t, 40.3 + i * 0.08, 40.7 + i * 0.08)) })
      drawPrompt(ctx, 10, 240, t, { w: P.w, typed, caret: true, placeholder: '继续说点什么…' })
    })
    shoot(s.camera, t, [0, 0, D * lerp(0.86, 0.8, prog(t, 38, 41))], [0, -0.3, 0], FOV, { drift: 0.012 })
    back.draw(ctx => {
      pool(ctx, 620, 795, 420, BLUE, 0.16 * rowIn * (1 - tw(t, 40.6, 41.0) * 0.5))
      return true
    })
    front.draw(ctx => head(ctx, t, '两行命令，', '零配置。', { t0: 38.2, t1: 40.95, x: 960, y: 190, size: 64, align: 'center', lag: 0.9 }))
  }
  return s
}

// ═══ H · TABLE — the drop: everything, on glass ═════════════════════════════════════════════
const PIECES = [
  // [x, y, w, h, kind, delay]
  [0, 0, 1110, 92, 'row', 0],
  [-860, 330, 300, 300, 'lens', 0.25],
  [700, 300, 300, 84, 'five', 0.5],
  [1000, -330, 300, 84, 'seven', 0.75],
  [-620, -300, 320, 84, 'ctx', 1.0],
  [150, 330, 340, 84, 'amber', 1.25],
  [-120, -330, 230, 84, 'red', 1.5],
  [700, -160, 200, 84, 'btn', 1.75],
]
export function tableShot() {
  const { s, bg, back, front } = stage()
  const T = table(s.scene, { w: 3200, h: 1700, rot: [-0.62, 0.1, 0.42], refr: 30, bevel: 26, frost: 0.45, tintA: 0.16, sat: 1.5, spread: 50, dy: 30 })
  const faces = PIECES.map(([x, y, w, h]) => T.face(w, h, x, y))
  const lights = [T.light(3400, '#3a6df0', -200, 60, 0.5), T.light(2800, '#7c4dff', 600, 100, 0.4), T.light(2600, '#14b8a6', -900, 300, 0.3), T.light(2000, AMBER, 200, 380, 0.25)]
  s.update = t => {
    bg.userData.tick(t)
    const items = rowItems({ cacheLeft: 3600 - (t - 41), five: 9, seven: 67, ctx: 40, fiveReset: 246, sevenReset: 4618 })
    const shapes = []
    PIECES.forEach(([x, y, w, h, kind, dl], i) => {
      const q = sp(t, 41.0 + dl * 0.5, 0.7)
      const tint = kind === 'btn' ? 1 : 0
      shapes.push({ x, y, w: w * q, h: h * q, r: kind === 'lens' ? 150 : h / 2 })
      const f = faces[i]
      f.material.opacity = clamp(q * 2 - 0.8)
      f.scale.setScalar(Math.max(0.001, q))
      f.userData.draw(kind === 'row' || kind === 'lens' ? items[0].value : 0, ctx => {
        const cy = h / 2
        if (kind === 'row') drawUsageRow(ctx, 46, cy, items, { size: 30 })
        else if (kind === 'lens') {
          ring(ctx, 150, 150, 120, 12, items[0].frac, BLUE)
          text(ctx, items[0].value, 150, 168, F.monoB(54), INK, { align: 'center' })
        } else if (kind === 'btn') {
          ctx.beginPath()
          ctx.roundRect(4, 4, w - 8, h - 8, (h - 8) / 2)
          ctx.fillStyle = 'rgba(47,111,232,0.85)'
          ctx.fill()
          text(ctx, '安装', w / 2, cy + 11, F.med(32), '#fff', { align: 'center' })
        } else {
          const spec = { five: [9, '9%', '5h'], seven: [67, '67%', '7d'], ctx: [40, '40%', '上下文'], amber: [3, '00:42', '最后一分钟'], red: [0, '过期', '缓存'] }[kind]
          const col = kind === 'amber' ? AMBER : kind === 'red' ? RED : ringColor(spec[0])
          ring(ctx, 42, cy, 16, 5.5, kind === 'red' ? 0 : kind === 'amber' ? 0.03 : spec[0] / 100, col, { minArc: 0.03 })
          text(ctx, spec[1], 72, cy + 11, F.med(30), kind === 'red' ? '#ff8a7a' : INK)
          text(ctx, spec[2], 82 + measure(ctx, spec[1], F.med(30)), cy + 11, F.reg(28), MUTE)
        }
      })
    })
    T.glass.userData.set(shapes)
    lights.forEach((m, i) => m.userData.set(['#3a6df0', '#7c4dff', '#14b8a6', AMBER][i], [0.22, 0.18, 0.14, 0.1][i] * tw(t, 41.0, 41.6)))
    T.g.updateMatrixWorld(true)
    const fx = keys(t, [[41.0, -260], [44.65, 200, E.inOutSine]])
    const tgt = world(T.g, fx, 30)
    const z = keys(t, [[41.0, 0.78], [44.65, 1.0, E.inOutSine]])
    shoot(s.camera, t, [tgt[0] + 1.2, tgt[1] - 3.2 * z, tgt[2] + D * 0.8 * z], tgt, FOV, { drift: 0.025 })
    back.draw(() => false)
    front.draw(() => false)
  }
  return s
}

// ═══ I · END ════════════════════════════════════════════════════════════════════════════════
const PILL = { x: 960, y: 716, w: 560, h: 76 }
export function end() {
  const { s, bg, back, front } = stage()
  const glass = liquid({ w: 1000, h: 400, refr: 20, bevel: 18, frost: 0.5, tintA: 0.16 })
  glass.position.set(...at(PILL.x, PILL.y), 0)
  s.scene.add(glass)
  const face = panel(PILL.w, PILL.h, { res: 2 })
  onLayer(face, FRONT)
  face.renderOrder = 60
  face.position.set(...at(PILL.x, PILL.y), 0.01)
  s.scene.add(face)
  face.userData.draw(0, ctx => {
    ring(ctx, 44, 38, 13, 4.5, 0.72, BLUE)
    text(ctx, 'github.com/sundyme/usage-line', 72, 47, F.mono(27), INK)
  })
  const CLICK = 46.35
  s.update = t => {
    bg.userData.tick(t)
    const q = sp(t, 45.25, 0.75)
    const press = Math.exp(-Math.max(0, t - CLICK) * 7) * (t >= CLICK ? 1 : 0)
    glass.userData.set(q > 0.001 ? [{ x: 0, y: 0, w: PILL.w * q * (1 - 0.03 * press), h: PILL.h * clamp(q * 1.4) * (1 - 0.06 * press), r: PILL.h / 2 }] : [])
    face.material.opacity = clamp(q * 2 - 0.9)
    shoot(s.camera, t, [0, 0, D * lerp(1.04, 1.0, E.outCubic(prog(t, 44.3, 48)))], [0, 0, 0], FOV, { drift: 0.01 })
    back.draw(ctx => {
      pool(ctx, 760, 700, 380, '#3a6df0', 0.22 * q)
      pool(ctx, 1180, 730, 360, '#7c4dff', 0.16 * q)
      return true
    })
    front.draw(ctx => {
      const wm = tw(t, 44.5, 45.1, E.outQuint)
      if (wm > 0) {
        ctx.save()
        ctx.globalAlpha = wm
        const g = E.outCubic(prog(t, 44.5, 45.6))
        ring(ctx, 960 - 352, 452, 30, 9, 0.72 * g, BLUE)
        ctx.restore()
      }
      line(ctx, 'usage-line', 990, 488, 104, t, { t0: 44.55, font: F.monoB, align: 'center', stagger: 0.04 })
      line(ctx, '不用点开，一眼看清。', 960, 590, 46, t, { t0: 44.95, align: 'center', color: MUTE })
      const path = keys(t, [[45.6, [1300, 980]], [46.25, [PILL.x + 120, PILL.y + 6], E.outCubic]])
      const ca = tw(t, 45.6, 45.8) * (1 - tw(t, 47.0, 47.3))
      if (ca > 0) pointer(ctx, t, path[0], path[1], [CLICK], ca)
    })
  }
  return s
}
