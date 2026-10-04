// The trailer's clock, shared by the picture and the score. 120 BPM: a beat is 0.5 s, a bar 2 s,
// and every cut lands on the grid.
export const DUR = 52
export const BEAT = 0.5

// Shot windows (they overlap where a transition joins two).
export const SHOTS = {
  tunnel: [0, 4.3],
  logo: [3.9, 8.3],
  product: [7.7, 14.35],
  cache: [13.8, 22.25],
  limits: [21.75, 30.3],
  context: [29.7, 34.3],
  terminal: [33.75, 46.3],
  finale: [45.75, 52],
}

// Transitions: [from, to, start, end, kind]. kinds: 2 iris · 3 zoom-through · 4 whip ·
// 5 light-line wipe · 6 flash.
export const CUTS = [
  ['tunnel', 'logo', 3.9, 4.3, 6],
  ['logo', 'product', 7.7, 8.3, 2],
  ['product', 'cache', 13.8, 14.35, 3],
  ['cache', 'limits', 21.75, 22.25, 4],
  ['limits', 'context', 29.7, 30.3, 5],
  ['context', 'terminal', 33.75, 34.3, 4],
  ['terminal', 'finale', 45.75, 46.3, 6],
]

// Where the music hits hardest: the picture punches with it.
export const DROPS = [8, 20.2, 46]
// Sections where the kick runs (the camera breathes on each one).
export const GROOVE = [
  [8, 19.4],
  [20.2, 30],
  [34, 44],
  [46, 50],
]
