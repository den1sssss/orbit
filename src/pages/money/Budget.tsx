import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Gauge, Pencil, PiggyBank, Plus } from 'lucide-react'
import {
  Button, Card, CardHeader, CategoryIcon, cn, EmptyState, Field, MoneyInput, PageHeader, Progress, Sheet,
} from '@/components/ui'
import { currentMonth, fmtMonth, monthEnd, monthStart, shiftMonth, todayISO } from '@/lib/dates'
import {
  budgetRows, budgetTone, monthElapsed, monthlySeries, monthTotals, paymentsInRange, plannedForMonth,
  type BudgetRow,
} from '@/lib/finance'
import { parseAmount, pct, useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import type { ID, MonthKey } from '@/lib/types'
import { NetHistoryChart, PlannedVsActual, type Money } from './components/charts'
import { monthParamValue, readMonth, roundCents, seriesEnd, useSearchState } from './components/lib'
import { MonthPicker, MoneyToolbar } from './components/nav'

export function BudgetPage() {
  const [params, update] = useSearchState()
  const month = readMonth(params) as MonthKey

  const txs = useStore((s) => s.transactions)
  const cats = useStore((s) => s.financeCategories)
  const budgets = useStore((s) => s.budgets)
  const money = useMoney()

  const [addFor, setAddFor] = useState<ID | '' | null>(null)

  const rows = useMemo(() => budgetRows(budgets, cats, txs, month), [budgets, cats, txs, month])
  const budgeted = useMemo(() => rows.filter((r) => r.budget > 0), [rows])
  const unbudgeted = useMemo(
    () => rows.filter((r) => !r.budget && r.spent > 0).sort((a, b) => b.spent - a.spent),
    [rows],
  )
  const chartRows = useMemo(() => [...budgeted].sort((a, b) => b.budget - a.budget), [budgeted])
  const monthT = useMemo(() => monthTotals(txs, month), [txs, month])
  const history = useMemo(() => monthlySeries(txs, seriesEnd(month), 6), [txs, month])

  const totalBudget = budgeted.reduce((s, r) => s + r.budget, 0)
  const totalSpent = budgeted.reduce((s, r) => s + r.spent, 0)
  const unbudgetedTotal = unbudgeted.reduce((s, r) => s + r.spent, 0)
  const remaining = totalBudget - totalSpent
  const ratio = totalBudget ? totalSpent / totalBudget : 0

  const isCurrent = month === currentMonth()
  const elapsed = monthElapsed(month)
  const daysInMonth = Number(monthEnd(month).slice(8, 10))
  const dayNum = Number(todayISO().slice(8, 10))
  const daysLeft = isCurrent ? daysInMonth - dayNum + 1 : 0
  const safePerDay = isCurrent && daysLeft > 0 ? Math.max(0, remaining) / daysLeft : undefined

  const hasUnbudgetedCategories = cats.some((c) => c.type === 'expense' && !c.archived && !budgets[c.id])

  return (
    <>
      <PageHeader
        title="Budget"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAddFor('')} disabled={!hasUnbudgetedCategories}>
            <span className="hidden sm:inline">Add budget</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      >
        <MoneyToolbar>
          <MonthPicker value={month} onChange={(m) => update({ month: monthParamValue(m) })} />
        </MoneyToolbar>
      </PageHeader>

      <div className="flex flex-col gap-4 lg:gap-5">
        {/* ── Summary */}
        <Card>
          {budgeted.length ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                  <p className="text-[13px] text-muted">Spent of budget · {fmtMonth(month)}</p>
                  <p className="tabular mt-0.5 text-2xl font-semibold tracking-tight text-ink">
                    {money(totalSpent)}{' '}
                    <span className="text-base font-normal text-muted">of {money(totalBudget)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-muted">{remaining >= 0 ? 'Remaining' : 'Over budget by'}</p>
                  <p className={cn('tabular text-lg font-semibold', remaining < 0 ? 'text-bad' : 'text-ink')}>
                    {money(Math.abs(remaining))}
                  </p>
                </div>
              </div>

              <PaceMeter ratio={ratio} pace={isCurrent ? elapsed : undefined} />

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 sm:grid-cols-3">
                {safePerDay !== undefined ? (
                  <Figure
                    label="Safe to spend per day"
                    value={money(safePerDay)}
                    hint={`${daysLeft} day${daysLeft === 1 ? '' : 's'} left incl. today`}
                  />
                ) : (
                  <Figure label="Budget used" value={pct(ratio)} hint={month < currentMonth() ? 'Month closed' : 'Not started'} />
                )}
                <Figure
                  label="All spending"
                  value={money(monthT.expense)}
                  hint={unbudgetedTotal > 0 ? `${money(unbudgetedTotal)} unbudgeted` : 'All within budgets'}
                />
                {isCurrent && (
                  <Figure
                    label="Pace"
                    value={ratio > elapsed + 0.05 ? 'Spending fast' : 'On track'}
                    tone={ratio > elapsed + 0.05 ? 'warn' : 'good'}
                    hint={`${pct(ratio)} used · ${pct(elapsed)} of month gone`}
                  />
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={Gauge}
              title="No budgets yet"
              description="Set a monthly limit for the categories you want to keep in check. Budgets repeat every month."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setAddFor('')}>
                  Add budget
                </Button>
              }
            />
          )}
        </Card>

        {/* ── Category budgets + planned vs actual */}
        {budgeted.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-5 lg:gap-5">
            <Card padded={false} className="min-w-0 lg:col-span-3">
              <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                <CardHeader title="Category budgets" subtitle="Tap a budget amount to change it" />
              </div>
              <div className="divide-y divide-line border-t border-line">
                {budgeted.map((r) => (
                  <BudgetLine key={r.category.id} row={r} money={money} />
                ))}
              </div>
            </Card>
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader title="Planned vs actual" subtitle={fmtMonth(month)} />
              <PlannedVsActual rows={chartRows} />
            </Card>
          </div>
        )}

        {/* ── Unbudgeted */}
        {unbudgeted.length > 0 && (
          <Card padded={false}>
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <CardHeader
                title="Unbudgeted spending"
                subtitle={`${money(unbudgetedTotal)} in categories without a budget`}
              />
            </div>
            <div className="divide-y divide-line border-t border-line">
              {unbudgeted.map((r) => (
                <div key={r.category.id} className="flex min-h-14 items-center gap-3 px-3 py-2.5 sm:px-4">
                  <CategoryIcon icon={r.category.icon} color={r.category.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{r.category.name}</p>
                    <p className="tabular text-[13px] text-muted">{money(r.spent)} spent</p>
                  </div>
                  {!r.category.archived && (
                    <Button icon={Plus} onClick={() => setAddFor(r.category.id)}>
                      Budget
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Savings */}
        <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
          <SavingsCard month={month} income={monthT.income} expense={monthT.expense} />
          <NextMonthPlan />
        </div>

        <Card className="min-w-0">
          <CardHeader title="Savings history" subtitle="Income minus expenses, last 6 months" />
          {history.some((p) => p.income || p.expense) ? (
            <NetHistoryChart data={history} selected={month} />
          ) : (
            <EmptyState compact icon={PiggyBank} title="No history yet" description="Monthly savings show up once you record transactions." />
          )}
        </Card>
      </div>

      {addFor !== null && (
        <AddBudgetSheet initialCategory={addFor || undefined} onClose={() => setAddFor(null)} />
      )}
    </>
  )
}

// ───────────────────────── Pieces ─────────────────────────

function Figure({ label, value, hint, tone }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'good' | 'warn' | 'bad'
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] text-muted">{label}</p>
      <p
        className={cn(
          'tabular mt-0.5 truncate text-[17px] font-semibold tracking-tight',
          tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** Big budget meter with an optional "today" marker showing how much of the month has passed. */
function PaceMeter({ ratio, pace }: { ratio: number; pace?: number }) {
  return (
    <div className="mt-4">
      <div className="relative">
        <Progress value={ratio} tone={budgetTone(ratio)} height={10} label="Total budget used" />
        {pace !== undefined && (
          <div
            className="absolute -bottom-1 -top-1 w-0.5 rounded-full bg-ink-2"
            style={{ left: `calc(${Math.min(1, pace) * 100}% - 1px)` }}
            aria-hidden
          />
        )}
      </div>
      {pace !== undefined && (
        <div className="relative mt-1.5 h-4 text-[11px] text-muted">
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `clamp(24px, ${Math.min(1, pace) * 100}%, calc(100% - 24px))` }}
          >
            Today
          </span>
        </div>
      )}
    </div>
  )
}

function BudgetLine({ row, money }: { row: BudgetRow; money: Money }) {
  const setBudget = useStore((s) => s.setBudget)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  // Set once the edit is committed or cancelled, so a trailing blur can't save twice.
  const closed = useRef(false)
  const id = row.category.id

  const start = () => {
    closed.current = false
    setText(String(row.budget))
    setEditing(true)
  }

  const commit = () => {
    if (closed.current) return
    closed.current = true
    setEditing(false)
    const n = parseAmount(text)
    const prev = row.budget
    if (!isFinite(n) || n <= 0) {
      setBudget(id, null)
      toast(`${row.category.name} budget removed`, {
        action: { label: 'Undo', onClick: () => useStore.getState().setBudget(id, prev) },
      })
      return
    }
    const next = roundCents(n)
    if (next !== prev) {
      setBudget(id, next)
      toast('Budget updated')
    }
  }

  return (
    <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <CategoryIcon icon={row.category.icon} color={row.category.color} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-ink">{row.category.name}</span>
          <span className="tabular shrink-0 text-[13px] font-medium">
            {row.remaining >= 0 ? (
              <span className="text-ink-2">{money(row.remaining)} left</span>
            ) : (
              <span className="text-bad">Over by {money(-row.remaining)}</span>
            )}
          </span>
        </div>
        <div className="mt-1 flex min-h-10 items-center gap-1.5 text-[13px] text-muted">
          <span className="tabular text-ink-2">{money(row.spent)}</span>
          <span>of</span>
          {editing ? (
            <form
              className="w-32"
              onSubmit={(e) => {
                e.preventDefault()
                commit()
              }}
            >
              <MoneyInput
                autoFocus
                aria-label={`${row.category.name} monthly budget`}
                className="h-9"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    closed.current = true
                    setEditing(false)
                  }
                }}
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={start}
              aria-label={`Edit ${row.category.name} budget`}
              className="tabular inline-flex h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 font-medium text-ink transition-colors hover:bg-surface-3"
            >
              {money(row.budget)}
              <Pencil size={12} className="text-muted" />
            </button>
          )}
        </div>
        <Progress
          className="mt-1"
          value={row.ratio}
          tone={budgetTone(row.ratio)}
          label={`${row.category.name} budget used`}
        />
      </div>
    </div>
  )
}

function AddBudgetSheet({ initialCategory, onClose }: { initialCategory?: ID; onClose: () => void }) {
  const cats = useStore((s) => s.financeCategories)
  const budgets = useStore((s) => s.budgets)
  const txs = useStore((s) => s.transactions)
  const setBudget = useStore((s) => s.setBudget)
  const money = useMoney()

  const options = useMemo(
    () => cats.filter((c) => c.type === 'expense' && !c.archived && !budgets[c.id]),
    [cats, budgets],
  )
  const [catId, setCatId] = useState<ID>(initialCategory ?? options[0]?.id ?? '')
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  // Average monthly spend over the last 3 full months, as a suggestion.
  const avgSpend = useMemo(() => {
    const cur = currentMonth()
    const start = monthStart(shiftMonth(cur, -3))
    const end = monthEnd(shiftMonth(cur, -1))
    const map = new Map<ID, number>()
    for (const t of txs) {
      if (t.type === 'expense' && t.date >= start && t.date <= end) {
        map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount)
      }
    }
    return map
  }, [txs])
  const suggestion = catId ? roundCents((avgSpend.get(catId) ?? 0) / 3) : 0

  const save = () => {
    const n = parseAmount(text)
    if (!catId) return setError('Pick a category')
    if (!isFinite(n) || n <= 0) return setError('Enter an amount greater than zero')
    setBudget(catId, roundCents(n))
    toast('Budget set')
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add budget"
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!options.length}>Save</Button>
        </>
      }
    >
      {options.length ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Field label="Category">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={catId === c.id}
                  onClick={() => {
                    setCatId(c.id)
                    setError('')
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors',
                    catId === c.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
                  )}
                >
                  <CategoryIcon icon={c.icon} color={c.color} size={30} />
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink-2">{c.name}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Monthly budget"
            error={error}
            hint={
              suggestion > 0 ? (
                <span>
                  You spent about {money(suggestion)} a month here recently.{' '}
                  <button
                    type="button"
                    className="font-medium text-accent-text hover:underline"
                    onClick={() => setText(String(suggestion))}
                  >
                    Use it
                  </button>
                </span>
              ) : 'Applies to every month.'
            }
          >
            <MoneyInput
              data-autofocus
              placeholder="0.00"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError('')
              }}
            />
          </Field>
          <button type="submit" className="hidden" />
        </form>
      ) : (
        <EmptyState compact icon={Gauge} title="Every category has a budget" description="Add more expense categories in Settings." />
      )}
    </Sheet>
  )
}

function SavingsCard({ month, income, expense }: { month: MonthKey; income: number; expense: number }) {
  const target = useStore((s) => s.settings.monthlySavingsTarget)
  const updateSettings = useStore((s) => s.updateSettings)
  const money = useMoney()
  const saved = income - expense
  const ratio = target > 0 ? saved / target : 0
  const reached = target > 0 && saved >= target

  return (
    <Card>
      <CardHeader title="Monthly savings" icon={PiggyBank} subtitle={fmtMonth(month)} />
      <p className={cn('tabular text-2xl font-semibold tracking-tight', saved < 0 ? 'text-bad' : 'text-ink')}>
        {money(saved)}
        {target > 0 && <span className="text-base font-normal text-muted"> of {money(target)}</span>}
      </p>
      <p className="mt-0.5 text-[13px] text-muted">
        {money(income)} in − {money(expense)} out
      </p>
      {target > 0 && (
        <>
          <Progress
            className="mt-3"
            height={8}
            value={ratio}
            tone={saved < 0 ? 'bad' : reached ? 'good' : 'accent'}
            label="Savings target progress"
          />
          <p className={cn('mt-2 text-[13px]', reached ? 'font-medium text-good' : 'text-ink-2')}>
            {reached
              ? 'Target reached for this month'
              : saved < 0
                ? `Spending exceeds income by ${money(-saved)}`
                : `${money(target - saved)} to go`}
          </p>
        </>
      )}
      <div className="mt-4 border-t border-line pt-4">
        <TargetInput
          key={target}
          target={target}
          onSave={(n) => {
            updateSettings({ monthlySavingsTarget: n })
            toast(n > 0 ? 'Savings target updated' : 'Savings target cleared')
          }}
        />
      </div>
    </Card>
  )
}

function TargetInput({ target, onSave }: { target: number; onSave: (n: number) => void }) {
  const [text, setText] = useState(target ? String(target) : '')
  const commit = () => {
    const trimmed = text.trim()
    const n = trimmed ? parseAmount(trimmed) : 0
    if (!isFinite(n) || n < 0) {
      setText(target ? String(target) : '')
      return
    }
    const next = roundCents(n)
    if (next !== target) onSave(next)
  }
  return (
    <Field label="Monthly savings target" hint="How much you want to keep each month.">
      <form
        className="max-w-48"
        onSubmit={(e) => {
          e.preventDefault()
          commit()
        }}
      >
        <MoneyInput
          aria-label="Monthly savings target"
          placeholder="0"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
      </form>
    </Field>
  )
}

function NextMonthPlan() {
  const txs = useStore((s) => s.transactions)
  const cats = useStore((s) => s.financeCategories)
  const budgets = useStore((s) => s.budgets)
  const payments = useStore((s) => s.plannedPayments)
  const target = useStore((s) => s.settings.monthlySavingsTarget)
  const money = useMoney()

  const plan = useMemo(() => {
    const cur = currentMonth()
    const next = shiftMonth(cur, 1)
    // Average income of the last 3 full months (months with no records at all are skipped).
    const months = [1, 2, 3].map((i) => shiftMonth(cur, -i))
    const withData = months.map((m) => monthTotals(txs, m)).filter((t) => t.count > 0)
    const expectedIncome = withData.length ? withData.reduce((s, t) => s + t.income, 0) / withData.length : 0
    const expenseIds = new Set(cats.filter((c) => c.type === 'expense').map((c) => c.id))
    const totalBudgets = Object.entries(budgets)
      .filter(([id]) => expenseIds.has(id))
      .reduce((s, [, v]) => s + v, 0)
    const plannedTotal = plannedForMonth(payments, next)
    const due = paymentsInRange(payments, monthStart(next), monthEnd(next))
    const covered = due.filter((d) => budgets[d.payment.categoryId]).reduce((s, d) => s + d.payment.amount, 0)
    const uncovered = plannedTotal - covered
    return {
      next,
      range: `${fmtMonth(months[2], 'MMM')}–${fmtMonth(months[0], 'MMM')}`,
      expectedIncome,
      totalBudgets,
      plannedTotal,
      covered,
      uncovered,
      projected: expectedIncome - totalBudgets - uncovered,
    }
  }, [txs, cats, budgets, payments])


  return (
    <Card>
      <CardHeader title={`Plan for ${fmtMonth(plan.next, 'MMMM')}`} subtitle="Based on your averages, budgets and bills" />
      <div className="divide-y divide-line">
        <PlanLine label="Expected income" hint={`Average of ${plan.range}`} value={money(plan.expectedIncome)} />
        <PlanLine label="Budgets" value={`−${money(plan.totalBudgets)}`} />
        <PlanLine
          label="Planned payments"
          hint={plan.covered > 0 ? `${money(plan.covered)} more is already inside your budgets` : 'Bills and subscriptions due'}
          value={`−${money(plan.uncovered)}`}
        />
        <div className="flex items-baseline justify-between gap-3 pt-3">
          <span className="text-sm font-semibold text-ink">Projected savings</span>
          <span className={cn('tabular text-lg font-semibold', plan.projected < 0 ? 'text-bad' : 'text-ink')}>
            {money(plan.projected)}
          </span>
        </div>
      </div>
      {target > 0 && (
        <p className={cn('mt-2 text-[13px]', plan.projected >= target ? 'text-good' : 'text-ink-2')}>
          {plan.projected >= target
            ? `On track for your ${money(target)} target`
            : `${money(target - plan.projected)} short of your ${money(target)} target`}
        </p>
      )}
    </Card>
  )
}

function PlanLine({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-sm text-ink-2">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <span className="tabular shrink-0 text-sm font-medium text-ink">{value}</span>
    </div>
  )
}
