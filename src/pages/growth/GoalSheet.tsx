// Create / edit a life goal.
import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Button, Chip, cn, Field, IconButton, Input, Segmented, Select, Sheet, Textarea,
} from '@/components/ui'
import { ChecklistEditor } from '@/components/editors/fields'
import { isValidISO, todayISO } from '@/lib/dates'
import { GOAL_HORIZON_LABELS, LIFE_AREA_LABELS, LIFE_AREAS } from '@/lib/defaults'
import { parseAmount } from '@/lib/format'
import { makeLifeGoal, useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import type { GoalHorizon, LifeArea, LifeGoal, Subtask } from '@/lib/types'
import { dueInfo, fmtNum, horizonEnd, HORIZONS, type WeekStart } from './lib'
import { deleteGoal, type GoalEditorReq } from './state'

type Measure = LifeGoal['measure']

interface GoalForm {
  title: string
  why: string
  horizon: GoalHorizon
  area: LifeArea
  targetDate: string
  measure: Measure
  milestones: Subtask[]
  current: string
  target: string
  unit: string
  progress: number
}

function formFrom(g: Partial<LifeGoal> | undefined, isNew: boolean, wso: WeekStart): GoalForm {
  const horizon = g?.horizon ?? 'monthly'
  return {
    title: g?.title ?? '',
    why: g?.why ?? '',
    horizon,
    area: g?.area ?? 'personal',
    targetDate: g?.targetDate ?? (isNew ? horizonEnd(horizon, todayISO(), wso) ?? '' : ''),
    measure: g?.measure ?? 'milestones',
    milestones: g?.milestones ? g.milestones.map((m) => ({ ...m })) : [],
    current: g?.current != null ? fmtNum(g.current) : '',
    target: g?.target != null ? fmtNum(g.target) : '',
    unit: g?.unit ?? '',
    progress: g?.progress ?? 0,
  }
}

export function GoalEditorSheet({ req, onClose }: { req: GoalEditorReq; onClose: () => void }) {
  const goals = useStore((s) => s.lifeGoals)
  const wso = useStore((s) => s.settings.weekStartsOn)
  const existing = useMemo(() => (req.id ? goals.find((g) => g.id === req.id) : undefined), [goals, req.id])
  const [f, setF] = useState<GoalForm>(() => formFrom(existing ?? req.initial, !existing, wso))
  /** Once the user picks a date themselves, changing the horizon no longer moves it. */
  const [dateTouched, setDateTouched] = useState(!!existing || !!req.initial?.targetDate)
  const [error, setError] = useState<string>()
  const set = (p: Partial<GoalForm>) => setF((prev) => ({ ...prev, ...p }))

  useEffect(() => {
    if (req.id && !existing) onClose()
  }, [req.id, existing, onClose])

  const pickHorizon = (horizon: GoalHorizon) => {
    if (dateTouched) set({ horizon })
    else set({ horizon, targetDate: horizonEnd(horizon, todayISO(), wso) ?? '' })
  }

  const save = () => {
    const title = f.title.trim()
    if (!title) return setError('title')
    const target = parseAmount(f.target)
    const current = parseAmount(f.current)
    if (f.measure === 'number' && !(target > 0)) return setError('target')
    const data: Partial<LifeGoal> = {
      title,
      why: f.why.trim() || undefined,
      horizon: f.horizon,
      area: f.area,
      targetDate: isValidISO(f.targetDate) ? f.targetDate : undefined,
      measure: f.measure,
      milestones: f.milestones.filter((m) => m.title.trim()).map((m) => ({ ...m, title: m.title.trim() })),
      ...(f.measure === 'number'
        ? { target, current: isFinite(current) ? Math.max(0, current) : 0, unit: f.unit.trim() || undefined }
        : {}),
      ...(f.measure === 'manual' ? { progress: f.progress } : {}),
    }
    const st = useStore.getState()
    if (existing) {
      st.patch('lifeGoals', existing.id, data)
      toast('Goal updated')
    } else {
      st.insert('lifeGoals', makeLifeGoal({ ...data, title }))
      toast('Goal added')
    }
    onClose()
  }

  const due = dueInfo(isValidISO(f.targetDate) ? f.targetDate : undefined, todayISO())

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? 'Edit goal' : 'New goal'}
      footer={
        <>
          {existing && (
            <IconButton
              icon={Trash2}
              label="Delete goal"
              className="text-bad hover:text-bad"
              onClick={() => {
                deleteGoal(existing)
                onClose()
              }}
            />
          )}
          <Button variant="ghost" className="ml-auto" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Save' : 'Add goal'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Goal" error={error === 'title' && !f.title.trim() ? 'Give your goal a title' : undefined}>
          <Input
            value={f.title}
            placeholder="e.g. Run a 10K"
            maxLength={120}
            onChange={(e) => set({ title: e.target.value })}
          />
        </Field>

        <Field label="Why it matters" hint="Shown on the goal as a reminder.">
          <Textarea
            value={f.why}
            rows={2}
            className="min-h-16"
            placeholder="What will reaching it change for you?"
            onChange={(e) => set({ why: e.target.value })}
          />
        </Field>

        <Field label="Horizon">
          <div className="flex flex-wrap gap-1.5">
            {HORIZONS.map((h) => (
              <Chip key={h} active={f.horizon === h} onClick={() => pickHorizon(h)}>
                {GOAL_HORIZON_LABELS[h]}
              </Chip>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
          <Field label="Life area">
            <Select value={f.area} onChange={(e) => set({ area: e.target.value as LifeArea })}>
              {LIFE_AREAS.map((a) => <option key={a} value={a}>{LIFE_AREA_LABELS[a]}</option>)}
            </Select>
          </Field>
          <Field
            label="Target date"
            hint={
              due ? (
                <span className={cn(due.tone === 'bad' && 'text-bad')}>{due.text}</span>
              ) : f.targetDate ? undefined : 'No deadline'
            }
          >
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={f.targetDate}
                onChange={(e) => {
                  setDateTouched(true)
                  set({ targetDate: e.target.value })
                }}
              />
              {f.targetDate && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDateTouched(true)
                    set({ targetDate: '' })
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </Field>
        </div>

        <Field label="Track progress by">
          <Segmented<Measure>
            block
            value={f.measure}
            onChange={(measure) => set({ measure })}
            options={[
              { value: 'milestones', label: 'Milestones' },
              { value: 'number', label: 'Number' },
              { value: 'manual', label: 'Percent' },
            ]}
          />
        </Field>

        {f.measure === 'milestones' && (
          <Field label="Milestones" hint="Break the goal into concrete steps.">
            <div className="rounded-xl border border-line px-3 py-1">
              <ChecklistEditor items={f.milestones} onChange={(milestones) => set({ milestones })} placeholder="Add a milestone" />
            </div>
          </Field>
        )}

        {f.measure === 'number' && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Current">
              <Input inputMode="decimal" value={f.current} placeholder="0" onChange={(e) => set({ current: e.target.value })} />
            </Field>
            <Field label="Target" error={error === 'target' && !(parseAmount(f.target) > 0) ? 'Required' : undefined}>
              <Input inputMode="decimal" value={f.target} placeholder="10" onChange={(e) => set({ target: e.target.value })} />
            </Field>
            <Field label="Unit">
              <Input value={f.unit} placeholder="km" maxLength={16} onChange={(e) => set({ unit: e.target.value })} />
            </Field>
          </div>
        )}

        {f.measure === 'manual' && (
          <Field label={`Progress · ${f.progress}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={f.progress}
              aria-label="Progress percent"
              onChange={(e) => set({ progress: Number(e.target.value) })}
              className="h-10 w-full accent-[var(--accent)]"
            />
          </Field>
        )}
      </div>
    </Sheet>
  )
}
