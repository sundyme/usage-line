// The film, assembled: eleven shots, the cuts between them, and the grade.
import { E, W, H, lerp, prog, tw } from './engine.js'
import { CUTS, DROPS, SHOTS } from './timeline.js'
import { open, questions, reveal } from './act1.js'
import { cache, context, five, seven } from './act2.js'
import { adapt, finale, install, payoff } from './act3.js'
import { ACCENT, navRing } from './common.js'

export function buildShots() {
  const shots = {
    open: open(),
    questions: questions(),
    reveal: reveal(),
    cache: cache(),
    five: five(),
    seven: seven(),
    context: context(),
    adapt: adapt(),
    install: install(),
    payoff: payoff(),
    finale: finale(),
  }
  // an iris that opens from a ring in the nav, in the next chapter's colour
  const navIris = (i, name) => (t, p) => {
    const [x, y] = navRing(i)
    return { center: [x / W, 1 - y / H], radius: E.inCubic(p) * 2.3, tint: ACCENT[name][1] }
  }
  const cutParams = {
    open_questions: () => ({ dir: [0, 1] }),
    reveal_cache: t => {
      shots.reveal.update(t)
      return { center: shots.reveal.cacheCenter() }
    },
    cache_five: navIris(1, 'five'),
    five_seven: navIris(2, 'seven'),
    seven_context: navIris(3, 'context'),
  }
  const BLOOM = { reveal: 0.8, finale: 0.85, adapt: 0, cache: 0.7, five: 0.7, seven: 0.7, context: 0.7, install: 0.7 }
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

// nothing rides on top any more: the type lives inside each shot
export function drawHud() {}

// The grade: the light scene wants no vignette and no highlight roll; drops kick exposure.
export function look(t) {
  const hit = DROPS.reduce((m, d) => Math.max(m, t >= d ? Math.exp(-(t - d) * 6) : 0), 0)
  const light = tw(t, 31.0, 31.4) * (1 - tw(t, 36.0, 36.35))
  return {
    ca: 0.0012 + hit * 0.005,
    exposure: 1 + hit * 0.15,
    vignette: lerp(0.3, 0.08, light),
    roll: light < 0.5,
    grain: 0.007,
    fade: tw(t, 0, 0.3) * (1 - tw(t, 47.1, 48, E.inOutSine)),
  }
}
