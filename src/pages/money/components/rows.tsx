import { memo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge, Button, CategoryIcon, cn, IconButton } from '@/components/ui'
import { relativeDay, relativeDistance, todayISO } from '@/lib/dates'
import type { CategoryTotal } from '@/lib/finance'
import { useMoney } from '@/lib/format'
import { colorHex } from '@/lib/icons'
import { openEditor } from '@/lib/ui'
import type { FinanceCategory, ID, ISODate, PaymentMethod, PlannedPayment, Transaction } from '@/lib/types'
import { markPaidWithUndo, RECURRENCE_LABELS, UNCATEGORIZED, type MonthParam } from './lib'
import type { Money } from './charts'

// ───────────────────────── Category breakdown ─────────────────────────

/** Ranked horizontal bar list of category totals (bars scale to the largest row). */
export function BreakdownList({
  rows, total, categories, onPick, limit = 6, empty,
}: {
  rows: CategoryTotal[]
  total: number
  categories: Map<ID, FinanceCategory>
  onPick?: (categoryId: ID) => void
  limit?: number
  empty?: ReactNode
}) {
  const money = useMoney()
  const [expanded, setExpanded] = useState(false)
  if (!rows.length) return <>{empty}</>
  const max = rows[0]?.total || 1
  const shown = expanded ? rows : rows.slice(0, limit)
  return (
    <div className="-mx-2 flex flex-col">
      {shown.map((r) => {
        const c = categories.get(r.categoryId) ?? UNCATEGORIZED
        const share = total > 0 ? r.total / total : 0
        return (
          <button
            key={r.categoryId}
            type="button"
            onClick={() => onPick?.(r.categoryId)}
            className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
          >
            <CategoryIcon icon={c.icon} color={c.color} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                <span className="tabular shrink-0 text-sm font-medium text-ink">{money(r.total)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(2, (r.total / max) * 100)}%`, background: colorHex(c.color) }}
                  />
                </div>
                <span className="tabular w-9 shrink-0 text-right text-xs text-muted">{Math.round(share * 100)}%</span>
              </div>
            </div>
          </button>
        )
      })}
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 flex h-10 items-center justify-center gap-1 rounded-xl text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          {expanded ? 'Show less' : `Show ${rows.length - limit} more`}
          <ChevronDown size={15} className={cn('transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}

// ───────────────────────── Transaction row ─────────────────────────

export const TxRow = memo(function TxRow({
  tx, category, method, money, showDate,
}: {
  tx: Transaction
  category?: FinanceCategory
  method?: PaymentMethod
  money: Money
  showDate?: boolean
}) {
  const c = category ?? UNCATEGORIZED
  const sub = [showDate ? relativeDay(tx.date) : null, c.name, method?.name, tx.note]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      onClick={() => openEditor({ kind: 'transaction', id: tx.id })}
      className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-4"
    >
      <CategoryIcon icon={c.icon} color={c.color} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">{tx.payee || c.name}</span>
          {tx.scope === 'business' && <Badge tone="accent">Business</Badge>}
        </div>
        <p className="truncate text-[13px] text-muted">{sub}</p>
      </div>
      <span
        className={cn(
          'tabular shrink-0 text-sm font-semibold',
          tx.type === 'income' ? 'text-good' : 'text-ink',
        )}
      >
        {tx.type === 'income' ? money(tx.amount, { sign: true }) : money(tx.amount)}
      </span>
    </button>
  )
})

// ───────────────────────── Planned payment row ─────────────────────────

export function DueText({ date, active = true }: { date: ISODate; active?: boolean }) {
  const overdue = active && date < todayISO()
  const rel = relativeDistance(date)
  const day = relativeDay(date)
  return (
    <span className={cn('min-w-0 max-w-full truncate', overdue ? 'text-bad' : 'text-muted')}>
      {overdue ? `Overdue · ${rel}` : day.toLowerCase() === rel ? day : `${day} · ${rel}`}
    </span>
  )
}

export function PaymentRow({
  payment, category, date, actions, onOpen, money, dueLabel,
}: {
  payment: PlannedPayment
  category?: FinanceCategory
  /** Due date to show (defaults to nextDue). */
  date?: ISODate
  actions?: ReactNode
  onOpen?: () => void
  money: Money
  /** Override the due line (e.g. "Renews …"). */
  dueLabel?: ReactNode
}) {
  const c = category ?? UNCATEGORIZED
  const d = date ?? payment.nextDue
  return (
    <div className="@container flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <CategoryIcon icon={c.icon} color={c.color} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className={cn('truncate text-sm font-medium', payment.active ? 'text-ink' : 'text-muted')}>
              {payment.name}
            </span>
            <span className="tabular shrink-0 text-sm font-semibold text-ink">{money(payment.amount)}</span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
            <Badge>{RECURRENCE_LABELS[payment.recurrence]}</Badge>
            {payment.isSubscription && <Badge tone="accent">Subscription</Badge>}
            {dueLabel ?? <DueText date={d} active={payment.active} />}
          </div>
        </div>
      </button>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}

/** Link helper for transactions filtered by month/category/scope. */
export function txLink(opts: { month?: MonthParam; category?: ID; scope?: string; type?: string }) {
  const q = new URLSearchParams()
  if (opts.month) q.set('month', opts.month)
  if (opts.category) q.set('category', opts.category)
  if (opts.scope && opts.scope !== 'all') q.set('scope', opts.scope)
  if (opts.type) q.set('type', opts.type)
  const s = q.toString()
  return `/money/transactions${s ? `?${s}` : ''}`
}

/** Icon button in narrow containers, labelled button in wide ones (needs an @container parent). */
export function MarkPaidButton({ id }: { id: ID }) {
  return (
    <>
      <IconButton
        icon={Check}
        label="Mark paid"
        variant="secondary"
        className="@md:hidden"
        onClick={() => markPaidWithUndo(id)}
      />
      <Button icon={Check} className="hidden @md:inline-flex" onClick={() => markPaidWithUndo(id)}>
        Mark paid
      </Button>
    </>
  )
}

/** Small "See all ›" style link for card headers. */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-my-2 -mr-2 inline-flex h-10 items-center gap-0.5 rounded-lg px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft"
    >
      {children}
      <ChevronRight size={15} />
    </Link>
  )
}
