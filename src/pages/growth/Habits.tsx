// Habits: ordered list with 7-day backfill strips, streaks and consistency.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, Plus, Repeat } from 'lucide-react'
import { Button, Card, cn, EmptyState, Stat } from '@/components/ui'
import { doneOn, isDueToday } from '@/lib/habits'
import { useStore } from '@/lib/store'
import { LIFE_AREAS } from '@/lib/defaults'
import type { LifeArea } from '@/lib/types'
import { HabitRow, StarterHabits } from './components'
import { combinedRate, pctText, recentRate, sortHabits, useToday } from './lib'
import { moveHabit, openHabitEditor } from './state'

export function HabitsView() {
  const habits = useStore((s) => s.habits)
  const wso = useStore((s) => s.settings.weekStartsOn)
  const today = useToday()
  const [showArchived, setShowArchived] = useState(false)
  const [params, setParams] = useSearchParams()

  // Deep link: /growth/habits?new=1[&area=health]
  useEffect(() => {
    if (params.get('new') !== '1') return
    const area = params.get('area')
    openHabitEditor({ initial: area && (LIFE_AREAS as string[]).includes(area) ? { area: area as LifeArea } : undefined })
    const next = new URLSearchParams(params)
    next.delete('new')
    next.delete('area')
    setParams(next, { replace: true })
  }, [params, setParams])

  const active = useMemo(() => habits.filter((h) => !h.archived).sort(sortHabits), [habits])
  const archived = useMemo(() => habits.filter((h) => h.archived).sort(sortHabits), [habits])

  const summary = useMemo(() => {
    const due = active.filter((h) => isDueToday(h, today, wso))
    return {
      due: due.length,
      done: due.filter((h) => doneOn(h, today)).length,
      rate: combinedRate(active.map((h) => recentRate(h, today, wso))),
    }
  }, [active, today, wso])

  if (!habits.length) {
    return (
      <Card>
        <EmptyState
          icon={Repeat}
          title="No habits yet"
          description="Track routines you want to keep — daily, on specific days, or a few times a week."
          action={<Button variant="primary" icon={Plus} onClick={() => openHabitEditor()}>Create your first habit</Button>}
        />
        <StarterHabits />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Active" value={active.length} hint={active.length === 1 ? 'habit' : 'habits'} />
          <Stat label="Today" value={<span className="tabular">{summary.done}/{summary.due}</span>} hint="done" />
          <Stat label="Kept" value={pctText(summary.rate)} hint="last 30 days" />
        </div>
      </Card>

      {active.length ? (
        <Card padded={false} className="divide-y divide-line">
          {active.map((h, i) => (
            <HabitRow
              key={h.id}
              habit={h}
              today={today}
              wso={wso}
              onMoveUp={i > 0 ? () => moveHabit(active, h.id, -1) : undefined}
              onMoveDown={i < active.length - 1 ? () => moveHabit(active, h.id, 1) : undefined}
            />
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState compact icon={Repeat} title="All habits are archived" description="Restore one below or start something new." />
        </Card>
      )}

      <Button variant="secondary" icon={Plus} className="self-start" onClick={() => openHabitEditor()}>
        New habit
      </Button>

      {archived.length > 0 && (
        <section>
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((v) => !v)}
            className="flex h-10 items-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold text-ink-2 hover:text-ink"
          >
            <ChevronDown size={16} className={cn('transition-transform', !showArchived && '-rotate-90')} />
            Archived
            <span className="tabular text-muted">{archived.length}</span>
          </button>
          {showArchived && (
            <Card padded={false} className="anim-fade mt-1 divide-y divide-line">
              {archived.map((h) => <HabitRow key={h.id} habit={h} today={today} wso={wso} />)}
            </Card>
          )}
        </section>
      )}
    </div>
  )
}
