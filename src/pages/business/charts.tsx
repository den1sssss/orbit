import { useCallback, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/components/ui'
import { fmtMonth } from '@/lib/dates'
import type { MonthPoint } from '@/lib/finance'
import { useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { MonthKey } from '@/lib/types'
import type { Money } from './components'

const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 11 }

const compactCache = new Map<string, Intl.NumberFormat>()

/** Always-compact money for axis ticks ($1.2K). */
function useCompactMoney() {
  const currency = useStore((s) => s.settings.currency)
  return useCallback(
    (n: number) => {
      let f = compactCache.get(currency)
      if (!f) {
        try {
          f = new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })
        } catch {
          f = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
        }
        compactCache.set(currency, f)
      }
      return f.format(n)
    },
    [currency],
  )
}

interface TipRow {
  label: string
  value: ReactNode
  color?: string
  strong?: boolean
}

function TooltipBox({ title, rows }: { title: ReactNode; rows: TipRow[] }) {
  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] shadow-pop">
      <p className="mb-1.5 font-semibold text-ink">{title}</p>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn('flex items-center justify-between gap-4', r.strong && 'mt-0.5 border-t border-line pt-1.5')}
          >
            <span className="flex items-center gap-2 text-ink-2">
              {r.color && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className={cn('tabular text-ink', r.strong ? 'font-semibold' : 'font-medium')}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Legend() {
  const items = [
    { label: 'Income', color: 'var(--chart-income)' },
    { label: 'Expenses', color: 'var(--chart-expense)' },
  ]
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

function TrendTip({ active, payload, money }: { active?: boolean; payload?: { payload: MonthPoint }[]; money: Money }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const margin = p.income > 0 ? ` · ${Math.round((p.net / p.income) * 100)}%` : ''
  return (
    <TooltipBox
      title={fmtMonth(p.month)}
      rows={[
        { label: 'Income', value: money(p.income), color: 'var(--chart-income)' },
        { label: 'Expenses', value: money(p.expense), color: 'var(--chart-expense)' },
        { label: p.net < 0 ? 'Loss' : 'Profit', value: `${money(p.net)}${margin}`, strong: true },
      ]}
    />
  )
}

function MonthTick({ x, y, payload, selected }: {
  x?: number
  y?: number
  payload?: { value: MonthKey }
  selected?: MonthKey
}) {
  if (!payload) return null
  const active = payload.value === selected
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor="middle"
      fontSize={11}
      fontWeight={active ? 600 : 400}
      fill={active ? 'var(--ink)' : 'var(--chart-axis)'}
    >
      {fmtMonth(payload.value, 'MMM')}
    </text>
  )
}

/** Business income vs expenses per month (profit in the tooltip). Tap a month to select it. */
export function BusinessTrendChart({ data, selected, onSelect }: {
  data: MonthPoint[]
  selected?: MonthKey
  onSelect?: (m: MonthKey) => void
}) {
  const money = useMoney()
  const compact = useCompactMoney()
  return (
    <div>
      <Legend />
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          barGap={2}
          barCategoryGap="22%"
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          style={onSelect ? { cursor: 'pointer' } : undefined}
          onClick={(state) => {
            const i = state?.activeTooltipIndex
            if (onSelect && i != null && data[i]) onSelect(data[i].month)
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={(props: { x?: number; y?: number; payload?: { value: MonthKey } }) => (
              <MonthTick {...props} selected={selected} />
            )}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={AXIS_TICK}
            tickCount={4}
            width={48}
            tickFormatter={(v: number) => compact(v)}
          />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<TrendTip money={money} />} />
          <Bar dataKey="income" name="Income" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="expense" name="Expenses" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
