// v5 · act two. A drop of glass becomes the row, and the row lands where it lives: flat, in
// Claude Code, above the prompt. Then the number the menu never had, up close.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, prog, tw } from './engine.js'
import { panel, shoot, kin } from './kit.js'
import { AMBER, BLUE, F, RED, measure, ring, rowItems, text } from './ui.js'
import { onLayer } from './glass.js'
import { liquid } from './liquid.js'
import { CC, PROMPT, drawPrompt, drawUsageRow, drawWindow, promptY } from './cc.js'
import { D, FOV, FRONT, INK, MUTE, UNIT, at, head, line, pool, sp, stage } from './stage.js'

const lp = (x, y, cx = W / 2, cy = H / 2) => ({ x: x - cx, y: cy - y })

// ── a Claude Code window with usage-line in it, flat ────────────────────────────────────────
export const RW = { w: 1400, h: 860 }
export function ccWindow(scene, { w = RW.w, h = RW.h } = {}) {
  const g = new THREE.Group()
  scene.add(g)
  const PY = promptY(h)
  const PW = w - 80
  const wl = (x, y, z = 0) => [(x - w / 2) / UNIT, (h / 2 - y) / UNIT, z]
  const add = (pw, ph, x, y, z, ro, res = 1.6) => {
    const p = panel(pw, ph, { res })
    p.position.set(...wl(x + pw / 2, y + ph / 2, z))
    p.renderOrder = ro
    g.add(p)
    return p
  }
  const base = add(w, h, 0, 0, 0, 1)
  base.userData.draw(0, ctx => drawWindow(ctx, { w, h }))
  const prompt = add(PW + 20, PROMPT.h + 20, PROMPT.x - 10, PY - 10, 0.002, 2)
  const row = add(PW, 56, PROMPT.x, PY - 62, 0.002, 2, 2)
  return { g, base, prompt, row, wl, PY, PW, w, h, rowY: PY - 34 }
}

export const state = t => rowItems({ cacheLeft: 3600 - Math.max(0, t - 17.2), five: 9, seven: 67, ctx: 40, fiveReset: 248, sevenReset: 4620 })

// ═══ C · REVEAL ═════════════════════════════════════════════════════════════════════════════
const HERO = { x: 960, y: 520, w: 1110, h: 92, size: 30 }
export function reveal() {
  const { s, bg, back, front } = stage()
  const win = ccWindow(s.scene)
  const glass = liquid({ w: 2200, h: 1300, refr: 26, bevel: 24, frost: 0.4, tintA: 0.16, sat: 1.5, lift: 0.05 })
  glass.position.z = 0.6
  s.scene.add(glass)
  const face = panel(HERO.w, HERO.h, { res: 2 })
  onLayer(face, FRONT)
  face.renderOrder = 60
  s.scene.add(face)
  // the window's spot for the row, on screen once it has landed (window at 1:1, centred)
  const WIN_Y = 172 + RW.h / 2
  const ROW_X0 = 960 - RW.w / 2 + PROMPT.x + 6
  const ROW_Y = 172 + win.rowY
  s.update = t => {
    bg.userData.tick(t)
    const items = state(t)
    // the drop, the stretch
    const pop = sp(t, 16.0, 0.42)
    const str = sp(t, 16.28, 0.75)
    // the landing
    const land = E.inOutCubic(prog(t, 18.75, 19.75))
    const rowW = 640
    const hx = lerp(HERO.x, ROW_X0 + rowW / 2, land)
    const hy = lerp(HERO.y, ROW_Y, land)
    const hw = lerp(lerp(64 * pop, HERO.w, str), rowW + 36, land)
    const hh = lerp(lerp(64 * pop, HERO.h, clamp(str * 1.3)), 50, land)
    const melt = tw(t, 19.55, 20.05)
    glass.userData.set(pop > 0.001 ? [{ ...lp(hx, hy), w: hw, h: hh, r: hh / 2 }] : [])
    glass.userData.u.opacity.value = 1 - melt
    const k = lerp(1, 22 / HERO.size, land)
    face.position.set(...at(hx, hy), 0.61)
    face.scale.set(k, k, 1)
    face.material.opacity = clamp((str - 0.35) / 0.4) * (1 - melt)
    face.userData.draw(`${items[0].value}${Math.round(t * 30)}`, ctx =>
      drawUsageRow(ctx, 46, HERO.h / 2, items, { size: HERO.size, reveal: i => E.outCubic(prog(t, 16.6 + i * 0.13, 17.1 + i * 0.13)) }),
    )
    // the window rises to meet it
    const up = E.outQuint(prog(t, 18.4, 19.6))
    win.g.position.set(...at(960, lerp(WIN_Y + 700, WIN_Y, up)), 0)
    win.base.material.opacity = win.prompt.material.opacity = clamp(up * 1.5)
    win.prompt.userData.draw(Math.floor(t * 2.2) % 2, ctx => drawPrompt(ctx, 10, 10, t, { w: win.PW, caret: true }))
    win.row.material.opacity = melt
    win.row.userData.draw(items[0].value, ctx => drawUsageRow(ctx, 6, 28, items, { size: 22 }))
    // camera: still for the reveal, then a lean in on the cache ring
    const push = E.inOutCubic(prog(t, 20.9, 22.35))
    const tgt = [lerp(0, (ROW_X0 + 12 - 960) / UNIT, push * 0.9), lerp(0, (540 - ROW_Y) / UNIT, push * 0.9), 0]
    shoot(s.camera, t, [tgt[0], tgt[1], D * lerp(1, 0.55, E.inCubic(push))], tgt, FOV, { drift: 0.012 })
    back.draw(ctx => {
      // light under the glass while it is the hero
      const L = (1 - land) * tw(t, 16.0, 16.5)
      const flash = Math.exp(-Math.max(0, t - 16.05) * 4) * tw(t, 16.0, 16.06)
      pool(ctx, 700, 520, 520, '#3a6df0', 0.32 * L + 0.2 * flash)
      pool(ctx, 1000, 560, 480, '#7c4dff', 0.24 * L)
      pool(ctx, 1260, 500, 460, '#14b8a6', 0.18 * L)
      // the window's top melts into the dark, so type can sit over it
      const g = ctx.createLinearGradient(0, 0, 0, 640)
      g.addColorStop(0, 'rgba(17,18,21,1)')
      g.addColorStop(0.55, 'rgba(17,18,21,0.92)')
      g.addColorStop(1, 'rgba(17,18,21,0)')
      ctx.globalAlpha = up
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, 640)
      ctx.globalAlpha = 1
      return true
    })
    front.draw(ctx => {
      const wm = tw(t, 16.95, 17.6, E.outQuint) * (1 - tw(t, 18.15, 18.45))
      if (wm > 0) {
        ctx.save()
        ctx.globalAlpha = wm
        ring(ctx, 990 - 312, 362, 24, 7.5, 0.72, BLUE)
        ctx.restore()
      }
      line(ctx, 'usage-line', 960 + 30, 392, 88, t, { t0: 16.95, t1: 18.15, font: F.monoB, align: 'center', stagger: 0.035 })
      line(ctx, '一行，全看清。', 960, 680, 46, t, { t0: 17.4, t1: 18.2, align: 'center', color: MUTE })
      head(ctx, t, '就在输入框上方，', '不用点开，也不用找。', { t0: 19.7, t1: 21.6, x: 960, y: 220, size: 72, align: 'center', lag: 0.3 })
    })
  }
  return s
}

// ═══ D · CACHE ══════════════════════════════════════════════════════════════════════════════
// cache time left, in seconds, through the scene's story
export function cacheLeft(t) {
  if (t < 23.6) return 3599 - Math.max(0, t - 22.2)
  if (t < 24.4) return lerp(3598.6, 720, E.inOutCubic(prog(t, 23.6, 24.4)))
  if (t < 25.6) return 720 - (t - 24.4)
  if (t < 26.1) return lerp(719, 3600, E.outCubic(prog(t, 25.6, 26.1)))
  if (t < 26.5) return 3600 - (t - 26.1)
  if (t < 27.1) return lerp(3599.6, 59, E.inOutCubic(prog(t, 26.5, 27.1)))
  if (t < 28.0) return 59 * (1 - prog(t, 27.1, 28.0) ** 1.3)
  if (t < 29.15) return 0
  if (t < 29.65) return lerp(0, 3600, E.outCubic(prog(t, 29.15, 29.65)))
  return 3600 - (t - 29.65)
}
export const MERGES = [25.6, 29.15]
const LENS = { x: 1310, y: 540, d: 500 }
const BUB = { w: 330, h: 74 }
export function cache() {
  const { s, bg, back, front } = stage()
  const PC = { x: 1150, y: 600 }
  const glass = liquid({ w: 1800, h: 1200, k: 90, refr: 70, bevel: 64, frost: 0.28, tintA: 0.1, sat: 1.4, lift: 0.04, disp: 0.7 })
  glass.position.set(...at(PC.x, PC.y), 0)
  s.scene.add(glass)
  const lensFace = panel(LENS.d, LENS.d, { res: 2 })
  const bubFace = panel(BUB.w, BUB.h, { res: 2 })
  for (const f of [lensFace, bubFace]) {
    onLayer(f, FRONT)
    f.renderOrder = 60
    s.scene.add(f)
  }
  lensFace.position.set(...at(LENS.x, LENS.y), 0.01)
  bubFace.userData.draw(0, ctx => {
    text(ctx, '继续：再补一个边界测试', 30, 47, F.reg(26), INK)
  })
  const bubble = (t, m) => {
    // a message flies in and is swallowed by the lens
    const q = prog(t, m - 0.62, m)
    if (q <= 0 || t > m + 0.3) return null
    const e = E.inCubic(q)
    const x = lerp(560, LENS.x, e)
    const y = lerp(880, LENS.y, e)
    const sh = 1 - tw(t, m - 0.08, m + 0.25)
    return { x, y, w: BUB.w * sh * lerp(1, 0.5, e), h: BUB.h * sh * lerp(1, 0.75, e), q, sh }
  }
  s.update = t => {
    bg.userData.tick(t)
    const left = cacheLeft(t)
    const expired = left <= 0.001 && t > 27.9
    const last = !expired && left < 60
    const col = expired ? RED : last ? AMBER : BLUE
    const inn = sp(t, 22.15, 0.8)
    const pulse = MERGES.reduce((m, r) => m + (t >= r ? Math.exp(-(t - r) * 5) : 0), 0)
    const d = LENS.d * inn * (1 + 0.035 * pulse)
    const shapes = [{ ...lp(LENS.x, LENS.y, PC.x, PC.y), w: d, h: d, r: d / 2 }]
    let bf = null
    for (const m of MERGES) bf = bf ?? bubble(t, m)
    if (bf) shapes.push({ ...lp(bf.x, bf.y, PC.x, PC.y), w: bf.w, h: bf.h, r: bf.h / 2 })
    glass.userData.set(shapes)
    glass.userData.u.glow.value.set(expired ? '#2a0d0b' : '#000000')
    bubFace.material.opacity = bf ? clamp((0.92 - bf.q) / 0.3) * clamp(bf.sh * 3) : 0
    if (bf) bubFace.position.set(...at(bf.x, bf.y), 0.01)
    lensFace.material.opacity = clamp(inn * 2 - 0.6)
    lensFace.scale.setScalar(Math.max(0.001, inn))
    lensFace.userData.draw(`${Math.ceil(left)}${expired}${last}`, ctx => {
      const c = LENS.d / 2
      text(ctx, 'PROMPT CACHE', c, c - 88, F.mono(20), MUTE, { align: 'center', tracking: 4 })
      const str = expired ? '过期' : `${String(Math.floor(Math.ceil(left) / 60)).padStart(2, '0')}:${String(Math.ceil(left) % 60).padStart(2, '0')}`
      text(ctx, str, c, c + 40, expired ? F.med(120) : F.monoB(118), expired ? '#ff8a7a' : last ? '#ffd28a' : INK, { align: 'center' })
      text(ctx, expired ? '下一句按全价' : last ? '最后一分钟' : '剩余', c, c + 104, F.reg(26), MUTE, { align: 'center' })
    })
    const pos = keys(t, [
      [22.0, [0.4, 0, D * 1.08]],
      [30.35, [-0.2, 0, D * 0.96], E.inOutSine],
    ])
    shoot(s.camera, t, pos, [pos[0], 0, 0], FOV, { drift: 0.012, shake: pulse * 0.02 })
    back.draw(ctx => {
      // the ring the lens sits over: light for the glass to bend
      const a = inn
      pool(ctx, LENS.x, LENS.y, 520, col, 0.2 * a + 0.15 * pulse)
      ctx.save()
      ctx.globalAlpha = a
      ctx.shadowColor = col
      ctx.shadowBlur = 36
      ring(ctx, LENS.x, LENS.y, 300, 24, left / 3600, col, { minArc: expired ? 0 : 0.012 })
      ctx.restore()
      for (let i = 0; i < 60; i++) {
        const an = -Math.PI / 2 + (i / 60) * Math.PI * 2
        const r0 = i % 5 === 0 ? 340 : 346
        ctx.strokeStyle = `rgba(255,255,255,${(i % 5 === 0 ? 0.28 : 0.12) * a})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(LENS.x + Math.cos(an) * r0, LENS.y + Math.sin(an) * r0)
        ctx.lineTo(LENS.x + Math.cos(an) * 356, LENS.y + Math.sin(an) * 356)
        ctx.stroke()
      }
      return true
    })
    front.draw(ctx => {
      line(ctx, 'PROMPT CACHE · TTL 1h / 5m', 130, 330, 22, t, { t0: 22.25, font: F.mono, color: MUTE, tracking: 3 })
      line(ctx, '缓存倒计时', 130, 440, 92, t, { t0: 22.3 })
      const subs = [
        [22.6, 23.55, '命中缓存，重读只要一成价格。'],
        [23.7, 25.4, '离开一会儿？还剩 12 分钟。'],
        [25.62, 26.4, '回来接着聊，正好命中。'],
        [26.55, 27.9, '最后一分钟，琥珀色提醒。'],
        [28.02, 29.0, '过期变红：下一句，全价重读。'],
        [29.2, 30.2, '看着倒计时，把缓存用足。'],
      ]
      subs.forEach(([a, b, str]) => line(ctx, str, 132, 530, 38, t, { t0: a, t1: b, color: MUTE }))
    })
  }
  return s
}
