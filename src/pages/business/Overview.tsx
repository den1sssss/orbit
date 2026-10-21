import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3, FilePlus2, FolderPlus, FolderKanban, ListChecks, Receipt, UserPlus, Wallet, type LucideIcon,
} from 'lucide-react'
import { Button, Card, CardHeader, cn, EmptyState, PageHeader, Progress, Stat } from '@/components/ui'
import { businessTotals, invoiceState, receivables } from '@/lib/business'
import { addDaysISO, fmtMonth, monthEnd, monthStart, shiftMonth, todayISO } from '@/lib/dates'
import { categoryBreakdown, monthlySeries, txInRange } from '@/lib/finance'
import { pct, useMoney } from '@/lib/format'
import { colorHex } from '@/lib/icons'
import { useStore } from '@/lib/store'
import { BusinessTrendChart } from './charts'
import {
  BarList, BusinessToolbar, CardEmpty, CardLink, Delta, DeadlineText, InvoiceRow, ListCard, MiniStat, MonthPicker,
  Rows, TaskLine,
} from './components'
import {
  compareOpen, compareProjects, logBusinessExpense, monthParamValue, openBizSheet, projectClientName, readMonth, revenueSplit, seriesEnd,
  taskCounts, useBizLookups, useSearchState, type RevenueRow,
} from './lib'

const ACTIONS: { label: string; icon: LucideIcon; run: () => void; primary?: boolean }[] = [
  { label: 'New invoice', icon: FilePlus2, run: () => openBizSheet({ kind: 'invoice' }), primary: true },
  { label: 'Log expense', icon: Receipt, run: () => logBusinessExpense() },
  { label: 'New project', icon: FolderPlus, run: () => openBizSheet({ kind: 'project' }) },
]

export function BusinessOverview() {
  const [params, update] = useSearchState()
  const month = readMonth(params)
  const prevMonth = shiftMonth(month, -1)
  const today = todayISO()

  const txs = useStore((s) => s.transactions)
  const invoices = useStore((s) => s.invoices)
  const projects = useStore((s) => s.projects)
  const clients = useStore((s) => s.clients)
  const tasks = useStore((s) => s.tasks)
  const cats = useStore((s) => s.financeCategories)
  const lookups = useBizLookups()
  const money = useMoney()

  const cur = useMemo(() => businessTotals(txs, monthStart(month), monthEnd(month)), [txs, month])
  const prev = useMemo(() => businessTotals(txs, monthStart(prevMonth), monthEnd(prevMonth)), [txs, prevMonth])
  const rec = useMemo(() => receivables(invoices, today), [invoices, today])
  const open = useMemo(
    () =>
      invoices
        .filter((i) => {
          const s = invoiceState(i, today)
          return s === 'pending' || s === 'overdue'
        })
        .sort((a, b) => compareOpen(a, b, today)),
    [invoices, today],
  )
  const monthIncome = useMemo(
    () => txInRange(txs, monthStart(month), monthEnd(month), 'business').filter((t) => t.type === 'income'),
    [txs, month],
  )
  const split = useMemo(
    () => revenueSplit(monthIncome, invoices, lookups.projects, lookups.clients),
    [monthIncome, invoices, lookups],
  )
  const byType = useMemo<RevenueRow[]>(() => {
    const catMap = new Map(cats.map((c) => [c.id, c]))
    return categoryBreakdown(monthIncome, 'income').map((r) => {
      const c = catMap.get(r.categoryId)
      return { key: r.categoryId || 'none', label: c?.name ?? 'Uncategorized', color: c?.color ?? 'slate', total: r.total }
    })
  }, [monthIncome, cats])
  const series = useMemo(() => monthlySeries(txs, seriesEnd(month), 6, 'business'), [txs, month])
  const hasSeries = series.some((p) => p.income || p.expense)
  const counts = useMemo(() => taskCounts(tasks), [tasks])
  const active = useMemo(() => projects.filter((p) => p.status === 'active').sort(compareProjects), [projects])
  const followUps = useMemo(() => {
    const soon = addDaysISO(today, 7)
    return tasks
      .filter((t) => t.projectId && t.status !== 'done' && t.dueDate && t.dueDate <= soon)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99'))
  }, [tasks, today])

  const isNew = !clients.length && !projects.length && !invoices.length && !txs.some((t) => t.scope === 'business')
  const monthLabel = fmtMonth(month)

  return (
    <>
      <PageHeader
        title="Business"
        actions={
          <div className="hidden items-center gap-2 md:flex">
            {ACTIONS.map((a) => (
              <Button key={a.label} variant={a.primary ? 'primary' : 'secondary'} icon={a.icon} onClick={a.run}>
                {a.label}
              </Button>
            ))}
          </div>
        }
      >
        <BusinessToolbar>
          <MonthPicker value={month} onChange={(m) => update({ month: monthParamValue(m) })} />
        </BusinessToolbar>
        <div className="mt-3 grid grid-cols-3 gap-2 md:hidden">
          {ACTIONS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.run}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-medium shadow-card transition-colors',
                a.primary
                  ? 'bg-accent text-accent-ink hover:bg-accent-hover'
                  : 'border border-line bg-surface text-ink hover:bg-surface-2',
              )}
            >
              <a.icon size={19} className={a.primary ? '' : 'text-accent-text'} />
              {a.label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="flex flex-col gap-4 lg:gap-5">
        {isNew && <GetStarted />}

        {/* ── Month totals */}
        <Card>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
            <Stat
              label="Income"
              value={<span className="tabular">{money(cur.income)}</span>}
              hint={<Delta cur={cur.income} prev={prev.income} prevMonth={prevMonth} upIsGood />}
            />
            <Stat
              label="Expenses"
              value={<span className="tabular">{money(cur.expenses)}</span>}
              hint={<Delta cur={cur.expenses} prev={prev.expenses} prevMonth={prevMonth} upIsGood={false} />}
            />
            <Stat
              label="Profit"
              tone={cur.profit < 0 ? 'bad' : 'neutral'}
              value={<span className="tabular">{money(cur.profit)}</span>}
              hint={
                <Delta cur={cur.profit} prev={prev.profit} prevMonth={prevMonth} upIsGood absolute={(n) => money(Math.abs(n))} />
              }
            />
            <Stat
              label="Margin"
              tone={cur.income > 0 && cur.margin < 0 ? 'bad' : 'neutral'}
              value={<span className="tabular">{cur.income > 0 ? pct(cur.margin) : '—'}</span>}
              hint={
                cur.income > 0 && prev.income > 0 ? (
                  <Delta
                    cur={cur.margin}
                    prev={prev.margin}
                    prevMonth={prevMonth}
                    upIsGood
                    absolute={(n) => `${Math.round(Math.abs(n) * 100)} pts`}
                  />
                ) : cur.income > 0 ? 'of income kept' : 'No income yet'
              }
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-[13px]">
            <span className="truncate text-muted">Separate from personal money</span>
            <CardLink to={`/money/transactions?scope=business&month=${month}`}>Transactions</CardLink>
          </div>
        </Card>

        {/* ── Trend + receivables */}
        <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader title="Income vs expenses" subtitle="Business · last 6 months · tap a month" />
            {hasSeries ? (
              <BusinessTrendChart data={series} selected={month} onSelect={(m) => update({ month: monthParamValue(m) })} />
            ) : (
              <EmptyState
                compact
                icon={BarChart3}
                title="No business history yet"
                description="Payments you record and business expenses you log build this chart."
              />
            )}
          </Card>

          <ListCard
            title="Receivables"
            subtitle={rec.pendingCount ? `${rec.pendingCount} open` : 'Money owed to you'}
            action={<CardLink to="/business/invoices">All</CardLink>}
          >
            <div className="grid grid-cols-2 gap-3 px-4 pb-3 sm:px-5">
              <MiniStat label="Awaiting payment" value={money(rec.pending)} />
              <MiniStat
                label={rec.overdueCount ? `Overdue · ${rec.overdueCount}` : 'Overdue'}
                value={money(rec.overdue)}
                tone={rec.overdue > 0 ? 'bad' : undefined}
              />
            </div>
            {open.length ? (
              <Rows>
                {open.slice(0, 5).map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    client={lookups.clients.get(inv.clientId ?? '')}
                    project={lookups.projects.get(inv.projectId ?? '')}
                    today={today}
                    money={money}
                    compact
                  />
                ))}
                {open.length > 5 && (
                  <Link
                    to="/business/invoices"
                    className="flex h-11 items-center justify-center text-[13px] font-medium text-ink-2 hover:text-ink"
                  >
                    {open.length - 5} more
                  </Link>
                )}
              </Rows>
            ) : (
              <CardEmpty>
                <EmptyState
                  compact
                  icon={Wallet}
                  title="Nothing owed right now"
                  description="Add an invoice, freelance job or commission to track it until it's paid."
                  action={
                    <Button size="sm" onClick={() => openBizSheet({ kind: 'invoice' })}>
                      New invoice
                    </Button>
                  }
                />
              </CardEmpty>
            )}
          </ListCard>
        </div>

        {/* ── Revenue split */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <Card className="min-w-0">
            <CardHeader title="Revenue by client" subtitle={`${monthLabel} · ${money(cur.income)}`} />
            <BarList rows={split.byClient} total={cur.income} empty={<NoIncome />} />
          </Card>
          <Card className="min-w-0">
            <CardHeader title="Revenue by project" subtitle={monthLabel} />
            <BarList rows={split.byProject} total={cur.income} empty={<NoIncome />} />
          </Card>
          <Card className="min-w-0 md:col-span-2 lg:col-span-1">
            <CardHeader title="Income by type" subtitle="Invoices, freelance, commissions" />
            <BarList rows={byType} total={cur.income} empty={<NoIncome />} />
          </Card>
        </div>

        {/* ── Work */}
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
          <ListCard
            title="Active projects"
            subtitle={active.length ? `${active.length} in progress` : undefined}
            action={<CardLink to="/business/projects">All</CardLink>}
          >
            {active.length ? (
              <Rows>
                {active.slice(0, 5).map((p) => {
                  const c = counts.get(p.id)
                  const client = projectClientName(p, lookups.clients)
                  return (
                    <Link
                      key={p.id}
                      to={`/business/projects/${p.id}`}
                      className="flex min-h-16 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2 sm:px-4"
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorHex(p.color) }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                          {client && <span className="max-w-[45%] shrink-0 truncate">{client}</span>}
                          {client && p.deadline && <span>·</span>}
                          {p.deadline ? (
                            <DeadlineText deadline={p.deadline} done={false} today={today} />
                          ) : (
                            !client && <span>No deadline</span>
                          )}
                        </div>
                      </div>
                      <div className="w-16 shrink-0 text-right">
                        {c?.total ? (
                          <>
                            <p className="tabular text-xs text-ink-2">
                              {c.done}/{c.total}
                            </p>
                            <Progress className="mt-1" height={4} value={c.done / c.total} color={p.color} label="Tasks done" />
                          </>
                        ) : (
                          <p className="text-xs text-muted">No tasks</p>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </Rows>
            ) : (
              <CardEmpty>
                <EmptyState
                  compact
                  icon={FolderKanban}
                  title="No active projects"
                  description="Projects group a client's tasks, deadlines, money and invoices."
                  action={
                    <Button size="sm" onClick={() => openBizSheet({ kind: 'project' })}>
                      New project
                    </Button>
                  }
                />
              </CardEmpty>
            )}
          </ListCard>

          <ListCard title="Follow-ups" subtitle="Project tasks due within a week">
            {followUps.length ? (
              <Rows>
                {followUps.slice(0, 6).map((t) => (
                  <TaskLine key={t.id} task={t} today={today} projectName={lookups.projects.get(t.projectId ?? '')?.name} />
                ))}
              </Rows>
            ) : (
              <CardEmpty>
                <EmptyState
                  compact
                  icon={ListChecks}
                  title="Nothing due this week"
                  description="Tasks you add to a project show up here as their due date gets close."
                />
              </CardEmpty>
            )}
          </ListCard>
        </div>
      </div>
    </>
  )
}

function NoIncome() {
  return <EmptyState compact title="No business income this month" description="Mark invoices paid or log income to see it here." />
}

function GetStarted() {
  const steps: { icon: LucideIcon; title: string; text: string; run: () => void }[] = [
    { icon: UserPlus, title: 'Add a client', text: 'Who you work for', run: () => openBizSheet({ kind: 'client' }) },
    { icon: FolderPlus, title: 'Create a project', text: 'Fee, deadline, tasks', run: () => openBizSheet({ kind: 'project' }) },
    { icon: FilePlus2, title: 'Track an invoice', text: 'Or a freelance job / commission', run: () => openBizSheet({ kind: 'invoice' }) },
  ]
  return (
    <Card>
      <CardHeader
        title="Set up your business"
        subtitle="Keep work money separate from personal: clients, projects, invoices and profit in one place."
      />
      <div className="grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={s.run}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
              <s.icon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">
                {i + 1}. {s.title}
              </span>
              <span className="block truncate text-[13px] text-muted">{s.text}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  )
}
