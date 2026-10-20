import { useMemo, useState, type ReactNode } from 'react'
import {
  Archive, ArchiveRestore, ChevronDown, History, Pencil, PiggyBank, Plus, Target, Trash2,
} from 'lucide-react'
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Badge, Button, Card, cn, ColorDot, ColorPicker, EmptyState, Field, IconButton, Input, Menu,
  MoneyInput, PageHeader, Progress, Sheet, Toggle,
} from '@/components/ui'
import { fmt, isValidISO, relativeDay, todayISO } from '@/lib/dates'
import { goalProgress } from '@/lib/finance'
import { parseAmount, pct, useMoney } from '@/lib/format'
import { colorHex } from '@/lib/icons'
import { uid, useStore } from '@/lib/store'
import { confirm, removeWithUndo, toast } from '@/lib/ui'
import type { ColorKey, Contribution, ID, SavingsGoal } from '@/lib/types'
import { TooltipBox } from './components/charts'
import { roundCents, useCompactMoney } from './components/lib'
import { MoneyToolbar } from './components/nav'

const GOAL_COLORS: ColorKey[] = ['green', 'blue', 'violet', 'teal', 'orange', 'pink', 'amber', 'indigo']

function lastContribution(g: SavingsGoal): Contribution | undefined {
  let best: Contribution | undefined
  for (const c of g.contributions) if (!best || c.date >= best.date) best = c
  return best
}

function archiveGoal(g: SavingsGoal, archived: boolean) {
  useStore.getState().patch('goals', g.id, { archived })
  toast(archived ? 'Goal archived' : 'Goal restored', {
    action: { label: 'Undo', onClick: () => useStore.getState().patch('goals', g.id, { archived: !archived }) },
  })
}

async function deleteGoal(g: SavingsGoal) {
  const ok = await confirm({
    title: `Delete “${g.name}”?`,
    message: 'The goal and its contribution history will be removed.',
    confirmLabel: 'Delete',
    danger: true,
  })
  if (ok) removeWithUndo('goals', g.id, 'Goal deleted')
}

export function GoalsPage() {
  const goals = useStore((s) => s.goals)
  const money = useMoney()
  const [editing, setEditing] = useState<{ id?: ID } | null>(null)
  const [adding, setAdding] = useState<ID | null>(null)
  const [detail, setDetail] = useState<ID | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const active = useMemo(() => goals.filter((g) => !g.archived), [goals])
  const archived = useMemo(() => goals.filter((g) => g.archived), [goals])

  const summary = useMemo(() => {
    let saved = 0
    let target = 0
    let monthly = 0
    let reached = 0
    for (const g of active) {
      const p = goalProgress(g)
      saved += p.saved
      target += g.target
      if (p.saved >= g.target) reached++
      else if (p.monthlyNeeded && (p.daysLeft ?? 0) > 0) monthly += p.monthlyNeeded
    }
    return { saved, target, monthly, reached }
  }, [active])

  const byId = (id: ID | null) => (id ? goals.find((g) => g.id === id) : undefined)
  const addingGoal = byId(adding)
  const detailGoal = byId(detail)
  const editingGoal = editing?.id ? byId(editing.id) : undefined

  return (
    <>
      <PageHeader
        title="Savings goals"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            <span className="hidden sm:inline">New goal</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      >
        <MoneyToolbar />
      </PageHeader>

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title="No savings goals yet"
            description="An emergency fund, a trip, a new laptop. Set a target and track every contribution."
            action={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Create a goal</Button>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4 lg:gap-5">
          {active.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-muted">Total saved across {active.length} goal{active.length === 1 ? '' : 's'}</p>
                  <p className="tabular mt-0.5 text-2xl font-semibold tracking-tight text-ink">
                    {money(summary.saved)}{' '}
                    <span className="text-base font-normal text-muted">of {money(summary.target)}</span>
                  </p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-[13px] text-muted">Needed per month</p>
                    <p className="tabular text-[17px] font-semibold text-ink">{money(summary.monthly)}</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-muted">Reached</p>
                    <p className="tabular text-[17px] font-semibold text-ink">
                      {summary.reached}/{active.length}
                    </p>
                  </div>
                </div>
              </div>
              <Progress
                className="mt-4"
                height={8}
                value={summary.target ? summary.saved / summary.target : 0}
                label="Total saved across goals"
              />
            </Card>
          )}

          {active.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-3">
              {active.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onAdd={() => setAdding(g.id)}
                  onEdit={() => setEditing({ id: g.id })}
                  onHistory={() => setDetail(g.id)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                compact
                icon={Target}
                title="No active goals"
                description="All your goals are archived."
                action={<Button icon={Plus} onClick={() => setEditing({})}>New goal</Button>}
              />
            </Card>
          )}

          {archived.length > 0 && (
            <section>
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex h-10 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink"
              >
                <ChevronDown size={15} className={cn('transition-transform', !showArchived && '-rotate-90')} />
                Archived goals · {archived.length}
              </button>
              {showArchived && (
                <Card padded={false} className="mt-1 divide-y divide-line">
                  {archived.map((g) => {
                    const p = goalProgress(g)
                    return (
                      <div key={g.id} className="flex min-h-14 items-center gap-3 px-3 py-2 sm:px-4">
                        <ColorDot color={g.color} size={10} />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setDetail(g.id)}
                        >
                          <p className="truncate text-sm font-medium text-ink-2">{g.name}</p>
                          <p className="tabular text-[13px] text-muted">
                            {money(p.saved)} of {money(g.target)}
                          </p>
                        </button>
                        <Button icon={ArchiveRestore} onClick={() => archiveGoal(g, false)}>
                          Restore
                        </Button>
                        <IconButton icon={Trash2} label="Delete goal" onClick={() => void deleteGoal(g)} />
                      </div>
                    )
                  })}
                </Card>
              )}
            </section>
          )}
        </div>
      )}

      {editing && (
        <GoalSheet
          key={editing.id ?? 'new'}
          goal={editingGoal}
          nextColor={GOAL_COLORS[goals.length % GOAL_COLORS.length]}
          onClose={() => setEditing(null)}
        />
      )}
      {addingGoal && <ContributionSheet goal={addingGoal} onClose={() => setAdding(null)} />}
      {detailGoal && (
        <GoalDetailSheet
          goal={detailGoal}
          onClose={() => setDetail(null)}
          onAdd={() => {
            setDetail(null)
            setAdding(detailGoal.id)
          }}
        />
      )}
    </>
  )
}

// ───────────────────────── Card ─────────────────────────

function GoalCard({ goal, onAdd, onEdit, onHistory }: {
  goal: SavingsGoal
  onAdd: () => void
  onEdit: () => void
  onHistory: () => void
}) {
  const money = useMoney()
  const p = goalProgress(goal)
  const reached = p.saved >= goal.target
  const last = lastContribution(goal)

  let plan: ReactNode
  if (reached) plan = <Badge tone="good">Goal reached</Badge>
  else if (goal.targetDate && (p.daysLeft ?? 0) < 0) {
    plan = <span className="text-warn">Target date passed · {money(p.remaining)} to go</span>
  } else if (goal.targetDate) {
    plan = (
      <span>
        By {fmt(goal.targetDate, 'MMM d, yyyy')} ·{' '}
        <span className="tabular font-medium text-ink-2">{money(p.monthlyNeeded ?? 0)}/month needed</span>
      </span>
    )
  } else plan = <span className="tabular">{money(p.remaining)} to go · no target date</span>

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 pt-1">
          <ColorDot color={goal.color} size={10} />
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">{goal.name}</h3>
        </div>
        <Menu
          label={`${goal.name} actions`}
          items={[
            { label: 'Edit', icon: Pencil, onClick: onEdit },
            { label: 'History', icon: History, onClick: onHistory },
            { label: 'Archive', icon: Archive, onClick: () => archiveGoal(goal, true) },
            { label: 'Delete', icon: Trash2, danger: true, onClick: () => void deleteGoal(goal) },
          ]}
        />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="tabular min-w-0 truncate text-xl font-semibold tracking-tight text-ink">
          {money(p.saved)} <span className="text-sm font-normal text-muted">of {money(goal.target)}</span>
        </p>
        <span className="tabular shrink-0 text-sm font-medium text-ink-2">{pct(p.ratio)}</span>
      </div>
      <Progress className="mt-2" height={8} value={p.ratio} color={goal.color} label={`${goal.name} progress`} />

      <div className="mt-3 flex flex-col items-start gap-1 text-[13px] text-muted">
        {plan}
        <span>
          {last
            ? `Last ${last.amount < 0 ? 'withdrawal' : 'added'}: ${money(Math.abs(last.amount))} · ${relativeDay(last.date)}`
            : 'No contributions yet'}
        </span>
      </div>

      <div className="mt-auto flex gap-2 pt-4">
        <Button variant="soft" icon={Plus} className="flex-1" onClick={onAdd}>
          Add money
        </Button>
        <Button variant="ghost" icon={History} onClick={onHistory}>
          History
        </Button>
      </div>
    </Card>
  )
}

// ───────────────────────── Sheets ─────────────────────────

function GoalSheet({ goal, nextColor, onClose }: { goal?: SavingsGoal; nextColor: ColorKey; onClose: () => void }) {
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const [name, setName] = useState(goal?.name ?? '')
  const [targetText, setTargetText] = useState(goal ? String(goal.target) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [color, setColor] = useState<ColorKey>(goal?.color ?? nextColor)
  const [startText, setStartText] = useState('')
  const [errors, setErrors] = useState<{ name?: string; target?: string; start?: string }>({})

  const save = () => {
    const n = name.trim()
    const target = parseAmount(targetText)
    const start = startText.trim() ? parseAmount(startText) : 0
    const next: typeof errors = {}
    if (!n) next.name = 'Give the goal a name'
    if (!isFinite(target) || target <= 0) next.target = 'Enter a target greater than zero'
    if (!isFinite(start) || start < 0) next.start = 'Enter a positive amount or leave empty'
    setErrors(next)
    if (Object.keys(next).length) return
    const date = isValidISO(targetDate) ? targetDate : undefined
    if (goal) {
      patch('goals', goal.id, { name: n, target: roundCents(target), targetDate: date, color })
      toast('Goal updated')
    } else {
      const today = todayISO()
      insert('goals', {
        id: uid(),
        name: n,
        target: roundCents(target),
        targetDate: date,
        color,
        contributions: start > 0 ? [{ id: uid(), date: today, amount: roundCents(start), note: 'Starting amount' }] : [],
        createdAt: Date.now(),
      })
      toast('Goal created')
    }
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={goal ? 'Edit goal' : 'New savings goal'}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{goal ? 'Save' : 'Create goal'}</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Name" error={errors.name}>
          <Input data-autofocus value={name} placeholder="Emergency fund, Trip to Japan…" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount" error={errors.target}>
            <MoneyInput placeholder="0" value={targetText} onChange={(e) => setTargetText(e.target.value)} />
          </Field>
          <Field label="Target date" hint="Optional">
            <Input type="date" value={targetDate} min={todayISO()} onChange={(e) => setTargetDate(e.target.value)} />
          </Field>
        </div>
        {!goal && (
          <Field label="Already saved" hint="Optional. Recorded as the first contribution." error={errors.start}>
            <MoneyInput placeholder="0" value={startText} onChange={(e) => setStartText(e.target.value)} />
          </Field>
        )}
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}

function ContributionSheet({ goal, onClose }: { goal: SavingsGoal; onClose: () => void }) {
  const addContribution = useStore((s) => s.addContribution)
  const money = useMoney()
  const p = goalProgress(goal)
  const [text, setText] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [withdraw, setWithdraw] = useState(false)
  const [error, setError] = useState('')

  const suggestions = [
    p.monthlyNeeded && p.remaining > 0 ? { label: 'Monthly need', value: roundCents(p.monthlyNeeded) } : null,
    p.remaining > 0 ? { label: 'Fill the rest', value: roundCents(p.remaining) } : null,
  ].filter((x): x is { label: string; value: number } => !!x && x.value > 0)

  const save = () => {
    const n = parseAmount(text)
    if (!isFinite(n) || n <= 0) return setError('Enter an amount greater than zero')
    const amount = roundCents(n)
    if (withdraw && amount > p.saved + 0.001) return setError(`Only ${money(p.saved)} is saved in this goal`)
    if (!isValidISO(date)) return setError('Pick a valid date')
    addContribution(goal.id, { amount: withdraw ? -amount : amount, date, note: note.trim() || undefined })
    const reachedNow = !withdraw && p.saved < goal.target && p.saved + amount >= goal.target
    toast(withdraw ? 'Withdrawal recorded' : reachedNow ? `${goal.name}: goal reached` : `Added to ${goal.name}`)
    onClose()
  }

  return (
    <Sheet
      open
      size="sm"
      onClose={onClose}
      title={withdraw ? `Withdraw from ${goal.name}` : `Add to ${goal.name}`}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{withdraw ? 'Withdraw' : 'Add money'}</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <p className="tabular text-[13px] text-muted">
          {money(p.saved)} saved of {money(goal.target)}
        </p>
        <Field error={error}>
          <MoneyInput
            big
            data-autofocus
            placeholder="0.00"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError('')
            }}
          />
        </Field>
        {!withdraw && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setText(String(s.value))}
                className="h-8 rounded-lg bg-surface-2 px-2.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
              >
                {s.label} · <span className="tabular">{money(s.value)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <Toggle
          checked={withdraw}
          onChange={(v) => {
            setWithdraw(v)
            setError('')
          }}
          label="Withdraw"
          description="Take money out of this goal"
        />
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}

function GoalDetailSheet({ goal, onClose, onAdd }: { goal: SavingsGoal; onClose: () => void; onAdd: () => void }) {
  const removeContribution = useStore((s) => s.removeContribution)
  const money = useMoney()
  const compact = useCompactMoney()
  const p = goalProgress(goal)

  const list = useMemo(
    () => [...goal.contributions].sort((a, b) => b.date.localeCompare(a.date)),
    [goal.contributions],
  )
  const series = useMemo(() => {
    let run = 0
    const byDate = new Map<string, number>()
    for (const c of [...goal.contributions].sort((a, b) => a.date.localeCompare(b.date))) {
      run += c.amount
      byDate.set(c.date, roundCents(run))
    }
    return [...byDate.entries()].map(([date, saved]) => ({ date, saved }))
  }, [goal.contributions])
  const yMax = Math.max(goal.target, ...series.map((s) => s.saved))

  const remove = (c: Contribution) => {
    const before = goal.contributions
    removeContribution(goal.id, c.id)
    toast('Contribution removed', {
      action: { label: 'Undo', onClick: () => useStore.getState().patch('goals', goal.id, { contributions: before }) },
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={goal.name}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {!goal.archived && <Button variant="primary" icon={Plus} onClick={onAdd}>Add money</Button>}
        </>
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="tabular text-xl font-semibold tracking-tight text-ink">
          {money(p.saved)} <span className="text-sm font-normal text-muted">of {money(goal.target)}</span>
        </p>
        <span className="tabular text-sm font-medium text-ink-2">{pct(p.ratio)}</span>
      </div>
      <Progress className="mt-2" height={8} value={p.ratio} color={goal.color} label={`${goal.name} progress`} />

      {series.length >= 2 && (
        <div className="mt-5">
          <p className="mb-2 text-[13px] font-medium text-ink-2">Progress over time</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                minTickGap={24}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                tickFormatter={(d: string) => fmt(d, 'MMM d')}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={48}
                tickCount={4}
                domain={[0, yMax]}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                tickFormatter={(v: number) => compact(v)}
              />
              <ReferenceLine y={goal.target} stroke="var(--chart-axis)" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ stroke: 'var(--border-strong)' }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as { date: string; saved: number } | undefined
                  if (!active || !row) return null
                  return (
                    <TooltipBox
                      title={fmt(row.date, 'MMM d, yyyy')}
                      rows={[
                        { label: 'Saved', value: money(row.saved), color: colorHex(goal.color) },
                        { label: 'Target', value: money(goal.target) },
                      ]}
                    />
                  )
                }}
              />
              <Line
                type="stepAfter"
                dataKey="saved"
                stroke={colorHex(goal.color)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-1 text-xs text-muted">Dashed line: target</p>
        </div>
      )}

      <p className="mb-1 mt-5 text-[13px] font-medium text-ink-2">Contributions</p>
      {list.length ? (
        <div className="-mx-2 flex flex-col">
          {list.map((c) => (
            <div key={c.id} className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">{relativeDay(c.date)}</p>
                {c.note && <p className="truncate text-[13px] text-muted">{c.note}</p>}
              </div>
              <span className={cn('tabular shrink-0 text-sm font-semibold', c.amount >= 0 ? 'text-good' : 'text-ink')}>
                {c.amount >= 0 ? money(c.amount, { sign: true }) : `−${money(-c.amount)}`}
              </span>
              <IconButton icon={Trash2} label="Remove contribution" onClick={() => remove(c)} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState compact title="No contributions yet" description="Add money to start tracking progress." />
      )}
    </Sheet>
  )
}
