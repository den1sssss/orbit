// Hourly time grid shared by the week (7 columns) and day (1 column) views.
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { Bell, CheckCircle2, CreditCard, MapPin, Repeat } from 'lucide-react'
import { Card, cn } from '@/components/ui'
import type { DayAgenda, EventOccurrence } from '@/lib/agenda'
import { fmt, minutesToTime, toISO } from '@/lib/dates'
import { MOOD_EMOJI } from '@/lib/defaults'
import { colorHex, tint } from '@/lib/icons'
import { openEditor } from '@/lib/ui'
import type { ISODate } from '@/lib/types'
import { useNow } from './hooks'
import {
  compactTime, EMPTY_OCCS, eventColor, eventSpan, GRID_START_HOUR, hasReminder, hourLabel, isRecurring,
  isTimed, layoutDay, pad2, plural, SCROLL_TO_HOUR, type PlacedEvent,
} from './lib'
import { eventTimeText, openEvent } from './Rows'

const GUTTER = 'w-12 shrink-0 sm:w-14'

export function TimeGrid({
  days, agenda, hourHeight = 48, header = false, allDayRow = false, onOpenDay, className,
}: {
  days: ISODate[]
  agenda: Map<ISODate, DayAgenda>
  hourHeight?: number
  /** Weekday / date header per column (week view). */
  header?: boolean
  /** Row of all-day events and payments above the grid (week view). */
  allDayRow?: boolean
  onOpenDay?: (date: ISODate) => void
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = useNow()
  const todayIso = toISO(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const cols: CSSProperties = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }

  // Extend the grid upward when something starts before 6:00.
  const startHour = useMemo(() => {
    let h = GRID_START_HOUR
    for (const d of days) {
      for (const occ of agenda.get(d)?.events ?? EMPTY_OCCS) {
        if (isTimed(occ.event)) h = Math.min(h, Math.floor(eventSpan(occ.event)[0] / 60))
      }
    }
    return h
  }, [days, agenda])
  const hours = useMemo(() => Array.from({ length: 24 - startHour }, (_, i) => startHour + i), [startHour])
  const totalHeight = hours.length * hourHeight
  const showsToday = days.includes(todayIso)

  // Scroll to ~8:00 when the period changes (or to "now" if it is later in the day).
  const periodKey = `${days[0]}:${days.length}`
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let target = SCROLL_TO_HOUR
    if (showsToday) {
      const visibleHours = el.clientHeight / hourHeight
      const nowH = nowMin / 60
      if (nowH > target + visibleHours - 2) target = nowH - 2
    }
    el.scrollTop = Math.max(0, (target - startHour) * hourHeight)
    // Only on period change — not on every tick of the clock.
  }, [periodKey])

  const allDay = useMemo(
    () =>
      days.map((d) => {
        const day = agenda.get(d)
        return {
          events: (day?.events ?? EMPTY_OCCS).filter((o) => !isTimed(o.event)),
          payments: day?.payments ?? [],
        }
      }),
    [days, agenda],
  )
  const hasAllDay = allDayRow && allDay.some((a) => a.events.length || a.payments.length)

  return (
    <Card padded={false} className={cn('overflow-hidden', className)}>
      <div
        ref={scrollRef}
        className="relative isolate h-[62dvh] min-h-[360px] overflow-y-auto overscroll-contain md:h-[min(72dvh,780px)]"
      >
        {(header || hasAllDay) && (
          <div className="sticky top-0 z-30 border-b border-line bg-surface">
            {header && (
              <div className="flex">
                <div className={GUTTER} />
                <div className="grid flex-1" style={cols}>
                  {days.map((d, i) => (
                    <DayHeader
                      key={d}
                      date={d}
                      day={agenda.get(d)}
                      isToday={d === todayIso}
                      first={i === 0}
                      onOpenDay={onOpenDay}
                    />
                  ))}
                </div>
              </div>
            )}
            {hasAllDay && (
              <div className={cn('flex', header && 'border-t border-line')}>
                <div className={cn(GUTTER, 'py-2 pr-2 text-right text-[10.5px] font-medium leading-tight text-muted')}>
                  All day
                </div>
                <div className="grid flex-1" style={cols}>
                  {days.map((d, i) => (
                    <AllDayCell
                      key={d}
                      date={d}
                      first={i === 0}
                      events={allDay[i].events}
                      payments={allDay[i].payments}
                      onOpenDay={onOpenDay}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative flex" style={{ height: totalHeight }}>
          {/* Hour labels */}
          <div className={cn(GUTTER, 'relative')} aria-hidden>
            {hours.map((h, i) => (
              <span
                key={h}
                className={cn(
                  'absolute right-2 whitespace-nowrap text-[10.5px] leading-none text-muted tabular',
                  i > 0 && '-translate-y-1/2',
                )}
                style={{ top: i === 0 ? 4 : i * hourHeight }}
              >
                {hourLabel(h)}
              </span>
            ))}
          </div>

          <div className="relative grid flex-1" style={cols}>
            {/* Hour lines */}
            <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden>
              {hours.map((h, i) =>
                i === 0 ? null : (
                  <div key={h} className="absolute inset-x-0 border-t border-line" style={{ top: i * hourHeight }} />
                ),
              )}
            </div>
            {days.map((d, i) => (
              <DayColumn
                key={d}
                date={d}
                occs={agenda.get(d)?.events ?? EMPTY_OCCS}
                hours={hours}
                startHour={startHour}
                hourHeight={hourHeight}
                first={i === 0}
                nowMin={d === todayIso ? nowMin : null}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function DayHeader({
  date, day, isToday, first, onOpenDay,
}: {
  date: ISODate
  day: DayAgenda | undefined
  isToday: boolean
  first: boolean
  onOpenDay?: (date: ISODate) => void
}) {
  const openTasks = day?.tasks.filter((t) => t.status !== 'done').length ?? 0
  const mood = day?.journal?.mood
  return (
    <button
      type="button"
      onClick={() => onOpenDay?.(date)}
      aria-label={`Open ${fmt(date, 'EEEE, MMMM d')} in day view${openTasks ? `, ${plural(openTasks, 'task')} due` : ''}`}
      className={cn(
        'flex min-w-0 flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 transition-colors hover:bg-surface-2',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        !first && 'border-l border-line',
      )}
    >
      <span className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider', isToday ? 'text-accent-text' : 'text-muted')}>
        {fmt(date, 'EEE')}
        {mood && <span className="text-[12px] normal-case leading-none" aria-hidden>{MOOD_EMOJI[mood]}</span>}
      </span>
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full text-[15px] font-semibold tabular',
          isToday ? 'bg-accent text-accent-ink' : 'text-ink',
        )}
      >
        {fmt(date, 'd')}
      </span>
      <span className="flex h-4 items-center gap-1 truncate text-[11px] text-muted">
        {openTasks > 0 && (
          <>
            <CheckCircle2 size={11} className="shrink-0" aria-hidden />
            <span className="truncate">{plural(openTasks, 'task')}</span>
          </>
        )}
      </span>
    </button>
  )
}

const MAX_ALL_DAY = 3

function AllDayCell({
  date, first, events, payments, onOpenDay,
}: {
  date: ISODate
  first: boolean
  events: EventOccurrence[]
  payments: DayAgenda['payments']
  onOpenDay?: (date: ISODate) => void
}) {
  const total = events.length + payments.length
  const shownEvents = events.slice(0, MAX_ALL_DAY)
  const shownPayments = payments.slice(0, Math.max(0, MAX_ALL_DAY - shownEvents.length))
  const more = total - shownEvents.length - shownPayments.length
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 p-1', !first && 'border-l border-line')}>
      {shownEvents.map((occ) => {
        const color = eventColor(occ.event)
        return (
          <button
            key={occ.key}
            type="button"
            onClick={() => openEvent(occ)}
            aria-label={`${occ.event.title}, all day`}
            className="flex h-6 min-w-0 items-center gap-1 rounded-md px-1.5 text-left text-[11.5px] font-medium text-ink transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent dark:hover:brightness-125"
            style={{ background: tint(color, 0.22) }}
          >
            <span className="truncate">{occ.event.title}</span>
            {isRecurring(occ.event) && <Repeat size={10} className="shrink-0 text-ink-2" aria-hidden />}
          </button>
        )
      })}
      {shownPayments.map((due) => (
        <button
          key={`${due.payment.id}:${due.date}`}
          type="button"
          onClick={() => onOpenDay?.(date)}
          aria-label={`${due.payment.name} payment due — open day`}
          className={cn(
            'flex h-6 min-w-0 items-center gap-1 rounded-md px-1.5 text-left text-[11.5px] font-medium transition-colors',
            'focus-visible:outline-2 focus-visible:outline-accent',
            due.overdue ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn',
          )}
        >
          <CreditCard size={11} className="shrink-0" aria-hidden />
          <span className="truncate">{due.payment.name}</span>
        </button>
      ))}
      {more > 0 && (
        <button
          type="button"
          onClick={() => onOpenDay?.(date)}
          className="h-5 rounded px-1.5 text-left text-[11px] font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          +{more} more
        </button>
      )}
    </div>
  )
}

function DayColumn({
  date, occs, hours, startHour, hourHeight, first, nowMin,
}: {
  date: ISODate
  occs: EventOccurrence[]
  hours: number[]
  startHour: number
  hourHeight: number
  first: boolean
  /** Minutes since midnight when this column is today, else null. */
  nowMin: number | null
}) {
  const placed = useMemo(() => layoutDay(occs.filter((o) => isTimed(o.event))), [occs])
  const toY = (min: number) => ((min - startHour * 60) / 60) * hourHeight
  return (
    <div className={cn('relative min-w-0', !first && 'border-l border-line', nowMin !== null && 'bg-accent-soft/25')}>
      {/* Empty slots: click to create an event at that hour (keyboard users use "New event"). */}
      {hours.map((h, i) => (
        <button
          key={h}
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => openEditor({ kind: 'event', initial: { date, startTime: `${pad2(h)}:00` } })}
          className="absolute inset-x-0 transition-colors hover:bg-surface-2/70"
          style={{ top: i * hourHeight, height: hourHeight }}
        />
      ))}
      {placed.map((p) => (
        <TimedEvent key={p.occ.key} p={p} top={toY(p.start)} height={((p.vEnd - p.start) / 60) * hourHeight} />
      ))}
      {nowMin !== null && nowMin >= startHour * 60 && (
        <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: toY(nowMin) }} aria-hidden>
          <div className="relative h-0.5 bg-bad">
            <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-bad" />
          </div>
        </div>
      )}
    </div>
  )
}

function TimedEvent({ p, top, height }: { p: PlacedEvent; top: number; height: number }) {
  const ev = p.occ.event
  const hex = colorHex(eventColor(ev))
  const h = Math.max(18, height - 2)
  const roomy = p.cols === 1
  const short = h < 34
  return (
    <button
      type="button"
      onClick={() => openEvent(p.occ)}
      aria-label={`${ev.title}, ${eventTimeText(p.occ)}${ev.location ? `, ${ev.location}` : ''}`}
      className={cn(
        'absolute z-10 flex flex-col overflow-hidden rounded-md py-0.5 pl-1.5 pr-1 text-left text-ink shadow-card transition',
        'hover:z-20 hover:brightness-[0.97] focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-accent dark:hover:brightness-110',
        short ? 'justify-center' : 'justify-start',
      )}
      style={{
        top: top + 1,
        height: h,
        left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
        width: `calc(${100 / p.cols}% - 4px)`,
        background: `color-mix(in srgb, ${hex} 16%, var(--surface))`,
        borderLeft: `3px solid ${hex}`,
      }}
    >
      <span className="flex min-w-0 items-center gap-1">
        {short && <span className="shrink-0 text-[11px] tabular text-ink-2">{compactTime(ev.startTime)}</span>}
        <span className="truncate text-[12px] font-semibold leading-tight">{ev.title}</span>
        {roomy && isRecurring(ev) && <Repeat size={11} className="shrink-0 text-ink-2" aria-hidden />}
        {roomy && hasReminder(ev) && <Bell size={11} className="shrink-0 text-ink-2" aria-hidden />}
      </span>
      {!short && (
        <span className="truncate text-[11px] leading-tight text-ink-2 tabular">
          {compactTime(minutesToTime(p.start))} – {compactTime(minutesToTime(p.end % (24 * 60)))}
        </span>
      )}
      {h >= 54 && ev.location && (
        <span className="flex min-w-0 items-center gap-0.5 text-[11px] leading-tight text-muted">
          <MapPin size={10} className="shrink-0" aria-hidden />
          <span className="truncate">{ev.location}</span>
        </span>
      )}
    </button>
  )
}
