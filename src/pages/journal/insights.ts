// Pure helpers for the journal: content checks, streaks, mood series, search.
import { addDaysISO, eachDay } from '@/lib/dates'
import type { ISODate, JournalEntry, Mood } from '@/lib/types'

export const MOODS: Mood[] = [1, 2, 3, 4, 5]

export const ENERGY_LABELS = ['', 'Drained', 'Low', 'Steady', 'Good', 'Charged'] as const

/**
 * Single-hue ordinal ramp of the accent: mood 1 lightest → 5 darkest.
 * Used by the month calendar cells and its legend.
 */
const MOOD_MIX = [0, 18, 38, 58, 79, 100]
export function moodFill(mood: Mood): string {
  return `color-mix(in srgb, var(--accent) ${MOOD_MIX[mood]}%, transparent)`
}

/** Does this (partial) entry hold anything the user wrote or picked? */
export function hasContent(e: Partial<JournalEntry>): boolean {
  return Boolean(
    e.mood ||
      e.energy ||
      e.title?.trim() ||
      e.body?.trim() ||
      e.gratitude?.some((g) => g.trim()) ||
      e.wins?.trim() ||
      e.lessons?.trim() ||
      e.tomorrow?.trim() ||
      e.tags?.length,
  )
}

/** Consecutive days with an entry, ending today (or yesterday if today is still blank). */
export function currentStreak(dates: Set<ISODate>, today: ISODate): number {
  let d = dates.has(today) ? today : addDaysISO(today, -1)
  let n = 0
  while (dates.has(d)) {
    n += 1
    d = addDaysISO(d, -1)
  }
  return n
}

export interface MoodPoint {
  date: ISODate
  /** null = no mood logged that day (drawn as a gap). */
  mood: number | null
}

export function moodSeries(byDate: Map<ISODate, JournalEntry>, end: ISODate, days = 30): MoodPoint[] {
  return eachDay(addDaysISO(end, -(days - 1)), end).map((date) => ({
    date,
    mood: byDate.get(date)?.mood ?? null,
  }))
}

export function averageMood(points: MoodPoint[]): number | null {
  const moods = points.map((p) => p.mood).filter((m): m is number => m != null)
  if (!moods.length) return null
  return moods.reduce((a, b) => a + b, 0) / moods.length
}

/** First meaningful line of an entry, for list previews. */
export function entryPreview(e: JournalEntry): string {
  const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  const body = firstLine(e.body)
  if (body) return body
  const grateful = e.gratitude.find((g) => g.trim())
  if (grateful) return `Grateful for ${grateful.trim()}`
  return firstLine(e.wins) || firstLine(e.lessons) || firstLine(e.tomorrow)
}

export function matchesQuery(e: JournalEntry, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, '')
  if (!q) return true
  const hay = [e.title ?? '', e.body, e.gratitude.join(' '), e.wins, e.lessons, e.tomorrow, e.tags.join(' ')]
    .join('\n')
    .toLowerCase()
  return hay.includes(q)
}

export interface PastEntry {
  entry: JournalEntry
  label: string
}

/** Entries on the same day of the month in earlier months and years, newest first. */
export function onThisDay(journal: JournalEntry[], date: ISODate, limit = 5): PastEntry[] {
  const day = date.slice(8, 10)
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  return journal
    .filter((e) => e.date < date && e.date.slice(8, 10) === day && hasContent(e))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((entry) => {
      const months = (y - Number(entry.date.slice(0, 4))) * 12 + (m - Number(entry.date.slice(5, 7)))
      const years = Math.floor(months / 12)
      const rest = months % 12
      const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
      const label =
        months < 12
          ? `${plural(months, 'month')} ago`
          : rest === 0
            ? `${plural(years, 'year')} ago`
            : `${plural(years, 'year')}, ${plural(rest, 'month')} ago`
      return { entry, label }
    })
}

export function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}
