// Act two: the four rings, one chapter each, each in its own colour world.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, makeShot, prog, rng, tw } from './engine.js'
import { dist, dust, glass, glow, ground, kin, panel, roundRectPath, shockwave, shoot, sparks, typeLayer } from './kit.js'
import {
  ACCENT, AMBER, BLUE, DIM, F, FAINT, FG, RED, WORLD, bigRing, chapterType, clockText, drawNav, measure, rgba, ring, span, text,
} from './common.js'
import { mix } from './ui.js'

const FOV = 35
const D = dist(FOV)

// common furniture for a chapter: ground, type layer, motes, the ring on the right
function chapter(name, { ringSize = 800, ringPos = [4.0, 0.1, 0], ringRot = -0.2 } = {}) {
  const s = makeShot()
  const bg = ground(s.scene, WORLD[name])
  const layer = typeLayer(s.scene)
  const motes = dust({ count: 380, box: [36, 22, 24], center: [2, 0, -8], color: ACCENT[name][1], opacity: 0.35, seed: name.length * 7 })
  s.scene.add(motes)
  const halo = glow(13, ACCENT[name][1], 0.55)
  halo.position.set(ringPos[0], ringPos[1], -1.5)
  halo.renderOrder = 2
  s.scene.add(halo)
  let big = null
  if (ringSize) {
    big = bigRing(ringSize)
    big.position.set(...ringPos)
    big.rotation.y = ringRot
    s.scene.add(big)
  }
  const wave = shockwave(ACCENT[name][0], 2.6)
  wave.position.set(ringPos[0], ringPos[1], ringPos[2] + 0.05)
  wave.rotation.y = ringRot
  s.scene.add(wave)
  const spark = sparks({ count: 160, color: ACCENT[name][0], speed: [2, 10], intensity: 3, seed: name.length * 3 })
  spark.position.set(...ringPos)
  s.scene.add(spark)
  return { s, bg, layer, motes, halo, big, wave, spark }
}
// a slow orbit that leaves room on the left for the words
function chapterCam(camera, t, t0, t1, { push = 0.9, swing = 1.6, shake = 0, y = 0 } = {}) {
  const p = prog(t, t0, t1)
  const e = E.inOutSine(p)
  const pos = [lerp(1.0 - swing / 2, 1.0 + swing / 2, e), lerp(-0.4, 0.5, e) + y, D * lerp(1.04, push, e)]
  const tgt = [lerp(0.9, 1.3, e), y * 0.6, 0]
  shoot(camera, t, pos, tgt, FOV, { drift: 0.06, shake })
}
const navIn = (t, a) => tw(t, a, a + 0.4)

// ═══ 04 · CACHE ═════════════════════════════════════════════════════════════════════════════
export function cacheLeft(t) {
  if (t < 12.9) return 3600
  if (t < 14.0) return 3600 - (t - 12.9)
  if (t < 16.0) return lerp(3598.9, 60, E.inOutCubic(prog(t, 14.0, 16.0)))
  if (t < 17.0) return 60 * (1 - prog(t, 16.0, 17.0) ** 1.25)
  if (t < 18.0) return 0
  return 3600
}
export function cache() {
  const { s, bg, layer, motes, halo, big, wave, spark } = chapter('cache')
  const [c0, c1] = ACCENT.cache
  s.update = t => {
    const left = cacheLeft(t)
    const expired = t >= 17.0 && t < 18.0
    const amber = !expired && left <= 60 && t >= 16.0 && t < 18.0
    const refill = tw(t, 18.0, 18.45, E.outExpo)
    const col = expired ? RED : amber ? AMBER : BLUE
    // the world warms with the ring
    const tint = expired ? RED : amber ? AMBER : null
    const bl = WORLD.cache.blobs.map((b, i) => (i === 0 && tint ? { ...b, c: mix(b.c, tint === RED ? '#7a0f12' : '#7a4a06', tw(t, tint === RED ? 17.0 : 16.0, (tint === RED ? 17.0 : 16.0) + 0.3)) } : b))
    bg.userData.set(bl)
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    halo.userData.set(col, expired ? 0.7 : 0.55)
    const frac = t >= 18.0 ? refill : left / 3600
    const value = expired ? '过期' : clockText(left)
    big.userData.draw(`${value}${col}${frac.toFixed(3)}`, {
      frac,
      color: col,
      value,
      valueFont: expired ? F.bold(170) : undefined,
      valueColor: expired ? RED : FG,
      label: '缓存',
      kicker: 'PROMPT CACHE · TIME LEFT',
      glowK: expired ? 1.4 : 1,
    })
    // the expiry glitches; the refill hits
    const g = expired ? Math.exp(-(t - 17.0) * 5) : 0
    big.position.x = 4.0 + (expired ? Math.sin(t * 173) * 0.12 * g : 0)
    wave.userData.at(t, 18.0, 7, 0.75)
    spark.userData.at(t, 18.0, s.camera, 1.2)
    chapterCam(s.camera, t, 12.5, 19.3, { push: 0.97, shake: g * 0.12 + (t >= 18 ? Math.exp(-(t - 18) * 7) * 0.08 : 0) })
    layer.draw(ctx => {
      chapterType(ctx, t, {
        caption: 'prompt cache · ttl 1h / 5m · auto',
        title: '缓存倒计时',
        accent: ACCENT.cache,
        t0: 12.75,
        t1: 19.6,
        subs: [
          [12.95, 15.9, '精确到秒。', [0, 4]],
          [16.0, 16.92, '最后一分钟，亮起琥珀色。', [6, 11], ['#ffe2a8', AMBER]],
          [17.0, 17.92, '过期，变红。', [3, 5], ['#ffb3ad', RED]],
          [18.0, 19.6, '发一条，重新计时。', [4, 8]],
        ],
      })
      drawNav(ctx, 0, { alpha: navIn(t, 12.7), accent: c1 })
    })
  }
  return s
}

// ═══ 05 · FIVE HOURS ════════════════════════════════════════════════════════════════════════
export function fivePct(t) {
  if (t < 19.35) return 13
  if (t < 20.5) return lerp(13, 47, E.outCubic(prog(t, 19.35, 20.5)))
  if (t < 21.35) return lerp(47, 72, E.inOutCubic(prog(t, 20.5, 21.1)))
  return lerp(72, 93, E.inOutCubic(prog(t, 21.35, 21.9)))
}
export function five() {
  const { s, bg, layer, motes, halo, big, wave, spark } = chapter('five')
  const [c0, c1] = ACCENT.five
  const ping2 = shockwave('#ffb3ad', 2.6)
  ping2.position.copy(wave.position)
  ping2.rotation.y = wave.rotation.y
  s.scene.add(ping2)
  s.update = t => {
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    const pct = fivePct(t)
    const col = pct >= 90 ? RED : pct >= 70 ? AMBER : '#8b5cf6'
    halo.userData.set(col, 0.55)
    const mins = Math.max(0, 151 - Math.floor(prog(t, 19.3, 23.3) * 14))
    big.userData.draw(`${Math.round(pct)}${mins}`, {
      frac: pct / 100,
      color: col,
      value: `${Math.round(pct)}%`,
      label: '5 小时额度',
      kicker: '5-HOUR LIMIT · USED',
      chip: `↻ ${span(mins)} 后重置`,
      marks: [[0.7, AMBER, '70%'], [0.9, RED, '90%']],
    })
    wave.material.color.set(AMBER)
    wave.userData.at(t, 21.1, 5.5, 0.6, 2.4)
    ping2.userData.at(t, 21.88, 6.5, 0.7, 2.8)
    spark.userData.at(t, 21.88, s.camera, 1.0)
    chapterCam(s.camera, t, 19.0, 23.3, { push: 0.97, shake: t >= 21.88 ? Math.exp(-(t - 21.88) * 7) * 0.06 : 0 })
    layer.draw(ctx => {
      chapterType(ctx, t, {
        caption: '5-hour limit · rolling window',
        title: '5 小时额度',
        titleAccent: [0, 1],
        accent: ACCENT.five,
        t0: 19.2,
        t1: 23.6,
        subs: [
          [19.4, 20.95, '用了多少，何时重置。', [0, 4]],
          [21.0, 23.6, '70% 提醒，90% 警告。', [0, 3], ['#ffe2a8', AMBER]],
        ],
      })
      drawNav(ctx, 1, { accent: c1 })
    })
  }
  return s
}

// ═══ 06 · SEVEN DAYS ════════════════════════════════════════════════════════════════════════
const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const WEEKH = [0.42, 0.68, 0.36, 0.84, 0.58, 0, 0]
export function seven() {
  const { s, bg, layer, motes, halo, big } = chapter('seven', { ringSize: 600, ringPos: [3.4, 0.75, 0] })
  const [c0, c1] = ACCENT.seven
  const bars = panel(700, 230, { res: 2 })
  bars.position.set(3.4, -2.95, 0.2)
  bars.rotation.y = -0.2
  bars.renderOrder = 12
  s.scene.add(bars)
  s.update = t => {
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    const g = tw(t, 23.35, 24.9, E.inOutCubic)
    const pct = 63 * g
    halo.userData.set(c1, 0.55)
    big.userData.draw(`${Math.round(pct)}`, {
      frac: pct / 100,
      color: '#ec4899',
      value: `${Math.round(pct)}%`,
      label: '7 天额度',
      kicker: '7-DAY LIMIT · USED',
      chip: '↻ 4d5h 后重置',
    })
    const k = Math.round(prog(t, 23.3, 25.2) * 60)
    bars.userData.draw(k, ctx => {
      glass(ctx, 4, 4, 692, 222, 22, { base: 'rgba(30,8,22,0.55)', fill: 0.04, border: 0.16, shadow: 0 })
      WEEK.forEach((d, i) => {
        const x = 52 + i * 94
        const h = 120 * WEEKH[i] * tw(t, 23.4 + i * 0.16, 23.4 + i * 0.16 + 0.5, E.outBack)
        roundRectPath(ctx, x, 40, 46, 120, 10)
        ctx.fillStyle = 'rgba(255,255,255,0.06)'
        ctx.fill()
        if (h > 1) {
          roundRectPath(ctx, x, 160 - h, 46, h, 10)
          const gr = ctx.createLinearGradient(0, 160 - h, 0, 160)
          gr.addColorStop(0, i === 4 ? '#ffc6e6' : '#ec4899')
          gr.addColorStop(1, i === 4 ? '#ec4899' : 'rgba(236,72,153,0.45)')
          ctx.fillStyle = gr
          ctx.fill()
        }
        text(ctx, d, x + 23, 200, F.med(24), i === 4 ? FG : DIM, { align: 'center' })
      })
    })
    chapterCam(s.camera, t, 23.0, 26.8, { push: 0.97 })
    layer.draw(ctx => {
      chapterType(ctx, t, {
        caption: '7-day limit · weekly reset',
        title: '7 天额度',
        titleAccent: [0, 1],
        accent: ACCENT.seven,
        t0: 23.2,
        t1: 27.1,
        subs: [[23.4, 27.1, '整周的节奏，心里有数。', [0, 5]]],
      })
      drawNav(ctx, 2, { accent: c1 })
    })
  }
  return s
}

// ═══ 07 · CONTEXT ═══════════════════════════════════════════════════════════════════════════
export function contextPct(t) {
  if (t < 29.95) return lerp(25, 82, E.inOutCubic(prog(t, 26.9, 29.4)))
  return lerp(82, 2, E.outExpo(prog(t, 29.95, 30.45)))
}
export function context() {
  const { s, bg, layer, motes, halo, wave, spark } = chapter('context', { ringSize: 0, ringPos: [4.0, 0.0, 0] })
  const [c0, c1] = ACCENT.context
  const CW = 720
  const CH = 860
  const card = panel(CW, CH, { res: 1.6 })
  card.position.set(4.0, 0.15, 0)
  card.rotation.y = -0.2
  card.renderOrder = 12
  s.scene.add(card)
  const r = rng(11)
  const MSG = Array.from({ length: 20 }, (_, i) => ({ user: i % 3 === 0, w: 180 + r() * 300, h: 34 + Math.round(r() * 1.4) * 30 }))
  s.update = t => {
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    const pct = contextPct(t)
    const col = pct >= 90 ? RED : pct >= 70 ? AMBER : '#14b8a6'
    halo.userData.set(col, 0.5)
    const n = clamp(Math.floor((t - 26.85) / 0.14), 0, MSG.length)
    const blast = prog(t, 29.95, 30.6)
    const typedN = clamp(Math.floor((t - 29.45) / 0.07) + 1, 0, 6)
    const key = `${n}${Math.round(pct)}${typedN}${Math.round(blast * 40)}${Math.floor(t * 2.4) % 2}`
    card.userData.draw(key, ctx => {
      glass(ctx, 4, 4, CW - 8, CH - 8, 30, { base: 'rgba(4,22,22,0.7)', fill: 0.05, border: 0.18, shadow: 0 })
      // header: the ring
      ctx.save()
      ctx.shadowColor = col
      ctx.shadowBlur = 24
      ring(ctx, 92, 92, 44, 13, pct / 100, col)
      ctx.restore()
      text(ctx, `${Math.round(pct)}%`, 166, 116, F.monoB(64), FG)
      text(ctx, '上下文', 166 + measure(ctx, `${Math.round(pct)}%`, F.monoB(64)) + 22, 112, F.med(34), DIM)
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(30, 170, CW - 60, 2)
      // the conversation, newest at the bottom
      ctx.save()
      ctx.beginPath()
      ctx.rect(20, 176, CW - 40, CH - 176 - 130)
      ctx.clip()
      let y = CH - 150
      for (let i = n - 1; i >= 0; i--) {
        const m = MSG[i]
        const age = t - (26.85 + i * 0.14)
        const q = E.outCubic(clamp(age / 0.25))
        y -= m.h + 18
        const x = m.user ? CW - 40 - m.w : 40
        const bx = blast > 0 ? (m.user ? 1 : -1) * E.inCubic(blast) * (300 + i * 20) : 0
        const by = blast > 0 ? -E.inCubic(blast) * (i * 9 - 80) : 0
        ctx.save()
        ctx.globalAlpha = q * (1 - blast)
        if (blast > 0) ctx.filter = `blur(${(blast * 12).toFixed(1)}px)`
        roundRectPath(ctx, x + bx, y + (1 - q) * 30 + by, m.w, m.h, 14)
        ctx.fillStyle = m.user ? 'rgba(20,184,166,0.32)' : 'rgba(255,255,255,0.1)'
        ctx.fill()
        ctx.fillStyle = m.user ? 'rgba(200,255,245,0.5)' : 'rgba(255,255,255,0.28)'
        for (let k = 0; k < Math.round(m.h / 30); k++) {
          roundRectPath(ctx, x + bx + 18, y + (1 - q) * 30 + by + 13 + k * 30, m.w * (k ? 0.5 : 0.78) - 18, 8, 4)
          ctx.fill()
        }
        ctx.restore()
      }
      ctx.restore()
      // the input, where /clear is typed
      glass(ctx, 30, CH - 110, CW - 60, 78, 20, { base: 'rgba(255,255,255,0.03)', fill: 0.04, border: 0.2, shadow: 0, top: 0.02 })
      const str = '/clear'.slice(0, typedN)
      text(ctx, str, 58, CH - 58, F.mono(32), FG)
      if (t < 29.95 && Math.floor(t * 2.4) % 2 === 0) {
        ctx.fillStyle = c1
        ctx.fillRect(60 + measure(ctx, str, F.mono(32)) + 4, CH - 90, 5, 40)
      }
    })
    wave.userData.at(t, 29.95, 6.5, 0.7)
    spark.userData.at(t, 29.95, s.camera, 1.1)
    chapterCam(s.camera, t, 26.5, 31.4, { push: 0.88, shake: t >= 29.95 ? Math.exp(-(t - 29.95) * 7) * 0.08 : 0 })
    layer.draw(ctx => {
      chapterType(ctx, t, {
        caption: 'context window · re-read after /clear',
        title: '上下文',
        accent: ACCENT.context,
        t0: 26.7,
        t1: 31.6,
        subs: [
          [26.9, 29.42, '占用多少，一直在眼前。', [4, 6]],
          [29.45, 31.6, '何时 /clear，一看便知。', [3, 9]],
        ],
      })
      drawNav(ctx, 3, { accent: c1, alpha: 1 - tw(t, 30.85, 31.15) })
    })
  }
  return s
}
