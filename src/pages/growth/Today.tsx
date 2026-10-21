// Today: habits due today with satisfying check-offs, plus goals ending soon.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Minus, Plus, Sparkles, Target } from 'lucide-react'
import { Button, Card, CardHeader, cn, EmptyState, IconButton, Progress } from '@/components/ui'
import { monthEnd, monthOf } from '@/lib/dates'
import { amountOn, describeSchedule, doneOn, isDueToday, streak, weekCount } from '@/lib/habits'
import { colorHex, tint } from '@/lib/icons'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import type { Habit, ID, ISODate, LifeGoal } from '@/lib/types'
import { HabitMark, ProgressRing, StarterHabits, StreakBadge } from './components'
import { GoalMiniRow } from './GoalParts'
import { habitTarget, sortGoals, sortHabits, unitLabel, useToday, type WeekStart } from './lib'
import { openGoalEditor, openHabitEditor } from './state'

/** How long a just-completed habit stays in place before moving to "Done". */
const LINGER_MS = 650

function TodayHabitRow({
  habit, today, wso, onSet,
}: {
  habit: Habit
  today: ISODate
  wso: WeekStart
  onSet: (h: Habit, amount: number) => void
}) {
  const target = habitTarget(habit)
  const amount = amountOn(habit, today)
  const done = amount >= target
  const counter = target > 1
  const s = streak(habit, wso, today)
  const hex = colorHex(habit.color)

  const sub: string[] = []
  if (counter) sub.push(`${amount}/${target} ${unitLabel(habit)}`)
  if (habit.schedule.kind === 'weekly') sub.push(`${weekCount(habit, today, wso)}/${habit.schedule.times} this week`)
  if (!sub.length) sub.push(describeSchedule(habit))

  const body = (
    <>
      <ProgressRing value={amount / target} color={habit.color} size={48}>
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300"
          style={{ background: tint(habit.color, done ? 0.22 : 0.12) }}
        >
          <HabitMark habit={habit} size={40} />
        </span>
      </ProgressRing>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px] font-medium transition-colors', done ? 'text-ink-2' : 'text-ink')}>
          {habit.name}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-muted">
          <span className="truncate tabular">{sub.join(' · ')}</span>
          <StreakBadge count={s.count} unit={s.unit} />
        </span>
      </span>
    </>
  )

  const shell = cn(
    'flex min-h-[72px] w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left shadow-card',
    'transition-[border-color,opacity,transform] duration-300 motion-safe:active:scale-[0.985]',
    done ? 'border-transparent' : 'border-line',
  )

  if (!counter) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${habit.name}${done ? ', done' : ''}`}
        onClick={() => onSet(habit, done ? 0 : target)}
        className={shell}
        style={done ? { background: tint(habit.color, 0.07) } : undefined}
      >
        {body}
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color] duration-200"
          style={done ? { background: hex, borderColor: hex } : { borderColor: tint(habit.color, 0.55) }}
        >
          {done && <Check key="on" size={22} strokeWidth={3} className="growth-pop text-white" />}
        </span>
      </button>
    )
  }

  return (
    <div className={shell} style={done ? { background: tint(habit.color, 0.07) } : undefined}>
      <button
        type="button"
        onClick={() => onSet(habit, amount + 1)}
        aria-label={`${habit.name}: ${amount} of ${target} ${unitLabel(habit)}. Add one`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {body}
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton
          icon={Minus}
          variant="secondary"
          label={`One less ${unitLabel(habit)}`}
          disabled={amount <= 0}
          onClick={() => onSet(habit, amount - 1)}
        />
        {done ? (
          <button
            type="button"
            aria-label={`One more ${unitLabel(habit)}`}
            onClick={() => onSet(habit, amount + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
            style={{ background: hex }}
          >
            <Check key="on" size={20} strokeWidth={3} className="growth-pop" />
          </button>
        ) : (
          <IconButton icon={Plus} variant="secondary" label={`One more ${unitLabel(habit)}`} onClick={() => onSet(habit, amount + 1)} />
        )}
      </div>
    </div>
  )
}

export function TodayView() {
  const habits = useStore((s) => s.habits)
  const goals = useStore((s) => s.lifeGoals)
  const wso = useStore((s) => s.settings.weekStartsOn)
  const today = useToday()
  const [linger, setLinger] = useState<Record<ID, true>>({})
  const [showDone, setShowDone] = useState(false)
  const timers = useRef(new Map<ID, number>())

  useEffect(() => {
    const map = timers.current
    return () => map.forEach((t) => window.clearTimeout(t))
  }, [])

  const due = useMemo(() => habits.filter((h) => isDueToday(h, today, wso)).sort(sortHabits), [habits, today, wso])
  const pending = due.filter((h) => !doneOn(h, today) || linger[h.id])
  const done = due.filter((h) => doneOn(h, today) && !linger[h.id])
  const doneCount = due.filter((h) => doneOn(h, today)).length
  const hasHabits = useMemo(() => habits.some((h) => !h.archived), [habits])

  const focusGoals = useMemo(() => {
    const end = monthEnd(monthOf(today))
    return goals
      .filter((g) => g.status === 'active')
      .filter((g) => (g.targetDate ? g.targetDate <= end : g.horizon === 'weekly' || g.horizon === 'monthly'))
      .sort(sortGoals)
      .slice(0, 6)
  }, [goals, today])

  const onSet = (h: Habit, amount: number) => {
    const wasDone = doneOn(h, today)
    const next = Math.max(0, amount)
    useStore.getState().logHabit(h.id, today, next)
    const nowDone = next >= habitTarget(h)
    if (!wasDone && nowDone) {
      setLinger((l) => ({ ...l, [h.id]: true }))
      const prev = timers.current.get(h.id)
      if (prev) window.clearTimeout(prev)
      timers.current.set(
        h.id,
        window.setTimeout(() => {
          timers.current.delete(h.id)
          setLinger(({ [h.id]: _gone, ...rest }) => rest)
        }, LINGER_MS),
      )
      if (doneCount + 1 === due.length && due.length > 1) toast('Everything done for today ✨')
    }
  }

  if (!hasHabits) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <EmptyState
            icon={Sparkles}
            title="Build a routine that sticks"
            description="Small daily habits add up. Start with one — you can always add more later."
            action={
              <Button variant="primary" icon={Plus} onClick={() => openHabitEditor()}>
                Create your first habit
              </Button>
            }
          />
          <StarterHabits />
        </Card>
        <FocusGoals goals={focusGoals} today={today} />
      </div>
    )
  }

  const ratio = due.length ? doneCount / due.length : 0
  const allDone = due.length > 0 && doneCount === due.length

  return (
    <div className="flex flex-col gap-4">
      {due.length > 0 ? (
        <>
          <Card>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[13px] text-muted">Habits today</p>
                <p className="mt-0.5 text-xl font-semibold tracking-tight text-ink tabular">
                  {doneCount} of {due.length} done
                </p>
              </div>
              <span className={cn('text-[13px] font-semibold tabular', allDone ? 'text-good' : 'text-accent-text')}>
                {allDone ? 'All done ✨' : `${Math.round(ratio * 100)}%`}
              </span>
            </div>
            <Progress value={ratio} tone={allDone ? 'good' : 'accent'} className="mt-3" label="Habits done today" />
          </Card>

          {pending.length > 0 && (
            <div className="flex flex-col gap-2">
              {pending.map((h) => <TodayHabitRow key={h.id} habit={h} today={today} wso={wso} onSet={onSet} />)}
            </div>
          )}

          {done.length > 0 && (
            <section>
              <button
                type="button"
                aria-expanded={showDone}
                onClick={() => setShowDone((v) => !v)}
                className="flex h-10 items-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold text-ink-2 hover:text-ink"
              >
                <ChevronDown size={16} className={cn('transition-transform', !showDone && '-rotate-90')} />
                Done
                <span className="tabular text-muted">{done.length}</span>
              </button>
              {showDone && (
                <div className="anim-fade mt-1 flex flex-col gap-2">
                  {done.map((h) => <TodayHabitRow key={h.id} habit={h} today={today} wso={wso} onSet={onSet} />)}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <Card>
          <EmptyState
            compact
            icon={Check}
            title="Nothing scheduled today"
            description="Enjoy the rest day — or log something extra from the habit list."
            action={<Link to="/growth/habits" className="text-sm font-medium text-accent-text">See all habits</Link>}
          />
        </Card>
      )}

      <FocusGoals goals={focusGoals} today={today} />
    </div>
  )
}

function FocusGoals({ goals, today }: { goals: LifeGoal[]; today: ISODate }) {
  return (
    <Card>
      <CardHeader
        title="Goals in focus"
        icon={Target}
        subtitle="Active goals ending this week or month"
        action={<Link to="/growth/goals" className="text-[13px] font-medium text-accent-text">All goals</Link>}
      />
      {goals.length ? (
        <div className="divide-y divide-line">
          {goals.map((g) => <GoalMiniRow key={g.id} goal={g} today={today} />)}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-muted">Nothing due soon. What would make this week a win?</p>
          <Button size="sm" variant="soft" icon={Plus} onClick={() => openGoalEditor({ initial: { horizon: 'weekly' } })}>
            Set a goal for this week
          </Button>
        </div>
      )}
    </Card>
  )
}
