// Day-level building blocks: the selected-day panel and the agenda-style day section.
import { ArrowUpRight, CheckSquare, Plus } from 'lucide-react'
import { Button, Card, cn, IconButton } from '@/components/ui'
import type { DayAgenda } from '@/lib/agenda'
import { fmt } from '@/lib/dates'
import { openEditor } from '@/lib/ui'
import type { ISODate, Note } from '@/lib/types'
import { dayHeadline, isDayEmpty, isTimed } from './lib'
import { DayItems } from './Rows'

export function addEventOn(date: ISODate) {
  openEditor({ kind: 'event', initial: { date } })
}

export function addTaskOn(date: ISODate) {
  openEditor({ kind: 'task', initial: { dueDate: date } })
}

/** Full agenda for one day with quick-add buttons (month side panel, day view panel). */
export function DayPanel({
  date, day, notes, includeTimed = true, journalPlaceholder, onOpenDay, className,
}: {
  date: ISODate
  day: DayAgenda | undefined
  notes?: Note[]
  includeTimed?: boolean
  journalPlaceholder: boolean
  /** Shows an "Open day view" button. */
  onOpenDay?: (date: ISODate) => void
  className?: string
}) {
  const visible: DayAgenda | undefined =
    day && !includeTimed ? { ...day, events: day.events.filter((o) => !isTimed(o.event)) } : day
  const nothing = !visible || isDayEmpty(visible, notes)
  return (
    <Card className={cn('min-w-0', className)}>
      <section aria-label={`Agenda for ${fmt(date, 'EEEE, MMMM d')}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">{dayHeadline(date)}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{fmt(date, 'EEEE, MMMM d, yyyy')}</p>
          </div>
          {onOpenDay && (
            <IconButton icon={ArrowUpRight} label="Open day view" onClick={() => onOpenDay(date)} />
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button icon={Plus} onClick={() => addEventOn(date)}>Add event</Button>
          <Button icon={CheckSquare} onClick={() => addTaskOn(date)}>Add task</Button>
        </div>
        <div className="-mx-2 mt-3">
          {nothing && <p className="px-2 py-5 text-center text-[13px] text-muted">Nothing planned for this day.</p>}
          {visible && (!nothing || journalPlaceholder) && (
            <DayItems
              day={visible}
              notes={notes}
              includeTimed={includeTimed}
              grouped
              journalPlaceholder={journalPlaceholder}
            />
          )}
        </div>
      </section>
    </Card>
  )
}

/** "Today · October 20" style line next to a day number. */
function dayCaption(date: ISODate): string {
  const head = dayHeadline(date)
  const full = fmt(date, 'MMMM d')
  return head === fmt(date, 'EEEE') ? full : `${head} · ${full}`
}

/** One day in a vertical list: date badge on the left, rows on the right. */
export function DayGroup({
  date, day, notes, today, showEmpty = false, onOpenDay,
}: {
  date: ISODate
  day: DayAgenda | undefined
  notes?: Note[]
  today: ISODate
  /** Render the day even when it has nothing (phone week list). */
  showEmpty?: boolean
  onOpenDay: (date: ISODate) => void
}) {
  const isToday = date === today
  const empty = isDayEmpty(day, notes)
  if (empty && !showEmpty) return null
  return (
    <section className="flex gap-2 px-2 py-2.5 sm:gap-3 sm:px-3" aria-label={fmt(date, 'EEEE, MMMM d')}>
      <button
        type="button"
        onClick={() => onOpenDay(date)}
        aria-label={`Open ${fmt(date, 'EEEE, MMMM d')} in day view`}
        className="flex w-12 shrink-0 flex-col items-center self-start rounded-xl py-1.5 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isToday ? 'text-accent-text' : 'text-muted')}>
          {fmt(date, 'EEE')}
        </span>
        <span
          className={cn(
            'mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-semibold tabular',
            isToday ? 'bg-accent text-accent-ink' : 'text-ink',
          )}
        >
          {fmt(date, 'd')}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="px-2 pb-0.5 pt-1.5 text-[12.5px] font-medium text-muted">{dayCaption(date)}</p>
        {empty || !day ? (
          <div className="flex items-center justify-between gap-2 pl-2">
            <span className="text-[13px] text-muted">Nothing planned</span>
            <IconButton icon={Plus} label={`Add event on ${fmt(date, 'MMMM d')}`} onClick={() => addEventOn(date)} />
          </div>
        ) : (
          <DayItems day={day} notes={notes} />
        )}
      </div>
    </section>
  )
}
