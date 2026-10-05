// The film, v2 · 07–08 and the end: the window narrows, then flips over and is a terminal that
// folds by columns; the same terminal clears and installs; the mark.
import * as THREE from 'three'
import { E, W, H, clamp, keys, lerp, prog, tw } from './engine.js'
import { toPx } from './kit.js'
import { BLUE, DIM, F, FAINT, FG, SURFACE, SURFACE2, TAU, check, drawRow, glowSpot, measure, pie, reveal, rgba, rowItems, text, typed } from './ui.js'
import { at, orbit, panel, rr, snap, world, GRID, edge } from './f2kit.js'
import { LOCK, SUB, lockup } from './f2a.js'

// ❯ and ⏺, which no font here carries
function chevron(ctx, x, y, px, color) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(2, px * 0.11)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x + px * 0.16, y - px * 0.62)
  ctx.lineTo(x + px * 0.44, y - px * 0.36)
  ctx.lineTo(x + px * 0.16, y - px * 0.1)
  ctx.stroke()
  ctx.restore()
}
function bullet(ctx, x, y, px, color) {
  ctx.beginPath()
  ctx.arc(x + px * 0.3, y - px * 0.36, px * 0.17, 0, TAU)
  ctx.fillStyle = color
  ctx.fill()
}

// ── the desktop band, narrowing ─────────────────────────────────────────────────────────────
const DW = 1600
const DH = 400
const width = t => keys(t, [[33.3, 1584], [34.1, 1120, E.inOutExpo], [34.35, 1120], [34.95, 700, E.inOutExpo]])
function drawDesktop(ctx, t, items) {
  const w = width(t)
  const mode = w > 1300 ? 'full' : w > 860 ? 'short' : 'none'
  const switchAt = mode === 'full' ? null : mode === 'short' ? 33.62 : 34.6
  const from = mode === 'short' ? 'full' : mode === 'none' ? 'short' : null
  const p = switchAt ? prog(t, switchAt, switchAt + 0.4) : 1
  const px = (DW - w) / 2
  const py = 80
  rr(ctx, px, py, w, 300, 26)
  ctx.fillStyle = SURFACE
  ctx.fill()
  ctx.strokeStyle = rgba(FG, 0.1)
  ctx.lineWidth = 1.5
  ctx.stroke()
  edge(ctx, px, py, w, 300, 26)
  ctx.save()
  rr(ctx, px, py, w, 300, 26)
  ctx.clip()
  drawRow(ctx, px + 38, py + 62, items, { size: 32, mode, from, p })
  rr(ctx, px + 24, py + 112, w - 48, 164, 22)
  ctx.fillStyle = SURFACE2
  ctx.fill()
  ctx.strokeStyle = rgba(FG, 0.1)
  ctx.stroke()
  text(ctx, '继续说点什么…', px + 52, py + 176, F.reg(28), FAINT)
  ctx.restore()
  text(ctx, `${Math.round(w)} px`, px + w, py - 22, F.mono(22), DIM, { align: 'right' })
  ctx.strokeStyle = rgba(FG, 0.25)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(px, py - 52)
  ctx.lineTo(px, py - 40)
  ctx.moveTo(px, py - 46)
  ctx.lineTo(px + w, py - 46)
  ctx.moveTo(px + w, py - 52)
  ctx.lineTo(px + w, py - 40)
  ctx.stroke()
}

// ── the terminal: since 1.1 the row takes its own line above the ❯ prompt ────────────────────
const TW = 1600
const TH = 470
const CMD1 = '/plugin marketplace add sundyme/usage-line'
const CMD2 = '/plugin install usage-line@usage-line'
const termW = t => keys(t, [[36.45, 1584], [36.85, 1120, E.inOutExpo], [37.0, 1120], [37.35, 860, E.inOutExpo], [37.55, 860], [38.0, 1584, E.inOutExpo]])
const cellsOf = s => [...s].reduce((k, ch) => k + (/[⺀-鿿]/.test(ch) ? 2 : 1), 0)
function drawTerminal(ctx, t, items) {
  const tf = F.mono(29)
  const cell = measure(ctx, '0', tf)
  const tw2 = termW(t)
  const tx = (TW - 1584) / 2
  const ty = 72
  const BH = 384
  const cols = Math.floor((tw2 - 96) / cell)
  const need = mode => items.reduce((n, it) => {
    const lab = mode === 'full' ? it.label : mode === 'short' ? it.short : ''
    return n + 3 + Math.max(it.value.length, it.minW ? 5 : 0) + (lab ? 1 + cellsOf(lab) : 0)
  }, 2 * (items.length - 1) + 2)
  const tmode = ['full', 'short'].find(m => need(m) <= cols) ?? 'none'
  rr(ctx, tx, ty, tw2, BH, 18)
  ctx.fillStyle = '#0b0b0a'
  ctx.fill()
  ctx.strokeStyle = rgba(FG, 0.14)
  ctx.lineWidth = 1.5
  ctx.stroke()
  edge(ctx, tx, ty, tw2, BH, 18)
  ctx.save()
  rr(ctx, tx, ty, tw2, BH, 18)
  ctx.clip()
  const X0 = tx + 48
  // the adaptive part: transcript, the row, the prompt
  const a1 = 1 - tw(t, 37.55, 37.8)
  if (a1 > 0) {
    ctx.save()
    ctx.globalAlpha *= a1
    chevron(ctx, X0, ty + 70, 29, FAINT)
    text(ctx, '把 token 统计拆成独立模块', X0 + cell * 2, ty + 70, tf, FAINT)
    bullet(ctx, X0, ty + 118, 29, FG)
    text(ctx, '拆分完成，测试全部通过。', X0 + cell * 2, ty + 118, tf, FG)
    const ry = ty + 190
    const reach = tw(t, 35.95, 36.45, E.lin)
    let x = X0
    items.forEach((it, i) => {
      const lab = tmode === 'full' ? it.label : tmode === 'short' ? it.short : ''
      const a = clamp(reach * 4 - i)
      if (a > 0) {
        ctx.save()
        ctx.globalAlpha *= a
        pie(ctx, x + cell * 0.5, ry - 10, 11, it.frac, it.color)
        text(ctx, it.value, x + cell * 2, ry, tf, FG)
        if (lab) text(ctx, lab, x + cell * (3 + Math.max(it.value.length, it.minW ? 5 : 0)), ry, tf, DIM)
        ctx.restore()
      }
      x += cell * (3 + Math.max(it.value.length, it.minW ? 5 : 0) + (lab ? 1 + cellsOf(lab) : 0) + 2)
    })
    ctx.fillStyle = rgba(FG, 0.28)
    ctx.fillRect(tx + 28, ty + 220, tw2 - 56, 2)
    ctx.fillRect(tx + 28, ty + 296, tw2 - 56, 2)
    chevron(ctx, X0, ty + 270, 29, FG)
    if (Math.floor(t * 2.2) % 2 === 0) {
      ctx.fillStyle = rgba(FG, 0.85)
      ctx.fillRect(X0 + cell * 2, ty + 244, cell * 0.9, 34)
    }
    text(ctx, '? for shortcuts', X0, ty + 346, F.mono(25), FAINT)
    ctx.restore()
  }
  // the install part, in the same terminal
  const a2 = tw(t, 37.85, 38.15)
  if (a2 > 0) {
    ctx.save()
    ctx.globalAlpha *= a2
    const f = F.mono(36)
    chevron(ctx, X0, ty + 110, 36, BLUE)
    typed(ctx, CMD1, X0 + 44, ty + 110, f, FG, tw(t, 38.45, 39.45, E.lin), { caret: t < 39.5, t, size: 36 })
    if (t > 39.5) {
      chevron(ctx, X0, ty + 190, 36, BLUE)
      typed(ctx, CMD2, X0 + 44, ty + 190, f, FG, tw(t, 39.55, 40.3, E.lin), { caret: t < 40.45, t, size: 36 })
    }
    const ok = tw(t, 40.45, 40.85, E.outCubic)
    if (ok > 0) {
      check(ctx, X0 + 2, ty + 286, 30, BLUE, ok)
      text(ctx, '已启用 usage-line', X0 + 52, ty + 296, F.med(32), FG, { alpha: ok })
      text(ctx, 'enabled', X0 + 52 + measure(ctx, '已启用 usage-line', F.med(32)) + 18, ty + 294, F.mono(22), DIM, { alpha: ok })
    }
    ctx.restore()
  }
  ctx.restore()
  // the column gauge
  const ga = tw(t, 36.4, 36.7) * (1 - tw(t, 37.55, 37.8))
  if (ga > 0) {
    ctx.save()
    ctx.globalAlpha *= ga
    text(ctx, `${cols} cols`, tx + tw2, ty - 22, F.mono(22), DIM, { align: 'right' })
    ctx.strokeStyle = rgba(FG, 0.25)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(tx, ty - 52)
    ctx.lineTo(tx, ty - 40)
    ctx.moveTo(tx, ty - 46)
    ctx.lineTo(tx + tw2, ty - 46)
    ctx.moveTo(tx + tw2, ty - 52)
    ctx.lineTo(tx + tw2, ty - 40)
    ctx.stroke()
    ctx.restore()
  }
  return { checkAt: [X0 + 17, ty + 280] }
}

export function adapt() {
  const { s, bg, grid, front } = world()
  const A = new THREE.Group()
  s.scene.add(A)
  const desk = panel(DW, DH, { res: 1.5, side: THREE.FrontSide })
  const term = panel(TW, TH, { res: 1.5, side: THREE.FrontSide })
  term.rotation.y = Math.PI
  term.position.set(0, -0.3, -0.01)
  A.add(desk, term)
  const v3 = new THREE.Vector3()
  s.userData = { check: [0.15, 0.4] }
  s.update = t => {
    bg.userData.tick(t)
    const items = rowItems({ cacheLeft: 3540 - (snap(t) - 32.5) })
    const flip = E.inOutCubic(prog(t, 35.1, 35.85))
    A.position.set(...at(960, 650), 1.4 * Math.sin(Math.PI * flip))
    A.rotation.set(0.1 * Math.sin(Math.PI * flip), Math.PI * flip, 0)
    A.updateMatrixWorld(true)
    desk.visible = flip < 0.5
    term.visible = flip >= 0.5
    if (desk.visible) desk.userData.draw(`${Math.round(width(t))}${items[0].value}${Math.round(t * 30)}`, ctx => drawDesktop(ctx, t, items))
    const checkAt = [(TW - 1584) / 2 + 48 + 17, 72 + 280]
    if (term.visible) term.userData.draw(`${Math.round(termW(t))}${items[0].value}${Math.round(t * 30)}`, ctx => drawTerminal(ctx, t, items))
    const cam = keys(t, [
      [32.5, [0.3, 0.08, 0.86]],
      [33.6, [0.05, 0.03, 1.0], E.outCubic],
      [35.05, [-0.05, 0.02, 1.0], E.inOutSine],
      [35.5, [0.02, 0.06, 1.14], E.inOutCubic],
      [35.95, [0.06, 0.03, 0.98], E.inOutCubic],
      [37.55, [-0.04, 0.02, 0.98], E.inOutSine],
      [38.2, [0.03, 0.02, 0.98], E.inOutCubic],
      [41.3, [-0.03, 0.01, 0.88], E.inOutSine],
    ])
    orbit(s.camera, t, at(960, 610), { yaw: cam[0], pitch: cam[1], dist: cam[2] })
    // where the check lands, for the iris into the end
    const lp = v3.set(((checkAt[0] - TW / 2) / 100) * -1, (TH / 2 - checkAt[1]) / 100 - 0.3, 0).applyMatrix4(A.matrixWorld).toArray()
    const [cx, cy] = toPx(s.camera, lp)
    s.userData.check = [cx / W, 1 - cy / H]
    grid.material.opacity = GRID
    front.draw(ctx => {
      const head = (zh, en, a, b, t1) => {
        if (t < a || t > t1 + 0.4) return
        ctx.save()
        ctx.globalAlpha *= 1 - tw(t, t1, t1 + 0.35, E.inCubic)
        reveal(ctx, zh, 168, 232, F.bold(72), FG, tw(t, a, a + 0.85, E.lin), { dy: 30, spread: 4, blur: 10 })
        reveal(ctx, en, 168, 300, F.light(34), SUB, tw(t, b, b + 1.0, E.lin), { dy: 12, spread: 10, blur: 5, tracking: 0.8 })
        ctx.restore()
      }
      head('窗口再窄，也不挤压。', 'Narrow window? It folds, it never squeezes.', 32.6, 32.85, 34.95)
      head('终端里，一样原生。', 'In the terminal, a line of its own.', 35.6, 35.85, 37.55)
      head('两行命令，即刻装好。', 'Two commands, and it is there.', 38.05, 38.3, 40.9)
    })
  }
  return s
}

// ═══ the end: the mark, settling to face us ═════════════════════════════════════════════════
export function end() {
  const { s, bg, grid, front } = world()
  const card = panel(1920, 700, { res: 1.4 })
  card.position.set(...at(960, 540), 0)
  s.scene.add(card)
  s.update = t => {
    bg.userData.tick(t)
    const fin = tw(t, 41.15, 41.9, E.outExpo)
    const close = tw(t, 41.35, 42.4, E.inOutCubic)
    const settle = tw(t, 41.15, 42.7, E.outQuint)
    card.rotation.set(lerp(0.2, 0, settle), lerp(-0.42, 0, settle), 0)
    card.userData.draw(`${Math.round(t * 60)}`, ctx => {
      const y = 280
      glowSpot(ctx, 960, y, 700, BLUE, 0.1 * fin)
      lockup(ctx, 960, y + (1 - fin) * 30, lerp(1.08, 1.2, fin), { ringP: close, word: tw(t, 41.3, 41.95, E.lin), caret: false, glow: 26 * close, alpha: fin })
      reveal(ctx, '一行，全看清。', 960, y + 180, F.light(48), FG, tw(t, 41.7, 42.4, E.lin), { align: 'center', dy: 14, spread: 4, blur: 6, tracking: 0.8 })
      text(ctx, 'github.com/sundyme/usage-line', 960, y + 248, F.mono(28), DIM, { align: 'center', alpha: tw(t, 42.0, 42.6) })
    })
    orbit(s.camera, t, at(960, 520), { dist: keys(t, [[41.15, 0.78], [42.8, 1.0, E.outQuint], [44, 1.03, E.lin]]), yaw: keys(t, [[41.15, 0.1], [42.8, 0, E.outQuint]]), pitch: 0.02 })
    grid.material.opacity = GRID * (1 - tw(t, 43.2, 44))
    front.draw(() => false)
  }
  return s
}
export { LOCK }
