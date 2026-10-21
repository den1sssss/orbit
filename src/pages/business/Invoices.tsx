import { useEffect, useMemo } from 'react'
import { FileText, Plus } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, Segmented, Stat } from '@/components/ui'
import { invoiceState, receivables, type InvoiceState } from '@/lib/business'
import { currentMonth, fmtMonth, monthOf, todayISO } from '@/lib/dates'
import { useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { Invoice } from '@/lib/types'
import { BusinessToolbar, InvoiceRow, NewButton } from './components'
import { compareOpen, openBizSheet, useBizLookups, useSearchState } from './lib'

type Filter = 'awaiting' | 'drafts' | 'paid' | 'all'

const FILTERS: { value: Filter; label: string; states: InvoiceState[] }[] = [
  { value: 'awaiting', label: 'Awaiting', states: ['pending', 'overdue'] },
  { value: 'drafts', label: 'Drafts', states: ['draft'] },
  { value: 'paid', label: 'Paid', states: ['paid'] },
  { value: 'all', label: 'All', states: ['draft', 'pending', 'overdue', 'paid', 'cancelled'] },
]

const EMPTY: Record<Filter, { title: string; description: string }> = {
  awaiting: { title: 'Nothing awaiting payment', description: 'Sent invoices show here until you mark them paid.' },
  drafts: { title: 'No drafts', description: 'Drafts are invoices you haven’t sent yet — they don’t count as owed.' },
  paid: { title: 'No paid invoices yet', description: 'Marking an invoice paid records it as business income.' },
  all: { title: 'No invoices', description: '' },
}

function readFilter(raw: string | null): Filter {
  return FILTERS.some((f) => f.value === raw) ? (raw as Filter) : 'awaiting'
}

function sorter(filter: Filter, today: string) {
  return (a: Invoice, b: Invoice) => {
    if (filter === 'awaiting') return compareOpen(a, b, today)
    if (filter === 'paid') return (b.paidDate ?? '').localeCompare(a.paidDate ?? '') || b.updatedAt - a.updatedAt
    if (filter === 'drafts') return b.createdAt - a.createdAt
    return b.issueDate.localeCompare(a.issueDate) || b.createdAt - a.createdAt
  }
}

export function InvoicesPage() {
  const [params, update] = useSearchState()
  const filter = readFilter(params.get('filter'))
  const today = todayISO()
  const month = currentMonth()

  const invoices = useStore((s) => s.invoices)
  const lookups = useBizLookups()
  const money = useMoney()

  // `?new=1` (optionally with client= / project=) opens the create sheet — the dashboard links here.
  const wantsNew = params.get('new') === '1'
  useEffect(() => {
    if (!wantsNew) return
    const clientId = params.get('client')
    const projectId = params.get('project')
    const project = projectId ? lookups.projects.get(projectId) : undefined
    const cid = clientId && lookups.clients.has(clientId) ? clientId : project?.clientId
    openBizSheet({
      kind: 'invoice',
      initial: { ...(cid ? { clientId: cid } : {}), ...(project ? { projectId: project.id } : {}) },
    })
    update({ new: null, client: null, project: null })
    // Only react to the flag; lookups are read once.
  }, [wantsNew])

  const rec = useMemo(() => receivables(invoices, today), [invoices, today])
  const paidThisMonth = useMemo(
    () => invoices.filter((i) => i.status === 'paid' && i.paidDate && monthOf(i.paidDate) === month),
    [invoices, month],
  )
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { awaiting: 0, drafts: 0, paid: 0, all: invoices.length }
    for (const inv of invoices) {
      const s = invoiceState(inv, today)
      if (s === 'pending' || s === 'overdue') c.awaiting++
      else if (s === 'draft') c.drafts++
      else if (s === 'paid') c.paid++
    }
    return c
  }, [invoices, today])
  const shown = useMemo(() => {
    const states = FILTERS.find((f) => f.value === filter)!.states
    return invoices.filter((i) => states.includes(invoiceState(i, today))).sort(sorter(filter, today))
  }, [invoices, filter, today])

  const create = () => openBizSheet({ kind: 'invoice' })
  const paidTotal = paidThisMonth.reduce((s, i) => s + i.amount, 0)

  return (
    <>
      <PageHeader title="Invoices" actions={<NewButton label="New invoice" onClick={create} />}>
        <BusinessToolbar>
          <Segmented<Filter>
            className="sm:inline-flex sm:w-auto"
            block
            value={filter}
            onChange={(v) => update({ filter: v === 'awaiting' ? null : v })}
            options={FILTERS.map((f) => ({
              value: f.value,
              label: (
                <>
                  {f.label}
                  <span className="tabular text-xs opacity-60">{counts[f.value]}</span>
                </>
              ),
            }))}
          />
        </BusinessToolbar>
      </PageHeader>

      {invoices.length ? (
        <div className="flex flex-col gap-4 lg:gap-5">
          <Card>
            <div className="grid grid-cols-3 gap-3">
              <button type="button" className="min-w-0 text-left" onClick={() => update({ filter: null })}>
                <Stat
                  label="Awaiting"
                  value={<span className="tabular">{money(rec.pending, { compact: true })}</span>}
                  hint={`${rec.pendingCount} open`}
                />
              </button>
              <button type="button" className="min-w-0 text-left" onClick={() => update({ filter: null })}>
                <Stat
                  label="Overdue"
                  tone={rec.overdue > 0 ? 'bad' : 'neutral'}
                  value={<span className="tabular">{money(rec.overdue, { compact: true })}</span>}
                  hint={rec.overdueCount ? `${rec.overdueCount} late` : 'None late'}
                />
              </button>
              <button type="button" className="min-w-0 text-left" onClick={() => update({ filter: 'paid' })}>
                <Stat
                  label="Paid"
                  tone={paidTotal > 0 ? 'good' : 'neutral'}
                  value={<span className="tabular">{money(paidTotal, { compact: true })}</span>}
                  hint={fmtMonth(month, 'MMMM')}
                />
              </button>
            </div>
          </Card>

          {shown.length ? (
            <Card padded={false} className="min-w-0">
              <div className="divide-y divide-line">
                  {shown.map((inv) => (
                    <InvoiceRow
                      key={inv.id}
                      inv={inv}
                      client={lookups.clients.get(inv.clientId ?? '')}
                      project={lookups.projects.get(inv.projectId ?? '')}
                      today={today}
                      money={money}
                    />
                  ))}
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={FileText}
              title={EMPTY[filter].title}
              description={EMPTY[filter].description}
              action={<Button variant="primary" icon={Plus} onClick={create}>New invoice</Button>}
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Track invoices, freelance jobs and commissions — what you’re owed, what’s late and what’s been paid."
          action={<Button variant="primary" icon={Plus} onClick={create}>New invoice</Button>}
        />
      )}
    </>
  )
}
