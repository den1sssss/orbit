// Business math: invoices, receivables, project and client financials.
import { diffDays, todayISO } from './dates'
import type { ID, ISODate, Invoice, InvoiceKind, Project, Transaction } from './types'

export type InvoiceState = 'draft' | 'pending' | 'overdue' | 'paid' | 'cancelled'

/** Effective state: a sent invoice past its due date is overdue. */
export function invoiceState(inv: Invoice, today = todayISO()): InvoiceState {
  if (inv.status === 'paid') return 'paid'
  if (inv.status === 'cancelled') return 'cancelled'
  if (inv.status === 'draft') return 'draft'
  return inv.dueDate && inv.dueDate < today ? 'overdue' : 'pending'
}

export const INVOICE_STATE_LABELS: Record<InvoiceState, string> = {
  draft: 'Draft',
  pending: 'Awaiting payment',
  overdue: 'Overdue',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  invoice: 'Invoice',
  freelance: 'Freelance job',
  commission: 'Commission',
}

/** Income category used when an invoice of this kind is paid. */
export const INVOICE_KIND_CATEGORY: Record<InvoiceKind, ID> = {
  invoice: 'fc-business-income',
  freelance: 'fc-freelance',
  commission: 'fc-commission',
}

export function daysOverdue(inv: Invoice, today = todayISO()): number {
  return inv.dueDate ? Math.max(0, diffDays(today, inv.dueDate)) : 0
}

export interface Receivables {
  /** Sent, not yet paid (incl. overdue). */
  pending: number
  overdue: number
  pendingCount: number
  overdueCount: number
  drafts: number
}

export function receivables(invoices: Invoice[], today = todayISO()): Receivables {
  const r: Receivables = { pending: 0, overdue: 0, pendingCount: 0, overdueCount: 0, drafts: 0 }
  for (const inv of invoices) {
    const s = invoiceState(inv, today)
    if (s === 'pending' || s === 'overdue') {
      r.pending += inv.amount
      r.pendingCount++
    }
    if (s === 'overdue') {
      r.overdue += inv.amount
      r.overdueCount++
    }
    if (s === 'draft') r.drafts += inv.amount
  }
  return r
}

/** Next invoice number like INV-0008 based on existing numbers. */
export function nextInvoiceNumber(invoices: Invoice[]): string {
  let max = 0
  for (const inv of invoices) {
    const m = /(\d+)\s*$/.exec(inv.number)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `INV-${String(max + 1).padStart(4, '0')}`
}

export interface Financials {
  income: number
  expenses: number
  profit: number
  /** Margin 0..1 (0 when no income). */
  margin: number
  /** Invoiced but not yet paid. */
  outstanding: number
}

function financials(txs: Transaction[], invs: Invoice[], today: ISODate): Financials {
  let income = 0
  let expenses = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else expenses += t.amount
  }
  const outstanding = invs
    .filter((i) => ['pending', 'overdue'].includes(invoiceState(i, today)))
    .reduce((s, i) => s + i.amount, 0)
  return { income, expenses, profit: income - expenses, margin: income ? (income - expenses) / income : 0, outstanding }
}

/** Business-scope totals for a date range (inclusive). */
export function businessTotals(txs: Transaction[], start: ISODate, end: ISODate): Financials {
  return financials(txs.filter((t) => t.scope === 'business' && t.date >= start && t.date <= end), [], todayISO())
}

/** Everything ever booked against a project (any scope), plus unpaid invoices. */
export function projectFinancials(project: Project, txs: Transaction[], invoices: Invoice[], today = todayISO()): Financials {
  return financials(
    txs.filter((t) => t.projectId === project.id),
    invoices.filter((i) => i.projectId === project.id),
    today,
  )
}

/** Income received from a client: paid invoices for that client + transactions on the client's projects. */
export function clientFinancials(
  clientId: ID, projects: Project[], txs: Transaction[], invoices: Invoice[], today = todayISO(),
): Financials & { projects: number } {
  const projectIds = new Set(projects.filter((p) => p.clientId === clientId).map((p) => p.id))
  const invs = invoices.filter((i) => i.clientId === clientId)
  const txIds = new Set(invs.map((i) => i.transactionId).filter(Boolean))
  const related = txs.filter((t) => (t.projectId && projectIds.has(t.projectId)) || txIds.has(t.id))
  return { ...financials(related, invs, today), projects: projectIds.size }
}
