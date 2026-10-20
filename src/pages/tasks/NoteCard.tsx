import { Archive, ArchiveRestore, CalendarDays, ListTodo, Pin, PinOff, Trash2 } from 'lucide-react'
import { Badge, Checkbox, cn, type MenuItem } from '@/components/ui'
import { relativeDay } from '@/lib/dates'
import { NOTE_CATEGORY_LABELS } from '@/lib/defaults'
import { uid, useStore } from '@/lib/store'
import { openEditor, removeWithUndo, toast } from '@/lib/ui'
import type { ID, Note, Project, TaskCategory } from '@/lib/types'
import { FloatingMenu } from './common'
import { compact, NOTE_COLORS, timeAgo } from './lib'

const PREVIEW_ITEMS = 5

/**
 * Tick a checklist item straight from the card. Written without bumping
 * `updatedAt` so the card doesn't jump to the top of the list mid-checklist.
 */
function toggleItem(noteId: ID, itemId: ID) {
  useStore.setState((s) => ({
    notes: s.notes.map((n) =>
      n.id === noteId
        ? { ...n, checklist: n.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) }
        : n,
    ),
  }))
}

function setFlag(note: Note, patch: Pick<Partial<Note>, 'pinned' | 'archived'>, message: string) {
  const prev = { pinned: note.pinned, archived: note.archived }
  useStore.getState().patch('notes', note.id, patch)
  toast(message, { action: { label: 'Undo', onClick: () => useStore.getState().patch('notes', note.id, prev) } })
}

/** Note → task: title, body as notes, checklist as subtasks, same project. */
function noteToTask(note: Note, categories: TaskCategory[]) {
  const label = NOTE_CATEGORY_LABELS[note.category].toLowerCase()
  const cat = categories.find((c) => c.name.toLowerCase().startsWith(label))
  openEditor({
    kind: 'task',
    initial: compact({
      title: note.title,
      notes: note.body || undefined,
      projectId: note.projectId,
      categoryId: cat?.id,
      subtasks: note.checklist.length ? note.checklist.map((c) => ({ id: uid(), title: c.title, done: c.done })) : undefined,
      tags: note.tags.length ? [...note.tags] : undefined,
    }),
  })
}

export function NoteCard({
  note, project, categories, hideCategory,
}: {
  note: Note
  project?: Project
  categories: TaskCategory[]
  hideCategory?: boolean
}) {
  const items = note.checklist.slice(0, PREVIEW_ITEMS)
  const more = note.checklist.length - items.length
  const doneCount = note.checklist.filter((c) => c.done).length
  const open = () => openEditor({ kind: 'note', id: note.id })

  const menu: MenuItem[] = []
  if (!note.archived) {
    menu.push(
      note.pinned
        ? { label: 'Unpin', icon: PinOff, onClick: () => setFlag(note, { pinned: false }, 'Unpinned') }
        : { label: 'Pin to top', icon: Pin, onClick: () => setFlag(note, { pinned: true }, 'Pinned') },
    )
  }
  menu.push(
    note.archived
      ? { label: 'Restore', icon: ArchiveRestore, onClick: () => setFlag(note, { archived: false }, 'Note restored') }
      : { label: 'Archive', icon: Archive, onClick: () => setFlag(note, { archived: true }, 'Note archived') },
    { label: 'Create task from note', icon: ListTodo, onClick: () => noteToTask(note, categories) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeWithUndo('notes', note.id, 'Note deleted') },
  )

  return (
    <article
      onClick={open}
      className="mb-3 cursor-pointer break-inside-avoid rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong"
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 pt-1">
          <button
            type="button"
            className="block max-w-full text-left text-[15px] font-semibold leading-snug tracking-tight text-ink outline-none focus-visible:underline"
          >
            <span className="break-words">{note.title || 'Untitled'}</span>
          </button>
        </h3>
        {note.pinned && !note.archived && (
          <Pin size={15} className="mt-2 shrink-0 text-accent-text" aria-label="Pinned" />
        )}
        <div className="-mr-1.5 -mt-0.5 shrink-0">
          <FloatingMenu items={menu} label={`Actions for “${note.title || 'Untitled'}”`} />
        </div>
      </div>

      {note.body.trim() && (
        <p className="mt-1.5 line-clamp-6 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-2">
          {note.body.trim()}
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-2 flex flex-col" aria-label={`Checklist, ${doneCount} of ${note.checklist.length} done`}>
          {items.map((it) => (
            <li
              key={it.id}
              onClick={(e) => {
                e.stopPropagation()
                toggleItem(note.id, it.id)
              }}
              className="-mx-1.5 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 hover:bg-surface-2/70 sm:min-h-8"
            >
              <Checkbox size={17} checked={it.done} label={it.title} onChange={() => toggleItem(note.id, it.id)} />
              <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', it.done ? 'text-muted line-through' : 'text-ink')}>
                {it.title}
              </span>
            </li>
          ))}
          {more > 0 && <li className="pl-[27px] pt-0.5 text-xs text-muted">+{more} more</li>}
        </ul>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted">
        {!hideCategory && <Badge color={NOTE_COLORS[note.category]}>{NOTE_CATEGORY_LABELS[note.category]}</Badge>}
        {project && (
          <Badge color={project.color} className="max-w-[12rem]">
            <span className="truncate">{project.name}</span>
          </Badge>
        )}
        {note.date && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={12} />
            {relativeDay(note.date)}
          </span>
        )}
        {note.checklist.length > PREVIEW_ITEMS && (
          <span className="tabular">
            {doneCount}/{note.checklist.length}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap" title={new Date(note.updatedAt).toLocaleString()}>
          {timeAgo(note.updatedAt)}
        </span>
      </footer>
    </article>
  )
}
