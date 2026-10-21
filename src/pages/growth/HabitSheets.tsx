// Habit create/edit sheet and the habit detail sheet (heatmap, streaks, consistency).
import { useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Bell, Pencil, Trash2 } from 'lucide-react'
import {
  Badge, Button, cn, ColorPicker, Field, IconButton, Input, Progress, Segmented, Select, Sheet, Toggle,
} from '@/components/ui'
import { addDaysISO, fmt, fmtTime, weekRange } from '@/lib/dates'
import { amountOn, bestStreak, describeSchedule, isScheduled, streak } from '@/lib/habits'
import { LIFE_AREA_COLORS, LIFE_AREA_LABELS, LIFE_AREAS } from '@/lib/defaults'
import { colorHex } from '@/lib/icons'
import { notificationsSupported, requestNotifications } from '@/lib/reminders'
import { makeHabit, useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import type { ColorKey, Habit, HabitSchedule, ID, ISODate, LifeArea } from '@/lib/types'
import { HabitGlyph, HabitMark, Stepper, WeekStrip } from './components'
import {
  checkIns, HABIT_EMOJI, habitTarget, isoDateOf, keptRate, pctText, unitLabel, useToday, WEEKDAY_SHORT,
  weekdayOrder, type WeekStart,
} from './lib'
import {
  archiveHabit, closeHabitDetail, deleteHabit, nextHabitOrder, openHabitEditor, type HabitEditorReq,
} from './state'

// ───────────────────────── Editor ─────────────────────────

type ScheduleKind = HabitSchedule['kind']

interface HabitForm {
  name: string
  emoji?: string
  color: ColorKey
  area: LifeArea
  kind: ScheduleKind
  days: number[]
  times: number
  target: number
  unit: string
  reminderOn: boolean
  reminderTime: string
  archived: boolean
}

function formFrom(h: Partial<Habit> | undefined): HabitForm {
  const s = h?.schedule
  return {
    name: h?.name ?? '',
    emoji: h?.emoji,
    color: h?.color ?? 'green',
    area: h?.area ?? 'health',
    kind: s?.kind ?? 'daily',
    days: s?.kind === 'weekdays' ? [...s.days] : [1, 2, 3, 4, 5],
    times: s?.kind === 'weekly' ? s.times : 3,
    target: Math.max(1, h?.target ?? 1),
    unit: h?.unit ?? '',
    reminderOn: !!h?.reminderTime,
    reminderTime: h?.reminderTime ?? '08:00',
    archived: !!h?.archived,
  }
}

export function HabitEditorSheet({ req, onClose }: { req: HabitEditorReq; onClose: () => void }) {
  const habits = useStore((s) => s.habits)
  const wso = useStore((s) => s.settings.weekStartsOn)
  const existing = useMemo(() => (req.id ? habits.find((h) => h.id === req.id) : undefined), [habits, req.id])
  const [f, setF] = useState<HabitForm>(() => formFrom(existing ?? req.initial))
  const [error, setError] = useState<string>()
  const set = (p: Partial<HabitForm>) => setF((prev) => ({ ...prev, ...p }))

  // Deleted elsewhere while open.
  useEffect(() => {
    if (req.id && !existing) onClose()
  }, [req.id, existing, onClose])

  const save = () => {
    const name = f.name.trim()
    if (!name) return setError('Give your habit a name')
    if (f.kind === 'weekdays' && !f.days.length) return setError('Pick at least one day')
    const schedule: HabitSchedule =
      f.kind === 'daily' ? { kind: 'daily' }
        : f.kind === 'weekdays' ? { kind: 'weekdays', days: [...f.days].sort() }
          : { kind: 'weekly', times: f.times }
    const data: Partial<Habit> = {
      name,
      emoji: f.emoji,
      color: f.color,
      area: f.area,
      schedule,
      target: f.target,
      unit: f.target > 1 ? f.unit.trim() || undefined : undefined,
      reminderTime: f.reminderOn && f.reminderTime ? f.reminderTime : undefined,
      archived: f.archived || undefined,
    }
    const st = useStore.getState()
    if (existing) {
      st.patch('habits', existing.id, data)
      toast('Habit updated')
    } else {
      st.insert('habits', makeHabit({ ...data, name, order: nextHabitOrder() }))
      toast(`Added “${name}”`)
    }
    onClose()
  }

  const order = weekdayOrder(wso)
  const toggleDay = (d: number) =>
    set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? 'Edit habit' : 'New habit'}
      footer={
        <>
          {existing && (
            <IconButton
              icon={Trash2}
              label="Delete habit"
              className="text-bad hover:text-bad"
              onClick={() => {
                deleteHabit(existing)
                onClose()
              }}
            />
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Save' : 'Add habit'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" error={error && !f.name.trim() ? error : undefined}>
          <div className="flex items-center gap-2.5">
            <HabitGlyph habit={{ ...f, name: f.name || '?' }} size={40} />
            <Input
              value={f.name}
              placeholder="e.g. Morning stretch"
              maxLength={60}
              onChange={(e) => set({ name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
        </Field>

        <Field label="Emoji">
          <div className="grid grid-cols-8 gap-1">
            <button
              type="button"
              aria-pressed={!f.emoji}
              onClick={() => set({ emoji: undefined })}
              className={cn(
                'flex aspect-square min-w-0 items-center justify-center rounded-xl text-[11px] font-medium transition-colors',
                !f.emoji ? 'bg-accent-soft text-accent-text ring-2 ring-accent' : 'bg-surface-2 text-muted hover:text-ink',
              )}
            >
              None
            </button>
            {HABIT_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={`Emoji ${e}`}
                aria-pressed={f.emoji === e}
                onClick={() => set({ emoji: e })}
                className={cn(
                  'flex aspect-square min-w-0 items-center justify-center rounded-xl text-xl transition-[background-color,transform] motion-safe:active:scale-90',
                  f.emoji === e ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-surface-2',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Color">
          <ColorPicker value={f.color} onChange={(color) => set({ color })} />
        </Field>

        <Field label="Life area">
          <Select value={f.area} onChange={(e) => set({ area: e.target.value as LifeArea })}>
            {LIFE_AREAS.map((a) => <option key={a} value={a}>{LIFE_AREA_LABELS[a]}</option>)}
          </Select>
        </Field>

        <Field label="Schedule" error={error && f.kind === 'weekdays' && !f.days.length ? error : undefined}>
          <Segmented<ScheduleKind>
            block
            value={f.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: 'daily', label: 'Every day' },
              { value: 'weekdays', label: 'Specific days' },
              { value: 'weekly', label: 'Times a week' },
            ]}
          />
          {f.kind === 'weekdays' && (
            <div className="mt-1">
              <div className="grid grid-cols-7 gap-1.5">
                {order.map((d) => {
                  const on = f.days.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        'flex h-10 min-w-0 items-center justify-center rounded-full text-[13px] font-semibold transition-colors',
                        on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2 hover:text-ink',
                      )}
                    >
                      {WEEKDAY_SHORT[d]}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => set({ days: [1, 2, 3, 4, 5] })}>Weekdays</Button>
                <Button size="sm" variant="ghost" onClick={() => set({ days: [0, 6] })}>Weekends</Button>
              </div>
            </div>
          )}
          {f.kind === 'weekly' && (
            <div className="mt-1">
              <Stepper label="times" value={f.times} min={1} max={7} onChange={(times) => set({ times })} suffix="times per week, any days" />
            </div>
          )}
        </Field>

        <Field label="Daily target" hint={f.target === 1 ? 'A simple check-off. Raise it to count things like glasses or pages.' : undefined}>
          <div className="flex flex-wrap items-center gap-3">
            <Stepper label="per day" value={f.target} min={1} max={999} onChange={(target) => set({ target })} />
            {f.target > 1 && (
              <Input
                className="w-auto min-w-0 flex-1"
                value={f.unit}
                placeholder="unit, e.g. glasses"
                maxLength={20}
                onChange={(e) => set({ unit: e.target.value })}
              />
            )}
          </div>
        </Field>

        <div className="flex flex-col gap-2">
          <Toggle
            checked={f.reminderOn}
            onChange={(reminderOn) => {
              set({ reminderOn })
              // Ask once, from the user's tap, so system notifications can show too.
              if (reminderOn && notificationsSupported() && Notification.permission === 'default') void requestNotifications()
            }}
            label="Daily reminder"
            description="Reminders show while Orbit is open"
          />
          {f.reminderOn && (
            <Input
              type="time"
              aria-label="Reminder time"
              value={f.reminderTime}
              onChange={(e) => set({ reminderTime: e.target.value })}
              className="w-36"
            />
          )}
        </div>

        {existing && (
          <Toggle
            checked={f.archived}
            onChange={(archived) => set({ archived })}
            label="Archived"
            description="Hidden from Today and the habit list; history is kept"
          />
        )}
      </div>
    </Sheet>
  )
}

// ───────────────────────── Detail ─────────────────────────

const WEEKS = 12

function Heatmap({ habit, today, wso }: { habit: Habit; today: ISODate; wso: WeekStart }) {
  const target = habitTarget(habit)
  const start = useMemo(() => addDaysISO(weekRange(today, wso)[0], -(WEEKS - 1) * 7), [today, wso])
  const cols = useMemo(
    () => Array.from({ length: WEEKS }, (_, c) => Array.from({ length: 7 }, (_, r) => addDaysISO(start, c * 7 + r))),
    [start],
  )
  const since = useMemo(() => {
    const first = Object.keys(habit.log).filter((d) => habit.log[d] > 0).sort()[0]
    const created = isoDateOf(habit.createdAt)
    return first && first < created ? first : created
  }, [habit])
  const hex = colorHex(habit.color)
  const unit = unitLabel(habit)

  return (
    <div>
      <div className="flex gap-1">
        {/* Weekday labels */}
        <div className="flex w-4 shrink-0 flex-col gap-1 pt-5">
          {cols[0].map((d, r) => (
            <span key={d} className="flex aspect-square items-center text-[10px] text-muted">
              {r % 2 === 0 ? fmt(d, 'EEEEE') : ''}
            </span>
          ))}
        </div>
        {cols.map((col, c) => {
          const showMonth = c === 0 || col[0].slice(5, 7) !== cols[c - 1][0].slice(5, 7)
          return (
            <div key={col[0]} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="h-4 truncate text-[10px] leading-4 text-muted">{showMonth ? fmt(col[0], 'MMM') : ''}</span>
              {col.map((d) => {
                const future = d > today
                const amt = amountOn(habit, d)
                const ratio = Math.min(1, amt / target)
                const scheduled = isScheduled(habit, d)
                const before = d < since
                const label = `${fmt(d, 'EEE, MMM d')}: ${amt ? (target > 1 ? `${amt}/${target} ${unit}` : 'done') : scheduled ? 'not done' : 'not scheduled'}`
                return (
                  <span
                    key={d}
                    title={future ? undefined : label}
                    className={cn(
                      'aspect-square w-full rounded-[4px]',
                      future ? 'bg-transparent' : !amt && (scheduled && !before ? 'bg-surface-3' : 'bg-surface-2'),
                    )}
                    style={{
                      ...(amt && !future ? { background: hex, opacity: 0.3 + 0.7 * ratio } : {}),
                      ...(d === today ? { outline: '2px solid var(--ink-2)', outlineOffset: 1 } : {}),
                    }}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] bg-surface-3" /> Missed
          <span className="ml-2 h-3 w-3 rounded-[3px] bg-surface-2" /> Off day
        </span>
        <span className="flex items-center gap-1">
          Less
          {[0.3, 0.53, 0.77, 1].map((o) => (
            <span key={o} className="h-3 w-3 rounded-[3px]" style={{ background: hex, opacity: o }} />
          ))}
          More
        </span>
      </div>
    </div>
  )
}

function RateRow({ label, value }: { label: string; value: { rate: number; done: number; due: number } | null }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[13px] text-muted">{label}</span>
      <Progress value={value?.rate ?? 0} className="flex-1" label={`${label} consistency`} />
      <span className="w-20 shrink-0 text-right text-[13px] tabular text-ink-2">
        <span className="font-semibold text-ink">{pctText(value?.rate)}</span>
        {value && <span className="ml-1 text-muted">{value.done}/{value.due}</span>}
      </span>
    </div>
  )
}

export function HabitDetailSheet({ id }: { id: ID }) {
  const habits = useStore((s) => s.habits)
  const wso = useStore((s) => s.settings.weekStartsOn)
  const today = useToday()
  const habit = useMemo(() => habits.find((h) => h.id === id), [habits, id])

  const stats = useMemo(() => {
    if (!habit) return null
    const cur = streak(habit, wso, today)
    return {
      cur,
      best: Math.max(bestStreak(habit, wso, today), cur.count),
      checkIns: checkIns(habit),
      r7: keptRate(habit, addDaysISO(today, -6), today, today, wso),
      r30: keptRate(habit, addDaysISO(today, -29), today, today, wso),
      r90: keptRate(habit, addDaysISO(today, -89), today, today, wso),
    }
  }, [habit, wso, today])

  useEffect(() => {
    if (!habit) closeHabitDetail()
  }, [habit])

  if (!habit || !stats) return null
  const target = habitTarget(habit)
  const unitWord = stats.cur.unit === 'week' ? 'week' : 'day'

  return (
    <Sheet
      open
      onClose={closeHabitDetail}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <HabitMark habit={habit} size={36} />
          <span className="truncate">{habit.name}</span>
        </span>
      }
      headerAction={<IconButton icon={Pencil} label="Edit habit" size="sm" onClick={() => openHabitEditor({ id: habit.id })} />}
      footer={
        <>
          <Button
            variant="ghost"
            icon={habit.archived ? ArchiveRestore : Archive}
            onClick={() => archiveHabit(habit, !habit.archived)}
          >
            {habit.archived ? 'Restore' : 'Archive'}
          </Button>
          <Button variant="primary" className="ml-auto" icon={Pencil} onClick={() => openHabitEditor({ id: habit.id })}>
            Edit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <Badge color={LIFE_AREA_COLORS[habit.area]}>{LIFE_AREA_LABELS[habit.area]}</Badge>
          <span>{describeSchedule(habit)}</span>
          {target > 1 && <span>· {target} {unitLabel(habit)} a day</span>}
          {habit.reminderTime && (
            <span className="inline-flex items-center gap-1">· <Bell size={12} /> {fmtTime(habit.reminderTime)}</span>
          )}
          {habit.archived && <Badge>Archived</Badge>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Current streak', value: stats.cur.count, hint: stats.cur.count === 1 ? unitWord : `${unitWord}s` },
            { label: 'Best streak', value: stats.best, hint: stats.best === 1 ? unitWord : `${unitWord}s` },
            { label: 'Check-ins', value: stats.checkIns, hint: 'total' },
          ].map((s) => (
            <div key={s.label} className="min-w-0 rounded-2xl bg-surface-2 px-3 py-2.5">
              <p className="truncate text-[11px] font-medium text-muted">{s.label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular text-ink">{s.value}</p>
              <p className="text-[11px] text-muted">{s.hint}</p>
            </div>
          ))}
        </div>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink-2">Last 12 weeks</h3>
          <Heatmap habit={habit} today={today} wso={wso} />
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-ink-2">Consistency</h3>
          <div className="flex flex-col gap-2.5">
            <RateRow label="7 days" value={stats.r7} />
            <RateRow label="30 days" value={stats.r30} />
            <RateRow label="90 days" value={stats.r90} />
          </div>
        </section>

        {!habit.archived && (
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-2">Log a day</h3>
            <WeekStrip habit={habit} today={today} />
            <p className="mt-1.5 text-xs text-muted">Tap a day to mark it done or clear it.</p>
          </section>
        )}
      </div>
    </Sheet>
  )
}

