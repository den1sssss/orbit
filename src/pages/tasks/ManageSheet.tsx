import { useEffect, useMemo, useState } from 'react'
import { FolderKanban, Plus, Tags, Trash2 } from 'lucide-react'
import {
  Button, cn, ColorPicker, EmptyState, IconButton, Input, Progress, Segmented, Select, Sheet,
} from '@/components/ui'
import { colorHex } from '@/lib/icons'
import { uid, useStore } from '@/lib/store'
import { confirm, toast } from '@/lib/ui'
import type { ColorKey, ID, Project, TaskCategory } from '@/lib/types'
import { nextColor, plural } from './lib'

export type ManageTab = 'categories' | 'projects'

const PROJECT_STATUS: { value: Project['status']; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
]

/** Add / rename / recolor / delete task categories and work projects. */
export function ManageSheet({
  open, onClose, tab, onTab,
}: {
  open: boolean
  onClose: () => void
  tab: ManageTab
  onTab: (t: ManageTab) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Categories & projects" size="lg">
      <Segmented<ManageTab>
        block
        value={tab}
        onChange={onTab}
        className="mb-4"
        options={[
          { value: 'categories', label: 'Categories', icon: Tags },
          { value: 'projects', label: 'Projects', icon: FolderKanban },
        ]}
      />
      {tab === 'categories' ? <CategoriesPanel /> : <ProjectsPanel />}
    </Sheet>
  )
}

// ───────────────────────── Shared bits ─────────────────────────

/** Text input that commits on blur / Enter (empty reverts unless allowed). */
function InlineText({
  value, onCommit, placeholder, allowEmpty, label, className,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  allowEmpty?: boolean
  label: string
  className?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => {
    const t = text.trim()
    if (!t && !allowEmpty) {
      setText(value)
      return
    }
    if (t !== value) onCommit(t)
  }
  return (
    <Input
      value={text}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          setText(value)
        }
      }}
      className={className}
    />
  )
}

function ColorButton({ color, onClick, expanded }: { color: ColorKey; onClick: () => void; expanded: boolean }) {
  return (
    <button
      type="button"
      aria-label="Change color"
      aria-expanded={expanded}
      onClick={onClick}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors',
        expanded ? 'border-line-strong bg-surface-2' : 'border-transparent hover:bg-surface-2',
      )}
    >
      <span className="h-4 w-4 rounded-full" style={{ background: colorHex(color) }} />
    </button>
  )
}

function AddRow({ placeholder, onAdd, autoFocus }: { placeholder: string; onAdd: (name: string) => void; autoFocus?: boolean }) {
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (!n) return
    onAdd(n)
    setName('')
  }
  return (
    <form
      className="mb-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <Input
        data-autofocus={autoFocus ? true : undefined}
        value={name}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setName(e.target.value)}
      />
      <Button type="submit" variant="primary" icon={Plus} disabled={!name.trim()}>
        Add
      </Button>
    </form>
  )
}

// ───────────────────────── Categories ─────────────────────────

function CategoriesPanel() {
  const categories = useStore((s) => s.taskCategories)
  const tasks = useStore((s) => s.tasks)
  const [colorFor, setColorFor] = useState<ID | null>(null)
  const [deleting, setDeleting] = useState<ID | null>(null)
  const [target, setTarget] = useState<ID>('')

  const counts = useMemo(() => {
    const m = new Map<ID, { open: number; done: number }>()
    for (const t of tasks) {
      const c = m.get(t.categoryId) ?? { open: 0, done: 0 }
      if (t.status === 'done') c.done++
      else c.open++
      m.set(t.categoryId, c)
    }
    return m
  }, [tasks])

  const add = (name: string) => {
    const { insert } = useStore.getState()
    insert('taskCategories', { id: uid(), name, color: nextColor(categories.map((c) => c.color)) })
    toast(`Category “${name}” added`)
  }

  const remove = async (cat: TaskCategory, moveTo?: TaskCategory) => {
    const { patch, remove: del, insert } = useStore.getState()
    const affected = useStore.getState().tasks.filter((t) => t.categoryId === cat.id).map((t) => t.id)
    const ok = await confirm({
      title: `Delete “${cat.name}”?`,
      message: affected.length && moveTo
        ? `${plural(affected.length, 'task')} will move to “${moveTo.name}”.`
        : 'This category has no tasks.',
      confirmLabel: 'Delete category',
      danger: true,
    })
    if (!ok) return
    if (moveTo) for (const id of affected) patch('tasks', id, { categoryId: moveTo.id })
    del('taskCategories', cat.id)
    setDeleting(null)
    toast('Category deleted', {
      action: {
        label: 'Undo',
        onClick: () => {
          insert('taskCategories', cat)
          for (const id of affected) patch('tasks', id, { categoryId: cat.id })
        },
      },
    })
  }

  const startDelete = (cat: TaskCategory) => {
    const c = counts.get(cat.id)
    const total = (c?.open ?? 0) + (c?.done ?? 0)
    if (!total) {
      void remove(cat)
      return
    }
    setColorFor(null)
    setDeleting(cat.id)
    setTarget(categories.find((x) => x.id !== cat.id)?.id ?? '')
  }

  return (
    <div>
      <AddRow placeholder="New category, e.g. Side project" onAdd={add} autoFocus />
      {categories.length === 0 && (
        <EmptyState compact icon={Tags} title="No categories" description="Add one to start organizing tasks." />
      )}
      <ul className="flex flex-col gap-2">
        {categories.map((cat) => {
          const c = counts.get(cat.id) ?? { open: 0, done: 0 }
          const others = categories.filter((x) => x.id !== cat.id)
          const moveTo = others.find((x) => x.id === target)
          return (
            <li key={cat.id} className="rounded-2xl border border-line p-1.5">
              <div className="flex items-center gap-1.5">
                <ColorButton
                  color={cat.color}
                  expanded={colorFor === cat.id}
                  onClick={() => setColorFor(colorFor === cat.id ? null : cat.id)}
                />
                <InlineText
                  label="Category name"
                  value={cat.name}
                  onCommit={(name) => useStore.getState().patch('taskCategories', cat.id, { name })}
                  className="min-w-0 flex-1"
                />
                <span className="tabular hidden w-24 shrink-0 text-right text-xs text-muted sm:block">
                  {c.open} open · {c.done} done
                </span>
                <IconButton
                  icon={Trash2}
                  label={`Delete ${cat.name}`}
                  disabled={categories.length <= 1}
                  title={categories.length <= 1 ? 'Keep at least one category' : `Delete ${cat.name}`}
                  onClick={() => startDelete(cat)}
                />
              </div>
              <p className="tabular px-2 pb-1 pt-1 text-xs text-muted sm:hidden">
                {c.open} open · {c.done} done
              </p>
              {colorFor === cat.id && (
                <div className="px-2 pb-2 pt-2">
                  <ColorPicker value={cat.color} onChange={(color) => useStore.getState().patch('taskCategories', cat.id, { color })} />
                </div>
              )}
              {deleting === cat.id && (
                <div className="m-1 mt-2 rounded-xl bg-surface-2 p-3">
                  <p className="text-[13px] text-ink-2">
                    Move its {plural(c.open + c.done, 'task')} to:
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Move tasks to" className="sm:flex-1">
                      {others.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </Select>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setDeleting(null)} className="flex-1 sm:flex-none">
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        disabled={!moveTo}
                        onClick={() => moveTo && void remove(cat, moveTo)}
                        className="flex-1 sm:flex-none"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ───────────────────────── Projects ─────────────────────────

const STATUS_RANK: Record<Project['status'], number> = { active: 0, paused: 1, done: 2 }

function ProjectsPanel() {
  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const [colorFor, setColorFor] = useState<ID | null>(null)

  const sorted = useMemo(
    () => [...projects].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.createdAt - a.createdAt),
    [projects],
  )

  const counts = useMemo(() => {
    const m = new Map<ID, { open: number; done: number }>()
    for (const t of tasks) {
      if (!t.projectId) continue
      const c = m.get(t.projectId) ?? { open: 0, done: 0 }
      if (t.status === 'done') c.done++
      else c.open++
      m.set(t.projectId, c)
    }
    return m
  }, [tasks])

  const add = (name: string) => {
    useStore.getState().insert('projects', {
      id: uid(),
      name,
      status: 'active',
      color: nextColor(projects.map((p) => p.color)),
      createdAt: Date.now(),
    })
    toast(`Project “${name}” added`)
  }

  const remove = async (p: Project) => {
    const s = useStore.getState()
    const linked = {
      tasks: s.tasks.filter((x) => x.projectId === p.id).map((x) => x.id),
      events: s.events.filter((x) => x.projectId === p.id).map((x) => x.id),
      notes: s.notes.filter((x) => x.projectId === p.id).map((x) => x.id),
      transactions: s.transactions.filter((x) => x.projectId === p.id).map((x) => x.id),
    }
    const total = linked.tasks.length + linked.events.length + linked.notes.length + linked.transactions.length
    const ok = await confirm({
      title: `Delete “${p.name}”?`,
      message: total
        ? `${plural(total, 'linked item')} (tasks, events, notes, transactions) will be kept but no longer belong to this project.`
        : 'Nothing is linked to this project yet.',
      confirmLabel: 'Delete project',
      danger: true,
    })
    if (!ok) return
    const relink = (projectId: ID | undefined) => {
      const { patch } = useStore.getState()
      for (const id of linked.tasks) patch('tasks', id, { projectId })
      for (const id of linked.events) patch('events', id, { projectId })
      for (const id of linked.notes) patch('notes', id, { projectId })
      for (const id of linked.transactions) patch('transactions', id, { projectId })
    }
    relink(undefined)
    useStore.getState().remove('projects', p.id)
    toast('Project deleted', {
      action: {
        label: 'Undo',
        onClick: () => {
          useStore.getState().insert('projects', p)
          relink(p.id)
        },
      },
    })
  }

  return (
    <div>
      <AddRow placeholder="New project, e.g. Client website" onAdd={add} />
      {sorted.length === 0 && (
        <EmptyState
          compact
          icon={FolderKanban}
          title="No projects yet"
          description="Projects group tasks, events, notes and money for a client or piece of work."
        />
      )}
      <ul className="flex flex-col gap-2.5">
        {sorted.map((p) => {
          const c = counts.get(p.id) ?? { open: 0, done: 0 }
          const total = c.open + c.done
          const patch = (x: Partial<Project>) => useStore.getState().patch('projects', p.id, x)
          return (
            <li key={p.id} className="rounded-2xl border border-line p-1.5">
              <div className="flex items-center gap-1.5">
                <ColorButton color={p.color} expanded={colorFor === p.id} onClick={() => setColorFor(colorFor === p.id ? null : p.id)} />
                <InlineText label="Project name" value={p.name} onCommit={(name) => patch({ name })} className="min-w-0 flex-1 font-medium" />
                <IconButton icon={Trash2} label={`Delete ${p.name}`} onClick={() => void remove(p)} />
              </div>
              {colorFor === p.id && (
                <div className="px-2 pb-1 pt-2">
                  <ColorPicker value={p.color} onChange={(color) => patch({ color })} />
                </div>
              )}
              <div className="mt-1.5 flex flex-col gap-2 px-1 pb-1 sm:flex-row sm:items-center">
                <InlineText
                  label="Client"
                  allowEmpty
                  value={p.client ?? ''}
                  placeholder="Client (optional)"
                  onCommit={(client) => patch({ client: client || undefined })}
                  className="min-w-0 sm:flex-1"
                />
                <Segmented<Project['status']>
                  value={p.status}
                  onChange={(status) => patch({ status })}
                  options={PROJECT_STATUS}
                  className="self-start sm:self-auto"
                />
              </div>
              <div className="flex items-center gap-3 px-2 pb-1.5 pt-1.5">
                <Progress value={total ? c.done / total : 0} color={p.color} className="flex-1" label={`${p.name} progress`} />
                <span className="tabular shrink-0 text-xs text-muted">
                  {c.open} open · {c.done} done
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
