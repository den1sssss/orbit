// Important dates (birthdays, anniversaries, renewals, expiries) — next occurrence & countdowns.
import { addDaysISO, diffDays, fromISO, todayISO } from './dates'
import type { ImportantDate, ImportantDateKind, ISODate } from './types'

export const DATE_KIND_LABELS: Record<ImportantDateKind, string> = {
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  renewal: 'Renewal',
  expiry: 'Expiry',
  holiday: 'Holiday',
  other: 'Other',
}

function sameDayIn(year: number, iso: ISODate): ISODate {
  const d = fromISO(iso)
  const month = d.getMonth()
  // Feb 29 falls back to Feb 28 in non-leap years.
  const last = new Date(year, month + 1, 0).getDate()
  const day = Math.min(d.getDate(), last)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Next date on or after `from` (undefined for a past one-off date). */
export function nextOccurrence(d: ImportantDate, from = todayISO()): ISODate | undefined {
  if (!d.yearly) return d.date >= from ? d.date : undefined
  const year = Number(from.slice(0, 4))
  const thisYear = sameDayIn(year, d.date)
  return thisYear >= from ? thisYear : sameDayIn(year + 1, d.date)
}

/** All occurrences inside [start, end] (for calendars). */
export function occurrencesIn(d: ImportantDate, start: ISODate, end: ISODate): ISODate[] {
  if (!d.yearly) return d.date >= start && d.date <= end ? [d.date] : []
  const out: ISODate[] = []
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
    const occ = sameDayIn(y, d.date)
    if (occ >= start && occ <= end && occ >= d.date.slice(0, 4) + '-01-01') out.push(occ)
  }
  return out
}

export interface UpcomingDate {
  item: ImportantDate
  date: ISODate
  daysUntil: number
  /** Turning N / N years (birthdays & anniversaries when the original year is known). */
  years?: number
}

export function upcomingDates(list: ImportantDate[], days = 60, from = todayISO()): UpcomingDate[] {
  const end = addDaysISO(from, days)
  const out: UpcomingDate[] = []
  for (const item of list) {
    const date = nextOccurrence(item, from)
    if (!date || date > end) continue
    const years = item.yearly ? Number(date.slice(0, 4)) - Number(item.date.slice(0, 4)) : undefined
    out.push({ item, date, daysUntil: diffDays(date, from), years: years && years > 0 ? years : undefined })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** "Turns 34", "5th anniversary", or undefined. */
export function yearsLabel(u: UpcomingDate): string | undefined {
  if (!u.years) return undefined
  if (u.item.kind === 'birthday') return `Turns ${u.years}`
  const n = u.years
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'
  return u.item.kind === 'anniversary' ? `${n}${suffix} anniversary` : `${n} years`
}
