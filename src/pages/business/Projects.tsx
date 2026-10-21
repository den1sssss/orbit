import { useEffect, useMemo } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { Button, EmptyState, PageHeader, Segmented, Select } from '@/components/ui'
import { projectFinancials } from '@/lib/business'
import { todayISO } from '@/lib/dates'
import { useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { Project } from '@/lib/types'
import { BusinessToolbar, NewButton, ProjectCard } from './components'
import {
  compareProjects, openBizSheet, projectClientName, taskCounts, useBizLookups, useSearchState,
} from './lib'

type StatusFilter = Project['status'] | 'all'
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
]

function readStatus(raw: string | null): StatusFilter {
  return FILTERS.some((f) => f.value === raw) ? (raw as StatusFilter) : 'active'
}

export function ProjectsPage() {
  const [params, update] = useSearchState()
  const status = readStatus(params.get('status'))
  const clientFilter = params.get('client') ?? ''
  const today = todayISO()

  const projects = useStore((s) => s.projects)
  const clients = useStore((s) => s.clients)
  const tasks = useStore((s) => s.tasks)
  const txs = useStore((s) => s.transactions)
  const invoices = useStore((s) => s.invoices)
  const lookups = useBizLookups()
  const money = useMoney()

  // `?new=1` (and optional `client=`) opens the create sheet.
  const wantsNew = params.get('new') === '1'
  useEffect(() => {
    if (!wantsNew) return
    const cid = params.get('client')
    openBizSheet({ kind: 'project', initial: cid && lookups.clients.has(cid) ? { clientId: cid } : undefined })
    update({ new: null })
  }, [wantsNew])

  const counts = useMemo(() => taskCounts(tasks), [tasks])
  const byClient = useMemo(
    () =>
      projects.filter((p) =>
        !clientFilter ? true : clientFilter === 'none' ? !p.clientId : p.clientId === clientFilter,
      ),
    [projects, clientFilter],
  )
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { active: 0, paused: 0, done: 0, all: byClient.length }
    for (const p of byClient) c[p.status]++
    return c
  }, [byClient])
  const shown = useMemo(
    () => byClient.filter((p) => status === 'all' || p.status === status).sort(compareProjects),
    [byClient, status],
  )
  const fins = useMemo(
    () => new Map(shown.map((p) => [p.id, projectFinancials(p, txs, invoices, today)])),
    [shown, txs, invoices, today],
  )
  const clientOptions = useMemo(
    () =>
      clients
        .filter((c) => !c.archived || projects.some((p) => p.clientId === c.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clients, projects],
  )

  const create = () =>
    openBizSheet({
      kind: 'project',
      initial: clientFilter && clientFilter !== 'none' ? { clientId: clientFilter } : undefined,
    })

  return (
    <>
      <PageHeader title="Projects" actions={<NewButton label="New project" onClick={create} />}>
        <BusinessToolbar>
          <Segmented<StatusFilter>
            value={status}
            onChange={(v) => update({ status: v === 'active' ? null : v })}
            options={FILTERS.map((f) => ({
              value: f.value,
              label: (
                <>
                  {f.label}
                  <span className="tabular text-xs opacity-60">{statusCounts[f.value]}</span>
                </>
              ),
            }))}
          />
          {(clientOptions.length > 0 || clientFilter) && (
            <Select
              aria-label="Filter by client"
              className="sm:w-56"
              value={clientFilter}
              onChange={(e) => update({ client: e.target.value || null })}
            >
              <option value="">All clients</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value="none">No client</option>
            </Select>
          )}
        </BusinessToolbar>
      </PageHeader>

      {shown.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 lg:gap-4">
          {shown.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              clientName={projectClientName(p, lookups.clients)}
              fin={fins.get(p.id)!}
              count={counts.get(p.id)}
              today={today}
              money={money}
            />
          ))}
        </div>
      ) : projects.length ? (
        <EmptyState
          icon={FolderKanban}
          title={status === 'all' ? 'No projects for this client' : `No ${status} projects`}
          description="Try another filter, or start a new project."
          action={
            <div className="flex gap-2">
              {(status !== 'all' || clientFilter) && (
                <Button onClick={() => update({ status: 'all', client: null })}>Show all</Button>
              )}
              <Button variant="primary" icon={Plus} onClick={create}>New project</Button>
            </div>
          }
        />
      ) : (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="A project ties together a client, the agreed fee, a deadline, tasks, events, notes, money and invoices."
          action={<Button variant="primary" icon={Plus} onClick={create}>New project</Button>}
        />
      )}
    </>
  )
}
