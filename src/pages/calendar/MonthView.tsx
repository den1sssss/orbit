import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { CheckCircle2, CreditCard, NotebookPen } from 'lucide-react'
import { Card, cn } from '@/components/ui'
import type { DayAgenda, EventOccurrence } from '@/lib/agenda'
import { addDaysISO, fmt, monthGrid, monthOf } from '@/lib/dates'
import { MOOD_EMOJI } from '@/lib/defaults'
import { colorHex, tint } from '@/lib/icons'
import type { ISODate, Note } from '@/lib/types'
import { DayPanel } from './DayBlocks'
import { compactTime, EMPTY_OCCS, eventColor, isTimed, type Layers, plural } from './lib'
import { openEvent } from './Rows'

const MAX_CHIPS = 3
const KEY_DELTA: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

export function MonthView({
  date, today, weekStartsOn, agenda, notesByDate, layers, onSelect, onOpenDay,
}: {
  date: ISODate
  today: ISODate
  weekStartsOn: 0 | 1
  agenda: Map<ISODate, DayAgenda>
  notesByDate: Map<ISODate, Note[]>
  layers: Layers
  onSelect: (date: ISODate) => void
  onOpenDay: (date: ISODate) => void
}) {
  const month = monthOf(date)
  const grid = useMemo(() => monthGrid(month, weekStartsOn), [month, weekStartsOn])
  const gridRef = useRef<HTMLDivElement>(null)
  const focusAfter = useRef<ISODate | null>(null)

  // Arrow-key navigation keeps focus on the newly selected day (even across months).
  useEffect(() => {
    if (!focusAfter.current) return
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusAfter.current}"]`)?.focus()
    focusAfter.current = null
  }, [date])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, iso: ISODate) => {
    const delta = KEY_DELTA[e.key]
    if (delta === undefined) return
    e.preventDefault()
    const next = addDaysISO(iso, delta)
    focusAfter.current = next
    onSelect(next)
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <Card padded={false} className="@container min-w-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2/50" aria-hidden>
          {grid.slice(0, 7).map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span className="@lg:hidden">{fmt(d, 'EEEEE')}</span>
              <span className="hidden @lg:inline">{fmt(d, 'EEE')}</span>
            </div>
          ))}
        </div>
        <div ref={gridRef} className="grid grid-cols-7">
          {grid.map((iso, i) => (
            <MonthCell
              key={iso}
              iso={iso}
              index={i}
              inMonth={monthOf(iso) === month}
              isToday={iso === today}
              selected={iso === date}
              day={agenda.get(iso)}
              notes={notesByDate.get(iso)}
              onSelect={onSelect}
              onKeyDown={onKeyDown}
            />
          ))}
        </div>
      </Card>
      <DayPanel
        date={date}
        day={agenda.get(date)}
        notes={notesByDate.get(date)}
        journalPlaceholder={layers.journal}
        onOpenDay={onOpenDay}
        className="xl:sticky xl:top-8"
      />
    </div>
  )
}

function MonthCell({
  iso, index, inMonth, isToday, selected, day, notes, onSelect, onKeyDown,
}: {
  iso: ISODate
  index: number
  inMonth: boolean
  isToday: boolean
  selected: boolean
  day: DayAgenda | undefined
  notes: Note[] | undefined
  onSelect: (date: ISODate) => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>, iso: ISODate) => void
}) {
  const events = day?.events ?? EMPTY_OCCS
  const openTasks = day ? day.tasks.filter((t) => t.status !== 'done').length : 0
  const payments = day?.payments ?? []
  const overdue = payments.some((p) => p.overdue)
  const mood = day?.journal?.mood
  const noteCount = notes?.length ?? 0

  const label = [
    fmt(iso, 'EEEE, MMMM d'),
    isToday && 'today',
    events.length && plural(events.length, 'event'),
    openTasks && `${plural(openTasks, 'task')} due`,
    payments.length && plural(payments.length, 'payment'),
    day?.journal && 'journal entry',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div
      className={cn(
        'relative flex min-h-[64px] min-w-0 flex-col gap-1 p-1 @lg:min-h-[108px] @lg:p-1.5',
        index % 7 !== 0 && 'border-l border-line',
        index >= 7 && 'border-t border-line',
        !inMonth && 'bg-surface-2/40',
        selected && 'bg-accent-soft/60',
      )}
    >
      {/* Whole-cell hit target (content above it is click-through, except event chips). */}
      <button
        type="button"
        data-date={iso}
        tabIndex={selected ? 0 : -1}
        aria-label={label}
        aria-pressed={selected}
        aria-current={isToday ? 'date' : undefined}
        onClick={() => onSelect(iso)}
        onKeyDown={(e) => onKeyDown(e, iso)}
        className={cn(
          'absolute inset-0 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
          !selected && 'hover:bg-surface-2/70',
        )}
      />

      <div className="pointer-events-none relative flex items-start justify-center gap-0.5 @lg:justify-between">
        <span
          className={cn(
            'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12.5px] font-medium tabular',
            isToday
              ? 'bg-accent font-semibold text-accent-ink'
              : selected
                ? 'font-semibold text-accent-text'
                : inMonth
                  ? 'text-ink'
                  : 'text-muted',
          )}
        >
          {Number(iso.slice(8, 10))}
        </span>
        {mood && (
          <span className="hidden pt-0.5 text-[13px] leading-none @lg:inline" aria-hidden>
            {MOOD_EMOJI[mood]}
          </span>
        )}
      </div>

      {/* ≥ roomy cells: event chips */}
      {events.length > 0 && (
        <div className={cn('pointer-events-none relative hidden min-w-0 flex-col gap-0.5 @lg:flex', !inMonth && 'opacity-60')}>
          {events.slice(0, MAX_CHIPS).map((occ) => (
            <EventChip key={occ.key} occ={occ} onSelectDay={() => onSelect(iso)} />
          ))}
          {events.length > MAX_CHIPS && (
            <span className="px-1 text-[11px] font-medium leading-4 text-muted">+{events.length - MAX_CHIPS} more</span>
          )}
        </div>
      )}

      {/* Phones / narrow grid: colored dots */}
      {events.length > 0 && (
        <div className={cn('pointer-events-none relative flex flex-wrap justify-center gap-[3px] @lg:hidden', !inMonth && 'opacity-60')} aria-hidden>
          {events.slice(0, 4).map((occ) => (
            <span key={occ.key} className="h-[5px] w-[5px] rounded-full" style={{ background: colorHex(eventColor(occ.event)) }} />
          ))}
        </div>
      )}

      {(openTasks > 0 || payments.length > 0 || noteCount > 0 || !!mood) && (
        <div
          className="pointer-events-none relative mt-auto flex min-w-0 flex-wrap items-center justify-center gap-x-1 text-[10.5px] font-medium leading-4 text-muted @lg:justify-start @lg:gap-x-2 @lg:px-0.5"
          aria-hidden
        >
          {mood && <span className="text-[10px] leading-none @lg:hidden">{MOOD_EMOJI[mood]}</span>}
          {openTasks > 0 && (
            <span className="inline-flex items-center gap-0.5 tabular">
              <CheckCircle2 size={11} />
              {openTasks}
            </span>
          )}
          {payments.length > 0 && (
            <span className={cn('inline-flex items-center gap-0.5 tabular', overdue ? 'text-bad' : 'text-warn')}>
              <CreditCard size={11} />
              <span className="hidden @lg:inline">{payments.length}</span>
            </span>
          )}
          {noteCount > 0 && (
            <span className="hidden items-center gap-0.5 @lg:inline-flex">
              <NotebookPen size={11} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function EventChip({ occ, onSelectDay }: { occ: EventOccurrence; onSelectDay: () => void }) {
  const ev = occ.event
  const color = eventColor(ev)
  const timed = isTimed(ev)
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={(e) => {
        e.stopPropagation()
        onSelectDay()
        openEvent(occ)
      }}
      title={`${timed ? `${compactTime(ev.startTime)} ` : ''}${ev.title}`}
      className="pointer-events-auto relative flex h-5 min-w-0 items-center gap-1 overflow-hidden rounded-[5px] px-1 text-left text-[11.5px] leading-none text-ink transition hover:brightness-95 dark:hover:brightness-125"
      style={{ background: tint(color, timed ? 0.12 : 0.24) }}
    >
      {timed && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorHex(color) }} />}
      {/* Narrow cells: the title matters more than the time (time is in the tooltip and day panel). */}
      {timed && <span className="hidden shrink-0 tabular text-ink-2 2xl:inline">{compactTime(ev.startTime)}</span>}
      <span className="truncate font-medium">{ev.title}</span>
    </button>
  )
}
