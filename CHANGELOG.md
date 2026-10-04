# Changelog

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
