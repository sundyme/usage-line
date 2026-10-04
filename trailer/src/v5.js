// v5 · the film, assembled: nine shots, the cuts between them, and the grade.
import { E, W, H, lerp, prog, tw } from './engine.js'
import { glance, why } from './v5a.js'
import { cache, reveal } from './v5b.js'
import { adapt, end, install, limits, tableShot } from './v5c.js'

export const DUR5 = 48
export const SHOTS5 = {
  glance: [0, 10.3],
  why: [10.0, 16.0],
  reveal: [16.0, 22.35],
  cache: [22.0, 30.35],
  limits: [30.0, 35.35],
  adapt: [35.0, 38.3],
  install: [38.0, 41.0],
  table: [41.0, 44.65],
  end: [44.3, 48.0],
}
// [from, to, start, end, kind] · 1 cross · 3 zoom-through · 7 blur-zoom · 8 push
export const CUTS5 = [
  ['glance', 'why', 10.0, 10.3, 7],
  ['reveal', 'cache', 22.0, 22.35, 7],
  ['cache', 'limits', 30.0, 30.35, 3],
  ['limits', 'adapt', 35.0, 35.35, 8],
  ['adapt', 'install', 38.0, 38.3, 1],
  ['table', 'end', 44.3, 44.65, 7],
]
export const DROPS5 = [16, 41]

export function buildShots() {
  const shots = { glance: glance(), why: why(), reveal: reveal(), cache: cache(), limits: limits(), adapt: adapt(), install: install(), table: tableShot(), end: end() }
  const extra = {
    cache_limits: () => ({ center: [1310 / W, 1 - 540 / H], tint: '#000000' }),
    limits_adapt: () => ({ dir: [1, 0] }),
  }
  const plan = t => {
    const cut = CUTS5.find(([, , a, b]) => t >= a && t < b)
    if (cut) {
      const [from, to, a, b, kind] = cut
      const p = prog(t, a, b)
      return { a: shots[from], b: shots[to], kind, p: kind === 8 ? E.inOutQuart(p) : E.inOutCubic(p), bloomStrength: 0, ...(extra[`${from}_${to}`]?.(t, p) ?? {}) }
    }
    const name = Object.keys(SHOTS5).find(k => t >= SHOTS5[k][0] && t < SHOTS5[k][1]) ?? 'end'
    return { a: shots[name], bloomStrength: 0 }
  }
  return { shots, plan }
}
export function drawHud() {}
export function look(t) {
  const hit = DROPS5.reduce((m, d) => Math.max(m, t >= d ? Math.exp(-(t - d) * 7) : 0), 0)
  return { ca: hit * 0.002, exposure: 1 + hit * 0.08, vignette: 0.22, roll: false, grain: 0.006, fade: tw(t, 0, 0.4) * (1 - tw(t, 47.2, 48, E.inOutSine)) }
}
