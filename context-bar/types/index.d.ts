export type Segment = { name: string; color: string; tokens: number; kind: 'used' | 'free' | 'buffer' }

// windowMs: the window's length (5 h, 7 d), so elapsed time gives the expected-pace marker.
export type Limit = { label: string; percent: number; resetsAtMs: number | null; windowMs: number | null }

export type Snapshot = { segments: Segment[]; maxTokens: number; usedTokens: number }

export type Estimate = { label: string; percent: number; left: string }

export type Estimates = { lines: Estimate[]; at: number }

export type Layout = 'compact' | 'full' | 'gauges'

declare module 'claude-code' {
  interface PluginState {
    'context-bar': {
      isOn: boolean
      layout: Layout
      snapshot: Snapshot | null
      limits: Limit[]
      estimates: Estimates | null
    }
  }
}
