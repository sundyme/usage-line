// The film's clock, shared by the picture (render.mjs) and read by the score (score.py).
export const DUR = 44

// Each scene draws inside its window; neighbours overlap so cuts can dissolve and match.
export const S = {
  questions: { from: 0, to: 5.6 },
  oneLine: { from: 4.9, to: 10.4 },
  inPlace: { from: 9.9, to: 16.15 },
  cache: { from: 15.85, to: 24.3 },
  limits: { from: 23.9, at: 24, to: 30.3 },
  context: { from: 30.0, to: 32.85 },
  adaptive: { from: 32.5, to: 38.3 },
  install: { from: 37.9, to: 44 },
  // where the chapter label in the corner changes
  chapters: [0, 6, 10, 16, 24, 30, 32.5, 38],
}
