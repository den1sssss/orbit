// Small, pure text helpers shared by the report UI, highlights and the Markdown export.
import { MOOD_EMOJI } from '@/lib/defaults'

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Typographic minus, so "−3" lines up with "+3". */
export const MINUS = '−'

export type MoneyFn = (amount: number, opts?: { sign?: boolean; compact?: boolean }) => string

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/** "+5", "−3", "0" (rounded to `digits`). */
export function signed(n: number, digits = 0): string {
  const abs = Math.abs(n)
  const text = abs.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  if (Number(abs.toFixed(digits)) === 0) return text
  return `${n > 0 ? '+' : MINUS}${text}`
}

/** Signed money with a real minus: "+£120", "−£40". */
export function signedMoney(money: MoneyFn, n: number): string {
  if (n < 0) return `${MINUS}${money(-n)}`
  return money(n, { sign: true })
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** Difference between two ratios in percentage points: "+6 pts". */
export function points(diff: number): string {
  return `${signed(diff * 100)} pts`
}

/** Relative change as a signed percentage: "+12%". */
export function signedPercent(ratio: number): string {
  return `${signed(ratio * 100)}%`
}

/** 45 → "45 min", 90 → "1.5 h", 750 → "13 h". */
export function hours(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = minutes / 60
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h`
}

/** Mood/energy average to one decimal. */
export function score(n: number): string {
  return n.toFixed(1)
}

export function moodEmoji(avg: number): string {
  return MOOD_EMOJI[Math.min(5, Math.max(1, Math.round(avg)))] ?? ''
}

export const ENERGY_EMOJI = ['', '🪫', '🥱', '😌', '💪', '⚡'] as const

export function energyEmoji(avg: number): string {
  return ENERGY_EMOJI[Math.min(5, Math.max(1, Math.round(avg)))] ?? ''
}
