import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Lightbulb, NotebookPen, Pin, Plus, Search, Star, type LucideIcon } from 'lucide-react'
import { Button, Card, Chip, EmptyState, PageHeader } from '@/components/ui'
import { NOTE_CATEGORY_LABELS } from '@/lib/defaults'
import { colorHex, tint } from '@/lib/icons'
import { useStore } from '@/lib/store'
import { openEditor } from '@/lib/ui'
import type { ColorKey, Note, NoteCategory } from '@/lib/types'
import { GroupHeader, ScrollRow, SearchBox, SectionSwitch } from './tasks/common'
import { normalize, NOTE_COLORS, noteMatches, plural } from './tasks/lib'
import { NoteCard } from './tasks/NoteCard'

type NoteFilter = 'all' | NoteCategory | 'archived'

const FILTERS: { value: NoteFilter; icon?: LucideIcon }[] = [
  { value: 'all' },
  { value: 'ideas', icon: Lightbulb },
  { value: 'important', icon: Star },
  { value: 'work' },
  { value: 'business' },
  { value: 'personal' },
  { value: 'daily' },
  { value: 'archived', icon: Archive },
]

function filterLabel(f: NoteFilter): string {
  if (f === 'all') return 'All'
  if (f === 'archived') return 'Archived'
  return NOTE_CATEGORY_LABELS[f]
}

function isFilter(v: string | null): v is NoteFilter {
  return FILTERS.some((f) => f.value === v)
}

/** Helper line for the dedicated sections. */
const HELP: Partial<Record<NoteFilter, { icon: LucideIcon; color: ColorKey; text: ReactNode }>> = {
  ideas: {
    icon: Lightbulb,
    color: 'amber',
    text: 'Your idea inbox. Capture things the moment they strike — turn the good ones into tasks from a card’s menu.',
  },
  important: {
    icon: Star,
    color: 'red',
    text: 'Reference info you don’t want to lose — for passwords use a dedicated password manager.',
  },
  archived: {
    icon: Archive,
    color: 'slate',
    text: 'Archived notes are tucked away from your other lists. Restore them any time from the card menu.',
  },
}

const EMPTY: Partial<Record<NoteFilter, { icon: LucideIcon; title: string; description: string }>> = {
  ideas: { icon: Lightbulb, title: 'No ideas yet', description: 'Write down ideas the moment they strike — business, side projects, gifts, anything.' },
  important: {
    icon: Star,
    title: 'Nothing saved here yet',
    description: 'Keep reference info here: warranty details, policy numbers, addresses, where documents are kept.',
  },
  archived: { icon: Archive, title: 'No archived notes', description: 'Notes you archive are kept here, out of the way.' },
}

const byUpdated = (a: Note, b: Note) => b.updatedAt - a.updatedAt

export function NotesPage() {
  const notes = useStore((s) => s.notes)
  const projects = useStore((s) => s.projects)
  const categories = useStore((s) => s.taskCategories)
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')

  const raw = params.get('category')
  const filter: NoteFilter = isFilter(raw) ? raw : 'all'
  const setFilter = (f: NoteFilter) => {
    const next = new URLSearchParams(params)
    if (f === 'all') next.delete('category')
    else next.set('category', f)
    setParams(next, { replace: true })
  }

  const projs = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const query = normalize(search)

  const counts = useMemo(() => {
    const c: Record<NoteFilter, number> = {
      all: 0, archived: 0, ideas: 0, important: 0, work: 0, business: 0, personal: 0, daily: 0,
    }
    for (const n of notes) {
      if (n.archived) {
        c.archived++
        continue
      }
      c.all++
      c[n.category]++
    }
    return c
  }, [notes])

  const { pinned, others } = useMemo(() => {
    const list = notes.filter((n) => {
      if (filter === 'archived') {
        if (!n.archived) return false
      } else {
        if (n.archived) return false
        if (filter !== 'all' && n.category !== filter) return false
      }
      return noteMatches(n, query, n.projectId ? projs.get(n.projectId) : undefined)
    })
    if (filter === 'archived') return { pinned: [] as Note[], others: list.sort(byUpdated) }
    return {
      pinned: list.filter((n) => n.pinned).sort(byUpdated),
      others: list.filter((n) => !n.pinned).sort(byUpdated),
    }
  }, [notes, filter, query, projs])

  const newNote = () =>
    openEditor({
      kind: 'note',
      initial: filter !== 'all' && filter !== 'archived' ? { category: filter } : undefined,
    })

  const help = HELP[filter]
  const total = pinned.length + others.length
  const hideCategory = filter !== 'all' && filter !== 'archived'

  const renderGrid = (list: Note[]) => (
    <div className="columns-1 gap-3 sm:columns-2 xl:columns-3">
      {list.map((n) => (
        <NoteCard
          key={n.id}
          note={n}
          project={n.projectId ? projs.get(n.projectId) : undefined}
          categories={categories}
          hideCategory={hideCategory}
        />
      ))}
    </div>
  )

  let empty: ReactNode = null
  if (!total) {
    if (!notes.length) {
      empty = (
        <EmptyState
          icon={NotebookPen}
          title="No notes yet"
          description="Capture ideas, meeting notes, lists and anything you want to keep — for work, business or life."
          action={<Button variant="primary" icon={Plus} onClick={newNote}>New note</Button>}
        />
      )
    } else if (query) {
      empty = (
        <EmptyState
          icon={Search}
          title={`No notes match “${search.trim()}”`}
          description={filter === 'all' ? 'Try a different word.' : `Searching in ${filterLabel(filter)} only.`}
          action={<Button variant="secondary" size="sm" onClick={() => setSearch('')}>Clear search</Button>}
        />
      )
    } else {
      const e = EMPTY[filter]
      empty = (
        <EmptyState
          icon={e?.icon ?? NotebookPen}
          title={e?.title ?? `No ${filterLabel(filter).toLowerCase()} notes yet`}
          description={e?.description ?? 'Notes you add to this category show up here.'}
          action={
            filter !== 'archived' && (
              <Button variant="primary" icon={Plus} onClick={newNote}>
                New note
              </Button>
            )
          }
        />
      )
    }
  }

  return (
    <>
      <PageHeader
        title="Notes"
        subtitle={counts.all ? plural(counts.all, 'note') : undefined}
        actions={
          <Button variant="primary" icon={Plus} onClick={newNote}>
            New note
          </Button>
        }
      >
        <SectionSwitch />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <ScrollRow>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              active={filter === f.value}
              icon={f.icon}
              color={!f.icon && f.value !== 'all' ? NOTE_COLORS[f.value as NoteCategory] : undefined}
              count={counts[f.value]}
              onClick={() => setFilter(filter === f.value && f.value !== 'all' ? 'all' : f.value)}
            >
              {filterLabel(f.value)}
            </Chip>
          ))}
        </ScrollRow>

        {help && (
          <div className="flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: tint(help.color, 0.16), color: colorHex(help.color) }}
            >
              <help.icon size={16} />
            </span>
            <p className="pt-1.5 text-[13px] leading-relaxed text-ink-2">{help.text}</p>
          </div>
        )}

        <SearchBox value={search} onChange={setSearch} placeholder="Search notes" className="sm:max-w-sm" />

        <div className="mt-2 flex flex-col gap-6">
          {empty && <Card>{empty}</Card>}
          {pinned.length > 0 && (
            <section>
              <GroupHeader icon={Pin} title="Pinned" count={pinned.length} />
              {renderGrid(pinned)}
            </section>
          )}
          {others.length > 0 && (
            <section>
              {pinned.length > 0 && <GroupHeader title="Others" count={others.length} />}
              {renderGrid(others)}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
