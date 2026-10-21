// Goals: filter by horizon, life area and status; update progress inline.
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import { Button, Card, Chip, EmptyState, Segmented } from '@/components/ui'
import { GOAL_HORIZON_LABELS, LIFE_AREA_COLORS, LIFE_AREA_LABELS, LIFE_AREAS } from '@/lib/defaults'
import { useStore } from '@/lib/store'
import type { GoalHorizon, LifeArea, LifeGoal } from '@/lib/types'
import { HScroll } from './components'
import { GoalCard } from './GoalParts'
import { HORIZONS, isHorizon, sortGoals, useToday } from './lib'
import { openGoalEditor } from './state'

type StatusFilter = 'active' | 'done' | 'inactive'

function matchesStatus(g: LifeGoal, s: StatusFilter): boolean {
  if (s === 'active') return g.status === 'active'
  if (s === 'done') return g.status === 'done'
  return g.status === 'paused' || g.status === 'dropped'
}

function isArea(v: string | null): v is LifeArea {
  return !!v && (LIFE_AREAS as string[]).includes(v)
}

export function GoalsView() {
  const goals = useStore((s) => s.lifeGoals)
  const today = useToday()
  const [horizon, setHorizon] = useState<GoalHorizon | 'all'>('all')
  const [area, setArea] = useState<LifeArea | 'all'>('all')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [params, setParams] = useSearchParams()

  // Deep link: /growth/goals?new=1[&horizon=weekly][&area=health]
  useEffect(() => {
    if (params.get('new') !== '1') return
    const h = params.get('horizon')
    const a = params.get('area')
    openGoalEditor({
      initial: { ...(isHorizon(h) ? { horizon: h } : {}), ...(isArea(a) ? { area: a } : {}) },
    })
    const next = new URLSearchParams(params)
    next.delete('new')
    next.delete('horizon')
    next.delete('area')
    setParams(next, { replace: true })
  }, [params, setParams])

  const byStatus = useMemo(() => goals.filter((g) => matchesStatus(g, status)), [goals, status])
  const activeCount = useMemo(() => goals.filter((g) => g.status === 'active').length, [goals])
  const horizonCounts = useMemo(() => {
    const counts = new Map<GoalHorizon, number>()
    for (const g of byStatus) if (area === 'all' || g.area === area) counts.set(g.horizon, (counts.get(g.horizon) ?? 0) + 1)
    return counts
  }, [byStatus, area])
  const areaCounts = useMemo(() => {
    const counts = new Map<LifeArea, number>()
    for (const g of byStatus) if (horizon === 'all' || g.horizon === horizon) counts.set(g.area, (counts.get(g.area) ?? 0) + 1)
    return counts
  }, [byStatus, horizon])

  const list = useMemo(
    () =>
      byStatus
        .filter((g) => (horizon === 'all' || g.horizon === horizon) && (area === 'all' || g.area === area))
        .sort(sortGoals),
    [byStatus, horizon, area],
  )

  const newGoal = () =>
    openGoalEditor({
      initial: { ...(horizon !== 'all' ? { horizon } : {}), ...(area !== 'all' ? { area } : {}) },
    })

  if (!goals.length) {
    return (
      <Card>
        <EmptyState
          icon={Target}
          title="Set your first goal"
          description="From this week’s focus to long-term dreams — break them into milestones and track the progress."
          action={<Button variant="primary" icon={Plus} onClick={newGoal}>New goal</Button>}
        />
      </Card>
    )
  }

  const filtered = horizon !== 'all' || area !== 'all'

  return (
    <div className="flex flex-col gap-3">
      <Segmented<StatusFilter>
        block
        value={status}
        onChange={setStatus}
        className="sm:max-w-md"
        options={[
          { value: 'active', label: activeCount ? `Active · ${activeCount}` : 'Active' },
          { value: 'done', label: 'Done' },
          { value: 'inactive', label: 'Paused & dropped' },
        ]}
      />
      <HScroll>
        <Chip active={horizon === 'all'} onClick={() => setHorizon('all')}>All</Chip>
        {HORIZONS.map((h) => (
          <Chip key={h} active={horizon === h} onClick={() => setHorizon(horizon === h ? 'all' : h)} count={horizonCounts.get(h) ?? 0}>
            {GOAL_HORIZON_LABELS[h]}
          </Chip>
        ))}
      </HScroll>
      <HScroll>
        <Chip active={area === 'all'} onClick={() => setArea('all')}>All areas</Chip>
        {LIFE_AREAS.filter((a) => areaCounts.get(a) || area === a).map((a) => (
          <Chip
            key={a}
            active={area === a}
            color={LIFE_AREA_COLORS[a]}
            onClick={() => setArea(area === a ? 'all' : a)}
            count={areaCounts.get(a) ?? 0}
          >
            {LIFE_AREA_LABELS[a]}
          </Chip>
        ))}
      </HScroll>

      {list.length ? (
        <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((g) => <GoalCard key={g.id} goal={g} today={today} />)}
        </div>
      ) : (
        <Card>
          <EmptyState
            compact
            icon={Target}
            title={status === 'active' ? 'No active goals here' : status === 'done' ? 'Nothing completed yet' : 'No paused or dropped goals'}
            description={filtered ? 'Try another horizon or area.' : undefined}
            action={
              status === 'active' ? (
                <Button variant="primary" size="sm" icon={Plus} onClick={newGoal}>New goal</Button>
              ) : filtered ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setHorizon('all')
                    setArea('all')
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}
    </div>
  )
}
