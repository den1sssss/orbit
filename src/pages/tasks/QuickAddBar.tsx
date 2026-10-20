import { useMemo, useRef, useState } from 'react'
import { CalendarDays, CornerDownLeft, Flag, Folder, Hash, Plus } from 'lucide-react'
import { Badge, cn, ColorDot } from '@/components/ui'
import { relativeDay, todayISO } from '@/lib/dates'
import { PRIORITY_LABELS } from '@/lib/defaults'
import { makeTask, useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import type { ID, ISODate, Priority, TaskStatus } from '@/lib/types'
import { compact, parseQuickAdd, priorityRing } from './lib'

export interface QuickAddDefaults {
  dueDate?: ISODate
  categoryId?: ID
  projectId?: ID
  priority?: Priority
  status?: TaskStatus
}

/** Type a task and press Enter. Understands date, !priority, #category and @project tokens. */
export function QuickAddBar({ defaults, placeholder }: { defaults: QuickAddDefaults; placeholder?: string }) {
  const categories = useStore((s) => s.taskCategories)
  const projects = useStore((s) => s.projects)
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const today = todayISO()

  const parsed = useMemo(
    () => (text.trim() ? parseQuickAdd(text, categories, projects, today) : null),
    [text, categories, projects, today],
  )

  const resolved = useMemo(() => {
    if (!parsed) return null
    const categoryId = parsed.categoryId ?? defaults.categoryId ?? categories[0]?.id
    return {
      title: parsed.title,
      dueDate: parsed.dueDate ?? defaults.dueDate,
      priority: parsed.priority ?? defaults.priority ?? 'medium',
      categoryId,
      projectId: parsed.projectId ?? defaults.projectId,
      tags: parsed.tags,
      // Which bits came from tokens (shown as a live preview).
      tokens: {
        date: !!parsed.dueDate,
        priority: !!parsed.priority,
        category: !!parsed.categoryId,
        project: !!parsed.projectId,
      },
    }
  }, [parsed, defaults, categories])

  const submit = () => {
    if (!resolved) return
    if (!resolved.title) {
      setError(true)
      toast('Add a title for the task', { tone: 'error' })
      return
    }
    const task = makeTask(
      {
        title: resolved.title,
        ...compact({
          dueDate: resolved.dueDate,
          priority: resolved.priority,
          categoryId: resolved.categoryId,
          projectId: resolved.projectId,
          status: defaults.status,
        }),
        tags: resolved.tags,
      },
      categories[0]?.id,
    )
    useStore.getState().insert('tasks', task)
    setText('')
    toast(task.dueDate ? `Task added · ${relativeDay(task.dueDate)}` : 'Task added', {
      action: { label: 'Undo', onClick: () => useStore.getState().remove('tasks', task.id) },
    })
    inputRef.current?.focus()
  }

  const cat = resolved ? categories.find((c) => c.id === resolved.categoryId) : undefined
  const project = resolved?.projectId ? projects.find((p) => p.id === resolved.projectId) : undefined
  const showHelp = focused || !!text

  return (
    <div>
      <div
        className={cn(
          'flex h-12 items-center gap-3 rounded-2xl border bg-surface px-4 shadow-card transition',
          'focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15',
          error ? 'border-bad' : 'border-line',
        )}
      >
        <Plus size={18} className="shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={text}
          enterKeyHint="done"
          aria-label="Quick add task"
          placeholder={placeholder ?? 'Add a task…'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setText(e.target.value)
            setError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              setText('')
              e.currentTarget.blur()
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted sm:text-sm"
        />
        {text.trim() && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            className="-mr-2 inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            Add <CornerDownLeft size={13} className="hidden sm:block" />
          </button>
        )}
      </div>

      {!showHelp && (
        <p className="mt-1.5 truncate px-1 text-xs text-muted">
          Tip: <Token>tomorrow</Token> <Token>!high</Token> <Token>#work</Token> <Token>@project</Token> set details as you type
        </p>
      )}
      {showHelp && (
        <div className="mt-2 flex flex-col gap-1.5 px-1">
          {resolved && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
              {resolved.dueDate && (
                <Badge tone={resolved.tokens.date ? 'accent' : 'neutral'} icon={CalendarDays}>
                  {relativeDay(resolved.dueDate)}
                </Badge>
              )}
              {(resolved.tokens.priority || resolved.priority !== 'medium') && (
                <Badge tone={resolved.tokens.priority ? 'accent' : 'neutral'}>
                  <Flag size={11} strokeWidth={2.5} style={{ color: priorityRing(resolved.priority) }} />
                  {PRIORITY_LABELS[resolved.priority]}
                </Badge>
              )}
              {cat && (
                <Badge tone={resolved.tokens.category ? 'accent' : 'neutral'}>
                  <ColorDot color={cat.color} size={6} />
                  {cat.name}
                </Badge>
              )}
              {project && (
                <Badge tone={resolved.tokens.project ? 'accent' : 'neutral'} icon={Folder}>
                  {project.name}
                </Badge>
              )}
              {resolved.tags.map((t) => (
                <Badge key={t} icon={Hash}>{t}</Badge>
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted">
            <Token>today</Token> <Token>tomorrow</Token> <Token>mon</Token>…<Token>sun</Token> for a date ·{' '}
            <Token>!urgent</Token> <Token>!high</Token> <Token>!med</Token> <Token>!low</Token> ·{' '}
            <Token>#category</Token> or #tag · <Token>@project</Token>
          </p>
        </div>
      )}
    </div>
  )
}

function Token({ children }: { children: string }) {
  return <code className="rounded bg-surface-2 px-1 py-px font-sans text-[11.5px] text-ink-2">{children}</code>
}
