// v4 · act two: the line arrives, and the cache gets the stage it never had.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, prog, tw } from './engine.js'
import { UNIT, dust, kin, panel, roundRectPath, shockwave, shoot, sparks, toPx } from './kit.js'
import {
  ACCENT, AMBER, BLUE, DIM, F, FG, RED, WIN, chapterType, clockText, drawNav, navLayout, rgba, ring, rowItems, rowLayout, text,
  windowBase, windowPrompt, windowTalk,
} from './common.js'
import { drawRow } from './ui.js'
import { BACK, FRONT, glassShadow, glassShape, onGlass, onLayer } from './glass.js'
import { D, FOV, glassShot, pin, spring } from './v4a.js'

export const ROWV = { five: 9, fiveReset: 248, seven: 67, sevenReset: 4620, ctx: 40 }
export const rowNow = (cacheLeft = 3600) => rowItems({ cacheLeft, ...ROWV })

// The nav: the plugin's row on a liquid-glass bar pinned to the bottom of the frame.
export function navGlass(s) {
  const { width } = navLayout()
  const g = glassShape({ w: width + 70, h: 66, r: 33, tintA: 0.4, frost: 0.9 })
  s.scene.add(g)
  return {
    mesh: g,
    update(t, alpha = 1) {
      pin(g, s.camera, W / 2, 986)
      g.userData.tick(t)
      g.userData.u.opacity.value = alpha
      g.visible = alpha > 0.01
    },
  }
}

const WORLD_REVEAL = { base: '#05060d', blobs: [{ c: '#1b45d0', x: 0.3, y: 0.6, r: 0.4, a: 1 }, { c: '#5a1fb0', x: 0.78, y: 0.72, r: 0.36, a: 0.9 }, { c: '#0b7a96', x: 0.55, y: 0.12, r: 0.32, a: 0.7 }, { c: '#a0237a', x: 0.95, y: 0.2, r: 0.22, a: 0.5 }] }
const WORLD_CACHE = { base: '#04070f', blobs: [{ c: '#1747d6', x: 0.72, y: 0.55, r: 0.4, a: 1 }, { c: '#0a7fa0', x: 0.95, y: 0.1, r: 0.35, a: 0.8 }, { c: '#3a1fa0', x: 0.1, y: 0.85, r: 0.45, a: 0.7 }] }

// ═══ 03 · REVEAL ════════════════════════════════════════════════════════════════════════════
export function reveal() {
  const { s, bg, layer } = glassShot(WORLD_REVEAL)
  const motes = dust({ count: 420, box: [44, 26, 24], center: [0, 0, -8], color: '#a9c1ff', opacity: 0.4, seed: 8 })
  s.scene.add(motes)
  const wave = shockwave('#b8d2ff', 3)
  const spark = sparks({ count: 240, color: '#c8dcff', speed: [3, 15], intensity: 3.5, seed: 12 })
  s.scene.add(wave, spark)
  // the capsule and its row
  const SIZE = 36
  const CAP = { w: 1300, h: 128 }
  const lay = rowLayout(document.createElement('canvas').getContext('2d'), rowNow(), 'full', SIZE)
  const rowW = lay[3].x + lay[3].w
  const rowX0 = (CAP.w - rowW) / 2
  const cap = glassShape({ w: 70, h: 70, r: 35, tintA: 0.3, frost: 0.75 })
  const capShadow = glassShadow(CAP.w, CAP.h, CAP.h / 2, { k: 0.6 })
  const capFront = onGlass(CAP.w, CAP.h, { res: 2.5 })
  s.scene.add(capShadow, cap, capFront)
  // the window around it, at the row's scale (36 px here, 30 in the app)
  const k = SIZE / 30
  const winGroup = new THREE.Group()
  s.scene.add(winGroup)
  const base = panel(WIN.w * k, WIN.h * k, { res: 1.1 })
  base.userData.draw(0, ctx => {
    ctx.scale(k, k)
    windowBase(ctx, WIN.w, WIN.h)
    ctx.translate(0, 66)
    windowTalk(ctx, WIN.w)
  })
  const prompt = panel(1472 * k, 170 * k, { res: 1.4 })
  prompt.userData.draw(0, ctx => {
    ctx.scale(k, k)
    windowPrompt(ctx, 1472)
  })
  base.renderOrder = 4
  prompt.renderOrder = 5
  winGroup.add(base, prompt)
  // place the window so its row slot (x 80, y 640 in app px) sits under the capsule
  const slotX = (80 + rowW / k / 2) * k
  const ox = (WIN.w * k) / 2 - slotX
  const oy = (640 - WIN.h / 2) * k
  base.position.set(ox / UNIT, oy / UNIT, 0)
  prompt.position.set((ox - (WIN.w / 2 - 64 - 736) * k) / UNIT, (oy - (765 - 500) * k) / UNIT, 0)
  const cacheRingW = [(rowX0 + lay[0].ringX - CAP.w / 2) / UNIT, 0, 0]
  s.cacheCenter = () => {
    const [x, y] = toPx(s.camera, cacheRingW)
    return [x / W, 1 - y / H]
  }

  s.update = t => {
    bg.userData.tick(t, lerp(0.5, 1, tw(t, 14, 15)))
    motes.userData.tick(t, s.camera)
    wave.userData.at(t, 14.02, 9, 0.9)
    spark.userData.at(t, 14.02, s.camera, 1.4)
    // the capsule grows out of a point
    const g = spring(prog(t, 14.05, 14.75))
    const w = lerp(70, CAP.w, g)
    const h = lerp(70, CAP.h, clamp(g * 1.4))
    cap.userData.set(w, h, h / 2)
    cap.userData.tick(t)
    capShadow.scale.set(w / CAP.w, h / CAP.h, 1)
    capShadow.position.set(0, 0, -0.04)
    // the row: rings arrive one per half beat, the clock starts to run
    const rv = i => tw(t, 14.45 + i * 0.2, 14.9 + i * 0.2, E.outBack)
    const left = t < 15.6 ? 3600 : 3600 - Math.floor(t - 15.6)
    capFront.userData.draw(`${left}${[0, 1, 2, 3].map(i => Math.round(rv(i) * 30)).join()}`, ctx => {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(0, 0, CAP.w, CAP.h, CAP.h / 2)
      ctx.clip()
      drawRow(ctx, rowX0, CAP.h / 2, rowNow(left), { size: SIZE, reveal: rv })
      ctx.restore()
    })
    // the window gathers round it
    const wv = tw(t, 16.75, 17.5, E.outCubic)
    winGroup.visible = wv > 0.01
    base.material.opacity = prompt.material.opacity = wv
    winGroup.position.z = lerp(-3, 0, wv)
    // camera
    const pos = keys(t, [
      [14.0, [0, 0, D * 0.55]],
      [15.0, [0, 0.1, D * 0.86], E.outCubic],
      [16.7, [0.2, 0.15, D * 0.92], E.lin],
      [17.7, [-2.6, -3.4, D * 1.55], E.inOutCubic],
      [18.4, [0.4, -0.6, D * 1.72], E.outCubic],
      [19.3, [cacheRingW[0] * 0.6, 0, D * 1.15], E.inCubic],
    ])
    const tgt = keys(t, [
      [16.7, [0, 0, 0]],
      [17.7, [0.4, 2.2, 0], E.inOutCubic],
      [18.4, [0.2, 2.05, 0], E.outCubic],
      [19.3, [cacheRingW[0] * 0.85, 0.2, 0], E.inCubic],
    ])
    shoot(s.camera, t, pos, tgt, FOV, { drift: 0.05, shake: Math.exp(-Math.max(0, t - 14) * 6) * 0.08 })
    layer.draw(ctx => {
      kin(ctx, 'usage-line', W / 2, 330, F.monoB(124), t, { t0: 15.25, t1: 16.65, style: 'type', stagger: 0.045, caret: 'blink', accent: [0, 10, ['#fff', '#fff'], '#7fb2ff'] })
      kin(ctx, '一行，全看清。', W / 2, 770, F.bold(76), t, { t0: 15.7, t1: 16.65, stagger: 0.05, accent: [3, 6, ACCENT.blue] })
      kin(ctx, '不用点开，也不用找。', W / 2, 850, F.med(40), t, { t0: 16.05, t1: 16.65, stagger: 0.03, color: rgba(FG, 0.7) })
      kin(ctx, '就在输入框上方，一直都在。', W / 2, 112, F.bold(64), t, { t0: 17.6, t1: 18.75, stagger: 0.04, accent: [9, 13, ACCENT.blue] })
    })
  }
  return s
}

// ═══ 04 · CACHE ═════════════════════════════════════════════════════════════════════════════
export function cacheLeft4(t) {
  if (t < 19.3) return 3600
  if (t < 21.8) return 3600 - (t - 19.3)
  if (t < 22.9) return lerp(3597.5, 760, E.inOutCubic(prog(t, 21.8, 22.9)))
  if (t < 23.62) return 760 - (t - 22.9)
  if (t < 25.0) return 3600 - Math.max(0, t - 24.0)
  if (t < 25.8) return lerp(3599, 59, E.inOutCubic(prog(t, 25.0, 25.8)))
  if (t < 26.7) return 59 * (1 - prog(t, 25.8, 26.7) ** 1.25)
  if (t < 27.95) return 0
  return 3600
}
export const REFILLS = [23.62, 27.95]
export function cache() {
  const { s, bg, layer } = glassShot(WORLD_CACHE)
  const motes = dust({ count: 380, box: [36, 22, 24], center: [2, 0, -8], color: '#9ec5ff', opacity: 0.35, seed: 14 })
  s.scene.add(motes)
  const P = [4.05, 0.2, 0]
  // the ring, behind the glass
  const RS = 900
  const light = panel(RS, RS, { res: 1.1, intensity: 1.35, blending: THREE.AdditiveBlending })
  light.position.set(...P)
  light.renderOrder = 8
  s.scene.add(light)
  // the lens
  const DS = 470
  const disc = glassShape({ w: DS, h: DS, r: DS / 2, tintA: 0.32, frost: 0.8, refr: 34, bevel: 40 })
  disc.position.set(P[0], P[1], 0.02)
  const discShadow = glassShadow(DS, DS, DS / 2, { k: 0.55, spread: 60, dy: 30 })
  discShadow.position.set(P[0], P[1], -0.02)
  const front = onGlass(RS, RS, { res: 1.6 })
  front.position.set(P[0], P[1], 0.04)
  s.scene.add(discShadow, disc, front)
  const waves = REFILLS.map(() => {
    const w = shockwave('#b8d2ff', 2.8)
    w.position.set(P[0], P[1], 0.05)
    onLayer(w, FRONT)
    s.scene.add(w)
    return w
  })
  const spark = sparks({ count: 160, color: '#bcd6ff', speed: [2, 11], intensity: 3, seed: 21 })
  spark.position.set(...P)
  s.scene.add(spark)
  // the message that comes back in time
  const MSG = { w: 560, h: 84 }
  const bubble = glassShape({ w: MSG.w, h: MSG.h, r: 42, tintA: 0.3, frost: 0.85 })
  const bubbleFront = onGlass(MSG.w, MSG.h)
  bubbleFront.userData.draw(0, ctx => {
    text(ctx, '继续，把测试也补上', 36, 54, F.reg(30), FG)
    ctx.beginPath()
    ctx.arc(MSG.w - 44, 42, 24, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(236,233,226,0.92)'
    ctx.fill()
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 3.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(MSG.w - 44, 52)
    ctx.lineTo(MSG.w - 44, 33)
    ctx.moveTo(MSG.w - 52, 41)
    ctx.lineTo(MSG.w - 44, 33)
    ctx.lineTo(MSG.w - 36, 41)
    ctx.stroke()
  })
  s.scene.add(bubble, bubbleFront)
  const nav = navGlass(s)

  s.update = t => {
    const left = cacheLeft4(t)
    const expired = t >= 26.7 && t < 27.95
    const amber = !expired && left <= 60 && t >= 25.8 && t < 27.95
    const col = expired ? RED : amber ? AMBER : BLUE
    const refill = REFILLS.reduce((m, r) => (t >= r ? tw(t, r, r + 0.45, E.outExpo) : m), 1)
    const inRefill = REFILLS.some(r => t >= r && t < r + 0.45)
    const frac = inRefill ? refill : left / 3600
    // the world warms with the ring
    const warm = amber ? tw(t, 25.8, 26.1) : expired ? 1 : 0
    const bl = WORLD_CACHE.blobs.map((b, i) => (i === 0 && warm ? { ...b, c: expired ? '#8a1a14' : '#7a4a06' } : b))
    bg.userData.set(bl)
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    disc.userData.tick(t)
    disc.userData.u.glowC.value.set(col).multiplyScalar(expired ? 0.12 : 0.05)
    const key = `${Math.round(frac * 720)}${col}`
    light.userData.draw(key, ctx => {
      const c = RS / 2
      const R = 300
      const lw = 26
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + (i / 60) * Math.PI * 2
        const on = i / 60 < frac - 1e-6
        ctx.strokeStyle = on ? rgba(col, 0.9) : 'rgba(255,255,255,0.13)'
        ctx.lineWidth = i % 5 === 0 ? 3 : 2
        ctx.beginPath()
        ctx.moveTo(c + Math.cos(a) * (R + 38), c + Math.sin(a) * (R + 38))
        ctx.lineTo(c + Math.cos(a) * (R + (i % 5 === 0 ? 62 : 53)), c + Math.sin(a) * (R + (i % 5 === 0 ? 62 : 53)))
        ctx.stroke()
      }
      ctx.lineWidth = lw
      ctx.strokeStyle = expired ? rgba(RED, 0.55) : 'rgba(255,255,255,0.08)'
      ctx.beginPath()
      ctx.arc(c, c, R, 0, Math.PI * 2)
      ctx.stroke()
      if (frac > 0) {
        const a1 = -Math.PI / 2 + Math.PI * 2 * Math.min(0.99995, frac)
        ctx.save()
        ctx.lineCap = 'round'
        ctx.shadowColor = col
        ctx.shadowBlur = 50
        const gr = ctx.createConicGradient(-Math.PI / 2, c, c)
        gr.addColorStop(0, rgba(col, 0.35))
        gr.addColorStop(Math.max(0.01, frac), col)
        ctx.strokeStyle = gr
        ctx.beginPath()
        ctx.arc(c, c, R, -Math.PI / 2, a1)
        ctx.stroke()
        ctx.restore()
        ctx.fillStyle = '#fff'
        ctx.shadowColor = col
        ctx.shadowBlur = 30
        ctx.beginPath()
        ctx.arc(c + Math.cos(a1) * R, c + Math.sin(a1) * R, 10, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    const hit = tw(t, 23.8, 24.1) * (1 - tw(t, 25.0, 25.3))
    front.userData.draw(`${expired ? 'x' : clockText(left)}${Math.round(hit * 20)}`, ctx => {
      const c = RS / 2
      text(ctx, 'PROMPT CACHE · TIME LEFT', c, c - 86, F.mono(19), DIM, { align: 'center', tracking: 3 })
      text(ctx, expired ? '过期' : clockText(left), c, c + 40, expired ? F.bold(120) : F.monoB(128), expired ? RED : FG, { align: 'center' })
      text(ctx, '缓存', c, c + 100, F.med(36), DIM, { align: 'center' })
      if (hit > 0) text(ctx, '命中 · 398.8k × 0.1', c, c + 150, F.monoB(24), '#8fe0a6', { align: 'center', alpha: hit })
    })
    // the expiry glitches, each refill hits
    const gl = expired ? Math.exp(-(t - 26.7) * 5) : 0
    const jx = expired ? Math.sin(t * 173) * 0.12 * gl : 0
    ;[light, disc, discShadow, front].forEach(m => (m.position.x = P[0] + jx))
    waves.forEach((w, i) => w.userData.at(t, REFILLS[i], 7, 0.75))
    spark.userData.at(t, REFILLS[0], s.camera, 1.2)
    // the bubble flies in and is absorbed
    const fly = (t0, t1) => {
      const q = tw(t, t0, t1, E.inOutCubic)
      return t >= t0 && t < t1 + 0.05 ? q : -1
    }
    const fq = Math.max(fly(23.05, 23.62), fly(27.4, 27.95))
    bubble.visible = bubbleFront.visible = fq >= 0
    if (fq >= 0) {
      const x = lerp(-1.2, P[0], fq)
      const y = lerp(-3.4, P[1], E.inCubic(fq))
      const sc = lerp(1, 0.25, E.inCubic(fq))
      bubble.position.set(x, y, 0.06)
      bubbleFront.position.set(x, y, 0.07)
      bubble.userData.set(MSG.w * sc, MSG.h * sc, (MSG.h * sc) / 2)
      bubbleFront.scale.setScalar(sc)
      bubble.userData.tick(t)
      bubble.userData.u.opacity.value = 1 - tw(t, 0, 0) * 0
    }
    nav.update(t, 1)
    const shake = gl * 0.12 + REFILLS.reduce((m, r) => m + (t >= r ? Math.exp(-(t - r) * 7) * 0.08 : 0), 0)
    const e = E.inOutSine(prog(t, 19.0, 29.3))
    const push = REFILLS.reduce((m, r) => m + (t >= r ? Math.exp(-(t - r) * 3) * 0.35 : 0), 0)
    shoot(s.camera, t, [lerp(0.2, 1.4, e), lerp(-0.3, 0.4, e), D * lerp(1.05, 0.95, e) + push], [lerp(0.9, 1.4, e), 0.1, 0], FOV, { drift: 0.06, shake })
    layer.draw(ctx => {
      chapterType(ctx, t, {
        caption: 'prompt cache · ttl 1h / 5m · auto-detected',
        title: '缓存倒计时',
        accent: ACCENT.cache,
        t0: 19.2,
        t1: 29.6,
        subs: [
          [19.45, 20.85, '精确到秒。界面里没有的，这里有。', [0, 4]],
          [20.95, 22.2, '订阅 1 小时，超额 5 分钟，自动识别。', [3, 6]],
          [22.3, 23.5, '离开一会儿？还剩 12 分钟。', [9, 14]],
          [23.6, 24.95, '回来接着聊，正好命中。', [6, 10], ['#c6f6d5', '#3fb950']],
          [25.0, 26.62, '最后一分钟，亮起琥珀色。', [6, 11], ['#ffe2a8', AMBER]],
          [26.7, 27.88, '过期变红：下一句按全价。', [2, 4], ['#ffb3ad', RED]],
          [27.95, 29.6, '看着倒计时，把缓存用足。', [9, 11]],
        ],
      })
      drawNav(ctx, 0, { alpha: 1, accent: BLUE, cacheLeft: cacheLeft4(t) })
    })
  }
  return s
}
