// Reports & Insights — pure calculations. A period goes in, plain numbers come out.
// No React and no store access, so everything here can be checked with synthetic data.
import { receivables as receivablesOf, businessTotals, type Receivables } from '@/lib/business'
import {
  addDaysISO, diffDays, eachDay, fmt, fmtMonth, fromISO, monthEnd, monthOf, monthStart, occurrencesBetween,
  shiftMonth, timeToMinutes, toISO, weekKey, weekRange,
} from '@/lib/dates'
import { budgetRows, categoryBreakdown, savingsRate, totals, txInRange, type BudgetRow } from '@/lib/finance'
import { consistency, streak } from '@/lib/habits'
import type {
  CalendarEvent, Client, FinanceCategory, Habit, ID, Invoice, ISODate, JournalEntry, LifeArea, LifeGoal,
  Project, Task, TaskCategory, Transaction,
} from '@/lib/types'

// ───────────────────────── Periods ─────────────────────────

export type PeriodKind = 'week' | 'month'
export type WeekStart = 0 | 1

export interface Period {
  kind: PeriodKind
  /** First day of the period. */
  start: ISODate
  /** Last day of the period (in the future while the period is still running). */
  end: ISODate
  /** Last day that counts: `end`, or today while the period is running. */
  to: ISODate
  /** The period contains today, so its numbers are "so far". */
  current: boolean
}

/**
 * The week or month containing `anchor`. Future anchors are pulled back to today,
 * so a period is always current or in the past.
 */
export function makePeriod(kind: PeriodKind, anchor: ISODate, weekStartsOn: WeekStart, today: ISODate): Period {
  const a = anchor > today ? today : anchor
  let start: ISODate
  let end: ISODate
  if (kind === 'week') {
    const days = weekRange(a, weekStartsOn)
    start = days[0]
    end = days[days.length - 1]
  } else {
    const m = monthOf(a)
    start = monthStart(m)
    end = monthEnd(m)
  }
  const current = start <= today && today <= end
  return { kind, start, end, to: current ? today : end, current }
}

/**
 * The period before `p`, of the same kind. While `p` is still running the comparison is
 * cut to the same number of elapsed days ("Oct 1–20 vs Sep 1–20"), so a half-finished
 * week is never judged against a whole one.
 */
export function previousPeriod(p: Period): Period {
  let start: ISODate
  let end: ISODate
  if (p.kind === 'week') {
    start = addDaysISO(p.start, -7)
    end = addDaysISO(p.end, -7)
  } else {
    const m = shiftMonth(monthOf(p.start), -1)
    start = monthStart(m)
    end = monthEnd(m)
  }
  let to = end
  if (p.current) {
    const cut = addDaysISO(start, diffDays(p.to, p.start))
    if (cut < end) to = cut
  }
  return { kind: p.kind, start, end, to, current: false }
}

/** The period `delta` steps away (clamped so it never lands in the future). */
export function shiftPeriod(p: Period, delta: number, weekStartsOn: WeekStart, today: ISODate): Period {
  const anchor = p.kind === 'week'
    ? addDaysISO(p.start, 7 * delta)
    : monthStart(shiftMonth(monthOf(p.start), delta))
  return makePeriod(p.kind, anchor, weekStartsOn, today)
}

/** Whether a later (non-future) period exists. */
export function hasNext(p: Period): boolean {
  return !p.current
}

/** Days counted so far (start..to, inclusive). */
export function elapsedDays(p: Period): number {
  return diffDays(p.to, p.start) + 1
}

/** Every day of the period, including days still ahead. */
export function periodDays(p: Period): ISODate[] {
  return eachDay(p.start, p.end)
}

/** "Oct 14 – 20", "Sep 29 – Oct 5", with years only when they aren't this year's. */
export function fmtRange(start: ISODate, end: ISODate, today: ISODate): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  const withYear = !sameYear || start.slice(0, 4) !== today.slice(0, 4)
  if (start === end) return fmt(start, withYear ? 'MMM d, yyyy' : 'MMM d')
  if (!sameYear) return `${fmt(start, 'MMM d, yyyy')} – ${fmt(end, 'MMM d, yyyy')}`
  const head = fmt(start, 'MMM d')
  const tail = start.slice(0, 7) === end.slice(0, 7) ? fmt(end, 'd') : fmt(end, 'MMM d')
  return `${head} – ${tail}${withYear ? `, ${start.slice(0, 4)}` : ''}`
}

/** Short label for the period navigator: "This week", "Last week", "Oct 5 – 11", "October". */
export function periodTitle(p: Period, today: ISODate): string {
  if (p.kind === 'month') {
    return fmtMonth(monthOf(p.start), p.start.slice(0, 4) === today.slice(0, 4) ? 'MMMM' : 'MMM yyyy')
  }
  if (p.current) return 'This week'
  const gap = diffDays(today, p.end)
  if (gap >= 1 && gap <= 7) return 'Last week'
  return fmtRange(p.start, p.end, today)
}

/** Name for titles and exports: "Week of Oct 19 – 25, 2026" or "October 2026". */
export function periodName(p: Period): string {
  if (p.kind === 'month') return fmtMonth(monthOf(p.start))
  return `Week of ${fmtRange(p.start, p.end, '0000-00-00')}`
}

/** File-friendly key: "2026-W43" or "2026-10". */
export function periodKey(p: Period): string {
  return p.kind === 'month' ? monthOf(p.start) : weekKey(addDaysISO(p.start, 3))
}

export interface CompareLabels {
  /** Noun for the previous period: "last week", "the week before", "September". */
  prev: string
  /** Used after "than": "last week", "in September". */
  than: string
  /** Compact form for stat tiles: "last week", "prev. week", "Sep". */
  short: string
}

export function compareLabels(p: Period): CompareLabels {
  if (p.kind === 'week') {
    return p.current
      ? { prev: 'last week', than: 'last week', short: 'last week' }
      : { prev: 'the week before', than: 'the week before', short: 'prev. week' }
  }
  const m = shiftMonth(monthOf(p.start), -1)
  const name = fmtMonth(m, 'MMMM')
  return { prev: name, than: `in ${name}`, short: fmtMonth(m, 'MMM') }
}

// ───────────────────────── Inputs ─────────────────────────

export interface ReportSource {
  tasks: Task[]
  taskCategories: TaskCategory[]
  events: CalendarEvent[]
  journal: JournalEntry[]
  transactions: Transaction[]
  financeCategories: FinanceCategory[]
  budgets: Record<ID, number>
  habits: Habit[]
  lifeGoals: LifeGoal[]
  invoices: Invoice[]
  clients: Client[]
  projects: Project[]
}

/** One bar of a daily chart; `null` = the day hasn't happened yet. */
export interface DayValue {
  date: ISODate
  value: number | null
}

export interface BarRow {
  id: string
  label: string
  value: number
}

/** Local calendar day of a timestamp. */
export function dayOf(ms: number): ISODate {
  return toISO(new Date(ms))
}

function within(d: ISODate | undefined, start: ISODate, end: ISODate): d is ISODate {
  return !!d && d >= start && d <= end
}

function bump<K>(map: Map<K, number>, key: K, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n)
}

function daySeries(p: Period, map: Map<ISODate, number>): DayValue[] {
  return periodDays(p).map((date) => ({ date, value: date > p.to ? null : map.get(date) ?? 0 }))
}

// ───────────────────────── Productivity ─────────────────────────

/** Point-in-time event types that don't occupy the schedule. */
const UNTIMED_TYPES = new Set<CalendarEvent['type']>(['reminder', 'deadline'])

/** Minutes an event blocks out (same rule as the calendar: no end → 1 h, bad end → 30 min). */
export function eventMinutes(ev: CalendarEvent): number {
  if (ev.allDay || !ev.startTime || UNTIMED_TYPES.has(ev.type)) return 0
  const start = timeToMinutes(ev.startTime)
  let end = ev.endTime ? timeToMinutes(ev.endTime) : start + 60
  if (end <= start) end = start + 30
  return Math.max(0, Math.min(end, 24 * 60) - start)
}

export interface Busiest {
  /** 0 (Sun) .. 6 (Sat) */
  weekday: number
  minutes: number
  /** The exact date for weekly reports. */
  date?: ISODate
}

export interface Productivity {
  completed: number
  /** Tasks added in the period (auto-created repeat occurrences excluded). */
  created: number
  /** Tasks due in the period … */
  due: number
  /** … of which are done. */
  dueDone: number
  /** dueDone / due; null when nothing was due. */
  completionRate: number | null
  /** Tasks completed in the period that had a due date … */
  completedWithDue: number
  /** … and were finished on or before it. */
  onTime: number
  onTimeRate: number | null
  /** Due in the period, already past, still open. */
  overdue: number
  byCategory: BarRow[]
  perDay: DayValue[]
  scheduledMinutes: number
  eventCount: number
  /** Scheduled minutes per weekday, 0 (Sun) .. 6 (Sat). */
  minutesByWeekday: number[]
  busiest: Busiest | null
}

export function productivity(src: ReportSource, p: Period, today: ISODate): Productivity {
  const { start, to } = p
  const spawned = new Set(src.tasks.map((t) => t.spawnedId).filter((id): id is ID => !!id))
  const perDay = new Map<ISODate, number>()
  const byCat = new Map<ID, number>()
  let completed = 0
  let created = 0
  let due = 0
  let dueDone = 0
  let completedWithDue = 0
  let onTime = 0
  let overdue = 0

  for (const t of src.tasks) {
    const doneDay = t.status === 'done' && t.completedAt ? dayOf(t.completedAt) : undefined
    if (within(doneDay, start, to)) {
      completed++
      bump(perDay, doneDay)
      bump(byCat, t.categoryId)
      if (t.dueDate) {
        completedWithDue++
        if (doneDay <= t.dueDate) onTime++
      }
    }
    if (within(dayOf(t.createdAt), start, to) && !spawned.has(t.id)) created++
    if (within(t.dueDate, start, to)) {
      due++
      if (t.status === 'done') dueDone++
      else if (t.dueDate < today) overdue++
    }
  }

  const catName = new Map(src.taskCategories.map((c) => [c.id, c.name]))
  const byCategory = [...byCat.entries()]
    .map(([id, value]) => ({ id, label: catName.get(id) ?? 'Other', value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))

  const minutesByWeekday = [0, 0, 0, 0, 0, 0, 0]
  const minutesByDate = new Map<ISODate, number>()
  let scheduledMinutes = 0
  let eventCount = 0
  for (const ev of src.events) {
    const mins = eventMinutes(ev)
    if (!mins) continue
    for (const d of occurrencesBetween(ev, start, to)) {
      eventCount++
      scheduledMinutes += mins
      minutesByWeekday[fromISO(d).getDay()] += mins
      bump(minutesByDate, d, mins)
    }
  }

  let busiest: Busiest | null = null
  if (p.kind === 'week') {
    for (const [date, minutes] of minutesByDate) {
      if (!busiest || minutes > busiest.minutes) busiest = { weekday: fromISO(date).getDay(), minutes, date }
    }
  } else {
    minutesByWeekday.forEach((minutes, weekday) => {
      if (minutes > 0 && (!busiest || minutes > busiest.minutes)) busiest = { weekday, minutes }
    })
  }

  return {
    completed,
    created,
    due,
    dueDone,
    completionRate: due ? dueDone / due : null,
    completedWithDue,
    onTime,
    onTimeRate: completedWithDue ? onTime / completedWithDue : null,
    overdue,
    byCategory,
    perDay: daySeries(p, perDay),
    scheduledMinutes,
    eventCount,
    minutesByWeekday,
    busiest,
  }
}

// ───────────────────────── Money ─────────────────────────

export interface ShareRow extends BarRow {
  /** Fraction of the total, 0..1. */
  share: number
}

export interface BudgetSummary {
  /** Categories with a budget, most used first. */
  rows: BudgetRow[]
  over: BudgetRow[]
  onTrack: number
  budget: number
  spent: number
  /** Fraction of the month counted so far (1 for past months). */
  elapsed: number
}

export interface MoneyReport {
  income: number
  expense: number
  net: number
  count: number
  /** net / income; null without income. */
  savingsRate: number | null
  /** Spending per day. */
  perDay: DayValue[]
  /** Expense categories, largest first, with share of total spending. */
  categories: ShareRow[]
}

export function moneyReport(src: ReportSource, p: Period): MoneyReport {
  const txs = txInRange(src.transactions, p.start, p.to)
  const t = totals(txs)
  const catName = new Map(src.financeCategories.map((c) => [c.id, c.name]))
  const categories = categoryBreakdown(txs, 'expense').map((r) => ({
    id: r.categoryId,
    label: catName.get(r.categoryId) ?? 'Uncategorized',
    value: r.total,
    share: t.expense ? r.total / t.expense : 0,
  }))
  const spentBy = new Map<ISODate, number>()
  for (const tx of txs) if (tx.type === 'expense') bump(spentBy, tx.date, tx.amount)
  return {
    income: t.income,
    expense: t.expense,
    net: t.net,
    count: t.count,
    savingsRate: t.income > 0 ? savingsRate(t) : null,
    perDay: daySeries(p, spentBy),
    categories,
  }
}

/** Budget adherence for the month containing the period (null when no budgets are set). */
export function budgetSummary(src: ReportSource, p: Period): BudgetSummary | null {
  const rows = budgetRows(src.budgets, src.financeCategories, src.transactions, monthOf(p.start))
    .filter((r) => r.budget > 0)
    .sort((a, b) => b.ratio - a.ratio)
  if (!rows.length) return null
  const over = rows.filter((r) => r.spent > r.budget)
  return {
    rows,
    over,
    onTrack: rows.length - over.length,
    budget: rows.reduce((s, r) => s + r.budget, 0),
    spent: rows.reduce((s, r) => s + r.spent, 0),
    elapsed: elapsedDays(p) / (diffDays(p.end, p.start) + 1),
  }
}

/** Per-category spending change, biggest drop first. */
export function categoryChanges(cur: MoneyReport, prev: MoneyReport): (BarRow & { prev: number; diff: number })[] {
  const label = new Map<string, string>()
  const a = new Map<string, number>()
  const b = new Map<string, number>()
  for (const r of cur.categories) {
    label.set(r.id, r.label)
    a.set(r.id, r.value)
  }
  for (const r of prev.categories) {
    label.set(r.id, r.label)
    b.set(r.id, r.value)
  }
  return [...label.entries()]
    .map(([id, name]) => {
      const value = a.get(id) ?? 0
      const before = b.get(id) ?? 0
      return { id, label: name, value, prev: before, diff: value - before }
    })
    .sort((x, y) => x.diff - y.diff)
}

// ───────────────────────── Business ─────────────────────────

export interface BusinessReport {
  income: number
  expenses: number
  profit: number
  margin: number
  /** Invoices marked paid in the period (by paid date). */
  paidCount: number
  paidAmount: number
  /** Unpaid invoices right now (not period-bound). */
  receivables: Receivables
  topClient: { id: ID; name: string; amount: number } | null
  /** Anything worth showing. */
  active: boolean
}

export function businessReport(src: ReportSource, p: Period, today: ISODate): BusinessReport {
  const f = businessTotals(src.transactions, p.start, p.to)
  const paid = src.invoices.filter((i) => i.status === 'paid' && within(i.paidDate, p.start, p.to))
  const rec = receivablesOf(src.invoices, today)

  // Revenue per client: paid invoices + income booked on the client's projects
  // (skipping transactions that were created by paying one of those invoices).
  const projectClient = new Map<ID, ID>()
  for (const pr of src.projects) if (pr.clientId) projectClient.set(pr.id, pr.clientId)
  const linked = new Set(src.invoices.map((i) => i.transactionId).filter((id): id is ID => !!id))
  const byClient = new Map<ID, number>()
  for (const inv of paid) {
    const c = inv.clientId ?? (inv.projectId ? projectClient.get(inv.projectId) : undefined)
    if (c) bump(byClient, c, inv.amount)
  }
  for (const t of txInRange(src.transactions, p.start, p.to)) {
    if (t.type !== 'income' || !t.projectId || linked.has(t.id)) continue
    const c = projectClient.get(t.projectId)
    if (c) bump(byClient, c, t.amount)
  }
  let topClient: BusinessReport['topClient'] = null
  for (const [id, amount] of byClient) {
    if (amount > 0 && (!topClient || amount > topClient.amount)) {
      const client = src.clients.find((c) => c.id === id)
      topClient = { id, name: client?.name ?? 'Unknown client', amount }
    }
  }

  const paidAmount = paid.reduce((s, i) => s + i.amount, 0)
  return {
    income: f.income,
    expenses: f.expenses,
    profit: f.profit,
    margin: f.margin,
    paidCount: paid.length,
    paidAmount,
    receivables: rec,
    topClient,
    active: f.income > 0 || f.expenses > 0 || paid.length > 0 || rec.pendingCount > 0,
  }
}

// ───────────────────────── Habits ─────────────────────────

export interface HabitRow {
  id: ID
  name: string
  emoji?: string
  /** done / due for the period, 0..1. */
  rate: number
  done: number
  due: number
}

export interface HabitsReport {
  /** Active habits that were due in the period, most consistent first. */
  rows: HabitRow[]
  /** Overall done / due; null when nothing was due. */
  overall: number | null
  done: number
  due: number
  /** Longest current streak among active habits (as of today). */
  best: { name: string; emoji?: string; count: number; unit: 'day' | 'week' } | null
}

export function habitsReport(src: ReportSource, p: Period, weekStartsOn: WeekStart, today: ISODate): HabitsReport {
  const active = src.habits.filter((h) => !h.archived)
  const rows = active
    .map((h) => {
      const c = consistency(h, p.start, p.to, weekStartsOn)
      return { id: h.id, name: h.name, emoji: h.emoji, rate: c.rate, done: c.done, due: c.due }
    })
    .filter((r) => r.due > 0)
    .sort((a, b) => b.rate - a.rate || b.done - a.done || a.name.localeCompare(b.name))
  const done = rows.reduce((s, r) => s + r.done, 0)
  const due = rows.reduce((s, r) => s + r.due, 0)

  let best: HabitsReport['best'] = null
  for (const h of active) {
    const s = streak(h, weekStartsOn, today)
    if (s.count > 0 && (!best || s.count > best.count)) best = { name: h.name, emoji: h.emoji, count: s.count, unit: s.unit }
  }
  return { rows, overall: due ? done / due : null, done, due, best }
}

// ───────────────────────── Goals ─────────────────────────

/** Progress 0..1 of a personal goal, whatever its measure. */
export function lifeGoalProgress(g: LifeGoal): number {
  if (g.status === 'done') return 1
  let v = 0
  if (g.measure === 'milestones') {
    v = g.milestones.length ? g.milestones.filter((m) => m.done).length / g.milestones.length : 0
  } else if (g.measure === 'number') {
    v = g.target ? (g.current ?? 0) / g.target : 0
  } else {
    v = (g.progress ?? 0) / 100
  }
  return Math.max(0, Math.min(1, isFinite(v) ? v : 0))
}

export interface GoalRow {
  id: ID
  title: string
  area: LifeArea
  progress: number
  targetDate?: ISODate
  /** Days until the target date (negative = overdue). */
  daysLeft?: number
}

export interface GoalsReport {
  completed: { id: ID; title: string; date: ISODate }[]
  /** Active goals, soonest target date first (undated last). */
  active: GoalRow[]
  /** Active goals with a target date today or later, soonest first. */
  upcoming: GoalRow[]
  /** Active, unfinished goals whose target date has passed. */
  overdue: GoalRow[]
  avgProgress: number | null
}

export function goalsReport(src: ReportSource, p: Period, today: ISODate): GoalsReport {
  const completed = src.lifeGoals
    .filter((g) => g.status === 'done' && g.completedAt && within(dayOf(g.completedAt), p.start, p.to))
    .map((g) => ({ id: g.id, title: g.title, date: dayOf(g.completedAt as number) }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const active: GoalRow[] = src.lifeGoals
    .filter((g) => g.status === 'active')
    .map((g) => ({
      id: g.id,
      title: g.title,
      area: g.area,
      progress: lifeGoalProgress(g),
      targetDate: g.targetDate,
      daysLeft: g.targetDate ? diffDays(g.targetDate, today) : undefined,
    }))
    .sort((a, b) => {
      if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate)
      if (a.targetDate) return -1
      if (b.targetDate) return 1
      return b.progress - a.progress
    })
  return {
    completed,
    active,
    upcoming: active.filter((g) => g.targetDate && g.targetDate >= today).slice(0, 3),
    overdue: active.filter((g) => g.targetDate && g.targetDate < today && g.progress < 1),
    avgProgress: active.length ? active.reduce((s, g) => s + g.progress, 0) / active.length : null,
  }
}

// ───────────────────────── Wellbeing ─────────────────────────

export interface MoodDay {
  date: ISODate
  /** null = nothing logged (drawn as a gap). */
  mood: number | null
  energy: number | null
}

export interface WellbeingReport {
  entries: number
  /** Days counted so far in the period. */
  days: number
  avgMood: number | null
  avgEnergy: number | null
  perDay: MoodDay[]
  gratitude: number
}

function hasContent(e: JournalEntry): boolean {
  return Boolean(
    e.mood || e.energy || e.title?.trim() || e.body?.trim() || e.gratitude?.some((g) => g.trim()) ||
      e.wins?.trim() || e.lessons?.trim() || e.tomorrow?.trim() || e.tags?.length,
  )
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

export function wellbeingReport(src: ReportSource, p: Period): WellbeingReport {
  const entries = src.journal.filter((e) => within(e.date, p.start, p.to) && hasContent(e))
  const byDate = new Map(entries.map((e) => [e.date, e]))
  const perDay = periodDays(p).map((date) => {
    const e = date <= p.to ? byDate.get(date) : undefined
    return { date, mood: e?.mood ?? null, energy: e?.energy ?? null }
  })
  return {
    entries: entries.length,
    days: elapsedDays(p),
    avgMood: avg(entries.map((e) => e.mood).filter((m): m is NonNullable<typeof m> => m != null)),
    avgEnergy: avg(entries.map((e) => e.energy).filter((m): m is NonNullable<typeof m> => m != null)),
    perDay,
    gratitude: entries.reduce((s, e) => s + (e.gratitude ?? []).filter((g) => g.trim()).length, 0),
  }
}

// ───────────────────────── Whole report ─────────────────────────

export interface Report {
  period: Period
  productivity: Productivity
  money: MoneyReport
  /** Month reports only. */
  budget: BudgetSummary | null
  business: BusinessReport
  habits: HabitsReport
  goals: GoalsReport
  wellbeing: WellbeingReport
}

export function buildReport(src: ReportSource, p: Period, weekStartsOn: WeekStart, today: ISODate): Report {
  return {
    period: p,
    productivity: productivity(src, p, today),
    money: moneyReport(src, p),
    budget: p.kind === 'month' ? budgetSummary(src, p) : null,
    business: businessReport(src, p, today),
    habits: habitsReport(src, p, weekStartsOn, today),
    goals: goalsReport(src, p, today),
    wellbeing: wellbeingReport(src, p),
  }
}

/** Relative change; null when there is no base to compare with. */
export function pctChange(cur: number, prev: number): number | null {
  return prev ? (cur - prev) / Math.abs(prev) : null
}
