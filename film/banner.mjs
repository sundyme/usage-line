// The README banner card and the repository's social preview, drawn with the film's own
// primitives so the two read as one piece.
//
//   node banner.mjs   →   ../assets/banner.png (rounded card), ../assets/social-preview.png
import { createCanvas } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

import { F, BG, SURFACE, SURFACE2, FG, DIM, FAINT, BLUE, AMBER, TAU, rgba, text, measure, ring, drawRow, rowItems, lockup, glowSpot, roundRect } from './render.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(HERE, '..', 'assets')
const W = 1280
const H = 640
const K = 2 // drawn at 2× for sharp text on high-density screens

function draw(ctx, { card }) {
  ctx.save()
  ctx.scale(K, K)
  if (card) {
    roundRect(ctx, 0, 0, W, H, 28)
    ctx.clip()
  }
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  const v = ctx.createRadialGradient(W * 0.45, H * 0.45, H * 0.2, W * 0.5, H * 0.5, H * 1.1)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
  glowSpot(ctx, 1010, 300, 520, BLUE, 0.12)
  glowSpot(ctx, 260, 560, 420, BLUE, 0.05)
  // dot grid
  ctx.fillStyle = rgba(FG, 0.06)
  for (let y = 20; y < H; y += 32) for (let x = 16; x < W; x += 32) ctx.fillRect(x, y, 1.2, 1.2)

  // the dial: the cache ring, three quarters left, minute ticks lit beneath it
  const cx = 1035
  const cy = 300
  const r = 172
  const frac = 0.7
  for (let i = 0; i < 60; i++) {
    const a = -Math.PI / 2 + (i / 60) * TAU
    const major = i % 5 === 0
    const lit = i / 60 < frac
    const r1 = r + 30
    const r2 = r1 + (major ? 14 : 7)
    ctx.strokeStyle = lit ? rgba(BLUE, major ? 0.9 : 0.55) : rgba(FG, major ? 0.22 : 0.1)
    ctx.lineWidth = major ? 2 : 1.4
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
    ctx.stroke()
  }
  ring(ctx, cx, cy, r, 18, frac, BLUE, { glow: 26 })
  text(ctx, '42:17', cx, cy + 22, F.monoB(76), FG, { align: 'center' })
  text(ctx, '缓存剩余  ·  PROMPT CACHE', cx, cy + 62, F.mono(13), DIM, { align: 'center' })

  // the mark and the words
  ctx.save()
  const lw = measure(ctx, 'usage-line', F.mono(100))
  const lockW = 46 + 128 + lw + 46
  const sc = 0.42
  lockup(ctx, 72 + (lockW * sc) / 2, 92, sc, { ringP: 0.83, word: 1, glow: 10 })
  ctx.restore()
  text(ctx, '一行，全看清。', 70, 228, F.black(76), FG)
  text(ctx, 'Everything you need to know, in one line.', 72, 276, F.serif(30), DIM)
  text(ctx, '缓存倒计时  ·  5 小时 / 7 天额度与重置  ·  上下文占用', 72, 318, F.reg(17), DIM)

  // the product itself: the row above the prompt
  const px = 56
  const py = 400
  const pw = 760
  roundRect(ctx, px, py, pw, 180, 20)
  ctx.fillStyle = SURFACE
  ctx.fill()
  ctx.strokeStyle = rgba(FG, 0.1)
  ctx.lineWidth = 1
  ctx.stroke()
  drawRow(ctx, px + 22, py + 36, rowItems({ cacheLeft: 2537, five: 47, seven: 74, ctx: 25, fiveReset: 151, sevenReset: 6000 }), { size: 19 })
  roundRect(ctx, px + 14, py + 66, pw - 28, 100, 14)
  ctx.fillStyle = SURFACE2
  ctx.fill()
  ctx.strokeStyle = rgba(FG, 0.09)
  ctx.stroke()
  text(ctx, '继续说点什么…', px + 34, py + 104, F.reg(18), FAINT)
  ctx.beginPath()
  ctx.arc(px + pw - 42, py + 138, 14, 0, TAU)
  ctx.fillStyle = rgba(FG, 0.85)
  ctx.fill()
  ctx.strokeStyle = BG
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(px + pw - 42, py + 144)
  ctx.lineTo(px + pw - 42, py + 132)
  ctx.moveTo(px + pw - 47, py + 137)
  ctx.lineTo(px + pw - 42, py + 132)
  ctx.lineTo(px + pw - 37, py + 137)
  ctx.stroke()

  // legend under the dial
  const ly = 548
  ;[
    ['< 70%', BLUE],
    ['≥ 70%', AMBER],
    ['≥ 90%', '#e5534b'],
  ].forEach(([l, c], i) => {
    const x = 905 + i * 92
    ring(ctx, x, ly - 5, 6, 2.2, 0.75, c)
    text(ctx, l, x + 13, ly, F.mono(13), DIM)
  })

  // chrome
  text(ctx, 'FOR CLAUDE CODE', W - 40, 46, F.mono(12), DIM, { align: 'right' })
  text(ctx, 'v1.0  ·  MIT', W - 40, H - 34, F.mono(12), DIM, { align: 'right' })
  if (card) {
    ctx.restore()
    ctx.save()
    ctx.scale(K, K)
    roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 28)
    ctx.strokeStyle = rgba(FG, 0.1)
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.restore()
}

fs.mkdirSync(ASSETS, { recursive: true })
for (const [name, card] of [
  ['banner.png', true],
  ['social-preview.png', false],
]) {
  const c = createCanvas(W * K, H * K)
  draw(c.getContext('2d'), { card })
  fs.writeFileSync(path.join(ASSETS, name), await c.encode('png'))
  console.log(name)
}
