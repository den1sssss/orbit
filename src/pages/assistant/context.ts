// Compact plain-text snapshot of the user's data for the assistant (target ≤ ~2k tokens).
// Never includes the Vault, notes, or journal text — journal moods/energy only.
import { agendaRange, overdueTasks, sortTasks } from '@/lib/agenda'
import { daysOverdue, invoiceState, receivables } from '@/lib/business'
import { addDaysISO, diffDays, fmt, minutesToTime, monthOf, shiftMonth, timeToMinutes, todayISO } from '@/lib/dates'
import { PRIORITY_LABELS } from '@/lib/defaults'
import {
  budgetRows, categoryBreakdown, goalProgress, monthElapsed, monthTotals, monthlyCommitments, txInMonth, upcomingPayments,
} from '@/lib/finance'
import { formatMoney, pct } from '@/lib/format'
import { consistency, describeSchedule, doneOn, amountOn, isDueToday, streak } from '@/lib/habits'
import { DATE_KIND_LABELS, upcomingDates, yearsLabel } from '@/lib/lifeDates'
import type { AppData, CalendarEvent, ISODate, LifeGoal, Task } from '@/lib/types'
import type { SystemBlock } from './api'

/** Stable instructions (cached prefix). Keep free of dates and other per-request values. */
export const SYSTEM_PROMPT = `You are the assistant built into Orbit, the user's personal productivity and life-management app. You help them organize their day, summarize tasks, spot upcoming deadlines, review spending, and improve their schedule and budget.

How to answer:
- Be concise, specific and actionable. Lead with the answer, then the few details that matter. No filler, no generic advice.
- Work only from the data snapshot in <orbit_data>. Never invent tasks, events, amounts, dates or people. If something you need is missing from the snapshot, say so plainly and suggest what to add in Orbit.
- When planning time, give concrete time blocks with exact start and end times that fit the listed free blocks and don't overlap events. Put the most important or hardest work in the longest early block, respect due times and priorities, and leave short buffers.
- Show money in the user's currency, as in the snapshot. When reviewing spending, compare against budgets and last month, name the categories that matter, and give a specific next step with a number.
- Resolve "today", "tomorrow" and weekday names using the date lines at the top of the snapshot.
- Format with short paragraphs, bullet or numbered lists, **bold** for key items, and occasional ### headings. No tables or code blocks.

Actions:
- You can propose adding a task (add_task) or a calendar event (add_event). Each proposal appears as a card the user must tap Apply on; nothing is saved until they do, so never say an item was added.
- Propose items only when the user asks you to plan, schedule or add something, or agrees to a suggestion. At most 4 proposals per answer, and never duplicates of items already in the snapshot.
- Make the tool calls first, then write your explanation after the results come back, mentioning that they can apply the cards they want.

Privacy: the snapshot intentionally excludes the user's Vault documents and journal text. Never ask for passwords, ID numbers or account numbers.`

const DAY_START = 8 * 60
const DAY_END = 21 * 60
const MIN_FREE = 30

type Data = Pick<
  AppData,
  | 'settings' | 'tasks' | 'projects' | 'events' | 'journal' | 'habits' | 'lifeGoals' | 'transactions'
  | 'financeCategories' | 'budgets' | 'goals' | 'plannedPayments' | 'invoices' | 'clients' | 'importantDates'
>

function day(iso: ISODate): string {
  return fmt(iso, 'EEE yyyy-MM-dd')
}

function capped(lines: string[], max: number): string[] {
  if (lines.length <= max) return lines
  return [...lines.slice(0, max), `- …and ${lines.length - max} more`]
}

function section(title: string, lines: string[], empty?: string): string {
  if (!lines.length) return empty ? `## ${title}\n${empty}` : ''
  return `## ${title}\n${lines.join('\n')}`
}

function eventSpan(ev: CalendarEvent): string {
  if (ev.allDay || !ev.startTime) return 'all day'
  const end = ev.endTime ?? minutesToTime(timeToMinutes(ev.startTime) + 60)
  return `${ev.startTime}–${end}`
}

function eventLine(ev: CalendarEvent, withDate?: ISODate): string {
  const where = ev.location ? ` @ ${ev.location}` : ''
  return `- ${withDate ? `${day(withDate)} ` : ''}${eventSpan(ev)} ${ev.title} (${ev.type})${where}`
}

function taskLine(t: Task, today: ISODate, projects: Data['projects']): string {
  const parts = [`- [${PRIORITY_LABELS[t.priority]}] ${t.title}`]
  if (t.dueDate) {
    const overdue = t.dueDate < today ? ` (${diffDays(today, t.dueDate)}d overdue)` : ''
    parts.push(`due ${t.dueDate === today ? 'today' : day(t.dueDate)}${t.dueTime ? ` ${t.dueTime}` : ''}${overdue}`)
  }
  if (t.status === 'in_progress') parts.push('in progress')
  if (t.status === 'waiting') parts.push('waiting')
  const project = t.projectId ? projects.find((p) => p.id === t.projectId) : undefined
  if (project) parts.push(`project: ${project.name}`)
  if (t.subtasks.length) parts.push(`${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} subtasks`)
  return parts.join(' · ')
}

/** Free gaps (≥ 30 min) between timed events on a date, within the working window. */
function freeBlocks(events: CalendarEvent[], from: number, to: number): string[] {
  const busy = events
    .filter((e) => !e.allDay && e.startTime)
    .map((e) => {
      const s = timeToMinutes(e.startTime)
      const end = e.endTime ? timeToMinutes(e.endTime) : s + 60
      return [s, Math.max(end, s + 15)] as const
    })
    .sort((a, b) => a[0] - b[0])
  const out: string[] = []
  let cursor = from
  for (const [s, e] of busy) {
    if (s - cursor >= MIN_FREE) out.push(`${minutesToTime(cursor)}–${minutesToTime(Math.min(s, to))}`)
    cursor = Math.max(cursor, e)
    if (cursor >= to) break
  }
  if (to - cursor >= MIN_FREE) out.push(`${minutesToTime(cursor)}–${minutesToTime(to)}`)
  return out
}

function goalProgressText(g: LifeGoal): string {
  if (g.measure === 'milestones') {
    const done = g.milestones.filter((m) => m.done).length
    const next = g.milestones.find((m) => !m.done)
    const p = g.milestones.length ? pct(done / g.milestones.length) : 'no milestones'
    return `${p} (${done}/${g.milestones.length} milestones${next ? `; next: ${next.title}` : ''})`
  }
  if (g.measure === 'number') {
    const unit = g.unit ? ` ${g.unit}` : ''
    return g.target ? `${g.current ?? 0}/${g.target}${unit} (${pct((g.current ?? 0) / g.target)})` : `${g.current ?? 0}${unit}`
  }
  return `${g.progress ?? 0}%`
}

/** Build the per-turn snapshot. `now` is injectable for tests. */
export function buildContext(d: Data, now = new Date()): string {
  const today = todayISO()
  const s = d.settings
  const cur = s.currency
  const money = (n: number) => formatMoney(n, cur)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowTime = minutesToTime(nowMin)
  let tz = ''
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* unsupported */ }

  const out: string[] = []
  out.push(
    `Now: ${fmt(today, 'EEEE yyyy-MM-dd')}, ${nowTime} local time${tz ? ` (${tz})` : ''}. Times are 24h.`,
    `Next days: ${Array.from({ length: 7 }, (_, i) => day(addDaysISO(today, i + 1))).join(', ')}.`,
    `User: ${s.userName || 'unknown name'} · currency ${cur} · week starts ${s.weekStartsOn === 1 ? 'Monday' : 'Sunday'}.`,
  )

  // ── Schedule ──
  const week = agendaRange({ events: d.events, tasks: d.tasks, plannedPayments: [], journal: [] }, today, addDaysISO(today, 7))
  const todayAgenda = week.get(today)!
  const tomorrow = addDaysISO(today, 1)
  const tomorrowAgenda = week.get(tomorrow)!

  out.push(section('Today\'s events', todayAgenda.events.map((o) => eventLine(o.event)), 'None.'))
  const startToday = Math.max(DAY_START, Math.ceil(nowMin / 15) * 15)
  out.push(
    section(
      `Free time today (${minutesToTime(DAY_START)}–${minutesToTime(DAY_END)}, from now)`,
      startToday < DAY_END ? freeBlocks(todayAgenda.events.map((o) => o.event), startToday, DAY_END).map((b) => `- ${b}`) : [],
      'None left today.',
    ),
  )
  out.push(
    section(
      'Free time tomorrow',
      freeBlocks(tomorrowAgenda.events.map((o) => o.event), DAY_START, DAY_END).map((b) => `- ${b}`),
      'None.',
    ),
  )
  const later: string[] = []
  for (const [date, a] of week) {
    if (date === today) continue
    for (const o of a.events) later.push(eventLine(o.event, date))
  }
  out.push(section('Events next 7 days', capped(later, 14)))

  // ── Tasks ──
  const open = d.tasks.filter((t) => t.status !== 'done')
  const overdue = overdueTasks(open, today)
  const dueToday = sortTasks(open.filter((t) => t.dueDate === today))
  const nextWeek = open
    .filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= addDaysISO(today, 7))
    .sort((a, b) => (a.dueDate! + (a.dueTime ?? '99')).localeCompare(b.dueDate! + (b.dueTime ?? '99')))
  const undated = sortTasks(open.filter((t) => !t.dueDate))
  const tl = (t: Task) => taskLine(t, today, d.projects)
  out.push(section('Overdue tasks', capped(overdue.map(tl), 10)))
  out.push(section('Tasks due today', capped(dueToday.map(tl), 12), 'None.'))
  out.push(section('Tasks due next 7 days', capped(nextWeek.map(tl), 14)))
  if (undated.length) {
    const important = undated.filter((t) => t.priority === 'urgent' || t.priority === 'high')
    out.push(section(`Undated open tasks: ${undated.length} total; high/urgent ones`, capped(important.map(tl), 6)) || `## Undated open tasks: ${undated.length}`)
  }
  const doneToday = d.tasks.filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).toDateString() === now.toDateString()).length
  if (doneToday) out.push(`Completed today: ${doneToday} task(s).`)

  const projects = d.projects
    .filter((p) => p.status === 'active' && p.deadline && p.deadline <= addDaysISO(today, 30))
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .map((p) => {
      const left = open.filter((t) => t.projectId === p.id).length
      const when = p.deadline! < today ? `${diffDays(today, p.deadline!)}d overdue` : `in ${diffDays(p.deadline!, today)}d`
      return `- ${p.name}: deadline ${day(p.deadline!)} (${when}), ${left} open task(s)`
    })
  out.push(section('Project deadlines (30 days)', capped(projects, 6)))

  // ── Habits & goals ──
  const habits = d.habits
    .filter((h) => !h.archived)
    .sort((a, b) => a.order - b.order)
    .map((h) => {
      const due = isDueToday(h, today, s.weekStartsOn)
      const st = streak(h, s.weekStartsOn, today)
      const c = consistency(h, addDaysISO(today, -29), today, s.weekStartsOn)
      const todayText = doneOn(h, today)
        ? 'done today'
        : due ? `due today${h.target > 1 ? ` (${amountOn(h, today)}/${h.target}${h.unit ? ` ${h.unit}` : ''})` : ''}` : 'not due today'
      return `- ${h.name} (${describeSchedule(h)}): ${todayText} · streak ${st.count} ${st.unit}${st.count === 1 ? '' : 's'} · 30-day ${pct(c.rate)}`
    })
  out.push(section('Habits', capped(habits, 10)))

  const goals = d.lifeGoals
    .filter((g) => g.status === 'active')
    .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))
    .map((g) => {
      const when = g.targetDate ? ` · target ${day(g.targetDate)} (${g.targetDate < today ? 'past' : `in ${diffDays(g.targetDate, today)}d`})` : ''
      return `- ${g.title} (${g.area}, ${g.horizon}): ${goalProgressText(g)}${when}`
    })
  out.push(section('Active goals', capped(goals, 8)))

  // ── Money ──
  const month = monthOf(today)
  const t = monthTotals(d.transactions, month)
  const last = monthTotals(d.transactions, shiftMonth(month, -1))
  const catName = (id: string) => d.financeCategories.find((c) => c.id === id)?.name ?? 'Other'
  const moneyLines = [
    `- This month (${pct(monthElapsed(month, today))} elapsed): income ${money(t.income)}, expenses ${money(t.expense)}, net ${money(t.net)}`,
    `- Last month: income ${money(last.income)}, expenses ${money(last.expense)}, net ${money(last.net)}`,
  ]
  const top = categoryBreakdown(txInMonth(d.transactions, month), 'expense').slice(0, 5)
  if (top.length) moneyLines.push(`- Top spending: ${top.map((c) => `${catName(c.categoryId)} ${money(c.total)}`).join(', ')}`)
  const rows = budgetRows(d.budgets, d.financeCategories, d.transactions, month)
  const budgeted = rows.filter((r) => r.budget > 0)
  if (budgeted.length) {
    const spent = budgeted.reduce((a, r) => a + r.spent, 0)
    const total = budgeted.reduce((a, r) => a + r.budget, 0)
    moneyLines.push(`- Budgets: ${money(spent)} spent of ${money(total)} budgeted (${budgeted.length} categories)`)
    for (const r of budgeted.filter((x) => x.ratio >= 0.75).slice(0, 6)) {
      moneyLines.push(`  - ${r.category.name}: ${money(r.spent)} of ${money(r.budget)} (${pct(r.ratio)}${r.ratio > 1 ? ', OVER' : ''})`)
    }
  } else {
    moneyLines.push('- No budgets set.')
  }
  const unbudgeted = rows.filter((r) => !r.budget && r.spent > 0).slice(0, 3)
  if (unbudgeted.length) moneyLines.push(`- Spending without a budget: ${unbudgeted.map((r) => `${r.category.name} ${money(r.spent)}`).join(', ')}`)
  const commit = monthlyCommitments(d.plannedPayments)
  if (commit) moneyLines.push(`- Recurring commitments ≈ ${money(commit)}/month (subscriptions ${money(monthlyCommitments(d.plannedPayments, true))})`)
  if (s.monthlySavingsTarget) moneyLines.push(`- Monthly savings target: ${money(s.monthlySavingsTarget)}`)
  out.push(section('Money', moneyLines))

  const pays = upcomingPayments(d.plannedPayments, 14, today).map((p) =>
    `- ${p.overdue ? `OVERDUE since ${day(p.date)}` : day(p.date)}: ${p.payment.name} ${money(p.payment.amount)}${p.payment.isSubscription ? ' (subscription)' : ''}`,
  )
  out.push(section('Bills & payments next 14 days', capped(pays, 10)))

  const savings = d.goals
    .filter((g) => !g.archived)
    .map((g) => {
      const p = goalProgress(g, today)
      const need = p.monthlyNeeded ? `, needs ${money(p.monthlyNeeded)}/month` : ''
      return `- ${g.name}: ${money(p.saved)} of ${money(g.target)} (${pct(p.ratio)})${g.targetDate ? ` by ${g.targetDate}` : ''}${need}`
    })
  out.push(section('Savings goals', capped(savings, 5)))

  const r = receivables(d.invoices, today)
  if (r.pendingCount) {
    const lines = [`- Awaiting payment: ${r.pendingCount} invoice(s), ${money(r.pending)}; overdue: ${r.overdueCount} (${money(r.overdue)})`]
    const open = d.invoices
      .filter((i) => ['pending', 'overdue'].includes(invoiceState(i, today)))
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .map((i) => {
        const client = d.clients.find((c) => c.id === i.clientId)?.name
        const state = invoiceState(i, today) === 'overdue' ? `${daysOverdue(i, today)}d overdue` : i.dueDate ? `due ${day(i.dueDate)}` : 'no due date'
        return `  - ${i.number} ${i.title}${client ? ` (${client})` : ''}: ${money(i.amount)}, ${state}`
      })
    out.push(section('Receivables', [...lines, ...capped(open, 5)]))
  }

  // ── Life ──
  const dates = upcomingDates(d.importantDates, 30, today).map((u) => {
    const extra = yearsLabel(u)
    return `- ${day(u.date)} (${u.daysUntil === 0 ? 'today' : `in ${u.daysUntil}d`}): ${u.item.title} — ${DATE_KIND_LABELS[u.item.kind]}${extra ? `, ${extra}` : ''}`
  })
  out.push(section('Important dates next 30 days', capped(dates, 8)))

  const moods: string[] = []
  for (let i = 6; i >= 0; i--) {
    const date = addDaysISO(today, -i)
    const j = d.journal.find((x) => x.date === date)
    if (j && (j.mood || j.energy)) {
      moods.push(`${fmt(date, 'EEE')} mood ${j.mood ?? '–'}${j.energy ? `/energy ${j.energy}` : ''}`)
    }
  }
  out.push(moods.length ? `## Journal moods, last 7 days (1–5)\n${moods.join(', ')}` : '## Journal moods\nNone logged in the last 7 days.')

  return out.filter(Boolean).join('\n\n')
}

/** System blocks for one turn: stable instructions (cache breakpoint) + this turn's snapshot. */
export function buildSystem(d: Data, now = new Date()): SystemBlock[] {
  return [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `<orbit_data>\n${buildContext(d, now)}\n</orbit_data>` },
  ]
}
