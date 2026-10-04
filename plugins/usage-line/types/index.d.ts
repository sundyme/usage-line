export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Ctx = { tokens?: number; window: number; percent?: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-line': {
      cacheAt: number | null
      cacheTtl: number
      knownTtl: number
      now: number
      ctx: Ctx | null
      limits: Limit[]
    }
  }
}
