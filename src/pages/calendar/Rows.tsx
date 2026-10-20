// Agenda rows shared by every calendar view (day panel, agenda list, phone week list).
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BookHeart, MapPin, NotebookPen, PenLine, Repeat } from 'lucide-react'
import { Badge, Button, CategoryIcon, Checkbox, cn, ColorDot } from '@/components/ui'
import type { DayAgenda, EventOccurrence } from '@/lib/agenda'
import { fmtTime, minutesToTime, todayISO } from '@/lib/dates'
import { EVENT_TYPE_LABELS, MOOD_EMOJI, MOOD_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '@/lib/defaults'
import type { DueItem } from '@/lib/finance'
import { useMoney } from '@/lib/format'
import { colorHex } from '@/lib/icons'
import { useStore } from '@/lib/store'
import { openEditor, toast } from '@/lib/ui'
import type { ISODate, JournalEntry, Note, Priority, Task } from '@/lib/types'
import { eventColor, eventSpan, firstLine, hasReminder, isRecurring, isTimed } from './lib'

const rowBase = 'flex w-full min-h-12 gap-3 rounded-xl px-2 py-2 text-left transition-colors'
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent'
const titleBase = 'block truncate text-[14px] font-medium leading-snug'
const titleCls = `${titleBase} text-ink`
const metaCls = 'mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-snug text-muted'

/** 24px leading slot so every row's content lines up. */
function Marker({ children, stretch }: { children: ReactNode; stretch?: boolean }) {
  return (
    <span
      className={cn('flex w-6 shrink-0 justify-center', stretch ? 'self-stretch py-0.5' : 'min-h-[22px] items-center')}
      aria-hidden={stretch || undefined}
    >
      {children}
    </span>
  )
}

export function openEvent(occ: EventOccurrence) {
  openEditor({ kind: 'event', id: occ.event.id, occurrenceDate: occ.date })
}

/** "9:30 AM – 11:00 AM" or "All day". */
export function eventTimeText(occ: EventOccurrence): string {
  const ev = occ.event
  if (!isTimed(ev)) return 'All day'
  const [start, end] = eventSpan(ev)
  return `${fmtTime(minutesToTime(start))} – ${fmtTime(minutesToTime(end % (24 * 60)))}`
}

export function EventRow({ occ }: { occ: EventOccurrence }) {
  const ev = occ.event
  const project = useStore((s) => (ev.projectId ? s.projects.find((p) => p.id === ev.projectId) : undefined))
  const time = eventTimeText(occ)
  return (
    <button
      type="button"
      onClick={() => openEvent(occ)}
      className={cn(rowBase, focusRing, 'items-start hover:bg-surface-2')}
      aria-label={`${ev.title}, ${time}${ev.location ? `, ${ev.location}` : ''}`}
    >
      <Marker stretch>
        <span className="w-1 rounded-full" style={{ background: colorHex(eventColor(ev)) }} />
      </Marker>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={titleCls}>{ev.title}</span>
          {isRecurring(ev) && <Repeat size={13} className="shrink-0 text-muted" aria-hidden />}
          {hasReminder(ev) && <Bell size={13} className="shrink-0 text-muted" aria-hidden />}
        </span>
        <span className={metaCls}>
          <span className="tabular text-ink-2">{time}</span>
          <span>{EVENT_TYPE_LABELS[ev.type]}</span>
          {ev.location && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1">
              <MapPin size={12} className="shrink-0" aria-hidden />
              <span className="truncate">{ev.location}</span>
            </span>
          )}
          {project && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <ColorDot color={project.color} size={6} />
              <span className="truncate">{project.name}</span>
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

const PRIORITY_RING: Partial<Record<Priority, string>> = {
  urgent: colorHex('red'),
  high: colorHex('orange'),
}

export function TaskRow({ task }: { task: Task }) {
  const toggleTask = useStore((s) => s.toggleTask)
  const project = useStore((s) => (task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined))
  const category = useStore((s) => s.taskCategories.find((c) => c.id === task.categoryId))
  const done = task.status === 'done'
  const subDone = task.subtasks.filter((s) => s.done).length
  const tag = project ?? category
  const toggle = () => toggleTask(task.id)
  return (
    <div className={cn(rowBase, 'items-start hover:bg-surface-2')}>
      <Marker>
        {/* 40px hit area around the 20px checkbox */}
        <span
          className="-m-2.5 flex h-10 w-10 cursor-pointer items-center justify-center"
          onClick={toggle}
        >
          <Checkbox
            round
            checked={done}
            color={done ? undefined : PRIORITY_RING[task.priority]}
            onChange={toggle}
            label={done ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
          />
        </span>
      </Marker>
      <button
        type="button"
        onClick={() => openEditor({ kind: 'task', id: task.id })}
        className={cn('min-w-0 flex-1 rounded-lg text-left', focusRing)}
      >
        <span className={cn(titleBase, done ? 'text-muted line-through decoration-line-strong' : 'text-ink')}>{task.title}</span>
        <span className={metaCls}>
          {task.dueTime && <span className="tabular text-ink-2">{fmtTime(task.dueTime)}</span>}
          {!done && (task.priority === 'urgent' || task.priority === 'high') && (
            <span className={task.priority === 'urgent' ? 'text-bad' : 'text-warn'}>{PRIORITY_LABELS[task.priority]}</span>
          )}
          {!done && (task.status === 'in_progress' || task.status === 'waiting') && <span>{STATUS_LABELS[task.status]}</span>}
          {tag && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <ColorDot color={tag.color} size={6} />
              <span className="truncate">{tag.name}</span>
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="tabular">
              {subDone}/{task.subtasks.length}
            </span>
          )}
        </span>
      </button>
    </div>
  )
}

/** Mark a planned payment paid with an Undo toast. */
function markPaid(due: DueItem) {
  const st = useStore.getState()
  const prev = st.plannedPayments.find((p) => p.id === due.payment.id)
  if (!prev) return
  const snapshot = { nextDue: prev.nextDue, active: prev.active, lastPaid: prev.lastPaid }
  const today = todayISO()
  const tx = st.markPaymentPaid(prev.id, { date: due.date < today ? due.date : today })
  if (!tx) return
  toast(`${prev.name} marked paid`, {
    action: {
      label: 'Undo',
      onClick: () => {
        const s = useStore.getState()
        s.remove('transactions', tx.id)
        s.patch('plannedPayments', prev.id, snapshot)
      },
    },
  })
}

export function PaymentRow({ due }: { due: DueItem }) {
  const money = useMoney()
  const category = useStore((s) => s.financeCategories.find((c) => c.id === due.payment.categoryId))
  const p = due.payment
  // Only the next unpaid occurrence can be marked paid; later ones are projections.
  const isNext = due.date === p.nextDue
  return (
    <div className={cn(rowBase, 'items-center')}>
      <Marker>
        <CategoryIcon icon={category?.icon} color={category?.color} size={24} />
      </Marker>
      <div className="min-w-0 flex-1">
        <p className={titleCls}>{p.name}</p>
        <p className={metaCls}>
          <span className="tabular text-ink-2">{money(p.amount)}</span>
          {due.overdue && <Badge tone="bad">Overdue</Badge>}
          <span>{p.isSubscription ? 'Subscription' : 'Payment due'}</span>
        </p>
      </div>
      {isNext ? (
        <Button variant="soft" className="shrink-0" onClick={() => markPaid(due)} aria-label={`Mark ${p.name} paid`}>
          Mark paid
        </Button>
      ) : (
        <span className="shrink-0 text-[12px] text-muted">Upcoming</span>
      )}
    </div>
  )
}

export function NoteRow({ note }: { note: Note }) {
  const snippet = firstLine(note.body) || (note.checklist.length ? `${note.checklist.length} checklist items` : 'Note')
  return (
    <button
      type="button"
      onClick={() => openEditor({ kind: 'note', id: note.id })}
      className={cn(rowBase, focusRing, 'items-start hover:bg-surface-2')}
    >
      <Marker>
        <NotebookPen size={16} className="text-muted" aria-hidden />
      </Marker>
      <span className="min-w-0 flex-1">
        <span className={titleCls}>{note.title || 'Untitled note'}</span>
        <span className="mt-0.5 block truncate text-[12.5px] leading-snug text-muted">{snippet}</span>
      </span>
    </button>
  )
}

export function JournalRow({ date, entry }: { date: ISODate; entry?: JournalEntry }) {
  if (!entry) {
    return (
      <Link to={`/journal/${date}`} className={cn(rowBase, focusRing, 'items-center hover:bg-surface-2')}>
        <Marker>
          <PenLine size={16} className="text-muted" aria-hidden />
        </Marker>
        <span className="text-[14px] font-medium text-accent-text">Write in journal</span>
      </Link>
    )
  }
  const line = entry.title?.trim() || firstLine(entry.body) || 'Journal entry'
  return (
    <Link to={`/journal/${date}`} className={cn(rowBase, focusRing, 'items-start hover:bg-surface-2')}>
      <Marker>
        {entry.mood ? (
          <span className="text-[17px] leading-none" role="img" aria-label={`Mood: ${MOOD_LABELS[entry.mood]}`}>
            {MOOD_EMOJI[entry.mood]}
          </span>
        ) : (
          <BookHeart size={16} className="text-muted" aria-hidden />
        )}
      </Marker>
      <span className="min-w-0 flex-1">
        <span className={titleCls}>{line}</span>
        <span className={metaCls}>Journal</span>
      </span>
    </Link>
  )
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-0.5 mt-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted first:mt-0">
      {children}
    </p>
  )
}

/** Everything on one day, as rows. */
export function DayItems({
  day, notes, includeTimed = true, grouped = false, journalPlaceholder = false,
}: {
  day: DayAgenda
  notes?: Note[]
  /** false → only all-day events (the day view's grid already shows timed ones). */
  includeTimed?: boolean
  /** Section labels (Schedule / Tasks / Payments / Notes / Journal). */
  grouped?: boolean
  /** Show "Write in journal" when there is no entry. */
  journalPlaceholder?: boolean
}) {
  const events = includeTimed ? day.events : day.events.filter((o) => !isTimed(o.event))
  const showJournal = !!day.journal || journalPlaceholder
  return (
    <div className="flex flex-col">
      {events.length > 0 && (
        <>
          {grouped && <GroupLabel>{includeTimed ? 'Schedule' : 'All day'}</GroupLabel>}
          {events.map((occ) => <EventRow key={occ.key} occ={occ} />)}
        </>
      )}
      {day.tasks.length > 0 && (
        <>
          {grouped && <GroupLabel>Tasks due</GroupLabel>}
          {day.tasks.map((t) => <TaskRow key={t.id} task={t} />)}
        </>
      )}
      {day.payments.length > 0 && (
        <>
          {grouped && <GroupLabel>Payments due</GroupLabel>}
          {day.payments.map((d) => <PaymentRow key={`${d.payment.id}:${d.date}`} due={d} />)}
        </>
      )}
      {!!notes?.length && (
        <>
          {grouped && <GroupLabel>Notes</GroupLabel>}
          {notes.map((n) => <NoteRow key={n.id} note={n} />)}
        </>
      )}
      {showJournal && (
        <>
          {grouped && <GroupLabel>Journal</GroupLabel>}
          <JournalRow date={day.date} entry={day.journal} />
        </>
      )}
    </div>
  )
}
