// Pure helpers for the Calendar screen: view math, labels, and time-grid layout.
import { addMonths } from 'date-fns'
import type { DayAgenda, EventOccurrence } from '@/lib/agenda'
import {
  addDaysISO, fmt, fromISO, monthGrid, monthOf, timeToMinutes, todayISO, toISO, weekRange,
} from '@/lib/dates'
import { EVENT_TYPE_COLORS } from '@/lib/defaults'
import type { CalendarEvent, ColorKey, ISODate, MonthKey, Note } from '@/lib/types'

export type CalView = 'month' | 'week' | 'day' | 'agenda'
export const VIEWS: CalView[] = ['month', 'week', 'day', 'agenda']

export function parseView(v: string | null): CalView {
  return VIEWS.includes(v as CalView) ? (v as CalView) : 'month'
}

export type LayerKey = 'events' | 'tasks' | 'payments' | 'journal'
export type Layers = Record<LayerKey, boolean>
export const DEFAULT_LAYERS: Layers = { events: true, tasks: true, payments: true, journal: true }

/** Length of the agenda window, in days. */
export const AGENDA_DAYS = 30
/** First hour the time grid shows (earlier events extend it). */
export const GRID_START_HOUR = 6
/** Hour the time grid scrolls to on open. */
export const SCROLL_TO_HOUR = 8

export const EMPTY_OCCS: EventOccurrence[] = []
export const EMPTY_NOTES: Note[] = []

// ───────────────────────── Events ─────────────────────────

export function eventColor(ev: CalendarEvent): ColorKey {
  return ev.color ?? EVENT_TYPE_COLORS[ev.type]
}

export function isRecurring(ev: CalendarEvent): boolean {
  return ev.recurrence.freq !== 'none'
}

export function hasReminder(ev: CalendarEvent): boolean {
  return typeof ev.reminder === 'number'
}

/** Has a start time and isn't all-day → goes in the hourly grid. */
export function isTimed(ev: CalendarEvent): boolean {
  return !ev.allDay && !!ev.startTime
}

/** [start, end] in minutes since midnight. Missing / invalid end → 1 hour (or 30 min). */
export function eventSpan(ev: CalendarEvent): [number, number] {
  const start = timeToMinutes(ev.startTime)
  let end = ev.endTime ? timeToMinutes(ev.endTime) : start + 60
  if (end <= start) end = start + 30
  return [start, Math.min(end, 24 * 60)]
}

// ───────────────────────── Time labels ─────────────────────────

const HOUR12: boolean = (() => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false
  } catch {
    return false
  }
})()

/** Compact time for tight spaces: "9am", "9:30pm" (or "09:30" in 24h locales). */
export function compactTime(t?: string): string {
  if (!t) return ''
  if (!HOUR12) return t
  const [h, m] = t.split(':').map(Number)
  const suffix = h < 12 ? 'am' : 'pm'
  const hh = h % 12 || 12
  return m ? `${hh}:${String(m).padStart(2, '0')}${suffix}` : `${hh}${suffix}`
}

/** Gutter label for an hour line: "8 AM" / "08:00". */
export function hourLabel(h: number): string {
  if (!HOUR12) return `${String(h % 24).padStart(2, '0')}:00`
  return `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}`
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// ───────────────────────── Periods ─────────────────────────

/** Inclusive [start, end] of the data a view needs. */
export function rangeFor(view: CalView, date: ISODate, wso: 0 | 1): [ISODate, ISODate] {
  switch (view) {
    case 'month': {
      const grid = monthGrid(monthOf(date), wso)
      return [grid[0], grid[grid.length - 1]]
    }
    case 'week': {
      const w = weekRange(date, wso)
      return [w[0], w[w.length - 1]]
    }
    case 'day':
      return [date, date]
    case 'agenda':
      return [date, addDaysISO(date, AGENDA_DAYS - 1)]
  }
}

/** Date after pressing prev (-1) / next (+1). */
export function shiftDate(view: CalView, date: ISODate, dir: 1 | -1): ISODate {
  switch (view) {
    case 'month':
      return toISO(addMonths(fromISO(date), dir))
    case 'week':
      return addDaysISO(date, 7 * dir)
    case 'day':
      return addDaysISO(date, dir)
    case 'agenda':
      return addDaysISO(date, AGENDA_DAYS * dir)
  }
}

/** "Oct 19 – 25", "Sep 28 – Oct 4", "Dec 28, 2026 – Jan 3, 2027". */
export function rangeLabel(a: ISODate, b: ISODate): string {
  const thisYear = todayISO().slice(0, 4)
  const sameYear = a.slice(0, 4) === b.slice(0, 4)
  if (!sameYear) return `${fmt(a, 'MMM d, yyyy')} – ${fmt(b, 'MMM d, yyyy')}`
  const sameMonth = a.slice(0, 7) === b.slice(0, 7)
  const s = sameMonth ? `${fmt(a, 'MMM d')} – ${fmt(b, 'd')}` : `${fmt(a, 'MMM d')} – ${fmt(b, 'MMM d')}`
  return a.slice(0, 4) === thisYear ? s : `${s}, ${a.slice(0, 4)}`
}

export function periodLabel(view: CalView, date: ISODate, wso: 0 | 1): string {
  switch (view) {
    case 'month':
      return fmt(date, 'MMMM yyyy')
    case 'week': {
      const [a, b] = rangeFor('week', date, wso)
      return rangeLabel(a, b)
    }
    case 'day':
      return fmt(date, date.slice(0, 4) === todayISO().slice(0, 4) ? 'EEE, MMM d' : 'EEE, MMM d, yyyy')
    case 'agenda': {
      const [a, b] = rangeFor('agenda', date, wso)
      return rangeLabel(a, b)
    }
  }
}

export const PERIOD_UNIT: Record<CalView, string> = {
  month: 'month',
  week: 'week',
  day: 'day',
  agenda: '30 days',
}

/** "Today" / "Tomorrow" / "Yesterday", otherwise the weekday name. */
export function dayHeadline(date: ISODate, today = todayISO()): string {
  if (date === today) return 'Today'
  if (date === addDaysISO(today, 1)) return 'Tomorrow'
  if (date === addDaysISO(today, -1)) return 'Yesterday'
  return fmt(date, 'EEEE')
}

/** Header subtitle: counts for the visible period (month view counts only the month itself). */
export function summarize(agenda: Map<ISODate, DayAgenda>, layers: Layers, month?: MonthKey): string {
  let events = 0
  let tasks = 0
  let payments = 0
  for (const day of agenda.values()) {
    if (month && monthOf(day.date) !== month) continue
    events += day.events.length
    tasks += day.tasks.filter((t) => t.status !== 'done').length
    payments += day.payments.length
  }
  if (!events && !tasks && !payments) return 'Nothing scheduled'
  const parts: string[] = []
  if (layers.events && events) parts.push(plural(events, 'event'))
  if (layers.tasks && tasks) parts.push(plural(tasks, 'open task'))
  if (layers.payments && payments) parts.push(plural(payments, 'payment due'))
  return parts.join(' · ')
}

export function isDayEmpty(day: DayAgenda | undefined, notes: Note[] | undefined): boolean {
  if (!day) return !notes?.length
  return !day.events.length && !day.tasks.length && !day.payments.length && !day.journal && !notes?.length
}

/** First non-empty line of a text body. */
export function firstLine(text: string | undefined): string {
  return (text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? ''
}

// ───────────────────────── Time-grid layout ─────────────────────────

export interface PlacedEvent {
  occ: EventOccurrence
  /** Minutes since midnight. */
  start: number
  end: number
  /** End used for layout (enforces a minimum visual height). */
  vEnd: number
  /** Column within its overlap cluster, and the cluster's column count. */
  col: number
  cols: number
}

/**
 * Lay out timed events of one day. Overlapping events are grouped into clusters;
 * within a cluster each event gets the first free column, and all share the width.
 */
export function layoutDay(occs: EventOccurrence[], minMinutes = 25): PlacedEvent[] {
  const items: PlacedEvent[] = occs.map((occ) => {
    const [start, end] = eventSpan(occ.event)
    return { occ, start, end, vEnd: Math.max(end, start + minMinutes), col: 0, cols: 1 }
  })
  items.sort((a, b) => a.start - b.start || b.vEnd - a.vEnd)

  const out: PlacedEvent[] = []
  let cluster: PlacedEvent[] = []
  let colEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    for (const p of cluster) p.cols = colEnds.length
    out.push(...cluster)
    cluster = []
    colEnds = []
    clusterEnd = -1
  }
  for (const it of items) {
    if (cluster.length && it.start >= clusterEnd) flush()
    let col = colEnds.findIndex((end) => end <= it.start)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(it.vEnd)
    } else {
      colEnds[col] = it.vEnd
    }
    it.col = col
    cluster.push(it)
    clusterEnd = Math.max(clusterEnd, it.vEnd)
  }
  flush()
  return out
}
