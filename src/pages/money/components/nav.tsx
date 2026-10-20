import type { ReactNode } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Chip, cn, IconButton, Segmented } from '@/components/ui'
import { currentMonth, fmtMonth, shiftMonth } from '@/lib/dates'
import type { ScopeFilter } from '@/lib/finance'
import { maxMonth, MONTH_RE, type MonthParam } from './lib'

const TABS = [
  { to: '/money', label: 'Overview', end: true },
  { to: '/money/transactions', label: 'Transactions' },
  { to: '/money/budget', label: 'Budget' },
  { to: '/money/goals', label: 'Goals' },
  { to: '/money/payments', label: 'Payments' },
]

/**
 * Section tabs for phones and tablets (the desktop sidebar carries the same links).
 * Keeps the selected `?month=` when switching between sections.
 */
export function MoneyTabs({ className }: { className?: string }) {
  const [params] = useSearchParams()
  const m = params.get('month')
  const search = m && MONTH_RE.test(m) ? `?month=${m}` : ''
  return (
    <nav
      aria-label="Money sections"
      className={cn('-mx-4 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:hidden', className)}
    >
      <div className="flex w-max min-w-full gap-1 border-b border-line">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={{ pathname: t.to, search }}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'relative flex h-10 shrink-0 items-center px-3 text-sm font-medium transition-colors',
                isActive
                  ? 'text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent'
                  : 'text-muted hover:text-ink',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Prev / month label / next. Can't go past next month. Tapping the label returns to this month. */
export function MonthPicker({
  value, onChange, allowAll = false,
}: {
  value: MonthParam
  onChange: (m: MonthParam) => void
  allowAll?: boolean
}) {
  const cur = currentMonth()
  const isAll = value === 'all'
  const month = isAll ? cur : value
  const atMax = !isAll && month >= maxMonth()
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-xl border border-line bg-surface shadow-card">
        <IconButton
          icon={ChevronLeft}
          label="Previous month"
          onClick={() => onChange(isAll ? cur : shiftMonth(month, -1))}
        />
        <button
          type="button"
          onClick={() => onChange(cur)}
          title={isAll || month !== cur ? 'Go to this month' : undefined}
          className="h-10 min-w-[8.5rem] rounded-lg px-1 text-center text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          {isAll ? 'All time' : fmtMonth(month)}
        </button>
        <IconButton
          icon={ChevronRight}
          label="Next month"
          disabled={atMax}
          onClick={() => onChange(isAll ? cur : shiftMonth(month, 1))}
        />
      </div>
      {allowAll && (
        <Chip active={isAll} onClick={() => onChange(isAll ? cur : 'all')}>
          All time
        </Chip>
      )}
    </div>
  )
}

export function ScopeToggle({ value, onChange, block, className }: {
  value: ScopeFilter
  onChange: (v: ScopeFilter) => void
  block?: boolean
  className?: string
}) {
  return (
    <Segmented<ScopeFilter>
      block={block}
      className={className}
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'All' },
        { value: 'personal', label: 'Personal' },
        { value: 'business', label: 'Business' },
      ]}
    />
  )
}

/** Tabs + a wrapping toolbar row; goes inside PageHeader's children. */
export function MoneyToolbar({ children }: { children?: ReactNode }) {
  return (
    <>
      <MoneyTabs className={children ? 'mb-4' : undefined} />
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </>
  )
}
