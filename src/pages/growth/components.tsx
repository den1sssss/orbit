// Building blocks shared by the Goals & Habits screens.
import { useMemo, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, Flame, Minus, Pencil, Plus, Trash2,
} from 'lucide-react'
import { cn, IconButton, Menu, type MenuItem } from '@/components/ui'
import { addDaysISO, fmt, fmtTime } from '@/lib/dates'
import { amountOn, describeSchedule, isScheduled, streak } from '@/lib/habits'
import { colorHex, LIFE_AREA_ICONS, tint } from '@/lib/icons'
import { LIFE_AREA_COLORS } from '@/lib/defaults'
import type { ColorKey, Habit, ISODate, LifeArea } from '@/lib/types'
import { habitTarget, pctText, recentRate, STARTER_HABITS, unitLabel, type WeekStart } from './lib'
import {
  addStarterHabit, archiveHabit, deleteHabit, openHabitDetail, openHabitEditor, toggleHabitDay,
} from './state'

// ───────────────────────── Navigation ─────────────────────────

const TABS = [
  { to: '/growth', label: 'Today', end: true },
  { to: '/growth/habits', label: 'Habits' },
  { to: '/growth/goals', label: 'Goals' },
  { to: '/growth/plan', label: 'Plan' },
  { to: '/growth/review', label: 'Review' },
]

export function GrowthTabs() {
  return (
    <nav aria-label="Goals & Habits sections" className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <div className="flex w-max min-w-full gap-1 border-b border-line">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
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

/** Horizontally scrolling row (filter chips) that bleeds to the screen edge on phones. */
export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0', className)}>
      <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">{children}</div>
    </div>
  )
}

// ───────────────────────── Glyphs ─────────────────────────

export function HabitGlyph({ habit, size = 40 }: { habit: Pick<Habit, 'emoji' | 'name' | 'color'>; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: tint(habit.color, 0.16) }}
    >
      <HabitMark habit={habit} size={size} />
    </span>
  )
}

/** Emoji, or the first letter in the habit color. */
export function HabitMark({ habit, size = 40 }: { habit: Pick<Habit, 'emoji' | 'name' | 'color'>; size?: number }) {
  if (habit.emoji) return <span style={{ fontSize: Math.round(size * 0.5), lineHeight: 1 }}>{habit.emoji}</span>
  return (
    <span className="font-semibold" style={{ color: colorHex(habit.color), fontSize: Math.round(size * 0.42), lineHeight: 1 }}>
      {habit.name.trim().charAt(0).toUpperCase() || '•'}
    </span>
  )
}

export function AreaTile({ area, size = 40 }: { area: LifeArea; size?: number }) {
  const Icon = LIFE_AREA_ICONS[area]
  const color = LIFE_AREA_COLORS[area]
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: tint(color, 0.15), color: colorHex(color) }}
    >
      <Icon size={Math.round(size * 0.48)} strokeWidth={2} />
    </span>
  )
}

/** Circular meter around a glyph. */
export function ProgressRing({
  value, color, size = 48, stroke = 3, children,
}: {
  value: number
  color: ColorKey
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, isFinite(value) ? value : 0))
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tint(color, 0.2)} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorHex(color)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
          style={{ opacity: v > 0 ? 1 : 0 }}
        />
      </svg>
      {children}
    </span>
  )
}

export function StreakBadge({ count, unit }: { count: number; unit: 'day' | 'week' }) {
  if (count < 2) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-semibold tabular"
      style={{ color: colorHex('orange') }}
      title={`${count}-${unit} streak`}
      aria-label={`${count} ${unit} streak`}
    >
      <Flame size={13} className="fill-current" strokeWidth={2} />
      {count}
      {unit === 'week' ? 'w' : 'd'}
    </span>
  )
}

// ───────────────────────── Inputs ─────────────────────────

export function Stepper({
  value, onChange, min = 1, max = 99, label, suffix,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  label: string
  suffix?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <IconButton icon={Minus} label={`Fewer ${label}`} variant="secondary" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} />
      <span className="min-w-8 text-center text-base font-semibold tabular text-ink" aria-live="polite">{value}</span>
      <IconButton icon={Plus} label={`More ${label}`} variant="secondary" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} />
      {suffix && <span className="text-sm text-muted">{suffix}</span>}
    </div>
  )
}

// ───────────────────────── Habits ─────────────────────────

/** One-tap starter habits for empty states. */
export function StarterHabits() {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-ink-2">Or start with one tap</p>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        {STARTER_HABITS.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => addStarterHabit(s)}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface p-2.5 text-left transition-[border-color,background-color,transform] hover:border-line-strong hover:bg-surface-2 motion-safe:active:scale-[0.98]"
          >
            <HabitGlyph habit={s} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">{s.name}</span>
              <span className="block truncate text-xs text-muted">{s.hint}</span>
            </span>
            <Plus size={16} className="ml-auto shrink-0 text-muted" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function habitSubtitle(h: Habit): string {
  const parts = [describeSchedule(h)]
  const target = habitTarget(h)
  if (target > 1) parts.push(`${target} ${unitLabel(h)}/day`)
  if (h.reminderTime) parts.push(fmtTime(h.reminderTime))
  return parts.join(' · ')
}

/** Last 7 days ending today; each cell toggles that day (backfill). */
export function WeekStrip({ habit, today, className }: { habit: Habit; today: ISODate; className?: string }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(today, i - 6)), [today])
  const target = habitTarget(habit)
  const hex = colorHex(habit.color)
  const unit = unitLabel(habit)
  return (
    <div className={cn('grid grid-cols-7 gap-1.5', className)} role="group" aria-label={`${habit.name}, last 7 days`}>
      {days.map((d) => {
        const amt = amountOn(habit, d)
        const done = amt >= target
        const ratio = Math.min(1, amt / target)
        const scheduled = isScheduled(habit, d)
        const isToday = d === today
        const state = done ? 'done' : amt ? `${amt} of ${target} ${unit}` : scheduled ? 'not done' : 'not scheduled'
        return (
          <button
            key={d}
            type="button"
            aria-pressed={done}
            aria-label={`${isToday ? 'Today' : fmt(d, 'EEEE, MMM d')}: ${state}`}
            onClick={() => toggleHabitDay(habit, d)}
            className={cn(
              'flex h-11 min-w-0 flex-col items-center justify-center rounded-xl leading-tight transition-[background-color,opacity,transform] duration-200 motion-safe:active:scale-90',
              done ? 'text-white' : 'text-ink-2',
              !amt && 'bg-surface-2',
              !scheduled && !amt && 'opacity-45',
              isToday && 'ring-2 ring-inset ring-line-strong',
            )}
            style={done ? { background: hex } : amt ? { background: tint(habit.color, 0.14 + 0.36 * ratio) } : undefined}
          >
            <span className={cn('text-[10.5px] font-medium', done ? 'text-white/85' : 'text-muted')}>{fmt(d, 'EEEEE')}</span>
            <span className="text-[13px] font-semibold tabular">{fmt(d, 'd')}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Habit list row: glyph, name, schedule, streak, 30-day consistency, 7-day strip, menu. */
export function HabitRow({
  habit, today, wso, onMoveUp, onMoveDown,
}: {
  habit: Habit
  today: ISODate
  wso: WeekStart
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const s = useMemo(() => streak(habit, wso, today), [habit, wso, today])
  const rate = useMemo(() => recentRate(habit, today, wso), [habit, today, wso])
  const items: MenuItem[] = [{ label: 'Edit', icon: Pencil, onClick: () => openHabitEditor({ id: habit.id }) }]
  if (onMoveUp) items.push({ label: 'Move up', icon: ArrowUp, onClick: onMoveUp })
  if (onMoveDown) items.push({ label: 'Move down', icon: ArrowDown, onClick: onMoveDown })
  items.push(
    habit.archived
      ? { label: 'Restore', icon: ArchiveRestore, onClick: () => archiveHabit(habit, false) }
      : { label: 'Archive', icon: Archive, onClick: () => archiveHabit(habit, true) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteHabit(habit) },
  )
  return (
    <div className="p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => openHabitDetail(habit.id)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-accent"
        >
          <HabitGlyph habit={habit} size={40} />
          <span className="min-w-0">
            <span className={cn('block truncate text-[15px] font-medium', habit.archived ? 'text-ink-2' : 'text-ink')}>{habit.name}</span>
            <span className="block truncate text-[13px] text-muted">{habitSubtitle(habit)}</span>
          </span>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <StreakBadge count={s.count} unit={s.unit} />
          <span className="text-[13px] font-semibold tabular text-ink-2" title="Consistency, last 30 days">
            {pctText(rate?.rate)}
            <span className="ml-1 text-[11px] font-medium text-muted">30d</span>
          </span>
        </div>
        <Menu items={items} label={`Actions for ${habit.name}`} />
      </div>
      {!habit.archived && <WeekStrip habit={habit} today={today} className="mt-3" />}
    </div>
  )
}
