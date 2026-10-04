// Act one: the problem, the questions, the answer.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, makeShot, prog, rng, tw } from './engine.js'
import { dist, dust, glass, ground, kin, panel, roundRectPath, shockwave, shoot, sparks, streaks, toPx, typeLayer } from './kit.js'
import {
  ACCENT, BLUE, DIM, F, FAINT, FG, ROW, WIN, WORLD, rgba, ring, rowItemPanels, rowItems, rowLayout, text,
  windowBase, windowPrompt, windowTalk, wx, wy,
} from './common.js'

const FOV = 35
const D = dist(FOV)

// ═══ 01 · OPEN — every glance at your budget is a command you have to type ══════════════════
export function open() {
  const s = makeShot()
  const bg = ground(s.scene, WORLD.open)
  const layer = typeLayer(s.scene)
  const motes = dust({ count: 420, box: [40, 24, 20], center: [0, 0, -6], color: '#8fa2ff', opacity: 0.4, seed: 4 })
  s.scene.add(motes)

  // the far wall: a session, out of focus
  const far = panel(2600, 1500, { res: 0.5 })
  far.position.set(0, 0, -10)
  far.renderOrder = 1
  far.userData.draw(0, ctx => {
    ctx.filter = 'blur(4px)'
    const r = rng(17)
    for (let i = 0; i < 26; i++) {
      const y = 80 + i * 54
      const x = 100 + r() * 300
      ctx.fillStyle = rgba(i % 5 === 0 ? '#7c8cff' : '#ffffff', 0.08 + r() * 0.08)
      roundRectPath(ctx, x, y, 300 + r() * 1400, 20, 10)
      ctx.fill()
    }
  })
  s.scene.add(far)

  // the input
  const BAR = { w: 1500, h: 150 }
  const bar = panel(BAR.w, BAR.h, { res: 2.5 })
  bar.position.set(0, -0.6, 0)
  bar.renderOrder = 5
  s.scene.add(bar)
  const TX = 92 // text start inside the bar
  const CH = 38.4 // mono 64 advance
  const typing = [
    ['/usage', 0.55, 0.075, 1.3],
    ['/context', 1.62, 0.065, 2.25],
  ]
  const typedAt = t => {
    for (const [str, a, st, enter] of typing) if (t >= a - 0.2 && t < enter) return { str, n: Math.min(str.length, Math.max(0, Math.floor((t - a) / st) + 1)), a }
    return { str: '', n: 0, a: 0 }
  }
  const drawBar = t => {
    const { str, n } = typedAt(t)
    const blink = n === 0 || n === str.length ? Math.floor(t * 2.4) % 2 === 0 : true
    bar.userData.draw(`${n}${str}${blink}`, ctx => {
      glass(ctx, 6, 6, BAR.w - 12, BAR.h - 12, 34, { base: 'rgba(14,14,22,0.85)', fill: 0.06, border: 0.2, shadow: 0 })
      text(ctx, '›', 44, 98, F.monoB(54), rgba('#9aa8ff', 0.8))
      text(ctx, str.slice(0, n), TX, 98, F.mono(64), FG)
      if (blink) {
        ctx.fillStyle = BLUE
        roundRectPath(ctx, TX + n * CH + 6, 44, 7, 66, 3.5)
        ctx.fill()
      }
    })
  }

  // the autocomplete menu under the first command
  const menu = panel(700, 250, { res: 2 })
  menu.renderOrder = 6
  s.scene.add(menu)
  menu.userData.draw(0, ctx => {
    glass(ctx, 4, 4, 692, 242, 22, { base: 'rgba(18,18,28,0.95)', fill: 0.05, border: 0.18, shadow: 0 })
    const rows = [['/usage', '用量与重置时间'], ['/context', '上下文占用'], ['/status', '会话状态']]
    rows.forEach(([c, d], i) => {
      const y = 30 + i * 70
      if (i === 0) {
        roundRectPath(ctx, 14, y - 4, 672, 62, 14)
        ctx.fillStyle = 'rgba(78,143,247,0.22)'
        ctx.fill()
      }
      text(ctx, c, 40, y + 38, F.monoB(30), i === 0 ? '#cfe0ff' : FG)
      text(ctx, d, 250, y + 37, F.reg(26), DIM)
    })
  })

  // the answers you had to ask for
  const card = (w, h, draw) => {
    const p = panel(w, h, { res: 2 })
    p.renderOrder = 4
    p.userData.draw(0, ctx => {
      glass(ctx, 4, 4, w - 8, h - 8, 24, { base: 'rgba(16,16,24,0.94)', fill: 0.05, border: 0.18, shadow: 0 })
      draw(ctx)
    })
    s.scene.add(p)
    return p
  }
  const bar2 = (ctx, x, y, w, f, col) => {
    roundRectPath(ctx, x, y, w, 14, 7)
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fill()
    roundRectPath(ctx, x, y, Math.max(14, w * f), 14, 7)
    ctx.fillStyle = col
    ctx.fill()
  }
  const usage = card(880, 330, ctx => {
    text(ctx, '/usage', 36, 62, F.monoB(30), '#cfe0ff')
    text(ctx, 'Current session', 36, 124, F.mono(25), FG)
    text(ctx, '13% used · resets 2h54m', 844, 124, F.mono(23), DIM, { align: 'right' })
    bar2(ctx, 36, 144, 808, 0.13, BLUE)
    text(ctx, 'Current week (all models)', 36, 222, F.mono(25), FG)
    text(ctx, '63% used · resets 4d5h', 844, 222, F.mono(23), DIM, { align: 'right' })
    bar2(ctx, 36, 242, 808, 0.63, BLUE)
  })
  const contextCard = card(760, 400, ctx => {
    text(ctx, '/context', 36, 62, F.monoB(30), '#cfe0ff')
    const cols = 20
    for (let i = 0; i < 100; i++) {
      const x = 36 + (i % cols) * 34
      const y = 96 + Math.floor(i / cols) * 34
      ctx.fillStyle = i < 25 ? ['#4e8ff7', '#8b5cf6', '#14b8a6'][i % 3] : 'rgba(255,255,255,0.1)'
      roundRectPath(ctx, x, y, 24, 24, 5)
      ctx.fill()
    }
    text(ctx, '52k / 200k tokens · 25%', 36, 300 + 60, F.mono(25), DIM)
  })
  const CLUTTER = [
    ['/status', ['model   opus', 'session 1h12m', 'cwd     ~/api-server']],
    ['/cost', ['input   1.2M', 'output  84k', 'cache   0.9M']],
    ['/usage', ['session 13%', 'week    63%']],
    ['/context', ['messages 41k', 'tools    9k', 'free     148k']],
    ['/status', ['plan    max', 'reset   2h54m']],
    ['/usage', ['resets  4d5h', 'opus    63%']],
  ]
  const r = rng(5)
  const clutter = CLUTTER.map(([h, lines], i) => {
    const w = 520 + r() * 160
    const p = card(w, 120 + lines.length * 46, ctx => {
      text(ctx, h, 30, 52, F.monoB(26), '#cfe0ff')
      lines.forEach((l, k) => text(ctx, l, 30, 104 + k * 44, F.mono(24), DIM))
    })
    const a = (i / CLUTTER.length) * Math.PI * 2 + 0.4
    p.userData.home = [Math.cos(a) * (7.5 + r() * 2.5), Math.sin(a) * (4.2 + r() * 1.5) + 0.3, -1.5 - r() * 4]
    p.userData.rot = (r() - 0.5) * 0.5
    p.userData.at = 2.55 + i * 0.08
    return p
  })

  const caretX = t => {
    const { n } = typedAt(t)
    return -BAR.w / 200 + (TX + n * CH) / 100
  }

  s.update = t => {
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    drawBar(t)
    // menu
    const mp = tw(t, 0.82, 1.02, E.outBack) * (1 - tw(t, 1.28, 1.4, E.inCubic))
    menu.visible = mp > 0.01
    menu.scale.setScalar(lerp(0.92, 1, mp))
    menu.material.opacity = clamp(mp)
    menu.position.set(-BAR.w / 200 + 0.6 + 3.5, -0.6 - 0.75 - 1.25 - (1 - mp) * 0.2, 0.05)
    // the answers spring up out of the bar
    const pop = (p, t0, home) => {
      const q = tw(t, t0, t0 + 0.55, E.outBack)
      p.visible = t >= t0
      const from = [-2, -0.6, 0]
      p.position.set(lerp(from[0], home[0], q), lerp(from[1], home[1], q), lerp(-0.2, home[2], q))
      p.scale.setScalar(lerp(0.4, 1, tw(t, t0, t0 + 0.4, E.outCubic)))
      p.material.opacity = clamp((t - t0) * 6)
    }
    pop(usage, 1.32, [-3.6, 2.4, -0.4])
    pop(contextCard, 2.28, [4.0, 2.3, -0.8])
    for (const p of clutter) {
      const q = tw(t, p.userData.at, p.userData.at + 0.6, E.outExpo)
      p.visible = t >= p.userData.at
      const h = p.userData.home
      p.position.set(h[0], h[1], lerp(-30, h[2], q))
      p.rotation.z = p.userData.rot * (1 - q) * 2 + p.userData.rot * 0.1
      p.material.opacity = clamp((t - p.userData.at) * 5) * lerp(1, 0.7, tw(t, 3.0, 3.6))
    }
    // camera: ride the caret, then pull out on the mess
    const cx = caretX(Math.min(t, 2.25))
    const follow = [cx * 0.85 - 0.8, -1.15, D * 0.52]
    const pos = keys(t, [[0, follow], [2.3, follow], [3.2, [0.6, 0.4, D * 1.05], E.inOutCubic], [4.75, [0.2, 0.6, D * 1.16], E.lin]])
    const tgt = keys(t, [[0, [cx * 0.85 - 0.6, -1.3, 0]], [2.3, [cx * 0.85 - 0.6, -1.3, 0]], [3.2, [0.3, 0.4, -1], E.inOutCubic], [4.75, [0.2, 0.5, -1]]])
    // until the pull-out, follow the caret smoothly instead of keyframing it
    if (t < 2.3) {
      const sm = x => {
        let acc = 0
        let wsum = 0
        for (let k = 0; k < 9; k++) {
          const tt = Math.max(0, x - k * 0.06)
          const w = Math.exp(-k * 0.35)
          acc += caretX(Math.min(tt, 2.25)) * w
          wsum += w
        }
        return acc / wsum
      }
      const c = sm(t)
      pos[0] = c * 0.85 - 0.8
      tgt[0] = c * 0.85 - 0.6
    }
    shoot(s.camera, t, pos, tgt, FOV, { drift: 0.06, roll: lerp(-2.5, 0, tw(t, 0, 2.4)) })
    // the line that names the problem
    layer.draw(ctx => {
      if (t < 2.9) return false
      ctx.fillStyle = `rgba(4,4,10,${0.55 * tw(t, 2.9, 3.4)})`
      ctx.fillRect(0, 0, W, H)
      kin(ctx, '每次想看一眼余量，', W / 2, 500, F.bold(104), t, { t0: 3.0, t1: 4.42, stagger: 0.04 })
      kin(ctx, '都得打断自己。', W / 2, 650, F.bold(104), t, { t0: 3.5, t1: 4.42, stagger: 0.05, accent: [2, 6, ['#ffc2b0', '#ff6b57']] })
    })
  }
  return s
}

// ═══ 02 · QUESTIONS — four questions, one on each half beat ═════════════════════════════════
const QS = [
  [4.55, '缓存还剩几分？', [4, 6], 'cache', 'PROMPT CACHE'],
  [5.15, '额度还够不够？', [4, 7], 'five', '5-HOUR LIMIT'],
  [5.75, '什么时候重置？', [4, 6], 'seven', 'RESETS'],
  [6.35, '上下文满了吗？', [3, 6], 'context', 'CONTEXT WINDOW'],
]
export function questions() {
  const s = makeShot()
  const bg = ground(s.scene, WORLD.open)
  const layer = typeLayer(s.scene)
  const halo = (() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }))
    return m
  })()
  aimCam(s.camera)
  s.update = t => {
    const q = [...QS].reverse().find(([a]) => t >= a)
    const world = q && t < 7.0 ? WORLD[q[3]] : WORLD.open
    bg.userData.set(world.blobs, world.base)
    bg.userData.tick(t, 1)
    shoot(s.camera, t, [0, 0, D * lerp(1.0, 0.94, prog(t, 4.5, 8.2))], [0, 0, 0], FOV, { drift: 0.04 })
    layer.draw(ctx => {
      for (const [a, str, acc, ch, kick] of QS) {
        if (t < a || t > a + 0.75) continue
        const [c0, c1] = ACCENT[ch]
        const p = tw(t, a, a + 0.45, E.outExpo)
        const out = tw(t, a + 0.5, a + 0.6, E.inCubic)
        // a ring sweeps behind each question in its chapter's colour
        ctx.save()
        ctx.globalAlpha = (1 - out) * 0.9
        ctx.shadowColor = c1
        ctx.shadowBlur = 40
        ring(ctx, W / 2, 540, 330 + p * 20, 10, p * 0.86, c1)
        ctx.restore()
        kin(ctx, kick, W / 2, 400, F.mono(26), t, { t0: a, t1: a + 0.5, style: 'type', stagger: 0.012, color: c0, outDur: 0.12 })
        kin(ctx, str, W / 2, 600, F.bold(150), t, { t0: a, t1: a + 0.5, style: 'drop', stagger: 0.028, dur: 0.42, outDur: 0.12, accent: [...acc, [c0, c1]] })
      }
      if (t >= 6.95) {
        kin(ctx, '如果，一眼就能看到？', W / 2, 600, F.bold(128), t, {
          t0: 7.0, style: 'type', stagger: 0.07, caret: 'blink', accent: [3, 9, ['#cfe4ff', '#4e8ff7'], '#7fb2ff'],
        })
        // the caret gathers light before the drop
        const g = tw(t, 7.7, 8.0, E.inCubic)
        if (g > 0) {
          const grd = ctx.createRadialGradient(W / 2 + 560, 560, 0, W / 2 + 560, 560, 900 * g)
          grd.addColorStop(0, `rgba(200,225,255,${g})`)
          grd.addColorStop(1, 'rgba(200,225,255,0)')
          ctx.fillStyle = grd
          ctx.fillRect(0, 0, W, H)
        }
      }
    })
  }
  return s
}
function aimCam(camera) {
  camera.position.set(0, 0, D)
  camera.lookAt(0, 0, 0)
}

// ═══ 03 · REVEAL — the four rings arrive, line up, and land above the prompt ═══════════════════
export function buildWindow(scene, { wires = true } = {}) {
  const group = new THREE.Group()
  scene.add(group)
  const base = panel(WIN.w, WIN.h, { res: 1.5 })
  base.userData.draw(0, ctx => windowBase(ctx, WIN.w, WIN.h))
  const talk = panel(WIN.w, 560, { res: 1.5 })
  talk.userData.draw(0, ctx => windowTalk(ctx, WIN.w))
  talk.position.set(0, wy(66 + 280), 0)
  const prompt = panel(1472, 170, { res: 2 })
  prompt.userData.draw(0, ctx => windowPrompt(ctx, 1472))
  prompt.position.set(wx(64 + 736), wy(680 + 85), 0)
  base.renderOrder = 20
  talk.renderOrder = 21
  prompt.renderOrder = 21
  group.add(base, talk, prompt)
  // neon outlines of the same three layers
  const wire = (w, h, r, k) => {
    const p = panel(w, h, { res: 1, intensity: 2.2, blending: THREE.AdditiveBlending })
    p.userData.draw(0, ctx => {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#5ad1ff')
      g.addColorStop(0.5, '#7c6cff')
      g.addColorStop(1, '#e05cff')
      ctx.strokeStyle = g
      ctx.lineWidth = 3
      ctx.shadowColor = '#7c6cff'
      ctx.shadowBlur = 18
      roundRectPath(ctx, 6, 6, w - 12, h - 12, r)
      ctx.stroke()
      ctx.globalAlpha = 0.25
      for (let i = 1; i < k; i++) {
        ctx.beginPath()
        ctx.moveTo(40, (h / k) * i)
        ctx.lineTo(w - 40 - (i % 3) * 120, (h / k) * i)
        ctx.stroke()
      }
    })
    p.renderOrder = 30
    group.add(p)
    return p
  }
  const wBase = wires ? wire(WIN.w, WIN.h, 30, 2) : null
  const wTalk = wires ? wire(WIN.w - 120, 480, 20, 6) : null
  const wPrompt = wires ? wire(1472, 170, 24, 1) : null
  if (wTalk) wTalk.position.copy(talk.position)
  if (wPrompt) wPrompt.position.copy(prompt.position)
  return { group, base, talk, prompt, wBase, wTalk, wPrompt }
}

export function reveal() {
  const s = makeShot()
  const bg = ground(s.scene, WORLD.finale)
  const layer = typeLayer(s.scene)
  const motes = dust({ count: 500, box: [40, 24, 30], center: [0, 0, -8], color: '#9ab8ff', opacity: 0.45, seed: 8 })
  s.scene.add(motes)
  const lines = streaks({ count: 1100, radius: [2.2, 22], depth: 140, len: 3, intensity: 2.4 })
  s.scene.add(lines)
  const wave = shockwave('#a9c8ff', 3)
  s.scene.add(wave)
  const spark = sparks({ count: 220, color: '#bcd6ff', speed: [3, 14], intensity: 3.5 })
  s.scene.add(spark)
  const win = buildWindow(s.scene)

  // the row, one plane per item, in window coordinates
  const lay0 = rowLayout(document.createElement('canvas').getContext('2d'), rowItems({ cacheLeft: 3600 }), 'full', ROW.size)
  const rowW = lay0[3].x + lay0[3].w
  const items = rowItemPanels(rowItems({ cacheLeft: 3600 }), ROW.size, 4)
  items.forEach(p => {
    p.renderOrder = 40
    s.scene.add(p)
  })
  const home = i => [wx(ROW.x + items[i].userData.cx), wy(ROW.y), 0]
  const rowC = [wx(ROW.x + rowW / 2), wy(ROW.y), 0]
  const lands = [8.15, 8.4, 8.65, 8.9]
  const landWaves = lands.map(() => {
    const w = shockwave('#cfe0ff', 2.2)
    s.scene.add(w)
    return w
  })
  s.cacheCenter = () => {
    const [x, y] = toPx(s.camera, [wx(ROW.x + lay0[0].ringX), wy(ROW.y), 0])
    return [x / W, 1 - y / H]
  }

  s.update = t => {
    bg.userData.tick(t, lerp(0.6, 1, tw(t, 8, 9)))
    motes.userData.tick(t, s.camera)
    // hyperspace, decelerating
    const u = lines.userData.u
    const dt = Math.max(0, t - 7.9)
    u.travel.value = (140 / 2.6) * (1 - Math.exp(-2.6 * dt)) + 3 * dt
    u.stretch.value = 1 + 5 * Math.exp(-2.6 * dt)
    u.opacity.value = 1 - tw(t, 8.7, 9.4)
    u.camZ.value = s.camera.position.z
    lines.visible = t < 9.4
    lines.position.set(rowC[0], rowC[1], 0)
    wave.position.set(rowC[0], rowC[1], 0.1)
    wave.userData.at(t, 8.0, 9, 0.9)
    spark.position.set(rowC[0], rowC[1], 0)
    spark.userData.at(t, 8.0, s.camera, 1.3)

    // the four rings fly in from far away, one on each beat, and count up
    items.forEach((p, i) => {
      const a = lands[i]
      const q = tw(t, a - 0.42, a, E.outExpo)
      const h = home(i)
      p.visible = t >= a - 0.42
      p.position.set(lerp(h[0] + (i - 1.5) * 3, h[0], q), lerp(h[1] + 1.5, h[1], q), lerp(-60, 0, q))
      p.material.opacity = clamp((t - a + 0.42) * 4)
      const c = tw(t, a, a + 0.7, E.outCubic)
      const it = rowItems({
        cacheLeft: t < 9.6 ? 3600 : 3600 - Math.floor(t - 9.6),
        five: 13 * c,
        seven: 63 * c,
        ctx: 25 * c,
      })[i]
      if (i === 0) it.frac = c
      p.userData.redraw(`${it.value}${it.frac.toFixed(3)}`, it, { glow: 10 })
      landWaves[i].position.set(h[0] - items[i].userData.lay.w / 200 + 0.3, h[1], 0.05)
      landWaves[i].userData.at(t, a, 1.2, 0.5)
    })

    // the window builds itself around the row
    const wp = tw(t, 10.45, 11.25, E.outCubic)
    const solid = tw(t, 10.95, 11.35)
    win.group.visible = t >= 10.4
    win.base.material.opacity = solid
    win.talk.material.opacity = solid
    win.prompt.material.opacity = solid
    win.base.position.z = lerp(-5, 0, wp)
    win.talk.position.z = lerp(-2.5, 0, wp)
    win.prompt.position.z = lerp(2.5, 0, wp)
    const wireA = tw(t, 10.45, 10.7) * (1 - tw(t, 11.25, 11.7))
    for (const [w, z] of [[win.wBase, win.base.position.z], [win.wTalk, win.talk.position.z], [win.wPrompt, win.prompt.position.z]]) {
      w.material.opacity = wireA
      w.position.z = z + 0.01
    }

    // camera: close on the row, then the pull-back that reveals where it lives
    const close = [rowC[0], rowC[1], D * 0.7]
    const pos = keys(t, [
      [7.9, [rowC[0], rowC[1], D * 0.5]],
      [9.0, close, E.outCubic],
      [10.45, [rowC[0] + 0.3, rowC[1] - 0.1, D * 0.74], E.lin],
      [11.1, [rowC[0] - 4.2, rowC[1] - 4.6, D * 1.05], E.inOutCubic],
      [11.9, [0.4, 0.2, D * 1.32], E.outCubic],
      [12.5, [0.2, -0.3, D * 1.16], E.inCubic],
    ])
    const tgt = keys(t, [
      [9.0, rowC],
      [10.45, rowC],
      [11.1, [rowC[0] * 0.5, -0.6, 0], E.inOutCubic],
      [11.9, [0.2, 0.42, 0], E.outCubic],
      [12.5, [wx(ROW.x + lay0[0].ringX) * 0.5, -0.8, 0], E.inCubic],
    ])
    shoot(s.camera, t, pos, tgt, FOV, { drift: 0.05, shake: Math.exp(-Math.max(0, t - 8) * 6) * 0.08 })

    layer.draw(ctx => {
      let drew = false
      if (t >= 9.3 && t < 10.6) {
        kin(ctx, 'usage-line', W / 2, 300, F.monoB(128), t, { t0: 9.3, t1: 10.4, style: 'type', stagger: 0.045, caret: 'blink', accent: [0, 10, ['#ffffff', '#ffffff'], '#7fb2ff'] })
        kin(ctx, '一行，全看清。', W / 2, 830, F.bold(76), t, { t0: 9.75, t1: 10.4, stagger: 0.05, accent: [3, 6, ACCENT.blue] })
        drew = true
      }
      if (t >= 11.5) {
        kin(ctx, '就在输入框上方。', W / 2, 118, F.bold(68), t, { t0: 11.55, t1: 12.35, stagger: 0.05, accent: [2, 7, ACCENT.blue] })
        drew = true
      }
      return drew
    })
  }
  return s
}
