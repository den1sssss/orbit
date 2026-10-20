import { Archive, ArchiveRestore, Pin, PinOff, Trash2 } from 'lucide-react'
import { Button, cn, Field, IconButton, Input, Sheet } from '@/components/ui'
import { NOTE_CATEGORY_LABELS } from '@/lib/defaults'
import { makeNote, useStore } from '@/lib/store'
import { removeWithUndo, toast } from '@/lib/ui'
import type { ID, Note, NoteCategory } from '@/lib/types'
import { ChecklistEditor, ProjectSelect, TagsInput } from './fields'
import { guardClose, useDraft } from './useDraft'

export function NoteEditor({ id, initial, onClose }: { id?: ID; initial?: Partial<Note>; onClose: () => void }) {
  const existing = useStore((s) => (id ? s.notes.find((n) => n.id === id) : undefined))
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const { draft, set, dirty } = useDraft<Note>(() => (existing ? { ...existing } : makeNote({ ...initial })))

  const isEmpty = !draft.title.trim() && !draft.body.trim() && draft.checklist.length === 0

  const save = () => {
    if (isEmpty) {
      onClose()
      return
    }
    const final: Note = {
      ...draft,
      title: draft.title.trim() || draft.body.trim().split('\n')[0].slice(0, 60) || 'Untitled',
    }
    if (existing) patch('notes', existing.id, final)
    else insert('notes', final)
    toast(existing ? 'Note saved' : 'Note created')
    onClose()
  }

  const close = () => guardClose(dirty && !isEmpty, onClose)

  return (
    <Sheet
      open
      onClose={close}
      size="lg"
      title={existing ? 'Edit note' : 'New note'}
      headerAction={
        <>
          <IconButton
            size="sm"
            icon={draft.pinned ? PinOff : Pin}
            label={draft.pinned ? 'Unpin' : 'Pin to top'}
            className={draft.pinned ? 'text-accent-text' : ''}
            onClick={() => set('pinned', !draft.pinned)}
          />
          {existing && (
            <IconButton
              size="sm"
              icon={draft.archived ? ArchiveRestore : Archive}
              label={draft.archived ? 'Restore from archive' : 'Archive'}
              onClick={() => set('archived', !draft.archived)}
            />
          )}
        </>
      }
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="text-bad"
              onClick={() => {
                removeWithUndo('notes', existing.id, 'Note deleted')
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(NOTE_CATEGORY_LABELS) as NoteCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set('category', c)}
              className={cn(
                'h-7 rounded-lg px-2.5 text-xs font-medium transition-colors',
                draft.category === c ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 hover:text-ink',
              )}
            >
              {NOTE_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        <input
          data-autofocus
          value={draft.title}
          placeholder="Title"
          onChange={(e) => set('title', e.target.value)}
          className="w-full bg-transparent text-xl font-semibold tracking-tight text-ink outline-none placeholder:text-muted"
        />
        <textarea
          value={draft.body}
          placeholder="Write anything — ideas, plans, meeting notes, references…"
          rows={9}
          onChange={(e) => set('body', e.target.value)}
          className="w-full resize-y bg-transparent text-base leading-relaxed text-ink outline-none placeholder:text-muted sm:text-[15px]"
        />

        <Field label="Checklist">
          <ChecklistEditor items={draft.checklist} onChange={(v) => set('checklist', v)} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Attach to date" hint="Shows on that day in the calendar.">
            <Input type="date" value={draft.date ?? ''} onChange={(e) => set('date', e.target.value || undefined)} />
          </Field>
          <Field label="Project">
            <ProjectSelect value={draft.projectId} onChange={(v) => set('projectId', v)} />
          </Field>
        </div>
        <Field label="Tags">
          <TagsInput value={draft.tags} onChange={(v) => set('tags', v)} />
        </Field>
      </div>
    </Sheet>
  )
}
