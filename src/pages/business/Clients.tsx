import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, Plus, Search, Users, X } from 'lucide-react'
import { Badge, Button, Card, Chip, EmptyState, Input, PageHeader } from '@/components/ui'
import { clientFinancials } from '@/lib/business'
import { todayISO } from '@/lib/dates'
import { useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import type { Client } from '@/lib/types'
import { BusinessToolbar, ClientAvatar, ContactLinks, MiniStat, NewButton, type Money } from './components'
import { openBizSheet, useSearchState } from './lib'

export function ClientsPage() {
  const [params, update] = useSearchState()
  const [query, setQuery] = useState('')
  const showArchived = params.get('archived') === '1'
  const today = todayISO()

  const clients = useStore((s) => s.clients)
  const projects = useStore((s) => s.projects)
  const txs = useStore((s) => s.transactions)
  const invoices = useStore((s) => s.invoices)
  const money = useMoney()

  const wantsNew = params.get('new') === '1'
  useEffect(() => {
    if (!wantsNew) return
    openBizSheet({ kind: 'client' })
    update({ new: null })
  }, [wantsNew, update])

  const archivedCount = useMemo(() => clients.filter((c) => c.archived).length, [clients])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients
      .filter((c) => (showArchived ? c.archived : !c.archived))
      .filter(
        (c) =>
          !q ||
          [c.name, c.company, c.email, c.phone, c.notes].some((f) => f?.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [clients, query, showArchived])
  const fins = useMemo(
    () => new Map(shown.map((c) => [c.id, clientFinancials(c.id, projects, txs, invoices, today)])),
    [shown, projects, txs, invoices, today],
  )

  const create = () => openBizSheet({ kind: 'client' })

  return (
    <>
      <PageHeader title="Clients" actions={<NewButton label="New client" onClick={create} />}>
        <BusinessToolbar>
          {clients.length > 0 && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                type="text"
                enterKeyHint="search"
                autoComplete="off"
                value={query}
                placeholder="Search clients"
                aria-label="Search clients"
                className="pl-9 pr-9"
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-muted hover:text-ink"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          {(archivedCount > 0 || showArchived) && (
            <Chip active={showArchived} icon={Archive} count={archivedCount} onClick={() => update({ archived: showArchived ? null : '1' })}>
              Archived
            </Chip>
          )}
        </BusinessToolbar>
      </PageHeader>

      {shown.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 lg:gap-4">
          {shown.map((c) => (
            <ClientCard key={c.id} client={c} fin={fins.get(c.id)!} money={money} />
          ))}
        </div>
      ) : clients.length ? (
        <EmptyState
          icon={Search}
          title={query ? `No clients match “${query.trim()}”` : showArchived ? 'No archived clients' : 'All clients are archived'}
          action={
            query ? <Button onClick={() => setQuery('')}>Clear search</Button> : showArchived ? (
              <Button onClick={() => update({ archived: null })}>Show active clients</Button>
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Keep contacts, projects, invoices and everything a client has paid you in one place."
          action={<Button variant="primary" icon={Plus} onClick={create}>New client</Button>}
        />
      )}
    </>
  )
}

function ClientCard({ client, fin, money }: {
  client: Client
  fin: ReturnType<typeof clientFinancials>
  money: Money
}) {
  const navigate = useNavigate()
  const to = `/business/clients/${client.id}`
  return (
    <Card onClick={() => navigate(to)} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start gap-3">
        <ClientAvatar client={client} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <Link to={to} onClick={(e) => e.stopPropagation()} className="truncate text-[15px] font-semibold tracking-tight text-ink">
              {client.name}
            </Link>
            {client.archived && <Badge>Archived</Badge>}
          </div>
          <p className="truncate text-[13px] text-muted">{client.company || client.email || client.phone || 'No details'}</p>
        </div>
        <ContactLinks client={client} />
      </div>
      <div className="mt-auto grid grid-cols-3 gap-3 border-t border-line pt-3">
        <MiniStat label="Received" value={money(fin.income, { compact: true })} tone={fin.income > 0 ? 'good' : undefined} />
        <MiniStat label="Outstanding" value={money(fin.outstanding, { compact: true })} tone={fin.outstanding > 0 ? 'warn' : undefined} />
        <MiniStat label="Projects" value={fin.projects} />
      </div>
    </Card>
  )
}
