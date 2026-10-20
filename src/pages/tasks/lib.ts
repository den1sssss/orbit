// Shared logic for the Tasks and Notes screens: task actions with undo,
// sorting, search matching, the quick-add token parser and small formatters.
import { format, isYesterday } from 'date-fns'
import { addDaysISO, fromISO, toISO } from '@/lib/dates'
import { PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS } from '@/lib/defaults'
import { colorHex } from '@/lib/icons'
import { makeTask, uid, useStore } from '@/lib/store'
import { openEditor, toast } from '@/lib/ui'
import type {
  ColorKey, ID, ISODate, Note, NoteCategory, Priority, Project, Task, TaskCategory, TaskStatus,
} from '@/lib/types'

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']
export const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'waiting', 'done']

/** Unchecked ring color of a task checkbox. `undefined` = the default line color. */
export function priorityRing(p: Priority): string | undefined {
  switch (p) {
    case 'urgent': return colorHex('red')
    case 'high': return colorHex('orange')
    case 'medium': return `color-mix(in srgb, ${colorHex('blue')} 50%, var(--border-strong))`
    case 'low': return undefined
  }
}

export const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'var(--muted)',
  in_progress: 'var(--accent)',
  waiting: 'var(--warn)',
  done: 'var(--good)',
}

export const NOTE_COLORS: Record<NoteCategory, ColorKey> = {
  ideas: 'amber',
  important: 'red',
  work: 'blue',
  business: 'violet',
  personal: 'green',
  daily: 'teal',
}

// ───────────────────────── Predicates & sorting ─────────────────────────

export function localDay(ts: number): ISODate {
  return toISO(new Date(ts))
}

/** Completed on the given local day. */
export function doneOn(t: Task, iso: ISODate): boolean {
  return t.status === 'done' && !!t.completedAt && localDay(t.completedAt) === iso
}

/** Open, or completed today — keeps just-checked tasks in place until tomorrow. */
export function activeToday(t: Task, today: ISODate): boolean {
  return t.status !== 'done' || doneOn(t, today)
}

export function isOverdue(t: Task, today: ISODate): boolean {
  return t.status !== 'done' && !!t.dueDate && t.dueDate < today
}

/** Done last, then priority, then due date (none last), then time. */
export function byPriority(a: Task, b: Task): number {
  const d = (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0)
  if (d) return d
  const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  if (p) return p
  const da = a.dueDate ?? '9999-12-31'
  const db = b.dueDate ?? '9999-12-31'
  if (da !== db) return da < db ? -1 : 1
  return (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99')
}

/** Done last, then due date, then priority, then time. */
export function byDue(a: Task, b: Task): number {
  const d = (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0)
  if (d) return d
  const da = a.dueDate ?? '9999-12-31'
  const db = b.dueDate ?? '9999-12-31'
  if (da !== db) return da < db ? -1 : 1
  const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  if (p) return p
  return (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99')
}

export function completedTime(t: Task): number {
  return t.completedAt ?? t.updatedAt
}

export function normalize(s: string): string {
  return s.trim().toLowerCase()
}

export function taskMatches(t: Task, q: string, project?: Project, category?: TaskCategory): boolean {
  if (!q) return true
  const hay = [
    t.title, t.notes ?? '', ...t.tags, ...t.subtasks.map((s) => s.title),
    project?.name ?? '', project?.client ?? '', category?.name ?? '',
  ].join('\n').toLowerCase()
  return q.split(/\s+/).every((w) => hay.includes(w))
}

export function noteMatches(n: Note, q: string, project?: Project): boolean {
  if (!q) return true
  const hay = [
    n.title, n.body, ...n.tags, ...n.checklist.map((c) => c.title), project?.name ?? '',
  ].join('\n').toLowerCase()
  return q.split(/\s+/).every((w) => hay.includes(w))
}

// ───────────────────────── Task actions (with undo) ─────────────────────────

const store = () => useStore.getState()

export function toggleWithUndo(task: Task) {
  const prev: Partial<Task> = { status: task.status, completedAt: task.completedAt }
  store().toggleTask(task.id)
  if (task.status !== 'done') {
    toast('Completed', { action: { label: 'Undo', onClick: () => store().patch('tasks', task.id, prev) } })
  }
}

export function setStatus(task: Task, status: TaskStatus) {
  if (status === task.status) return
  const prev: Partial<Task> = { status: task.status, completedAt: task.completedAt }
  store().patch('tasks', task.id, {
    status,
    completedAt: status === 'done' ? Date.now() : undefined,
  })
  toast(`Moved to ${STATUS_LABELS[status]}`, {
    action: { label: 'Undo', onClick: () => store().patch('tasks', task.id, prev) },
  })
}

export function moveTo(task: Task, date: ISODate, label: string) {
  const prev: Partial<Task> = { dueDate: task.dueDate }
  store().patch('tasks', task.id, { dueDate: date })
  toast(`Moved to ${label}`, {
    action: { label: 'Undo', onClick: () => store().patch('tasks', task.id, prev) },
  })
}

/** Reschedule several tasks at once (e.g. all overdue → today). */
export function moveManyTo(tasks: Task[], date: ISODate, label: string) {
  if (!tasks.length) return
  const prev = tasks.map((t) => [t.id, t.dueDate] as const)
  for (const t of tasks) store().patch('tasks', t.id, { dueDate: date })
  toast(`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} moved to ${label}`, {
    action: {
      label: 'Undo',
      onClick: () => prev.forEach(([id, d]) => store().patch('tasks', id, { dueDate: d })),
    },
  })
}

const NEXT_PRIORITY: Record<Priority, Priority> = { low: 'medium', medium: 'high', high: 'urgent', urgent: 'low' }

export function nextPriority(p: Priority): Priority {
  return NEXT_PRIORITY[p]
}

export function cyclePriority(task: Task) {
  const next = NEXT_PRIORITY[task.priority]
  store().patch('tasks', task.id, { priority: next })
  toast(`Priority set to ${PRIORITY_LABELS[next]}`)
}

export function duplicateTask(task: Task) {
  // Clear identity/completion fields; makeTask fills fresh ones.
  const copy = makeTask({
    ...task,
    id: undefined,
    createdAt: undefined,
    completedAt: undefined,
    status: task.status === 'done' ? 'todo' : task.status,
    subtasks: task.subtasks.map((s) => ({ ...s, id: uid() })),
    tags: [...task.tags],
  })
  store().insert('tasks', copy)
  toast('Task duplicated', { action: { label: 'Edit', onClick: () => openEditor({ kind: 'task', id: copy.id }) } })
}

/** Next unused identity color (cycles when all are taken). */
export function nextColor(used: ColorKey[]): ColorKey {
  const order: ColorKey[] = ['blue', 'violet', 'green', 'amber', 'pink', 'teal', 'orange', 'indigo', 'red', 'slate']
  return order.find((c) => !used.includes(c)) ?? order[used.length % order.length]
}

// ───────────────────────── Quick-add parser ─────────────────────────

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const WEEKDAYS_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const PRIORITY_TOKENS: Record<string, Priority> = {
  urgent: 'urgent', high: 'high', med: 'medium', medium: 'medium', low: 'low',
}

export interface QuickAddResult {
  title: string
  dueDate?: ISODate
  priority?: Priority
  categoryId?: ID
  projectId?: ID
  tags: string[]
}

/** Case-insensitive prefix match on the whole name, then on any word of it. */
function matchName<T extends { name: string }>(list: T[], word: string): T | undefined {
  const w = word.toLowerCase()
  if (!w) return undefined
  return (
    list.find((x) => x.name.toLowerCase().startsWith(w)) ??
    list.find((x) => x.name.toLowerCase().split(/[\s&/,.\-–—:]+/).some((part) => part && part.startsWith(w)))
  )
}

/**
 * "Call Lena tomorrow !high #work @acme" →
 * { title: 'Call Lena', dueDate, priority: 'high', categoryId, projectId }
 */
export function parseQuickAdd(
  input: string,
  categories: TaskCategory[],
  projects: Project[],
  today: ISODate,
): QuickAddResult {
  const out: QuickAddResult = { title: '', tags: [] }
  const rest: string[] = []
  // Prefer active projects when names collide.
  const projectOrder = [...projects].sort(
    (a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0),
  )
  for (const raw of input.trim().split(/\s+/)) {
    if (!raw) continue
    const w = raw.toLowerCase()
    if (w === 'today') {
      out.dueDate = today
      continue
    }
    if (w === 'tomorrow') {
      out.dueDate = addDaysISO(today, 1)
      continue
    }
    let wd = WEEKDAYS.indexOf(w)
    if (wd < 0) wd = WEEKDAYS_FULL.indexOf(w)
    if (wd >= 0) {
      const ahead = (wd - fromISO(today).getDay() + 7) % 7 || 7
      out.dueDate = addDaysISO(today, ahead)
      continue
    }
    if (w.startsWith('!') && PRIORITY_TOKENS[w.slice(1)]) {
      out.priority = PRIORITY_TOKENS[w.slice(1)]
      continue
    }
    if (raw.startsWith('#') && raw.length > 1) {
      const word = raw.slice(1)
      const cat = out.categoryId ? undefined : matchName(categories, word)
      if (cat) out.categoryId = cat.id
      else if (!out.tags.includes(word)) out.tags.push(word)
      continue
    }
    if (raw.startsWith('@') && raw.length > 1) {
      const proj = matchName(projectOrder, raw.slice(1))
      if (proj) {
        out.projectId = proj.id
        continue
      }
    }
    rest.push(raw)
  }
  out.title = rest.join(' ')
  return out
}

// ───────────────────────── Formatting ─────────────────────────

/** "Just now", "5m ago", "3h ago", "Yesterday", "Mon", "Oct 12", "Oct 12, 2025". */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const d = new Date(ts)
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (localDay(ts) === localDay(Date.now())) return `${Math.floor(diff / 3_600_000)}h ago`
  if (isYesterday(d)) return 'Yesterday'
  if (diff < 6 * 86_400_000) return format(d, 'EEEE')
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy')
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Drop undefined keys (so spreading into a factory never overrides its defaults with undefined). */
export function compact<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) out[k] = obj[k]
  }
  return out
}
