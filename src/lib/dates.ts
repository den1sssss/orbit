import {
  addDays, addMonths, differenceInCalendarDays, differenceInCalendarMonths,
  endOfMonth, endOfWeek, format, getDaysInMonth, isValid, parse, startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { CalendarEvent, ISODate, MonthKey, PaymentRecurrence } from './types'

/**
 * Language for weekday/month names. The UI is English, so names stay English even on a
 * phone set to another language (numbers and 12/24h time still follow the device).
 */
export const UI_LOCALE = 'en-GB'

/** Parse 'YYYY-MM-DD' as a *local* date (never UTC). */
export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function toISO(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

export function todayISO(): ISODate {
  return toISO(new Date())
}

export function monthOf(iso: ISODate): MonthKey {
  return iso.slice(0, 7)
}

export function currentMonth(): MonthKey {
  return monthOf(todayISO())
}

export function monthStart(month: MonthKey): ISODate {
  return `${month}-01`
}

export function monthEnd(month: MonthKey): ISODate {
  return toISO(endOfMonth(fromISO(monthStart(month))))
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  return format(addMonths(fromISO(monthStart(month)), delta), 'yyyy-MM')
}

export function addDaysISO(iso: ISODate, n: number): ISODate {
  return toISO(addDays(fromISO(iso), n))
}

export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(fromISO(a), fromISO(b))
}

/** Inclusive list of dates from start to end. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  let d = fromISO(start)
  const last = fromISO(end)
  while (d <= last) {
    out.push(toISO(d))
    d = addDays(d, 1)
  }
  return out
}

/** 6-week grid covering a month, aligned to the week start. */
export function monthGrid(month: MonthKey, weekStartsOn: 0 | 1): ISODate[] {
  const first = fromISO(monthStart(month))
  const start = startOfWeek(startOfMonth(first), { weekStartsOn })
  return Array.from({ length: 42 }, (_, i) => toISO(addDays(start, i)))
}

export function weekRange(iso: ISODate, weekStartsOn: 0 | 1): ISODate[] {
  const d = fromISO(iso)
  return eachDay(toISO(startOfWeek(d, { weekStartsOn })), toISO(endOfWeek(d, { weekStartsOn })))
}

export function fmt(iso: ISODate, pattern: string): string {
  return format(fromISO(iso), pattern)
}

export function fmtMonth(month: MonthKey, pattern = 'MMMM yyyy'): string {
  return format(fromISO(monthStart(month)), pattern)
}

/** "Today", "Tomorrow", "Yesterday", or "Mon, Oct 21" (adds year when not current). */
export function relativeDay(iso: ISODate): string {
  const diff = diffDays(iso, todayISO())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const sameYear = iso.slice(0, 4) === todayISO().slice(0, 4)
  return fmt(iso, sameYear ? 'EEE, MMM d' : 'EEE, MMM d, yyyy')
}

/** "in 3 days", "2 days ago", "today". */
export function relativeDistance(iso: ISODate): string {
  const diff = diffDays(iso, todayISO())
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`
}

export function isValidISO(iso: string | undefined): iso is ISODate {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  return isValid(parse(iso, 'yyyy-MM-dd', new Date()))
}

/** 'HH:mm' → minutes since midnight. */
export function timeToMinutes(t?: string): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** '14:30' → '2:30 PM' (or 24h if the locale prefers it). */
export function fmtTime(t?: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const d = new Date(2000, 0, 1, h, m)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// ───────────────────────── Recurrence ─────────────────────────

/** Does a (possibly recurring) event occur on `iso`? */
export function occursOn(ev: CalendarEvent, iso: ISODate): boolean {
  if (iso < ev.date) return false
  const r = ev.recurrence
  if (r.until && iso > r.until) return false
  if (ev.exdates.includes(iso)) return false
  const interval = Math.max(1, r.interval || 1)
  const start = fromISO(ev.date)
  const day = fromISO(iso)
  switch (r.freq) {
    case 'none':
      return iso === ev.date
    case 'daily':
      return differenceInCalendarDays(day, start) % interval === 0
    case 'weekly': {
      const days = r.weekdays && r.weekdays.length ? r.weekdays : [start.getDay()]
      if (!days.includes(day.getDay())) return false
      const weeks = Math.floor(
        differenceInCalendarDays(startOfWeek(day), startOfWeek(start)) / 7,
      )
      return weeks % interval === 0
    }
    case 'monthly': {
      const months = differenceInCalendarMonths(day, start)
      if (months % interval !== 0) return false
      const want = Math.min(start.getDate(), getDaysInMonth(day))
      return day.getDate() === want
    }
    case 'yearly': {
      const years = day.getFullYear() - start.getFullYear()
      if (years % interval !== 0) return false
      if (day.getMonth() !== start.getMonth()) return false
      const want = Math.min(start.getDate(), getDaysInMonth(day))
      return day.getDate() === want
    }
  }
}

/** All occurrence dates of an event within [start, end]. */
export function occurrencesBetween(ev: CalendarEvent, start: ISODate, end: ISODate): ISODate[] {
  if (ev.recurrence.freq === 'none') {
    return ev.date >= start && ev.date <= end && !ev.exdates.includes(ev.date) ? [ev.date] : []
  }
  const from = ev.date > start ? ev.date : start
  const to = ev.recurrence.until && ev.recurrence.until < end ? ev.recurrence.until : end
  if (from > to) return []
  return eachDay(from, to).filter((d) => occursOn(ev, d))
}

export function describeRecurrence(ev: CalendarEvent): string {
  const r = ev.recurrence
  if (r.freq === 'none') return 'Does not repeat'
  const n = Math.max(1, r.interval || 1)
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq]
  let s = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`
  if (r.freq === 'weekly' && r.weekdays && r.weekdays.length) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    s += ` on ${[...r.weekdays].sort().map((d) => names[d]).join(', ')}`
  }
  if (r.until) s += ` until ${fmt(r.until, 'MMM d, yyyy')}`
  return s
}

// ───────────────────────── Planned payments ─────────────────────────

export function advanceDue(iso: ISODate, rec: PaymentRecurrence): ISODate {
  const d = fromISO(iso)
  switch (rec) {
    case 'weekly': return toISO(addDays(d, 7))
    case 'monthly': return toISO(addMonths(d, 1))
    case 'quarterly': return toISO(addMonths(d, 3))
    case 'yearly': return toISO(addMonths(d, 12))
    case 'none': return iso
  }
}

/** Projected due dates of a planned payment within [start, end], starting at nextDue. */
export function paymentDueDates(
  nextDue: ISODate, rec: PaymentRecurrence, start: ISODate, end: ISODate,
): ISODate[] {
  const out: ISODate[] = []
  let d = nextDue
  let guard = 0
  while (d <= end && guard++ < 500) {
    if (d >= start) out.push(d)
    if (rec === 'none') break
    d = advanceDue(d, rec)
  }
  return out
}

/** How many times per month a recurrence happens on average. */
export function monthlyFactor(rec: PaymentRecurrence): number {
  switch (rec) {
    case 'weekly': return 52 / 12
    case 'monthly': return 1
    case 'quarterly': return 1 / 3
    case 'yearly': return 1 / 12
    case 'none': return 0
  }
}
