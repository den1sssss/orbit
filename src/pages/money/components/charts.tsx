import type { ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { cn } from '@/components/ui'
import { fmtMonth } from '@/lib/dates'
import type { BudgetRow, MonthPoint } from '@/lib/finance'
import { useMoney } from '@/lib/format'
import { colorHex, tint } from '@/lib/icons'
import type { MonthKey } from '@/lib/types'
import { useCompactMoney } from './lib'

export type Money = ReturnType<typeof useMoney>

const CHART_HEIGHT = 220
const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 11 }

// ───────────────────────── Chrome ─────────────────────────

export interface TipRow {
  label: string
  value: ReactNode
  /** Swatch color (identity only; the text stays in ink tokens). */
  color?: string
  strong?: boolean
}

export function TooltipBox({ title, rows }: { title?: ReactNode; rows: TipRow[] }) {
  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] shadow-pop">
      {title && <p className="mb-1.5 font-semibold text-ink">{title}</p>}
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

export function ChartLegend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2', className)}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
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

// ───────────────────────── Income vs expenses ─────────────────────────

function IncomeExpenseTip({ active, payload, money }: {
  active?: boolean
  payload?: { payload: MonthPoint }[]
  money: Money
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <TooltipBox
      title={fmtMonth(p.month)}
      rows={[
        { label: 'Income', value: money(p.income), color: 'var(--chart-income)' },
        { label: 'Expenses', value: money(p.expense), color: 'var(--chart-expense)' },
        { label: 'Net', value: money(p.net, { sign: true }), strong: true },
      ]}
    />
  )
}

/** Grouped monthly columns: income vs expenses. Clicking a month calls `onSelect`. */
export function IncomeExpenseChart({ data, selected, onSelect }: {
  data: MonthPoint[]
  selected?: MonthKey
  onSelect?: (m: MonthKey) => void
}) {
  const money = useMoney()
  const compact = useCompactMoney()
  return (
    <div>
      <ChartLegend
        className="mb-3"
        items={[
          { label: 'Income', color: 'var(--chart-income)' },
          { label: 'Expenses', color: 'var(--chart-expense)' },
        ]}
      />
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
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
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<IncomeExpenseTip money={money} />} />
          <Bar dataKey="income" name="Income" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="expense" name="Expenses" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────── Net history ─────────────────────────

function NetTip({ active, payload, money }: {
  active?: boolean
  payload?: { payload: MonthPoint }[]
  money: Money
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <TooltipBox
      title={fmtMonth(p.month)}
      rows={[
        { label: 'Income', value: money(p.income) },
        { label: 'Expenses', value: money(p.expense) },
        {
          label: p.net >= 0 ? 'Saved' : 'Overspent',
          value: money(Math.abs(p.net)),
          color: p.net >= 0 ? 'var(--chart-income)' : 'var(--chart-expense)',
          strong: true,
        },
      ]}
    />
  )
}

/** Single-series monthly net (income − expenses) with a zero baseline. */
export function NetHistoryChart({ data, selected }: { data: MonthPoint[]; selected?: MonthKey }) {
  const money = useMoney()
  const compact = useCompactMoney()
  return (
    <div>
      <ChartLegend
        className="mb-3"
        items={[
          { label: 'Saved', color: 'var(--chart-income)' },
          { label: 'Overspent', color: 'var(--chart-expense)' },
        ]}
      />
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={data} barCategoryGap="30%" margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
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
          <ReferenceLine y={0} stroke="var(--border-strong)" />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<NetTip money={money} />} />
          <Bar dataKey="net" name="Net" radius={[4, 4, 0, 0]} maxBarSize={24}>
            {data.map((p) => (
              <Cell key={p.month} fill={p.net >= 0 ? 'var(--chart-income)' : 'var(--chart-expense)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ───────────────────────── Planned vs actual ─────────────────────────

/**
 * Bullet bars: the light track is the budget, the solid bar is actual spending
 * (category hue), and any overspend continues past the track in the "bad" status color.
 * All rows share one scale so lengths compare across categories.
 */
export function PlannedVsActual({ rows }: { rows: BudgetRow[] }) {
  const money = useMoney()
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.budget, r.spent)))
  const w = (n: number) => `${(Math.max(0, n) / scale) * 100}%`
  return (
    <div>
      <ChartLegend
        className="mb-4"
        items={[
          { label: 'Budget', color: 'color-mix(in srgb, var(--ink-2) 22%, transparent)' },
          { label: 'Spent', color: 'var(--ink-2)' },
          { label: 'Over budget', color: 'var(--bad)' },
        ]}
      />
      <div className="flex flex-col gap-4">
        {rows.map((r) => {
          const hex = colorHex(r.category.color)
          const within = Math.min(r.spent, r.budget)
          const over = Math.max(0, r.spent - r.budget)
          return (
            <div key={r.category.id} className="group relative">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate text-ink-2">{r.category.name}</span>
                <span className="tabular shrink-0 text-ink">
                  {money(r.spent)} <span className="text-muted">/ {money(r.budget)}</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-3">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: w(r.budget), background: tint(r.category.color, 0.2) }}
                />
                {within > 0 && (
                  <div
                    className={cn('absolute inset-y-[3px] left-0', over > 0 ? 'rounded-l-full' : 'rounded-full')}
                    style={{ width: w(within), background: hex }}
                  />
                )}
                {over > 0 && (
                  <div
                    className="absolute inset-y-[3px] rounded-r-full"
                    style={{
                      left: `calc(${w(r.budget)} + 2px)`,
                      width: `max(2px, calc(${w(over)} - 2px))`,
                      background: 'var(--bad)',
                    }}
                  />
                )}
                <div
                  className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink-2"
                  style={{ left: `calc(${w(r.budget)} - 1px)` }}
                />
              </div>
              <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden group-hover:block">
                <TooltipBox
                  title={r.category.name}
                  rows={[
                    { label: 'Budget', value: money(r.budget) },
                    { label: 'Spent', value: money(r.spent), color: hex },
                    r.remaining >= 0
                      ? { label: 'Left', value: money(r.remaining), strong: true }
                      : { label: 'Over by', value: money(-r.remaining), color: 'var(--bad)', strong: true },
                  ]}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
