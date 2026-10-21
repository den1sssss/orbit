// Pure helpers for the Goals & Habits module: habit display math, goal progress,
// horizon dates, life-area balance and review periods.
import { useEffect, useState } from 'react'
import {
  addDaysISO, diffDays, fmt, fmtMonth, monthEnd, monthOf, monthStart, shiftMonth, toISO, todayISO,
  weekKey, weekRange,
} from '@/lib/dates'
import { consistency, doneOn, type Consistency } from '@/lib/habits'
import type { ColorKey, GoalHorizon, Habit, ISODate, LifeArea, LifeGoal, Review } from '@/lib/types'

export type WeekStart = 0 | 1

// ───────────────────────── Today ─────────────────────────

/** Local 'YYYY-MM-DD' that rolls over at midnight (checked every minute and on wake). */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const tick = () => setToday(todayISO())
    const id = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

export function isoDateOf(ms: number): ISODate {
  return toISO(new Date(ms))
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, isFinite(n) ? n : 0))
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function pctText(ratio: number | null | undefined): string {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`
}

const numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
export function fmtNum(n: number | undefined): string {
  return numberFmt.format(n ?? 0)
}

// ───────────────────────── Habits ─────────────────────────

/** 23 common habit emoji; with "none" the picker is a tidy 8 × 3 grid. */
export const HABIT_EMOJI = [
  '💧', '🚶', '🏃', '💪', '🧘', '🥗', '😴',
  '📚', '✍️', '🧠', '🎯', '📵', '🌅', '🦷', '💊',
  '🎸', '🧹', '💰', '🙏', '🚭', '🌿', '☕', '🎨',
]

export const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export function weekdayOrder(wso: WeekStart): number[] {
  return wso === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
}

export function sortHabits(a: Habit, b: Habit): number {
  return a.order - b.order || a.createdAt - b.createdAt
}

export function habitTarget(h: Habit): number {
  return Math.max(1, h.target || 1)
}

export function unitLabel(h: Habit): string {
  return h.unit?.trim() || (habitTarget(h) > 1 ? 'times' : '')
}

export interface StarterHabit {
  name: string
  emoji: string
  color: ColorKey
  area: LifeArea
  target: number
  unit?: string
  hint: string
}

export const STARTER_HABITS: StarterHabit[] = [
  { name: 'Drink water', emoji: '💧', color: 'blue', area: 'health', target: 8, unit: 'glasses', hint: '8 glasses a day' },
  { name: 'Walk 30 min', emoji: '🚶', color: 'green', area: 'health', target: 1, hint: 'Every day' },
  { name: 'Read 20 pages', emoji: '📚', color: 'violet', area: 'learning', target: 1, hint: 'Every day' },
  { name: 'No phone after 22:00', emoji: '📵', color: 'indigo', area: 'personal', target: 1, hint: 'Wind down' },
]

/**
 * Consistency between two dates that doesn't hold today against you until it's done.
 * Null when nothing was due (habit too new, range in the future…).
 */
export function keptRate(h: Habit, start: ISODate, end: ISODate, today: ISODate, wso: WeekStart): Consistency | null {
  let last = end > today ? today : end
  if (last === today && !doneOn(h, today)) last = addDaysISO(today, -1)
  if (last < start) return null
  const c = consistency(h, start, last, wso)
  return c.due ? c : null
}

/** Last N days of consistency (default 30). */
export function recentRate(h: Habit, today: ISODate, wso: WeekStart, days = 30): Consistency | null {
  return keptRate(h, addDaysISO(today, -(days - 1)), today, today, wso)
}

export function checkIns(h: Habit): number {
  return Object.values(h.log).filter((v) => v > 0).length
}

/** Weighted rate over several habits' consistency results. */
export function combinedRate(list: (Consistency | null)[]): number | null {
  let due = 0
  let done = 0
  for (const c of list) {
    if (!c) continue
    due += c.due
    done += c.done
  }
  return due ? done / due : null
}

// ───────────────────────── Goals ─────────────────────────

export const HORIZONS: GoalHorizon[] = ['weekly', 'monthly', 'quarterly', 'yearly', 'long-term']

export function isHorizon(v: string | null): v is GoalHorizon {
  return !!v && (HORIZONS as string[]).includes(v)
}

export function goalRatio(g: LifeGoal): number {
  switch (g.measure) {
    case 'milestones': {
      const n = g.milestones.length
      if (!n) return g.status === 'done' ? 1 : 0
      return g.milestones.filter((m) => m.done).length / n
    }
    case 'number': {
      const t = g.target ?? 0
      return t > 0 ? clamp01((g.current ?? 0) / t) : 0
    }
    case 'manual':
      return clamp01((g.progress ?? 0) / 100)
  }
}

export function goalProgressLabel(g: LifeGoal): string {
  switch (g.measure) {
    case 'milestones': {
      const n = g.milestones.length
      if (!n) return 'No milestones yet'
      return `${g.milestones.filter((m) => m.done).length}/${n} milestones`
    }
    case 'number':
      return `${fmtNum(g.current)} / ${fmtNum(g.target)}${g.unit ? ` ${g.unit}` : ''}`
    case 'manual':
      return `${Math.round(g.progress ?? 0)}%`
  }
}

/** Sensible +/− step for a numeric goal (1 for small targets, 10s/100s for big ones). */
export function goalStep(target: number | undefined): number {
  const t = target ?? 0
  if (t <= 50) return 1
  return Math.pow(10, Math.floor(Math.log10(t)) - 1)
}

/** Default target date for a horizon: end of the current week / month / quarter / year. */
export function horizonEnd(h: GoalHorizon, today: ISODate, wso: WeekStart): ISODate | undefined {
  const y = today.slice(0, 4)
  switch (h) {
    case 'weekly':
      return weekRange(today, wso)[6]
    case 'monthly':
      return monthEnd(monthOf(today))
    case 'quarterly': {
      const m = Number(today.slice(5, 7))
      const last = Math.ceil(m / 3) * 3
      return monthEnd(`${y}-${String(last).padStart(2, '0')}`)
    }
    case 'yearly':
      return `${y}-12-31`
    case 'long-term':
      return undefined
  }
}

export interface DueInfo {
  text: string
  tone: 'bad' | 'warn' | 'muted'
}

export function dueInfo(targetDate: ISODate | undefined, today: ISODate): DueInfo | null {
  if (!targetDate) return null
  const diff = diffDays(targetDate, today)
  if (diff < 0) return { text: diff === -1 ? '1 day overdue' : `${-diff} days overdue`, tone: 'bad' }
  if (diff === 0) return { text: 'Due today', tone: 'warn' }
  if (diff === 1) return { text: 'Due tomorrow', tone: 'warn' }
  if (diff <= 60) return { text: `${diff} days left`, tone: 'muted' }
  const sameYear = targetDate.slice(0, 4) === today.slice(0, 4)
  return { text: `Due ${fmt(targetDate, sameYear ? 'MMM d' : 'MMM d, yyyy')}`, tone: 'muted' }
}

export function sortGoals(a: LifeGoal, b: LifeGoal): number {
  if (a.status === 'done' && b.status === 'done') return (b.completedAt ?? 0) - (a.completedAt ?? 0)
  const da = a.targetDate ?? '9999-12-31'
  const db = b.targetDate ?? '9999-12-31'
  return da.localeCompare(db) || a.createdAt - b.createdAt
}

// ───────────────────────── Life areas ─────────────────────────

export interface AreaSummary {
  area: LifeArea
  goals: LifeGoal[]
  habits: Habit[]
  /** Average progress of active goals. */
  goalAvg: number | null
  /** 30-day consistency across the area's habits. */
  habitAvg: number | null
  /** Mean of goalAvg and habitAvg (whichever exist). */
  score: number | null
}

export function areaSummary(
  area: LifeArea, habits: Habit[], goals: LifeGoal[], today: ISODate, wso: WeekStart,
): AreaSummary {
  const g = goals.filter((x) => x.area === area && x.status === 'active')
  const hs = habits.filter((h) => !h.archived && h.area === area).sort(sortHabits)
  const goalAvg = average(g.map(goalRatio))
  const habitAvg = combinedRate(hs.map((h) => recentRate(h, today, wso)))
  const parts = [goalAvg, habitAvg].filter((v): v is number => v != null)
  return { area, goals: g, habits: hs, goalAvg, habitAvg, score: average(parts) }
}

// ───────────────────────── Review periods ─────────────────────────

export type Period = 'week' | 'month'

export interface PeriodRange {
  period: Period
  start: ISODate
  end: ISODate
  /** Review key: ISO week ('2026-W43') or month ('2026-10'). */
  key: string
  label: string
}

function weekLabel(start: ISODate, end: ISODate, today: ISODate): string {
  const sameYear = start.slice(0, 4) === today.slice(0, 4) && end.slice(0, 4) === today.slice(0, 4)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const a = fmt(start, 'MMM d')
  const b = fmt(end, sameMonth ? 'd' : 'MMM d')
  return `${a} – ${b}${sameYear ? '' : `, ${end.slice(0, 4)}`}`
}

/**
 * The week or month containing `anchor`. Week keys use the ISO week of the period's
 * mid-week day, so Monday-start weeks get exactly weekKey(start) and Sunday-start
 * weeks map to the ISO week they mostly cover.
 */
export function periodRange(period: Period, anchor: ISODate, wso: WeekStart, today = todayISO()): PeriodRange {
  if (period === 'week') {
    const days = weekRange(anchor, wso)
    const start = days[0]
    const end = days[days.length - 1]
    return { period, start, end, key: weekKey(addDaysISO(start, 3)), label: weekLabel(start, end, today) }
  }
  const m = monthOf(anchor)
  return { period, start: monthStart(m), end: monthEnd(m), key: m, label: fmtMonth(m) }
}

export function shiftPeriod(r: PeriodRange, delta: number, wso: WeekStart): PeriodRange {
  return r.period === 'week'
    ? periodRange('week', addDaysISO(r.start, 7 * delta), wso)
    : periodRange('month', monthStart(shiftMonth(monthOf(r.start), delta)), wso)
}

/** Monday of an ISO week key like '2026-W43'. */
export function isoWeekMonday(key: string): ISODate | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key)
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  const jan4 = new Date(year, 0, 4)
  const offset = (jan4.getDay() + 6) % 7
  const firstMonday = toISO(new Date(year, 0, 4 - offset))
  return addDaysISO(firstMonday, (week - 1) * 7)
}

/** A date inside the period a review belongs to. */
export function reviewAnchor(r: Pick<Review, 'period' | 'key'>): ISODate | null {
  if (r.period === 'month') return /^\d{4}-\d{2}$/.test(r.key) ? `${r.key}-01` : null
  return isoWeekMonday(r.key)
}
