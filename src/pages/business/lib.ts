// Business-module-only helpers: URL state, sheet state, lookups, date wording and
// actions that come with an Undo. Pure math lives in src/lib/business.ts.
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { create } from 'zustand'
import { invoiceState, nextInvoiceNumber, type InvoiceState } from '@/lib/business'
import { addDaysISO, currentMonth, diffDays, fmt, shiftMonth, todayISO } from '@/lib/dates'
import { useStore } from '@/lib/store'
import { confirm, openEditor, removeWithUndo, toast } from '@/lib/ui'
import type {
  Client, ColorKey, ID, ISODate, Invoice, MonthKey, Project, Task, Transaction,
} from '@/lib/types'

// ───────────────────────── URL state ─────────────────────────

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Latest month the picker allows (next month). */
export function maxMonth(): MonthKey {
  return shiftMonth(currentMonth(), 1)
}

export function readMonth(params: URLSearchParams): MonthKey {
  const raw = params.get('month')
  if (raw && MONTH_RE.test(raw) && raw <= maxMonth()) return raw
  return currentMonth()
}

/** Value for `?month=` (the current month is the default, so it's omitted). */
export function monthParamValue(m: MonthKey): string | null {
  return m === currentMonth() ? null : m
}

/** End month of a 6-month window that keeps the selected month visible. */
export function seriesEnd(month: MonthKey, count = 6): MonthKey {
  const cur = currentMonth()
  if (month >= cur) return month
  if (month >= shiftMonth(cur, -(count - 1))) return cur
  return month
}

/** Search params + a patch-style updater (null/'' removes a key). Replaces history. */
export function useSearchState() {
  const [params, setParams] = useSearchParams()
  const update = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return [params, update] as const
}

// ───────────────────────── Sheets ─────────────────────────

export type BizSheet =
  | { kind: 'invoice'; id?: ID; initial?: Partial<Invoice> }
  | { kind: 'project'; id?: ID; initial?: Partial<Project> }
  | { kind: 'client'; id?: ID; initial?: Partial<Client> }

/** Which business sheet is open. `seq` gives every request a fresh draft. */
export const useBizSheet = create<{ sheet: BizSheet | null; seq: number }>(() => ({ sheet: null, seq: 0 }))

export function openBizSheet(sheet: BizSheet) {
  useBizSheet.setState((s) => ({ sheet, seq: s.seq + 1 }))
}

export function closeBizSheet() {
  useBizSheet.setState({ sheet: null })
}

// ───────────────────────── Lookups ─────────────────────────

export function useBizLookups() {
  const clients = useStore((s) => s.clients)
  const projects = useStore((s) => s.projects)
  return useMemo(
    () => ({
      clients: new Map(clients.map((c) => [c.id, c])),
      projects: new Map(projects.map((p) => [p.id, p])),
    }),
    [clients, projects],
  )
}

/** Client record name, falling back to the legacy free-text client. */
export function projectClientName(p: Project, clients: Map<ID, Client>): string | undefined {
  return (p.clientId && clients.get(p.clientId)?.name) || p.client?.trim() || undefined
}

export interface TaskCount {
  done: number
  total: number
}

/** Done / total tasks per project id. */
export function taskCounts(tasks: Task[]): Map<ID, TaskCount> {
  const map = new Map<ID, TaskCount>()
  for (const t of tasks) {
    if (!t.projectId) continue
    const c = map.get(t.projectId) ?? { done: 0, total: 0 }
    c.total++
    if (t.status === 'done') c.done++
    map.set(t.projectId, c)
  }
  return map
}

export const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  done: 'Done',
}

const STATUS_ORDER: Record<Project['status'], number> = { active: 0, paused: 1, done: 2 }

/** Active first, then soonest deadline (none last), then name. */
export function compareProjects(a: Project, b: Project): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
    a.name.localeCompare(b.name)
  )
}

const PALETTE: ColorKey[] = ['indigo', 'teal', 'orange', 'pink', 'blue', 'green', 'violet', 'amber']

export function nextColor(count: number): ColorKey {
  return PALETTE[count % PALETTE.length]
}

/** Task category for work follow-ups (only ids that exist, never undefined). */
export function workTaskCategory(): { categoryId: ID } | Record<string, never> {
  const cats = useStore.getState().taskCategories
  const hit = cats.find((c) => c.id === 'tc-business') ?? cats.find((c) => c.id === 'tc-work')
  return hit ? { categoryId: hit.id } : {}
}

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

// ───────────────────────── Wording ─────────────────────────

export type TextTone = 'bad' | 'warn' | 'good' | 'muted'

export const TONE_TEXT: Record<TextTone, string> = {
  bad: 'text-bad',
  warn: 'text-warn',
  good: 'text-good',
  muted: 'text-muted',
}

/** 'Oct 21' (adds the year when it isn't this year). */
export function shortDate(iso: ISODate, today = todayISO()): string {
  return fmt(iso, iso.slice(0, 4) === today.slice(0, 4) ? 'MMM d' : 'MMM d, yyyy')
}

function days(n: number) {
  return `${n} day${n === 1 ? '' : 's'}`
}

/** Project deadline countdown. */
export function deadlineInfo(
  deadline: ISODate | undefined, done: boolean, today = todayISO(),
): { text: string; tone: TextTone } | null {
  if (!deadline) return null
  const d = diffDays(deadline, today)
  const date = shortDate(deadline, today)
  if (done) return { text: `Deadline was ${date}`, tone: 'muted' }
  if (d < 0) return { text: `${days(-d)} overdue · ${date}`, tone: 'bad' }
  if (d === 0) return { text: 'Due today', tone: 'warn' }
  if (d === 1) return { text: 'Due tomorrow', tone: 'warn' }
  return { text: `${days(d)} left · ${date}`, tone: d <= 7 ? 'warn' : 'muted' }
}

/** Due / paid line for an invoice row. */
export function invoiceDueInfo(inv: Invoice, today = todayISO()): { text: string; tone: TextTone } {
  const s = invoiceState(inv, today)
  if (s === 'paid') return { text: inv.paidDate ? `Paid ${shortDate(inv.paidDate, today)}` : 'Paid', tone: 'good' }
  if (s === 'cancelled') return { text: `Issued ${shortDate(inv.issueDate, today)}`, tone: 'muted' }
  if (!inv.dueDate) return { text: `Issued ${shortDate(inv.issueDate, today)}`, tone: 'muted' }
  const d = diffDays(inv.dueDate, today)
  if (s === 'draft') return { text: `Due ${shortDate(inv.dueDate, today)}`, tone: 'muted' }
  if (d < 0) return { text: `${days(-d)} overdue`, tone: 'bad' }
  if (d === 0) return { text: 'Due today', tone: 'warn' }
  if (d === 1) return { text: 'Due tomorrow', tone: 'warn' }
  return { text: `Due in ${days(d)}`, tone: d <= 3 ? 'warn' : 'muted' }
}

export const STATE_TONE: Record<InvoiceState, 'neutral' | 'accent' | 'good' | 'bad'> = {
  draft: 'neutral',
  pending: 'accent',
  overdue: 'bad',
  paid: 'good',
  cancelled: 'neutral',
}

/** Open invoices: overdue first, then by due date. */
export function compareOpen(a: Invoice, b: Invoice, today = todayISO()): number {
  const oa = invoiceState(a, today) === 'overdue' ? 0 : 1
  const ob = invoiceState(b, today) === 'overdue' ? 0 : 1
  return oa - ob || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.createdAt - a.createdAt
}

// ───────────────────────── Revenue attribution ─────────────────────────

export interface RevenueRow {
  key: string
  label: string
  color?: ColorKey
  total: number
  to?: string
}

/**
 * Split income transactions by client and by project. A payment belongs to a client
 * through its invoice, or through the project it was booked on.
 */
export function revenueSplit(
  income: Transaction[], invoices: Invoice[], projects: Map<ID, Project>, clients: Map<ID, Client>,
): { byClient: RevenueRow[]; byProject: RevenueRow[] } {
  const invByTx = new Map<ID, Invoice>()
  for (const inv of invoices) if (inv.transactionId) invByTx.set(inv.transactionId, inv)
  const byClient = new Map<string, RevenueRow>()
  const byProject = new Map<string, RevenueRow>()
  const add = (map: Map<string, RevenueRow>, row: Omit<RevenueRow, 'total'>, amount: number) => {
    const r = map.get(row.key) ?? { ...row, total: 0 }
    r.total += amount
    map.set(row.key, r)
  }
  for (const t of income) {
    const inv = invByTx.get(t.id)
    const project = projects.get(t.projectId ?? inv?.projectId ?? '')
    const client = clients.get(inv?.clientId ?? project?.clientId ?? '')
    const legacy = !client && project?.client?.trim()
    add(
      byClient,
      client
        ? { key: client.id, label: client.name, color: client.color, to: `/business/clients/${client.id}` }
        : legacy
          ? { key: `legacy:${legacy}`, label: legacy, color: 'slate' }
          : { key: '', label: 'No client', color: 'slate' },
      t.amount,
    )
    add(
      byProject,
      project
        ? { key: project.id, label: project.name, color: project.color, to: `/business/projects/${project.id}` }
        : { key: '', label: 'No project', color: 'slate' },
      t.amount,
    )
  }
  const sort = (m: Map<string, RevenueRow>) => [...m.values()].sort((a, b) => b.total - a.total)
  return { byClient: sort(byClient), byProject: sort(byProject) }
}

// ───────────────────────── Invoice actions ─────────────────────────

/** Record the payment (creates the business income) with an Undo. */
export function markPaidWithUndo(id: ID) {
  const s = useStore.getState()
  const prev = s.invoices.find((i) => i.id === id)?.status
  const tx = s.markInvoicePaid(id)
  if (!tx) return
  toast('Payment recorded', {
    action: {
      label: 'Undo',
      onClick: () => {
        const st = useStore.getState()
        st.unmarkInvoicePaid(id)
        if (prev && prev !== 'sent') st.patch('invoices', id, { status: prev })
      },
    },
  })
}

export function markUnpaid(id: ID) {
  useStore.getState().unmarkInvoicePaid(id)
  toast('Marked as unpaid · payment removed')
}

export function markSent(id: ID) {
  useStore.getState().patch('invoices', id, { status: 'sent' })
  toast('Marked as sent', {
    action: { label: 'Undo', onClick: () => useStore.getState().patch('invoices', id, { status: 'draft' }) },
  })
}

export function cancelInvoice(inv: Invoice) {
  const prev = inv.status
  useStore.getState().patch('invoices', inv.id, { status: 'cancelled' })
  toast('Invoice cancelled', {
    action: { label: 'Undo', onClick: () => useStore.getState().patch('invoices', inv.id, { status: prev }) },
  })
}

export function reopenInvoice(id: ID) {
  useStore.getState().patch('invoices', id, { status: 'sent' })
  toast('Invoice reopened')
}

export async function deleteInvoice(inv: Invoice) {
  if (inv.status === 'paid') {
    const ok = await confirm({
      title: `Delete ${inv.number}?`,
      message: 'The payment already recorded in Money stays. Mark it unpaid first to remove that too.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
  }
  removeWithUndo('invoices', inv.id, 'Invoice deleted')
}

/** Open the create sheet prefilled from an existing invoice (nothing saved until Save). */
export function duplicateInvoice(inv: Invoice) {
  const today = todayISO()
  const term = inv.dueDate ? Math.max(0, diffDays(inv.dueDate, inv.issueDate)) : undefined
  openBizSheet({
    kind: 'invoice',
    initial: {
      kind: inv.kind,
      title: inv.title,
      amount: inv.amount,
      clientId: inv.clientId,
      projectId: inv.projectId,
      notes: inv.notes,
      number: nextInvoiceNumber(useStore.getState().invoices),
      issueDate: today,
      dueDate: term !== undefined ? addDaysISO(today, term) : undefined,
      status: 'draft',
    },
  })
}

/** Business expense / income in the shared transaction editor, optionally on a project. */
export function logBusinessTx(type: 'income' | 'expense', projectId?: ID) {
  const id = type === 'expense' ? 'fc-business-expense' : 'fc-business-income'
  const hasCat = useStore.getState().financeCategories.some((c) => c.id === id)
  openEditor({
    kind: 'transaction',
    initial: { type, scope: 'business', ...(hasCat ? { categoryId: id } : {}), ...(projectId ? { projectId } : {}) },
  })
}

export function logBusinessExpense(projectId?: ID) {
  logBusinessTx('expense', projectId)
}

/** Prefilled task to chase a payment. */
export function followUpTask(inv: Invoice, clientName?: string) {
  openEditor({
    kind: 'task',
    initial: {
      title: `Follow up on ${inv.number}${clientName ? ` with ${clientName}` : ''}`,
      notes: `${inv.title}${inv.dueDate ? ` · due ${shortDate(inv.dueDate)}` : ''}`,
      priority: 'high',
      dueDate: todayISO(),
      ...(inv.projectId ? { projectId: inv.projectId } : {}),
      ...workTaskCategory(),
    },
  })
}

// ───────────────────────── Project / client actions ─────────────────────────

const PROJECT_LINKS = ['tasks', 'events', 'notes', 'transactions', 'invoices'] as const
type LinkKey = (typeof PROJECT_LINKS)[number]

/** Confirm, unlink everything that points at the project, delete it. Undo restores links. */
export async function deleteProject(p: Project): Promise<boolean> {
  const s = useStore.getState()
  const linked = {} as Record<LinkKey, ID[]>
  let count = 0
  for (const k of PROJECT_LINKS) {
    linked[k] = (s[k] as { id: ID; projectId?: ID }[]).filter((x) => x.projectId === p.id).map((x) => x.id)
    count += linked[k].length
  }
  const ok = await confirm({
    title: `Delete “${p.name}”?`,
    message: count
      ? `${count} linked item${count === 1 ? '' : 's'} (tasks, events, notes, money, invoices) will be kept and unlinked.`
      : 'The project will be removed.',
    confirmLabel: 'Delete project',
    danger: true,
  })
  if (!ok) return false
  for (const k of PROJECT_LINKS) for (const id of linked[k]) s.patch(k, id, { projectId: undefined })
  s.remove('projects', p.id)
  toast('Project deleted', {
    action: {
      label: 'Undo',
      onClick: () => {
        const st = useStore.getState()
        st.insert('projects', p)
        for (const k of PROJECT_LINKS) for (const id of linked[k]) st.patch(k, id, { projectId: p.id })
      },
    },
  })
  return true
}

/** Confirm, unlink projects and invoices, delete the client. Undo restores links. */
export async function deleteClient(c: Client): Promise<boolean> {
  const s = useStore.getState()
  const projectIds = s.projects.filter((p) => p.clientId === c.id).map((p) => p.id)
  const invoiceIds = s.invoices.filter((i) => i.clientId === c.id).map((i) => i.id)
  const count = projectIds.length + invoiceIds.length
  const ok = await confirm({
    title: `Delete “${c.name}”?`,
    message: count
      ? `Their ${projectIds.length} project(s) and ${invoiceIds.length} invoice(s) will be kept without a client. Archive instead to keep the history linked.`
      : 'The client will be removed.',
    confirmLabel: 'Delete client',
    danger: true,
  })
  if (!ok) return false
  for (const id of projectIds) s.patch('projects', id, { clientId: undefined })
  for (const id of invoiceIds) s.patch('invoices', id, { clientId: undefined })
  s.remove('clients', c.id)
  toast('Client deleted', {
    action: {
      label: 'Undo',
      onClick: () => {
        const st = useStore.getState()
        st.insert('clients', c)
        for (const id of projectIds) st.patch('projects', id, { clientId: c.id })
        for (const id of invoiceIds) st.patch('invoices', id, { clientId: c.id })
      },
    },
  })
  return true
}

export function setArchived(c: Client, archived: boolean) {
  useStore.getState().patch('clients', c.id, { archived })
  toast(archived ? 'Client archived' : 'Client restored', {
    action: { label: 'Undo', onClick: () => useStore.getState().patch('clients', c.id, { archived: !archived }) },
  })
}

export function setProjectStatus(p: Project, status: Project['status']) {
  const prev = p.status
  useStore.getState().patch('projects', p.id, { status })
  toast(status === 'done' ? 'Project completed' : status === 'paused' ? 'Project paused' : 'Project reactivated', {
    action: { label: 'Undo', onClick: () => useStore.getState().patch('projects', p.id, { status: prev }) },
  })
}

/** Toggle a task, with Undo when completing. */
export function toggleTaskWithUndo(t: Task) {
  const s = useStore.getState()
  s.toggleTask(t.id)
  if (t.status !== 'done') {
    toast('Task completed', { action: { label: 'Undo', onClick: () => useStore.getState().toggleTask(t.id) } })
  }
}
