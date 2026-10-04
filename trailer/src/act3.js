// Act three: anywhere you work, two commands to install, and the point of it all.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, makeShot, prog, tw } from './engine.js'
import { cursor, dist, dust, glass, glow, ground, kin, panel, roundRectPath, shockwave, shoot, sparks, streaks, typeLayer } from './kit.js'
import {
  ACCENT, BLUE, DIM, F, FAINT, FG, ROW, WORLD, measure, rgba, ring, rowItems, terminalRow, text,
  windowBase, windowPrompt, windowTalk,
} from './common.js'
import { check, drawRow } from './ui.js'

const FOV = 35
const D = dist(FOV)
const INK = '#141413'

// ═══ 08 · ADAPT — narrow the window, then turn it round to the terminal ═══════════════════════
export function adapt() {
  const s = makeShot()
  const bg = ground(s.scene, WORLD.light)
  const layer = typeLayer(s.scene)
  const group = new THREE.Group()
  group.position.set(0, -0.55, 0)
  s.scene.add(group)
  const PW = 1640
  const PH = 1040
  const front = panel(PW, PH, { res: 1.4, side: THREE.FrontSide })
  const back = panel(PW, PH, { res: 1.4, side: THREE.FrontSide })
  back.rotation.y = Math.PI
  front.renderOrder = 20
  back.renderOrder = 20
  group.add(front, back)
  const shadow = panel(1900, 600, { res: 0.5 })
  shadow.userData.draw(0, ctx => {
    const g = ctx.createRadialGradient(950, 300, 0, 950, 300, 900)
    g.addColorStop(0, 'rgba(40,40,70,0.32)')
    g.addColorStop(1, 'rgba(40,40,70,0)')
    ctx.setTransform(1, 0, 0, 0.33, 0, 200)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1900, 1800)
  })

  const widthAt = t => keys(t, [[31.5, 1600], [32.35, 1180, E.inOutCubic], [33.2, 780, E.inOutCubic]])
  const modeOf = w => (w >= 1300 ? 'full' : w >= 950 ? 'short' : 'none')
  const items = rowItems({ cacheLeft: 3480, five: 9, fiveReset: 248, seven: 67, sevenReset: 4620, ctx: 40 })
  s.update = t => {
    bg.userData.tick(t)
    const w = Math.round(widthAt(t) / 4) * 4
    const mode = modeOf(w)
    const prev = w < 950 ? 'short' : 'full'
    const sw = w < 950 ? prog(w, 1000, 900) : prog(w, 1350, 1250)
    front.userData.draw(`${w}`, ctx => {
      const x0 = (PW - w) / 2
      ctx.save()
      ctx.translate(x0, 20)
      windowBase(ctx, w, 1000)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 66, w, 560)
      ctx.clip()
      ctx.translate(Math.min(0, w - 1600) * 0.0, 66)
      if (w >= 1100) windowTalk(ctx, w)
      else {
        // narrow: the reply wraps
        text(ctx, '好的。先读一下现有实现，', 60, 120, F.reg(27), FG)
        text(ctx, '再拆成三个文件。', 60, 162, F.reg(27), FG)
        text(ctx, 'Bash  bun test  18 pass', 60, 230, F.mono(23), DIM)
      }
      ctx.restore()
      drawRow(ctx, 60, 640, items, { size: 30, mode, from: prev, p: sw })
      ctx.translate(40, 680)
      windowPrompt(ctx, w - 80)
      ctx.restore()
    })
    const flip = tw(t, 33.75, 34.4, E.inOutCubic)
    back.userData.draw(Math.floor(t * 2.4) % 2, ctx => {
      const bw = 1400
      const x0 = (PW - bw) / 2
      ctx.save()
      ctx.translate(x0, 20)
      roundRectPath(ctx, 2, 2, bw - 4, 1000 - 4, 22)
      ctx.fillStyle = '#0b0b0c'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = 2
      ctx.stroke()
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(30 + i * 24, 30, 7, 0, Math.PI * 2)
        ctx.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i]
        ctx.fill()
      }
      text(ctx, 'api-server — claude', bw / 2, 38, F.mono(20), DIM, { align: 'center' })
      const m = F.mono(26)
      roundRectPath(ctx, 50, 90, 620, 120, 10)
      ctx.strokeStyle = '#d97757'
      ctx.lineWidth = 2
      ctx.stroke()
      text(ctx, '✻ Welcome to Claude Code', 76, 140, F.monoB(26), FG)
      text(ctx, '  cwd: ~/api-server', 76, 182, m, DIM)
      text(ctx, '> 把 token 统计拆成独立模块', 60, 270, m, DIM)
      text(ctx, '● 拆分完成，测试全部通过。', 60, 320, m, FG)
      text(ctx, '  ⎿ bun test · 18 pass', 60, 362, m, DIM)
      roundRectPath(ctx, 50, 720, bw - 100, 84, 10)
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.stroke()
      text(ctx, '>', 78, 772, F.mono(28), FG)
      if (Math.floor(t * 2.4) % 2 === 0) {
        ctx.fillStyle = FG
        ctx.fillRect(108, 748, 15, 32)
      }
      text(ctx, '? for shortcuts', 60, 862, F.mono(22), DIM)
      terminalRow(ctx, 330, 862, items.map(it => ({ ...it, label: it.short })), 24)
      ctx.restore()
    })
    group.rotation.y = Math.PI * flip
    group.position.z = -Math.sin(flip * Math.PI) * 3
    const pos = keys(t, [[31.0, [-3.0, 1.2, D * 1.3]], [33.6, [-1.1, 0.7, D * 1.2], E.inOutSine], [34.4, [1.5, 0.4, D * 1.18], E.inOutCubic], [36.35, [2.4, 0.2, D * 1.1], E.lin]])
    shoot(s.camera, t, pos, [0, 0.3, 0], FOV, { drift: 0.05 })
    layer.draw(ctx => {
      kin(ctx, '窗口再窄，也不拥挤。', W / 2, 160, F.bold(78), t, { t0: 31.4, t1: 33.6, color: INK, accent: [5, 9, ACCENT.ink], stagger: 0.04 })
      kin(ctx, '终端里，一样原生。', W / 2, 160, F.bold(78), t, { t0: 34.35, t1: 36.2, color: INK, accent: [4, 8, ACCENT.ink], stagger: 0.04 })
    })
  }
  return s
}

// ═══ 09 · INSTALL ═══════════════════════════════════════════════════════════════════════════
const CMD1 = '/plugin marketplace add sundyme/usage-line'
const CMD2 = '/plugin install usage-line'
const T1 = [36.45, 0.021, 37.4]
const T2 = [37.7, 0.024, 38.45]
export function install() {
  const s = makeShot()
  const bg = ground(s.scene, WORLD.install)
  const layer = typeLayer(s.scene)
  const motes = dust({ count: 300, box: [36, 22, 20], center: [0, 0, -8], color: '#9fb4d0', opacity: 0.3, seed: 21 })
  s.scene.add(motes)
  const PW = 1500
  const PH = 560
  const term = panel(PW, PH, { res: 2 })
  term.position.set(0, -0.75, 0)
  term.renderOrder = 10
  s.scene.add(term)
  const halo = glow(16, '#3fb950', 0)
  halo.position.set(0, -0.75, -1)
  s.scene.add(halo)
  const wave = shockwave('#8ff0a4', 2.6)
  wave.position.set(-4.6, -1.6, 0.1)
  s.scene.add(wave)
  const spark = sparks({ count: 140, color: '#a6f5b4', speed: [2, 9], intensity: 3, seed: 31 })
  spark.position.set(-4.6, -1.6, 0)
  s.scene.add(spark)
  const items = rowItems({ cacheLeft: 3600, five: 9, fiveReset: 248, seven: 67, sevenReset: 4620, ctx: 40 })
  s.update = t => {
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    const n1 = clamp(Math.floor((t - T1[0]) / T1[1]) + 1, 0, CMD1.length)
    const n2 = clamp(Math.floor((t - T2[0]) / T2[1]) + 1, 0, CMD2.length)
    const ok1 = tw(t, T1[2] + 0.1, T1[2] + 0.4)
    const ok2 = tw(t, T2[2] + 0.1, T2[2] + 0.4)
    const rowIn = i => tw(t, 38.8 + i * 0.12, 38.8 + i * 0.12 + 0.45, E.outCubic)
    const blink = Math.floor(t * 2.4) % 2
    term.userData.draw(`${n1}${n2}${Math.round(ok1 * 20)}${Math.round(ok2 * 20)}${Math.round(rowIn(3) * 30)}${Math.round(rowIn(0) * 30)}${blink}`, ctx => {
      glass(ctx, 6, 6, PW - 12, PH - 12, 28, { base: 'rgba(10,12,14,0.92)', fill: 0.05, border: 0.18, shadow: 0 })
      for (let i = 0; i < 3; i++) {
        ctx.beginPath()
        ctx.arc(40 + i * 26, 38, 8, 0, Math.PI * 2)
        ctx.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i]
        ctx.fill()
      }
      text(ctx, '~/api-server — claude', PW / 2, 46, F.mono(22), DIM, { align: 'center' })
      const m = F.mono(34)
      const line = (y, str, n, active) => {
        text(ctx, '>', 56, y, m, rgba('#9aa8ff', 0.9))
        text(ctx, str.slice(0, n), 96, y, m, FG)
        if (active && (n < str.length || blink)) {
          ctx.fillStyle = BLUE
          ctx.fillRect(100 + measure(ctx, str.slice(0, n), m), y - 30, 6, 38)
        }
      }
      line(136, CMD1, n1, t < T1[2])
      if (ok1 > 0) {
        ctx.globalAlpha = ok1
        check(ctx, 98, 186, 26, '#3fb950', ok1)
        text(ctx, '已添加插件市场 usage-line', 140, 196, F.reg(30), '#8fdc9f')
        ctx.globalAlpha = 1
      }
      if (t >= T2[0] - 0.1) line(276, CMD2, n2, t < T2[2])
      if (ok2 > 0) {
        ctx.globalAlpha = ok2
        check(ctx, 98, 326, 26, '#3fb950', ok2)
        text(ctx, '已安装 usage-line', 140, 336, F.reg(30), '#8fdc9f')
        ctx.globalAlpha = 1
      }
      if (t >= 38.75) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fillRect(40, 410, PW - 80, 2)
        drawRow(ctx, 60, 476, items, { size: 32, reveal: rowIn })
      }
    })
    halo.userData.set('#3fb950', 0.5 * tw(t, 38.5, 38.7) * (1 - tw(t, 39.2, 40)))
    wave.userData.at(t, 38.5, 6, 0.7)
    spark.userData.at(t, 38.5, s.camera, 1.0)
    const pos = keys(t, [[36.0, [-1.6, 1.4, D * 1.3]], [40.3, [1.2, 0.2, D * 1.08], E.inOutSine]])
    shoot(s.camera, t, pos, [0, -0.3, 0], FOV, { drift: 0.05, shake: t >= 38.5 ? Math.exp(-(t - 38.5) * 7) * 0.06 : 0 })
    layer.draw(ctx => {
      kin(ctx, '两行命令，零配置。', W / 2, 200, F.bold(92), t, { t0: 36.2, t1: 40.1, accent: [5, 8, ACCENT.green], stagger: 0.04 })
    })
  }
  return s
}

// ═══ 10 · PAYOFF ════════════════════════════════════════════════════════════════════════════
export function payoff() {
  const s = makeShot()
  const bg = ground(s.scene, WORLD.payoff)
  const layer = typeLayer(s.scene)
  const lines = streaks({ count: 700, radius: [3, 24], depth: 140, len: 2, intensity: 1.2, colors: ['#7f9cff', '#b9a2ff'] })
  s.scene.add(lines)
  s.update = t => {
    bg.userData.tick(t)
    const u = lines.userData.u
    u.travel.value = (t - 40) * 18
    u.camZ.value = s.camera.position.z
    u.opacity.value = 0.6
    shoot(s.camera, t, [0, 0, D * lerp(1.0, 0.9, prog(t, 40, 42.25))], [0, 0, 0], FOV, { drift: 0.04 })
    layer.draw(ctx => {
      kin(ctx, '少一次打断，', W / 2, 480, F.bold(136), t, { t0: 40.12, t1: 41.95, stagger: 0.05 })
      kin(ctx, '多一分专注。', W / 2, 660, F.bold(136), t, { t0: 40.75, t1: 41.95, stagger: 0.05, accent: [3, 5, ACCENT.blue] })
    })
  }
  return s
}

// ═══ 11 · FINALE ════════════════════════════════════════════════════════════════════════════
export function finale() {
  const s = makeShot()
  const bg = ground(s.scene, WORLD.finale)
  const layer = typeLayer(s.scene)
  const motes = dust({ count: 450, box: [40, 24, 24], center: [0, 0, -8], color: '#a9c1ff', opacity: 0.4, seed: 41 })
  s.scene.add(motes)
  const wave = shockwave('#b8d2ff', 3)
  s.scene.add(wave)
  const spark = sparks({ count: 260, color: '#c8dcff', speed: [3, 16], intensity: 3.5, seed: 51 })
  s.scene.add(spark)
  const halo = glow(9, BLUE, 0)
  s.scene.add(halo)
  // the lockup's geometry (frame px)
  const RING_R = 66
  const LW = 17
  const WORD = 'usage-line'
  const wf = F.monoB(148)
  let wordW = 0
  s.update = t => {
    bg.userData.tick(t)
    motes.userData.tick(t, s.camera)
    shoot(s.camera, t, [0, 0, D * lerp(1.06, 0.98, prog(t, 42, 48))], [0, 0, 0], FOV, { drift: 0.04 })
    const ctx0 = layer.ctx
    ctx0.font = wf
    wordW ||= ctx0.measureText(WORD).width
    const total = RING_R * 2 + 40 + 86 + 40 + wordW
    const x0 = W / 2 - total / 2
    const ringX = x0 + RING_R
    const y = 470
    const tailA = ringX + RING_R + 40
    const tailB = tailA + 86
    const wx0 = tailB + 40
    const toWorld = (px, py) => [((px - W / 2) / 100) * (s.camera.position.z / D), ((H / 2 - py) / 100) * (s.camera.position.z / D), 0]
    wave.position.set(...toWorld(ringX, y))
    wave.userData.at(t, 42.0, 8, 0.9)
    spark.position.set(...toWorld(ringX, y))
    spark.userData.at(t, 42.0, s.camera, 1.4)
    halo.position.set(...toWorld(ringX, y))
    halo.userData.set(BLUE, 0.6 * tw(t, 42.2, 43.0) + 0.6 * Math.exp(-Math.max(0, t - 42.95) * 4) * (t > 42.95 ? 1 : 0))
    layer.draw(ctx => {
      const rp = tw(t, 42.15, 42.95, E.inOutCubic)
      // the ring closes
      ctx.save()
      ctx.shadowColor = rgba(BLUE, 0.9)
      ctx.shadowBlur = 36
      ctx.lineCap = 'round'
      ctx.lineWidth = LW
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.beginPath()
      ctx.arc(ringX, y, RING_R, 0, Math.PI * 2)
      ctx.stroke()
      if (rp > 0) {
        const g = ctx.createConicGradient(-Math.PI / 2, ringX, y)
        g.addColorStop(0, '#a9d4ff')
        g.addColorStop(Math.max(0.01, rp), '#4e8ff7')
        ctx.strokeStyle = g
        ctx.beginPath()
        ctx.arc(ringX, y, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(0.99995, rp))
        ctx.stroke()
      }
      // the tail: the line
      const tp = tw(t, 42.85, 43.1, E.outCubic)
      if (tp > 0) {
        ctx.strokeStyle = '#ffffff'
        ctx.shadowColor = 'rgba(200,225,255,0.9)'
        ctx.beginPath()
        ctx.moveTo(tailA, y)
        ctx.lineTo(lerp(tailA, tailB, tp), y)
        ctx.stroke()
      }
      ctx.restore()
      kin(ctx, WORD, wx0, y + 52, wf, t, { t0: 43.0, style: 'type', align: 'left', stagger: 0.05, caret: t < 44.0 ? 'blink' : null, accent: [0, 10, ['#fff', '#fff'], '#7fb2ff'] })
      kin(ctx, '一行，全看清。', W / 2, 660, F.bold(66), t, { t0: 43.55, stagger: 0.05, accent: [3, 6, ACCENT.blue] })
      // the link, and a click on it
      const cp = tw(t, 44.05, 44.5, E.outBack)
      if (cp > 0) {
        const url = 'github.com/sundyme/usage-line'
        const f = F.mono(32)
        const uw = measure(ctx, url, f) + 96
        const press = 1 - 0.04 * Math.sin(Math.PI * prog(t, 45.2, 45.38))
        ctx.save()
        ctx.translate(W / 2, 770)
        ctx.scale(lerp(0.8, 1, cp) * press, lerp(0.8, 1, cp) * press)
        ctx.globalAlpha = clamp(cp * 1.5)
        glass(ctx, -uw / 2, -38, uw, 76, 38, { base: 'rgba(20,30,60,0.6)', fill: 0.06, border: 0.3, shadow: 0, tint: '#cfe0ff' })
        ring(ctx, -uw / 2 + 44, 0, 11, 4, 0.75, BLUE)
        text(ctx, url, -uw / 2 + 72, 11, f, FG)
        ctx.restore()
      }
      const ck = [W / 2 + 120, 784]
      const mv = tw(t, 44.55, 45.15, E.inOutCubic)
      if (t >= 44.5) {
        const ripple = prog(t, 45.22, 45.9)
        if (ripple > 0 && ripple < 1) {
          ctx.save()
          ctx.globalAlpha = 1 - ripple
          ctx.strokeStyle = '#a9d4ff'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(ck[0], ck[1], 10 + E.outCubic(ripple) * 120, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
        cursor(ctx, lerp(1560, ck[0], mv), lerp(1040, ck[1], mv), 1.15 * (1 - 0.1 * Math.sin(Math.PI * prog(t, 45.2, 45.38))), tw(t, 44.5, 44.7) * (1 - tw(t, 46.6, 47)))
      }
      kin(ctx, 'Claude Code 插件 · 开源 · MIT', W / 2, 890, F.reg(28), t, { t0: 45.6, stagger: 0.02, color: rgba(FG, 0.6) })
    })
  }
  return s
}
