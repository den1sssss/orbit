// Review: weekly / monthly stats from across Orbit plus an autosaved reflection.
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Cloud, History, Loader2, NotebookPen } from 'lucide-react'
import {
  Badge, Card, CardHeader, cn, EmptyState, Field, IconButton, Progress, Segmented, Stat, Textarea,
} from '@/components/ui'
import { isValidISO } from '@/lib/dates'
import { MOOD_EMOJI, MOOD_LABELS } from '@/lib/defaults'
import { totals, txInRange } from '@/lib/finance'
import { useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { ISODate, Mood } from '@/lib/types'
import { HabitGlyph } from './components'
import {
  average, combinedRate, goalRatio, isoDateOf, keptRate, pctText, periodRange, reviewAnchor, shiftPeriod,
  useToday, type Period, type PeriodRange, type WeekStart,
} from './lib'
import { reviewHasContent, useReviewDraft, type SaveStatus } from './useReviewDraft'

const MOODS: Mood[] = [1, 2, 3, 4, 5]

function PeriodNav({ range, today, wso, onChange }: {
  range: PeriodRange
  today: ISODate
  wso: WeekStart
  onChange: (r: PeriodRange) => void
}) {
  const next = shiftPeriod(range, 1, wso)
  const isCurrent = range.start <= today && today <= range.end
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface shadow-card">
      <IconButton icon={ChevronLeft} label={`Previous ${range.period}`} onClick={() => onChange(shiftPeriod(range, -1, wso))} />
      <button
        type="button"
        onClick={() => onChange(periodRange(range.period, today, wso))}
        title={isCurrent ? undefined : `Go to this ${range.period}`}
        className="h-10 min-w-[8.5rem] rounded-lg px-1 text-center text-sm font-medium tabular text-ink transition-colors hover:bg-surface-2"
      >
        {range.label}
      </button>
      <IconButton icon={ChevronRight} label={`Next ${range.period}`} disabled={next.start > today} onClick={() => onChange(next)} />
    </div>
  )
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'pending') {
    return <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Loader2 size={12} className="animate-spin" /> Saving…</span>
  }
  if (status === 'saved') {
    return <span className="inline-flex items-center gap-1 text-[12px] text-muted"><Cloud size={12} /> Saved</span>
  }
  return null
}

function RatingPicker({ value, onChange }: { value?: Mood; onChange: (m: Mood | undefined) => void }) {
  return (
    <div role="group" aria-label="Rating" className="grid grid-cols-5 gap-1.5">
      {MOODS.map((m) => {
        const active = value === m
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? undefined : m)}
            className={cn(
              'flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border transition-all',
              active ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
              value && !active && 'opacity-60 hover:opacity-100',
            )}
          >
            <span className={cn('text-2xl leading-none transition-transform motion-reduce:transition-none', active && 'scale-110')} aria-hidden>
              {MOOD_EMOJI[m]}
            </span>
            <span className="max-w-full truncate px-1 text-[11px] font-medium">{MOOD_LABELS[m]}</span>
          </button>
        )
      })}
    </div>
  )
}

const PROMPTS = {
  wins: 'What went well? What are you proud of?',
  challenges: 'What got in the way? What felt hard?',
  lessons: 'What did you learn — about the work or yourself?',
}

function ReflectionForm({ range }: { range: PeriodRange }) {
  const { draft, update, status } = useReviewDraft(range.period, range.key)
  const unit = range.period === 'week' ? 'week' : 'month'
  return (
    <Card>
      <CardHeader
        title="Reflection"
        icon={NotebookPen}
        subtitle={`Look back on this ${unit} — saved automatically`}
        action={<SaveBadge status={status} />}
      />
      <div className="flex flex-col gap-4">
        <Field label={`How was this ${unit}?`}>
          <RatingPicker value={draft.rating} onChange={(rating) => update({ rating }, { immediate: true })} />
        </Field>
        <Field label="Wins">
          <Textarea rows={3} value={draft.wins} placeholder={PROMPTS.wins} onChange={(e) => update({ wins: e.target.value })} />
        </Field>
        <Field label="Challenges">
          <Textarea rows={3} value={draft.challenges} placeholder={PROMPTS.challenges} onChange={(e) => update({ challenges: e.target.value })} />
        </Field>
        <Field label="Lessons">
          <Textarea rows={3} value={draft.lessons} placeholder={PROMPTS.lessons} onChange={(e) => update({ lessons: e.target.value })} />
        </Field>
        <Field label={`Focus for next ${unit}`}>
          <Textarea rows={2} value={draft.focus} placeholder="The one or two things that matter most next." onChange={(e) => update({ focus: e.target.value })} />
        </Field>
      </div>
    </Card>
  )
}

export function ReviewView() {
  const tasks = useStore((s) => s.tasks)
  const habits = useStore((s) => s.habits)
  const goals = useStore((s) => s.lifeGoals)
  const journal = useStore((s) => s.journal)
  const transactions = useStore((s) => s.transactions)
  const reviews = useStore((s) => s.reviews)
  const wso = useStore((s) => s.settings.weekStartsOn)
  const money = useMoney()
  const today = useToday()
  const [params, setParams] = useSearchParams()

  const period: Period = params.get('period') === 'month' ? 'month' : 'week'
  const dateParam = params.get('date')
  const anchor = isValidISO(dateParam ?? undefined) && dateParam! <= today ? dateParam! : today
  const range = useMemo(() => periodRange(period, anchor, wso, today), [period, anchor, wso, today])

  const go = (r: PeriodRange) => {
    const isCurrent = r.start <= today && today <= r.end
    setParams(isCurrent ? (r.period === 'week' ? {} : { period: r.period }) : { period: r.period, date: r.start }, { replace: true })
  }

  const stats = useMemo(() => {
    const { start, end } = range
    const inRange = (d: ISODate) => d >= start && d <= end
    const tasksDone = tasks.filter((t) => t.completedAt && inRange(isoDateOf(t.completedAt))).length
    const habitRows = habits
      .filter((h) => !h.archived || Object.keys(h.log).some(inRange))
      .map((h) => ({ habit: h, c: keptRate(h, start, end, today, wso) }))
      .filter((r): r is { habit: typeof r.habit; c: NonNullable<typeof r.c> } => r.c != null)
      .sort((a, b) => b.c.rate - a.c.rate || a.habit.order - b.habit.order)
    const habitRate = combinedRate(habitRows.map((r) => r.c))
    const goalsDone = goals
      .filter((g) => g.status === 'done' && g.completedAt && inRange(isoDateOf(g.completedAt)))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    const active = goals.filter((g) => g.status === 'active')
    const activeAvg = average(active.map(goalRatio))
    const entries = journal.filter((j) => inRange(j.date))
    const moods = entries.map((j) => j.mood).filter((m): m is Mood => m != null)
    const moodAvg = average(moods)
    const cash = totals(txInRange(transactions, start, end))
    return { tasksDone, habitRows, habitRate, goalsDone, active, activeAvg, entries: entries.length, moodAvg, cash }
  }, [range, tasks, habits, goals, journal, transactions, today, wso])

  const past = useMemo(
    () =>
      reviews
        .filter((r) => reviewHasContent(r))
        .map((r) => {
          const a = reviewAnchor(r)
          return a ? { review: r, range: periodRange(r.period, a, wso, today) } : null
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
        .sort((a, b) => b.range.start.localeCompare(a.range.start) || b.review.period.localeCompare(a.review.period)),
    [reviews, wso, today],
  )

  const unit = period === 'week' ? 'week' : 'month'
  const moodEmoji = stats.moodAvg != null ? MOOD_EMOJI[Math.min(5, Math.max(1, Math.round(stats.moodAvg)))] : ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Period>
          value={period}
          onChange={(p) => go(periodRange(p, range.start <= today && today <= range.end ? today : range.start, wso, today))}
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
        <PeriodNav range={range} today={today} wso={wso} onChange={go} />
      </div>

      <Card>
        <CardHeader title={`This ${unit} at a glance`} subtitle={range.label} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <Stat label="Tasks completed" value={stats.tasksDone} />
          <Stat
            label="Habit consistency"
            value={pctText(stats.habitRate)}
            hint={stats.habitRows.length ? `${stats.habitRows.length} habit${stats.habitRows.length === 1 ? '' : 's'}` : 'No habits due'}
          />
          <Stat
            label="Goals completed"
            value={stats.goalsDone.length}
            hint={stats.active.length ? `${stats.active.length} active · avg ${pctText(stats.activeAvg)}` : 'No active goals'}
          />
          <Stat
            label="Journal entries"
            value={stats.entries}
            hint={stats.moodAvg != null ? `Mood ${stats.moodAvg.toFixed(1)} ${moodEmoji}` : 'No mood logged'}
          />
          <Stat
            label="Money net"
            value={money(stats.cash.net, { sign: true, compact: true })}
            tone={stats.cash.net > 0 ? 'good' : stats.cash.net < 0 ? 'bad' : 'neutral'}
            hint={stats.cash.count ? `${money(stats.cash.income, { compact: true })} in · ${money(stats.cash.expense, { compact: true })} out` : 'No transactions'}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      </Card>

      {(stats.habitRows.length > 0 || stats.goalsDone.length > 0) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {stats.habitRows.length > 0 && (
            <Card>
              <CardHeader title="Habits" subtitle={`Kept ${pctText(stats.habitRate)} of the time`} />
              <ul className="flex flex-col gap-3">
                {stats.habitRows.map(({ habit, c }) => (
                  <li key={habit.id} className="flex items-center gap-3">
                    <HabitGlyph habit={habit} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate font-medium text-ink">{habit.name}</span>
                        <span className="shrink-0 tabular text-muted">
                          <span className="font-semibold text-ink-2">{pctText(c.rate)}</span> · {c.done}/{c.due}
                        </span>
                      </div>
                      <Progress value={c.rate} color={habit.color} className="mt-1.5" height={5} label={`${habit.name} consistency`} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {stats.goalsDone.length > 0 && (
            <Card>
              <CardHeader title="Goals achieved" subtitle={`${stats.goalsDone.length} this ${unit}`} />
              <ul className="flex flex-col gap-2">
                {stats.goalsDone.map((g) => (
                  <li key={g.id} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-good-soft text-good">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span className="min-w-0 text-ink">{g.title}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <ReflectionForm key={`${range.period}:${range.key}`} range={range} />

      <section>
        <h2 className="mb-2 mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <History size={14} /> Past reviews
        </h2>
        {past.length ? (
          <Card padded={false} className="divide-y divide-line">
            {past.map(({ review, range: r }) => {
              const current = r.period === range.period && r.key === range.key
              const preview = review.wins.trim() || review.focus.trim() || review.lessons.trim() || review.challenges.trim()
              return (
                <button
                  key={review.id}
                  type="button"
                  onClick={() => {
                    go(r)
                    window.scrollTo({ top: 0 })
                  }}
                  className={cn('flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2', current && 'bg-surface-2')}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl" aria-hidden>
                    {review.rating ? MOOD_EMOJI[review.rating] : '📝'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{r.label}</span>
                      <Badge>{review.period === 'week' ? 'Week' : 'Month'}</Badge>
                    </span>
                    {preview && <span className="mt-0.5 block truncate text-[13px] text-muted">{preview}</span>}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </button>
              )
            })}
          </Card>
        ) : (
          <Card>
            <EmptyState compact icon={History} title="No reviews yet" description={`Your reflections will collect here — one per ${unit}.`} />
          </Card>
        )}
      </section>
    </div>
  )
}
