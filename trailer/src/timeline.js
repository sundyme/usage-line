// The trailer's clock, shared by the picture and the score (score.py reads these by eye; keep
// them in step). 120 BPM: a beat is 0.5 s, a bar 2 s, and every cut lands on the grid.
export const DUR = 48
export const BEAT = 0.5

// Shot windows; they overlap where a transition joins two.
export const SHOTS = {
  open: [0, 4.75],
  questions: [4.5, 8.25],
  reveal: [7.9, 12.85],
  cache: [12.5, 19.3],
  five: [19.0, 23.3],
  seven: [23.0, 26.8],
  context: [26.5, 31.4],
  adapt: [31.0, 36.35],
  install: [36.0, 40.3],
  payoff: [40.0, 42.25],
  finale: [42.0, 48],
}

// Transitions: [from, to, start, end, kind]. kinds: 1 cross · 2 iris · 3 zoom-through · 4 whip ·
// 5 light-line wipe · 6 flash · 7 blur-zoom · 8 push · 9 mosaic · 10 glitch.
export const CUTS = [
  ['open', 'questions', 4.5, 4.75, 8],
  ['questions', 'reveal', 7.9, 8.2, 6],
  ['reveal', 'cache', 12.5, 12.85, 3],
  ['cache', 'five', 19.0, 19.3, 2],
  ['five', 'seven', 23.0, 23.3, 2],
  ['seven', 'context', 26.5, 26.8, 2],
  ['context', 'adapt', 31.0, 31.4, 9],
  ['adapt', 'install', 36.0, 36.35, 7],
  ['install', 'payoff', 40.0, 40.3, 10],
  ['payoff', 'finale', 42.0, 42.25, 6],
]

// The two drops, where the music and the picture hit hardest.
export const DROPS = [8, 42]
