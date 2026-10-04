// The trailer's clock, shared by the picture and the score (score.py keeps the same times).
// 120 BPM: a beat is 0.5 s, a bar 2 s, and every cut lands on the grid.
export const DUR = 52
export const BEAT = 0.5

// Shot windows; they overlap where a transition joins two.
export const SHOTS = {
  open: [0, 7.3],
  why: [7.0, 14.3],
  reveal: [14.0, 19.3],
  cache: [19.0, 29.3],
  limits: [29.0, 37.35],
  adapt: [37.0, 41.35],
  install: [41.0, 44.8],
  payoff: [44.5, 46.8],
  finale: [46.5, 52],
}

// Transitions: [from, to, start, end, kind]. kinds: 1 cross · 2 iris · 3 zoom-through · 4 whip ·
// 5 light-line wipe · 6 flash · 7 blur-zoom · 8 push · 9 mosaic · 10 glitch.
export const CUTS = [
  ['open', 'why', 7.0, 7.3, 7],
  ['why', 'reveal', 14.0, 14.3, 6],
  ['reveal', 'cache', 19.0, 19.3, 3],
  ['cache', 'limits', 29.0, 29.3, 2],
  ['limits', 'adapt', 37.0, 37.35, 8],
  ['adapt', 'install', 41.0, 41.35, 7],
  ['install', 'payoff', 44.5, 44.8, 10],
  ['payoff', 'finale', 46.5, 46.75, 6],
]

// The two drops, where the music and the picture hit hardest.
export const DROPS = [14, 46.5]
