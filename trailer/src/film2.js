// The film, v2 (44 s, the v1 score's clock). The cut, the corner chrome, the look.
//
//   0.0  INTRO    the questions at depth → one line → the mark
//  10.0  DROP     the row's pieces fall onto a Claude Code window in perspective
//  15.9  CACHE    the dial in three layers, the camera going round it
//  24.0  METERS   5h · 7d · thresholds · context, one table, one travelling camera
//  32.5  ADAPT    the window narrows, flips over: the terminal folds; the same terminal installs
//  41.2  END      the mark
import { E, FPS, keys, prog, tw } from './engine.js'
import { BLUE, DIM, F, FG, measure, reveal, rgba, ring, text } from './ui.js'
import { intro, inPlace } from './f2a.js'
import { cache, meters } from './f2b.js'
import { adapt, end } from './f2c.js'

export const DUR = 44

export const SHOTS = {
  intro: [0, 10.45],
  inPlace: [9.95, 16.15],
  cache: [15.8, 24.3],
  meters: [23.9, 32.85],
  adapt: [32.5, 41.6],
  end: [41.15, 44],
}
// [from, to, start, end, kind] · 1 cross · 2 iris · 3 zoom-through · 4 whip · 7 blur-zoom · 8 push
export const CUTS = [
  ['intro', 'inPlace', 9.95, 10.45, 1],
  ['inPlace', 'cache', 15.8, 16.15, 3],
  ['cache', 'meters', 23.9, 24.3, 4],
  ['meters', 'adapt', 32.5, 32.85, 7],
  ['adapt', 'end', 41.15, 41.6, 2],
]

export function buildShots() {
  const shots = { intro: intro(), inPlace: inPlace(), cache: cache(), meters: meters(), adapt: adapt(), end: end() }
  const extra = {
    cache_meters: () => ({ dir: [0.55, 0] }),
    // the end opens out of the check mark
    adapt_end: (t, p) => ({ center: shots.adapt.userData.check, radius: E.inQuad(p) * 2.3, tint: '#4e8ff7' }),
  }
  const plan = t => {
    const cut = CUTS.find(([, , a, b]) => t >= a && t < b)
    if (cut) {
      const [from, to, a, b, kind] = cut
      const p = prog(t, a, b)
      return { a: shots[from], b: shots[to], kind, p: kind === 8 || kind === 4 ? E.inOutQuart(p) : E.inOutCubic(p), bloomStrength: 0.35, ...(extra[`${from}_${to}`]?.(t, p) ?? {}) }
    }
    const name = Object.keys(SHOTS).find(k => t >= SHOTS[k][0] && t < SHOTS[k][1]) ?? Object.keys(SHOTS).at(-1)
    return { a: shots[name], bloomStrength: 0.35 }
  }
  return { shots, plan }
}

// ── the corner chrome: registration marks, the chapter, the timecode ─────────────────────────
const CHAPTERS = [
  [0, '01', '问题', 'THE QUESTIONS'],
  [6, '02', '一行', 'ONE LINE'],
  [10, '03', '原位', 'IN PLACE'],
  [16, '04', '缓存', 'CACHE'],
  [24, '05', '额度', 'LIMITS'],
  [30, '06', '上下文', 'CONTEXT'],
  [32.5, '07', '自适应', 'ADAPTIVE'],
  [38, '08', '安装', 'INSTALL'],
]
export function drawHud(ctx, t, frame) {
  const a = tw(t, 0.15, 0.9) * (1 - tw(t, 40.9, 41.5)) * 0.62
  if (a <= 0.001) return
  const W = 1920
  const H = 1080
  ctx.save()
  ctx.globalAlpha = a
  ctx.strokeStyle = rgba(FG, 0.35)
  ctx.lineWidth = 1.5
  const m = 40
  const l = 18
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath()
    ctx.moveTo(x, y + sy * l)
    ctx.lineTo(x, y)
    ctx.lineTo(x + sx * l, y)
    ctx.stroke()
  }
  let i = 0
  while (i + 1 < CHAPTERS.length && t >= CHAPTERS[i + 1][0]) i++
  const [start, num, zh, en] = CHAPTERS[i]
  const sw = prog(t, start, start + 0.45)
  text(ctx, num, 76, 84, F.monoB(20), BLUE, { alpha: 0.4 + 0.6 * sw })
  reveal(ctx, zh, 116, 84, F.med(20), FG, sw, { dy: 8, blur: 4, spread: 2 })
  reveal(ctx, en, 116 + measure(ctx, zh, F.med(20)) + 16, 84, F.mono(16), DIM, sw, { dy: 8, blur: 4, spread: 4 })
  text(ctx, 'USAGE-LINE  ·  FOR CLAUDE CODE', W - 76, 84, F.mono(16), DIM, { align: 'right' })
  const tc = `${String(Math.floor(frame / FPS / 60)).padStart(2, '0')}:${String(Math.floor(frame / FPS) % 60).padStart(2, '0')}:${String(frame % FPS).padStart(2, '0')}`
  text(ctx, tc, W - 76, H - 66, F.mono(16), DIM, { align: 'right' })
  ring(ctx, 84, H - 71, 6, 2.2, keys(t, [[0, 0], [DUR - 3, 1, E.lin]]), BLUE)
  text(ctx, 'v1.1', 100, H - 66, F.mono(16), DIM)
  ctx.restore()
}

export function look(t) {
  return { ca: 0.0015, exposure: 1, vignette: 0.3, roll: true, grain: 0.008, fade: tw(t, 0, 0.1) * (1 - tw(t, 43.3, 44, E.inOutSine)) }
}
