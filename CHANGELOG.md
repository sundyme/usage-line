# Changelog

## 1.1.0 — 2026-10-05

- Terminal: the row now has its own line directly above the prompt, with the text pies in
  the ring colours. Before, it rode the end of the hint row under the prompt, where mode
  hints such as `auto mode on (shift+tab to cycle)` crowded it and a slightly narrow window
  cut it off. Now, as on desktop, a narrow terminal drops the reset countdowns, then the
  labels, and past that the row wraps instead of hiding.
- 20 tests.

## 1.0.0 — 2026-10-04

First public release.

- One slim row above the prompt on desktop and VS Code: prompt-cache countdown, 5-hour and
  7-day usage with reset countdowns, and context fill, as native-style rings.
- Terminal: the same line as a dim tail on the prompt's hint row, with text pies.
- Cache countdown driven by main-thread requests that actually touched the cache; 1 h on a
  subscription, 5 m on extra usage past a spent window; resume, fork, model switch and
  `/clear` handled.
- Narrow windows drop the reset countdowns, then the labels; the row never squeezes.
- 18 tests, strict type contract for the plugin's state.
