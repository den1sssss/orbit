// The "Write" side of the journal: one autosaving entry for the selected date.
import {
  forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState,
  type ReactNode, type TextareaHTMLAttributes,
} from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarClock, ChevronLeft, ChevronRight, Heart, Lightbulb, Lock, Shuffle, Sunrise, Trophy,
  type LucideIcon,
} from 'lucide-react'
import { TagsInput } from '@/components/editors/fields'
import { Button, Card, CardHeader, cn, IconButton, Input, Textarea } from '@/components/ui'
import { addDaysISO, isValidISO } from '@/lib/dates'
import { MOOD_EMOJI, MOOD_LABELS } from '@/lib/defaults'
import { isEncrypted } from '@/lib/persistence'
import type { ISODate, Mood } from '@/lib/types'
import { DayContext } from './DayContext'
import { ENERGY_LABELS, MOODS, wordCount } from './insights'
import { promptFor } from './prompts'
import { useEntryDraft } from './useEntryDraft'

export function EntryEditor({
  date, today, onNavigate, onDirtyChange,
}: {
  date: ISODate
  today: ISODate
  onNavigate: (date: ISODate) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { draft, update, dirty, version } = useEntryDraft(date)
  const [shuffle, setShuffle] = useState(0)
  const locked = date > today
  const promptId = useId()

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const prompt = promptFor(date, shuffle)
  const words = wordCount(draft.body)

  return (
    <div className="flex flex-col gap-4">
      <DateNav date={date} today={today} onNavigate={onNavigate} />

      {locked && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-2 px-4 py-3 text-sm text-ink-2">
          <CalendarClock size={18} className="shrink-0 text-muted" />
          You can write this entry when the day comes.
        </div>
      )}

      <Lockable locked={locked}>
        <Card>
          <CardHeader title="How are you feeling?" />
          <MoodPicker value={draft.mood} onChange={(mood) => update({ mood }, { immediate: true })} />
          <EnergyPicker value={draft.energy} onChange={(energy) => update({ energy }, { immediate: true })} />
        </Card>
      </Lockable>

      <DayContext date={date} />

      <Lockable locked={locked}>
        <Card>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Reflect</p>
              <h2 id={promptId} className="mt-1 text-lg font-semibold leading-snug tracking-tight text-balance text-ink">
                {prompt}
              </h2>
            </div>
            <IconButton
              icon={Shuffle}
              label="Show another prompt"
              onClick={() => setShuffle((s) => s + 1)}
              className="-mr-2 -mt-1"
            />
          </div>
          <AutoGrow
            aria-labelledby={promptId}
            value={draft.body}
            onChange={(e) => update({ body: e.target.value })}
            placeholder={locked ? '' : 'Write freely. This space is just for you.'}
            minHeight={220}
            className="mt-3 block w-full resize-none bg-transparent text-base leading-7 text-ink outline-none placeholder:text-muted disabled:opacity-60"
          />
          <p className="tabular mt-2 text-right text-xs text-muted" aria-live="off">
            {words ? `${words} ${words === 1 ? 'word' : 'words'}` : ' '}
          </p>
        </Card>
      </Lockable>

      <Lockable locked={locked}>
        <Card>
          <CardHeader title="Gratitude" icon={Heart} subtitle="Three things, big or small." />
          <div className="flex flex-col gap-2">
            {draft.gratitude.map((g, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="tabular w-4 shrink-0 text-right text-sm text-muted" aria-hidden>
                  {i + 1}
                </span>
                <Input
                  value={g}
                  aria-label={`Gratitude ${i + 1}`}
                  placeholder="I'm grateful for…"
                  onChange={(e) => {
                    const next = [...draft.gratitude]
                    next[i] = e.target.value
                    update({ gratitude: next })
                  }}
                />
              </div>
            ))}
          </div>
        </Card>
      </Lockable>

      <Lockable locked={locked}>
        <Card>
          <CardHeader title="Looking back, looking ahead" />
          <div className="flex flex-col gap-4">
            <ReflectField
              icon={Trophy}
              label="Wins"
              hint="What went well?"
              value={draft.wins}
              onChange={(wins) => update({ wins })}
            />
            <ReflectField
              icon={Lightbulb}
              label="Lessons"
              hint="What did I learn?"
              value={draft.lessons}
              onChange={(lessons) => update({ lessons })}
            />
            <ReflectField
              icon={Sunrise}
              label="Tomorrow"
              hint="What do I want to focus on?"
              value={draft.tomorrow}
              onChange={(tomorrow) => update({ tomorrow })}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-2">Tags</span>
              <TagsInput
                key={version}
                value={draft.tags}
                onChange={(tags) => update({ tags })}
                placeholder="e.g. family, work, health"
              />
            </div>
          </div>
        </Card>
      </Lockable>

      <PrivacyNote />
    </div>
  )
}

// ───────────────────────── Pieces ─────────────────────────

/** Disables every control inside while a future day is shown. */
function Lockable({ locked, children }: { locked: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0">
      {children}
    </fieldset>
  )
}

function DateNav({
  date, today, onNavigate,
}: { date: ISODate; today: ISODate; onNavigate: (date: ISODate) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        icon={ChevronLeft}
        label="Previous day"
        variant="secondary"
        onClick={() => onNavigate(addDaysISO(date, -1))}
      />
      <Input
        type="date"
        value={date}
        max={today}
        aria-label="Journal date"
        onChange={(e) => {
          if (isValidISO(e.target.value)) onNavigate(e.target.value)
        }}
        className="min-w-0 flex-1 appearance-none sm:w-44 sm:flex-none"
      />
      <IconButton
        icon={ChevronRight}
        label="Next day"
        variant="secondary"
        disabled={date >= today}
        onClick={() => onNavigate(addDaysISO(date, 1))}
      />
      {date !== today && (
        <Button variant="ghost" onClick={() => onNavigate(today)} className="shrink-0 px-3">
          Today
        </Button>
      )}
    </div>
  )
}

function MoodPicker({ value, onChange }: { value?: Mood; onChange: (m: Mood | undefined) => void }) {
  return (
    <div role="group" aria-label="Mood" className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {MOODS.map((m) => {
        const active = value === m
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? undefined : m)}
            className={cn(
              'flex h-[72px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border transition-all',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50',
              active
                ? 'border-accent bg-accent-soft text-accent-text'
                : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2',
              value && !active && 'opacity-60 hover:opacity-100',
            )}
          >
            <span className={cn('text-[28px] leading-none transition-transform', active && 'scale-110')} aria-hidden>
              {MOOD_EMOJI[m]}
            </span>
            <span className="max-w-full truncate px-1 text-[11px] font-medium">{MOOD_LABELS[m]}</span>
          </button>
        )
      })}
    </div>
  )
}

function EnergyPicker({ value, onChange }: { value?: Mood; onChange: (m: Mood | undefined) => void }) {
  const labelId = useId()
  return (
    <div className="mt-5">
      <div className="mb-1 flex items-center justify-between">
        <span id={labelId} className="text-[13px] font-medium text-ink-2">
          Energy
        </span>
        <span className="text-xs text-muted">{value ? ENERGY_LABELS[value] : 'Not set'}</span>
      </div>
      <div role="group" aria-labelledby={labelId} className="flex gap-1.5">
        {MOODS.map((e) => {
          const filled = value != null && e <= value
          return (
            <button
              key={e}
              type="button"
              aria-pressed={value === e}
              aria-label={`${e} of 5, ${ENERGY_LABELS[e]}`}
              title={ENERGY_LABELS[e]}
              onClick={() => onChange(value === e ? undefined : e)}
              className="group flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              <span
                className={cn(
                  'h-2.5 w-full rounded-full transition-colors',
                  filled ? 'bg-accent' : 'bg-surface-3 group-hover:bg-line-strong',
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ReflectField({
  icon: Icon, label, hint, value, onChange,
}: {
  icon: LucideIcon
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
        <Icon size={15} className="text-muted" />
        {label}
        <span className="font-normal text-muted">· {hint}</span>
      </label>
      <AutoGrow
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minHeight={76}
        kit
        rows={2}
      />
    </div>
  )
}

/** Textarea that grows with its content. `kit` uses the UI-kit field look. */
const AutoGrow = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { minHeight: number; kit?: boolean }
>(function AutoGrow({ minHeight, kit, value, style, ...rest }, ref) {
  const inner = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement)

  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(minHeight, el.scrollHeight + (kit ? 2 : 0))}px`
  }, [value, minHeight, kit])

  // Re-measure when the width changes (rotation, sidebar, column resize).
  useEffect(() => {
    const el = inner.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      el.style.height = 'auto'
      el.style.height = `${Math.max(minHeight, el.scrollHeight + (kit ? 2 : 0))}px`
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [minHeight, kit])

  const merged = { ...style, minHeight, overflow: 'hidden' as const }
  return kit ? (
    <Textarea ref={inner} value={value} style={merged} className="resize-none" {...rest} />
  ) : (
    <textarea ref={inner} value={value} style={merged} {...rest} />
  )
})

function PrivacyNote() {
  const encrypted = isEncrypted()
  return (
    <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
      <Lock size={13} className="mt-0.5 shrink-0" />
      {encrypted ? (
        <span>Your journal is encrypted on this device with your passcode.</span>
      ) : (
        <span>
          Your journal stays on this device. For extra privacy, add a passcode in{' '}
          <Link to="/settings" className="font-medium text-accent-text hover:underline">
            Settings → Security
          </Link>
          .
        </span>
      )}
    </p>
  )
}
