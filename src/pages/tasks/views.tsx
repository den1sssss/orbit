import { useMemo, useState, type ReactNode } from 'react'
import {
  CalendarRange, CircleCheck, Inbox, ListTodo, Plus, Sun, Trash2, TriangleAlert,
} from 'lucide-react'
import { Button, Card, cn, ColorDot, EmptyState, IconButton, Progress } from '@/components/ui'
import { addDaysISO, eachDay, fmt, relativeDay, relativeDistance } from '@/lib/dates'
import { PRIORITY_ORDER, STATUS_LABELS } from '@/lib/defaults'
import { useStore } from '@/lib/store'
import { confirm, openEditor, toast } from '@/lib/ui'
import type { ID, Task, TaskCategory, TaskStatus } from '@/lib/types'
import { GroupHeader, RowList } from './common'
import {
  activeToday, byDue, byPriority, completedTime, doneOn, localDay, moveManyTo, moveTo, plural, STATUSES,
} from './lib'
import { BoardCard, StatusDot, TaskRow, useLookups } from './TaskRow'

interface ViewProps {
  tasks: Task[]
  /** Shown inside empty states (e.g. "Clear filters"). */
  emptyAction?: ReactNode
  filtered?: boolean
}

function NoMatches({ emptyAction }: { emptyAction?: ReactNode }) {
  return (
    <Card>
      <EmptyState icon={Inbox} title="No tasks match these filters" description="Try another category, project or search." action={emptyAction} />
    </Card>
  )
}

// ───────────────────────── Today ─────────────────────────

export function TodayView({
  tasks, emptyAction, filtered, emphasizeOverdue, onSeeAll,
}: ViewProps & { emphasizeOverdue?: boolean; onSeeAll: () => void }) {
  const { today } = useLookups()
  const [noDateOpen, setNoDateOpen] = useState<boolean | null>(null)

  const { overdue, due, noDate, noDateTotal } = useMemo(() => {
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && activeToday(t, today)).sort(byPriority)
    const due = tasks.filter((t) => t.dueDate === today).sort(byPriority)
    const undated = tasks
      .filter((t) => !t.dueDate && t.status !== 'done')
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt)
    return { overdue, due, noDate: undated.slice(0, 5), noDateTotal: undated.length }
  }, [tasks, today])

  const openOverdue = overdue.filter((t) => t.status !== 'done')
  const total = overdue.length + due.length
  const done = [...overdue, ...due].filter((t) => t.status === 'done').length
  const dueDone = due.filter((t) => t.status === 'done').length
  const showNoDate = noDateOpen ?? total === 0

  if (!total && !noDateTotal) {
    if (filtered) return <NoMatches emptyAction={emptyAction} />
    return (
      <Card>
        <EmptyState
          icon={Sun}
          title="Nothing due today"
          description="You're all clear. Add a task above, or plan ahead in Upcoming."
          action={emptyAction}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {total > 0 && (
        <Card padded={false} className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium text-ink-2">Today’s progress</p>
            <p className="tabular text-[13px] text-muted">
              <span className="font-semibold text-ink">{done}</span> of {total} done
            </p>
          </div>
          <Progress
            value={done / total}
            tone={done === total ? 'good' : 'accent'}
            height={8}
            className="mt-2.5"
            label="Today’s progress"
          />
          {done === total && <p className="mt-2 text-xs font-medium text-good">Everything for today is done.</p>}
        </Card>
      )}

      {emphasizeOverdue && openOverdue.length === 0 && (
        <Card padded={false} className="flex items-center gap-3 p-4">
          <CircleCheck size={20} className="shrink-0 text-good" />
          <p className="text-sm text-ink-2">No overdue tasks — you’re all caught up.</p>
        </Card>
      )}

      {overdue.length > 0 && (
        <section>
          <GroupHeader
            title="Overdue"
            icon={TriangleAlert}
            tone="bad"
            count={openOverdue.length}
            action={
              openOverdue.length > 0 && (
                <Button size="sm" variant="ghost" icon={Sun} onClick={() => moveManyTo(openOverdue, today, 'today')}>
                  Move all to today
                </Button>
              )
            }
          />
          <RowList emphasis={emphasizeOverdue ? 'bad' : undefined}>
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </RowList>
        </section>
      )}

      <section>
        <GroupHeader
          title="Today"
          icon={Sun}
          count={due.length ? `${dueDone}/${due.length}` : undefined}
          hint={fmt(today, 'EEEE, MMM d')}
        />
        {due.length ? (
          <RowList>
            {due.map((t) => (
              <TaskRow key={t.id} task={t} showDate={false} />
            ))}
          </RowList>
        ) : (
          <Card padded={false} className="px-4 py-5 text-center text-[13px] text-muted">
            {overdue.length ? 'Nothing else is due today.' : 'Nothing due today — pick something from below.'}
          </Card>
        )}
      </section>

      {noDateTotal > 0 && (
        <section>
          <GroupHeader
            collapsible
            open={showNoDate}
            onToggle={() => setNoDateOpen(!showNoDate)}
            title="No date"
            count={noDateTotal}
            hint={noDateTotal > 5 ? 'top 5 by priority' : 'so nothing gets lost'}
            action={
              noDateTotal > 5 && (
                <Button size="sm" variant="ghost" onClick={onSeeAll}>
                  See all
                </Button>
              )
            }
          />
          {showNoDate && (
            <RowList>
              {noDate.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  trailing={
                    <div className="-my-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <IconButton size="sm" icon={Sun} label="Do today" onClick={() => moveTo(t, today, 'today')} />
                    </div>
                  }
                />
              ))}
            </RowList>
          )}
        </section>
      )}
    </div>
  )
}

// ───────────────────────── Upcoming ─────────────────────────

export function UpcomingView({ tasks, emptyAction, filtered }: ViewProps) {
  const { today } = useLookups()
  const { days, later } = useMemo(() => {
    const start = addDaysISO(today, 1)
    const end = addDaysISO(today, 14)
    const byDay = new Map<string, Task[]>()
    const later: Task[] = []
    for (const t of tasks) {
      if (!t.dueDate || t.dueDate < start || !activeToday(t, today)) continue
      if (t.dueDate > end) later.push(t)
      else byDay.set(t.dueDate, [...(byDay.get(t.dueDate) ?? []), t])
    }
    const days = eachDay(start, end)
      .filter((d) => byDay.has(d))
      .map((d) => ({ date: d, tasks: byDay.get(d)!.sort(byPriority) }))
    return { days, later: later.sort(byDue) }
  }, [tasks, today])

  if (!days.length && !later.length) {
    if (filtered) return <NoMatches emptyAction={emptyAction} />
    return (
      <Card>
        <EmptyState
          icon={CalendarRange}
          title="Nothing scheduled"
          description="Tasks with a deadline after today show up here, grouped by day."
          action={emptyAction}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {days.map((d, i) => (
        <section key={d.date}>
          <GroupHeader
            title={relativeDay(d.date)}
            count={d.tasks.length}
            hint={i === 0 && d.date === addDaysISO(today, 1) ? fmt(d.date, 'EEEE') : relativeDistance(d.date)}
          />
          <RowList>
            {d.tasks.map((t) => (
              <TaskRow key={t.id} task={t} showDate={false} />
            ))}
          </RowList>
        </section>
      ))}
      {later.length > 0 && (
        <section>
          <GroupHeader title="Later" count={later.length} hint="after the next two weeks" />
          <RowList>
            {later.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </RowList>
        </section>
      )}
    </div>
  )
}

// ───────────────────────── All (by category) ─────────────────────────

export function AllView({ tasks, emptyAction, filtered }: ViewProps) {
  const { today } = useLookups()
  const categories = useStore((s) => s.taskCategories)
  const [expanded, setExpanded] = useState<Set<ID>>(() => new Set())

  const groups = useMemo(() => {
    const known = new Set(categories.map((c) => c.id))
    const list: { cat: TaskCategory; tasks: Task[] }[] = categories.map((c) => ({
      cat: c,
      tasks: tasks.filter((t) => t.categoryId === c.id),
    }))
    const orphans = tasks.filter((t) => !known.has(t.categoryId))
    if (orphans.length) list.push({ cat: { id: '__none', name: 'Uncategorized', color: 'slate' }, tasks: orphans })
    return list
      .filter((g) => g.tasks.length)
      .map((g) => {
        const visible = g.tasks.filter((t) => activeToday(t, today)).sort(byPriority)
        const older = g.tasks
          .filter((t) => t.status === 'done' && !doneOn(t, today))
          .sort((a, b) => completedTime(b) - completedTime(a))
        const done = g.tasks.filter((t) => t.status === 'done').length
        return { ...g, visible, older, done }
      })
  }, [categories, tasks, today])

  if (!groups.length) {
    if (filtered) return <NoMatches emptyAction={emptyAction} />
    return (
      <Card>
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          description="Add your first to-do above — try “Send invoice tomorrow !high #work”."
          action={emptyAction}
        />
      </Card>
    )
  }

  const toggle = (id: ID) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="grid grid-cols-1 items-start gap-x-5 gap-y-6 xl:grid-cols-2">
      {groups.map((g) => {
        const open = expanded.has(g.cat.id)
        const total = g.tasks.length
        return (
          <section key={g.cat.id} className="min-w-0">
            <div className="mb-2 flex min-h-8 items-center gap-2.5 px-1">
              <ColorDot color={g.cat.color} size={9} />
              <h2 className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{g.cat.name}</h2>
              <span className="tabular shrink-0 text-[13px] text-muted">
                {g.done}/{total}
              </span>
              <div className="ml-auto w-20 shrink-0 sm:w-28">
                <Progress value={g.done / total} color={g.cat.color} label={`${g.cat.name}: ${g.done} of ${total} done`} />
              </div>
            </div>
            <RowList>
              {g.visible.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
              {open && g.older.map((t) => <TaskRow key={t.id} task={t} />)}
              {g.older.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(g.cat.id)}
                  className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[13px] text-muted transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2/60 hover:text-ink"
                >
                  <CircleCheck size={15} />
                  {!g.visible.length && !open && <span className="font-medium text-good">All done ·</span>}
                  {open ? 'Hide' : 'Show'} {plural(g.older.length, 'completed task')}
                </button>
              )}
            </RowList>
          </section>
        )
      })}
    </div>
  )
}

// ───────────────────────── Board ─────────────────────────

export function BoardView({
  tasks, onSeeDone, newDefaults,
}: ViewProps & { onSeeDone: () => void; newDefaults: Partial<Task> }) {
  const columns = useMemo(() => {
    const out = {} as Record<TaskStatus, Task[]>
    for (const s of STATUSES) out[s] = []
    for (const t of tasks) out[t.status].push(t)
    for (const s of STATUSES) {
      if (s === 'done') out[s].sort((a, b) => completedTime(b) - completedTime(a))
      else out[s].sort(byDue)
    }
    return out
  }, [tasks])

  const DONE_LIMIT = 15

  return (
    <div
      className={cn(
        '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 scrollbar-none',
        'sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0',
        'xl:grid xl:snap-none xl:grid-cols-4 xl:overflow-visible',
      )}
    >
      {STATUSES.map((s) => {
        const list = s === 'done' ? columns[s].slice(0, DONE_LIMIT) : columns[s]
        return (
          <section
            key={s}
            aria-label={STATUS_LABELS[s]}
            className="flex w-[80vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl border border-line bg-surface-2/60 p-2 sm:w-[280px] xl:w-auto xl:max-w-none"
          >
            <header className="flex min-h-9 items-center justify-between gap-2 px-2">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <StatusDot status={s} />
                {STATUS_LABELS[s]}
              </h3>
              <span className="tabular text-xs text-muted">{columns[s].length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {list.map((t) => (
                <BoardCard key={t.id} task={t} />
              ))}
              {!list.length && (
                <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[13px] text-muted">
                  {s === 'done' ? 'Finished tasks land here' : 'No tasks'}
                </p>
              )}
            </div>
            {s === 'done' && columns.done.length > DONE_LIMIT && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={onSeeDone}>
                See all {columns.done.length}
              </Button>
            )}
            {s !== 'done' && (
              <Button
                variant="ghost"
                icon={Plus}
                className="mt-2"
                onClick={() => openEditor({ kind: 'task', initial: { ...newDefaults, status: s } })}
              >
                Add task
              </Button>
            )}
          </section>
        )
      })}
    </div>
  )
}

// ───────────────────────── Done ─────────────────────────

const DAY_MS = 86_400_000

export function DoneView({ tasks, emptyAction, filtered }: ViewProps) {
  const [limit, setLimit] = useState(60)
  const done = useMemo(
    () => tasks.filter((t) => t.status === 'done').sort((a, b) => completedTime(b) - completedTime(a)),
    [tasks],
  )
  const groups = useMemo(() => {
    const out: { day: string; tasks: Task[] }[] = []
    for (const t of done.slice(0, limit)) {
      const day = localDay(completedTime(t))
      const last = out[out.length - 1]
      if (last && last.day === day) last.tasks.push(t)
      else out.push({ day, tasks: [t] })
    }
    return out
  }, [done, limit])

  const clearOld = async () => {
    const cutoff = Date.now() - 30 * DAY_MS
    const old = done.filter((t) => completedTime(t) < cutoff)
    if (!old.length) return
    const ok = await confirm({
      title: 'Clear old completed tasks?',
      message: `${plural(old.length, 'task')} completed more than 30 days ago will be deleted${filtered ? ' (only those matching the current filters)' : ''}.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const { remove, insert } = useStore.getState()
    const removed = old.map((t) => remove('tasks', t.id)).filter((t): t is Task => !!t)
    toast(`${plural(removed.length, 'task')} cleared`, {
      action: { label: 'Undo', onClick: () => removed.forEach((t) => insert('tasks', t)) },
    })
  }

  if (!done.length) {
    if (filtered) return <NoMatches emptyAction={emptyAction} />
    return (
      <Card>
        <EmptyState icon={CircleCheck} title="No completed tasks yet" description="Tick off a task and it’ll show up here." />
      </Card>
    )
  }

  const oldCount = done.filter((t) => completedTime(t) < Date.now() - 30 * DAY_MS).length

  return (
    <div className="flex flex-col gap-6">
      <div className="-mb-2 flex items-center justify-between gap-3 px-1">
        <p className="text-[13px] text-muted">{plural(done.length, 'completed task')}</p>
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          disabled={!oldCount}
          title={oldCount ? undefined : 'Nothing older than 30 days'}
          onClick={() => void clearOld()}
        >
          <span className="sm:hidden">Clear older than 30d</span>
          <span className="hidden sm:inline">Clear completed older than 30 days</span>
        </Button>
      </div>
      {groups.map((g) => (
        <section key={g.day}>
          <GroupHeader title={relativeDay(g.day)} count={g.tasks.length} />
          <RowList>
            {g.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </RowList>
        </section>
      ))}
      {done.length > limit && (
        <Button variant="secondary" className="self-center" onClick={() => setLimit((l) => l + 60)}>
          Show more
        </Button>
      )}
    </div>
  )
}
