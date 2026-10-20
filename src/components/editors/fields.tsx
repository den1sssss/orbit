import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Checkbox, cn, Input, Select } from '@/components/ui'
import { addDaysISO, todayISO } from '@/lib/dates'
import { uid, useStore } from '@/lib/store'
import type { ColorKey, ID, ISODate, Subtask } from '@/lib/types'

/** Today / Tomorrow / Next week / Clear shortcuts for a date field. */
export function QuickDates({ value, onChange, allowClear = true }: {
  value?: ISODate
  onChange: (d: ISODate | undefined) => void
  allowClear?: boolean
}) {
  const today = todayISO()
  const opts: { label: string; date?: ISODate }[] = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDaysISO(today, 1) },
    { label: 'Next week', date: addDaysISO(today, 7) },
  ]
  if (allowClear) opts.push({ label: 'No date', date: undefined })
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.date)}
          className={cn(
            'h-7 rounded-lg px-2.5 text-xs font-medium transition-colors',
            value === o.date ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Comma-separated tags. */
export function TagsInput({ value, onChange, placeholder = 'e.g. focus, client-a' }: {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}) {
  const [text, setText] = useState(value.join(', '))
  return (
    <Input
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value)
        onChange(
          e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
        )
      }}
    />
  )
}

const PROJECT_COLORS: ColorKey[] = ['indigo', 'teal', 'orange', 'pink', 'blue', 'green', 'violet', 'amber']

/** Project picker with inline "New project" creation. */
export function ProjectSelect({ value, onChange }: { value?: ID; onChange: (id: ID | undefined) => void }) {
  const projects = useStore((s) => s.projects)
  const insert = useStore((s) => s.insert)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const create = () => {
    const n = name.trim()
    if (!n) return
    const p = insert('projects', {
      id: uid(), name: n, status: 'active', createdAt: Date.now(),
      color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    })
    onChange(p.id)
    setCreating(false)
    setName('')
  }
  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={name}
          placeholder="Project name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              create()
            }
          }}
        />
        <Button variant="primary" onClick={create}>Add</Button>
        <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
      </div>
    )
  }
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') setCreating(true)
        else onChange(e.target.value || undefined)
      }}
    >
      <option value="">No project</option>
      {projects.filter((p) => p.status !== 'done' || p.id === value).map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
      <option value="__new">+ New project…</option>
    </Select>
  )
}

/** Editable checklist used by tasks (subtasks) and notes. */
export function ChecklistEditor({ items, onChange, placeholder = 'Add item' }: {
  items: Subtask[]
  onChange: (items: Subtask[]) => void
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t) return
    onChange([...items, { id: uid(), title: t, done: false }])
    setText('')
  }
  return (
    <div className="flex flex-col gap-1">
      {items.map((it) => (
        <div key={it.id} className="group flex items-center gap-2.5 rounded-lg py-1">
          <Checkbox
            checked={it.done}
            label={it.title}
            size={18}
            onChange={(done) => onChange(items.map((x) => (x.id === it.id ? { ...x, done } : x)))}
          />
          <input
            value={it.title}
            onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))}
            className={cn(
              'min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm',
              it.done && 'text-muted line-through',
            )}
          />
          <button
            type="button"
            aria-label="Remove item"
            onClick={() => onChange(items.filter((x) => x.id !== it.id))}
            className="rounded p-1 text-muted opacity-60 hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2.5 py-1">
        <Plus size={18} className="text-muted" />
        <input
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm"
        />
      </div>
    </div>
  )
}
