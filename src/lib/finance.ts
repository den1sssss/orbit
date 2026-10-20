// Pure money calculations. All amounts are positive numbers; `type` gives the sign.
import { addDaysISO, diffDays, fmtMonth, monthOf, monthlyFactor, paymentDueDates, shiftMonth, todayISO } from './dates'
import type {
  FinanceCategory, ID, ISODate, MonthKey, PlannedPayment, SavingsGoal, Scope, Transaction, TxType,
} from './types'

export type ScopeFilter = Scope | 'all'

export interface Totals {
  income: number
  expense: number
  /** income − expense */
  net: number
  count: number
}

function inScope(t: Transaction, scope: ScopeFilter) {
  return scope === 'all' || t.scope === scope
}

export function totals(txs: Transaction[]): Totals {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else expense += t.amount
  }
  return { income, expense, net: income - expense, count: txs.length }
}

export function txInMonth(txs: Transaction[], month: MonthKey, scope: ScopeFilter = 'all') {
  return txs.filter((t) => monthOf(t.date) === month && inScope(t, scope))
}

export function txInRange(txs: Transaction[], start: ISODate, end: ISODate, scope: ScopeFilter = 'all') {
  return txs.filter((t) => t.date >= start && t.date <= end && inScope(t, scope))
}

export function monthTotals(txs: Transaction[], month: MonthKey, scope: ScopeFilter = 'all'): Totals {
  return totals(txInMonth(txs, month, scope))
}

export interface CategoryTotal {
  categoryId: ID
  total: number
  count: number
}

export function categoryBreakdown(txs: Transaction[], type: TxType): CategoryTotal[] {
  const map = new Map<ID, CategoryTotal>()
  for (const t of txs) {
    if (t.type !== type) continue
    const row = map.get(t.categoryId) ?? { categoryId: t.categoryId, total: 0, count: 0 }
    row.total += t.amount
    row.count += 1
    map.set(t.categoryId, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

export interface MonthPoint {
  month: MonthKey
  label: string
  income: number
  expense: number
  net: number
}

/** `count` months ending at `endMonth` (oldest first). */
export function monthlySeries(
  txs: Transaction[], endMonth: MonthKey, count: number, scope: ScopeFilter = 'all',
): MonthPoint[] {
  const out: MonthPoint[] = []
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonth(endMonth, -i)
    const t = monthTotals(txs, month, scope)
    out.push({ month, label: fmtMonth(month, 'MMM'), income: t.income, expense: t.expense, net: t.net })
  }
  return out
}

export interface BudgetRow {
  category: FinanceCategory
  budget: number
  spent: number
  remaining: number
  /** spent / budget (0 when no budget). */
  ratio: number
}

export function budgetRows(
  budgets: Record<ID, number>, categories: FinanceCategory[], txs: Transaction[], month: MonthKey,
): BudgetRow[] {
  const spentBy = new Map<ID, number>()
  for (const t of txInMonth(txs, month)) {
    if (t.type === 'expense') spentBy.set(t.categoryId, (spentBy.get(t.categoryId) ?? 0) + t.amount)
  }
  return categories
    .filter((c) => c.type === 'expense' && (budgets[c.id] || spentBy.get(c.id)))
    .map((c) => {
      const budget = budgets[c.id] ?? 0
      const spent = spentBy.get(c.id) ?? 0
      return { category: c, budget, spent, remaining: budget - spent, ratio: budget ? spent / budget : 0 }
    })
    .sort((a, b) => (b.budget ? 1 : 0) - (a.budget ? 1 : 0) || b.ratio - a.ratio || b.spent - a.spent)
}

export function totalBudget(budgets: Record<ID, number>): number {
  return Object.values(budgets).reduce((a, b) => a + b, 0)
}

/** 'good' under 75%, 'warn' up to 100%, 'bad' over. */
export function budgetTone(ratio: number): 'good' | 'warn' | 'bad' {
  if (ratio > 1) return 'bad'
  if (ratio >= 0.75) return 'warn'
  return 'good'
}

/** Fraction of the month elapsed (1 for past months, 0 for future months). */
export function monthElapsed(month: MonthKey, today = todayISO()): number {
  const cur = monthOf(today)
  if (month < cur) return 1
  if (month > cur) return 0
  const day = Number(today.slice(8, 10))
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  return day / days
}

// ───────────────────────── Goals ─────────────────────────

export interface GoalProgress {
  saved: number
  ratio: number
  remaining: number
  /** Amount to save per month to hit the target date (undefined without a date). */
  monthlyNeeded?: number
  daysLeft?: number
}

export function goalProgress(goal: SavingsGoal, today = todayISO()): GoalProgress {
  const saved = goal.contributions.reduce((a, c) => a + c.amount, 0)
  const remaining = Math.max(0, goal.target - saved)
  const out: GoalProgress = { saved, ratio: goal.target ? Math.min(1, saved / goal.target) : 0, remaining }
  if (goal.targetDate) {
    const daysLeft = diffDays(goal.targetDate, today)
    out.daysLeft = daysLeft
    const months = Math.max(1, daysLeft / 30.44)
    out.monthlyNeeded = remaining > 0 ? remaining / months : 0
  }
  return out
}

// ───────────────────────── Planned payments ─────────────────────────

export interface DueItem {
  payment: PlannedPayment
  date: ISODate
  overdue: boolean
  /** Negative when overdue. */
  daysUntil: number
}

/** Overdue items plus everything due in the next `days` days. */
export function upcomingPayments(payments: PlannedPayment[], days = 30, today = todayISO()): DueItem[] {
  const end = addDaysISO(today, days)
  const out: DueItem[] = []
  for (const p of payments) {
    if (!p.active) continue
    if (p.nextDue < today) {
      out.push({ payment: p, date: p.nextDue, overdue: true, daysUntil: diffDays(p.nextDue, today) })
    }
    for (const d of paymentDueDates(p.nextDue, p.recurrence, today, end)) {
      out.push({ payment: p, date: d, overdue: false, daysUntil: diffDays(d, today) })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Projected due dates in a range (for calendars). */
export function paymentsInRange(payments: PlannedPayment[], start: ISODate, end: ISODate): DueItem[] {
  const today = todayISO()
  const out: DueItem[] = []
  for (const p of payments) {
    if (!p.active) continue
    for (const d of paymentDueDates(p.nextDue, p.recurrence, start, end)) {
      out.push({ payment: p, date: d, overdue: d < today, daysUntil: diffDays(d, today) })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Average monthly cost of active recurring commitments. */
export function monthlyCommitments(payments: PlannedPayment[], onlySubscriptions = false): number {
  return payments
    .filter((p) => p.active && (!onlySubscriptions || p.isSubscription))
    .reduce((sum, p) => sum + p.amount * monthlyFactor(p.recurrence), 0)
}

/** Sum of unpaid planned payments still due within a month. */
export function plannedForMonth(payments: PlannedPayment[], month: MonthKey): number {
  const start = `${month}-01`
  const end = `${month}-31`
  return paymentsInRange(payments, start, end).reduce((s, d) => s + d.payment.amount, 0)
}

export function savingsRate(t: Totals): number {
  return t.income > 0 ? t.net / t.income : 0
}
