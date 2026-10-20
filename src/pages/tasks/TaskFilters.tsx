import { useMemo } from 'react'
import { FolderKanban, Pencil, Settings2, X } from 'lucide-react'
import { Badge, Card, Chip, IconButton, Progress, Select } from '@/components/ui'
import { colorHex, tint } from '@/lib/icons'
import type { ID, Priority, Project, Task, TaskCategory } from '@/lib/types'
import { ScrollRow, SearchBox } from './common'
import { plural } from './lib'

export type PriorityFilter = 'any' | 'high+' | Priority
export type ProjectFilter = 'all' | 'none' | ID

export interface TaskFilterState {
  category: ID | 'all'
  project: ProjectFilter
  priority: PriorityFilter
  query: string
}

export function TaskFilters({
  value, onChange, tasks, categories, projects, onManage, matching, active,
}: {
  value: TaskFilterState
  onChange: (patch: Partial<TaskFilterState>) => void
  /** Every task (unfiltered) — for counts. */
  tasks: Task[]
  categories: TaskCategory[]
  projects: Project[]
  onManage: (tab: 'categories' | 'projects') => void
  /** Number of tasks matching the filters. */
  matching: number
  active: boolean
}) {
  const openByCat = useMemo(() => {
    const m = new Map<ID, number>()
    let all = 0
    for (const t of tasks) {
      if (t.status === 'done') continue
      all++
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1)
    }
    return { m, all }
  }, [tasks])

  const liveProjects = projects.filter((p) => p.status !== 'done')
  const doneProjects = projects.filter((p) => p.status === 'done')
  const project = value.project !== 'all' && value.project !== 'none' ? projects.find((p) => p.id === value.project) : undefined

  return (
    <div className="flex flex-col gap-3">
      <ScrollRow>
        <Chip active={value.category === 'all'} onClick={() => onChange({ category: 'all' })} count={openByCat.all}>
          All
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c.id}
            color={c.color}
            active={value.category === c.id}
            count={openByCat.m.get(c.id) ?? 0}
            onClick={() => onChange({ category: value.category === c.id ? 'all' : c.id })}
          >
            {c.name}
          </Chip>
        ))}
        <Chip icon={Settings2} onClick={() => onManage('categories')}>
          Edit
        </Chip>
      </ScrollRow>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchBox
          value={value.query}
          onChange={(query) => onChange({ query })}
          placeholder="Search tasks"
          className="sm:min-w-0 sm:flex-1"
        />
        <div className="flex gap-2">
          <Select
            aria-label="Filter by project"
            value={value.project}
            onChange={(e) => onChange({ project: e.target.value })}
            className="min-w-0 flex-1 sm:w-44 sm:flex-none"
          >
            <option value="all">All projects</option>
            {liveProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status === 'paused' ? ' (paused)' : ''}
              </option>
            ))}
            {doneProjects.length > 0 && (
              <optgroup label="Completed">
                {doneProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            )}
            <option value="none">No project</option>
          </Select>
          <Select
            aria-label="Filter by priority"
            value={value.priority}
            onChange={(e) => onChange({ priority: e.target.value as PriorityFilter })}
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
          >
            <option value="any">Any priority</option>
            <option value="urgent">Urgent</option>
            <option value="high+">High &amp; urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <IconButton variant="secondary" icon={Settings2} label="Categories & projects" onClick={() => onManage('categories')} />
        </div>
      </div>

      {project && <ProjectSummary project={project} tasks={tasks} onEdit={() => onManage('projects')} onClear={() => onChange({ project: 'all' })} />}

      {active && (
        <div className="flex items-center justify-between gap-3 px-1 text-[13px]">
          <span className="text-muted">{plural(matching, 'matching task')}</span>
          <button
            type="button"
            onClick={() => onChange({ category: 'all', project: 'all', priority: 'any', query: '' })}
            className="-mr-2 inline-flex h-9 items-center rounded-lg px-2 font-medium text-accent-text hover:bg-accent-soft"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}

const PROJECT_STATUS_LABEL: Record<Project['status'], string> = { active: 'Active', paused: 'Paused', done: 'Done' }

function ProjectSummary({
  project, tasks, onEdit, onClear,
}: {
  project: Project
  tasks: Task[]
  onEdit: () => void
  onClear: () => void
}) {
  const mine = tasks.filter((t) => t.projectId === project.id)
  const done = mine.filter((t) => t.status === 'done').length
  const total = mine.length
  return (
    <Card padded={false} className="flex items-center gap-3 p-3.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: tint(project.color, 0.15), color: colorHex(project.color) }}
      >
        <FolderKanban size={19} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{project.name}</p>
          {project.status !== 'active' && (
            <Badge tone={project.status === 'done' ? 'good' : 'warn'}>{PROJECT_STATUS_LABEL[project.status]}</Badge>
          )}
        </div>
        <p className="tabular truncate text-xs text-muted">
          {project.client ? `${project.client} · ` : ''}
          {total ? `${done} of ${plural(total, 'task')} done` : 'No tasks yet'}
        </p>
        <Progress value={total ? done / total : 0} color={project.color} className="mt-2" label={`${project.name} progress`} />
      </div>
      <div className="flex shrink-0 items-center">
        <IconButton icon={Pencil} label="Edit project" onClick={onEdit} />
        <IconButton icon={X} label="Clear project filter" onClick={onClear} />
      </div>
    </Card>
  )
}
