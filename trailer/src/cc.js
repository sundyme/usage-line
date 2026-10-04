// Claude Code, drawn as it is: flat warm greys, hairline borders, nothing glassy. The film's
// glass belongs to the film; the product looks like the product.
import { F, measure, ring, text } from './ui.js'
import { roundRectPath } from './kit.js'

export const CC = {
  bg: '#262624',
  side: '#1f1e1d',
  panel: '#262624',
  field: '#30302e',
  line: '#3e3d3a',
  track: '#3a3936',
  ink: '#ebe9e4',
  dim: '#a3a19b',
  faint: '#6f6d68',
  blue: '#3b7ff0',
  orange: '#d97757',
  green: '#4caf6e',
  amber: '#e5a33a',
  red: '#e5534b',
}

const rr = (ctx, x, y, w, h, r, fill, stroke) => {
  roundRectPath(ctx, x, y, w, h, r)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}

// ── the window ──────────────────────────────────────────────────────────────────────────────
export const WINDOW = { w: 1400, h: 900, r: 18 }
export const PROMPT = { x: 40, w: 1320, h: 132, r: 22 }
export const promptY = h => h - 40 - PROMPT.h

export function drawWindow(ctx, { w = WINDOW.w, h = WINDOW.h, title = 'api-server', session = true } = {}) {
  rr(ctx, 0, 0, w, h, WINDOW.r, CC.bg, CC.line)
  // title bar
  ;['#ed6a5e', '#f4bf4f', '#61c554'].forEach((c, i) => {
    ctx.beginPath()
    ctx.arc(30 + i * 24, 26, 7, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
  })
  text(ctx, title, w / 2, 33, F.med(19), CC.dim, { align: 'center' })
  ctx.fillStyle = CC.line
  ctx.fillRect(0, 52, w, 1.5)
  if (session) drawSession(ctx, w)
}

export function drawSession(ctx, w) {
  const ask = '把 token 统计拆成独立模块，顺便补上测试'
  const aw = measure(ctx, ask, F.reg(25)) + 48
  rr(ctx, w - 40 - aw, 92, aw, 60, 16, CC.field)
  text(ctx, ask, w - 40 - aw + 24, 131, F.reg(25), CC.ink)
  text(ctx, '好的。先读一下现有实现，再拆成三个文件。', 48, 212, F.reg(26), CC.ink)
  const code = [
    [['export ', '#c792ea'], ['function ', '#c792ea'], ['countTokens', '#82aaff'], ['(msgs) {', '#d6d3cc']],
    [['  const ', '#c792ea'], ['cached ', '#d6d3cc'], ['= ', '#89ddff'], ['usage.cache_read', '#e5c07b']],
    [['  return ', '#c792ea'], ['msgs.', '#d6d3cc'], ['reduce', '#82aaff'], ['((n, m) => n + m.tokens, ', '#d6d3cc'], ['0', '#f78c6c'], [')', '#d6d3cc']],
    [['}', '#d6d3cc']],
  ]
  rr(ctx, 40, 244, w - 80, 214, 14, '#1e1e1c', CC.line)
  code.forEach((ln, i) => {
    let x = 72
    ln.forEach(([s, c]) => {
      text(ctx, s, x, 300 + i * 42, F.mono(24), c)
      x += measure(ctx, s, F.mono(24))
    })
  })
  const tool = (verb, arg, extra, y, col) => {
    ctx.beginPath()
    ctx.arc(56, y - 8, 5.5, 0, Math.PI * 2)
    ctx.fillStyle = col
    ctx.fill()
    text(ctx, verb, 74, y, F.monoB(23), CC.ink)
    text(ctx, arg, 156, y, F.mono(23), CC.dim)
    if (extra) text(ctx, extra, 156 + measure(ctx, arg, F.mono(23)) + 20, y, F.mono(23), col)
  }
  tool('Edit', 'src/usage/tokens.ts', '+84 −12', 506, CC.amber)
  tool('Bash', 'bun test', '18 pass', 548, CC.green)
  text(ctx, '拆分完成，测试全部通过。', 48, 610, F.reg(26), CC.ink)
}

// the prompt box; x, y its top left
export function drawPrompt(ctx, x, y, t, { w = PROMPT.w, h = PROMPT.h, typed = '', caret = false, placeholder = '继续说点什么…', iconHi = 0, model = 'Opus 5.5' } = {}) {
  rr(ctx, x, y, w, h, PROMPT.r, CC.field, CC.line)
  const ty = y + 50
  const blink = Math.floor(t * 2.2) % 2 === 0
  if (typed) {
    text(ctx, typed, x + 28, ty, F.mono(27), CC.ink)
    if (caret && blink) {
      ctx.fillStyle = CC.ink
      ctx.fillRect(x + 31 + measure(ctx, typed, F.mono(27)), ty - 24, 2.5, 31)
    }
  } else {
    text(ctx, placeholder, x + 28, ty, F.reg(27), CC.faint)
    if (caret && blink) {
      ctx.fillStyle = CC.ink
      ctx.fillRect(x + 27, ty - 24, 2.5, 31)
    }
  }
  const by = y + h - 36
  text(ctx, '+', x + 28, by + 11, F.light(32), CC.dim)
  text(ctx, model, x + 66, by + 8, F.reg(21), CC.dim)
  // the usage dial, and the send button
  const ix = x + w - 100
  if (iconHi > 0) {
    ctx.beginPath()
    ctx.arc(ix, by, 21, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${0.1 * iconHi})`
    ctx.fill()
  }
  ctx.lineWidth = 2.6
  ctx.strokeStyle = CC.track
  ctx.beginPath()
  ctx.arc(ix, by, 10, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = CC.dim
  ctx.beginPath()
  ctx.arc(ix, by, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.4)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x + w - 44, by, 19, 0, Math.PI * 2)
  ctx.fillStyle = CC.orange
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x + w - 44, by + 8)
  ctx.lineTo(x + w - 44, by - 8)
  ctx.moveTo(x + w - 51, by - 1)
  ctx.lineTo(x + w - 44, by - 8)
  ctx.lineTo(x + w - 37, by - 1)
  ctx.stroke()
  return { icon: [ix, by] }
}

// ── the usage popover, as in the app ────────────────────────────────────────────────────────
export const POP = { w: 744, h: 590 }
export function drawPopover(ctx, { hi = -1 } = {}) {
  const w = POP.w
  rr(ctx, 1, 1, w - 2, POP.h - 2, 22, CC.panel, CC.line)
  const x0 = 28
  const x1 = w - 28
  const bw = x1 - x0
  const hl = (i, y0, h) => {
    if (hi !== i) return
    rr(ctx, 12, y0, w - 24, h, 12, 'rgba(255,255,255,0.05)')
  }
  const bar = (y, f, col = CC.blue) => {
    rr(ctx, x0, y, bw, 8, 4, CC.track)
    if (f > 0) rr(ctx, x0, y, Math.max(8, bw * f), 8, 4, col)
  }
  hl(0, 22, 94)
  text(ctx, 'Context window', x0, 66, F.reg(25), CC.dim)
  text(ctx, '398.8k / 1M (40%)  ›', x1, 66, F.reg(25), CC.dim, { align: 'right' })
  rr(ctx, x0, 88, bw, 8, 4, CC.track)
  let sx = x0
  ;[[0.348, CC.blue], [0.014, CC.orange], [0.01, '#2fa38f'], [0.006, CC.amber], [0.004, CC.green], [0.03, '#77756f']].forEach(([f, c], i) => {
    rr(ctx, sx, 88, bw * f, 8, i ? 1.5 : 4, c)
    sx += bw * f + 2
  })
  ctx.fillStyle = CC.line
  ctx.fillRect(x0, 117, bw, 1.5)
  text(ctx, 'Plan usage limits · Max (5x)', x0, 162, F.reg(25), CC.dim)
  text(ctx, '→', x1, 162, F.reg(25), CC.dim, { align: 'right' })
  const row = (i, y, name, reset, pct) => {
    hl(i, y - 36, 72)
    text(ctx, name, x0, y, F.reg(25), CC.ink)
    text(ctx, `${reset}  ${pct}%`, x1, y, F.reg(25), CC.dim, { align: 'right' })
    bar(y + 20, pct / 100)
  }
  row(1, 212, 'Session limit', 'Resets in 4 hr 8 min', 9)
  row(2, 274, 'Weekly · all models', 'Resets Fri 4:00 AM', 67)
  row(3, 336, 'Weekly · Fable', 'Resets Fri 4:00 AM', 2)
  ctx.fillStyle = CC.line
  ctx.fillRect(x0, 380, bw, 1.5)
  text(ctx, 'Cloud session credits  ⓘ', x0, 428, F.reg(25), CC.ink)
  text(ctx, '$250 of $250 left', x1, 428, F.reg(25), CC.dim, { align: 'right' })
  rr(ctx, x0, 452, bw, 8, 4, CC.track)
  text(ctx, 'Expires 3:59 PM GMT+8, November 5', x0, 488, F.reg(25), CC.faint)
  ctx.fillStyle = CC.line
  ctx.fillRect(x0, 515, bw, 1.5)
  rr(ctx, x0, 536, 292, 40, 9, '#3a3936')
  text(ctx, 'See detailed breakdown', x0 + 12, 564, F.reg(24), CC.ink)
}

// ── usage-line itself: the row above the prompt ─────────────────────────────────────────────
// items from ui.rowItems; mode full · short · none; reveal(i) 0..1
export function drawUsageRow(ctx, x, yc, items, { size = 22, mode = 'full', reveal = () => 1, alpha = 1 } = {}) {
  const d = size * 1.05
  const g1 = size * 0.38
  const g2 = size * 1.2
  let cx = x
  items.forEach((it, i) => {
    const s = reveal(i)
    const label = mode === 'full' ? it.label : mode === 'short' ? it.short : ''
    const vw = it.minW ? Math.max(measure(ctx, it.value, F.med(size)), measure(ctx, '00:00', F.med(size))) : measure(ctx, it.value, F.med(size))
    if (s > 0) {
      ctx.save()
      ctx.globalAlpha *= alpha * Math.min(1, s * 1.5)
      ring(ctx, cx + d / 2, yc, size * 0.43, size * 0.15, it.frac * Math.min(1, s), it.color)
      text(ctx, it.value, cx + d + g1, yc + size * 0.36, F.med(size), CC.ink)
      if (label) text(ctx, label, cx + d + g1 + vw + g1, yc + size * 0.36, F.reg(size), CC.dim)
      ctx.restore()
    }
    cx += d + g1 + vw + (label ? g1 + measure(ctx, label, F.reg(size)) : 0) + g2
  })
  return cx - g2 - x
}
