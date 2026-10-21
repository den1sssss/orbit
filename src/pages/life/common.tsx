import { useEffect, type ReactNode } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn, PageHeader } from '@/components/ui'
import { colorHex, tint } from '@/lib/icons'
import type { ColorKey } from '@/lib/types'

const TABS = [
  { to: '/life', label: 'Overview', end: true },
  { to: '/life/lists', label: 'Lists' },
  { to: '/life/dates', label: 'Dates' },
  { to: '/life/vault', label: 'Vault' },
]

/** Section tabs; scroll sideways on narrow phones instead of wrapping. */
export function LifeTabs() {
  return (
    <nav aria-label="Life sections" className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <div className="flex w-max min-w-full gap-1 border-b border-line">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'relative flex h-11 shrink-0 items-center px-3 text-sm font-medium transition-colors',
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

export function LifeHeader({ subtitle, actions }: { subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <PageHeader title="Life" subtitle={subtitle} actions={actions}>
      <LifeTabs />
    </PageHeader>
  )
}

/** Wrap a kit `Menu` to give its trigger a 40px tap target. */
export const BIG_MENU = '[&>div>button]:h-10 [&>div>button]:w-10'

/** Rounded square with an icon on a tinted identity color. */
export function IconTile({ icon: Icon, color, size = 40 }: { icon: LucideIcon; color: ColorKey; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: tint(color, 0.15), color: colorHex(color) }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2} />
    </span>
  )
}

/** Grid of big selectable tiles (icon + label) — easier to hit than a select on a phone. */
export function KindPicker<T extends string>({
  options, value, onChange, cols = 4,
}: {
  options: { value: T; label: string; icon: LucideIcon }[]
  value: T
  onChange: (v: T) => void
  cols?: 3 | 4
}) {
  return (
    <div role="radiogroup" className={cn('grid gap-2', cols === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[12px] font-medium transition-colors',
              active
                ? 'border-accent bg-accent-soft text-accent-text'
                : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
            )}
          >
            <o.icon size={19} />
            <span className="max-w-full truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Small round option pills (reminder offsets etc.). */
export function PillChoice<T extends string | number>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-10 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
              active
                ? 'border-transparent bg-ink text-bg'
                : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Run `onValue` once when a query param is present (e.g. `?new=1`, `?open=<id>`),
 * then drop the param so a reload or back navigation doesn't reopen it.
 */
export function useQueryAction(name: string, onValue: (value: string) => void) {
  const [params, setParams] = useSearchParams()
  const value = params.get(name)
  useEffect(() => {
    if (!value) return
    onValue(value)
    const next = new URLSearchParams(params)
    next.delete(name)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
}
