// v4 · act one: the glance that costs a click, the number that isn't there, and why it matters.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, makeShot, prog, rng, tw } from './engine.js'
import { UNIT, cursor, dist, dust, ground, kin, panel, roundRectPath, shockwave, shoot, sparks, toPx, typeLayer } from './kit.js'
import { ACCENT, AMBER, BLUE, DIM, F, FAINT, FG, RED, measure, rgba, ring, text } from './common.js'
import { BACK, FRONT, glassRender, glassShadow, glassShape, onGlass, onLayer } from './glass.js'

export const FOV = 35
export const D = dist(FOV)
export const spring = p => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-6.5 * p) * Math.cos(9.5 * p))

export const WORLD4 = {
  graphite: { base: '#101116', blobs: [{ c: '#1d44c4', x: 0.22, y: 0.78, r: 0.36, a: 0.95 }, { c: '#b84a1a', x: 0.86, y: 0.22, r: 0.3, a: 0.65 }, { c: '#5a22b4', x: 0.82, y: 0.86, r: 0.34, a: 0.8 }, { c: '#0e5f6e', x: 0.05, y: 0.1, r: 0.3, a: 0.5 }] },
  why: { base: '#0a0b12', blobs: [{ c: '#1a3fb8', x: 0.7, y: 0.45, r: 0.42, a: 0.9 }, { c: '#5b1fa8', x: 0.95, y: 0.95, r: 0.35, a: 0.7 }, { c: '#0c2f55', x: 0.1, y: 0.2, r: 0.45, a: 0.7 }] },
  danger: { base: '#0d0808', blobs: [{ c: '#a32416', x: 0.72, y: 0.5, r: 0.4, a: 0.9 }, { c: '#5b1fa8', x: 0.95, y: 0.95, r: 0.35, a: 0.5 }, { c: '#3a0d0d', x: 0.1, y: 0.2, r: 0.45, a: 0.7 }] },
}

// A glass shot: ground and its motes behind, type in front, three-pass render.
export function glassShot(world) {
  const s = makeShot()
  const bg = ground(s.scene, world)
  const layer = typeLayer(s.scene)
  onLayer(layer.mesh, FRONT)
  s.render = glassRender(s)
  return { s, bg, layer }
}

// Keep a mesh fixed in screen space (px, y down) at the reference distance.
const v3 = new THREE.Vector3()
export function pin(mesh, camera, px, py) {
  camera.updateMatrixWorld()
  const hh = Math.tan((camera.fov * Math.PI) / 360) * D
  const hw = hh * (W / H)
  v3.set((px / W * 2 - 1) * hw, (1 - py / H * 2) * hh, -D).applyMatrix4(camera.matrixWorld)
  mesh.position.copy(v3)
  mesh.quaternion.copy(camera.quaternion)
}

// ── the usage popover, as Claude Code draws it ──────────────────────────────────────────────
export const POP = { w: 760, h: 590 }
const UIF = s => F.reg(s)
function barLine(ctx, x, y, w, f, col = BLUE) {
  roundRectPath(ctx, x, y, w, 9, 4.5)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fill()
  if (f > 0) {
    roundRectPath(ctx, x, y, Math.max(9, w * f), 9, 4.5)
    ctx.fillStyle = col
    ctx.fill()
  }
}
export function drawPopover(ctx, { hi = -1, missing = 0, t = 0 } = {}) {
  const w = POP.w
  const x0 = 34
  const x1 = w - 34
  const hl = (i, y) => {
    if (hi !== i) return
    roundRectPath(ctx, 14, y - 40, w - 28, 76, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fill()
  }
  hl(0, 72)
  text(ctx, 'Context window', x0, 70, UIF(30), '#d8d5ce')
  text(ctx, '398.8k / 1M (40%)  ›', x1, 70, UIF(28), '#a19e97', { align: 'right' })
  // the segmented context bar
  const bw = x1 - x0
  roundRectPath(ctx, x0, 98, bw, 9, 4.5)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fill()
  const segs = [[0.35, BLUE], [0.014, '#e0662f'], [0.01, '#2fb3a0'], [0.006, '#e5a33a'], [0.004, '#3fb950'], [0.03, '#77736c']]
  let sx = x0
  segs.forEach(([f, c], i) => {
    roundRectPath(ctx, sx, 98, bw * f, 9, i ? 2 : 4.5)
    ctx.fillStyle = c
    ctx.fill()
    sx += bw * f + 3
  })
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(x0 - 10, 146, bw + 20, 1.5)
  text(ctx, 'Plan usage limits · Max (5x)', x0, 204, UIF(28), '#9a978f')
  text(ctx, '→', x1, 204, UIF(28), '#9a978f', { align: 'right' })
  const row = (i, y, name, reset, pct) => {
    hl(i, y)
    text(ctx, name, x0, y, UIF(30), '#ece9e2')
    text(ctx, `${reset}   ${pct}%`, x1, y, UIF(28), '#a19e97', { align: 'right' })
    barLine(ctx, x0, y + 24, bw, pct / 100)
  }
  row(1, 268, 'Session limit', 'Resets in 4 hr 8 min', 9)
  row(2, 352, 'Weekly · all models', 'Resets Fri 4:00 AM', 67)
  row(3, 436, 'Weekly · Fable', 'Resets Fri 4:00 AM', 2)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillRect(x0 - 10, 500, bw + 20, 1.5)
  text(ctx, 'See detailed breakdown', x0 + 14, 552, UIF(26), '#c9c6bf')
  // the row that isn't there
  if (missing > 0) {
    ctx.save()
    ctx.globalAlpha = missing
    ctx.setLineDash([10, 9])
    ctx.lineWidth = 2.5
    ctx.strokeStyle = rgba(RED, 0.85)
    roundRectPath(ctx, 14, 590, w - 28, 80, 16)
    ctx.stroke()
    ctx.setLineDash([])
    text(ctx, 'Prompt cache', x0, 640, UIF(30), '#9a978f')
    text(ctx, '— — : — —   ?', x1, 640, F.monoB(28), RED, { align: 'right' })
    ctx.restore()
  }
}

function drawTranscript(ctx, w, h) {
  // a session behind the glass, colourful enough to bend
  const r = rng(3)
  const ask = '把 token 统计拆成独立模块，顺便补上测试'
  roundRectPath(ctx, w - 760, 50, 700, 64, 20)
  ctx.fillStyle = '#2a2925'
  ctx.fill()
  text(ctx, ask, w - 736, 92, F.reg(27), FG)
  text(ctx, '好的。先读一下现有实现，再拆成三个文件。', 80, 190, F.reg(28), FG)
  const code = [
    [['export ', '#c678dd'], ['function ', '#c678dd'], ['countTokens', '#61afef'], ['(msgs) {', '#e6e1d8']],
    [['  const ', '#c678dd'], ['cached ', '#e6e1d8'], ['= ', '#56b6c2'], ['usage.cache_read', '#e5c07b']],
    [['  return ', '#c678dd'], ['msgs.', '#e6e1d8'], ['reduce', '#61afef'], ['((n, m) => n + m.tokens, ', '#e6e1d8'], ['0', '#d19a66'], [')', '#e6e1d8']],
    [['}', '#e6e1d8']],
  ]
  roundRectPath(ctx, 70, 230, w - 140, 230, 18)
  ctx.fillStyle = '#17161a'
  ctx.fill()
  code.forEach((ln, i) => {
    let x = 104
    ln.forEach(([s, c]) => {
      text(ctx, s, x, 290 + i * 46, F.mono(26), c)
      x += measure(ctx, s, F.mono(26))
    })
  })
  const tool = (verb, arg, extra, y, col) => {
    ctx.beginPath()
    ctx.arc(92, y - 8, 7, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.fill()
    text(ctx, verb, 114, y, F.monoB(25), FG)
    text(ctx, arg, 214, y, F.mono(25), DIM)
    if (extra) text(ctx, extra, 214 + measure(ctx, arg, F.mono(25)) + 24, y, F.mono(25), col)
  }
  tool('Edit', 'src/usage/tokens.ts', '+84 −12', 530, '#e5a33a')
  tool('Bash', 'bun test', '18 pass', 578, '#3fb950')
  text(ctx, '拆分完成，测试全部通过。', 80, 650, F.reg(28), FG)
}

// ═══ 01 · OPEN ══════════════════════════════════════════════════════════════════════════════
export function open() {
  const { s, bg, layer } = glassShot(WORLD4.graphite)
  const motes = dust({ count: 300, box: [36, 22, 16], center: [0, 0, -6], color: '#9fb0ff', opacity: 0.35, seed: 4 })
  s.scene.add(motes)
  // the session behind
  const TW = 1700
  const TH = 720
  const tr = panel(TW, TH, { res: 1.4 })
  tr.userData.draw(0, ctx => {
    ctx.filter = 'blur(1.6px)'
    ctx.globalAlpha = 0.6
    drawTranscript(ctx, TW, TH)
  })
  tr.position.set(0.6, 2.4, -2.5)
  tr.renderOrder = 5
  s.scene.add(tr)
  // the input: glass, with the usage icon at its bottom right
  const IN = { w: 1600, h: 170, r: 44 }
  const inY = -2.95
  const inShadow = glassShadow(IN.w, IN.h, IN.r)
  inShadow.position.set(0, inY, -0.05)
  s.scene.add(inShadow)
  const input = glassShape({ w: IN.w, h: IN.h, r: IN.r, tintA: 0.42, frost: 0.85 })
  input.position.set(0, inY, 0)
  s.scene.add(input)
  const inFront = onGlass(IN.w, IN.h)
  inFront.position.set(0, inY, 0.01)
  s.scene.add(inFront)
  const ICON = [IN.w / 2 - 150, inY - 0.4] // world: x px from centre → units below
  const iconW = [(IN.w / 2 - 150) / UNIT, inY - 0.38, 0]
  // the popover morphs out of the icon
  const pop = glassShape({ w: 44, h: 44, r: 22, tintA: 0.5, frost: 0.95 })
  const popShadow = glassShadow(POP.w, POP.h, 34, { k: 0.6, spread: 50, dy: 30 })
  const popFront = onGlass(POP.w, 700)
  s.scene.add(popShadow, pop, popFront)
  const popHome = [iconW[0] + 0.6 - POP.w / 200, inY + IN.h / 200 + 0.3 + POP.h / 200, 0.02]

  const OPENS = [[1.05, 2.6], [3.0, 3.45], [3.85, 4.25], [5.35, 99]]
  const openness = t => {
    let v = 0
    for (const [a, b] of OPENS) v = Math.max(v, spring(prog(t, a, a + 0.5)) * (1 - E.inCubic(prog(t, b, b + 0.22))))
    return v
  }
  const missingAt = 6.5
  s.update = t => {
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    ;[input, pop].forEach(g => g.userData.tick(t))
    const blink = Math.floor(t * 2.4) % 2
    inFront.userData.draw(`${blink}`, ctx => {
      text(ctx, '继续说点什么…', 44, 70, F.reg(32), '#8f8b84')
      if (blink && t < 1.0) {
        ctx.fillStyle = BLUE
        ctx.fillRect(40, 40, 4, 40)
      }
      // the usage icon and the send button
      ring(ctx, IN.w - 150, 126, 15, 5, 0.4, '#9a978f')
      ctx.beginPath()
      ctx.arc(IN.w - 64, 126, 26, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(236,233,226,0.92)'
      ctx.fill()
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 3.4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(IN.w - 64, 136)
      ctx.lineTo(IN.w - 64, 116)
      ctx.moveTo(IN.w - 73, 125)
      ctx.lineTo(IN.w - 64, 116)
      ctx.lineTo(IN.w - 55, 125)
      ctx.stroke()
      text(ctx, 'Opus 5.5', 90, 136, F.reg(24), '#8f8b84')
    })
    // popover geometry
    const o = openness(t)
    const grow = tw(t, missingAt, missingAt + 0.35, E.outCubic) * 100
    const ph = POP.h + grow
    const w = lerp(44, POP.w, o)
    const h = lerp(44, ph, o)
    const cx = lerp(iconW[0], popHome[0], o)
    const cy = lerp(iconW[1], popHome[1] + grow / 200, o)
    pop.visible = o > 0.01
    pop.userData.set(w, h, lerp(22, 34, o))
    pop.position.set(cx, cy, 0.02)
    pop.userData.u.opacity.value = clamp(o * 3)
    popShadow.visible = o > 0.05
    popShadow.position.set(cx, cy, -0.04)
    popShadow.scale.set(w / POP.w, h / POP.h, 1)
    popShadow.material.opacity = o
    const content = clamp((o - 0.55) / 0.45)
    const hi = t >= 5.85 && t < 6.5 ? Math.min(3, Math.floor((t - 5.85) / 0.16)) : -1
    const miss = tw(t, missingAt + 0.15, missingAt + 0.4)
    popFront.visible = content > 0.01
    popFront.userData.draw(`${hi}${Math.round(miss * 20)}`, ctx => drawPopover(ctx, { hi, missing: miss }))
    popFront.position.set(cx, cy + (ph - 700) / 200 + (POP.h - ph) / 200 * 0, 0.03)
    popFront.position.set(cx, cy + (h / 2 - 350) / UNIT, 0.03)
    popFront.material.opacity = content
    popFront.scale.setScalar(lerp(0.96, 1, content))

    // the camera: close on the input, then wider for the popover, a jolt with each click
    const jolt = OPENS.reduce((m, [a]) => m + (t >= a ? Math.exp(-(t - a) * 9) : 0), 0)
    const pos = keys(t, [
      [0, [2.6, -3.4, D * 0.62]],
      [1.0, [4.4, -2.8, D * 0.66], E.inOutSine],
      [1.9, [1.2, -0.2, D * 1.02], E.inOutCubic],
      [2.9, [0.9, 0.0, D * 1.05], E.lin],
      [3.0, [2.2, -0.6, D * 0.9], E.outCubic],
      [3.85, [0.6, 0.4, D * 0.98], E.inOutCubic],
      [4.6, [0.2, 0.6, D * 1.12], E.inOutCubic],
      [5.35, [0.4, 0.4, D * 1.12], E.lin],
      [6.2, [0.1, 0.6, D * 1.0], E.inOutCubic],
      [7.3, [0.3, 0.8, D * 0.94], E.lin],
    ])
    const tgt = keys(t, [
      [0, [2.4, -2.95, 0]],
      [1.0, [4.6, -2.9, 0], E.inOutSine],
      [1.9, [0.8, -0.3, 0], E.inOutCubic],
      [3.0, [2.0, -0.6, 0], E.outCubic],
      [3.85, [0.4, 0.0, 0], E.inOutCubic],
      [4.6, [0.4, 0.2, 0], E.inOutCubic],
      [6.2, [0.3, 0.8, 0], E.inOutCubic],
    ])
    shoot(s.camera, t, pos, tgt, FOV, { drift: 0.05, shake: jolt * 0.03 })

    layer.draw(ctx => {
      // the pointer: to the icon, clicks, then down the rows
      const ic = toPx(s.camera, iconW)
      const rowsTop = toPx(s.camera, [popHome[0] - POP.w / 200 + 2.2, popHome[1] + POP.h / 200 - 0.7, 0])
      const rowsEnd = toPx(s.camera, [popHome[0] - POP.w / 200 + 2.2, popHome[1] - POP.h / 200 + 0.9, 0])
      let px = lerp(W + 80, ic[0], tw(t, 0.35, 0.95, E.inOutCubic))
      let py = lerp(H + 60, ic[1], tw(t, 0.35, 0.95, E.inOutCubic))
      if (t > 5.6) {
        const q = tw(t, 5.65, 6.45, E.inOutSine)
        const a = tw(t, 5.6, 5.85, E.inOutCubic)
        px = lerp(lerp(ic[0], rowsTop[0], a), rowsEnd[0], q)
        py = lerp(lerp(ic[1], rowsTop[1], a), rowsEnd[1], q)
      }
      const clicks = OPENS.map(([a]) => a).concat([2.55, 3.4, 4.2])
      const press = clicks.reduce((m, c) => Math.max(m, t >= c - 0.06 && t < c + 0.08 ? 1 : 0), 0)
      for (const c of clicks) {
        const rp = prog(t, c, c + 0.45)
        if (rp > 0 && rp < 1) {
          ctx.save()
          ctx.globalAlpha = (1 - rp) * 0.8
          ctx.strokeStyle = '#cfe0ff'
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(ic[0], ic[1], 8 + E.outCubic(rp) * 60, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }
      cursor(ctx, px, py, 1.1 * (1 - press * 0.12), tw(t, 0.35, 0.5) * (1 - tw(t, 6.8, 7.0)))
      // a soft shade behind the words
      const sh = tw(t, 1.4, 1.8) * (1 - tw(t, 6.9, 7.1))
      if (sh > 0) {
        ctx.save()
        ctx.translate(430, 250)
        ctx.scale(2.3, 1)
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 300)
        g.addColorStop(0, `rgba(6,7,14,${0.72 * sh})`)
        g.addColorStop(0.55, `rgba(6,7,14,${0.5 * sh})`)
        g.addColorStop(1, 'rgba(6,7,14,0)')
        ctx.fillStyle = g
        ctx.fillRect(-300, -300, 600, 600)
        ctx.restore()
      }
      // the words
      const L = 150
      kin(ctx, '想看一眼用量，', L, 210, F.bold(84), t, { t0: 1.45, t1: 2.75, align: 'left', stagger: 0.04 })
      kin(ctx, '就得点开一次。', L, 320, F.bold(84), t, { t0: 1.95, t1: 2.75, align: 'left', stagger: 0.04, accent: [3, 5, ACCENT.blue] })
      kin(ctx, '点开，关上。', L, 210, F.bold(84), t, { t0: 3.0, t1: 4.45, align: 'left', stagger: 0.04 })
      kin(ctx, '再点开，再关上。', L, 320, F.bold(84), t, { t0: 3.85, t1: 4.45, align: 'left', stagger: 0.04 })
      kin(ctx, '每一次查看，', L, 210, F.bold(84), t, { t0: 4.55, t1: 5.5, align: 'left', stagger: 0.04 })
      kin(ctx, '都是一次打断。', L, 320, F.bold(84), t, { t0: 4.8, t1: 5.5, align: 'left', stagger: 0.04, accent: [4, 6, ['#ffc2b0', '#ff6b57']] })
      kin(ctx, '可缓存还剩多久？', L, 210, F.bold(84), t, { t0: 5.6, t1: 6.95, align: 'left', stagger: 0.04, accent: [1, 3, ACCENT.blue] })
      kin(ctx, '这里，找不到。', L, 320, F.bold(84), t, { t0: 6.6, t1: 6.95, align: 'left', stagger: 0.04, accent: [3, 6, ['#ffc2b0', '#ff6b57']] })
    })
  }
  return s
}

// ═══ 02 · WHY — what a cache hit is worth, and what a lapse costs ═══════════════════════════════
export function why() {
  const { s, bg, layer } = glassShot(WORLD4.why)
  const motes = dust({ count: 300, box: [36, 22, 16], center: [0, 0, -6], color: '#9fb0ff', opacity: 0.35, seed: 7 })
  s.scene.add(motes)
  // two glass capsules over two liquids
  const BW = 1150
  const BH = 104
  const bars = [
    { y: -1.0, frac: 0.1, col: '#4e8ff7', name: '命中缓存', val: '× 0.1', tok: '≈ 39.9k' },
    { y: -2.45, frac: 1.0, col: '#ff6b4a', name: '未命中', val: '× 1.0', tok: '398.8k' },
  ]
  const X = 2.2
  bars.forEach(b => {
    b.liquid = panel(BW, BH, { res: 1, intensity: 1.25 })
    b.liquid.position.set(X, b.y, -0.02)
    b.liquid.renderOrder = 6
    b.glass = glassShape({ w: BW, h: BH, r: BH / 2, tintA: 0.22, frost: 0.35 })
    b.glass.position.set(X, b.y, 0)
    b.shadow = glassShadow(BW, BH, BH / 2)
    b.shadow.position.set(X, b.y, -0.05)
    b.front = onGlass(BW, BH)
    b.front.position.set(X, b.y, 0.01)
    s.scene.add(b.shadow, b.liquid, b.glass, b.front)
  })
  // the clock: a glass disc over a ring
  const DS = 520
  const disc = glassShape({ w: DS, h: DS, r: DS / 2, tintA: 0.3, frost: 0.7 })
  disc.position.set(4.3, -0.5, 0)
  const discShadow = glassShadow(DS, DS, DS / 2)
  discShadow.position.set(4.3, -0.5, -0.05)
  const halo = panel(820, 820, { res: 0.8, intensity: 1.4, blending: THREE.AdditiveBlending })
  halo.position.set(4.3, -0.5, -0.03)
  halo.renderOrder = 7
  const discFront = onGlass(820, 820)
  discFront.position.set(4.3, -0.5, 0.01)
  s.scene.add(discShadow, halo, disc, discFront)
  const wave = shockwave('#ff9a85', 2.4)
  wave.position.set(4.3, -0.5, 0.05)
  onLayer(wave, FRONT)
  s.scene.add(wave)

  s.update = t => {
    const danger = tw(t, 10.5, 10.9) * (1 - tw(t, 12.2, 12.6))
    const world = danger > 0.5 ? WORLD4.danger : WORLD4.why
    bg.userData.set(world.blobs, world.base)
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    // act a: the two bars
    const aOn = tw(t, 7.15, 7.6) * (1 - tw(t, 9.05, 9.35))
    bars.forEach((b, i) => {
      b.glass.userData.tick(t)
      const f = b.frac * tw(t, 8.0 + i * 0.25, 8.9 + i * 0.25, E.outCubic)
      ;[b.liquid, b.glass, b.shadow, b.front].forEach(m => (m.visible = aOn > 0.01))
      b.glass.userData.u.opacity.value = aOn
      b.front.material.opacity = aOn
      b.shadow.material.opacity = aOn
      b.liquid.material.opacity = aOn
      b.liquid.userData.draw(Math.round(f * 300), ctx => {
        const lw = Math.max(BH - 24, (BW - 24) * f)
        const g = ctx.createLinearGradient(12, 0, 12 + lw, 0)
        g.addColorStop(0, b.col)
        g.addColorStop(1, '#ffffff')
        ctx.shadowColor = b.col
        ctx.shadowBlur = 24
        roundRectPath(ctx, 12, 12, lw, BH - 24, (BH - 24) / 2)
        ctx.fillStyle = g
        ctx.globalAlpha = f > 0 ? 0.9 : 0
        ctx.fill()
      })
      b.front.userData.draw(Math.round(f * 300), ctx => {
        text(ctx, b.name, 44, BH / 2 + 12, F.bold(36), '#ffffff')
        text(ctx, `${b.tok}  ${b.val}`, BW - 44, BH / 2 + 12, F.monoB(32), '#ffffff', { align: 'right', alpha: tw(t, 8.6 + i * 0.25, 9.0 + i * 0.25) })
      })
      b.glass.position.y = b.liquid.position.y = b.front.position.y = b.y + (1 - tw(t, 7.15 + i * 0.12, 7.75 + i * 0.12, E.outCubic)) * -0.8
    })
    // act b: the clock that runs out
    const bOn = tw(t, 9.35, 9.75) * (1 - tw(t, 12.15, 12.45))
    const elapsed = lerp(0, 3680, E.inOutCubic(prog(t, 9.6, 10.6)))
    const left = Math.max(0, 3600 - elapsed)
    const expired = left <= 0
    const col = expired ? RED : left < 600 ? AMBER : BLUE
    ;[disc, discShadow, halo, discFront].forEach(m => (m.visible = bOn > 0.01))
    disc.userData.tick(t)
    disc.userData.u.opacity.value = bOn
    discShadow.material.opacity = bOn
    discFront.material.opacity = bOn
    halo.material.opacity = bOn
    const scale = lerp(0.7, 1, tw(t, 9.35, 9.9, E.outBack))
    ;[disc, discShadow, halo, discFront].forEach(m => m.scale.setScalar(1))
    disc.userData.set(DS * scale, DS * scale, (DS * scale) / 2)
    halo.scale.setScalar(scale)
    discFront.scale.setScalar(scale)
    halo.userData.draw(`${Math.round(left / 20)}${col}`, ctx => {
      const c = 410
      ctx.lineWidth = 26
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.beginPath()
      ctx.arc(c, c, 330, 0, Math.PI * 2)
      ctx.stroke()
      const f = left / 3600
      if (f > 0) {
        ctx.lineCap = 'round'
        ctx.shadowColor = col
        ctx.shadowBlur = 40
        ctx.strokeStyle = col
        ctx.beginPath()
        ctx.arc(c, c, 330, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f)
        ctx.stroke()
      } else {
        ctx.shadowColor = RED
        ctx.shadowBlur = 40
        ctx.strokeStyle = rgba(RED, 0.7)
        ctx.beginPath()
        ctx.arc(c, c, 330, 0, Math.PI * 2)
        ctx.stroke()
      }
    })
    const tokens = Math.round(398800 * E.outCubic(prog(t, 11.15, 11.9)))
    discFront.userData.draw(`${Math.round(left)}${tokens}`, ctx => {
      const c = 410
      text(ctx, expired ? '已过期' : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`, c, c + 30, expired ? F.bold(96) : F.monoB(104), expired ? RED : FG, { align: 'center' })
      text(ctx, expired ? 'PROMPT CACHE · EXPIRED' : 'PROMPT CACHE · TIME LEFT', c, c - 70, F.mono(20), DIM, { align: 'center', tracking: 2 })
      if (tokens > 0) text(ctx, `${tokens.toLocaleString('en-US')} tokens · 全价`, c, c + 100, F.monoB(30), '#ff9a85', { align: 'center' })
    })
    wave.userData.at(t, 10.55, 5.5, 0.7)
    const pos = keys(t, [[7.0, [0.6, -0.4, D * 1.08]], [9.2, [1.4, -0.8, D * 0.98], E.inOutSine], [9.4, [1.8, -0.2, D * 1.02], E.outCubic], [12.2, [2.4, -0.4, D * 0.92], E.inOutSine], [14.3, [0, 0, D * 0.82], E.inOutCubic]])
    const tgt = keys(t, [[7.0, [0.8, -0.6, 0]], [9.2, [1.4, -1.0, 0], E.inOutSine], [9.4, [2.0, -0.4, 0], E.outCubic], [12.2, [2.4, -0.5, 0]], [14.3, [0, 0, 0], E.inOutCubic]])
    shoot(s.camera, t, pos, tgt, FOV, { drift: 0.05, shake: t >= 10.55 ? Math.exp(-(t - 10.55) * 7) * 0.06 : 0 })
    layer.draw(ctx => {
      const L = 150
      kin(ctx, '命中缓存，', L, 250, F.bold(96), t, { t0: 7.25, t1: 9.1, align: 'left', stagger: 0.05 })
      kin(ctx, '重读上下文，只要约一成。', L, 370, F.bold(68), t, { t0: 7.6, t1: 9.1, align: 'left', stagger: 0.035, accent: [8, 11, ACCENT.blue] })
      kin(ctx, 'Anthropic API 定价：缓存读取 = 输入价 × 0.1', L + 2, 440, F.mono(24), t, { t0: 7.95, t1: 9.1, align: 'left', style: 'type', stagger: 0.012, color: rgba(FG, 0.55) })
      kin(ctx, '离开一会儿，', L, 330, F.bold(84), t, { t0: 9.45, t1: 12.2, align: 'left', stagger: 0.04 })
      kin(ctx, '缓存悄悄过期，', L, 450, F.bold(84), t, { t0: 10.5, t1: 12.2, align: 'left', stagger: 0.04, accent: [4, 6, ['#ffc2b0', '#ff6b57']] })
      kin(ctx, '下一句，全价重读。', L, 570, F.bold(84), t, { t0: 11.15, t1: 12.2, align: 'left', stagger: 0.04, accent: [4, 6, ['#ffc2b0', '#ff6b57']] })
      kin(ctx, '如果，你知道它还剩多久？', W / 2, 590, F.bold(104), t, { t0: 12.45, style: 'type', stagger: 0.075, caret: 'blink', accent: [3, 11, ['#cfe4ff', '#4e8ff7'], '#7fb2ff'] })
      const g = tw(t, 13.7, 14.0, E.inCubic)
      if (g > 0) {
        const grd = ctx.createRadialGradient(W / 2 + 640, 560, 0, W / 2 + 640, 560, 1000 * g)
        grd.addColorStop(0, `rgba(210,230,255,${g})`)
        grd.addColorStop(1, 'rgba(210,230,255,0)')
        ctx.fillStyle = grd
        ctx.fillRect(0, 0, W, H)
      }
    })
  }
  return s
}
