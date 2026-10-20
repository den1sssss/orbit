import {
  forwardRef, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Check, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { categoryIcon, colorHex, tint } from '@/lib/icons'
import { currencySymbol } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { ColorKey } from '@/lib/types'

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/**
 * `hidden` and `inline-flex` are both display utilities and `inline-flex` wins in the
 * generated CSS, so a caller's `hidden sm:inline-flex` would never hide. When the caller
 * passes `hidden`, leave the default display off and let their responsive class set it.
 */
function displayFor(className?: string) {
  return className && /(^|\s)hidden(\s|$)/.test(className) ? '' : 'inline-flex'
}

// ───────────────────────── Buttons ─────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  block?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 shadow-card',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-bad text-white hover:opacity-90',
  soft: 'bg-accent-soft text-accent-text hover:brightness-95 dark:hover:brightness-125',
}
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        displayFor(className), 'select-none items-center justify-center whitespace-nowrap font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50',
        VARIANTS[variant], SIZES[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 15 : 17} strokeWidth={2} />}
      {children}
      {IconRight && <IconRight size={size === 'sm' ? 15 : 17} strokeWidth={2} />}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'secondary' | 'primary'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', variant = 'ghost', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        displayFor(className), 'shrink-0 items-center justify-center rounded-xl transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'secondary' && 'border border-line bg-surface text-ink-2 shadow-card hover:bg-surface-2 hover:text-ink',
        variant === 'primary' && 'bg-accent text-accent-ink hover:bg-accent-hover',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 16 : 19} strokeWidth={2} />
    </button>
  )
})

// ───────────────────────── Surfaces ─────────────────────────

export function Card({
  className, children, onClick, as = 'div', padded = true,
}: {
  className?: string
  children: ReactNode
  onClick?: () => void
  as?: 'div' | 'section' | 'button'
  padded?: boolean
}) {
  const Tag = as
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-line bg-surface shadow-card',
        padded && 'p-4 sm:p-5',
        onClick && 'cursor-pointer text-left transition-colors hover:border-line-strong',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title, icon: Icon, action, subtitle,
}: { title: ReactNode; icon?: LucideIcon; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          {Icon && <Icon size={17} className="text-muted" />}
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between first:mt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  )
}

// ───────────────────────── Form controls ─────────────────────────

// 16px on mobile prevents iOS zoom-on-focus.
const fieldBase =
  'w-full rounded-xl border border-line bg-surface text-base text-ink placeholder:text-muted outline-none transition ' +
  'focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60 sm:text-sm'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref,
) {
  return <input ref={ref} className={cn(fieldBase, 'h-10 px-3', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-24 px-3 py-2.5 leading-relaxed', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest }, ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        'h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-8',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2383838f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
})

export function Field({
  label, hint, error, children, className, htmlFor,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-bad">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

/** Amount input with the user's currency symbol. Value is the raw string. */
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { big?: boolean }>(
  function MoneyInput({ className, big, ...rest }, ref) {
    const currency = useStore((s) => s.settings.currency)
    return (
      <div className="relative">
        <span
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted',
            big ? 'text-xl' : 'text-sm',
          )}
        >
          {currencySymbol(currency)}
        </span>
        <input
          ref={ref}
          inputMode="decimal"
          autoComplete="off"
          className={cn(fieldBase, 'tabular', big ? 'h-14 pl-10 text-2xl font-semibold sm:text-2xl' : 'h-10 pl-9 pr-3', className)}
          {...rest}
        />
      </div>
    )
  },
)

export function Toggle({
  checked, onChange, label, description, disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label className={cn('flex items-center justify-between gap-4', disabled ? 'opacity-50' : 'cursor-pointer')}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-ink">{label}</span>}
          {description && <span className="block text-[13px] text-muted">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}

/** Round (tasks) or square checkbox. */
export function Checkbox({
  checked, onChange, round = false, color, label, size = 20,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  round?: boolean
  /** Hex ring color for unchecked state (e.g. priority). */
  color?: string
  label: string
  size?: number
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      style={{ width: size, height: size, borderColor: checked ? undefined : color }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border-[1.5px] transition-all',
        round ? 'rounded-full' : 'rounded-md',
        checked ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface hover:border-accent',
      )}
    >
      {checked && <Check size={size - 7} strokeWidth={3} />}
    </button>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: LucideIcon
}

export function Segmented<T extends string>({
  options, value, onChange, size = 'md', className, block,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
  block?: boolean
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex rounded-xl bg-surface-2 p-1',
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              block && 'flex-1',
              active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {Icon && <Icon size={14} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Selectable pill used for filters. */
export function Chip({
  active, onClick, children, color, icon: Icon, count,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  color?: ColorKey
  icon?: LucideIcon
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors sm:h-8',
        active
          ? 'border-transparent bg-ink text-bg'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
      )}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: colorHex(color) }} />}
      {Icon && <Icon size={14} />}
      {children}
      {count !== undefined && (
        <span className={cn('tabular text-xs', active ? 'opacity-70' : 'text-muted')}>{count}</span>
      )}
    </button>
  )
}

type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad'
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  accent: 'bg-accent-soft text-accent-text',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
}

export function Badge({
  tone = 'neutral', color, children, className, icon: Icon,
}: {
  tone?: Tone
  /** Identity color (overrides tone) */
  color?: ColorKey
  children: ReactNode
  className?: string
  icon?: LucideIcon
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-semibold',
        !color && TONES[tone],
        className,
      )}
      style={color ? { background: tint(color, 0.14), color: 'var(--ink-2)' } : undefined}
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorHex(color) }} />}
      {Icon && <Icon size={11} strokeWidth={2.5} />}
      {children}
    </span>
  )
}

export function ColorDot({ color, size = 8 }: { color?: ColorKey; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: colorHex(color) }}
    />
  )
}

/** Rounded square with a category icon on a tinted background. */
export function CategoryIcon({ icon, color, size = 36 }: { icon?: string; color?: ColorKey; size?: number }) {
  const Icon = categoryIcon(icon)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: tint(color, 0.15), color: colorHex(color) }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2} />
    </span>
  )
}

/**
 * Meter: fill carries state; the track is a lighter step of the same hue.
 * `tone` picks status colors; `color` uses an identity color.
 */
export function Progress({
  value, tone = 'accent', color, height = 6, className, label,
}: {
  /** 0..1 (values above 1 are clamped for drawing) */
  value: number
  tone?: 'accent' | 'good' | 'warn' | 'bad'
  color?: ColorKey
  height?: number
  className?: string
  label?: string
}) {
  const fill = color ? colorHex(color) : `var(--${tone === 'accent' ? 'accent' : tone})`
  const clamped = Math.max(0, Math.min(1, isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={cn('w-full overflow-hidden rounded-full', className)}
      style={{ height, background: `color-mix(in srgb, ${fill} 16%, transparent)` }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clamped * 100}%`, background: fill }}
      />
    </div>
  )
}

export function EmptyState({
  icon: Icon, title, description, action, compact,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-6' : 'py-14')}>
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-muted">
          <Icon size={21} />
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-xs text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** KPI tile: label · value · optional delta/hint. */
export function Stat({
  label, value, hint, tone, className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: 'good' | 'bad' | 'neutral'
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate text-[13px] text-muted">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl',
          tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
    </div>
  )
}

// ───────────────────────── Menu ─────────────────────────

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
  danger?: boolean
}

/** "⋯" button with a small dropdown of actions. */
export function Menu({ items, label = 'More actions', align = 'right' }: { items: MenuItem[]; label?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <IconButton icon={MoreHorizontal} label={label} size="sm" onClick={() => setOpen((o) => !o)} />
      {open && (
        <div
          className={cn(
            'anim-pop absolute z-40 mt-1 min-w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2',
                it.danger ? 'text-bad' : 'text-ink',
              )}
            >
              {it.icon && <it.icon size={16} className={it.danger ? '' : 'text-muted'} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Color swatch picker for identity colors. */
export function ColorPicker({ value, onChange }: { value: ColorKey; onChange: (c: ColorKey) => void }) {
  const keys: ColorKey[] = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink']
  return (
    <div className="flex flex-wrap gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={k}
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            'h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition',
            value === k ? 'ring-2 ring-ink' : 'hover:scale-110',
          )}
          style={{ background: colorHex(k) }}
        />
      ))}
    </div>
  )
}
