// v5 · act one. A glance that costs a click (three of them), a number the menu doesn't have,
// and what that number is worth.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, prog, tw } from './engine.js'
import { panel, shoot, kin } from './kit.js'
import { BLUE, F, RED, measure, rgba, text } from './ui.js'
import { onLayer } from './glass.js'
import { liquid } from './liquid.js'
import { POP, PROMPT, WINDOW, drawPopover, drawPrompt, drawWindow, promptY } from './cc.js'
import { D, FOV, FRONT, INK, MUTE, UNIT, at, head, line, pointer, pool, sp, stage } from './stage.js'

// ═══ A · GLANCE ═════════════════════════════════════════════════════════════════════════════
// The real thing, flat: a Claude Code window, its prompt box and its usage popover.
export const OPENS = [[3.7, 4.6], [5.1, 5.8], [6.6, 99]]
export const CLICKS = [3.7, 4.6, 5.1, 5.8, 6.6]
const GW = { w: 1120, h: 860 } // this shot's window
const PW = GW.w - 80
const PY = promptY(GW.h)
const ICON = [PROMPT.x + PW - 100, PY + PROMPT.h - 36]
const POPR = { x: PROMPT.x + PW - POP.w, y: PY - 14 - POP.h } // popover top left, window px
const wl = (x, y, z = 0) => [(x - GW.w / 2) / UNIT, (GW.h / 2 - y) / UNIT, z]
const CHIP = { x: 330, y: 640, w: 470, h: 84 }

export function glance() {
  const { s, bg, back, front } = stage()
  const win = new THREE.Group()
  s.scene.add(win)
  const add = (w, h, x, y, z = 0, res = 1.6) => {
    const p = panel(w, h, { res })
    p.position.set(...wl(x + w / 2, y + h / 2, z))
    win.add(p)
    return p
  }
  const base = add(GW.w, GW.h, 0, 0, 0)
  base.userData.draw(0, ctx => drawWindow(ctx, GW))
  const prompt = add(PW + 20, PROMPT.h + 20, PROMPT.x - 10, PY - 10, 0.002)
  const pop = add(POP.w, POP.h, POPR.x, POPR.y, 0.004)
  const shade = add(POP.w + 160, POP.h + 160, POPR.x - 80, POPR.y - 60, 0.003, 0.4)
  base.renderOrder = 1
  prompt.renderOrder = 2
  shade.renderOrder = 3
  pop.renderOrder = 4
  shade.userData.draw(0, ctx => {
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 50
    ctx.shadowOffsetY = 18
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.beginPath()
    ctx.roundRect(80, 60, POP.w, POP.h, 22)
    ctx.fill()
  })
  const ptr = add(90, 90, 0, 0, 0.01, 2)
  ptr.renderOrder = 5
  // the one piece of glass in this shot: a note about the row that isn't there
  const chip = liquid({ w: CHIP.w + 260, h: CHIP.h + 260, refr: 22, bevel: 18, frost: 0.55, tintA: 0.2 })
  chip.position.set(...wl(CHIP.x, CHIP.y, 0.4))
  win.add(chip)
  const chipFace = panel(CHIP.w, CHIP.h, { res: 2 })
  onLayer(chipFace, FRONT)
  chipFace.renderOrder = 60
  chipFace.position.set(...wl(CHIP.x, CHIP.y, 0.401))
  win.add(chipFace)
  chipFace.userData.draw(0, ctx => {
    text(ctx, 'Prompt cache', 34, 53, F.reg(28), INK)
    text(ctx, '– – : – –', CHIP.w - 76, 53, F.monoB(28), '#ff8a7a', { align: 'right' })
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(255,138,122,0.8)'
    ctx.beginPath()
    ctx.arc(CHIP.w - 42, 42, 15, 0, Math.PI * 2)
    ctx.stroke()
    text(ctx, '?', CHIP.w - 42, 51, F.med(22), '#ff8a7a', { align: 'center' })
  })
  const openness = t => OPENS.reduce((v, [a, b]) => Math.max(v, tw(t, a + 0.04, a + 0.24) * (1 - tw(t, b + 0.03, b + 0.15, E.inQuad))), 0)
  s.update = t => {
    bg.userData.tick(t)
    // the window arrives
    const arr = E.outQuint(prog(t, 2.6, 3.9))
    win.position.set(...at(lerp(1900, 1340, arr), lerp(600, 520, arr)), lerp(-2.5, -0.3, arr))
    win.rotation.set(0, lerp(0.38, 0.13, arr), 0)
    for (const m of [base, prompt]) m.material.opacity = arr
    const hiIcon = CLICKS.reduce((m, c) => Math.max(m, 1 - Math.abs(t - c) / 0.3), 0)
    prompt.userData.draw(`${Math.round(hiIcon * 20)}${Math.floor(t * 2.2) % 2}`, ctx => drawPrompt(ctx, 10, 10, t, { w: PW, iconHi: clamp(hiIcon), caret: true }))
    // the popover: Claude Code's own quick fade and settle, from the bottom right
    const v = openness(t)
    const sc = lerp(0.965, 1, v)
    pop.material.opacity = shade.material.opacity = v
    for (const [m, w0, h0, ox, oy] of [[pop, POP.w, POP.h, POPR.x, POPR.y], [shade, POP.w + 160, POP.h + 160, POPR.x - 80, POPR.y - 60]]) {
      m.scale.set(sc, sc, 1)
      const ax = POPR.x + POP.w
      const ay = POPR.y + POP.h
      m.position.set(...wl(ax - (ax - (ox + w0 / 2)) * sc, ay - (ay - (oy + h0 / 2)) * sc, m === pop ? 0.004 : 0.003))
    }
    const hi = t >= 7.55 && t < 8.5 ? [0, 1, 2, 3][Math.min(3, Math.floor((t - 7.55) / 0.24))] : -1
    pop.userData.draw(hi, ctx => drawPopover(ctx, { hi }))
    // the note: a drop that opens into a pill
    const c = sp(t, 8.6, 0.75)
    chip.userData.set(c > 0.001 ? [{ x: 0, y: 0, w: lerp(26, CHIP.w, c), h: lerp(26, CHIP.h, clamp(c * 1.6)), r: CHIP.h / 2 }] : [])
    chipFace.material.opacity = clamp((c - 0.5) / 0.4) * (1 - tw(t, 10.0, 10.3))
    chip.userData.u.opacity.value = 1 - tw(t, 10.0, 10.3)
    // the cursor, in the window's own space
    const path = keys(t, [
      [3.0, [1380, 900]],
      [3.6, [ICON[0] - 4, ICON[1] - 6], E.outCubic],
      [7.25, [ICON[0] - 4, ICON[1] - 6]],
      [7.55, [POPR.x + 420, POPR.y + 70], E.inOutCubic],
      [8.45, [POPR.x + 430, POPR.y + 330], E.inOutSine],
      [9.0, [CHIP.x + 140, CHIP.y + 20], E.inOutCubic],
    ])
    ptr.position.set(...wl(path[0], path[1], 0.5))
    ptr.material.opacity = tw(t, 3.0, 3.2) * (1 - tw(t, 9.5, 9.8))
    ptr.userData.draw(Math.round(t * 60), ctx => pointer(ctx, t, 45, 45, CLICKS, 1))
    // camera: settle, then lean in on the menu
    const pos = keys(t, [
      [0, [0, 0, D]],
      [2.3, [0, 0, D]],
      [7.3, [0.15, 0, D * 0.985], E.inOutSine],
      [8.7, [0.9, -0.1, D * 0.9], E.inOutCubic],
      [10.3, [1.05, -0.12, D * 0.87], E.lin],
    ])
    shoot(s.camera, t, pos, [pos[0], pos[1], 0], FOV, { drift: 0.012 })
    back.draw(() => false)
    front.draw(ctx => {
      // the opening line, centred; it steps aside when the window arrives
      const m = E.inOutCubic(prog(t, 2.1, 2.85))
      const a1 = '想看一眼用量，'
      const a2 = '得先点开它。'
      const sz = lerp(96, 70, m)
      const w1 = measure(ctx, a1, F.med(sz))
      const w2 = measure(ctx, a2, F.med(sz))
      const y1 = lerp(505, 420, m)
      line(ctx, a1, lerp(960 - w1 / 2, 110, m), y1, sz, t, { t0: 0.55, t1: 3.55, style: 'type', stagger: 0.075 })
      line(ctx, a2, lerp(960 - w2 / 2, 110, m), y1 + sz * 1.28, sz, t, { t0: 1.5, t1: 3.6, color: MUTE })
      if (t < 1.1 && Math.floor(t * 2.6) % 2 === 0) {
        const done = clamp((t - 0.55) / 0.075 + 1, 0, 7)
        ctx.fillStyle = BLUE
        ctx.fillRect(960 - w1 / 2 + measure(ctx, a1.slice(0, Math.floor(done)), F.med(96)) + 6, 505 - 80, 7, 98)
      }
      const H2 = { x: 110, y: 420, size: 70 }
      head(ctx, t, '点开，关上。', '再点开，再关上。', { ...H2, t0: 3.72, t1: 6.35, lag: 1.4 })
      head(ctx, t, '每看一次，', '就被打断一次。', { ...H2, t0: 6.62, t1: 8.5 })
      head(ctx, t, '缓存还剩多久？', '这里，没有答案。', { ...H2, t0: 8.65, t1: 10.05, lag: 0.4 })
    })
  }
  return s
}

// ═══ B · WHY ════════════════════════════════════════════════════════════════════════════════
// Hit, you pay a tenth. Miss, you pay it all. Between them: minutes.
const BAR = { x: 960, y: 800, w: 760, h: 30 }
export const EXPIRE = 12.9
export function why() {
  const { s, bg, back, front } = stage()
  const glass = liquid({ w: 1300, h: 400, refr: 16, bevel: 13, frost: 0.2, tintA: 0.12, spread: 30, dy: 14 })
  glass.position.set(...at(BAR.x, BAR.y), 0)
  s.scene.add(glass)
  const level = t => (t < 11.4 ? E.outCubic(prog(t, 10.35, 11.0)) : 1 - E.inOutSine(prog(t, 11.4, 12.85)))
  s.update = t => {
    bg.userData.tick(t)
    const show = sp(t, 10.3, 0.7) * (1 - tw(t, 14.25, 14.6, E.inCubic))
    glass.userData.set([{ x: 0, y: 0, w: BAR.w * show, h: BAR.h * clamp(show * 1.4), r: BAR.h / 2 }])
    shoot(s.camera, t, [0, 0, D * lerp(1.0, 0.97, prog(t, 10, 16))], [0, 0, 0], FOV, { drift: 0.015 })
    const hit = t < EXPIRE
    back.draw(ctx => {
      const warm = tw(t, EXPIRE, EXPIRE + 0.6)
      pool(ctx, 960, 560, 640, '#3561c9', 0.22 * tw(t, 10.2, 11) * (1 - warm) * (1 - tw(t, 14.2, 15)))
      pool(ctx, 960, 560, 640, '#c2412f', 0.2 * warm * (1 - tw(t, 14.2, 15)))
      // the time left, as liquid in the glass
      const lv = level(t)
      if (show > 0.02 && lv > 0.002) {
        const w = (BAR.w - 10) * lv * show
        const g = ctx.createLinearGradient(BAR.x - BAR.w / 2, 0, BAR.x + BAR.w / 2, 0)
        g.addColorStop(0, '#2f6fe8')
        g.addColorStop(1, '#8fb8ff')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.roundRect(BAR.x - BAR.w / 2 + 5, BAR.y - 10, w, 20, 10)
        ctx.fill()
      }
      return true
    })
    front.draw(ctx => {
      const kick = (str, t0, t1) => line(ctx, str, 960, 330, 24, t, { t0, t1, font: F.mono, color: MUTE, align: 'center', tracking: 5 })
      kick('PROMPT CACHE · HIT', 10.3, EXPIRE - 0.1)
      kick('PROMPT CACHE · EXPIRED', EXPIRE + 0.05, 14.2)
      const num = (str, t0, t1, c1) =>
        kin(ctx, str, 960, 610, F.monoB(240), t, { t0, t1, align: 'center', stagger: 0.05, dur: 0.8, rise: 0.35, outRise: 0.45, blurK: 18, outDur: 0.3, accent: [0, str.length, ['#ffffff', c1]] })
      num('×0.1', 10.35, EXPIRE - 0.12, '#9cc2ff')
      num('×1', EXPIRE + 0.02, 14.2, '#ff9384')
      line(ctx, '命中缓存：重读整段上下文，只算一成。', 960, 712, 42, t, { t0: 10.75, t1: EXPIRE - 0.1, align: 'center', color: INK })
      line(ctx, '过期之后：同一段上下文，全价重读。', 960, 712, 42, t, { t0: EXPIRE + 0.15, t1: 14.2, align: 'center', color: INK })
      // the clock at the bar's end
      const left = 3600 * level(t)
      const ta = tw(t, 10.6, 11) * (1 - tw(t, 14.1, 14.35))
      if (ta > 0) {
        const s2 = Math.max(0, Math.ceil(left))
        const str = hit ? `${String(Math.floor(s2 / 60)).padStart(2, '0')}:${String(s2 % 60).padStart(2, '0')}` : '过期'
        text(ctx, str, BAR.x + BAR.w / 2 + 34, BAR.y + 10, F.mono(26), hit ? MUTE : RED, { alpha: ta })
        text(ctx, '缓存', BAR.x - BAR.w / 2 - 34, BAR.y + 10, F.reg(26), MUTE, { alpha: ta, align: 'right' })
      }
      head(ctx, t, '省一成，还是付全价，', '只差几分钟。', { t0: 14.45, t1: 15.25, x: 960, y: 500, size: 96, align: 'center', lag: 0.4 })
      const r = line(ctx, '如果，它一直都在？', 960, 575, 96, t, { t0: 15.42, t1: 15.8, style: 'type', stagger: 0.04, caret: null, outDur: 0.14 })
      // the caret stays, glides to the centre, and becomes a drop
      if (t >= 15.42 && r) {
        const g = E.inOutCubic(prog(t, 15.8, 16.0))
        const x = lerp(r.end + 10, 956, g)
        const hgt = lerp(100, 30, g)
        const wd = lerp(8, 30, g)
        ctx.fillStyle = BLUE
        ctx.beginPath()
        ctx.roundRect(x - wd / 2 + 4, 575 - 82 + (100 - hgt) / 2 - lerp(0, 33, g), wd, hgt, wd / 2)
        ctx.fill()
      }
    })
  }
  return s
}
