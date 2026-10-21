import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarPlus, FilePlus2, FolderX, NotebookPen, Pencil, Plus } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Menu, PageHeader, Stat } from '@/components/ui'
import { invoiceState, projectFinancials } from '@/lib/business'
import { addDaysISO, fmt, fmtTime, occurrencesBetween, relativeDay, todayISO, toISO } from '@/lib/dates'
import { PRIORITY_ORDER } from '@/lib/defaults'
import { useMoney } from '@/lib/format'
import { colorHex } from '@/lib/icons'
import { useStore } from '@/lib/store'
import { openEditor } from '@/lib/ui'
import type { CalendarEvent, ISODate } from '@/lib/types'
import {
  BackLink, BusinessToolbar, CardAction, CardEmpty, DeadlineText, FeeProgress, InvoiceRow, ListCard, MoreToggle,
  projectMenu, Rows, TaskLine, TaskProgress, TxLine,
} from './components'
import {
  compareOpen, logBusinessTx, openBizSheet, PROJECT_STATUS_LABELS, projectClientName, taskCounts, useBizLookups,
  workTaskCategory,
} from './lib'

const EVENT_WINDOW_DAYS = 90

export function ProjectDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const today = todayISO()

  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)
  const notes = useStore((s) => s.notes)
  const txs = useStore((s) => s.transactions)
  const invoices = useStore((s) => s.invoices)
  const cats = useStore((s) => s.financeCategories)
  const lookups = useBizLookups()
  const money = useMoney()
  const [showDone, setShowDone] = useState(false)
  const [allTx, setAllTx] = useState(false)

  const project = useMemo(() => projects.find((p) => p.id === id), [projects, id])
  const fin = useMemo(() => (project ? projectFinancials(project, txs, invoices, today) : undefined), [project, txs, invoices, today])
  const count = useMemo(() => taskCounts(tasks).get(id), [tasks, id])
  const projectTasks = useMemo(() => {
    const list = tasks.filter((t) => t.projectId === id)
    const open = list
      .filter((t) => t.status !== 'done')
      .sort(
        (a, b) =>
          (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          a.createdAt - b.createdAt,
      )
    const done = list.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    return { open, done }
  }, [tasks, id])
  const upcoming = useMemo(() => {
    const end = addDaysISO(today, EVENT_WINDOW_DAYS)
    const out: { event: CalendarEvent; date: ISODate; key: string }[] = []
    for (const ev of events) {
      if (ev.projectId !== id) continue
      // Next occurrence only, so a weekly meeting doesn't flood the list.
      const next = occurrencesBetween(ev, today, end)[0]
      if (next) out.push({ event: ev, date: next, key: `${ev.id}:${next}` })
    }
    return out.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''),
    )
  }, [events, id, today])
  const projectNotes = useMemo(
    () => notes.filter((n) => n.projectId === id && !n.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    [notes, id],
  )
  const projectTx = useMemo(
    () => txs.filter((t) => t.projectId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [txs, id],
  )
  const projectInvoices = useMemo(() => {
    const list = invoices.filter((i) => i.projectId === id)
    const isOpen = (s: string) => s === 'pending' || s === 'overdue'
    return list.sort((a, b) => {
      const oa = isOpen(invoiceState(a, today)) ? 0 : 1
      const ob = isOpen(invoiceState(b, today)) ? 0 : 1
      return oa - ob || (oa === 0 ? compareOpen(a, b, today) : b.issueDate.localeCompare(a.issueDate))
    })
  }, [invoices, id, today])
  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])

  if (!project || !fin) {
    return (
      <>
        <BackLink to="/business/projects">Projects</BackLink>
        <PageHeader title="Project">
          <BusinessToolbar />
        </PageHeader>
        <EmptyState
          icon={FolderX}
          title="Project not found"
          description="It may have been deleted."
          action={<Button onClick={() => navigate('/business/projects')}>All projects</Button>}
        />
      </>
    )
  }

  const client = project.clientId ? lookups.clients.get(project.clientId) : undefined
  const clientName = projectClientName(project, lookups.clients)
  const pid = project.id
  const addTask = () => openEditor({ kind: 'task', initial: { projectId: pid, ...workTaskCategory() } })
  const shownTx = allTx ? projectTx : projectTx.slice(0, 6)

  return (
    <>
      <BackLink to="/business/projects">Projects</BackLink>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: colorHex(project.color) }} />
            <span className="truncate">{project.name}</span>
          </span>
        }
        subtitle={
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {client ? (
              <Link to={`/business/clients/${client.id}`} className="truncate font-medium text-accent-text">
                {client.name}
              </Link>
            ) : (
              <span className="truncate">{clientName ?? 'No client'}</span>
            )}
            <Badge tone={project.status === 'done' ? 'good' : project.status === 'active' ? 'accent' : 'neutral'}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
          </span>
        }
        actions={
          <>
            <Button icon={Pencil} className="max-sm:hidden" onClick={() => openBizSheet({ kind: 'project', id: pid })}>
              Edit
            </Button>
            <IconButton icon={Pencil} label="Edit project" className="sm:hidden" onClick={() => openBizSheet({ kind: 'project', id: pid })} />
            <Menu items={projectMenu(project, () => navigate('/business/projects'))} label="Project actions" />
          </>
        }
      >
        <BusinessToolbar />
      </PageHeader>

      <div className="flex flex-col gap-4 lg:gap-5">
        {/* ── Stats */}
        <Card>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Stat label="Income" value={<span className="tabular">{money(fin.income)}</span>} />
            <Stat label="Expenses" value={<span className="tabular">{money(fin.expenses)}</span>} />
            <Stat
              label="Profit"
              tone={fin.profit < 0 ? 'bad' : 'neutral'}
              value={<span className="tabular">{money(fin.profit)}</span>}
              hint={fin.income > 0 ? `${Math.round(fin.margin * 100)}% margin` : undefined}
            />
            <Stat
              label="Outstanding"
              value={<span className="tabular">{money(fin.outstanding)}</span>}
              hint={fin.outstanding > 0 ? 'Invoiced, not paid' : 'Nothing owed'}
            />
          </div>
          <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="text-[13px]">
                {project.deadline ? (
                  <DeadlineText deadline={project.deadline} done={project.status === 'done'} today={today} />
                ) : (
                  <span className="text-muted">No deadline</span>
                )}
              </div>
              <TaskProgress count={count} color={project.color} />
            </div>
            <div className="flex flex-col gap-3">
              {project.fee ? (
                <FeeProgress fee={project.fee} received={fin.income} money={money} />
              ) : (
                <p className="text-[13px] text-muted">No fee set · <button type="button" className="font-medium text-accent-text" onClick={() => openBizSheet({ kind: 'project', id: pid })}>Add fee</button></p>
              )}
              {project.description && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{project.description}</p>}
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-5">
            {/* ── Tasks */}
            <ListCard
              title="Tasks"
              subtitle={count?.total ? `${projectTasks.open.length} open · ${count.done} done` : undefined}
              action={<CardAction icon={Plus} onClick={addTask}>Add task</CardAction>}
            >
              {count?.total ? (
                <Rows>
                  {projectTasks.open.map((t) => (
                    <TaskLine key={t.id} task={t} today={today} />
                  ))}
                  {showDone && projectTasks.done.map((t) => <TaskLine key={t.id} task={t} today={today} />)}
                  {projectTasks.done.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowDone((v) => !v)}
                      className="flex h-11 w-full items-center justify-center text-[13px] font-medium text-ink-2 hover:text-ink"
                    >
                      {showDone ? 'Hide completed' : `Show ${projectTasks.done.length} completed`}
                    </button>
                  )}
                </Rows>
              ) : (
                <CardEmpty>
                  <EmptyState
                    compact
                    title="No tasks yet"
                    description="Break the work into tasks and follow-ups."
                    action={<Button size="sm" icon={Plus} onClick={addTask}>Add task</Button>}
                  />
                </CardEmpty>
              )}
            </ListCard>

            {/* ── Invoices */}
            <ListCard
              title="Invoices"
              subtitle={fin.outstanding > 0 ? `${money(fin.outstanding)} outstanding` : undefined}
              action={
                <CardAction
                  icon={FilePlus2}
                  onClick={() =>
                    openBizSheet({
                      kind: 'invoice',
                      initial: { projectId: pid, ...(project.clientId ? { clientId: project.clientId } : {}) },
                    })
                  }
                >
                  New
                </CardAction>
              }
            >
              {projectInvoices.length ? (
                <Rows>
                  {projectInvoices.map((inv) => (
                    <InvoiceRow
                      key={inv.id}
                      inv={inv}
                      client={lookups.clients.get(inv.clientId ?? '')}
                      project={project}
                      today={today}
                      money={money}
                    />
                  ))}
                </Rows>
              ) : (
                <CardEmpty>
                  <p className="pb-1 text-[13px] text-muted">No invoices for this project yet.</p>
                </CardEmpty>
              )}
            </ListCard>

            {/* ── Money */}
            <ListCard
              title="Money"
              subtitle="Income and expenses booked on this project"
              action={
                <div className="flex items-center">
                  <CardAction icon={Plus} onClick={() => logBusinessTx('income', pid)}>Income</CardAction>
                  <CardAction icon={Plus} onClick={() => logBusinessTx('expense', pid)}>Expense</CardAction>
                </div>
              }
            >
              {projectTx.length ? (
                <Rows>
                  {shownTx.map((tx) => (
                    <TxLine key={tx.id} tx={tx} category={catMap.get(tx.categoryId)} money={money} />
                  ))}
                  {projectTx.length > 6 && (
                    <MoreToggle expanded={allTx} hidden={projectTx.length - 6} onToggle={() => setAllTx((v) => !v)} />
                  )}
                </Rows>
              ) : (
                <CardEmpty>
                  <p className="pb-1 text-[13px] text-muted">
                    Nothing booked yet. Paid invoices land here automatically.
                  </p>
                </CardEmpty>
              )}
            </ListCard>
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            {/* ── Events */}
            <ListCard
              title="Upcoming"
              subtitle={`Meetings & deadlines · next ${EVENT_WINDOW_DAYS} days`}
              action={
                <CardAction icon={CalendarPlus} onClick={() => openEditor({ kind: 'event', initial: { projectId: pid, type: 'meeting' } })}>
                  Add
                </CardAction>
              }
            >
              {upcoming.length ? (
                <Rows>
                  {upcoming.slice(0, 6).map(({ event: ev, date, key }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openEditor({ kind: 'event', id: ev.id, occurrenceDate: date })}
                      className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-4"
                    >
                      <span className="flex w-10 shrink-0 flex-col items-center rounded-lg bg-surface-2 py-1">
                        <span className="text-[10px] font-semibold uppercase text-muted">{fmt(date, 'MMM')}</span>
                        <span className="tabular text-[15px] font-semibold leading-tight text-ink">{fmt(date, 'd')}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{ev.title}</p>
                        <p className="truncate text-[13px] text-muted">
                          {[relativeDay(date), ev.allDay ? 'All day' : fmtTime(ev.startTime), ev.location].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </button>
                  ))}
                </Rows>
              ) : (
                <CardEmpty>
                  <p className="pb-1 text-[13px] text-muted">No meetings or deadlines scheduled.</p>
                </CardEmpty>
              )}
            </ListCard>

            {/* ── Notes */}
            <ListCard
              title="Notes"
              action={
                <CardAction
                  icon={NotebookPen}
                  onClick={() => openEditor({ kind: 'note', initial: { projectId: pid, category: 'business' } })}
                >
                  Add
                </CardAction>
              }
            >
              {projectNotes.length ? (
                <Rows>
                  {projectNotes.slice(0, 6).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openEditor({ kind: 'note', id: n.id })}
                      className="flex min-h-12 w-full flex-col justify-center px-3 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-4"
                    >
                      <span className="truncate text-sm font-medium text-ink">{n.title || n.body.split('\n')[0] || 'Untitled note'}</span>
                      <span className="line-clamp-2 text-[13px] text-muted">
                        {n.title && n.body ? n.body : n.checklist.length ? `${n.checklist.filter((c) => c.done).length}/${n.checklist.length} checked` : `Edited ${relativeDay(toISO(new Date(n.updatedAt))).toLowerCase()}`}
                      </span>
                    </button>
                  ))}
                </Rows>
              ) : (
                <CardEmpty>
                  <p className="pb-1 text-[13px] text-muted">Briefs, meeting notes and ideas for this project.</p>
                </CardEmpty>
              )}
            </ListCard>
          </div>
        </div>
      </div>
    </>
  )
}
