import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, FilePlus2, FolderPlus, ListPlus, Mail, Pencil, Phone, Trash2, UserX } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Menu, PageHeader, Stat } from '@/components/ui'
import { clientFinancials, invoiceState } from '@/lib/business'
import { todayISO } from '@/lib/dates'
import { useMoney } from '@/lib/format'
import { colorHex } from '@/lib/icons'
import { useStore } from '@/lib/store'
import { openEditor } from '@/lib/ui'
import {
  BackLink, BusinessToolbar, CardAction, CardEmpty, ClientAvatar, DeadlineText, InvoiceRow, ListCard, MoreToggle,
  Rows, TxLine,
} from './components'
import {
  compareOpen, compareProjects, deleteClient, openBizSheet, PROJECT_STATUS_LABELS, setArchived, taskCounts,
  workTaskCategory,
} from './lib'

export function ClientDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const today = todayISO()

  const clients = useStore((s) => s.clients)
  const projects = useStore((s) => s.projects)
  const tasks = useStore((s) => s.tasks)
  const txs = useStore((s) => s.transactions)
  const invoices = useStore((s) => s.invoices)
  const cats = useStore((s) => s.financeCategories)
  const money = useMoney()
  const [allPayments, setAllPayments] = useState(false)

  const client = useMemo(() => clients.find((c) => c.id === id), [clients, id])
  const fin = useMemo(() => clientFinancials(id, projects, txs, invoices, today), [id, projects, txs, invoices, today])
  const clientProjects = useMemo(() => projects.filter((p) => p.clientId === id).sort(compareProjects), [projects, id])
  const counts = useMemo(() => taskCounts(tasks), [tasks])
  const clientInvoices = useMemo(() => {
    const isOpen = (s: string) => s === 'pending' || s === 'overdue'
    return invoices
      .filter((i) => i.clientId === id)
      .sort((a, b) => {
        const oa = isOpen(invoiceState(a, today)) ? 0 : 1
        const ob = isOpen(invoiceState(b, today)) ? 0 : 1
        return oa - ob || (oa === 0 ? compareOpen(a, b, today) : b.issueDate.localeCompare(a.issueDate))
      })
  }, [invoices, id, today])
  // Same attribution as clientFinancials: the client's projects + their paid invoices.
  const payments = useMemo(() => {
    const projectIds = new Set(clientProjects.map((p) => p.id))
    const txIds = new Set(clientInvoices.map((i) => i.transactionId).filter(Boolean))
    return txs
      .filter((t) => t.type === 'income' && ((t.projectId && projectIds.has(t.projectId)) || txIds.has(t.id)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  }, [txs, clientProjects, clientInvoices])
  const catMap = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])

  if (!client) {
    return (
      <>
        <BackLink to="/business/clients">Clients</BackLink>
        <PageHeader title="Client">
          <BusinessToolbar />
        </PageHeader>
        <EmptyState
          icon={UserX}
          title="Client not found"
          description="They may have been deleted."
          action={<Button onClick={() => navigate('/business/clients')}>All clients</Button>}
        />
      </>
    )
  }

  const cid = client.id
  const edit = () => openBizSheet({ kind: 'client', id: cid })
  const followUp = () =>
    openEditor({
      kind: 'task',
      initial: { title: `Follow up with ${client.name}`, priority: 'medium', dueDate: today, ...workTaskCategory() },
    })
  const shownPayments = allPayments ? payments : payments.slice(0, 6)

  return (
    <>
      <BackLink to="/business/clients">Clients</BackLink>
      <PageHeader
        title={client.name}
        subtitle={
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {client.company && <span className="truncate">{client.company}</span>}
            {client.archived && <Badge>Archived</Badge>}
          </span>
        }
        actions={
          <>
            <Button icon={Pencil} className="max-sm:hidden" onClick={edit}>Edit</Button>
            <IconButton icon={Pencil} label="Edit client" className="sm:hidden" onClick={edit} />
            <Menu
              label="Client actions"
              items={[
                { label: 'Follow-up task', icon: ListPlus, onClick: followUp },
                client.archived
                  ? { label: 'Restore', icon: ArchiveRestore, onClick: () => setArchived(client, false) }
                  : { label: 'Archive', icon: Archive, onClick: () => setArchived(client, true) },
                {
                  label: 'Delete client',
                  icon: Trash2,
                  danger: true,
                  onClick: () => void deleteClient(client).then((ok) => ok && navigate('/business/clients')),
                },
              ]}
            />
          </>
        }
      >
        <BusinessToolbar />
      </PageHeader>

      <div className="flex flex-col gap-4 lg:gap-5">
        <Card>
          <div className="flex items-start gap-3">
            <ClientAvatar client={client} size={44} />
            <div className="min-w-0 flex-1">
              {client.email || client.phone ? (
                <div className="flex flex-col">
                  {client.phone && (
                    <a
                      href={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
                      className="-mx-2 flex h-10 items-center gap-2.5 rounded-lg px-2 text-sm text-ink transition-colors hover:bg-surface-2"
                    >
                      <Phone size={16} className="shrink-0 text-muted" />
                      <span className="truncate">{client.phone}</span>
                    </a>
                  )}
                  {client.email && (
                    <a
                      href={`mailto:${client.email}`}
                      className="-mx-2 flex h-10 items-center gap-2.5 rounded-lg px-2 text-sm text-ink transition-colors hover:bg-surface-2"
                    >
                      <Mail size={16} className="shrink-0 text-muted" />
                      <span className="truncate">{client.email}</span>
                    </a>
                  )}
                </div>
              ) : (
                <p className="flex min-h-10 items-center text-[13px] text-muted">
                  No contact details ·{' '}
                  <button type="button" className="ml-1 font-medium text-accent-text" onClick={edit}>Add</button>
                </p>
              )}
            </div>
          </div>
          {client.notes && (
            <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-[13px] leading-relaxed text-ink-2">{client.notes}</p>
          )}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
            <Stat label="Received" value={<span className="tabular">{money(fin.income, { compact: true })}</span>} />
            <Stat
              label="Outstanding"
              value={<span className="tabular">{money(fin.outstanding, { compact: true })}</span>}
              hint={fin.outstanding > 0 ? `${clientInvoices.filter((i) => invoiceState(i, today) === 'overdue').length} overdue` : undefined}
            />
            <Stat label="Projects" value={<span className="tabular">{fin.projects}</span>} />
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
          <ListCard
            title="Projects"
            action={
              <CardAction icon={FolderPlus} onClick={() => openBizSheet({ kind: 'project', initial: { clientId: cid } })}>
                New
              </CardAction>
            }
          >
            {clientProjects.length ? (
              <Rows>
                {clientProjects.map((p) => {
                  const c = counts.get(p.id)
                  return (
                    <Link
                      key={p.id}
                      to={`/business/projects/${p.id}`}
                      className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2 sm:px-4"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorHex(p.color) }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                          {p.status !== 'active' && <Badge>{PROJECT_STATUS_LABELS[p.status]}</Badge>}
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                          {c?.total ? <span className="tabular shrink-0">{c.done}/{c.total} tasks</span> : null}
                          {c?.total && p.deadline ? <span>·</span> : null}
                          {p.deadline ? (
                            <DeadlineText deadline={p.deadline} done={p.status === 'done'} today={today} />
                          ) : !c?.total ? (
                            <span>No tasks or deadline</span>
                          ) : null}
                        </div>
                      </div>
                      {p.fee ? <span className="tabular shrink-0 text-sm text-ink-2">{money(p.fee)}</span> : null}
                    </Link>
                  )
                })}
              </Rows>
            ) : (
              <CardEmpty>
                <p className="pb-1 text-[13px] text-muted">No projects for {client.name} yet.</p>
              </CardEmpty>
            )}
          </ListCard>

          <ListCard
            title="Invoices"
            action={
              <CardAction icon={FilePlus2} onClick={() => openBizSheet({ kind: 'invoice', initial: { clientId: cid } })}>
                New
              </CardAction>
            }
          >
            {clientInvoices.length ? (
              <Rows>
                {clientInvoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    client={client}
                    project={projectMap.get(inv.projectId ?? '')}
                    today={today}
                    money={money}
                    hideClient
                  />
                ))}
              </Rows>
            ) : (
              <CardEmpty>
                <p className="pb-1 text-[13px] text-muted">No invoices, freelance jobs or commissions yet.</p>
              </CardEmpty>
            )}
          </ListCard>
        </div>

        <ListCard title="Payment history" subtitle={payments.length ? `${money(fin.income)} received in total` : undefined}>
          {payments.length ? (
            <Rows>
              {shownPayments.map((tx) => (
                <TxLine key={tx.id} tx={tx} category={catMap.get(tx.categoryId)} money={money} />
              ))}
              {payments.length > 6 && (
                <MoreToggle expanded={allPayments} hidden={payments.length - 6} onToggle={() => setAllPayments((v) => !v)} />
              )}
            </Rows>
          ) : (
            <CardEmpty>
              <p className="pb-1 text-[13px] text-muted">Payments appear here when you mark this client's invoices paid.</p>
            </CardEmpty>
          )}
        </ListCard>
      </div>
    </>
  )
}
