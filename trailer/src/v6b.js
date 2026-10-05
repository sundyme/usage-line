// v6 · ADAPT, on the v6 clock (22.0–29.0). The window narrows and the row folds its labels;
// the window then changes shape into a terminal; a message goes out, and the camera settles
// in close on the pie glyphs as the cache refills.
import { E, clamp, keys, lerp, prog, tw } from './engine.js'
import { panel, shoot } from './kit.js'
import { BLUE, F, measure, pie, rowItems, text } from './ui.js'
import { CC, drawPrompt, drawUsageRow } from './cc.js'
import { D, FOV, INK, at, head, line, pool, stage } from './stage.js'

const C = { x: 960, y: 590 } // both panels share this centre, screen px
const M = { w: 1400, h: 560 } // the morph canvas: holds the window and the terminal
const WIN = { h: 470, r: 18 }
const TERM = { w: 1200, h: 480, r: 16 }
const MORPH = [25.2, 26.0]
const CMD = '再补一组单元测试'
const TYPE0 = 25.95
const SEND = 26.7
const REPLY = 27.55
const REFILL = [27.6, 28.0]

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const mix = (a, b, p) => `rgb(${hex(a).map((v, i) => Math.round(lerp(v, hex(b)[i], p))).join(',')})`
const blink = t => Math.floor(t * 2.2) % 2 === 0

function cacheAt(t) {
  const c0 = 2487 - (REFILL[0] - 22)
  if (t < REFILL[0]) return 2487 - (t - 22)
  if (t < REFILL[1]) return lerp(c0, 3600, E.outCubic(prog(t, ...REFILL)))
  return 3599.5 - (t - REFILL[1])
}

// window contents, drawn inside a w × WIN.h rect at the origin
function windowBody(ctx, w, t, items, mode) {
  ;['#ed6a5e', '#f4bf4f', '#61c554'].forEach((c, i) => {
    ctx.beginPath()
    ctx.arc(30 + i * 24, 26, 7, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
  })
  ctx.fillStyle = CC.line
  ctx.fillRect(0, 52, w, 1.5)
  text(ctx, '好的。先读一下现有实现，再拆成三个文件。', 40, 112, F.reg(25), CC.ink)
  text(ctx, '● Bash  bun test  18 pass', 40, 162, F.mono(22), CC.dim)
  text(ctx, '拆分完成，测试全部通过。', 40, 212, F.reg(25), CC.ink)
  drawUsageRow(ctx, 46, 264, items, { size: 22, mode })
  drawPrompt(ctx, 30, 296, t, { w: w - 60, h: 134, caret: true })
}

// terminal contents, drawn inside a TERM rect at the origin
function termBody(ctx, t, items) {
  const { w } = TERM
  const mono = F.mono(26)
  ;['#ed6a5e', '#f4bf4f', '#61c554'].forEach((c, i) => {
    ctx.beginPath()
    ctx.arc(28 + i * 22, 24, 6.5, 0, Math.PI * 2)
    ctx.fillStyle = c
    ctx.fill()
  })
  text(ctx, '~/api-server — claude', w / 2, 30, F.mono(18), '#777', { align: 'center' })
  text(ctx, '✻ Welcome to Claude Code', 36, 96, mono, CC.orange)
  text(ctx, '❯ 把 token 统计拆成独立模块', 36, 146, mono, '#8d8d8d')
  text(ctx, '⏺ 拆分完成，测试全部通过。', 36, 192, mono, '#d4d4d4')
  const sent = t >= SEND
  // on enter, the line goes into the history; the row and the prompt move down beneath it
  const rel = E.inOutCubic(prog(t, SEND, SEND + 0.3))
  if (sent) {
    ctx.save()
    ctx.globalAlpha = tw(t, SEND + 0.08, SEND + 0.3)
    text(ctx, `❯ ${CMD}`, 36, lerp(250, 238, rel), mono, '#8d8d8d')
    ctx.restore()
  }
  if (sent && t < REPLY) {
    ctx.save()
    ctx.globalAlpha = tw(t, SEND + 0.2, SEND + 0.35)
    text(ctx, `${'✻✳✢·'[Math.floor(t * 12) % 4]} Thinking…`, 36, 284, mono, CC.orange)
    ctx.restore()
  }
  if (t >= REPLY) {
    ctx.save()
    ctx.globalAlpha = tw(t, REPLY, REPLY + 0.12)
    text(ctx, '⏺ 已补 6 个测试，全部通过。', 36, 284, mono, '#d4d4d4')
    ctx.restore()
  }
  const off = 92 * rel
  // usage-line's own row, directly above the prompt, as the terminal draws it: pie glyphs
  const ry = 246 + off
  const f = F.mono(24)
  let x = 38
  items.forEach(it => {
    pie(ctx, x + 10, ry - 8, 10, it.frac, it.color)
    text(ctx, it.value, x + 30, ry, f, '#e2e2e2')
    const lw = measure(ctx, it.value, f)
    text(ctx, it.label, x + 44 + lw, ry, f, '#7a7a7a')
    x += 44 + lw + measure(ctx, it.label, f) + 30
  })
  // the prompt between two rules, and the engine's hint line under it
  ctx.fillStyle = '#4a4a4a'
  ctx.fillRect(20, 268 + off, w - 40, 1.5)
  ctx.fillRect(20, 328 + off, w - 40, 1.5)
  text(ctx, '❯', 38, 307 + off, mono, '#cfcfcf')
  const typed = sent ? '' : CMD.slice(0, clamp(Math.floor((t - TYPE0) / 0.085) + 1, 0, CMD.length))
  text(ctx, typed, 72, 307 + off, mono, '#e8e8e8')
  if ((blink(t) || (t > TYPE0 && t < SEND)) && !(t >= SEND && t < SEND + 0.3)) {
    ctx.fillStyle = '#cfcfcf'
    ctx.fillRect(74 + measure(ctx, typed, mono), 284 + off, 14, 29)
  }
  text(ctx, '? for shortcuts', 38, 364 + off, F.mono(21), '#6f6f6f')
}

export function adapt6() {
  const { s, bg, back, front } = stage()
  const morph = panel(M.w, M.h, { res: 1.6 })
  const term = panel(TERM.w, TERM.h, { res: 3 })
  morph.position.set(...at(C.x, C.y), 0)
  term.position.set(...at(C.x, C.y), 0.001)
  s.scene.add(morph, term)
  s.update = t => {
    bg.userData.tick(t)
    const winItems = rowItems({ cacheLeft: 3540 - (t - 22), five: 9, seven: 67, ctx: 40, fiveReset: 246, sevenReset: 4618 })
    const termItems = rowItems({ cacheLeft: cacheAt(t), five: 11, seven: 67, ctx: 46, fiveReset: 240, sevenReset: 4612 })
    const w = keys(t, [[22.9, 1400], [23.7, 980, E.inOutQuint], [24.2, 980], [25.0, 660, E.inOutQuint]])
    const mode = w > 1150 ? 'full' : w > 800 ? 'short' : 'none'
    const m = E.inOutQuint(prog(t, ...MORPH))
    const done = t >= MORPH[1]
    // one rect, two lives: the window becomes the terminal
    morph.visible = !done
    if (!done) {
      const rw = lerp(w, TERM.w, m)
      const rh = lerp(WIN.h, TERM.h, m)
      const x0 = (M.w - rw) / 2
      const y0 = (M.h - rh) / 2
      const key = `${Math.round(rw)}${mode}${winItems[0].value}${blink(t)}${Math.round(m * 60)}`
      morph.userData.draw(key, ctx => {
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x0 + 1, y0 + 1, rw - 2, rh - 2, lerp(WIN.r, TERM.r, m))
        ctx.fillStyle = mix(CC.bg, '#0c0c0c', m)
        ctx.fill()
        ctx.strokeStyle = mix(CC.line, '#2b2b2b', m)
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.clip()
        const wa = 1 - E.inOutSine(prog(m, 0.0, 0.4))
        if (wa > 0) {
          ctx.save()
          ctx.globalAlpha = wa
          ctx.translate(x0, y0)
          windowBody(ctx, w, t, winItems, mode)
          ctx.restore()
        }
        const ta = E.inOutSine(prog(m, 0.55, 0.95))
        if (ta > 0) {
          ctx.save()
          ctx.globalAlpha = ta
          ctx.translate((M.w - TERM.w) / 2, (M.h - TERM.h) / 2)
          termBody(ctx, t, termItems)
          ctx.restore()
        }
        ctx.restore()
      })
    }
    term.visible = done
    if (done) {
      const busy = t > TYPE0 && t < REPLY + 0.15 // typing, thinking, the box sliding, the reply fading in
      const key = `${termItems[0].value}${termItems[0].frac.toFixed(2)}${blink(t)}${busy ? Math.floor(t * 60) : t >= REPLY}`
      term.userData.draw(key, ctx => {
        ctx.beginPath()
        ctx.roundRect(1, 1, TERM.w - 2, TERM.h - 2, TERM.r)
        ctx.fillStyle = '#0c0c0c'
        ctx.fill()
        ctx.strokeStyle = '#2b2b2b'
        ctx.lineWidth = 1.5
        ctx.stroke()
        termBody(ctx, t, termItems)
      })
    }
    // the camera: ease in on the folding row, ease back for the terminal, then close in on the glyphs
    const row = [C.x - TERM.w / 2 + 520, C.y - TERM.h / 2 + 330]
    const cam = keys(t, [
      [22.0, [C.x, C.y - 30, 0.92]],
      [25.1, [C.x, C.y - 30, 0.82], E.inOutSine],
      [26.0, [C.x, C.y - 30, 0.8], E.inOutCubic],
      [26.75, [C.x, C.y - 30, 0.78], E.lin],
      [27.55, [row[0], row[1] - 40, 0.55], E.inOutQuart],
      [29.3, [row[0] + 20, row[1] - 40, 0.52], E.lin],
    ])
    const close = E.inOutQuart(prog(t, 26.75, 27.55))
    const [tx, ty] = at(cam[0], cam[1])
    shoot(s.camera, t, [tx + 0.9 * close, ty - 0.25 * close, D * cam[2]], [tx, ty, 0], FOV, { drift: 0.012 })
    back.draw(ctx => {
      pool(ctx, row[0] + 120, row[1], 700, BLUE, 0.1 * close + 0.12 * close * Math.exp(-Math.max(0, t - REFILL[0]) * 2.5) * (t > REFILL[0]))
      return true
    })
    front.draw(ctx => {
      head(ctx, t, '窗口再窄，', '也不拥挤。', { t0: 22.4, t1: 25.15, x: 120, y: 150, size: 68 })
      head(ctx, t, '终端里，', '一样原生。', { t0: 25.75, t1: 27.0, x: 120, y: 150, size: 68 })
      line(ctx, '圆环换成字符，缓存照样读秒。', 960, 1000, 42, t, { t0: 27.85, t1: 29.0, color: INK, align: 'center' })
    })
  }
  return s
}
