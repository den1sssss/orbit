import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  ArrowDownRight, ArrowUpRight, BadgePercent, Ban, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight,
  Copy, FileText, Laptop, ListPlus, Mail, Pencil, Phone, Plus, RotateCcw, Send, Trash2, Undo2, Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  Badge, Button, Card, Checkbox, cn, IconButton, Menu, Progress, type MenuItem,
} from '@/components/ui'
import { INVOICE_STATE_LABELS, invoiceState, type Financials, type InvoiceState } from '@/lib/business'
import { currentMonth, fmtMonth, fmtTime, relativeDay, shiftMonth } from '@/lib/dates'
import { pct, useMoney } from '@/lib/format'
import { categoryIcon, colorHex, tint } from '@/lib/icons'
import { openEditor } from '@/lib/ui'
import type {
  Client, ColorKey, FinanceCategory, ID, Invoice, InvoiceKind, ISODate, MonthKey, Project, Task, Transaction,
} from '@/lib/types'
import {
  cancelInvoice, deadlineInfo, deleteInvoice, deleteProject, duplicateInvoice, followUpTask, initials,
  invoiceDueInfo, markPaidWithUndo, markSent, markUnpaid, maxMonth, openBizSheet, PROJECT_STATUS_LABELS,
  reopenInvoice, setProjectStatus, STATE_TONE, TONE_TEXT, toggleTaskWithUndo, type RevenueRow, type TaskCount,
} from './lib'

export type Money = ReturnType<typeof useMoney>

// ───────────────────────── Navigation ─────────────────────────

const TABS = [
  { to: '/business', label: 'Overview', end: true },
  { to: '/business/projects', label: 'Projects' },
  { to: '/business/clients', label: 'Clients' },
  { to: '/business/invoices', label: 'Invoices' },
]

/** Section tabs (every business sub-page). Scrolls sideways on narrow phones. */
export function BusinessTabs({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Business sections"
      className={cn('-mx-4 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0', className)}
    >
      <div className="flex w-max min-w-full gap-1 border-b border-line">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'relative flex h-10 shrink-0 items-center px-3 text-sm font-medium transition-colors',
                isActive
                  ? 'text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent'
                  : 'text-muted hover:text-ink',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Tabs + optional wrapping toolbar row, for PageHeader children. */
export function BusinessToolbar({ children }: { children?: ReactNode }) {
  return (
    <>
      <BusinessTabs className={children ? 'mb-4' : undefined} />
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </>
  )
}

/** "‹ Projects" back link above a detail page title (standalone PWAs have no back button). */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-ml-2 mb-1 inline-flex h-9 items-center gap-0.5 rounded-lg pl-1 pr-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft"
    >
      <ChevronLeft size={17} />
      {children}
    </Link>
  )
}

/** Prev / month / next. Tapping the label returns to this month. */
export function MonthPicker({ value, onChange }: { value: MonthKey; onChange: (m: MonthKey) => void }) {
  const cur = currentMonth()
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface shadow-card">
      <IconButton icon={ChevronLeft} label="Previous month" onClick={() => onChange(shiftMonth(value, -1))} />
      <button
        type="button"
        onClick={() => onChange(cur)}
        title={value !== cur ? 'Go to this month' : undefined}
        className="h-10 min-w-[8.5rem] rounded-lg px-1 text-center text-sm font-medium text-ink transition-colors hover:bg-surface-2"
      >
        {fmtMonth(value)}
      </button>
      <IconButton
        icon={ChevronRight}
        label="Next month"
        disabled={value >= maxMonth()}
        onClick={() => onChange(shiftMonth(value, 1))}
      />
    </div>
  )
}

/** Small "All ›" link for card headers. */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-my-2 -mr-2 inline-flex h-10 items-center gap-0.5 rounded-lg px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft"
    >
      {children}
      <ChevronRight size={15} />
    </Link>
  )
}

/** Card with a header and an edge-to-edge row list. */
export function ListCard({
  title, subtitle, action, children, className, footer,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  footer?: ReactNode
}) {
  return (
    <Card padded={false} className={cn('min-w-0', className)}>
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
      {footer}
    </Card>
  )
}

/** Text button for card headers (40px tall tap target). */
export function CardAction({ icon: Icon, onClick, children }: { icon?: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-my-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft last:-mr-2"
    >
      {Icon && <Icon size={15} strokeWidth={2.2} />}
      {children}
    </button>
  )
}

/** Divided rows inside a ListCard. */
export function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line border-t border-line pb-1">{children}</div>
}

/** Padding wrapper for an empty state inside a ListCard. */
export function CardEmpty({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-4 sm:px-5">{children}</div>
}

/** "Show N more" toggle used under long lists. */
export function MoreToggle({ expanded, hidden, onToggle }: { expanded: boolean; hidden: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-11 w-full items-center justify-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"
    >
      {expanded ? 'Show less' : `Show ${hidden} more`}
      <ChevronDown size={15} className={cn('transition-transform', expanded && 'rotate-180')} />
    </button>
  )
}

/** Primary "+ New …" header action: labelled on wider screens, icon on phones. */
export function NewButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <>
      <Button variant="primary" icon={Plus} className="max-sm:hidden" onClick={onClick}>
        {label}
      </Button>
      <IconButton icon={Plus} label={label} variant="primary" className="sm:hidden" onClick={onClick} />
    </>
  )
}

// ───────────────────────── Figures ─────────────────────────

/** "↑ 12% vs Sep". `upIsGood` decides the tone; `absolute` formats a difference instead of a %. */
export function Delta({ cur, prev, prevMonth, upIsGood, absolute }: {
  cur: number
  prev: number
  prevMonth: MonthKey
  upIsGood: boolean
  absolute?: (n: number) => string
}) {
  const label = fmtMonth(prevMonth, 'MMM')
  const diff = cur - prev
  if (Math.abs(diff) < 0.005) return <>Same as {label}</>
  if (!absolute && prev === 0) return <>Nothing in {label}</>
  const up = diff > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const text = absolute ? absolute(diff) : pct(Math.abs(diff) / Math.abs(prev))
  return (
    <>
      <span className={cn('inline-flex items-center font-medium', up === upIsGood ? 'text-good' : 'text-bad')}>
        <Icon size={13} strokeWidth={2.4} />
        {text}
      </span>{' '}
      vs {label}
    </>
  )
}

/** Small label/value pair. */
export function MiniStat({ label, value, tone, className }: {
  label: ReactNode
  value: ReactNode
  tone?: 'good' | 'bad' | 'warn'
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate text-xs text-muted">{label}</p>
      <p
        className={cn(
          'tabular mt-0.5 truncate text-sm font-semibold',
          tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** Ranked horizontal bars (scaled to the largest row) with share of total. */
export function BarList({ rows, total, limit = 5, empty }: {
  rows: RevenueRow[]
  total: number
  limit?: number
  empty?: ReactNode
}) {
  const money = useMoney()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  if (!rows.length) return <>{empty}</>
  const max = rows[0]?.total || 1
  const shown = expanded ? rows : rows.slice(0, limit)
  return (
    <div className="-mx-2 flex flex-col">
      {shown.map((r) => {
        const share = total > 0 ? r.total / total : 0
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn('truncate text-sm font-medium', r.key ? 'text-ink' : 'text-muted')}>{r.label}</span>
              <span className="tabular shrink-0 text-sm font-medium text-ink">{money(r.total)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(2, (r.total / max) * 100)}%`, background: colorHex(r.color ?? 'slate') }}
                />
              </div>
              <span className="tabular w-9 shrink-0 text-right text-xs text-muted">{Math.round(share * 100)}%</span>
            </div>
          </>
        )
        return r.to ? (
          <button
            key={r.key}
            type="button"
            onClick={() => navigate(r.to!)}
            className="min-h-12 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
          >
            {body}
          </button>
        ) : (
          <div key={r.key} className="min-h-12 px-2 py-2">
            {body}
          </div>
        )
      })}
      {rows.length > limit && (
        <MoreToggle expanded={expanded} hidden={rows.length - limit} onToggle={() => setExpanded((e) => !e)} />
      )}
    </div>
  )
}

// ───────────────────────── Identity ─────────────────────────

export function ClientAvatar({ client, size = 40 }: { client: Pick<Client, 'name' | 'color'>; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: tint(client.color, 0.16),
        color: colorHex(client.color),
      }}
    >
      {initials(client.name)}
    </span>
  )
}

/** Tap-to-call / email buttons (anchors, so they never trigger the card behind them). */
export function ContactLinks({ client, className }: { client: Client; className?: string }) {
  if (!client.phone && !client.email) return null
  const cls =
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 shadow-card transition-colors hover:bg-surface-2 hover:text-ink'
  return (
    <div className={cn('flex items-center gap-1.5', className)} onClick={(e) => e.stopPropagation()}>
      {client.phone && (
        <a href={`tel:${client.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${client.name}`} title={client.phone} className={cls}>
          <Phone size={17} />
        </a>
      )}
      {client.email && (
        <a href={`mailto:${client.email}`} aria-label={`Email ${client.name}`} title={client.email} className={cls}>
          <Mail size={17} />
        </a>
      )}
    </div>
  )
}

export function DeadlineText({ deadline, done, today, className }: {
  deadline?: ISODate
  done: boolean
  today: ISODate
  className?: string
}) {
  const dl = deadlineInfo(deadline, done, today)
  if (!dl) return null
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', TONE_TEXT[dl.tone], className)}>
      <CalendarClock size={14} className="shrink-0" />
      <span className="truncate">{dl.text}</span>
    </span>
  )
}

// ───────────────────────── Invoices ─────────────────────────

export const KIND_ICONS: Record<InvoiceKind, LucideIcon> = {
  invoice: FileText,
  freelance: Laptop,
  commission: BadgePercent,
}

const KIND_SHORT: Record<InvoiceKind, string> = { invoice: '', freelance: 'Freelance', commission: 'Commission' }

export function StateBadge({ state }: { state: InvoiceState }) {
  return <Badge tone={STATE_TONE[state]}>{INVOICE_STATE_LABELS[state]}</Badge>
}

/** Icon button in narrow rows, labelled button in wide ones (needs an @container parent). */
export function MarkPaidButton({ id }: { id: ID }) {
  return (
    <>
      <IconButton
        icon={Check}
        label="Mark paid"
        variant="secondary"
        className="@md:hidden"
        onClick={() => markPaidWithUndo(id)}
      />
      <Button icon={Check} className="hidden @md:inline-flex" onClick={() => markPaidWithUndo(id)}>
        Mark paid
      </Button>
    </>
  )
}

export function invoiceMenu(inv: Invoice, state: InvoiceState, clientName?: string): MenuItem[] {
  const items: MenuItem[] = []
  if (state === 'draft') {
    items.push({ label: 'Mark sent', icon: Send, onClick: () => markSent(inv.id) })
    items.push({ label: 'Mark paid', icon: Check, onClick: () => markPaidWithUndo(inv.id) })
  }
  if (state === 'paid' && inv.transactionId) {
    items.push({ label: 'View payment', icon: Wallet, onClick: () => openEditor({ kind: 'transaction', id: inv.transactionId }) })
  }
  items.push({ label: 'Edit', icon: Pencil, onClick: () => openBizSheet({ kind: 'invoice', id: inv.id }) })
  if (state === 'pending' || state === 'overdue') {
    items.push({ label: 'Follow-up task', icon: ListPlus, onClick: () => followUpTask(inv, clientName) })
  }
  items.push({ label: 'Duplicate', icon: Copy, onClick: () => duplicateInvoice(inv) })
  if (state === 'paid') items.push({ label: 'Mark unpaid', icon: Undo2, onClick: () => markUnpaid(inv.id) })
  else if (state === 'cancelled') items.push({ label: 'Reopen', icon: RotateCcw, onClick: () => reopenInvoice(inv.id) })
  else items.push({ label: 'Cancel invoice', icon: Ban, onClick: () => cancelInvoice(inv) })
  items.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => void deleteInvoice(inv) })
  return items
}

export function InvoiceRow({
  inv, client, project, today, money, compact, hideClient,
}: {
  inv: Invoice
  client?: Client
  project?: Project
  today: ISODate
  money: Money
  /** Overview: no "⋯" menu. */
  compact?: boolean
  /** Client detail page: client name is implied. */
  hideClient?: boolean
}) {
  const state = invoiceState(inv, today)
  const due = invoiceDueInfo(inv, today)
  const open = state === 'pending' || state === 'overdue'
  const Icon = KIND_ICONS[inv.kind]
  const color: ColorKey = client?.color ?? project?.color ?? 'slate'
  const who = [KIND_SHORT[inv.kind], hideClient ? project?.name : client?.name ?? project?.name].filter(Boolean).join(' · ')
  const onOpen = () =>
    state === 'paid' && inv.transactionId
      ? openEditor({ kind: 'transaction', id: inv.transactionId })
      : openBizSheet({ kind: 'invoice', id: inv.id })
  return (
    <div className="@container flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: tint(color, 0.15), color: colorHex(color) }}
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium text-ink">
              {inv.title}
              <span className="tabular ml-1.5 text-[13px] font-normal text-muted">{inv.number}</span>
            </span>
            <span
              className={cn(
                'tabular shrink-0 text-sm font-semibold',
                state === 'cancelled' ? 'text-muted line-through' : state === 'paid' ? 'text-good' : 'text-ink',
              )}
            >
              {money(inv.amount)}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
            <StateBadge state={state} />
            {who && <span className="min-w-0 truncate text-muted">{who}</span>}
            {who && <span className="text-muted">·</span>}
            <span className={TONE_TEXT[due.tone]}>{due.text}</span>
          </div>
        </div>
      </button>
      {(open || !compact) && (
        <div className="flex shrink-0 items-center gap-1">
          {open && <MarkPaidButton id={inv.id} />}
          {!compact && <Menu items={invoiceMenu(inv, state, client?.name)} label={`Actions for ${inv.number}`} />}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Projects ─────────────────────────

export function projectMenu(p: Project, after?: () => void): MenuItem[] {
  const items: MenuItem[] = [{ label: 'Edit project', icon: Pencil, onClick: () => openBizSheet({ kind: 'project', id: p.id }) }]
  if (p.status !== 'done') items.push({ label: 'Mark done', icon: Check, onClick: () => setProjectStatus(p, 'done') })
  if (p.status === 'active') items.push({ label: 'Pause', icon: Ban, onClick: () => setProjectStatus(p, 'paused') })
  if (p.status !== 'active') items.push({ label: 'Reactivate', icon: RotateCcw, onClick: () => setProjectStatus(p, 'active') })
  items.push({
    label: 'Delete project',
    icon: Trash2,
    danger: true,
    onClick: () => void deleteProject(p).then((ok) => ok && after?.()),
  })
  return items
}

/** Tasks done/total with a bar in the project's color. */
export function TaskProgress({ count, color }: { count?: TaskCount; color: ColorKey }) {
  if (!count?.total) return <p className="text-[13px] text-muted">No tasks yet</p>
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-2">Tasks</span>
        <span className="tabular text-ink">
          {count.done}/{count.total}
          <span className="text-muted"> done</span>
        </span>
      </div>
      <Progress className="mt-1.5" value={count.done / count.total} color={color} label="Tasks done" />
    </div>
  )
}

/** Received vs agreed fee. */
export function FeeProgress({ fee, received, money }: { fee?: number; received: number; money: Money }) {
  if (!fee) return null
  const ratio = received / fee
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-2">Received</span>
        <span className="tabular truncate text-ink">
          {money(received)} <span className="text-muted">of {money(fee)}</span>
        </span>
      </div>
      <Progress className="mt-1.5" value={ratio} tone={ratio >= 1 ? 'good' : 'accent'} label="Fee received" />
    </div>
  )
}

export function ProjectCard({ project, clientName, fin, count, today, money }: {
  project: Project
  clientName?: string
  fin: Financials
  count?: TaskCount
  today: ISODate
  money: Money
}) {
  const navigate = useNavigate()
  const to = `/business/projects/${project.id}`
  return (
    <Card onClick={() => navigate(to)} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorHex(project.color) }} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to={to}
              onClick={(e) => e.stopPropagation()}
              className="truncate text-[15px] font-semibold tracking-tight text-ink"
            >
              {project.name}
            </Link>
            {project.status !== 'active' && <Badge tone={project.status === 'done' ? 'good' : 'neutral'}>{PROJECT_STATUS_LABELS[project.status]}</Badge>}
          </div>
          <p className="truncate text-[13px] text-muted">{clientName ?? 'No client'}</p>
        </div>
        <div className="-mr-1 -mt-1">
          <Menu items={projectMenu(project)} label={`Actions for ${project.name}`} />
        </div>
      </div>
      {project.deadline && (
        <DeadlineText className="text-[13px]" deadline={project.deadline} done={project.status === 'done'} today={today} />
      )}
      <TaskProgress count={count} color={project.color} />
      <FeeProgress fee={project.fee} received={fin.income} money={money} />
      <div className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-3">
        <MiniStat label="Profit" value={money(fin.profit)} tone={fin.profit < 0 ? 'bad' : undefined} />
        <MiniStat label="Outstanding" value={money(fin.outstanding)} tone={fin.outstanding > 0 ? 'warn' : undefined} />
      </div>
    </Card>
  )
}

// ───────────────────────── Detail rows ─────────────────────────

export function TaskLine({ task, today, projectName }: { task: Task; today: ISODate; projectName?: string }) {
  const done = task.status === 'done'
  const overdue = !done && !!task.dueDate && task.dueDate < today
  const sub = [
    projectName,
    task.dueDate ? relativeDay(task.dueDate) + (task.dueTime ? ` · ${fmtTime(task.dueTime)}` : '') : null,
    task.priority === 'urgent' || task.priority === 'high' ? (task.priority === 'urgent' ? 'Urgent' : 'High priority') : null,
    task.subtasks.length ? `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length} steps` : null,
  ].filter(Boolean)
  return (
    <div className="flex min-h-12 items-center gap-3 px-3 py-2 sm:px-4">
      <div
        className="-m-2.5 flex shrink-0 cursor-pointer p-2.5"
        onClick={(e) => {
          e.stopPropagation()
          toggleTaskWithUndo(task)
        }}
      >
        <Checkbox
          round
          size={22}
          checked={done}
          label={done ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
          onChange={() => toggleTaskWithUndo(task)}
        />
      </div>
      <button
        type="button"
        onClick={() => openEditor({ kind: 'task', id: task.id })}
        className="min-w-0 flex-1 py-1 text-left"
      >
        <p className={cn('truncate text-sm', done ? 'text-muted line-through' : 'font-medium text-ink')}>{task.title}</p>
        {sub.length > 0 && !done && (
          <p className={cn('truncate text-[13px]', overdue ? 'text-bad' : 'text-muted')}>
            {overdue ? 'Overdue · ' : ''}
            {sub.join(' · ')}
          </p>
        )}
      </button>
    </div>
  )
}

export function TxLine({ tx, category, money }: { tx: Transaction; category?: FinanceCategory; money: Money }) {
  const Icon = categoryIcon(category?.icon)
  const color = category?.color ?? 'slate'
  return (
    <button
      type="button"
      onClick={() => openEditor({ kind: 'transaction', id: tx.id })}
      className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-4"
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: tint(color, 0.15), color: colorHex(color) }}
      >
        <Icon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{tx.payee || category?.name || 'Transaction'}</p>
        <p className="truncate text-[13px] text-muted">
          {[relativeDay(tx.date), category?.name, tx.note].filter(Boolean).join(' · ')}
        </p>
      </div>
      <span className={cn('tabular shrink-0 text-sm font-semibold', tx.type === 'income' ? 'text-good' : 'text-ink')}>
        {tx.type === 'income' ? money(tx.amount, { sign: true }) : `−${money(tx.amount)}`}
      </span>
    </button>
  )
}
