import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Field, Input, Segmented, Select, Sheet, Textarea } from '@/components/ui'
import { PRIORITY_LABELS, REMINDER_OPTIONS, STATUS_LABELS } from '@/lib/defaults'
import { makeTask, useStore } from '@/lib/store'
import { removeWithUndo, toast } from '@/lib/ui'
import type { ID, Priority, Task, TaskStatus } from '@/lib/types'
import { ChecklistEditor, ProjectSelect, QuickDates, TagsInput } from './fields'
import { guardClose, useDraft } from './useDraft'

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

export function TaskEditor({ id, initial, onClose }: { id?: ID; initial?: Partial<Task>; onClose: () => void }) {
  const existing = useStore((s) => (id ? s.tasks.find((t) => t.id === id) : undefined))
  const categories = useStore((s) => s.taskCategories)
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const [error, setError] = useState('')
  const { draft, set, dirty } = useDraft<Task>(() =>
    existing ? { ...existing } : makeTask({ title: '', ...initial }, categories[0]?.id),
  )

  const save = () => {
    const title = draft.title.trim()
    if (!title) {
      setError('Give the task a name')
      return
    }
    const final: Task = {
      ...draft,
      title,
      completedAt: draft.status === 'done' ? draft.completedAt ?? Date.now() : undefined,
      reminder: draft.dueDate ? draft.reminder : undefined,
    }
    if (existing) patch('tasks', existing.id, final)
    else insert('tasks', final)
    toast(existing ? 'Task updated' : 'Task added')
    onClose()
  }

  const close = () => guardClose(dirty, onClose)

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? 'Edit task' : 'New task'}
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="text-bad"
              onClick={() => {
                removeWithUndo('tasks', existing.id, 'Task deleted')
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save}>{existing ? 'Save' : 'Add task'}</Button>
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
        <Field error={error}>
          <Input
            data-autofocus
            value={draft.title}
            placeholder="What needs to be done?"
            className="h-12 text-[17px] font-medium sm:text-base"
            onChange={(e) => {
              set('title', e.target.value)
              setError('')
            }}
          />
        </Field>

        <Field label="Priority">
          <Segmented<Priority>
            block
            value={draft.priority}
            onChange={(v) => set('priority', v)}
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Deadline">
          <QuickDates value={draft.dueDate} onChange={(d) => set('dueDate', d)} />
          <div className="mt-1 grid grid-cols-2 gap-3">
            <Input type="date" value={draft.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || undefined)} />
            <Input
              type="time"
              value={draft.dueTime ?? ''}
              disabled={!draft.dueDate}
              onChange={(e) => set('dueTime', e.target.value || undefined)}
            />
          </div>
        </Field>

        {draft.dueDate && (
          <Field label="Reminder" hint="Shown as a notification while Orbit is open.">
            <Select
              value={draft.reminder ?? ''}
              onChange={(e) => set('reminder', e.target.value === '' ? undefined : Number(e.target.value))}
            >
              <option value="">No reminder</option>
              {REMINDER_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Project">
          <ProjectSelect value={draft.projectId} onChange={(v) => set('projectId', v)} />
        </Field>

        <Field label="Checklist">
          <ChecklistEditor items={draft.subtasks} onChange={(v) => set('subtasks', v)} placeholder="Add a step" />
        </Field>

        <Field label="Notes">
          <Textarea
            value={draft.notes ?? ''}
            placeholder="Details, links, context…"
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>

        <Field label="Tags">
          <TagsInput value={draft.tags} onChange={(v) => set('tags', v)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
