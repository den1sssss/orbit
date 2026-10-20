import { useNavigate } from 'react-router-dom'
import {
  ArrowDownLeft, ArrowUpRight, BookHeart, CalendarPlus, CheckCircle2, NotebookPen, type LucideIcon,
} from 'lucide-react'
import { Sheet } from '@/components/ui'
import { todayISO } from '@/lib/dates'
import { openEditor, setQuickAdd, useUI } from '@/lib/ui'

interface Action {
  label: string
  hint: string
  icon: LucideIcon
  tone: string
  run: () => void
}

/** The "+" menu: one tap to capture anything. */
export function QuickAddSheet() {
  const open = useUI((s) => s.quickAddOpen)
  const navigate = useNavigate()

  const actions: Action[] = [
    { label: 'Task', hint: 'To-do', icon: CheckCircle2, tone: '#5b5bd6', run: () => openEditor({ kind: 'task' }) },
    { label: 'Event', hint: 'Calendar', icon: CalendarPlus, tone: '#0090ff', run: () => openEditor({ kind: 'event' }) },
    { label: 'Expense', hint: 'Money out', icon: ArrowUpRight, tone: '#eb6834', run: () => openEditor({ kind: 'transaction', initial: { type: 'expense' } }) },
    { label: 'Income', hint: 'Money in', icon: ArrowDownLeft, tone: '#1a7f4b', run: () => openEditor({ kind: 'transaction', initial: { type: 'income' } }) },
    { label: 'Note', hint: 'Idea or list', icon: NotebookPen, tone: '#e2a336', run: () => openEditor({ kind: 'note' }) },
    {
      label: 'Journal',
      hint: 'Reflect',
      icon: BookHeart,
      tone: '#d6409f',
      run: () => {
        setQuickAdd(false)
        navigate(`/journal/${todayISO()}`)
      },
    },
  ]

  return (
    <Sheet open={open} onClose={() => setQuickAdd(false)} title="Add new" size="sm">
      <div className="grid grid-cols-2 gap-2.5 pb-1">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.run}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${a.tone} 14%, transparent)`, color: a.tone }}
            >
              <a.icon size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{a.label}</span>
              <span className="block truncate text-xs text-muted">{a.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
