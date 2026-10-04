import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionUsage, TurnUsage } from 'claude-code'

const PLUGIN = 'usage-line'
const MIN = 60_000
const HOUR = 60 * MIN
const T0 = Date.parse('2026-10-04T12:00:00.000Z')
const RED = '#e5534b'
const AMBER = '#e5a33a'
const NBSP = ' '

const CACHED: TurnUsage = {
  input_tokens: 12,
  output_tokens: 80,
  cache_read_input_tokens: 40_000,
  cache_creation_input_tokens: 600,
  model: 'claude-opus-5-5',
}

function usageAt(fiveHour = 12.5, sevenDay = 63): SessionUsage {
  return {
    startedAt: T0,
    context: { window: 200_000, tokens: 50_000, percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: fiveHour, resetsAt: new Date(T0 + 2 * HOUR + 54 * MIN).toISOString() },
      { kind: 'seven_day', percentUsed: sevenDay, resetsAt: new Date(T0 + 101 * HOUR).toISOString() },
    ],
  }
}

// Everything beneath the plugin in a session: the state store, the usage figures, the
// clock, and the engine's own answer to each event the plugin passes on. A call on `$`
// (state, usage) is answered `{ value }`; an engine event with its result itself.
function world(on: On) {
  const w = { usage: usageAt(), step: CACHED as TurnUsage | null, tails: [] as string[] }
  const values = new Map<string, { value: unknown; version: number }>()
  const address = (e: { plugin: string; key: string; id?: string }) => `${e.plugin}/${e.key}/${e.id ?? ''}`
  on('state.get', (_$, e) => {
    const v = values.get(address(e))
    return { value: { value: v?.value, version: v?.version ?? 0 } }
  })
  on('state.set', (_$, e) => {
    const version = values.get(address(e))?.version ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false as const, version } }
    values.set(address(e), { value: e.value, version: version + 1 })
    return { value: { isSet: true as const, version: version + 1 } }
  })
  on('session.usage', () => ({ value: w.usage }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: w.step ? 'end_turn' : null, usage: w.step }
  })
  on('classic.SessionStart', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  on('ui.render', { component: 'PromptHint' }, (_$, e) => {
    w.tails.push(e.props.tail ?? '')
    return { type: 'Text', children: [e.props.hint] }
  })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: { key: 'engine-band' } }))
  const clock = mock.clock(on, { now: T0 })
  return { w, clock }
}

const start = ($: Engine) => $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

async function step($: Engine, agentId?: string) {
  const s = $.turn.step({ turnId: 'turn-1', index: 0, model: 'claude-opus-5-5', messageCount: 2, ...(agentId ? { agentId } : {}) })
  for await (const _ of s) {
  }
  return s.result
}

async function band($: Engine, bodyColumns = 120, hasSurvey = false) {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows: 8, bodyColumns, scroll: { offset: 0, bodyRows: 8 }, view: {} },
  })
  return {
    ui,
    texts: (await ui.findAll({ type: 'Text' })).map(t => t.text),
    rings: (await ui.findAll({ type: 'Svg' })).map(s => s.props as { source: string; alt: string }),
  }
}

describe('desktop band', () => {
  test('shows each figure with its label before the first request', async ($, on) => {
    world(on)
    await start($)
    const { texts, rings } = await band($)
    expect(texts).toEqual(['--:--', '缓存', '13%', `5h${NBSP}↻2h54m`, '63%', `7d${NBSP}↻4d5h`, '25%', '上下文'])
    expect(rings.map(r => r.alt)).toEqual([
      '缓存：等待第一次请求',
      '5 小时额度已用 13%，2h54m 后重置',
      '7 天额度已用 63%，4d5h 后重置',
      '上下文已用 25%',
    ])
  })

  test('counts the cache down from the request that reached it', async ($, on) => {
    const { clock } = world(on)
    await start($)
    await step($)
    expect((await band($)).texts[0]).toBe('60:00')
    await clock.advance(61_000)
    expect((await band($)).texts[0]).toBe('58:59')
  })

  test('a subagent request leaves the countdown alone', async ($, on) => {
    world(on)
    await start($)
    await step($, 'agent-7')
    expect((await band($)).texts[0]).toBe('--:--')
  })

  test('a request with no response goes back to the last cached one', async ($, on) => {
    const { w, clock } = world(on)
    await start($)
    await step($)
    await clock.advance(10 * MIN)
    w.step = null
    await step($)
    expect((await band($)).texts[0]).toBe('50:00')
  })

  test('a request that touched no cache leaves the countdown alone', async ($, on) => {
    const { w } = world(on)
    await start($)
    w.step = { ...CACHED, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    await step($)
    expect((await band($)).texts[0]).toBe('--:--')
  })

  // A five-minute cache (here from extra usage) reaches its last minute and lapses quickly.
  test('the last minute is amber and an expired cache is red', async ($, on) => {
    const { w, clock } = world(on)
    w.usage = usageAt(100)
    await start($)
    await step($)
    await clock.advance(4 * MIN + 30_000)
    const late = await band($)
    expect(late.texts[0]).toBe('00:30')
    expect(late.rings[0]?.source).toContain(AMBER)
    await clock.advance(31_000)
    const gone = await band($)
    expect(gone.texts[0]).toBe('过期')
    expect(gone.rings[0]?.alt).toBe('缓存已过期')
    expect(gone.rings[0]?.source).toContain(`stroke="${RED}" stroke-opacity="0.6"`)
  })

  test('extra usage past a spent window caches for five minutes', async ($, on) => {
    const { w } = world(on)
    w.usage = usageAt(100)
    await start($)
    await step($)
    const { texts, rings } = await band($)
    expect(texts[0]).toBe('05:00')
    expect(texts[2]).toBe('100%')
    expect(rings[1]?.source).toContain(RED)
  })

  test('a window past its reset reads zero, with no countdown', async ($, on) => {
    const { w } = world(on)
    w.usage = { ...usageAt(), rateLimits: [{ kind: 'five_hour', percentUsed: 97, resetsAt: new Date(T0 - MIN).toISOString() }] }
    await start($)
    const { texts } = await band($)
    expect(texts.slice(2, 6)).toEqual(['0%', '5h', '–', '7d'])
  })

  test('usage readings move the rings', async ($, on) => {
    world(on)
    await start($)
    await $.session.measure({
      context: { window: 200_000, tokens: 80_000, percent: 40 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 71, resetsAt: new Date(T0 + HOUR).toISOString() }],
      changed: ['context', 'rateLimits'],
    })
    const { texts, rings } = await band($)
    expect(texts[2]).toBe('71%')
    expect(rings[1]?.source).toContain(AMBER)
    expect(texts[texts.length - 2]).toBe('40%')
  })

  test('narrow bands drop the reset countdowns, then the labels, never squeezing', async ($, on) => {
    world(on)
    await start($)
    expect((await band($, 65)).texts).toContain(`5h${NBSP}↻2h54m`)
    expect((await band($, 60)).texts).toEqual(['--:--', '缓存', '13%', '5h', '63%', '7d', '25%', '上下文'])
    expect((await band($, 40)).texts).toEqual(['--:--', '13%', '63%', '25%'])
    const tree = JSON.stringify(await (await band($, 20)).ui.drawn())
    expect(tree).toContain('"flexWrap":"wrap"')
    expect(tree).toContain('"flexShrink":0')
  })

  test('a survey keeps the band', async ($, on) => {
    world(on)
    await start($)
    expect(await (await band($, 120, true)).ui.find({ key: 'engine-band' })).toBeDefined()
  })
})

const SWITCH = {
  from_model: 'claude-opus-5-5',
  to_model: 'claude-sonnet-5-5',
  requested_model: 'sonnet',
  context_tokens: 60_000,
  prompt_cache_warm: true,
  cache_ttl: '1h' as const,
  estimated_cache_write_usd: 0.4,
  pricing: 'catalog' as const,
}

describe('session events', () => {
  test('a resumed session picks the countdown up where it was', async ($, on) => {
    world(on)
    await start($)
    await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, prompt_cache_likely_expired: false })
    expect((await band($)).texts[0]).toBe('50:00')
  })

  test('a cache Claude Code calls lapsed shows expired', async ($, on) => {
    world(on)
    await start($)
    await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 4000, prompt_cache_likely_expired: true })
    expect((await band($)).texts[0]).toBe('过期')
  })

  test('switching models drops the countdown, a resume restoring one keeps it', async ($, on) => {
    world(on)
    await start($)
    await step($)
    const fields = SWITCH
    await $.classic.PostModelSwitch({ ...fields, source: 'resume' })
    expect((await band($)).texts[0]).toBe('60:00')
    await $.classic.PostModelSwitch({ ...fields, source: 'picker' })
    expect((await band($)).texts[0]).toBe('--:--')
  })

  test('the TTL a model switch reports is the one counted from then on', async ($, on) => {
    world(on)
    await start($)
    await $.classic.PostModelSwitch({ ...SWITCH, cache_ttl: '5m', source: 'picker' })
    await step($)
    expect((await band($)).texts[0]).toBe('05:00')
  })

  test('a lapsed cache stays lapsed when a longer TTL is learned after the resume', async ($, on) => {
    world(on)
    await start($)
    await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 400, prompt_cache_likely_expired: true })
    await $.classic.PostModelSwitch({ ...SWITCH, to_model: SWITCH.from_model, source: 'resume' })
    expect((await band($)).texts[0]).toBe('过期')
  })

  test('a /clear reads the context fill again', async ($, on) => {
    const { w } = world(on)
    await start($)
    w.usage = { ...usageAt(), context: { window: 200_000 } }
    await $.classic.SessionStart({ source: 'clear' })
    const { texts } = await band($)
    expect(texts[texts.length - 2]).toBe('–')
  })
})

describe('terminal', () => {
  test('the line rides the hint row, and the band is left to the engine', async ($, on) => {
    const { w } = world(on)
    await start($)
    await step($)
    await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'PromptHint',
      props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
    })
    expect(w.tails[w.tails.length - 1]).toBe(`● 60:00 缓存   ◔ 13% 5h${NBSP}↻2h54m   ◕ 63% 7d${NBSP}↻4d5h   ◔ 25% 上下文`)
    const above = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 120, scroll: { offset: 0, bodyRows: 8 }, view: {} },
    })
    expect(await above.find({ key: 'engine-band' })).toBeDefined()
  })
})
