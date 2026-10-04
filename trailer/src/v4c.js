// v4 · act three: the limits and the context, never a click away; anywhere you work; install;
// the point; the name.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, prog, tw } from './engine.js'
import { cursor, dust, glass, glow, kin, panel, roundRectPath, shockwave, shoot, sparks, streaks } from './kit.js'
import { ACCENT, AMBER, BLUE, DIM, F, FG, RED, drawNav, measure, rgba, ring, ringColor, text } from './common.js'
import { FRONT, glassShadow, glassShape, onGlass, onLayer } from './glass.js'
import { D, FOV, glassShot } from './v4a.js'
import { navGlass } from './v4b.js'
import { adapt as adapt3, finale as finale3, install as install3 } from './act3.js'

const WORLD_LIMITS = { base: '#07070d', blobs: [{ c: '#5b21b6', x: 0.2, y: 0.5, r: 0.3, a: 1 }, { c: '#a3195b', x: 0.5, y: 0.55, r: 0.28, a: 0.9 }, { c: '#0d7a6c', x: 0.8, y: 0.5, r: 0.3, a: 1 }, { c: '#1a2a6b', x: 0.5, y: 1.0, r: 0.5, a: 0.6 }] }

// ═══ 05 · LIMITS — three gauges on glass ════════════════════════════════════════════════════
const CARD = { w: 470, h: 580, r: 46 }
const XS = [-5.4, 0, 5.4]
function fivePct4(t) {
  if (t < 29.9) return 9
  if (t < 30.6) return lerp(9, 47, E.outCubic(prog(t, 29.9, 30.5)))
  if (t < 31.3) return lerp(47, 72, E.inOutCubic(prog(t, 30.6, 31.1)))
  return lerp(72, 93, E.inOutCubic(prog(t, 31.3, 31.8)))
}
const sevenPct4 = t => 67 * E.inOutCubic(prog(t, 32.1, 33.0))
const ctxPct4 = t => (t < 35.6 ? lerp(40, 82, E.inOutCubic(prog(t, 33.9, 34.9))) : lerp(82, 2, E.outExpo(prog(t, 35.6, 36.1))))
export function limits() {
  const { s, bg, layer } = glassShot(WORLD_LIMITS)
  const motes = dust({ count: 360, box: [40, 22, 20], center: [0, 0, -8], color: '#c7b8ff', opacity: 0.35, seed: 33 })
  s.scene.add(motes)
  const cards = XS.map((x, i) => {
    const sh = glassShadow(CARD.w, CARD.h, CARD.r, { k: 0.6, spread: 60, dy: 34 })
    sh.position.set(x, -0.1, -0.05)
    const g = glassShape({ w: CARD.w, h: CARD.h, r: CARD.r, tintA: 0.3, frost: 0.85, refr: 30, bevel: 30 })
    g.position.set(x, -0.1, 0)
    const f = onGlass(CARD.w, CARD.h, { res: 2 })
    f.position.set(x, -0.1, 0.01)
    s.scene.add(sh, g, f)
    return { sh, g, f }
  })
  const wave = shockwave('#9ff5e6', 2.6)
  wave.position.set(XS[2], 0.3, 0.05)
  onLayer(wave, FRONT)
  s.scene.add(wave)
  const nav = navGlass(s)
  const gauge = (ctx, { kicker, pct, label, chip, col, marks = false, extra = null }) => {
    const c = CARD.w / 2
    const cy = 250
    text(ctx, kicker, c, 70, F.mono(20), DIM, { align: 'center', tracking: 2 })
    ctx.save()
    ctx.shadowColor = col
    ctx.shadowBlur = 30
    ring(ctx, c, cy, 132, 22, pct / 100, col)
    ctx.restore()
    if (marks) {
      for (const [f, mc] of [[0.7, AMBER], [0.9, RED]]) {
        const a = -Math.PI / 2 + Math.PI * 2 * f
        ctx.strokeStyle = mc
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(c + Math.cos(a) * 112, cy + Math.sin(a) * 112)
        ctx.lineTo(c + Math.cos(a) * 152, cy + Math.sin(a) * 152)
        ctx.stroke()
      }
    }
    text(ctx, `${Math.round(pct)}%`, c, cy + 26, F.monoB(76), FG, { align: 'center' })
    text(ctx, label, c, 470, F.bold(40), FG, { align: 'center' })
    if (chip) text(ctx, chip, c, 522, F.reg(26), DIM, { align: 'center' })
    if (extra) extra(ctx)
  }
  s.update = t => {
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    const p5 = fivePct4(t)
    const p7 = sevenPct4(t)
    const pc = ctxPct4(t)
    const typed = clamp(Math.floor((t - 35.05) / 0.07) + 1, 0, 6)
    const focus = t < 32.0 ? 0 : t < 33.8 ? 1 : t < 36.0 ? 2 : -1
    cards.forEach(({ g, f, sh }, i) => {
      g.userData.tick(t)
      const lit = focus === -1 || focus === i ? 1 : 0.55
      f.material.opacity = lerp(f.material.opacity ?? 1, lit, 0.5)
      const inP = tw(t, 29.1 + i * 0.12, 29.7 + i * 0.12, E.outBack)
      const y = -0.1 + (1 - inP) * -1.2
      g.position.y = f.position.y = y
      sh.position.y = y
      g.userData.u.opacity.value = clamp(inP * 2)
      f.material.opacity = clamp(inP * 2) * lit
    })
    cards[0].f.userData.draw(Math.round(p5 * 4), ctx => gauge(ctx, { kicker: '5-HOUR LIMIT', pct: p5, label: '5 小时额度', chip: '↻ 4h8m 后重置', col: ringColor(p5), marks: true }))
    cards[1].f.userData.draw(Math.round(p7 * 4), ctx => gauge(ctx, { kicker: '7-DAY LIMIT', pct: p7, label: '7 天额度', chip: '↻ 周五 4:00 重置', col: '#4e8ff7' }))
    cards[2].f.userData.draw(`${Math.round(pc * 4)}${typed}${Math.floor(t * 2.4) % 2}`, ctx =>
      gauge(ctx, {
        kicker: 'CONTEXT WINDOW',
        pct: pc,
        label: '上下文',
        chip: pc < 10 ? '/clear 之后 · 重新读入' : '398.8k / 1M',
        col: ringColor(pc),
        extra: c2 => {
          if (t < 34.95 || t > 36.2) return
          const str = '/clear'.slice(0, typed)
          roundRectPath(c2, 60, 400, CARD.w - 120, 0, 0)
          text(c2, `› ${str}`, CARD.w / 2, 418, F.monoB(30), '#9ff5e6', { align: 'center', alpha: 1 - tw(t, 35.55, 35.7) })
        },
      }),
    )
    wave.userData.at(t, 35.6, 5, 0.6)
    nav.update(t, 1)
    const pos = keys(t, [
      [29.0, [-3.6, 0.4, D * 0.86]],
      [31.9, [-3.9, 0.1, D * 0.8], E.lin],
      [32.4, [1.0, 0.2, D * 0.8], E.inOutCubic],
      [33.7, [1.2, 0.1, D * 0.8], E.lin],
      [34.2, [6.4, 0.2, D * 0.8], E.inOutCubic],
      [35.9, [6.6, 0.0, D * 0.82], E.lin],
      [36.6, [0, 0.3, D * 1.08], E.inOutCubic],
      [37.35, [0, 0.3, D * 1.12], E.lin],
    ])
    const tgt = keys(t, [
      [29.0, [-5.0, -0.3, 0]],
      [31.9, [-5.1, -0.3, 0], E.lin],
      [32.4, [0, -0.3, 0], E.inOutCubic],
      [33.7, [0, -0.3, 0], E.lin],
      [34.2, [5.0, -0.3, 0], E.inOutCubic],
      [35.9, [5.1, -0.3, 0], E.lin],
      [36.6, [0, -0.3, 0], E.inOutCubic],
    ])
    shoot(s.camera, t, pos, tgt, FOV, { drift: 0.05, shake: t >= 35.6 ? Math.exp(-(t - 35.6) * 7) * 0.06 : 0 })
    layer.draw(ctx => {
      kin(ctx, '额度和上下文，也不用再点开。', W / 2, 118, F.bold(64), t, { t0: 29.35, t1: 37.1, stagger: 0.035, accent: [8, 13, ACCENT.five] })
      const subs = [
        [29.95, 31.95, '5 小时额度：70% 琥珀，90% 变红。'],
        [32.05, 33.75, '7 天额度：重置时间，一并显示。'],
        [33.85, 36.95, '上下文：何时 /clear，一看便知。'],
      ]
      subs.forEach(([a, b, str]) => kin(ctx, str, W / 2, 926, F.med(38), t, { t0: a, t1: b, stagger: 0.025, color: rgba(FG, 0.85) }))
      drawNav(ctx, focus === -1 ? 3 : focus + 1, { accent: ['#8b5cf6', '#4e8ff7', '#14b8a6'][Math.max(0, focus)], cacheLeft: 3600 - Math.max(0, t - 28.4) })
    })
  }
  return s
}

// ═══ 06–08 · the v3 shots, moved onto this clock ════════════════════════════════════════════
const shifted = (shot, dt) => {
  const up = shot.update
  shot.update = t => up(t - dt)
  return shot
}
export const adapt = () => shifted(adapt3(), 6.0)
export const install = () => shifted(install3(), 5.0)
export const finale = () => shifted(finale3(), 4.5)

// ═══ 09 · PAYOFF ════════════════════════════════════════════════════════════════════════════
export function payoff() {
  const { s, bg, layer } = glassShot({ base: '#04040a', blobs: [{ c: '#1a2f8a', x: 0.3, y: 0.6, r: 0.5, a: 0.9 }, { c: '#3b1780', x: 0.75, y: 0.4, r: 0.45, a: 0.8 }, { c: '#0b6a5a', x: 0.6, y: 0.1, r: 0.3, a: 0.5 }] })
  const lines = streaks({ count: 700, radius: [3, 24], depth: 140, len: 2, intensity: 1.2, colors: ['#7f9cff', '#b9a2ff'] })
  s.scene.add(lines)
  s.update = t => {
    bg.userData.tick(t)
    const u = lines.userData.u
    u.travel.value = (t - 44.5) * 18
    u.camZ.value = s.camera.position.z
    u.opacity.value = 0.6
    shoot(s.camera, t, [0, 0, D * lerp(1.0, 0.9, prog(t, 44.5, 46.75))], [0, 0, 0], FOV, { drift: 0.04 })
    layer.draw(ctx => {
      kin(ctx, '少一次点击，', W / 2, 480, F.bold(136), t, { t0: 44.6, t1: 46.4, stagger: 0.05 })
      kin(ctx, '多省一笔 token。', W / 2, 660, F.bold(136), t, { t0: 45.2, t1: 46.4, stagger: 0.05, accent: [1, 3, ACCENT.blue] })
    })
  }
  return s
}
