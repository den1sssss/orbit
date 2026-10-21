// The "smart assistant": a rule-based daily briefing computed locally from
// everything in the app. No data leaves the device.
import {
  AlarmClock, BookHeart, Briefcase, CalendarClock, CalendarHeart, CheckCircle2, Coffee, Flame, Gauge,
  PiggyBank, Receipt, Target, TrendingDown, TriangleAlert, Wallet, type LucideIcon,
} from 'lucide-react'
import { invoiceState, receivables } from './business'
import { doneOn, isDueToday, streak as habitStreak } from './habits'
import { DATE_KIND_LABELS, upcomingDates, yearsLabel } from './lifeDates'
import { dayAgenda, overdueTasks } from './agenda'
import { addDaysISO, diffDays, fmtTime, greeting, minutesToTime, occurrencesBetween, timeToMinutes, todayISO } from './dates'
import { PRIORITY_ORDER } from './defaults'
import {
  budgetRows, goalProgress, monthElapsed, monthTotals, totalBudget, upcomingPayments,
} from './finance'
import { formatMoney } from './format'
import type { AppData, Task } from './types'

export type InsightTone = 'info' | 'good' | 'warn' | 'bad'

export interface Insight {
  id: string
  tone: InsightTone
  icon: LucideIcon
  title: string
  detail?: string
  /** Route to open for details. */
  to?: string
  /** Lower = more important. */
  rank: number
}

export interface Briefing {
  greeting: string
  summary: string
  insights: Insight[]
}

function plural(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`
}

function duration(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

function topTask(tasks: Task[]): Task | undefined {
  return [...tasks].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])[0]
}

/** Everything the briefing reads — keeps callers honest about what they pass. */
export type BriefingInput = Pick<
  AppData,
  | 'settings' | 'tasks' | 'events' | 'journal' | 'transactions' | 'plannedPayments' | 'budgets'
  | 'financeCategories' | 'goals' | 'habits' | 'invoices' | 'clients' | 'importantDates'
>

export function buildBriefing(data: BriefingInput, now = new Date()): Briefing {
  const today = todayISO()
  const money = (n: number) => formatMoney(n, data.settings.currency)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const out: Insight[] = []
  const add = (i: Insight) => out.push(i)

  const agenda = dayAgenda(data, today)
  const openToday = agenda.tasks.filter((t) => t.status !== 'done')
  const overdue = overdueTasks(data.tasks, today)
  const timed = agenda.events.filter((o) => !o.event.allDay && o.event.startTime)

  // ── Tasks
  if (overdue.length) {
    add({
      id: 'overdue', tone: 'bad', icon: TriangleAlert, rank: 0, to: '/tasks?view=overdue',
      title: `${plural(overdue.length, 'overdue task')}`,
      detail: `Start with “${overdue[0].title}”${overdue.length > 1 ? ` and ${overdue.length - 1} more` : ''} — or move ${overdue.length > 1 ? 'them' : 'it'} to a realistic date.`,
    })
  }
  if (agenda.tasks.length) {
    const high = openToday.filter((t) => t.priority === 'high' || t.priority === 'urgent').length
    if (openToday.length === 0) {
      add({ id: 'tasks-done', tone: 'good', icon: CheckCircle2, rank: 6, to: '/tasks?view=today', title: 'All of today’s tasks are done', detail: 'Nice work. Pick something from your backlog or enjoy the free time.' })
    } else {
      add({
        id: 'tasks-today', tone: 'info', icon: CheckCircle2, rank: 3, to: '/tasks?view=today',
        title: `${plural(openToday.length, 'task')} left for today`,
        detail: high ? `${high === 1 ? '1 is' : `${high} are`} high priority — tackle ${high === 1 ? 'it' : 'those'} first.` : undefined,
      })
    }
  }

  // ── Schedule
  const next = timed.find((o) => timeToMinutes(o.event.startTime) > nowMin)
  if (next) {
    const inMin = timeToMinutes(next.event.startTime) - nowMin
    add({
      id: 'next-event', tone: 'info', icon: CalendarClock, rank: 1, to: `/calendar?view=day&date=${today}`,
      title: `Next: ${next.event.title} at ${fmtTime(next.event.startTime)}`,
      detail: `In ${duration(inMin)}${next.event.location ? ` · ${next.event.location}` : ''}`,
    })
  }

  // Scheduled load and the biggest free block (08:00–20:00, from now on).
  const busy = timed
    .map((o) => [timeToMinutes(o.event.startTime), timeToMinutes(o.event.endTime ?? o.event.startTime) || timeToMinutes(o.event.startTime) + 60] as const)
    .sort((a, b) => a[0] - b[0])
  const scheduled = busy.reduce((s, [a, b]) => s + Math.max(0, b - a), 0)
  if (scheduled >= 6 * 60) {
    add({
      id: 'packed', tone: 'warn', icon: Gauge, rank: 2, to: `/calendar?view=day&date=${today}`,
      title: `Packed day: ${duration(scheduled)} scheduled`,
      detail: 'Leave buffers between commitments and keep breaks — consider moving one item.',
    })
  }
  const dayStart = Math.max(nowMin, 8 * 60)
  const dayEnd = 20 * 60
  let cursor = dayStart
  let best = { start: 0, len: 0 }
  for (const [a, b] of busy) {
    if (a > cursor && a - cursor > best.len) best = { start: cursor, len: Math.min(a, dayEnd) - cursor }
    cursor = Math.max(cursor, b)
  }
  if (dayEnd - cursor > best.len) best = { start: cursor, len: dayEnd - cursor }
  const focus = topTask([...overdue, ...openToday])
  if (best.len >= 60 && focus && dayStart < dayEnd) {
    add({
      id: 'focus', tone: 'info', icon: Coffee, rank: 4, to: `/calendar?view=day&date=${today}`,
      title: `Free ${duration(Math.round(best.len / 15) * 15)} from ${fmtTime(minutesToTime(Math.round(best.start / 15) * 15))}`,
      detail: `A good slot for “${focus.title}”. Block it in your calendar to protect it.`,
    })
  }

  // ── Deadlines in the next 3 days
  const soon = addDaysISO(today, 3)
  const deadlineEvents = data.events
    .filter((e) => e.type === 'deadline')
    .flatMap((e) => occurrencesBetween(e, addDaysISO(today, 1), soon).map((d) => ({ title: e.title, date: d })))
  const urgentTasks = data.tasks
    .filter((t) => t.status !== 'done' && t.dueDate && t.dueDate > today && t.dueDate <= soon && (t.priority === 'high' || t.priority === 'urgent'))
    .map((t) => ({ title: t.title, date: t.dueDate! }))
  const deadlines = [...deadlineEvents, ...urgentTasks].sort((a, b) => a.date.localeCompare(b.date))
  if (deadlines.length) {
    const d = deadlines[0]
    const days = diffDays(d.date, today)
    add({
      id: 'deadline', tone: 'warn', icon: AlarmClock, rank: 2, to: `/calendar?view=agenda&date=${today}`,
      title: `Deadline ${days === 1 ? 'tomorrow' : `in ${days} days`}: ${d.title}`,
      detail: deadlines.length > 1 ? `${plural(deadlines.length - 1, 'more deadline')} in the next 3 days.` : 'Break it into steps today so it doesn’t pile up.',
    })
  }

  // ── Payments
  const dues = upcomingPayments(data.plannedPayments, 3)
  const overduePay = dues.filter((d) => d.overdue)
  if (overduePay.length) {
    const p = overduePay[0]
    add({
      id: 'pay-overdue', tone: 'bad', icon: Receipt, rank: 0, to: '/money/payments',
      title: `${p.payment.name} payment is ${plural(-p.daysUntil, 'day')} overdue`,
      detail: `${money(p.payment.amount)}${overduePay.length > 1 ? ` · ${overduePay.length - 1} more overdue` : ''}. Mark it paid once it’s settled.`,
    })
  }
  const duesSoon = dues.filter((d) => !d.overdue)
  if (duesSoon.length) {
    const total = duesSoon.reduce((s, d) => s + d.payment.amount, 0)
    const first = duesSoon[0]
    add({
      id: 'pay-soon', tone: 'info', icon: Receipt, rank: 5, to: '/money/payments',
      title: duesSoon.length === 1
        ? `${first.payment.name} (${money(first.payment.amount)}) due ${first.daysUntil === 0 ? 'today' : first.daysUntil === 1 ? 'tomorrow' : `in ${first.daysUntil} days`}`
        : `${plural(duesSoon.length, 'payment')} due in the next 3 days`,
      detail: duesSoon.length > 1 ? `${money(total)} in total — make sure the account has enough.` : undefined,
    })
  }

  // ── Budget & spending pace
  const month = today.slice(0, 7)
  const rows = budgetRows(data.budgets, data.financeCategories, data.transactions, month).filter((r) => r.budget > 0)
  const elapsed = monthElapsed(month, today)
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const daysLeft = daysInMonth - Number(today.slice(8, 10))
  const over = rows.filter((r) => r.ratio > 1).sort((a, b) => a.remaining - b.remaining)
  if (over.length) {
    const r = over[0]
    add({
      id: 'over-budget', tone: 'bad', icon: Wallet, rank: 1, to: '/money/budget',
      title: `Over budget in ${r.category.name} by ${money(-r.remaining)}`,
      detail: over.length > 1 ? `${plural(over.length - 1, 'other category', 'other categories')} also over. Review spending or adjust the budget.` : 'Pause spending here for the rest of the month or rebalance from another category.',
    })
  }
  const near = rows.filter((r) => r.ratio >= 0.85 && r.ratio <= 1 && daysLeft > 3)
  if (near.length) {
    const r = near[0]
    add({
      id: 'near-budget', tone: 'warn', icon: Wallet, rank: 3, to: '/money/budget',
      title: `${r.category.name} is at ${Math.round(r.ratio * 100)}% of budget`,
      detail: `${money(Math.max(0, r.remaining))} left for ${plural(daysLeft, 'day')} — about ${money(Math.max(0, r.remaining) / Math.max(1, daysLeft))}/day.`,
    })
  }
  const budgetTotal = totalBudget(data.budgets)
  if (budgetTotal > 0 && elapsed > 0.1) {
    const spentBudgeted = rows.reduce((s, r) => s + r.spent, 0)
    const used = spentBudgeted / budgetTotal
    if (used > elapsed * 1.15 && used < 1) {
      add({
        id: 'pace', tone: 'warn', icon: TrendingDown, rank: 3, to: '/money/budget',
        title: 'Spending faster than planned',
        detail: `${Math.round(used * 100)}% of your budget is used with ${Math.round(elapsed * 100)}% of the month gone. Slowing to ${money(Math.max(0, budgetTotal - spentBudgeted) / Math.max(1, daysLeft))}/day keeps you on track.`,
      })
    } else if (used <= elapsed) {
      add({
        id: 'pace-ok', tone: 'good', icon: Gauge, rank: 7, to: '/money/budget',
        title: 'Spending is on track',
        detail: `${Math.round(used * 100)}% of budget used, ${Math.round(elapsed * 100)}% of the month gone.`,
      })
    }
  }

  // ── Savings
  const t = monthTotals(data.transactions, month)
  const target = data.settings.monthlySavingsTarget
  if (target > 0 && t.income > 0) {
    if (t.net >= target) {
      add({ id: 'savings', tone: 'good', icon: PiggyBank, rank: 6, to: '/money', title: `Savings target reached: ${money(t.net)} saved`, detail: 'Consider moving the extra into a savings goal.' })
    } else {
      add({
        id: 'savings', tone: 'info', icon: PiggyBank, rank: 6, to: '/money',
        title: `${money(Math.max(0, t.net))} of ${money(target)} saved this month`,
        detail: t.net < 0 ? `You’re ${money(-t.net)} in the red this month — review recent expenses.` : `${money(target - t.net)} to go.`,
      })
    }
  }
  const lagging = data.goals
    .filter((g) => !g.archived && g.targetDate)
    .map((g) => ({ g, p: goalProgress(g, today) }))
    .filter(({ p }) => (p.monthlyNeeded ?? 0) > 0 && (p.daysLeft ?? 0) > 0)
    .sort((a, b) => (a.p.daysLeft ?? 0) - (b.p.daysLeft ?? 0))[0]
  if (lagging) {
    add({
      id: 'goal', tone: 'info', icon: PiggyBank, rank: 8, to: '/money/goals',
      title: `${lagging.g.name}: save ${money(lagging.p.monthlyNeeded!)}/month`,
      detail: `${money(lagging.p.remaining)} to go, ${plural(Math.round((lagging.p.daysLeft ?? 0) / 30.44) || 1, 'month')} left.`,
    })
  }

  // ── Journal & mood
  const hasToday = data.journal.some((j) => j.date === today)
  let streak = 0
  for (let d = hasToday ? today : addDaysISO(today, -1); data.journal.some((j) => j.date === d); d = addDaysISO(d, -1)) streak++
  if (!hasToday && now.getHours() >= 17) {
    add({ id: 'journal', tone: 'info', icon: BookHeart, rank: 5, to: `/journal/${today}`, title: 'Take 3 minutes to reflect on today', detail: streak ? `Keep your ${plural(streak, 'day')} streak going.` : 'Mood, gratitude, one lesson — that’s enough.' })
  } else if (streak >= 3) {
    add({ id: 'streak', tone: 'good', icon: Flame, rank: 8, to: '/journal', title: `${plural(streak, 'day')} journaling streak`, detail: 'Consistency beats length.' })
  }
  const moodAvg = (from: number, to: number) => {
    const ms = data.journal
      .filter((j) => j.mood && diffDays(today, j.date) >= from && diffDays(today, j.date) < to)
      .map((j) => j.mood!)
    return ms.length >= 3 ? ms.reduce((a, b) => a + b, 0) / ms.length : undefined
  }
  const recent = moodAvg(0, 7)
  const prior = moodAvg(7, 14)
  if (recent !== undefined && prior !== undefined && prior - recent >= 0.8) {
    add({ id: 'mood', tone: 'warn', icon: BookHeart, rank: 4, to: '/journal', title: 'Your mood has dipped this week', detail: 'Plan something restorative and keep tomorrow’s list light.' })
  }

  // ── Habits
  const habitsDue = data.habits.filter((h) => isDueToday(h, today, data.settings.weekStartsOn))
  if (habitsDue.length) {
    const left = habitsDue.filter((h) => !doneOn(h, today))
    const atRisk = left
      .map((h) => ({ h, s: habitStreak(h, data.settings.weekStartsOn, today) }))
      .filter((x) => x.s.unit === 'day' && x.s.count >= 3)
      .sort((a, b) => b.s.count - a.s.count)[0]
    if (!left.length) {
      add({ id: 'habits-done', tone: 'good', icon: Target, rank: 7, to: '/growth', title: 'All habits done today', detail: 'Consistency compounds — nice.' })
    } else if (atRisk && now.getHours() >= 15) {
      add({
        id: 'habit-streak', tone: 'warn', icon: Flame, rank: 4, to: '/growth',
        title: `Keep your ${atRisk.s.count}-day “${atRisk.h.name}” streak`,
        detail: `${plural(left.length, 'habit')} still open today.`,
      })
    } else {
      add({
        id: 'habits-left', tone: 'info', icon: Target, rank: 6, to: '/growth',
        title: `${plural(left.length, 'habit')} left today`,
        detail: left.slice(0, 3).map((h) => h.name).join(', '),
      })
    }
  }

  // ── Business
  const r = receivables(data.invoices, today)
  if (r.overdueCount) {
    const worst = data.invoices
      .filter((i) => invoiceState(i, today) === 'overdue')
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))[0]
    const client = data.clients.find((c) => c.id === worst?.clientId)
    add({
      id: 'invoices-overdue', tone: 'bad', icon: Briefcase, rank: 1, to: '/business/invoices',
      title: `${plural(r.overdueCount, 'invoice')} overdue · ${money(r.overdue)}`,
      detail: worst ? `Follow up with ${client?.name ?? worst.title} (${worst.number}) today.` : undefined,
    })
  }

  // ── Important dates
  const soonDates = upcomingDates(data.importantDates, 7, today)
  if (soonDates.length) {
    const u = soonDates[0]
    const when = u.daysUntil === 0 ? 'today' : u.daysUntil === 1 ? 'tomorrow' : `in ${u.daysUntil} days`
    const extra = yearsLabel(u)
    add({
      id: 'date-soon', tone: u.daysUntil <= 1 ? 'warn' : 'info', icon: CalendarHeart, rank: u.daysUntil <= 1 ? 2 : 5, to: '/life/dates',
      title: `${u.item.title} ${when}`,
      detail: [DATE_KIND_LABELS[u.item.kind], extra, u.item.kind === 'birthday' && u.daysUntil > 0 ? 'Plan a gift or message.' : null].filter(Boolean).join(' · '),
    })
  }

  // ── Headline
  const parts: string[] = []
  if (agenda.events.length) parts.push(plural(agenda.events.length, 'event'))
  if (openToday.length) parts.push(`${plural(openToday.length, 'task')} due`)
  const payToday = upcomingPayments(data.plannedPayments, 0).filter((d) => d.daysUntil === 0)
  if (payToday.length) parts.push(plural(payToday.length, 'payment'))
  const summary = parts.length
    ? `Today you have ${parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : parts[0]}.`
    : 'Your day is clear — a good moment to plan ahead.'

  const name = data.settings.userName.trim()
  return {
    greeting: `${greeting(now)}${name ? `, ${name.split(' ')[0]}` : ''}`,
    summary,
    insights: out.sort((a, b) => a.rank - b.rank),
  }
}
