import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Ctx, Limit } from '../types'

const cacheAt = atom({ plugin: 'usage-line', key: 'cacheAt' } as const, null as number | null)
const cacheTtl = atom({ plugin: 'usage-line', key: 'cacheTtl' } as const, 0)
// The TTL Claude Code itself reports (on a model switch); 0 until it has said.
const knownTtl = atom({ plugin: 'usage-line', key: 'knownTtl' } as const, 0)
const now = atom({ plugin: 'usage-line', key: 'now' } as const, 0)
const ctx = atom({ plugin: 'usage-line', key: 'ctx' } as const, null as Ctx | null)
const limits = atom({ plugin: 'usage-line', key: 'limits' } as const, [] as Limit[])

const MINUTE = 60_000
const HOUR = 60 * MINUTE

// The footer's own progress ring: a thin grey track with a blue arc from 12 o'clock.
const BLUE = '#4e8ff7'
const AMBER = '#e5a33a'
const RED = '#e5534b'
const GREY = '#8a8a8a'
const ringColor = (p: number) => (p >= 90 ? RED : p >= 70 ? AMBER : BLUE)

const WINDOWS = [
  { kind: 'five_hour', label: '5h', name: '5 小时额度' },
  { kind: 'seven_day', label: '7d', name: '7 天额度' },
]

function span(ms: number): string {
  const m = Math.max(0, Math.round(ms / MINUTE))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d) return `${d}d${h}h`
  if (h) return `${h}h${m % 60}m`
  return `${m}m`
}

// Always mm:ss, so the row does not shift when the minutes drop below ten.
function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const resetTime = (l: Limit) => (l.resetsAt ? Date.parse(l.resetsAt) : NaN)
const isReset = (l: Limit, t: number) => resetTime(l) <= t

// Text pies for the terminal, which draws no Svg. Any non-zero amount shows at least a quarter.
const pie = (frac: number) => {
  const f = Math.min(1, Math.max(0, frac))
  return ['○', '◔', '◑', '◕', '●'][f === 0 ? 0 : Math.max(1, Math.round(f * 4))]
}

// An empty ring takes `color` on its track, so an expired cache reads red rather than idle grey.
function ringSvg(frac: number, color: string): string {
  const r = 6
  const C = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, frac))
  const track = p === 0 && color !== GREY ? `stroke="${color}" stroke-opacity="0.6"` : `stroke="${GREY}" stroke-opacity="0.35"`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">` +
    `<circle cx="8" cy="8" r="${r}" fill="none" ${track} stroke-width="2"/>` +
    (p > 0
      ? `<circle cx="8" cy="8" r="${r}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" ` +
        `stroke-dasharray="${Math.max(1.5, C * p).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 8 8)"/>`
      : '') +
    `</svg>`
  )
}

type Item = {
  key: string
  frac: number
  color: string
  value: string
  label: string
  shortLabel: string
  alt: string
  // Cells the value keeps however its digits run, so a ticking clock does not shift the row.
  minCells?: number
}

// The four figures, in order: cache left, 5h used, 7d used, context used.
async function items($: EngineInterface, baseTtl: number): Promise<Item[]> {
  const rl = await read($, limits)
  const at = await read($, cacheAt)
  const ttl = (await read($, cacheTtl)) || baseTtl
  const t = await read($, now)
  const c = await read($, ctx)

  const left = at === null ? 0 : ttl - (t - at)
  const isWarm = at !== null && left > 0
  const cacheValue = at === null ? '--:--' : isWarm ? clockText(left) : '过期'
  const out: Item[] = [
    {
      key: 'cache',
      frac: isWarm ? left / ttl : 0,
      color: at === null ? GREY : !isWarm ? RED : left < MINUTE ? AMBER : BLUE,
      value: cacheValue,
      label: '缓存',
      shortLabel: '缓存',
      alt: at === null ? '缓存：等待第一次请求' : isWarm ? `缓存剩余 ${cacheValue}` : '缓存已过期',
      minCells: 5,
    },
  ]
  for (const w of WINDOWS) {
    const lim = rl.find(l => l.kind === w.kind)
    // A window whose reset has passed starts over at zero until the next reading.
    const isPast = !!lim && isReset(lim, t)
    const p = !lim || isPast ? 0 : Math.min(100, lim.percentUsed)
    const reset = lim && !isPast && !Number.isNaN(resetTime(lim)) ? span(resetTime(lim) - t) : ''
    const value = lim ? `${Math.round(p)}%` : '–'
    out.push({
      key: w.kind,
      frac: p / 100,
      color: lim ? ringColor(p) : GREY,
      value,
      label: reset ? `${w.label} ↻${reset}` : w.label,
      shortLabel: w.label,
      alt: lim ? `${w.name}已用 ${value}${reset ? `，${reset} 后重置` : ''}` : `${w.name}：等待数据`,
    })
  }
  const cp = c?.percent
  out.push({
    key: 'ctx',
    frac: (cp ?? 0) / 100,
    color: cp === undefined ? GREY : ringColor(cp),
    value: cp === undefined ? '–' : `${cp}%`,
    label: '上下文',
    shortLabel: '上下文',
    alt: cp === undefined ? '上下文：等待数据' : `上下文已用 ${cp}%`,
  })
  return out
}

// Width in the surface's cells: a CJK character takes two, the ring two, a gap one.
const WIDE = /[⺀-鿿豈-﫿＀-￯]/
const cells = (s: string) => [...s].reduce((n, ch) => n + (WIDE.test(ch) ? 2 : 1), 0)
const rowCells = (row: Item[], labelOf: (it: Item) => string) =>
  row.reduce((n, it) => {
    const label = labelOf(it)
    return n + 3 + Math.max(cells(it.value), it.minCells ?? 0) + (label ? 1 + cells(label) : 0)
  }, 2 * (row.length - 1) + 2)

// The fullest labels that fit: reset countdowns go first, then the labels themselves.
const fullLabel = (it: Item) => it.label
const shortLabel = (it: Item) => it.shortLabel
const noLabel = () => ''
function labelsFor(row: Item[], columns: number): (it: Item) => string {
  if (!(columns > 0)) return fullLabel
  return [fullLabel, shortLabel].find(labelOf => rowCells(row, labelOf) <= columns) ?? noLabel
}

export const register: Register = (on, options) => {
  const baseTtl = options.cacheTtl === '5m' ? 5 * MINUTE : HOUR

  on('session.start', async ($, e, next) => {
    try {
      const u = await $.session.usage()
      await update($, ctx, () => u.context)
      if (u.rateLimits.length) await update($, limits, () => u.rateLimits)
      const t0 = await $.clock.now()
      await update($, now, () => t0)
    } catch {}

    // One clock: every second while the cache is counting down, otherwise once a minute
    // (enough for the reset countdowns), so an idle session redraws almost never.
    let healedAt = 0
    $.clock.every(1_000, async () => {
      try {
        const t = await $.clock.now()
        const at = await read($, cacheAt)
        const ttl = (await read($, cacheTtl)) || baseTtl
        const isCounting = at !== null && t - at < ttl + 2_000
        if (!isCounting && t - (await read($, now)) < MINUTE) return
        await update($, now, () => t)
        if (t - healedAt < MINUTE) return
        healedAt = t
        // Refill figures the session dropped (a /clear goes on under a new session id).
        const u = await $.session.usage()
        if (u.rateLimits.length && !(await read($, limits)).length) await update($, limits, () => u.rateLimits)
        if ((await read($, ctx)) === null) await update($, ctx, () => u.context)
      } catch {}
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    try {
      if (e.changed.includes('context')) await update($, ctx, () => e.context)
      if (e.rateLimits.length && e.changed.includes('rateLimits')) await update($, limits, () => e.rateLimits)
    } catch {}
    return next(e)
  })

  // Each main-thread model request reads, and so refreshes, the conversation's prompt cache;
  // a subagent's request has a cache of its own. The countdown restarts as the request goes
  // out and goes back if it never reached the cache (no response, or caching off).
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    // The bookkeeping never stands in the request's way: if it fails, the step just passes.
    let sent: { t: number; prevAt: number | null; prevTtl: number } | null = null
    try {
      const t = await $.clock.now()
      const prevAt = await read($, cacheAt)
      const prevTtl = await read($, cacheTtl)
      // Requests on extra usage past a spent window are cached for five minutes, not an hour.
      const isOverage = (await read($, limits)).some(
        l => WINDOWS.some(w => w.kind === l.kind) && l.percentUsed >= 100 && !isReset(l, t),
      )
      const ttl = isOverage ? 5 * MINUTE : (await read($, knownTtl)) || baseTtl
      await update($, cacheTtl, () => ttl)
      await update($, cacheAt, () => t)
      await update($, now, () => t)
      sent = { t, prevAt, prevTtl }
    } catch {}
    let isCached = false
    try {
      const r = yield* next(e)
      isCached = !!r.usage && r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens > 0
      return r
    } finally {
      if (sent && !isCached) {
        const { t, prevAt, prevTtl } = sent
        try {
          let isReverted = false
          await update($, cacheAt, cur => {
            isReverted = cur === t
            return isReverted ? prevAt : cur
          })
          if (isReverted) await update($, cacheTtl, () => prevTtl)
        } catch {}
      }
    }
  })

  // A resumed or forked session carries how long ago its last response was, and whether
  // Claude Code reckons the cache lapsed; a /clear or compaction changes the context fill.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    try {
      const t = await $.clock.now()
      const s = e.seconds_since_last_response
      if ((e.source === 'resume' || e.source === 'fork') && typeof s === 'number' && s >= 0) {
        // Claude Code knows the real TTL: a cache it calls live past five minutes is the hour one,
        // and one it calls lapsed stays lapsed whatever TTL is learned later.
        const base = (await read($, knownTtl)) || baseTtl
        const ttl = e.prompt_cache_likely_expired === false && s * 1000 >= base ? HOUR : base
        await update($, cacheTtl, () => ttl)
        await update($, cacheAt, () => (e.prompt_cache_likely_expired ? t - HOUR - 1000 : t - s * 1000))
        await update($, now, () => t)
      }
      if (e.source === 'clear' || e.source === 'compact') {
        const u = await $.session.usage()
        await update($, ctx, () => u.context)
      }
    } catch {}
    return r
  })

  // The prompt cache is per model: after a switch the next request starts a new one. A switch
  // also says the TTL Claude Code caches with, which beats the setting from then on.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const r = await next(e)
    try {
      const ttl = e.cache_ttl === '5m' ? 5 * MINUTE : HOUR
      await update($, knownTtl, () => ttl)
      await update($, cacheTtl, () => ttl)
      if (e.source !== 'resume' && e.from_model !== e.to_model) await update($, cacheAt, () => null)
    } catch {}
    return r
  })

  // One slim row directly above the prompt, on its own line so nothing else crowds it out.
  // The desktop draws rings (its footer slot by the model picker draws text only); the
  // terminal draws text pies in the ring colours. As the band narrows the reset countdowns
  // go first, then the labels; past that the row wraps rather than hides.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const row = await items($, baseTtl)
    const labelOf = labelsFor(row, e.props.bodyColumns)
    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e as typeof e & { surface: 'terminal' })
      return (
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={0} paddingX={1}>
          {row.map(it => {
            const label = labelOf(it)
            return (
              <Box key={it.key} flexDirection="row" gap={1} flexShrink={0}>
                <Text color={it.color}>{pie(it.frac)}</Text>
                {it.minCells ? (
                  <Box minWidth={it.minCells}>
                    <Text>{it.value}</Text>
                  </Box>
                ) : (
                  <Text>{it.value}</Text>
                )}
                {label ? <Text dimColor>{label}</Text> : null}
              </Box>
            )
          })}
        </Box>
      )
    }
    if (e.surface !== 'desktop' && e.surface !== 'vscode') return next(e)
    const { Box, Text, Svg } = $.ui.resolve(e as typeof e & { surface: 'desktop' })
    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={0} paddingX={1}>
        {row.map(it => {
          const label = labelOf(it)
          return (
            <Box key={it.key} flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
              <Svg source={ringSvg(it.frac, it.color)} alt={it.alt} width={16} height={16} />
              {it.minCells ? (
                <Box minWidth={it.minCells}>
                  <Text>{it.value}</Text>
                </Box>
              ) : (
                <Text>{it.value}</Text>
              )}
              {label ? <Text dimColor>{label}</Text> : null}
            </Box>
          )
        })}
      </Box>
    )
  })
}
