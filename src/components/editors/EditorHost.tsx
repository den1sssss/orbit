import { closeEditor, useUI } from '@/lib/ui'
import { EventEditor } from './EventEditor'
import { NoteEditor } from './NoteEditor'
import { TaskEditor } from './TaskEditor'
import { TransactionEditor } from './TransactionEditor'

/** Renders whichever editor `openEditor()` asked for. Mounted once in the app shell. */
export function EditorHost() {
  const req = useUI((s) => s.editor)
  if (!req) return null
  // A fresh key per request resets the draft state.
  const key = `${req.kind}:${req.id ?? 'new'}:${JSON.stringify(req.initial ?? {})}`
  switch (req.kind) {
    case 'task':
      return <TaskEditor key={key} id={req.id} initial={req.initial} onClose={closeEditor} />
    case 'event':
      return (
        <EventEditor key={key} id={req.id} initial={req.initial} occurrenceDate={req.occurrenceDate} onClose={closeEditor} />
      )
    case 'transaction':
      return <TransactionEditor key={key} id={req.id} initial={req.initial} onClose={closeEditor} />
    case 'note':
      return <NoteEditor key={key} id={req.id} initial={req.initial} onClose={closeEditor} />
  }
}
