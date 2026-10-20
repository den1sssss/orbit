// Shared, money-section-only helpers: URL state, lookups, formatting, actions.
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { currentMonth, shiftMonth } from '@/lib/dates'
import type { ScopeFilter } from '@/lib/finance'
import { formatMoney, type MoneyOpts } from '@/lib/format'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import type { FinanceCategory, ID, MonthKey, PaymentMethod, PaymentRecurrence, Transaction } from '@/lib/types'
import { saveFile } from '@/lib/platform'

// ───────────────────────── URL state ─────────────────────────

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export type MonthParam = MonthKey | 'all'

/** Latest month the pickers allow (next month). */
export function maxMonth(): MonthKey {
  return shiftMonth(currentMonth(), 1)
}

/** Search params + a patch-style updater (null/'' removes a key). Replaces history. */
export function useSearchState() {
  const [params, setParams] = useSearchParams()
  const update = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return [params, update] as const
}

export function readMonth(params: URLSearchParams, allowAll = false): MonthParam {
  const raw = params.get('month')
  if (allowAll && raw === 'all') return 'all'
  if (raw && MONTH_RE.test(raw) && raw <= maxMonth()) return raw
  return currentMonth()
}

/** Value to store in `?month=` (the current month is the default, so it's omitted). */
export function monthParamValue(m: MonthParam): string | null {
  return m === currentMonth() ? null : m
}

export function readScope(params: URLSearchParams): ScopeFilter {
  const raw = params.get('scope')
  return raw === 'personal' || raw === 'business' ? raw : 'all'
}

/** End month for a "last N months" window so that the selected month stays visible. */
export function seriesEnd(month: MonthKey, count = 6): MonthKey {
  const cur = currentMonth()
  if (month >= cur) return month
  if (month >= shiftMonth(cur, -(count - 1))) return cur
  return month
}

// ───────────────────────── Lookups ─────────────────────────

export const UNCATEGORIZED: FinanceCategory = {
  id: '',
  name: 'Uncategorized',
  type: 'expense',
  color: 'slate',
  icon: 'package',
}

export function useCategoryMap(): Map<ID, FinanceCategory> {
  const cats = useStore((s) => s.financeCategories)
  return useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
}

export function useMethodMap(): Map<ID, PaymentMethod> {
  const methods = useStore((s) => s.paymentMethods)
  return useMemo(() => new Map(methods.map((m) => [m.id, m])), [methods])
}

export const RECURRENCE_LABELS: Record<PaymentRecurrence, string> = {
  none: 'One-time',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

// ───────────────────────── Numbers ─────────────────────────

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

/** Like useMoney(), but referentially stable (safe as a prop of memoized rows). */
export function useStableMoney() {
  const currency = useStore((s) => s.settings.currency)
  return useCallback((amount: number, opts?: MoneyOpts) => formatMoney(amount, currency, opts), [currency])
}

const compactCache = new Map<string, Intl.NumberFormat>()

function compactFormatter(currency: string): Intl.NumberFormat {
  let f = compactCache.get(currency)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
      })
    } catch {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
      })
    }
    compactCache.set(currency, f)
  }
  return f
}

/** Always-compact money formatter for chart ticks ($1.2K). */
export function useCompactMoney() {
  const currency = useStore((s) => s.settings.currency)
  return useCallback((n: number) => compactFormatter(currency).format(n), [currency])
}

export function sortTxDesc(a: Transaction, b: Transaction): number {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt
}

// ───────────────────────── Actions ─────────────────────────

/** Log a planned payment as an expense, with an Undo that fully restores it. */
export function markPaidWithUndo(id: ID) {
  const s = useStore.getState()
  const before = s.plannedPayments.find((p) => p.id === id)
  if (!before) return
  const prev = { nextDue: before.nextDue, active: before.active, lastPaid: before.lastPaid }
  const tx = s.markPaymentPaid(id)
  if (!tx) return
  toast('Logged as expense', {
    action: {
      label: 'Undo',
      onClick: () => {
        const st = useStore.getState()
        st.remove('transactions', tx.id)
        st.patch('plannedPayments', id, prev)
      },
    },
  })
}

// ───────────────────────── CSV ─────────────────────────

function csvCell(v: string | number | undefined): string {
  if (v === undefined || v === null) return ''
  let s = String(v)
  // Neutralise spreadsheet formula injection for text cells.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCSV(filename: string, rows: (string | number | undefined)[][]) {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' })
  // iPhone: share sheet (Save to Files / Mail / AirDrop); elsewhere a download.
  void saveFile(blob, filename)
}
