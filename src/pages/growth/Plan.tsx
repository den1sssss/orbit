// Plan: personal development plan across the eight life areas.
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Scale } from 'lucide-react'
import { Button, Card, CardHeader, EmptyState, Progress, SectionTitle } from '@/components/ui'
import { LIFE_AREA_COLORS, LIFE_AREA_LABELS, LIFE_AREAS } from '@/lib/defaults'
import { useStore } from '@/lib/store'
import type { LifeArea } from '@/lib/types'
import { AreaTile, HabitMark, HabitRow } from './components'
import { GoalCard } from './GoalParts'
import { areaSummary, pctText, recentRate, sortGoals, useToday, type AreaSummary, type WeekStart } from './lib'
import { openGoalEditor, openHabitEditor } from './state'

function isArea(v: string | null): v is LifeArea {
  return !!v && (LIFE_AREAS as string[]).includes(v)
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

function Balance({ rows, onPick }: { rows: AreaSummary[]; onPick: (a: LifeArea) => void }) {
  return (
    <Card>
      <CardHeader
        title="Life balance"
        icon={Scale}
        subtitle="Average of goal progress and 30-day habit consistency"
      />
      <div className="flex flex-col">
        {rows.map((r) => (
          <button
            key={r.area}
            type="button"
            onClick={() => onPick(r.area)}
            className="-mx-2 flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-surface-2"
          >
            <AreaTile area={r.area} size={24} />
            <span className="w-[7.5rem] shrink-0 truncate text-[13px] text-ink-2">{LIFE_AREA_LABELS[r.area]}</span>
            {r.score == null ? (
              <span className="flex-1 text-[12px] text-muted">Not set</span>
            ) : (
              <Progress value={r.score} color={LIFE_AREA_COLORS[r.area]} className="flex-1" label={`${LIFE_AREA_LABELS[r.area]} balance`} />
            )}
            <span className="w-10 shrink-0 text-right text-[13px] font-semibold tabular text-ink">
              {r.score == null ? '' : pctText(r.score)}
            </span>
          </button>
        ))}
      </div>
    </Card>
  )
}

function AreaCard({
  s, today, wso, onOpen,
}: {
  s: AreaSummary
  today: string
  wso: WeekStart
  onOpen: () => void
}) {
  const empty = !s.goals.length && !s.habits.length
  return (
    <Card className="flex flex-col">
      <button type="button" onClick={onOpen} className="-m-1 flex items-center gap-3 rounded-xl p-1 text-left">
        <AreaTile area={s.area} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{LIFE_AREA_LABELS[s.area]}</span>
          <span className="block truncate text-[13px] text-muted">
            {empty ? 'Nothing planned yet' : `${plural(s.goals.length, 'active goal')} · ${plural(s.habits.length, 'habit')}`}
          </span>
        </span>
        {s.score != null && <span className="text-[15px] font-semibold tabular text-ink">{pctText(s.score)}</span>}
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </button>

      {s.goals.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="text-muted">Goals</span>
            <span className="font-medium tabular text-ink-2">avg {pctText(s.goalAvg)}</span>
          </div>
          <Progress value={s.goalAvg ?? 0} color={LIFE_AREA_COLORS[s.area]} label={`${LIFE_AREA_LABELS[s.area]} goal progress`} />
        </div>
      )}

      {s.habits.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {s.habits.slice(0, 3).map((h) => (
            <li key={h.id} className="flex items-center gap-2 text-[13px]">
              <span className="flex w-5 shrink-0 justify-center"><HabitMark habit={h} size={28} /></span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{h.name}</span>
              <span className="shrink-0 font-medium tabular text-ink-2">{pctText(recentRate(h, today, wso)?.rate)}</span>
            </li>
          ))}
          {s.habits.length > 3 && <li className="text-[12px] text-muted">+{s.habits.length - 3} more</li>}
        </ul>
      )}

      <div className="mt-auto flex gap-1.5 pt-3">
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => openGoalEditor({ initial: { area: s.area } })}>Goal</Button>
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          onClick={() => openHabitEditor({ initial: { area: s.area, color: LIFE_AREA_COLORS[s.area] } })}
        >
          Habit
        </Button>
      </div>
    </Card>
  )
}

function AreaFocus({ area, today, wso, onBack }: { area: LifeArea; today: string; wso: WeekStart; onBack: () => void }) {
  const habits = useStore((s) => s.habits)
  const goals = useStore((s) => s.lifeGoals)
  const s = useMemo(() => areaSummary(area, habits, goals, today, wso), [area, habits, goals, today, wso])
  const areaGoals = useMemo(
    () => goals.filter((g) => g.area === area && (g.status === 'active' || g.status === 'paused')).sort(sortGoals),
    [goals, area],
  )
  const doneGoals = useMemo(() => goals.filter((g) => g.area === area && g.status === 'done').length, [goals, area])

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" icon={ChevronLeft} className="-ml-2 self-start" onClick={onBack}>
        All areas
      </Button>
      <Card>
        <div className="flex items-center gap-3">
          <AreaTile area={area} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{LIFE_AREA_LABELS[area]}</h2>
            <p className="text-[13px] text-muted">
              {s.score == null ? 'Not set yet' : `Balance ${pctText(s.score)}`}
              {doneGoals > 0 && ` · ${plural(doneGoals, 'goal')} achieved`}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[12px] text-muted">Goal progress</p>
            <p className="text-lg font-semibold tabular text-ink">{pctText(s.goalAvg)}</p>
            <Progress value={s.goalAvg ?? 0} color={LIFE_AREA_COLORS[area]} className="mt-1" />
          </div>
          <div>
            <p className="text-[12px] text-muted">Habit consistency</p>
            <p className="text-lg font-semibold tabular text-ink">{pctText(s.habitAvg)}</p>
            <Progress value={s.habitAvg ?? 0} color={LIFE_AREA_COLORS[area]} className="mt-1" />
          </div>
        </div>
      </Card>

      <section>
        <SectionTitle
          action={<Button size="sm" variant="ghost" icon={Plus} onClick={() => openGoalEditor({ initial: { area } })}>Add goal</Button>}
        >
          Goals
        </SectionTitle>
        {areaGoals.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {areaGoals.map((g) => <GoalCard key={g.id} goal={g} today={today} />)}
          </div>
        ) : (
          <Card>
            <EmptyState compact title="No goals in this area" description="What would you like to achieve here?" />
          </Card>
        )}
      </section>

      <section>
        <SectionTitle
          action={
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              onClick={() => openHabitEditor({ initial: { area, color: LIFE_AREA_COLORS[area] } })}
            >
              Add habit
            </Button>
          }
        >
          Habits
        </SectionTitle>
        {s.habits.length ? (
          <Card padded={false} className="divide-y divide-line">
            {s.habits.map((h) => <HabitRow key={h.id} habit={h} today={today} wso={wso} />)}
          </Card>
        ) : (
          <Card>
            <EmptyState compact title="No habits in this area" description="A small routine keeps this area moving." />
          </Card>
        )}
      </section>
    </div>
  )
}

export function PlanView() {
  const habits = useStore((s) => s.habits)
  const goals = useStore((s) => s.lifeGoals)
  const wso = useStore((s) => s.settings.weekStartsOn)
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const focus = params.get('area')

  const rows = useMemo(() => LIFE_AREAS.map((a) => areaSummary(a, habits, goals, today, wso)), [habits, goals, today, wso])

  const pick = (a: LifeArea) => {
    setParams({ area: a })
    window.scrollTo({ top: 0 })
  }

  if (isArea(focus)) {
    return <AreaFocus area={focus} today={today} wso={wso} onBack={() => setParams({}, { replace: false })} />
  }

  const planned = rows.filter((r) => r.score != null).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-relaxed text-muted">
        {planned
          ? `You’re working on ${plural(planned, 'area')} of your life. Tap one to see its goals and habits.`
          : 'A balanced plan covers more than work. Pick an area and add a goal or a habit to get started.'}
      </p>
      <Balance rows={rows} onPick={pick} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((s) => <AreaCard key={s.area} s={s} today={today} wso={wso} onOpen={() => pick(s.area)} />)}
      </div>
    </div>
  )
}
