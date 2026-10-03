import type { Estimate, Limit, Segment } from '../types'

// The gauges layout: a row of small ring gauges as one SVG, for surfaces that draw images.
// Colours follow the entity (a category keeps its hue whatever its rank); the palette is the
// dataviz skill's validated categorical order, light and dark steps.

const SLOTS: Record<string, [string, string]> = {
  Messages: ['#2a78d6', '#3987e5'],
  'System tools': ['#eb6834', '#d95926'],
  'MCP tools': ['#1baf7a', '#199e70'],
  'System prompt': ['#eda100', '#c98500'],
  'Memory files': ['#e87ba4', '#d55181'],
  Skills: ['#008300', '#008300'],
}
const UNMAPPED: [string, string] = ['#4a3aa7', '#9085e9']
const OTHER: [string, string] = ['#8a8985', '#8a8985']
const PROGRESS: [string, string] = ['#2a78d6', '#3987e5']
// Estimates are a different job (work done, not quota used): their own hue, slot 7 violet.
const ESTIMATE: [string, string] = ['#4a3aa7', '#9085e9']
// Status steps for limits (dataviz status palette); the percentage, the pace tick and the hover
// text always carry the same fact, never colour alone.
export type PaceStatus = 'good' | 'warning' | 'serious' | 'critical'
const STATUS: Record<PaceStatus, string> = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' }

// How a limit stands against an even pace. `elapsed` is the share of the window gone (null when
// the window's length or reset time is unknown); `over` is used minus elapsed, in points.
//   good: at or under pace · warning: up to 10 points over · serious: 10–25 over · critical: more,
//   or 90% used whatever the pace. Without a pace: warning from 75%, critical from 90%.
export function pace(l: Limit, now: number): { elapsed: number | null; over: number | null; status: PaceStatus } {
  const elapsed =
    l.resetsAtMs !== null && l.windowMs ? Math.min(1, Math.max(0, 1 - (l.resetsAtMs - now) / l.windowMs)) : null
  if (l.percent >= 90) return { elapsed, over: elapsed === null ? null : l.percent - elapsed * 100, status: 'critical' }
  if (elapsed === null) return { elapsed, over: null, status: l.percent >= 75 ? 'warning' : 'good' }
  const over = l.percent - elapsed * 100
  const status: PaceStatus = over <= 0 ? 'good' : over <= 10 ? 'warning' : over <= 25 ? 'serious' : 'critical'
  return { elapsed, over, status }
}

// Horizontal gauges: ring on the left, label and sub-line beside it (36 px tall in all).
const R = 13
const STROKE = 4
const HEIGHT = 36
const CY = HEIGHT / 2
const RING = 2 * R + STROKE // the ring's outer diameter
// Stacked gauges (narrow bands): label and sub-line centred under the ring.
const STACK_HEIGHT = 58
const STACK_CY = 4 + RING / 2
const STACK_LABEL_MAX = 10 // characters, then an ellipsis
const TEXT_GAP = 7 // ring to its label (room for the pace tick)
const CELL_GAP = 14 // gauge to the next gauge
const GAP = 1.2 // a ~1px surface gap between fills, in pathLength units (circumference ≈ 82px)

// Approximate text widths, measured on the desktop app's rendering (wider than system-ui elsewhere):
// 9px medium ≈ 5px a character, 8.5px regular ≈ 4.8px, legend entries ≈ 5.3px.
const labelWidth = (t: string) => t.length * 5
const subWidth = (t: string) => t.length * 4.8
const legendWidth = (t: string) => t.length * 5.3
const ROW_GAP = 6 // between wrapped rows

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Time until a reset: `45m`, `3h10m`, `2d5h`.
export function until(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

// How full a window is, tinting the disc inside the ring (behind the number): yellow from 50%,
// orange from 75%, red from 90%, red blinking from 93%. Context, session and week alike; the number in the
// ring says the same, so the tint is never the only cue.
function level(percent: number): string {
  return percent >= 93 ? 'lv-blink' : percent >= 90 ? 'lv-critical' : percent >= 75 ? 'lv-serious' : percent >= 50 ? 'lv-warning' : ''
}

// A thin vertical rule between groups (context | limits | estimates).
const divider = (x: number, h: number) => `<line class="div" x1="${x}" y1="4" x2="${x}" y2="${h - 4}"/>`

// Hours from an estimate's time left (`~45h`, `~30min`, `~2d`, `~1,5h`); null when unreadable.
export function hoursOf(left: string): number | null {
  const m = left.match(/([\d.,]+)\s*(min|h|d)/)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return Number.isNaN(n) ? null : m[2] === 'min' ? n / 60 : m[2] === 'd' ? n * 24 : n
}

// The total an estimate implies: time left / (1 − share done). None below 10% done (2% vs 3%
// moves it by a third) or at 100%.
export function impliedTotal(e: Estimate): number | null {
  const h = hoursOf(e.left.split(/\s/)[0])
  return h !== null && e.percent >= 10 && e.percent < 100 ? h / (1 - e.percent / 100) : null
}

// Slippage: how much the implied total grew since its baseline. Coloured like the limits' pace:
// green on or within 10% of the estimate, then yellow, orange (from +25%) and red (from +50%).
// No baseline yet: the neutral estimate colour.
export function slipStatus(total: number | null, baseline: number | undefined): PaceStatus | null {
  if (total === null || baseline === undefined) return null
  const growth = total / baseline - 1
  return growth <= 0.1 ? 'good' : growth <= 0.25 ? 'warning' : growth <= 0.5 ? 'serious' : 'critical'
}

// `45min`, `2.5h`, `161h`.
const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)}min` : h < 10 ? `${Math.round(h * 10) / 10}h` : `${Math.round(h)}h`)

const pct = (n: number) => (n > 0 && n < 1 ? '<1%' : `${Math.round(n)}%`)

type Arc = { from: number; len: number; cls: string; title: string }

// Expected pace: a tick across the ring at the share of the window already elapsed.
function paceTick(cx: number, cy: number, fraction: number, title: string): string {
  const a = fraction * 2 * Math.PI
  // From mid-ring outwards only: the centre holds the number.
  const [r1, r2] = [R - 1, R + STROKE / 2 + 2.5]
  const p = (r: number) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`
  const [x1, y1] = p(r1).split(',')
  const [x2, y2] = p(r2).split(',')
  return `<line class="pace" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><title>${esc(title)}</title></line>`
}

// One gauge at `x0`: the ring (track, then each arc as a dashed circle from 12 o'clock) with the
// value inside; the label and sub-line to its right, or centred under it when `stacked`.
// Returns the markup and the width it took.
function gauge(
  x0: number,
  arcs: Arc[],
  value: string,
  label: string,
  sub: string,
  title: string,
  extra: (cx: number, cy: number) => string = () => '',
  stacked = false,
  levelCls = '',
): { svg: string; width: number } {
  if (stacked && label.length > STACK_LABEL_MAX) label = `${label.slice(0, STACK_LABEL_MAX - 1)}…`
  const width = stacked
    ? Math.max(RING, labelWidth(label), subWidth(sub))
    : RING + TEXT_GAP + Math.max(labelWidth(label), subWidth(sub))
  const cx = stacked ? x0 + width / 2 : x0 + RING / 2
  const cy = stacked ? STACK_CY : CY
  const parts = arcs
    .filter(a => a.len > 0)
    .map(
      a =>
        `<circle class="${a.cls}" cx="${cx}" cy="${cy}" r="${R}" pathLength="100" stroke-dasharray="${a.len.toFixed(2)} ${(100 - a.len).toFixed(2)}" stroke-dashoffset="${(-a.from).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(a.title)}</title></circle>`,
    )
  const [tx, ly, sy, anchor] = stacked
    ? [cx, cy + RING / 2 + 11, cy + RING / 2 + 21, ' c']
    : [x0 + RING + TEXT_GAP, cy - 1.5, cy + 10, '']
  const svg =
    `<g><title>${esc(title)}</title>` +
    `<circle class="track" cx="${cx}" cy="${cy}" r="${R}"/>` +
    (levelCls ? `<circle class="disc ${levelCls}" cx="${cx}" cy="${cy}" r="${R - STROKE / 2}"/>` : '') +
    parts.join('') +
    extra(cx, cy) +
    `<text class="v" x="${cx}" y="${cy + 3}">${esc(value)}</text>` +
    `<text class="l${anchor}" x="${tx}" y="${ly}">${esc(label)}</text>` +
    (sub ? `<text class="s${anchor}" x="${tx}" y="${sy}">${esc(sub)}</text>` : '') +
    `</g>`
  return { svg, width }
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : `${n}`

export function gaugesSvg(input: {
  segments: Segment[]
  maxTokens: number
  usedTokens: number
  limits: Limit[]
  estimates: Estimate[]
  now: number
  maxWidth: number
  baselines: Record<string, number>
}): { source: string; alt: string; width: number; height: number; oneRowWidth: number; isStacked: boolean } {
  const { segments, maxTokens, usedTokens, limits, estimates, now, maxWidth, baselines } = input
  const colours: string[] = []
  const classOf = (pair: [string, string]) => {
    let i = colours.indexOf(pair.join())
    if (i < 0) i = colours.push(pair.join()) - 1
    return `c${i}`
  }

  // Context ring: used categories in order, then the buffer; free space is the track.
  const used = segments.filter(s => s.kind === 'used')
  const buffer = segments.filter(s => s.kind === 'buffer')
  let at = 0
  const arcs: Arc[] = []
  for (const s of [...used, ...buffer]) {
    const share = (s.tokens / maxTokens) * 100
    const cls = s.kind === 'buffer' ? 'bufr' : classOf(s.name === 'Other' ? OTHER : (SLOTS[s.name] ?? UNMAPPED))
    arcs.push({ from: at, len: Math.max(0.8, share - (s.kind === 'used' && share > 3 * GAP ? GAP : 0)), cls, title: `${s.name} ${pct(share)}` })
    at += share
  }
  const usedPct = (usedTokens / maxTokens) * 100
  // Each gauge is built at x = 0 as a unit of its group; units are then laid out in rows of at most
  // `maxWidth`, wrapping rather than shrinking (a scaled-down row is unreadable).
  type Unit = { group: number; width: number; svg: string }
  const build = (stacked: boolean): Unit[] => {
  const units: Unit[] = []

  const ctx = gauge(0, arcs, pct(usedPct), 'Context', `${fmt(usedTokens)}/${fmt(maxTokens)}`, `Context ${pct(usedPct)} used`, undefined, stacked, level(usedPct))
  // Legend beside the context gauge (identity is never colour alone): a 2×2 grid row by row, or
  // one column of four when stacked (there is height for it).
  const entries = used.map(s => ({ s, text: `${s.name} ${pct((s.tokens / maxTokens) * 100)}` }))
  const cols = stacked ? 1 : 2
  const colWidth = (c: number) => Math.max(0, ...entries.filter((_, i) => i % cols === c).map(e => legendWidth(e.text))) + 11
  const lx0 = ctx.width + CELL_GAP
  const legend = entries
    .map(({ s, text }, i) => {
      const lx = lx0 + (i % cols === 0 ? 0 : colWidth(0) + 10)
      const y = stacked ? 10 + i * 13 : i < 2 ? CY - 1.5 : CY + 10
      const cls = classOf(s.name === 'Other' ? OTHER : (SLOTS[s.name] ?? UNMAPPED))
      return `<circle class="${cls}f" cx="${lx + 3.5}" cy="${y - 3}" r="3.2"/><text class="g" x="${lx + 10}" y="${y}">${esc(text)}</text>`
    })
    .join('')
  units.push({ group: 0, width: lx0 + colWidth(0) + (cols > 1 && entries.length > 1 ? 10 + colWidth(1) : 0), svg: ctx.svg + legend })

  for (const l of limits) {
    const { elapsed, over, status } = pace(l, now)
    const cls = `st-${status}`
    const sub = l.resetsAtMs !== null ? `↻ ${until(l.resetsAtMs - now)}` : ''
    const paceText =
      elapsed !== null && over !== null
        ? `, expected pace ${pct(elapsed * 100)} (${over <= 0 ? `${Math.round(-over)} points under` : `${Math.round(over)} points over`})`
        : ''
    const tick = (cx: number, cy: number) => (elapsed !== null ? paceTick(cx, cy, elapsed, `${l.label}: ${pct(elapsed * 100)} of the window elapsed`) : '')
    const g = gauge(0, [{ from: 0, len: Math.min(100, l.percent), cls, title: `${l.label} ${pct(l.percent)}` }], pct(l.percent), l.label, sub, `${l.label} limit ${pct(l.percent)} used${sub ? `, resets in ${sub.slice(2)}` : ''}${paceText}`, tick, stacked, level(l.percent))
    units.push({ group: 1, width: g.width, svg: g.svg })
  }
  // Fixed slots, so nothing shifts when a line comes or goes: Validation appears only while tests are
  // pending, and a new session carries over only Project. A missing slot is a quiet empty ring;
  // labels other than these three follow in their own order.
  const SLOTS_ORDER = ['Validation', 'Session', 'Project']
  const ordered: (Estimate | string)[] =
    estimates.length > 0
      ? [...SLOTS_ORDER.map(l => estimates.find(e => e.label === l) ?? l), ...estimates.filter(e => !SLOTS_ORDER.includes(e.label))]
      : []
  for (const e of ordered) {
    if (typeof e === 'string') {
      const g = gauge(0, [], '–', e, e === 'Validation' ? 'none pending' : 'not yet', `${e}: no estimate yet`, undefined, stacked)
      units.push({ group: 2, width: g.width, svg: `<g class="idle">${g.svg}</g>` })
      continue
    }
    const left = e.left.split(/\s/)[0]
    // Total implied by the share done: left / (1 − done). Shown as `left/total`.
    const h = hoursOf(left)
    const total = impliedTotal(e)
    const slip = slipStatus(total, baselines[e.label])
    // Same unit on both sides: written once, `~45/161h`, `~15/30m`; mixed: `~30m/1.5h`.
    const short = (v: number) => hrs(v).replace('min', 'm')
    const sub =
      total === null
        ? left
        : (h! >= 1) === (total >= 1)
          ? `~${short(h!).slice(0, -1)}/${short(total)}`
          : `~${short(h!)}/${short(total)}`
    const base = baselines[e.label]
    const title =
      `${e.label} ${e.percent}% done${left ? `, ${left} left` : ''}${total !== null ? ` of ~${hrs(total)} total` : ''}` +
      (total !== null && base !== undefined ? ` (first estimate ~${hrs(base)}, ${total >= base ? '+' : ''}${Math.round((total / base - 1) * 100)}%)` : '')
    const g = gauge(0, [{ from: 0, len: e.percent, cls: slip ? `st-${slip}` : classOf(ESTIMATE), title }], `${e.percent}%`, e.label, sub, title, undefined, stacked)
    units.push({ group: 2, width: g.width, svg: g.svg })
  }
  return units
  }

  // Labels beside the rings when one row fits; otherwise labels under the rings (narrower), wrapping
  // into rows if even that does not fit.
  const oneRow = (us: Unit[]) => us.reduce((a, u) => a + u.width, 0) + CELL_GAP * (us.length - 1)
  let units = build(false)
  let unitHeight = HEIGHT
  const oneRowWidth = Math.round(oneRow(units))
  if (oneRowWidth > maxWidth) {
    units = build(true)
    unitHeight = STACK_HEIGHT
  }

  // Rows: a unit that would cross `maxWidth` starts a new row; a divider separates groups on one row.
  const parts: string[] = []
  let x = 0
  let row = 0
  let widest = 0
  units.forEach((u, i) => {
    const isNewGroup = i > 0 && u.group !== units[i - 1].group
    if (x > 0 && x + u.width > maxWidth) {
      row += 1
      x = 0
    } else if (x > 0 && isNewGroup) {
      parts.push(`<g transform="translate(0 ${row * (unitHeight + ROW_GAP)})">${divider(x - CELL_GAP / 2, unitHeight)}</g>`)
    }
    parts.push(`<g transform="translate(${x} ${row * (unitHeight + ROW_GAP)})">${u.svg}</g>`)
    x += u.width + CELL_GAP
    widest = Math.max(widest, x - CELL_GAP)
  })
  const height = (row + 1) * unitHeight + row * ROW_GAP
  const width = Math.ceil(widest + 4)
  const light = colours.map((c, i) => `.c${i}{stroke:${c.split(',')[0]}}.c${i}f{fill:${c.split(',')[0]}}`).join('')
  const dark = colours.map((c, i) => `.c${i}{stroke:${c.split(',')[1]}}.c${i}f{fill:${c.split(',')[1]}}`).join('')
  const style =
    // Declaring both schemes keeps the frame transparent in a dark app (an embedded document that
    // only claims light gets an opaque white backdrop) and lets the dark rules below apply.
    `:root{color-scheme:light dark}` +
    `circle{fill:none;stroke-width:${STROKE}}circle[class$="f"]{stroke:none}` +
    `text{font:500 9px system-ui,-apple-system,sans-serif;text-anchor:start;fill:#3d3d3a}.v{font-weight:600;font-size:8.5px;text-anchor:middle}.c{text-anchor:middle}` +
    `.s{font-weight:400;font-size:8.5px;fill:#73726c}.g{font-weight:400;font-size:9px;text-anchor:start}` +
    `.idle{opacity:.45}.disc{stroke:none}.lv-warning{fill:${STATUS.warning};fill-opacity:.3}.lv-serious{fill:${STATUS.serious};fill-opacity:.32}` +
    `.lv-critical,.lv-blink{fill:${STATUS.critical};fill-opacity:.3}.lv-blink{animation:blink 1.2s ease-in-out infinite}` +
    `@keyframes blink{50%{fill-opacity:.65}}@media (prefers-reduced-motion: reduce){.lv-blink{animation:none}}` +
    `.div{stroke:#d1cfc5;stroke-width:1}.pace{stroke:#3d3d3a;stroke-width:1.6;stroke-linecap:round}.track{stroke:#e5e3da}.bufr{stroke:#bdbbb2}${Object.entries(STATUS).map(([k, c]) => `.st-${k}{stroke:${c}}`).join('')}${light}` +
    `@media (prefers-color-scheme: dark){text{fill:#e8e6dc}.pace{stroke:#e8e6dc}.div{stroke:#4a4944}.s{fill:#a3a29a}.track{stroke:#3a3a37}.bufr{stroke:#5c5a54}${dark}}`

  const alt = [
    `Context ${pct(usedPct)} used (${fmt(usedTokens)}/${fmt(maxTokens)}): ${used.map(s => `${s.name} ${pct((s.tokens / maxTokens) * 100)}`).join(', ')}`,
    ...limits.map(l => {
      const { elapsed: el, status } = pace(l, now)
      return `${l.label} limit ${pct(l.percent)}${el !== null ? ` (expected pace ${pct(el * 100)}, ${status})` : ''}`
    }),
    ...estimates.map(e => `${e.label} ${e.percent}%${e.left ? ` ${e.left}` : ''}`),
  ].join('; ')

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="color-scheme:light dark;background:transparent"><style>${style}</style>${parts.join('')}</svg>`,
    alt,
    width,
    height,
    oneRowWidth,
    isStacked: unitHeight === STACK_HEIGHT,
  }
}
