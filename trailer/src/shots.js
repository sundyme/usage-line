// The film, assembled: nine shots, the cuts between them, and the grade.
import { E, W, H, lerp, prog, tw } from './engine.js'
import { CUTS, DROPS, SHOTS } from './timeline.js'
import { open, why } from './v4a.js'
import { cache, reveal } from './v4b.js'
import { adapt, finale, install, limits, payoff } from './v4c.js'
import { ACCENT, navRing } from './common.js'

export function buildShots() {
  const shots = {
    open: open(),
    why: why(),
    reveal: reveal(),
    cache: cache(),
    limits: limits(),
    adapt: adapt(),
    install: install(),
    payoff: payoff(),
    finale: finale(),
  }
  const cutParams = {
    reveal_cache: t => {
      shots.reveal.update(t)
      return { center: shots.reveal.cacheCenter() }
    },
    // the iris opens from the 5h ring in the nav
    cache_limits: (t, p) => {
      const [x, y] = navRing(1)
      return { center: [x / W, 1 - y / H], radius: E.inCubic(p) * 2.3, tint: ACCENT.five[1] }
    },
    limits_adapt: () => ({ dir: [1, 0] }),
  }
  const BLOOM = { reveal: 0.8, finale: 0.85, adapt: 0, cache: 0.7, limits: 0.6, install: 0.7, why: 0.6, open: 0.5 }
  const plan = t => {
    const cut = CUTS.find(([, , a, b]) => t >= a && t < b)
    if (cut) {
      const [from, to, a, b, kind] = cut
      const p = prog(t, a, b)
      const ease = kind === 8 || kind === 4 ? E.inOutQuart(p) : kind === 2 ? p : E.inOutCubic(p)
      const extra = cutParams[`${from}_${to}`]?.(t, p) ?? {}
      const bl = lerp(BLOOM[from] ?? 0.6, BLOOM[to] ?? 0.6, p)
      return { a: shots[from], b: shots[to], kind, p: ease, bloomStrength: bl, ...extra }
    }
    const name = Object.keys(SHOTS).find(k => t >= SHOTS[k][0] && t < SHOTS[k][1]) ?? 'finale'
    return { a: shots[name], bloomStrength: BLOOM[name] ?? 0.6 }
  }
  return { shots, plan }
}

// nothing rides on top: the type lives inside each shot
export function drawHud() {}

// The grade: the light scene wants no vignette and no highlight roll; drops kick exposure.
export function look(t) {
  const hit = DROPS.reduce((m, d) => Math.max(m, t >= d ? Math.exp(-(t - d) * 6) : 0), 0)
  const light = tw(t, 37.0, 37.35) * (1 - tw(t, 41.0, 41.35))
  return {
    ca: 0.0012 + hit * 0.005,
    exposure: 1 + hit * 0.15,
    vignette: lerp(0.3, 0.08, light),
    roll: light < 0.5,
    grain: 0.007,
    fade: tw(t, 0, 0.3) * (1 - tw(t, 51.1, 52, E.inOutSine)),
  }
}
