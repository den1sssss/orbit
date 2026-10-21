// Goal card, inline progress controls and the compact "in focus" row.
import { useEffect, useState } from 'react'
import {
  Check, CheckCircle2, Minus, Pause, Pencil, Play, Plus, RotateCcw, Trash2, XCircle,
} from 'lucide-react'
import { Badge, Button, Card, cn, IconButton, Menu, Progress, type MenuItem } from '@/components/ui'
import { fmt } from '@/lib/dates'
import { GOAL_HORIZON_LABELS, LIFE_AREA_COLORS, LIFE_AREA_LABELS } from '@/lib/defaults'
import { parseAmount } from '@/lib/format'
import { colorHex } from '@/lib/icons'
import type { ISODate, LifeGoal, Subtask } from '@/lib/types'
import { dueInfo, fmtNum, goalProgressLabel, goalRatio, goalStep, isoDateOf } from './lib'
import { completeGoal, deleteGoal, openGoalEditor, patchGoal, setGoalStatus } from './state'

const MANUAL_STEPS = [0, 25, 50, 75, 100]
const MILESTONES_SHOWN = 4

function MilestoneRow({ item, onToggle }: { item: Subtask; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={item.done}
      onClick={onToggle}
      className="flex min-h-10 w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-surface-2/60"
    >
      <span
        className={cn(
          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-colors',
          item.done ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface',
        )}
      >
        {item.done && <Check size={13} strokeWidth={3} className="growth-pop" />}
      </span>
      <span className={cn('min-w-0 flex-1 text-sm', item.done ? 'text-muted line-through' : 'text-ink')}>{item.title}</span>
    </button>
  )
}

function NumberValue({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const [text, setText] = useState(fmtNum(value))
  useEffect(() => setText(fmtNum(value)), [value])
  const commit = () => {
    const n = parseAmount(text)
    if (isFinite(n) && n !== value) onCommit(Math.max(0, n))
    else setText(fmtNum(value))
  }
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className="h-10 w-20 min-w-0 rounded-xl border border-line bg-surface text-center text-base font-semibold tabular text-ink outline-none focus:border-accent focus:ring-3 focus:ring-accent/15 sm:text-sm"
    />
  )
}

/** Inline progress update for any goal measure. `compact` shows just the next milestone. */
export function GoalProgressControl({ goal, compact = false }: { goal: LifeGoal; compact?: boolean }) {
  const [showAll, setShowAll] = useState(false)

  if (goal.measure === 'milestones') {
    const toggle = (id: string) =>
      patchGoal(goal.id, { milestones: goal.milestones.map((m) => (m.id === id ? { ...m, done: !m.done } : m)) })
    if (!goal.milestones.length) {
      return (
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => openGoalEditor({ id: goal.id })}>
          Add milestones
        </Button>
      )
    }
    if (compact) {
      const next = goal.milestones.find((m) => !m.done)
      if (!next) return null
      return (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Next step</p>
          <MilestoneRow item={next} onToggle={() => toggle(next.id)} />
        </div>
      )
    }
    const list = showAll ? goal.milestones : goal.milestones.slice(0, MILESTONES_SHOWN)
    return (
      <div className="flex flex-col">
        {list.map((m) => <MilestoneRow key={m.id} item={m} onToggle={() => toggle(m.id)} />)}
        {goal.milestones.length > MILESTONES_SHOWN && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="h-9 self-start rounded-lg px-1 text-[13px] font-medium text-accent-text"
          >
            {showAll ? 'Show less' : `Show all ${goal.milestones.length}`}
          </button>
        )}
      </div>
    )
  }

  if (goal.measure === 'number') {
    const cur = goal.current ?? 0
    const step = goalStep(goal.target)
    const set = (n: number) => patchGoal(goal.id, { current: Math.max(0, Math.round(n * 100) / 100) })
    return (
      <div className="flex items-center gap-2">
        <IconButton icon={Minus} variant="secondary" label={`Decrease by ${step}`} disabled={cur <= 0} onClick={() => set(cur - step)} />
        <NumberValue value={cur} onCommit={set} label={`Current value for ${goal.title}`} />
        <IconButton icon={Plus} variant="secondary" label={`Increase by ${step}`} onClick={() => set(cur + step)} />
        <span className="min-w-0 truncate text-[13px] text-muted">
          of {fmtNum(goal.target)}{goal.unit ? ` ${goal.unit}` : ''}
        </span>
      </div>
    )
  }

  const value = goal.progress ?? 0
  return (
    <div role="group" aria-label="Progress" className="grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1">
      {MANUAL_STEPS.map((p) => {
        const active = Math.round(value) === p
        const filled = value >= p && p > 0
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => patchGoal(goal.id, { progress: p })}
            className={cn(
              'h-9 min-w-0 rounded-lg text-[13px] font-medium tabular transition-colors',
              active ? 'bg-accent text-accent-ink shadow-card' : filled ? 'bg-accent-soft text-accent-text' : 'text-muted hover:text-ink',
            )}
          >
            {p}%
          </button>
        )
      })}
    </div>
  )
}

function goalMenu(goal: LifeGoal): MenuItem[] {
  const edit: MenuItem = { label: 'Edit', icon: Pencil, onClick: () => openGoalEditor({ id: goal.id }) }
  const del: MenuItem = { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteGoal(goal) }
  switch (goal.status) {
    case 'active':
      return [
        { label: 'Mark done', icon: CheckCircle2, onClick: () => completeGoal(goal) },
        edit,
        { label: 'Pause', icon: Pause, onClick: () => setGoalStatus(goal, 'paused') },
        { label: 'Drop', icon: XCircle, onClick: () => setGoalStatus(goal, 'dropped') },
        del,
      ]
    case 'paused':
      return [
        { label: 'Resume', icon: Play, onClick: () => setGoalStatus(goal, 'active') },
        { label: 'Mark done', icon: CheckCircle2, onClick: () => completeGoal(goal) },
        edit,
        { label: 'Drop', icon: XCircle, onClick: () => setGoalStatus(goal, 'dropped') },
        del,
      ]
    case 'dropped':
      return [{ label: 'Restore', icon: RotateCcw, onClick: () => setGoalStatus(goal, 'active') }, edit, del]
    case 'done':
      return [{ label: 'Reopen', icon: RotateCcw, onClick: () => setGoalStatus(goal, 'active') }, edit, del]
  }
}

const STATUS_BADGE = {
  paused: { label: 'Paused', tone: 'warn' },
  dropped: { label: 'Dropped', tone: 'neutral' },
  done: { label: 'Done', tone: 'good' },
} as const

export function GoalCard({ goal, today }: { goal: LifeGoal; today: ISODate }) {
  const ratio = goalRatio(goal)
  const due = goal.status === 'active' || goal.status === 'paused' ? dueInfo(goal.targetDate, today) : null
  const areaColor = LIFE_AREA_COLORS[goal.area]
  const status = goal.status !== 'active' ? STATUS_BADGE[goal.status] : null
  const complete = goal.status === 'active' && ratio >= 1 && (goal.measure !== 'milestones' || goal.milestones.length > 0)

  return (
    <Card className={cn(goal.status === 'dropped' && 'opacity-75')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge color={areaColor}>{LIFE_AREA_LABELS[goal.area]}</Badge>
            <Badge>{GOAL_HORIZON_LABELS[goal.horizon]}</Badge>
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
          </div>
          <button
            type="button"
            onClick={() => openGoalEditor({ id: goal.id })}
            className="text-left text-[15px] font-semibold leading-snug tracking-tight text-ink hover:underline"
          >
            {goal.title}
          </button>
          {goal.why && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{goal.why}</p>}
        </div>
        <Menu items={goalMenu(goal)} label={`Actions for ${goal.title}`} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate font-medium text-ink-2">{goalProgressLabel(goal)}</span>
        {goal.status === 'done' && goal.completedAt ? (
          <span className="shrink-0 text-good">Completed {fmt(isoDateOf(goal.completedAt), 'MMM d')}</span>
        ) : due ? (
          <span className={cn('shrink-0', due.tone === 'bad' ? 'font-medium text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-muted')}>
            {due.text}
          </span>
        ) : null}
      </div>
      <Progress
        value={goal.status === 'done' ? Math.max(ratio, 1) : ratio}
        color={goal.status === 'done' ? undefined : areaColor}
        tone={goal.status === 'done' ? 'good' : 'accent'}
        className="mt-1.5"
        label={`${goal.title} progress`}
      />

      {goal.status === 'active' && (
        <div className="mt-3">
          <GoalProgressControl goal={goal} />
        </div>
      )}
      {complete && (
        <Button variant="soft" size="sm" icon={CheckCircle2} className="mt-3" onClick={() => completeGoal(goal)}>
          Mark as done
        </Button>
      )}
    </Card>
  )
}

/** Compact goal row for Today and Plan: title, countdown, bar and a quick update. */
export function GoalMiniRow({ goal, today }: { goal: LifeGoal; today: ISODate }) {
  const ratio = goalRatio(goal)
  const due = dueInfo(goal.targetDate, today)
  const done = ratio >= 1 && (goal.measure !== 'milestones' || goal.milestones.length > 0)
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => openGoalEditor({ id: goal.id })}
          className="min-w-0 text-left text-sm font-semibold leading-snug text-ink hover:underline"
        >
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorHex(LIFE_AREA_COLORS[goal.area]) }} />
          {goal.title}
        </button>
        {due && (
          <span className={cn('shrink-0 text-[12px]', due.tone === 'bad' ? 'font-medium text-bad' : due.tone === 'warn' ? 'text-warn' : 'text-muted')}>
            {due.text}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Progress value={ratio} color={LIFE_AREA_COLORS[goal.area]} className="flex-1" label={`${goal.title} progress`} />
        <span className="shrink-0 text-[12px] font-medium tabular text-ink-2">{goalProgressLabel(goal)}</span>
      </div>
      <div className="mt-2">
        {done ? (
          <Button variant="soft" size="sm" icon={CheckCircle2} onClick={() => completeGoal(goal)}>Mark as done</Button>
        ) : (
          <GoalProgressControl goal={goal} compact />
        )}
      </div>
    </div>
  )
}
