// Small building blocks shared by the Tasks and Notes pages.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ListTodo, MoreHorizontal, NotebookPen, Search, X, type LucideIcon } from 'lucide-react'
import { cn, IconButton, type MenuItem } from '@/components/ui'

// ───────────────────────── Tasks | Notes switch ─────────────────────────

const SECTIONS = [
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
]

/** Segmented-style links between /tasks and /notes (phones reach both from one tab). */
export function SectionSwitch() {
  return (
    <nav aria-label="Tasks and notes" className="inline-flex rounded-xl bg-surface-2 p-1">
      {SECTIONS.map((s) => (
        <NavLink
          key={s.to}
          to={s.to}
          className={({ isActive }) =>
            cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium transition-all',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              isActive ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )
          }
        >
          <s.icon size={15} />
          {s.label}
        </NavLink>
      ))}
    </nav>
  )
}

// ───────────────────────── Search ─────────────────────────

export function SearchBox({
  value, onChange, placeholder = 'Search', className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation()
            onChange('')
          }
        }}
        className={cn(
          'h-10 w-full appearance-none rounded-xl border border-line bg-surface pl-9 pr-9 text-base text-ink shadow-card outline-none transition',
          'placeholder:text-muted focus:border-accent focus:ring-3 focus:ring-accent/15 sm:text-sm',
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}

/** Horizontally scrolling row on phones (bleeds to the screen edge), wrapping on larger screens. */
export function ScrollRow({ children, className, wrap = true }: { children: ReactNode; className?: string; wrap?: boolean }) {
  return (
    <div
      className={cn(
        '-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6',
        wrap && 'lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0',
        !wrap && 'lg:mx-0 lg:px-0',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ───────────────────────── Floating menu ─────────────────────────

const MENU_WIDTH = 200

/**
 * Same look as the UI-kit Menu, but rendered in a portal with fixed positioning
 * (flips upward near the bottom of the screen). Needed inside horizontally
 * scrolling containers (kanban) and CSS multi-column layouts (masonry), where
 * an absolutely-positioned dropdown would be clipped or split across columns.
 */
export function FloatingMenu({
  items, label = 'More actions', icon = MoreHorizontal,
}: {
  items: MenuItem[]
  label?: string
  icon?: LucideIcon
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const open = anchor !== null

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setAnchor(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAnchor(null)
        btnRef.current?.focus()
      }
    }
    const onMove = () => setAnchor(null)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  useLayoutEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
  }, [open])

  let style: CSSProperties | undefined
  if (anchor) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const estimate = items.length * 40 + 10
    const up = anchor.bottom + estimate + 12 > vh && anchor.top - estimate - 12 > 0
    style = {
      position: 'fixed',
      width: MENU_WIDTH,
      left: Math.max(8, Math.min(anchor.right - MENU_WIDTH, vw - MENU_WIDTH - 8)),
      ...(up ? { bottom: vh - anchor.top + 4 } : { top: anchor.bottom + 4 }),
    }
  }

  return (
    <>
      <IconButton
        ref={btnRef}
        icon={icon}
        label={label}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setAnchor(open ? null : e.currentTarget.getBoundingClientRect())
        }}
      />
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={style}
            onClick={(e) => e.stopPropagation()}
            className="anim-pop z-40 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop"
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setAnchor(null)
                  it.onClick()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:py-2',
                  it.danger ? 'text-bad' : 'text-ink',
                )}
              >
                {it.icon && <it.icon size={16} className={it.danger ? '' : 'text-muted'} />}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

// ───────────────────────── Groups ─────────────────────────

/** Heading row above a card of rows. */
export function GroupHeader({
  title, count, icon: Icon, tone, hint, action, collapsible, open, onToggle,
}: {
  title: ReactNode
  count?: ReactNode
  icon?: LucideIcon
  tone?: 'bad' | 'good'
  hint?: ReactNode
  action?: ReactNode
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
}) {
  const label = (
    <>
      {Icon && <Icon size={15} className={tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : 'text-muted'} />}
      <span className={cn('font-semibold', tone === 'bad' ? 'text-bad' : 'text-ink')}>{title}</span>
      {count !== undefined && <span className="tabular font-medium text-muted">{count}</span>}
      {hint && <span className="truncate font-normal text-muted">· {hint}</span>}
    </>
  )
  return (
    <div className="mb-2 flex min-h-8 items-center justify-between gap-2 px-1">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="-mx-1 flex min-h-10 min-w-0 items-center gap-2 rounded-lg px-1 text-[13.5px] hover:text-ink"
        >
          <ChevronDown size={16} className={cn('shrink-0 text-muted transition-transform', !open && '-rotate-90')} />
          {label}
        </button>
      ) : (
        <h2 className="flex min-w-0 items-center gap-2 text-[13.5px]">{label}</h2>
      )}
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  )
}

/** Card that stacks rows with hairline dividers (no overflow clipping so row menus can escape). */
export function RowList({ children, className, emphasis }: { children: ReactNode; className?: string; emphasis?: 'bad' }) {
  return (
    <div
      className={cn(
        'divide-y divide-line rounded-2xl border bg-surface shadow-card',
        emphasis === 'bad' ? 'border-bad/40 ring-3 ring-bad/10' : 'border-line',
        className,
      )}
    >
      {children}
    </div>
  )
}
