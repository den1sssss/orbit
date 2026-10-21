// Report charts. Single-series forms only (the card title names the series, so no legend box):
// daily columns, labelled horizontal bars and a mood line. Every chart has a hover/focus
// tooltip and a table twin, so no value depends on the tooltip.
import type { ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { fmt } from '@/lib/dates'
import { MOOD_EMOJI, MOOD_LABELS } from '@/lib/defaults'
import type { ISODate, Mood } from '@/lib/types'
import type { DayValue, MoodDay, PeriodKind } from './metrics'

const CHART_HEIGHT = 200
const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 11 }

// ───────────────────────── Chrome ─────────────────────────

export interface TipRow {
  label: string
  value: ReactNode
  /** Series color for the line key (identity only — text stays in ink tokens). */
  color?: string
}

export function TooltipBox({ title, rows }: { title?: ReactNode; rows: TipRow[] }) {
  return (
    <div className="min-w-40 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] shadow-pop">
      {title && <p className="mb-1.5 text-xs text-muted">{title}</p>}
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-ink-2">
              {r.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="tabular font-semibold text-ink">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Collapsible table twin of a chart (screen readers, exact values, no hover needed). */
export function DataTable({ caption, head, rows }: { caption: string; head: [string, string]; rows: [string, string][] }) {
  return (
    <details className="group mt-1">
      <summary className="flex h-10 cursor-pointer list-none items-center text-xs font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Show as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <table className="w-full text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="py-1.5 font-medium">{head[0]}</th>
            <th scope="col" className="py-1.5 text-right font-medium">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a} className="border-b border-line last:border-0">
              <td className="py-1.5 text-ink-2">{a}</td>
              <td className="tabular py-1.5 text-right text-ink">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/** X ticks: every weekday for a week; the 1st, 8th, 15th, 22nd and 29th for a month. */
function dayTicks(dates: ISODate[], kind: PeriodKind): ISODate[] {
  if (kind === 'week') return dates
  return dates.filter((d) => ['01', '08', '15', '22', '29'].includes(d.slice(8, 10)))
}

function DayTick({ x, y, payload, kind, today }: {
  x?: number
  y?: number
  payload?: { value: ISODate }
  kind: PeriodKind
  today: ISODate
}) {
  if (!payload) return null
  const isToday = payload.value === today
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor="middle"
      fontSize={11}
      fontWeight={isToday ? 600 : 400}
      fill={isToday ? 'var(--ink)' : 'var(--chart-axis)'}
    >
      {kind === 'week' ? fmt(payload.value, 'EEE') : fmt(payload.value, 'd')}
    </text>
  )
}

// ───────────────────────── Daily columns ─────────────────────────

export function DailyColumns({
  data, kind, today, color, label, format, tick, integer, yWidth = 32,
}: {
  data: DayValue[]
  kind: PeriodKind
  today: ISODate
  /** Series fill (a chart token). */
  color: string
  /** Series name, used in the tooltip and the table. */
  label: string
  /** Value format for tooltip & table. */
  format: (n: number) => string
  /** Y-axis tick format (defaults to `format`). */
  tick?: (n: number) => string
  integer?: boolean
  yWidth?: number
}) {
  const ticks = dayTicks(data.map((d) => d.date), kind)
  return (
    <div>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart
            data={data}
            barCategoryGap={kind === 'week' ? '30%' : '18%'}
            margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="date"
              ticks={ticks}
              interval={0}
              axisLine={false}
              tickLine={false}
              tick={(props: { x?: number; y?: number; payload?: { value: ISODate } }) => (
                <DayTick {...props} kind={kind} today={today} />
              )}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              tickCount={4}
              width={yWidth}
              allowDecimals={!integer}
              tickFormatter={(v: number) => (tick ?? format)(v)}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as DayValue | undefined
                if (!active || !p) return null
                return (
                  <TooltipBox
                    title={fmt(p.date, 'EEEE, MMM d')}
                    rows={[{ label, value: p.value == null ? 'Upcoming' : format(p.value), color }]}
                  />
                )
              }}
            />
            <Bar dataKey="value" name={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={`${label} per day`}
        head={['Day', label]}
        rows={data
          .filter((d) => d.value != null)
          .map((d) => [fmt(d.date, 'EEE, MMM d'), format(d.value ?? 0)])}
      />
    </div>
  )
}

// ───────────────────────── Horizontal bars ─────────────────────────

export interface HBar {
  id: string
  label: ReactNode
  value: number
  /** Value label at the bar's end (text token). */
  display: string
  /** Secondary note after the value, e.g. "32%". */
  note?: string
  tip?: { title: string; rows: TipRow[] }
}

/**
 * Labelled horizontal bars, one hue for every row (nominal categories never get a ramp).
 * `max` fixes the scale (1 for rates, drawn with a same-hue track); otherwise the
 * largest value fills the width.
 */
export function HBarList({ rows, color, max }: { rows: HBar[]; color: string; max?: number }) {
  const scale = max ?? Math.max(1e-9, ...rows.map((r) => r.value))
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const w = Math.max(0, Math.min(1, r.value / scale))
        return (
          <li
            key={r.id}
            className="group relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-4 focus-visible:ring-offset-surface"
            tabIndex={r.tip ? 0 : undefined}
          >
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-ink-2">{r.label}</span>
              <span className="tabular shrink-0 font-medium text-ink">
                {r.display}
                {r.note && <span className="ml-1.5 font-normal text-muted">{r.note}</span>}
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-r-[4px]"
              style={max != null ? { background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}
            >
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-500"
                style={{ width: w > 0 ? `max(2px, ${w * 100}%)` : 0, background: color }}
              />
            </div>
            {r.tip && (
              <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden group-hover:block group-focus-visible:block">
                <TooltipBox title={r.tip.title} rows={r.tip.rows} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ───────────────────────── Mood line ─────────────────────────

export function MoodLine({ data, kind, today }: { data: MoodDay[]; kind: PeriodKind; today: ISODate }) {
  const ticks = dayTicks(data.map((d) => d.date), kind)
  const logged = data.filter((d) => d.mood != null)
  return (
    <div>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="date"
              ticks={ticks}
              interval={0}
              axisLine={false}
              tickLine={false}
              padding={{ left: 10, right: 4 }}
              tick={(props: { x?: number; y?: number; payload?: { value: ISODate } }) => (
                <DayTick {...props} kind={kind} today={today} />
              )}
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              width={30}
              tick={{ ...AXIS_TICK, fontSize: 13 }}
              tickFormatter={(v: number) => MOOD_EMOJI[v as Mood] ?? ''}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as MoodDay | undefined
                if (!active || !p) return null
                const mood = p.mood as Mood | null
                return (
                  <TooltipBox
                    title={fmt(p.date, 'EEEE, MMM d')}
                    rows={[
                      {
                        label: 'Mood',
                        value: mood ? `${MOOD_EMOJI[mood]} ${MOOD_LABELS[mood]}` : p.date > today ? 'Upcoming' : 'Not logged',
                        color: 'var(--accent)',
                      },
                      ...(p.energy ? [{ label: 'Energy', value: `${p.energy}/5` }] : []),
                    ]}
                  />
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="mood"
              connectNulls={false}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption="Mood per day"
        head={['Day', 'Mood']}
        rows={logged.map((d) => [fmt(d.date, 'EEE, MMM d'), `${MOOD_EMOJI[d.mood as Mood]} ${MOOD_LABELS[d.mood as Mood]}`])}
      />
    </div>
  )
}
