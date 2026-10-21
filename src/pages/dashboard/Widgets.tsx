import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowUpRight, BookHeart, Briefcase, CalendarDays, CalendarHeart, CalendarPlus, Check,
  CheckCircle2, ChevronRight, Flame, Minus, NotebookPen, PiggyBank, Plus, Receipt, Repeat, Sparkles, Target,
  Wallet, type LucideIcon,
} from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, CategoryIcon, Checkbox, cn, EmptyState, Progress, Stat,
} from '@/components/ui'
import { dayAgenda, overdueTasks, sortTasks } from '@/lib/agenda'
import { fmtTime, relativeDay, timeToMinutes, todayISO, addDaysISO, currentMonth, fmtMonth, UI_LOCALE } from '@/lib/dates'
import { EVENT_TYPE_COLORS, MOOD_EMOJI, MOOD_LABELS } from '@/lib/defaults'
import { budgetRows, budgetTone, goalProgress, monthTotals, savingsRate, upcomingPayments } from '@/lib/finance'
import { useMoney } from '@/lib/format'
import { businessTotals, invoiceState, receivables } from '@/lib/business'
import { amountOn, doneOn, isDueToday, streak, weekCount } from '@/lib/habits'
import { DATE_KIND_LABELS, upcomingDates, yearsLabel } from '@/lib/lifeDates'
import { monthEnd, monthStart, relativeDistance } from '@/lib/dates'
import { colorHex } from '@/lib/icons'
import { buildBriefing, type InsightTone } from '@/lib/insights'
import { makeTask, useStore } from '@/lib/store'
import { openEditor, toast } from '@/lib/ui'
import type { Mood } from '@/lib/types'

/** Re-render every minute so time-based content stays fresh. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function LinkMore({ to, children = 'View all' }: { to: string; children?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-accent-text hover:underline">
      {children} <ChevronRight size={14} />
    </Link>
  )
}

// ───────────────────────── Briefing ─────────────────────────

const TONE_STYLES: Record<InsightTone, string> = {
  info: 'bg-accent-soft text-accent-text',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
}

export function BriefingWidget() {
  const now = useNow()
  const s = useStore()
  // Only the data slices matter; recompute when any of them change.
  const data = useMemo(
    () => ({
      settings: s.settings, tasks: s.tasks, events: s.events, journal: s.journal, transactions: s.transactions,
      plannedPayments: s.plannedPayments, budgets: s.budgets, financeCategories: s.financeCategories, goals: s.goals,
      habits: s.habits, invoices: s.invoices, clients: s.clients, importantDates: s.importantDates,
    }),
    [s.settings, s.tasks, s.events, s.journal, s.transactions, s.plannedPayments, s.budgets, s.financeCategories, s.goals,
      s.habits, s.invoices, s.clients, s.importantDates],
  )
  const briefing = useMemo(() => buildBriefing(data, now), [data, now])
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? briefing.insights : briefing.insights.slice(0, 4)

  return (
    <Card>
      <CardHeader
        title="Daily briefing"
        icon={Sparkles}
        subtitle={briefing.summary}
      />
      {briefing.insights.length === 0 ? (
        <p className="text-sm text-muted">Nothing needs your attention right now. Add tasks, events and transactions and Orbit will point out what matters.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {shown.map((i) => (
            <li key={i.id}>
              <Link
                to={i.to ?? '/'}
                className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2"
              >
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE_STYLES[i.tone])}>
                  <i.icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{i.title}</span>
                  {i.detail && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{i.detail}</span>}
                </span>
                <ChevronRight size={16} className="mt-2 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {briefing.insights.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[13px] font-medium text-accent-text hover:underline"
        >
          {expanded ? 'Show less' : `Show all ${briefing.insights.length} insights`}
        </button>
      )}
    </Card>
  )
}

// ───────────────────────── Quick add ─────────────────────────

export function QuickWidget() {
  const navigate = useNavigate()
  const items: { label: string; icon: LucideIcon; tone: string; run: () => void }[] = [
    { label: 'Task', icon: CheckCircle2, tone: '#5b5bd6', run: () => openEditor({ kind: 'task', initial: { dueDate: todayISO() } }) },
    { label: 'Event', icon: CalendarPlus, tone: '#0090ff', run: () => openEditor({ kind: 'event' }) },
    { label: 'Expense', icon: ArrowUpRight, tone: '#eb6834', run: () => openEditor({ kind: 'transaction', initial: { type: 'expense' } }) },
    { label: 'Income', icon: ArrowDownLeft, tone: '#1a7f4b', run: () => openEditor({ kind: 'transaction', initial: { type: 'income' } }) },
    { label: 'Note', icon: NotebookPen, tone: '#e2a336', run: () => openEditor({ kind: 'note' }) },
    { label: 'Journal', icon: BookHeart, tone: '#d6409f', run: () => navigate(`/journal/${todayISO()}`) },
  ]
  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-6 sm:px-0">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={it.run}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-surface py-2 pl-2 pr-3.5 text-sm font-medium text-ink shadow-card transition-colors hover:border-line-strong sm:justify-center sm:px-2"
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `color-mix(in srgb, ${it.tone} 14%, transparent)`, color: it.tone }}
          >
            <it.icon size={15} />
          </span>
          {it.label}
        </button>
      ))}
    </div>
  )
}

// ───────────────────────── Today's schedule ─────────────────────────

export function TodayWidget() {
  const now = useNow()
  const events = useStore((s) => s.events)
  const tasks = useStore((s) => s.tasks)
  const plannedPayments = useStore((s) => s.plannedPayments)
  const journal = useStore((s) => s.journal)
  const money = useMoney()
  const today = todayISO()
  const agenda = useMemo(
    () => dayAgenda({ events, tasks, plannedPayments, journal }, today),
    [events, tasks, plannedPayments, journal, today],
  )
  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <Card>
      <CardHeader
        title="Today’s schedule"
        icon={CalendarDays}
        subtitle={new Date().toLocaleDateString(UI_LOCALE, { weekday: 'long', month: 'long', day: 'numeric' })}
        action={<LinkMore to={`/calendar?view=day&date=${today}`}>Calendar</LinkMore>}
      />
      {agenda.events.length === 0 && agenda.payments.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarDays}
          title="Nothing scheduled"
          description="Plan your day: add meetings, appointments or focus blocks."
          action={<Button size="sm" icon={Plus} onClick={() => openEditor({ kind: 'event', initial: { date: today } })}>Add event</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {agenda.events.map((o) => {
            const ev = o.event
            const past = !ev.allDay && timeToMinutes(ev.endTime ?? ev.startTime) < nowMin
            const live = !ev.allDay && timeToMinutes(ev.startTime) <= nowMin && nowMin < timeToMinutes(ev.endTime ?? ev.startTime)
            return (
              <li key={o.key}>
                <button
                  type="button"
                  onClick={() => openEditor({ kind: 'event', id: ev.id, occurrenceDate: o.date })}
                  className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2', past && 'opacity-50')}
                >
                  <span className="w-16 shrink-0 text-right text-[13px] tabular text-muted">
                    {ev.allDay ? 'All day' : fmtTime(ev.startTime)}
                  </span>
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colorHex(ev.color ?? EVENT_TYPE_COLORS[ev.type]) }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <span className="truncate">{ev.title}</span>
                      {ev.recurrence.freq !== 'none' && <Repeat size={12} className="shrink-0 text-muted" />}
                      {live && <Badge tone="accent">Now</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {[ev.endTime && !ev.allDay ? `until ${fmtTime(ev.endTime)}` : null, ev.location].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {agenda.payments.map((d) => (
            <li key={d.payment.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <span className="w-16 shrink-0 text-right text-[13px] text-muted">Due</span>
              <Receipt size={16} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.payment.name}</span>
              <span className="text-sm tabular text-ink-2">{money(d.payment.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ───────────────────────── Tasks ─────────────────────────

export function TasksWidget() {
  const tasks = useStore((s) => s.tasks)
  const categories = useStore((s) => s.taskCategories)
  const toggleTask = useStore((s) => s.toggleTask)
  const insert = useStore((s) => s.insert)
  const [text, setText] = useState('')
  const today = todayISO()

  const { list, done, total, overdueCount } = useMemo(() => {
    const overdue = overdueTasks(tasks, today)
    const dueToday = sortTasks(tasks.filter((t) => t.dueDate === today))
    const open = [...overdue, ...dueToday.filter((t) => t.status !== 'done')]
    return {
      list: [...open, ...dueToday.filter((t) => t.status === 'done')].slice(0, 7),
      done: dueToday.filter((t) => t.status === 'done').length,
      total: dueToday.length,
      overdueCount: overdue.length,
    }
  }, [tasks, today])

  const add = () => {
    const title = text.trim()
    if (!title) return
    insert('tasks', makeTask({ title, dueDate: today }, categories[0]?.id))
    setText('')
    toast('Task added for today')
  }

  return (
    <Card>
      <CardHeader
        title="Tasks"
        icon={CheckCircle2}
        subtitle={total ? `${done} of ${total} done today${overdueCount ? ` · ${overdueCount} overdue` : ''}` : overdueCount ? `${overdueCount} overdue` : 'Nothing due today'}
        action={<LinkMore to="/tasks?view=today" />}
      />
      {total > 0 && <Progress value={done / total} className="mb-3" label="Today's progress" />}
      <ul className="-mx-2 flex flex-col">
        {list.map((t) => {
          const cat = categories.find((c) => c.id === t.categoryId)
          const isOverdue = t.status !== 'done' && !!t.dueDate && t.dueDate < today
          return (
            <li key={t.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => openEditor({ kind: 'task', id: t.id })}
                onKeyDown={(e) => e.key === 'Enter' && openEditor({ kind: 'task', id: t.id })}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
              >
                <Checkbox
                  round
                  checked={t.status === 'done'}
                  label={`Complete ${t.title}`}
                  color={t.priority === 'urgent' ? '#e5484d' : t.priority === 'high' ? '#f76b15' : undefined}
                  onChange={() => toggleTask(t.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm', t.status === 'done' ? 'text-muted line-through' : 'text-ink')}>{t.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {isOverdue && <span className="text-bad">{relativeDay(t.dueDate!)}</span>}
                    {t.dueTime && <span>{fmtTime(t.dueTime)}</span>}
                    {cat && <span className="truncate">{cat.name}</span>}
                  </span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      {list.length === 0 && <p className="py-2 text-sm text-muted">You’re clear. Add something below or plan tomorrow.</p>}
      <form
        className="mt-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Plus size={16} className="text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task for today"
          className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
        />
      </form>
    </Card>
  )
}

// ───────────────────────── Money ─────────────────────────

export function MoneyWidget() {
  const txs = useStore((s) => s.transactions)
  const money = useMoney()
  const month = currentMonth()
  const t = useMemo(() => monthTotals(txs, month), [txs, month])
  const rate = savingsRate(t)
  return (
    <Card>
      <CardHeader
        title={`${fmtMonth(month, 'MMMM')} money`}
        icon={Wallet}
        action={<LinkMore to="/money">Details</LinkMore>}
      />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Income" value={money(t.income, { compact: true })} />
        <Stat label="Spent" value={money(t.expense, { compact: true })} />
        <Stat
          label="Balance"
          value={money(t.net, { compact: true })}
          tone={t.net < 0 ? 'bad' : 'neutral'}
          hint={t.income > 0 ? `${Math.round(rate * 100)}% saved` : undefined}
        />
      </div>
      {t.income > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>Spent of income</span>
            <span className="tabular">{Math.round((t.expense / t.income) * 100)}%</span>
          </div>
          <Progress value={t.expense / t.income} tone={t.expense > t.income ? 'bad' : t.expense / t.income > 0.85 ? 'warn' : 'accent'} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" icon={ArrowUpRight} onClick={() => openEditor({ kind: 'transaction', initial: { type: 'expense' } })}>Expense</Button>
        <Button size="sm" icon={ArrowDownLeft} onClick={() => openEditor({ kind: 'transaction', initial: { type: 'income' } })}>Income</Button>
      </div>
    </Card>
  )
}

export function BudgetWidget() {
  const txs = useStore((s) => s.transactions)
  const budgets = useStore((s) => s.budgets)
  const categories = useStore((s) => s.financeCategories)
  const money = useMoney()
  const month = currentMonth()
  const rows = useMemo(
    () => budgetRows(budgets, categories, txs, month).filter((r) => r.budget > 0).sort((a, b) => b.ratio - a.ratio),
    [budgets, categories, txs, month],
  )
  const total = rows.reduce((s, r) => s + r.budget, 0)
  const spent = rows.reduce((s, r) => s + r.spent, 0)
  return (
    <Card>
      <CardHeader
        title="Budget"
        icon={PiggyBank}
        subtitle={total ? `${money(spent)} of ${money(total)} used` : undefined}
        action={<LinkMore to="/money/budget">Budget</LinkMore>}
      />
      {rows.length === 0 ? (
        <EmptyState compact title="No budgets yet" description="Set monthly limits per category to see how you’re tracking." action={<Link to="/money/budget"><Button size="sm">Set budgets</Button></Link>} />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {rows.slice(0, 4).map((r) => (
            <li key={r.category.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <CategoryIcon icon={r.category.icon} color={r.category.color} size={24} />
                  <span className="truncate text-ink">{r.category.name}</span>
                </span>
                <span className={cn('shrink-0 text-[13px] tabular', r.ratio > 1 ? 'text-bad' : 'text-muted')}>
                  {money(r.spent)} / {money(r.budget)}
                </span>
              </div>
              <Progress value={r.ratio} tone={budgetTone(r.ratio) === 'good' ? 'accent' : budgetTone(r.ratio)} label={`${r.category.name} budget`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function PaymentsWidget() {
  const payments = useStore((s) => s.plannedPayments)
  const markPaymentPaid = useStore((s) => s.markPaymentPaid)
  const categories = useStore((s) => s.financeCategories)
  const money = useMoney()
  const dues = useMemo(() => upcomingPayments(payments, 14).slice(0, 5), [payments])
  return (
    <Card>
      <CardHeader title="Upcoming payments" icon={Receipt} subtitle="Next 14 days" action={<LinkMore to="/money/payments" />} />
      {dues.length === 0 ? (
        <p className="py-2 text-sm text-muted">No bills or subscriptions due in the next two weeks.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {dues.map((d) => {
            const cat = categories.find((c) => c.id === d.payment.categoryId)
            return (
              <li key={`${d.payment.id}:${d.date}`} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <CategoryIcon icon={cat?.icon} color={cat?.color} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{d.payment.name}</span>
                  <span className={cn('block text-xs', d.overdue ? 'text-bad' : 'text-muted')}>
                    {d.overdue ? `Overdue · ${relativeDay(d.date)}` : relativeDay(d.date)}
                  </span>
                </span>
                <span className="text-sm tabular text-ink">{money(d.payment.amount)}</span>
                {d.date === d.payment.nextDue && (
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => {
                      markPaymentPaid(d.payment.id)
                      toast(`${d.payment.name} logged as expense`)
                    }}
                  >
                    Paid
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function GoalsWidget() {
  const goals = useStore((s) => s.goals)
  const money = useMoney()
  const active = useMemo(() => goals.filter((g) => !g.archived).slice(0, 3), [goals])
  return (
    <Card>
      <CardHeader title="Savings goals" icon={PiggyBank} action={<LinkMore to="/money/goals" />} />
      {active.length === 0 ? (
        <EmptyState compact title="No goals yet" description="Save toward something that matters — a trip, a cushion, a big purchase." action={<Link to="/money/goals"><Button size="sm">Create a goal</Button></Link>} />
      ) : (
        <ul className="flex flex-col gap-4">
          {active.map((g) => {
            const p = goalProgress(g)
            return (
              <li key={g.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{g.name}</span>
                  <span className="shrink-0 text-[13px] tabular text-muted">
                    {money(p.saved, { compact: true })} / {money(g.target, { compact: true })}
                  </span>
                </div>
                <Progress value={p.ratio} color={g.color} label={`${g.name} progress`} />
                <p className="mt-1 text-xs text-muted">
                  {p.ratio >= 1
                    ? 'Goal reached'
                    : p.monthlyNeeded
                      ? `${Math.round(p.ratio * 100)}% · ${money(p.monthlyNeeded)}/month to hit ${relativeDay(g.targetDate!)}`
                      : `${Math.round(p.ratio * 100)}%`}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function JournalWidget() {
  const journal = useStore((s) => s.journal)
  const upsertJournal = useStore((s) => s.upsertJournal)
  const navigate = useNavigate()
  const today = todayISO()
  const entry = journal.find((j) => j.date === today)
  const streak = useMemo(() => {
    const dates = new Set(journal.map((j) => j.date))
    let n = 0
    for (let d = dates.has(today) ? today : addDaysISO(today, -1); dates.has(d); d = addDaysISO(d, -1)) n++
    return n
  }, [journal, today])

  return (
    <Card>
      <CardHeader
        title="Journal"
        icon={BookHeart}
        subtitle={streak ? `${streak}-day streak` : 'Reflect on your day'}
        action={<LinkMore to={`/journal/${today}`}>{entry ? 'Open' : 'Write'}</LinkMore>}
      />
      <p className="mb-2 text-sm text-ink-2">{entry?.mood ? `Feeling ${MOOD_LABELS[entry.mood].toLowerCase()} today` : 'How are you feeling today?'}</p>
      <div className="flex gap-2">
        {([1, 2, 3, 4, 5] as Mood[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-label={MOOD_LABELS[m]}
            aria-pressed={entry?.mood === m}
            onClick={() => {
              upsertJournal(today, { mood: m })
              toast(`Mood logged: ${MOOD_LABELS[m]}`)
            }}
            className={cn(
              'flex h-11 flex-1 items-center justify-center rounded-xl border text-xl transition-all',
              entry?.mood === m ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
            )}
          >
            {MOOD_EMOJI[m]}
          </button>
        ))}
      </div>
      {entry?.body ? (
        <p className="mt-3 line-clamp-2 text-[13px] text-muted">{entry.body}</p>
      ) : (
        <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => navigate(`/journal/${today}`)}>
          Add gratitude & reflection →
        </Button>
      )}
    </Card>
  )
}

// ───────────────────────── Habits ─────────────────────────

export function HabitsWidget() {
  const habits = useStore((s) => s.habits)
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const logHabit = useStore((s) => s.logHabit)
  const today = todayISO()
  const due = useMemo(
    () => habits.filter((h) => isDueToday(h, today, weekStartsOn)).sort((a, b) => a.order - b.order),
    [habits, today, weekStartsOn],
  )
  const done = due.filter((h) => doneOn(h, today)).length

  return (
    <Card>
      <CardHeader
        title="Habits today"
        icon={Target}
        subtitle={due.length ? `${done} of ${due.length} done` : undefined}
        action={<LinkMore to="/growth">Open</LinkMore>}
      />
      {due.length === 0 ? (
        <EmptyState
          compact
          title={habits.length ? 'Nothing due today' : 'No habits yet'}
          description={habits.length ? 'Enjoy the rest day.' : 'Small daily routines add up — start with one.'}
          action={!habits.length && <Link to="/growth/habits"><Button size="sm" icon={Plus}>Add a habit</Button></Link>}
        />
      ) : (
        <>
          <Progress value={done / due.length} tone={done === due.length ? 'good' : 'accent'} className="mb-3" label="Habits done today" />
          <ul className="-mx-2 flex flex-col">
            {due.map((h) => {
              const amount = amountOn(h, today)
              const isDone = doneOn(h, today)
              const st = streak(h, weekStartsOn, today)
              const counter = h.target > 1
              return (
                <li key={h.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                  <button
                    type="button"
                    role={counter ? undefined : 'checkbox'}
                    aria-checked={counter ? undefined : isDone}
                    aria-label={counter ? `Log one ${h.unit ?? 'time'} of ${h.name}` : `Mark ${h.name} done`}
                    onClick={() => logHabit(h.id, today, counter ? Math.min(h.target, amount + 1) : isDone ? 0 : 1)}
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
                      isDone ? 'border-transparent text-white' : 'border-line-strong text-ink-2',
                    )}
                    style={isDone ? { background: colorHex(h.color) } : undefined}
                  >
                    {isDone ? <Check size={16} strokeWidth={3} /> : counter ? <Plus size={16} /> : null}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', isDone ? 'text-muted' : 'text-ink')}>
                      {h.emoji ? `${h.emoji} ` : ''}{h.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {counter
                        ? `${amount}/${h.target}${h.unit ? ` ${h.unit}` : ''}`
                        : h.schedule.kind === 'weekly'
                          ? `${weekCount(h, today, weekStartsOn)}/${h.schedule.times} this week`
                          : isDone ? 'Done' : 'To do'}
                    </span>
                  </span>
                  {counter && amount > 0 && !isDone && (
                    <button
                      type="button"
                      aria-label={`Undo one ${h.name}`}
                      onClick={() => logHabit(h.id, today, amount - 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <Minus size={15} />
                    </button>
                  )}
                  {st.count >= 2 && (
                    <span className="flex items-center gap-0.5 text-xs font-medium tabular text-warn" title={`${st.count}-${st.unit} streak`}>
                      <Flame size={13} /> {st.count}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

// ───────────────────────── Important dates ─────────────────────────

export function DatesWidget() {
  const dates = useStore((s) => s.importantDates)
  const upcoming = useMemo(() => upcomingDates(dates, 45).slice(0, 4), [dates])
  return (
    <Card>
      <CardHeader title="Important dates" icon={CalendarHeart} subtitle="Next 45 days" action={<LinkMore to="/life/dates" />} />
      {upcoming.length === 0 ? (
        <EmptyState
          compact
          title={dates.length ? 'Nothing coming up' : 'Never miss a birthday'}
          description={dates.length ? undefined : 'Add birthdays, anniversaries and renewals — Orbit reminds you in time.'}
          action={!dates.length && <Link to="/life/dates?new=1"><Button size="sm" icon={Plus}>Add a date</Button></Link>}
        />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {upcoming.map((u) => (
            <li key={u.item.id + u.date}>
              <Link to="/life/dates" className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
                <span className={cn(
                  'flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none',
                  u.daysUntil <= 1 ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-ink-2',
                )}>
                  <span className="text-[10px] font-semibold uppercase">{fmtMonth(u.date.slice(0, 7), 'MMM')}</span>
                  <span className="text-[15px] font-semibold tabular">{Number(u.date.slice(8))}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{u.item.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {[DATE_KIND_LABELS[u.item.kind], yearsLabel(u)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className={cn('shrink-0 text-xs font-medium', u.daysUntil <= 1 ? 'text-warn' : 'text-muted')}>
                  {relativeDistance(u.date)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ───────────────────────── Business ─────────────────────────

export function BusinessWidget() {
  const txs = useStore((s) => s.transactions)
  const invoices = useStore((s) => s.invoices)
  const clients = useStore((s) => s.clients)
  const markInvoicePaid = useStore((s) => s.markInvoicePaid)
  const unmarkInvoicePaid = useStore((s) => s.unmarkInvoicePaid)
  const money = useMoney()
  const month = currentMonth()
  const today = todayISO()
  const t = useMemo(() => businessTotals(txs, monthStart(month), monthEnd(month)), [txs, month])
  const r = useMemo(() => receivables(invoices, today), [invoices, today])
  const open = useMemo(
    () => invoices
      .filter((i) => ['pending', 'overdue'].includes(invoiceState(i, today)))
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .slice(0, 3),
    [invoices, today],
  )
  const empty = !invoices.length && !t.income && !t.expenses

  return (
    <Card>
      <CardHeader title="Business" icon={Briefcase} subtitle={fmtMonth(month)} action={<LinkMore to="/business">Open</LinkMore>} />
      {empty ? (
        <EmptyState
          compact
          title="Track clients & invoices"
          description="Freelance jobs, commissions and pending payments — with profit kept apart from personal money."
          action={<Link to="/business/invoices?new=1"><Button size="sm" icon={Plus}>New invoice</Button></Link>}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Revenue" value={money(t.income, { compact: true })} />
            <Stat label="Profit" value={money(t.profit, { compact: true })} tone={t.profit < 0 ? 'bad' : 'neutral'} />
            <Stat
              label="Owed to you"
              value={money(r.pending, { compact: true })}
              hint={r.overdueCount ? `${r.overdueCount} overdue` : undefined}
              tone={r.overdueCount ? 'bad' : 'neutral'}
            />
          </div>
          {open.length > 0 && (
            <ul className="-mx-2 mt-3 flex flex-col border-t border-line pt-2">
              {open.map((inv) => {
                const overdue = invoiceState(inv, today) === 'overdue'
                const client = clients.find((c) => c.id === inv.clientId)
                return (
                  <li key={inv.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{client?.name ?? inv.title}</span>
                      <span className={cn('block truncate text-xs', overdue ? 'text-bad' : 'text-muted')}>
                        {inv.number}{inv.dueDate ? ` · ${overdue ? 'overdue ' : 'due '}${relativeDistance(inv.dueDate)}` : ''}
                      </span>
                    </span>
                    <span className="text-sm tabular text-ink">{money(inv.amount)}</span>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => {
                        markInvoicePaid(inv.id)
                        toast('Payment recorded as income', { action: { label: 'Undo', onClick: () => unmarkInvoicePaid(inv.id) } })
                      }}
                    >
                      Paid
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}
