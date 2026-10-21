// Habit math shared by the Goals & Habits screen, dashboard widget and reports.
import { addDaysISO, eachDay, fromISO, todayISO, weekRange } from './dates'
import type { Habit, ISODate } from './types'

export function amountOn(h: Habit, date: ISODate): number {
  return h.log[date] ?? 0
}

export function doneOn(h: Habit, date: ISODate): boolean {
  return amountOn(h, date) >= Math.max(1, h.target)
}

/** Is the habit expected on this date? (weekly-count habits are "available" every day) */
export function isScheduled(h: Habit, date: ISODate): boolean {
  switch (h.schedule.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return h.schedule.days.includes(fromISO(date).getDay())
    case 'weekly':
      return true
  }
}

/** For "N times a week" habits: how many times done in the week containing `date`. */
export function weekCount(h: Habit, date: ISODate, weekStartsOn: 0 | 1): number {
  return weekRange(date, weekStartsOn).filter((d) => doneOn(h, d)).length
}

/** Should it show as "to do" today? Weekly-count habits stop nagging once the week's quota is met. */
export function isDueToday(h: Habit, date: ISODate, weekStartsOn: 0 | 1): boolean {
  if (h.archived) return false
  if (h.schedule.kind === 'weekly') return weekCount(h, date, weekStartsOn) < h.schedule.times || doneOn(h, date)
  return isScheduled(h, date)
}

/**
 * Current streak. Daily/weekday habits: consecutive scheduled days done (today may still be open).
 * Weekly-count habits: consecutive weeks where the quota was met (current week counts if met).
 */
export function streak(h: Habit, weekStartsOn: 0 | 1, today = todayISO()): { count: number; unit: 'day' | 'week' } {
  if (h.schedule.kind === 'weekly') {
    const times = h.schedule.times
    let count = 0
    let cursor = today
    if (weekCount(h, cursor, weekStartsOn) >= times) count++
    for (let i = 0; i < 520; i++) {
      cursor = addDaysISO(weekRange(cursor, weekStartsOn)[0], -1)
      if (weekCount(h, cursor, weekStartsOn) >= times) count++
      else break
    }
    return { count, unit: 'week' }
  }
  let count = 0
  let d = today
  // Today not done yet doesn't break the streak.
  if (!doneOn(h, d)) d = addDaysISO(d, -1)
  for (let i = 0; i < 3650; i++) {
    if (isScheduled(h, d)) {
      if (doneOn(h, d)) count++
      else break
    }
    d = addDaysISO(d, -1)
  }
  return { count, unit: 'day' }
}

/** Best streak ever, in scheduled days (weekly-count habits return the current week streak). */
export function bestStreak(h: Habit, weekStartsOn: 0 | 1, today = todayISO()): number {
  const dates = Object.keys(h.log).filter((d) => h.log[d] > 0).sort()
  if (!dates.length) return 0
  if (h.schedule.kind === 'weekly') return streak(h, weekStartsOn, today).count
  let best = 0
  let run = 0
  for (const d of eachDay(dates[0], today)) {
    if (!isScheduled(h, d)) continue
    if (doneOn(h, d)) best = Math.max(best, ++run)
    else if (d !== today) run = 0
  }
  return best
}

export interface Consistency {
  /** Opportunities in the range (scheduled days, or weekly quota × weeks). */
  due: number
  done: number
  /** done / due, 0..1 (0 when nothing was due). */
  rate: number
}

/** How consistently the habit was kept between two dates (inclusive). Never counts days before it existed. */
export function consistency(h: Habit, start: ISODate, end: ISODate, _weekStartsOn: 0 | 1 = 1): Consistency {
  const created = new Date(h.createdAt)
  const createdISO = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`
  const firstLog = Object.keys(h.log).sort()[0]
  const startOfHabit = firstLog && firstLog < createdISO ? firstLog : createdISO
  const from = start > startOfHabit ? start : startOfHabit
  if (from > end) return { due: 0, done: 0, rate: 0 }
  const days = eachDay(from, end)
  if (h.schedule.kind === 'weekly') {
    const weeks = Math.max(1, Math.round(days.length / 7))
    const due = weeks * h.schedule.times
    const done = Math.min(due, days.filter((d) => doneOn(h, d)).length)
    return { due, done, rate: due ? done / due : 0 }
  }
  const scheduled = days.filter((d) => isScheduled(h, d))
  const done = scheduled.filter((d) => doneOn(h, d)).length
  return { due: scheduled.length, done, rate: scheduled.length ? done / scheduled.length : 0 }
}

export function describeSchedule(h: Habit): string {
  const s = h.schedule
  if (s.kind === 'daily') return 'Every day'
  if (s.kind === 'weekly') return `${s.times}× a week`
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  if (s.days.length === 5 && [1, 2, 3, 4, 5].every((d) => s.days.includes(d))) return 'Weekdays'
  if (s.days.length === 2 && s.days.includes(0) && s.days.includes(6)) return 'Weekends'
  return [...s.days].sort().map((d) => names[d]).join(', ')
}
