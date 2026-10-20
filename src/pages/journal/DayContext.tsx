// "Your day": what happened elsewhere in Orbit on the journal's date —
// events, tasks finished / still due, and money in and out.
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowUpRight, CalendarDays, CheckCircle2, ChevronDown, Circle, Sun,
} from 'lucide-react'
import { Card, cn } from '@/components/ui'
import { dayAgenda } from '@/lib/agenda'
import { fmtTime, toISO } from '@/lib/dates'
import { totals, txInRange } from '@/lib/finance'
import { useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import { openEditor } from '@/lib/ui'
import type { ISODate, JournalEntry, Task } from '@/lib/types'

const NO_JOURNAL: JournalEntry[] = []
const MAX_ROWS = 4

function initiallyOpen() {
  try {
    return window.matchMedia('(min-width: 1024px)').matches
  } catch {
    return true
  }
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function DayContext({ date }: { date: ISODate }) {
  const events = useStore((s) => s.events)
  const tasks = useStore((s) => s.tasks)
  const plannedPayments = useStore((s) => s.plannedPayments)
  const transactions = useStore((s) => s.transactions)
  const money = useMoney()
  const [open, setOpen] = useState(initiallyOpen)

  const agenda = useMemo(
    () => dayAgenda({ events, tasks, plannedPayments, journal: NO_JOURNAL }, date),
    [events, tasks, plannedPayments, date],
  )
  const completed = useMemo(
    () => tasks.filter((t) => t.completedAt && toISO(new Date(t.completedAt)) === date),
    [tasks, date],
  )
  const openDue = useMemo(() => agenda.tasks.filter((t) => t.status !== 'done'), [agenda])
  const cash = useMemo(() => totals(txInRange(transactions, date, date)), [transactions, date])

  const summary: string[] = []
  if (agenda.events.length) summary.push(plural(agenda.events.length, 'event'))
  if (completed.length) summary.push(`${completed.length} done`)
  if (openDue.length) summary.push(`${openDue.length} due`)
  if (cash.count) {
    if (cash.income) summary.push(`+${money(cash.income)}`)
    if (cash.expense) summary.push(`−${money(cash.expense)}`)
  }
  const empty = summary.length === 0
  const calendarLink = `/calendar?view=day&date=${date}`

  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={empty}
        aria-expanded={empty ? undefined : open}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left disabled:cursor-default sm:px-5"
      >
        <Sun size={17} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-tight text-ink">Your day</p>
          <p className="truncate text-[13px] text-muted">
            {empty ? 'Nothing scheduled or logged in Orbit' : summary.join(' · ')}
          </p>
        </div>
        {!empty && (
          <ChevronDown
            size={18}
            className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
          />
        )}
      </button>

      {!empty && open && (
        <div className="flex flex-col gap-4 border-t border-line px-4 pb-4 pt-3 sm:px-5">
          {agenda.events.length > 0 && (
            <Section title="Schedule" more={agenda.events.length - MAX_ROWS} to={calendarLink}>
              {agenda.events.slice(0, MAX_ROWS).map((o) => (
                <Row
                  key={o.key}
                  onClick={() => openEditor({ kind: 'event', id: o.event.id, occurrenceDate: date })}
                  lead={
                    <span className="tabular w-16 shrink-0 text-xs text-muted">
                      {o.event.allDay ? 'All day' : fmtTime(o.event.startTime)}
                    </span>
                  }
                >
                  {o.event.title}
                </Row>
              ))}
            </Section>
          )}

          {(completed.length > 0 || openDue.length > 0) && (
            <Section title="Tasks" more={completed.length + openDue.length - MAX_ROWS} to="/tasks">
              {[...completed, ...openDue].slice(0, MAX_ROWS).map((t: Task) => {
                const done = t.status === 'done'
                return (
                  <Row
                    key={t.id}
                    onClick={() => openEditor({ kind: 'task', id: t.id })}
                    lead={
                      done ? (
                        <CheckCircle2 size={16} className="shrink-0 text-good" aria-label="Done" />
                      ) : (
                        <Circle size={16} className="shrink-0 text-muted" aria-label="Still open" />
                      )
                    }
                  >
                    <span className={cn(done && 'text-ink-2')}>{t.title}</span>
                  </Row>
                )
              })}
            </Section>
          )}

          {cash.count > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Money</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <ArrowDownLeft size={15} className="text-good" />
                  In <span className="tabular font-medium text-ink">{money(cash.income)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <ArrowUpRight size={15} className="text-bad" />
                  Out <span className="tabular font-medium text-ink">{money(cash.expense)}</span>
                </span>
                <span className="text-muted">{plural(cash.count, 'transaction')}</span>
              </div>
            </div>
          )}

          <Link
            to={calendarLink}
            className="inline-flex h-10 items-center gap-1.5 self-start rounded-lg text-[13px] font-medium text-accent-text hover:underline"
          >
            <CalendarDays size={15} /> Open this day in Calendar
          </Link>
        </div>
      )}
    </Card>
  )
}

function Section({
  title, more, to, children,
}: { title: string; more: number; to: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="flex flex-col">{children}</div>
      {more > 0 && (
        <Link to={to} className="mt-0.5 inline-block text-xs text-muted hover:text-ink">
          +{more} more
        </Link>
      )}
    </div>
  )
}

function Row({
  lead, children, onClick,
}: { lead: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-2 flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-left text-sm text-ink transition-colors hover:bg-surface-2"
    >
      {lead}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}
