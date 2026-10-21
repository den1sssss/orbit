import { createContext, useContext, type ReactNode } from 'react'
import {
  ArrowRight, Bell, CalendarDays, Clock, Copy, Flag, ListChecks, Pencil, Repeat, Sun, Trash2,
} from 'lucide-react'
import { Badge, Checkbox, cn, ColorDot, Menu, type MenuItem } from '@/components/ui'
import { addDaysISO, fmtTime, relativeDay } from '@/lib/dates'
import { PRIORITY_LABELS, STATUS_LABELS } from '@/lib/defaults'
import { openEditor, removeWithUndo } from '@/lib/ui'
import type { ID, ISODate, Project, Task, TaskCategory } from '@/lib/types'
import { FloatingMenu } from './common'
import {
  cyclePriority, duplicateTask, isOverdue, moveTo, nextPriority, priorityRing, setStatus, STATUS_DOT, STATUSES,
  toggleWithUndo,
} from './lib'

// ───────────────────────── Lookups ─────────────────────────

export interface Lookups {
  cats: Map<ID, TaskCategory>
  projs: Map<ID, Project>
  today: ISODate
}

const LookupCtx = createContext<Lookups>({ cats: new Map(), projs: new Map(), today: '' })

export function LookupProvider({ value, children }: { value: Lookups; children: ReactNode }) {
  return <LookupCtx.Provider value={value}>{children}</LookupCtx.Provider>
}

export function useLookups() {
  return useContext(LookupCtx)
}

// ───────────────────────── Pieces ─────────────────────────

/** Round checkbox with the ring colored by priority and a 40px+ hit area. */
export function TaskCheck({ task, size = 22 }: { task: Task; size?: number }) {
  const done = task.status === 'done'
  return (
    <div
      className="-m-2.5 flex shrink-0 cursor-pointer p-2.5"
      onClick={(e) => {
        // Taps on the padding around the box; the box itself stops propagation.
        e.stopPropagation()
        toggleWithUndo(task)
      }}
    >
      <Checkbox
        round
        size={size}
        checked={done}
        color={priorityRing(task.priority)}
        label={done ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
        onChange={() => toggleWithUndo(task)}
      />
    </div>
  )
}

export function TaskMeta({
  task, showDate = true, hideStatus, className,
}: {
  task: Task
  showDate?: boolean
  /** Kanban columns already say the status. */
  hideStatus?: boolean
  className?: string
}) {
  const { cats, projs, today } = useLookups()
  const cat = cats.get(task.categoryId)
  const project = task.projectId ? projs.get(task.projectId) : undefined
  const done = task.status === 'done'
  const overdue = isOverdue(task, today)
  const subDone = task.subtasks.filter((s) => s.done).length
  const flag = !done && (task.priority === 'urgent' || task.priority === 'high')

  const parts: ReactNode[] = []
  if (flag) {
    parts.push(
      <span key="p" className="inline-flex items-center gap-1 font-medium" style={{ color: priorityRing(task.priority) }}>
        <Flag size={12} strokeWidth={2.4} />
        {PRIORITY_LABELS[task.priority]}
      </span>,
    )
  }
  if (task.dueDate && (showDate || overdue)) {
    parts.push(
      <span key="d" className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-bad')}>
        <CalendarDays size={12.5} />
        {overdue && task.dueDate === addDaysISO(today, -1) ? 'Yesterday' : relativeDay(task.dueDate)}
      </span>,
    )
  }
  if (task.dueDate && task.dueTime) {
    parts.push(
      <span key="t" className="inline-flex items-center gap-1">
        <Clock size={12.5} />
        {fmtTime(task.dueTime)}
      </span>,
    )
  }
  if (!hideStatus && (task.status === 'in_progress' || task.status === 'waiting')) {
    parts.push(
      <Badge key="s" tone={task.status === 'waiting' ? 'warn' : 'accent'}>
        {STATUS_LABELS[task.status]}
      </Badge>,
    )
  }
  if (cat) {
    parts.push(
      <span key="c" className="inline-flex items-center gap-1.5">
        <ColorDot color={cat.color} size={7} />
        {cat.name}
      </span>,
    )
  }
  if (project) {
    parts.push(
      <Badge key="pr" color={project.color} className="max-w-[14rem]">
        <span className="truncate">{project.name}</span>
      </Badge>,
    )
  }
  if (task.subtasks.length) {
    parts.push(
      <span key="st" className={cn('tabular inline-flex items-center gap-1', subDone === task.subtasks.length && 'text-good')}>
        <ListChecks size={13} />
        {subDone}/{task.subtasks.length}
      </span>,
    )
  }
  for (const tag of task.tags.slice(0, 3)) {
    parts.push(<span key={`#${tag}`} className="text-muted">#{tag}</span>)
  }
  if (task.tags.length > 3) parts.push(<span key="#more">+{task.tags.length - 3}</span>)
  if (task.repeat && !done) {
    parts.push(<Repeat key="r" size={12.5} aria-label="Repeats" />)
  }
  if (task.dueDate && task.reminder !== undefined && !done) {
    parts.push(<Bell key="b" size={12.5} aria-label="Reminder set" />)
  }
  if (!parts.length) return null
  return (
    <div className={cn('mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] leading-5 text-muted', className)}>
      {parts}
    </div>
  )
}

export function taskMenuItems(task: Task, today: ISODate): MenuItem[] {
  const tomorrow = addDaysISO(today, 1)
  const items: MenuItem[] = [
    { label: 'Edit', icon: Pencil, onClick: () => openEditor({ kind: 'task', id: task.id }) },
    { label: 'Duplicate', icon: Copy, onClick: () => duplicateTask(task) },
  ]
  if (task.status !== 'done') {
    if (task.dueDate !== today) items.push({ label: 'Do today', icon: Sun, onClick: () => moveTo(task, today, 'today') })
    if (task.dueDate !== tomorrow) {
      items.push({ label: 'Move to tomorrow', icon: ArrowRight, onClick: () => moveTo(task, tomorrow, 'tomorrow') })
    }
  }
  items.push({
    label: `Set priority: ${PRIORITY_LABELS[nextPriority(task.priority)]}`,
    icon: Flag,
    onClick: () => cyclePriority(task),
  })
  items.push({
    label: 'Delete',
    icon: Trash2,
    danger: true,
    onClick: () => removeWithUndo('tasks', task.id, 'Task deleted'),
  })
  return items
}

// ───────────────────────── Row & card ─────────────────────────

/** One task in a list. Click anywhere (or the title, by keyboard) to edit. */
export function TaskRow({ task, showDate = true, trailing }: { task: Task; showDate?: boolean; trailing?: ReactNode }) {
  const { today } = useLookups()
  const done = task.status === 'done'
  return (
    <div
      onClick={() => openEditor({ kind: 'task', id: task.id })}
      className="group flex min-h-14 cursor-pointer items-start gap-3 px-3.5 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2/60 sm:px-4"
    >
      <div className="pt-px">
        <TaskCheck task={task} />
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className={cn(
            'block max-w-full text-left text-[15px] leading-snug outline-none focus-visible:underline sm:text-sm',
            done ? 'text-muted line-through decoration-1' : 'text-ink',
          )}
        >
          <span className="break-words">{task.title}</span>
        </button>
        <TaskMeta task={task} showDate={showDate} />
      </div>
      {trailing}
      <div className="-my-0.5 shrink-0">
        <Menu items={taskMenuItems(task, today)} label={`Actions for “${task.title}”`} />
      </div>
    </div>
  )
}

/** Kanban card with a status-move menu. */
export function BoardCard({ task }: { task: Task }) {
  const done = task.status === 'done'
  const items: MenuItem[] = [
    ...STATUSES.filter((s) => s !== task.status).map<MenuItem>((s) => ({
      label: `Move to ${STATUS_LABELS[s]}`,
      icon: ArrowRight,
      onClick: () => setStatus(task, s),
    })),
    { label: 'Edit', icon: Pencil, onClick: () => openEditor({ kind: 'task', id: task.id }) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeWithUndo('tasks', task.id, 'Task deleted') },
  ]
  return (
    <div
      onClick={() => openEditor({ kind: 'task', id: task.id })}
      className="cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-card transition-colors hover:border-line-strong"
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-px">
          <TaskCheck task={task} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className={cn(
              'block max-w-full text-left text-sm font-medium leading-snug outline-none focus-visible:underline',
              done ? 'text-muted line-through' : 'text-ink',
            )}
          >
            <span className="break-words">{task.title}</span>
          </button>
          <TaskMeta task={task} hideStatus />
        </div>
        <div className="-my-1 -mr-1 shrink-0">
          <FloatingMenu items={items} label={`Move “${task.title}”`} />
        </div>
      </div>
    </div>
  )
}

export function StatusDot({ status }: { status: Task['status'] }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_DOT[status] }} />
}
