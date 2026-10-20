import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button, cn, PageHeader } from '@/components/ui'
import { addDaysISO, todayISO } from '@/lib/dates'
import { useStore } from '@/lib/store'
import { openEditor } from '@/lib/ui'
import type { Task } from '@/lib/types'
import { ScrollRow, SectionSwitch } from './tasks/common'
import { activeToday, compact, normalize, taskMatches } from './tasks/lib'
import { ManageSheet, type ManageTab } from './tasks/ManageSheet'
import { QuickAddBar, type QuickAddDefaults } from './tasks/QuickAddBar'
import { TaskFilters, type TaskFilterState } from './tasks/TaskFilters'
import { LookupProvider } from './tasks/TaskRow'
import { AllView, BoardView, DoneView, TodayView, UpcomingView } from './tasks/views'

type View = 'today' | 'upcoming' | 'all' | 'board' | 'done'

const VIEWS: { value: View; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
  { value: 'board', label: 'Board' },
  { value: 'done', label: 'Done' },
]

function isView(v: string | null): v is View {
  return VIEWS.some((x) => x.value === v)
}

const NO_FILTERS: TaskFilterState = { category: 'all', project: 'all', priority: 'any', query: '' }

export function TasksPage() {
  const tasks = useStore((s) => s.tasks)
  const categories = useStore((s) => s.taskCategories)
  const projects = useStore((s) => s.projects)
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<TaskFilterState>(NO_FILTERS)
  const [manage, setManage] = useState<{ open: boolean; tab: ManageTab }>({ open: false, tab: 'categories' })
  const today = todayISO()

  const rawView = params.get('view')
  const view: View = rawView === 'overdue' ? 'today' : isView(rawView) ? rawView : 'today'
  const emphasizeOverdue = rawView === 'overdue'

  const setView = (v: View) => {
    const next = new URLSearchParams(params)
    next.set('view', v)
    setParams(next, { replace: true })
  }

  const cats = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const projs = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const lookups = useMemo(() => ({ cats, projs, today }), [cats, projs, today])

  // Filters pointing at deleted categories/projects fall back to "all".
  const category = filters.category !== 'all' && cats.has(filters.category) ? filters.category : 'all'
  const project =
    filters.project === 'all' || filters.project === 'none' || projs.has(filters.project) ? filters.project : 'all'
  const { priority } = filters
  const query = normalize(filters.query)
  const filtersActive = category !== 'all' || project !== 'all' || priority !== 'any' || !!query

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (category !== 'all' && t.categoryId !== category) return false
        if (project === 'none' ? !!t.projectId : project !== 'all' && t.projectId !== project) return false
        if (priority === 'high+') {
          if (t.priority !== 'high' && t.priority !== 'urgent') return false
        } else if (priority !== 'any' && t.priority !== priority) return false
        return taskMatches(t, query, t.projectId ? projs.get(t.projectId) : undefined, cats.get(t.categoryId))
      }),
    [tasks, category, project, priority, query, projs, cats],
  )

  // Header + tab stats use every task, regardless of filters.
  const stats = useMemo(() => {
    let total = 0
    let done = 0
    let open = 0
    let overdue = 0
    for (const t of tasks) {
      if (t.status !== 'done') open++
      const isToday = t.dueDate === today
      const isPast = !!t.dueDate && t.dueDate < today && activeToday(t, today)
      if (isToday || isPast) {
        total++
        if (t.status === 'done') done++
        else if (isPast) overdue++
      }
    }
    return { total, done, open, overdue, todayOpen: total - done }
  }, [tasks, today])

  const subtitle = stats.total
    ? `${stats.done} of ${stats.total} done today`
    : stats.open
      ? `${stats.open} open ${stats.open === 1 ? 'task' : 'tasks'}`
      : 'All clear'

  const defaults: QuickAddDefaults = useMemo(
    () =>
      compact({
        dueDate: view === 'today' ? today : view === 'upcoming' ? addDaysISO(today, 1) : undefined,
        categoryId: category !== 'all' ? category : categories[0]?.id,
        projectId: project !== 'all' && project !== 'none' ? project : undefined,
        priority: priority === 'high+' ? 'high' : priority !== 'any' ? priority : undefined,
      }),
    [view, today, category, categories, project, priority],
  )

  const newTaskInitial: Partial<Task> = useMemo(
    () =>
      compact({
        categoryId: defaults.categoryId,
        projectId: defaults.projectId,
        priority: defaults.priority,
        dueDate: view === 'today' ? today : undefined,
      }),
    [defaults, view, today],
  )

  const clearFilters = () => setFilters(NO_FILTERS)
  const emptyAction = filtersActive ? (
    <Button variant="secondary" size="sm" onClick={clearFilters}>
      Clear filters
    </Button>
  ) : undefined
  const common = { tasks: filtered, filtered: filtersActive, emptyAction }

  return (
    <LookupProvider value={lookups}>
      <PageHeader
        title="Tasks"
        subtitle={subtitle}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openEditor({ kind: 'task', initial: newTaskInitial })}>
            New task
          </Button>
        }
      >
        <SectionSwitch />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <ScrollRow wrap={false}>
          <div role="tablist" aria-label="Task views" className="flex min-w-full gap-1 border-b border-line">
            {VIEWS.map((v) => {
              const active = v.value === view
              const badge = v.value === 'today' && stats.todayOpen > 0 ? stats.todayOpen : undefined
              return (
                <button
                  key={v.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(v.value)}
                  className={cn(
                    'relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-sm font-medium transition-colors',
                    active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {v.label}
                  {badge !== undefined && (
                    <span
                      className={cn(
                        'tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold',
                        stats.overdue ? 'bg-bad-soft text-bad' : 'bg-surface-2 text-ink-2',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </ScrollRow>

        <TaskFilters
          value={{ ...filters, category, project }}
          onChange={(p) => setFilters((f) => ({ ...f, ...p }))}
          tasks={tasks}
          categories={categories}
          projects={projects}
          onManage={(tab) => setManage({ open: true, tab })}
          matching={filtered.length}
          active={filtersActive}
        />

        {view !== 'done' && (
          <QuickAddBar
            defaults={view === 'board' ? { ...defaults, dueDate: undefined } : defaults}
            placeholder={
              view === 'today'
                ? 'Add a task for today…'
                : view === 'upcoming'
                  ? 'Add a task (tomorrow by default)…'
                  : 'Add a task…'
            }
          />
        )}

        <div className="mt-2">
          {view === 'today' && (
            <TodayView {...common} emphasizeOverdue={emphasizeOverdue} onSeeAll={() => setView('all')} />
          )}
          {view === 'upcoming' && <UpcomingView {...common} />}
          {view === 'all' && <AllView {...common} />}
          {view === 'board' && (
            <BoardView
              {...common}
              onSeeDone={() => setView('done')}
              newDefaults={compact({ ...newTaskInitial, dueDate: undefined })}
            />
          )}
          {view === 'done' && <DoneView {...common} />}
        </div>
      </div>

      <ManageSheet
        open={manage.open}
        tab={manage.tab}
        onTab={(tab) => setManage((m) => ({ ...m, tab }))}
        onClose={() => setManage((m) => ({ ...m, open: false }))}
      />
    </LookupProvider>
  )
}
