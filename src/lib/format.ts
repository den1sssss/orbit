import { useCallback } from 'react'
import { useStore } from './store'

const cache = new Map<string, Intl.NumberFormat>()

function nf(currency: string, compact: boolean, decimals: boolean): Intl.NumberFormat {
  const key = `${currency}|${compact}|${decimals}`
  let f = cache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        notation: compact ? 'compact' : 'standard',
        minimumFractionDigits: compact ? 0 : decimals ? 2 : 0,
        maximumFractionDigits: compact ? 1 : decimals ? 2 : 0,
      })
    } catch {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
    }
    cache.set(key, f)
  }
  return f
}

export interface MoneyOpts {
  /** Short form for tight spaces: no cents, and 12.9K style from 10,000 up. */
  compact?: boolean
  /** Prefix + for positives. */
  sign?: boolean
  /** Drop cents when the value is whole (default true). */
  smart?: boolean
}

export function formatMoney(amount: number, currency: string, opts: MoneyOpts = {}): string {
  const { compact = false, sign = false, smart = true } = opts
  const decimals = !compact && (!smart || Math.round(amount * 100) % 100 !== 0)
  const s = nf(currency, compact && Math.abs(amount) >= 10000, decimals).format(amount)
  return sign && amount > 0 ? `+${s}` : s
}

/** Hook: returns a formatter bound to the user's currency (stable until the currency changes). */
export function useMoney() {
  const currency = useStore((s) => s.settings.currency)
  return useCallback((amount: number, opts?: MoneyOpts) => formatMoney(amount, currency, opts), [currency])
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? currency
  } catch {
    return currency
  }
}

export function pct(n: number, digits = 0): string {
  if (!isFinite(n)) return '—'
  return `${(n * 100).toFixed(digits)}%`
}

/** Parse user-typed amounts like "1,234.50" or "12,5". */
export function parseAmount(input: string): number {
  const cleaned = input.replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!cleaned) return NaN
  // If both separators exist, the last one is the decimal separator.
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')
  let normalized = cleaned
  if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.')
  else normalized = cleaned.replace(/,/g, '')
  return Number(normalized)
}

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'RUB', 'UAH', 'KZT', 'TRY', 'AED', 'INR', 'CAD',
  'AUD', 'CHF', 'JPY', 'CNY', 'BRL', 'MXN', 'PLN', 'SEK', 'NOK', 'ZAR',
  'NGN', 'KES', 'PHP', 'IDR', 'SGD', 'GEL', 'AMD', 'UZS', 'THB', 'ILS',
]
