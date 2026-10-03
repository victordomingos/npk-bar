import type { EngineInterface, Register } from 'claude-code'

import type { Baselines, Estimate, Estimates, Layout, Limit, Segment, Snapshot } from '../types'

import { gaugesSvg, impliedTotal, pace, slipStatus, until } from './gauges'

const isOn = { plugin: 'context-bar', key: 'isOn' } as const
const layout = { plugin: 'context-bar', key: 'layout' } as const
const LAYOUTS: Layout[] = ['compact', 'full', 'gauges']
const snapshot = { plugin: 'context-bar', key: 'snapshot' } as const
const limits = { plugin: 'context-bar', key: 'limits' } as const
const baselines = { plugin: 'context-bar', key: 'baselines' } as const
const estimates = { plugin: 'context-bar', key: 'estimates' } as const

// Estimates older than this (from a previous session in the same folder) are not shown.
const MAX_ESTIMATE_AGE_MS = 3 * 24 * 3600 * 1000
// While a turn runs, refresh the bar at most this often (summary breakdowns are local, but not free).
const REFRESH_EVERY_MS = 15_000

// One line of the estimativas block, in any language:
//   **Sessão:**   `████████░░░░░░░░░░░░` 40% · ~3h
const ESTIMATE_LINE = /^\s*\*\*([^*\n]+?):?\*\*:?\s*`[█░▓▒ ]+`\s*(\d{1,3})\s*%\s*(?:[·\-–|]\s*(~?\s*[\d.,]+\s*(?:h|min|d)\b[^\n]*))?/gm

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`

// Rate-limit windows as the engine names them; anything else (a gateway's spend limit) keeps its own name.
// Text layouts: the same pace status as the gauges, in terminal colours.
const TEXT_STATUS = { good: 'green', warning: 'yellow', serious: '#ec835a', critical: 'red' } as const

// Named as limits, so they never read like the Session estimate beside them.
const LIMIT_LABELS: Record<string, string> = { five_hour: '5h limit', seven_day: 'Week limit' }
const LIMIT_WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600_000, seven_day: 7 * 24 * 3600_000 }

function toLimits(raw: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): Limit[] {
  return raw.map(r => {
    const at = r.resetsAt ? Date.parse(r.resetsAt) : NaN
    return { label: LIMIT_LABELS[r.kind] ?? r.kind.replace(/_/g, ' '), percent: r.percentUsed, resetsAtMs: Number.isNaN(at) ? null : at, windowMs: LIMIT_WINDOW_MS[r.kind] ?? null }
  })
}

// Share of the window: whole percent, `<1%` for a sliver.
const share = (n: number, of: number) => {
  const pct = (n / of) * 100
  return n > 0 && pct < 1 ? '<1%' : `${Math.round(pct)}%`
}

// The bar is in English whatever language the replies are in: known estimate labels are translated
// (Portuguese for now); any other label is shown as written.
const ESTIMATE_LABELS: Record<string, string> = {
  'testes em curso': 'Validation',
  testes: 'Validation',
  'tests in progress': 'Validation',
  tests: 'Validation',
  'validação': 'Validation',
  'sessão': 'Session',
  sessao: 'Session',
  projeto: 'Project',
  projecto: 'Project',
}
const englishLabel = (label: string) => ESTIMATE_LABELS[label.toLowerCase()] ?? label

function parseEstimates(text: string): Estimate[] {
  const lines: Estimate[] = []
  for (const m of text.matchAll(ESTIMATE_LINE)) {
    lines.push({ label: englishLabel(m[1].trim()), percent: Math.min(100, Number(m[2])), left: (m[3] ?? '').trim() })
  }
  return lines
}

// 20-block bar as the estimativas skill draws it: never full below 100%, never empty above 0%.
const blocks = (percent: number) => Math.min(percent < 100 ? 19 : 20, Math.max(percent > 0 ? 1 : 0, Math.round(percent / 5)))

// Top `n` used categories by size, the rest folded into one `Other`, then free space and buffer.
// Neutral parts (Other, buffer, free) have no colour: drawn in the text colour, told apart by pattern,
// so they show on any background (the engine's grey vanishes on the desktop band).
function topSegments(segments: Segment[], n: number): Segment[] {
  const used = segments.filter(s => s.kind === 'used').sort((a, b) => b.tokens - a.tokens)
  const rest = used.slice(n).reduce((a, s) => a + s.tokens, 0)
  const other: Segment[] = rest > 0 ? [{ name: 'Other', color: '', tokens: rest, kind: 'used' }] : []
  return [...used.slice(0, n), ...other, ...segments.filter(s => s.kind !== 'used').map(s => ({ ...s, color: '' }))]
}

const glyph = (s: Segment) => (s.kind === 'free' ? '░' : s.kind === 'buffer' ? '▒' : s.color ? '█' : '▓')

// Largest-remainder split of `width` cells; any non-empty used segment gets at least one cell.
function cells(segments: Segment[], total: number, width: number): number[] {
  if (total <= 0) return segments.map(() => 0)
  const exact = segments.map(s => (s.tokens / total) * width)
  const out = exact.map((x, i) => (segments[i].tokens > 0 && segments[i].kind === 'used' ? Math.max(1, Math.floor(x)) : Math.floor(x)))
  let left = width - out.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]] += 1
  // Over-allocation from the minimum-one rule comes out of the free space first.
  for (let i = out.length - 1; left < 0 && i >= 0; i--) {
    if (segments[i].kind === 'free') {
      const take = Math.min(out[i], -left)
      out[i] -= take
      left += take
    }
  }
  return out
}

let lastRefresh = 0
// CSS px a text column spans on the desktop band (estimated from screenshots; `status` shows the
// figures the last drawing used, to recalibrate).
const PX_PER_COLUMN = 9
// What the last gauges drawing measured, for `/context-bar status`.
let lastGauges: { surface: string; bodyColumns: number; maxWidth: number; oneRowWidth: number; isStacked: boolean } | null = null

// The transcript is scanned for an estimates block once per load, not on every refresh.
let scannedTranscript = false

// The last saved limit readings, minus any whose window has already reset (a stale "Session 40%"
// after a restart would be wrong).
async function savedLimits($: EngineInterface): Promise<Limit[]> {
  const saved = ((await $.store.get('limits')) ?? []) as Limit[]
  const now = await $.clock.now()
  const renamed: Record<string, string> = { Session: '5h limit', Week: 'Week limit' }
  return saved
    .filter(l => l.resetsAtMs === null || l.resetsAtMs > now)
    .map(l => ({ ...l, label: renamed[l.label] ?? l.label }))
}

// New estimates: set them as current and record each line's first implied total as its baseline
// (slippage is measured from it). A line whose share done drops by 30 points or more is new work:
// its baseline starts over. Project's baseline is kept across sessions in this folder.
async function recordEstimates($: EngineInterface, lines: Estimate[]): Promise<void> {
  const previous = (await $.state.get(estimates)).value
  const base: Baselines = { ...((await $.state.get(baselines)).value ?? {}) }
  for (const l of lines) {
    const label = englishLabel(l.label)
    const before = previous?.lines.find(p => englishLabel(p.label) === label)
    if (before && before.percent - l.percent >= 30) delete base[label]
    const total = impliedTotal({ ...l, label })
    if (total !== null && base[label] === undefined) base[label] = total
  }
  const est: Estimates = { lines, at: await $.clock.now() }
  await $.state.set(estimates, est)
  await $.state.set(baselines, base)
  const cwd = await $.session.cwd()
  await $.store.set(`estimates:${cwd}`, est)
  if (base.Project !== undefined) await $.store.set(`baseline:${cwd}`, base.Project)
}

// The estimates blocks in this conversation, the newest set as current; false when there are none.
// Runs once per load.
async function findEstimatesInTranscript($: EngineInterface): Promise<boolean> {
  if (scannedTranscript) return false
  scannedTranscript = true
  // Oldest first, so each line's baseline is its first estimate in this conversation and the
  // newest block ends up current.
  const blocks = (await $.session.messages())
    .filter(m => m.role === 'assistant')
    .map(m => parseEstimates(m.text ?? ''))
    .filter(lines => lines.length > 0)
  for (const lines of blocks) await recordEstimates($, lines)
  return blocks.length > 0
}

async function refresh($: EngineInterface) {
  lastRefresh = await $.clock.now()
  const usage = await $.session.usage({ breakdown: 'summary' })
  // Limits arrive with a response; until the first one (a fresh or reloaded session) keep the last
  // reading, saved across sessions, rather than showing none.
  if (usage.rateLimits.length > 0) {
    const lims = toLimits(usage.rateLimits)
    await $.state.set(limits, lims)
    await $.store.set('limits', lims)
  } else if (((await $.state.get(limits)).value ?? []).length === 0) {
    await $.state.set(limits, await savedLimits($))
  }
  // No estimates yet (a reloaded session, or one this copy of the mod never saw): find the newest
  // block in the conversation itself.
  if (!scannedTranscript && !(await $.state.get(estimates)).value) await findEstimatesInTranscript($)

  const b = usage.context.breakdown
  if (!b) return
  const segments: Segment[] = b.categories
    .filter(c => c.kind !== 'deferred' && c.tokens > 0)
    .map(c => ({ name: c.name, color: c.color, tokens: c.tokens, kind: c.kind as Segment['kind'] }))
  const snap: Snapshot = { segments, maxTokens: b.maxTokens, usedTokens: b.totalTokens }
  await $.state.set(snapshot, snap)
}

// `/context-bar status`: what the mod sees right now, for reporting problems.
async function status($: EngineInterface): Promise<string> {
  const usage = await $.session.usage()
  const lims = (await $.state.get(limits)).value ?? []
  const stored = ((await $.store.get('limits')) ?? []) as Limit[]
  const est = (await $.state.get(estimates)).value
  const now = await $.clock.now()
  const list = (ls: Limit[]) => (ls.length ? ls.map(l => `${l.label} ${Math.round(l.percent)}%`).join(', ') : 'none')
  return [
    `on: ${(await $.state.get(isOn)).value ?? false} · layout: ${(await $.state.get(layout)).value ?? 'default (gauges on desktop, compact in a terminal)'}`,
    `context: ${usage.context.percent ?? '?'}% of ${usage.context.window} tokens`,
    `rate limits reported now: ${usage.rateLimits.length ? usage.rateLimits.map(r => `${r.kind} ${r.percentUsed}%`).join(', ') : 'none'}`,
    `limits shown: ${list(lims)} · saved: ${list(stored)}`,
    `estimates: ${est ? `${est.lines.length} lines` : 'none'} · transcript scanned: ${scannedTranscript}`,
    `gauges: ${lastGauges ? `${lastGauges.surface}, ${lastGauges.bodyColumns} columns → ${lastGauges.maxWidth}px allowed, one row needs ${lastGauges.oneRowWidth}px → ${lastGauges.isStacked ? 'labels under' : 'labels beside'}` : 'not drawn yet'}`,
    `last refresh: ${lastRefresh ? `${Math.round((now - lastRefresh) / 1000)}s ago` : 'never'}`,
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Toggle the context bar; compact | full | gauges picks the layout; status shows what it sees',
    })
    if ((await $.store.get('isOn')) === true) await $.state.set(isOn, true)
    // No saved layout: the default depends on the surface (gauges on desktop, compact in a terminal),
    // so nothing is set here.
    const savedLayout = (await $.store.get('layout')) ?? ((await $.store.get('isFull')) === true ? 'full' : undefined)
    if (LAYOUTS.includes(savedLayout as Layout)) await $.state.set(layout, savedLayout as Layout)
    if (((await $.state.get(limits)).value ?? []).length === 0) await $.state.set(limits, await savedLimits($))
    // Estimates: a resumed session has its own block in the conversation (all three lines are
    // current). A new session in the same folder carries over only the Project line: Validation and
    // Session belong to the session that wrote them.
    const projectBaseline = (await $.store.get(`baseline:${e.cwd}`)) as number | undefined
    if (projectBaseline !== undefined && !(await $.state.get(baselines)).value?.Project) {
      await $.state.set(baselines, { ...((await $.state.get(baselines)).value ?? {}), Project: projectBaseline })
    }
    if (!(await findEstimatesInTranscript($))) {
      const saved = (await $.store.get(`estimates:${e.cwd}`)) as Estimates | undefined
      const project = saved?.lines.filter(l => englishLabel(l.label) === 'Project') ?? []
      if (saved && project.length > 0 && (await $.clock.now()) - saved.at < MAX_ESTIMATE_AGE_MS) {
        await $.state.set(estimates, { lines: project, at: saved.at })
      }
    }
    if ((await $.state.get(isOn)).value ?? false) void refresh($).catch(() => {})

    return next(e)
  })

  // /context-bar toggles; /context-bar compact|full|gauges switches the layout (and turns it on).
  on('command.run', { command: 'context-bar' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase() as Layout
    if ((arg as string) === 'status') return { text: await status($) }
    const isLayout = LAYOUTS.includes(arg)
    if (isLayout) {
      await $.state.set(layout, arg)
      await $.store.set('layout', arg)
    }
    const now = isLayout ? true : !((await $.state.get(isOn)).value ?? false)
    await $.state.set(isOn, now)
    await $.store.set('isOn', now)
    if (now) await refresh($).catch(() => {})
    const current = (await $.state.get(layout)).value ?? 'gauges on desktop, compact in a terminal'

    return { text: now ? `Context bar on (${current}).` : 'Context bar off.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (((await $.state.get(isOn)).value ?? false) && (await $.clock.now()) - lastRefresh > REFRESH_EVERY_MS) {
      void refresh($).catch(() => {})
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    // Subagent turns: their estimates and context are not the main session's.
    if (!e.agentId) {
      const lines = parseEstimates(e.answer ?? '')
      if (lines.length > 0) await recordEstimates($, lines)
      if ((await $.state.get(isOn)).value ?? false) await refresh($).catch(() => {})
    }

    return next(e)
  })

  // While the bar is on it already shows the estimates, so the block is hidden from the reply as
  // drawn. Display only: the block stays in the conversation, which is where the bar reads it.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!((await $.state.get(isOn)).value ?? false) || parseEstimates(e.props.text).length === 0) return next(e)
    const text = e.props.text
      .replace(ESTIMATE_LINE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()
    return next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !((await $.state.get(isOn)).value ?? false)) return next(e)
    const snap = (await $.state.get(snapshot)).value ?? null
    if (!snap) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const saved = (await $.state.get(estimates)).value ?? null
    // Saved before labels were translated: translate them here too.
    const est = saved && { ...saved, lines: saved.lines.map(l => ({ ...l, label: englishLabel(l.label) })) }
    const mode = (await $.state.get(layout)).value ?? (e.surface === 'terminal' ? 'compact' : 'gauges')
    const full = mode === 'full'
    const now = await $.clock.now()
    const lims = (await $.state.get(limits)).value ?? []
    const resets = (l: Limit) => (l.resetsAtMs !== null ? until(l.resetsAtMs - now) : '')
    const limitText = (l: Limit, short: boolean) =>
      short
        ? `${l.label} ${Math.round(l.percent)}%${resets(l) ? ` ${resets(l)}` : ''}`
        : `${Math.round(l.percent)}%${resets(l) ? ` · resets in ${resets(l)}` : ''}`
    const total = snap.segments.reduce((a, s) => a + s.tokens, 0) || snap.maxTokens
    const pct = Math.round((snap.usedTokens / snap.maxTokens) * 100)
    const ratio = `${fmt(snap.usedTokens)}/${fmt(snap.maxTokens)}`
    const summary = `${pct}% ${ratio}`
    // The desktop band draws block glyphs wider than a text cell (and does not truncate), so its
    // columns are discounted to keep the bar on one row.
    const columns = e.surface === 'terminal' ? e.props.bodyColumns : Math.floor(e.props.bodyColumns * 0.8)
    const width = full
      ? Math.max(10, Math.min(100, e.surface === 'terminal' ? columns - 6 : Math.floor(e.props.bodyColumns * 0.62)))
      : 20
    const shown = topSegments(snap.segments, 3)
    const split = cells(shown, total, width)
    const bar = shown.map((s, i) =>
      split[i] > 0 ? (
        <Text color={s.color || undefined}>
          {glyph(s).repeat(split[i])}
        </Text>
      ) : null,
    )

    // Gauges are an SVG image: desktop, IDE and mobile surfaces draw one, the terminal does not
    // (it falls back to the compact text layout).
    if (mode === 'gauges' && e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
            const maxWidth = Math.max(240, e.props.bodyColumns * PX_PER_COLUMN - 16)
      const g = gaugesSvg({ segments: shown, maxTokens: snap.maxTokens, usedTokens: snap.usedTokens, limits: lims, estimates: est?.lines ?? [], now, maxWidth, baselines: (await $.state.get(baselines)).value ?? {} })
      lastGauges = { surface: e.surface, bodyColumns: e.props.bodyColumns, maxWidth, oneRowWidth: g.oneRowWidth, isStacked: g.isStacked }
      return <Svg source={g.source} alt={g.alt} width={g.width} height={g.height} isInteractive />
    }

    if (!full) {
      // Compact: percentages only (reset times and time left are in `full` and the gauges), one
      // line when it fits, else the estimates on a second line. Each limit's percentage is coloured
      // by pace, the same cue as the gauges' arc.
      const shortLabel = (l: string) => l.replace(' limit', '')
      const limitsText = lims.map(l => `${shortLabel(l.label)} ${Math.round(l.percent)}%`).join(' · ')
      const estText = est ? est.lines.map(l => `${l.label} ${l.percent}%`).join(' · ') : ''
      const head = width + 1 + summary.length + (limitsText ? 3 + limitsText.length : 0)
      const isOneLine = !estText || head + 3 + estText.length <= columns - 4
      const estLine = estText && <Text>{estText}</Text>
      return (
        <Box flexDirection="column">
          <Text wrap="truncate">
            {bar}
            <Text> {summary}</Text>
            {lims.map(l => (
              <Text>
                {' · '}
                {shortLabel(l.label)} <Text color={TEXT_STATUS[pace(l, now).status]}>{Math.round(l.percent)}%</Text>
              </Text>
            ))}
            {isOneLine && estText && <Text> · {estLine}</Text>}
          </Text>
          {!isOneLine && <Text wrap="truncate">{estLine}</Text>}
        </Box>
      )
    }

    const used = shown.filter(s => s.kind === 'used')
    // Row labels in a fixed-width box: padding with spaces does not align on the desktop's
    // proportional font.
    // Row labels in a fixed-width box (padding with spaces does not align on the desktop's
    // proportional font), one width per column.
    const limitLabelWidth = Math.max(0, ...lims.map(l => l.label.length)) + 1
    const estLabelWidth = Math.max(0, ...(est?.lines.map(l => l.label.length) ?? [])) + 1
    const base = (await $.state.get(baselines)).value ?? {}

    const limitRows = lims.map(l => (
      <Box flexDirection="row">
        <Box width={limitLabelWidth} flexShrink={0}>
          <Text>{l.label}:</Text>
        </Box>
        <Text>
          <Text color={TEXT_STATUS[pace(l, now).status]}>{'█'.repeat(blocks(l.percent))}</Text>
          <Text>{'░'.repeat(20 - blocks(l.percent))}</Text>
          <Text> {limitText(l, false)}</Text>
        </Text>
      </Box>
    ))
    const estRows = (est?.lines ?? []).map(l => {
      // Same colours as the gauges: slippage from the first estimate, violet with none yet.
      const slip = slipStatus(impliedTotal(l), base[l.label])
      return (
        <Box flexDirection="row">
          <Box width={estLabelWidth} flexShrink={0}>
            <Text>{l.label}:</Text>
          </Box>
          <Text>
            <Text color={slip ? TEXT_STATUS[slip] : '#9085e9'}>{'█'.repeat(blocks(l.percent))}</Text>
            <Text>{'░'.repeat(20 - blocks(l.percent))}</Text>
            <Text>
              {' '}
              {l.percent}%{l.left ? ` · ${l.left}` : ''}
            </Text>
          </Text>
        </Box>
      )
    })
    // Limits and estimates side by side when both columns fit (label, 20-block bar, ~25 cells of
    // text each), else one under the other.
    const limitColumn = limitLabelWidth + 20 + 26
    const estColumn = estLabelWidth + 20 + 18
    const isTwoColumns = limitRows.length > 0 && estRows.length > 0 && limitColumn + 3 + estColumn <= columns

    return (
      <Box flexDirection="column">
        <Box overflow="hidden">
          <Text wrap="truncate">{bar}</Text>
        </Box>
        <Text wrap="wrap">
          <Text bold>
            {pct}% used · {ratio}
          </Text>
          {used.map(s => (
            <Text>
              {'  '}
              <Text color={s.color || undefined}>{s.color ? '■' : glyph(s)}</Text>
              <Text>
                {' '}
                {s.name} {share(s.tokens, snap.maxTokens)}
              </Text>
            </Text>
          ))}
        </Text>
        {isTwoColumns ? (
          <Box flexDirection="row" columnGap={3}>
            <Box flexDirection="column" width={limitColumn} flexShrink={0}>
              {limitRows}
            </Box>
            <Box flexDirection="column">{estRows}</Box>
          </Box>
        ) : (
          <Box flexDirection="column">
            {limitRows}
            {estRows}
          </Box>
        )}
      </Box>
    )
  })
}
