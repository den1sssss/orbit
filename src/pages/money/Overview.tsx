import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDownRight, ArrowUpRight, BarChart3, CalendarClock, Gauge, Plus, Receipt, TrendingUp,
} from 'lucide-react'
import { Button, Card, CardHeader, CategoryIcon, cn, EmptyState, PageHeader, Progress, Stat } from '@/components/ui'
import { fmtMonth, shiftMonth } from '@/lib/dates'
import {
  budgetRows, budgetTone, categoryBreakdown, monthlySeries, monthTotals, savingsRate, totals, txInMonth,
  upcomingPayments,
} from '@/lib/finance'
import { pct, useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import { openEditor } from '@/lib/ui'
import type { ID, MonthKey, Scope, TxType } from '@/lib/types'
import { IncomeExpenseChart } from './components/charts'
import {
  monthParamValue, readMonth, readScope, seriesEnd, sortTxDesc, useCategoryMap, useMethodMap, useSearchState,
} from './components/lib'
import { MonthPicker, MoneyToolbar, ScopeToggle } from './components/nav'
import { BreakdownList, CardLink, MarkPaidButton, PaymentRow, TxRow, txLink } from './components/rows'

/** "↑ 12% vs Sep" style hint. `upIsGood` decides the tone. */
function Delta({ cur, prev, prevMonth, upIsGood, absolute }: {
  cur: number
  prev: number
  prevMonth: MonthKey
  upIsGood: boolean
  /** Show the money difference instead of a percentage. */
  absolute?: (n: number) => string
}) {
  const label = fmtMonth(prevMonth, 'MMM')
  const diff = cur - prev
  if (Math.abs(diff) < 0.005) return <>Same as {label}</>
  if (!absolute && prev === 0) return <>Nothing in {label}</>
  const up = diff > 0
  const good = up === upIsGood
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const text = absolute ? absolute(diff) : pct(Math.abs(diff) / Math.abs(prev))
  return (
    <>
      <span className={cn('inline-flex items-center font-medium', good ? 'text-good' : 'text-bad')}>
        <Icon size={13} strokeWidth={2.4} />
        {text}
      </span>{' '}
      vs {label}
    </>
  )
}

function addTx(type: TxType, scope: Scope | 'all') {
  openEditor({ kind: 'transaction', initial: { type, ...(scope === 'business' ? { scope: 'business' } : {}) } })
}

export function MoneyOverview() {
  const navigate = useNavigate()
  const [params, update] = useSearchState()
  const month = readMonth(params) as MonthKey
  const scope = readScope(params)

  const txs = useStore((s) => s.transactions)
  const budgets = useStore((s) => s.budgets)
  const cats = useStore((s) => s.financeCategories)
  const payments = useStore((s) => s.plannedPayments)
  const savingsTarget = useStore((s) => s.settings.monthlySavingsTarget)
  const catMap = useCategoryMap()
  const methodMap = useMethodMap()
  const money = useMoney()

  const scoped = useMemo(() => (scope === 'all' ? txs : txs.filter((t) => t.scope === scope)), [txs, scope])
  const monthTx = useMemo(() => txInMonth(scoped, month), [scoped, month])
  const t = useMemo(() => totals(monthTx), [monthTx])
  const prevMonth = shiftMonth(month, -1)
  const prev = useMemo(() => monthTotals(scoped, prevMonth), [scoped, prevMonth])
  const allTime = useMemo(() => totals(scoped), [scoped])
  const series = useMemo(() => monthlySeries(scoped, seriesEnd(month), 6), [scoped, month])
  const hasSeries = series.some((p) => p.income || p.expense)
  const expenseRows = useMemo(() => categoryBreakdown(monthTx, 'expense'), [monthTx])
  const incomeRows = useMemo(() => categoryBreakdown(monthTx, 'income'), [monthTx])
  const budgetTop = useMemo(
    () => budgetRows(budgets, cats, txs, month)
      .filter((r) => r.budget > 0)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 4),
    [budgets, cats, txs, month],
  )
  const upcoming = useMemo(() => {
    const seen = new Set<ID>()
    return upcomingPayments(payments, 14).filter((d) => {
      if (seen.has(d.payment.id)) return false
      seen.add(d.payment.id)
      return true
    })
  }, [payments])
  const upcomingTotal = upcoming.reduce((s, d) => s + d.payment.amount, 0)
  const business = useMemo(() => monthTotals(txs, month, 'business'), [txs, month])
  const recent = useMemo(() => [...scoped].sort(sortTxDesc).slice(0, 6), [scoped])

  const rate = savingsRate(t)
  const monthLabel = fmtMonth(month)
  const pick = (type: TxType) => (categoryId: ID) =>
    navigate(txLink({ month, category: categoryId, scope, type }))

  const addButtons = (block: boolean) => (
    <>
      <Button variant="primary" icon={Plus} block={block} onClick={() => addTx('expense', scope)}>
        Add expense
      </Button>
      <Button icon={Plus} block={block} onClick={() => addTx('income', scope)}>
        Add income
      </Button>
    </>
  )

  return (
    <>
      <PageHeader title="Money" actions={<div className="hidden items-center gap-2 sm:flex">{addButtons(false)}</div>}>
        <MoneyToolbar>
          <MonthPicker value={month} onChange={(m) => update({ month: monthParamValue(m) })} />
          <ScopeToggle value={scope} onChange={(v) => update({ scope: v === 'all' ? null : v })} />
        </MoneyToolbar>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">{addButtons(true)}</div>
      </PageHeader>

      <div className="flex flex-col gap-4 lg:gap-5">
        {/* ── Month totals */}
        <Card>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
            <Stat
              label="Income"
              value={<span className="tabular">{money(t.income)}</span>}
              hint={<Delta cur={t.income} prev={prev.income} prevMonth={prevMonth} upIsGood />}
            />
            <Stat
              label="Expenses"
              value={<span className="tabular">{money(t.expense)}</span>}
              hint={<Delta cur={t.expense} prev={prev.expense} prevMonth={prevMonth} upIsGood={false} />}
            />
            <Stat
              label="Remaining balance"
              tone={t.net < 0 ? 'bad' : 'neutral'}
              value={<span className="tabular">{money(t.net)}</span>}
              hint={
                <Delta
                  cur={t.net}
                  prev={prev.net}
                  prevMonth={prevMonth}
                  upIsGood
                  absolute={(n) => money(Math.abs(n))}
                />
              }
            />
            <Stat
              label="Savings rate"
              value={<span className="tabular">{t.income > 0 ? pct(rate) : '—'}</span>}
              hint={
                savingsTarget > 0
                  ? `${money(Math.max(0, t.net))} of ${money(savingsTarget)} target`
                  : t.income > 0 ? 'of income kept' : 'No income yet'
              }
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-[13px]">
            <span className="text-muted">
              All-time balance{scope !== 'all' && <span className="capitalize"> · {scope}</span>}
            </span>
            <span className={cn('tabular font-semibold', allTime.net < 0 ? 'text-bad' : 'text-ink')}>
              {money(allTime.net)}
            </span>
          </div>
        </Card>

        {/* ── Trend + budgets */}
        <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader title="Income vs expenses" subtitle="Last 6 months · tap a month to open it" />
            {hasSeries ? (
              <IncomeExpenseChart
                data={series}
                selected={month}
                onSelect={(m) => update({ month: monthParamValue(m) })}
              />
            ) : (
              <EmptyState
                compact
                icon={BarChart3}
                title="No history yet"
                description="Record income and expenses to see your monthly trend."
              />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Budgets"
              subtitle={monthLabel}
              action={<CardLink to={`/money/budget?month=${month}`}>Manage</CardLink>}
            />
            {budgetTop.length ? (
              <div className="-mx-2 flex flex-col">
                {budgetTop.map((r) => (
                  <Link
                    key={r.category.id}
                    to={`/money/budget?month=${month}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <CategoryIcon icon={r.category.icon} color={r.category.color} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="truncate font-medium text-ink">{r.category.name}</span>
                        <span className="tabular shrink-0 text-ink">
                          {money(r.spent)} <span className="text-muted">of {money(r.budget)}</span>
                        </span>
                      </div>
                      <Progress
                        className="mt-1.5"
                        value={r.ratio}
                        tone={budgetTone(r.ratio)}
                        label={`${r.category.name} budget used`}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={Gauge}
                title="No budgets yet"
                description="Set monthly limits for your spending categories."
                action={
                  <Button size="sm" onClick={() => navigate('/money/budget')}>
                    Set budgets
                  </Button>
                }
              />
            )}
          </Card>
        </div>

        {/* ── Breakdowns */}
        <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
          <Card>
            <CardHeader
              title="Where money goes"
              subtitle={`${monthLabel} · ${money(t.expense)}`}
              action={<CardLink to={txLink({ month, scope, type: 'expense' })}>All</CardLink>}
            />
            <BreakdownList
              rows={expenseRows}
              total={t.expense}
              categories={catMap}
              onPick={pick('expense')}
              empty={<EmptyState compact title="No expenses this month" />}
            />
          </Card>
          <Card>
            <CardHeader
              title="Where money comes from"
              subtitle={`${monthLabel} · ${money(t.income)}`}
              action={<CardLink to={txLink({ month, scope, type: 'income' })}>All</CardLink>}
            />
            <BreakdownList
              rows={incomeRows}
              total={t.income}
              categories={catMap}
              onPick={pick('income')}
              empty={<EmptyState compact title="No income this month" />}
            />
          </Card>
        </div>

        {/* ── Recent + side column */}
        <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
          <Card padded={false} className="min-w-0 lg:col-span-2">
            <div className="px-4 pt-4 sm:px-5 sm:pt-5">
              <CardHeader title="Recent transactions" action={<CardLink to={txLink({ scope })}>View all</CardLink>} />
            </div>
            {recent.length ? (
              <div className="divide-y divide-line border-t border-line pb-1">
                {recent.map((tx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    category={catMap.get(tx.categoryId)}
                    method={tx.paymentMethodId ? methodMap.get(tx.paymentMethodId) : undefined}
                    money={money}
                    showDate
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 pb-4">
                <EmptyState
                  compact
                  icon={Receipt}
                  title="No transactions yet"
                  description="Every expense and income you record shows up here."
                  action={
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => addTx('expense', scope)}>Add expense</Button>
                      <Button size="sm" onClick={() => addTx('income', scope)}>Add income</Button>
                    </div>
                  }
                />
              </div>
            )}
          </Card>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            <Card padded={false}>
              <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                <CardHeader
                  title="Upcoming payments"
                  subtitle={upcoming.length ? `Next 14 days · ${money(upcomingTotal)}` : 'Next 14 days'}
                  action={<CardLink to="/money/payments">All</CardLink>}
                />
              </div>
              {upcoming.length ? (
                <div className="divide-y divide-line border-t border-line pb-1">
                  {upcoming.slice(0, 5).map((d) => (
                    <PaymentRow
                      key={d.payment.id}
                      payment={d.payment}
                      category={catMap.get(d.payment.categoryId)}
                      date={d.date}
                      money={money}
                      onOpen={() => navigate('/money/payments')}
                      actions={<MarkPaidButton id={d.payment.id} />}
                    />
                  ))}
                  {upcoming.length > 5 && (
                    <Link
                      to="/money/payments"
                      className="flex h-11 items-center justify-center text-[13px] font-medium text-ink-2 hover:text-ink"
                    >
                      {upcoming.length - 5} more
                    </Link>
                  )}
                </div>
              ) : (
                <div className="px-4 pb-4">
                  <EmptyState compact icon={CalendarClock} title="Nothing due soon" />
                </div>
              )}
            </Card>

            <BusinessCard
              income={business.income}
              expense={business.expense}
              link={txLink({ month, scope: 'business' })}
              monthLabel={monthLabel}
            />
          </div>
        </div>
      </div>
    </>
  )
}

function BusinessCard({ income, expense, link, monthLabel }: {
  income: number
  expense: number
  link: string
  monthLabel: string
}) {
  const money = useMoney()
  const profit = income - expense
  const margin = income > 0 ? profit / income : undefined
  return (
    <Card>
      <CardHeader
        title="Business"
        icon={TrendingUp}
        subtitle={monthLabel}
        action={<CardLink to={link}>View</CardLink>}
      />
      {income || expense ? (
        <div className="flex flex-col gap-2">
          <FigureRow label="Income" value={money(income)} />
          <FigureRow label="Expenses" value={money(expense)} />
          <FigureRow label="Profit" value={money(profit)} strong bad={profit < 0} />
          {margin !== undefined && <p className="text-xs text-muted">{pct(margin)} margin</p>}
        </div>
      ) : (
        <p className="text-[13px] text-muted">No business income or expenses this month.</p>
      )}
    </Card>
  )
}

function FigureRow({ label, value, strong, bad }: { label: string; value: ReactNode; strong?: boolean; bad?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-sm', strong && 'border-t border-line pt-2.5')}>
      <span className={strong ? 'font-medium text-ink' : 'text-ink-2'}>{label}</span>
      <span className={cn('tabular', strong ? 'font-semibold' : 'font-medium', bad ? 'text-bad' : 'text-ink')}>
        {value}
      </span>
    </div>
  )
}
