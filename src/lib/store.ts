import { create } from 'zustand'
import { emptyData } from './defaults'
import { advanceDue, nextRepeatDate, todayISO } from './dates'
import { INVOICE_KIND_CATEGORY } from './business'
import type {
  AppData, CalendarEvent, Client, CollectionKey, Contribution, Habit, ID, ImportantDate, Invoice, ISODate,
  ItemOf, JournalEntry, LifeGoal, Note, OrgList, PlannedPayment, Settings, Task, Transaction, VaultItem,
} from './types'

/** Unique id. Falls back when crypto.randomUUID is unavailable (non-HTTPS LAN access). */
export function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch { /* insecure context */ }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
}

export const DATA_KEYS: (keyof AppData)[] = [
  'version', 'settings', 'tasks', 'taskCategories', 'projects', 'notes', 'events', 'journal',
  'transactions', 'financeCategories', 'paymentMethods', 'budgets', 'goals', 'plannedPayments',
  'clients', 'invoices', 'habits', 'lifeGoals', 'reviews', 'lists', 'importantDates', 'vault', 'assistantChat',
]

// ───────────────────────── Factories (fill defaults) ─────────────────────────

export function makeTask(input: Partial<Task> & { title: string }, fallbackCategory = 'tc-personal'): Task {
  const now = Date.now()
  return {
    status: 'todo',
    priority: 'medium',
    categoryId: fallbackCategory,
    subtasks: [],
    tags: [],
    ...input,
    id: input.id ?? uid(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  }
}

export function makeEvent(input: Partial<CalendarEvent> & { title: string }): CalendarEvent {
  const now = Date.now()
  return {
    type: 'event',
    date: todayISO(),
    allDay: false,
    recurrence: { freq: 'none', interval: 1 },
    exdates: [],
    ...input,
    id: input.id ?? uid(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  }
}

export function makeNote(input: Partial<Note>): Note {
  const now = Date.now()
  return {
    title: '',
    body: '',
    category: 'personal',
    checklist: [],
    pinned: false,
    archived: false,
    tags: [],
    ...input,
    id: input.id ?? uid(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  }
}

export function makeTransaction(
  input: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'categoryId'>,
): Transaction {
  const now = Date.now()
  return {
    date: todayISO(),
    scope: 'personal',
    ...input,
    id: input.id ?? uid(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  }
}

export function makeJournal(date: ISODate, input: Partial<JournalEntry> = {}): JournalEntry {
  const now = Date.now()
  return {
    body: '',
    gratitude: [],
    wins: '',
    lessons: '',
    tomorrow: '',
    tags: [],
    ...input,
    date,
    id: input.id ?? uid(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  }
}

function stamp<T extends object>(input: Partial<T> & { id?: ID; createdAt?: number }) {
  const now = Date.now()
  return { id: input.id ?? uid(), createdAt: input.createdAt ?? now, updatedAt: now }
}

export function makeClient(input: Partial<Client> & { name: string }): Client {
  return { color: 'indigo', ...input, ...stamp<Client>(input) }
}

export function makeInvoice(input: Partial<Invoice> & Pick<Invoice, 'title' | 'amount' | 'number'>): Invoice {
  return { kind: 'invoice', issueDate: todayISO(), status: 'sent', ...input, ...stamp<Invoice>(input) }
}

export function makeHabit(input: Partial<Habit> & { name: string }): Habit {
  return {
    color: 'green', area: 'health', schedule: { kind: 'daily' }, target: 1, log: {}, order: 0,
    ...input, ...stamp<Habit>(input),
  }
}

export function makeLifeGoal(input: Partial<LifeGoal> & { title: string }): LifeGoal {
  return {
    horizon: 'monthly', area: 'personal', status: 'active', measure: 'milestones', milestones: [],
    ...input, ...stamp<LifeGoal>(input),
  }
}

export function makeList(input: Partial<OrgList> & { name: string }): OrgList {
  return { kind: 'shopping', color: 'green', items: [], ...input, ...stamp<OrgList>(input) }
}

export function makeImportantDate(input: Partial<ImportantDate> & Pick<ImportantDate, 'title' | 'date'>): ImportantDate {
  return { kind: 'birthday', yearly: true, remindDays: 1, ...input, ...stamp<ImportantDate>(input) }
}

export function makeVaultItem(input: Partial<VaultItem> & { title: string }): VaultItem {
  return { kind: 'document', fields: [], ...input, ...stamp<VaultItem>(input) }
}

// ───────────────────────── Store ─────────────────────────

export interface Actions {
  /** Add a fully-formed record to a collection. */
  insert<K extends CollectionKey>(key: K, item: ItemOf<K>): ItemOf<K>
  /** Shallow-merge a patch into a record (bumps updatedAt when the record has one). */
  patch<K extends CollectionKey>(key: K, id: ID, patch: Partial<ItemOf<K>>): void
  /** Remove a record; returns it so callers can offer undo. */
  remove<K extends CollectionKey>(key: K, id: ID): ItemOf<K> | undefined
  updateSettings(patch: Partial<Settings>): void

  toggleTask(id: ID): void
  /** Hide one occurrence of a recurring event. */
  skipOccurrence(eventId: ID, date: ISODate): void
  /** Create or update the journal entry for a date. */
  upsertJournal(date: ISODate, patch: Partial<JournalEntry>): JournalEntry
  /** Set (or clear with null/0) the monthly budget of an expense category. */
  setBudget(categoryId: ID, amount: number | null): void
  addContribution(goalId: ID, c: Omit<Contribution, 'id'>): void
  removeContribution(goalId: ID, contributionId: ID): void
  /** Log an expense for a planned payment and roll it to the next due date. */
  markPaymentPaid(id: ID, opts?: { date?: ISODate; amount?: number }): Transaction | undefined
  /** Record income for an invoice/freelance job/commission and mark it paid. */
  markInvoicePaid(id: ID, opts?: { date?: ISODate }): Transaction | undefined
  /** Undo a payment: removes the income transaction and sets the invoice back to sent. */
  unmarkInvoicePaid(id: ID): void
  /** Set how much of a habit was done on a date (0 clears). */
  logHabit(id: ID, date: ISODate, amount: number): void
  /** Replace all data (import / restore / demo). */
  replaceAll(data: AppData): void
}

export type State = AppData & Actions

export const useStore = create<State>()((set, get) => ({
  ...emptyData(),

  insert(key, item) {
    set((s) => ({ [key]: [...(s[key] as unknown[]), item] }) as Partial<State>)
    return item
  },

  patch(key, id, p) {
    set((s) => ({
      [key]: (s[key] as { id: ID }[]).map((it) =>
        it.id === id ? { ...it, ...p, ...('updatedAt' in it ? { updatedAt: Date.now() } : {}) } : it,
      ),
    }) as Partial<State>)
  },

  remove(key, id) {
    const list = get()[key] as { id: ID }[]
    const found = list.find((it) => it.id === id)
    if (found) set({ [key]: list.filter((it) => it.id !== id) } as Partial<State>)
    return found as ItemOf<typeof key> | undefined
  },

  updateSettings(p) {
    set((s) => ({ settings: { ...s.settings, ...p } }))
  },

  toggleTask(id) {
    const t = get().tasks.find((x) => x.id === id)
    if (!t) return
    const done = t.status !== 'done'
    let spawnedId: ID | undefined = t.spawnedId
    if (done && t.repeat && t.dueDate && !t.spawnedId) {
      // Repeating task: schedule the next occurrence with a fresh checklist.
      const next = makeTask({
        ...t,
        id: undefined,
        createdAt: undefined,
        status: 'todo',
        completedAt: undefined,
        spawnedId: undefined,
        dueDate: nextRepeatDate(t.dueDate, t.repeat),
        subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
      })
      get().insert('tasks', next)
      spawnedId = next.id
    } else if (!done && t.spawnedId) {
      // Un-completing: drop the next occurrence if it hasn't been touched.
      const next = get().tasks.find((x) => x.id === t.spawnedId)
      if (next && next.status === 'todo' && next.updatedAt === next.createdAt) get().remove('tasks', next.id)
      spawnedId = undefined
    }
    get().patch('tasks', id, {
      status: done ? 'done' : 'todo',
      completedAt: done ? Date.now() : undefined,
      spawnedId,
    })
  },

  skipOccurrence(eventId, date) {
    const ev = get().events.find((e) => e.id === eventId)
    if (!ev) return
    get().patch('events', eventId, { exdates: [...new Set([...ev.exdates, date])] })
  },

  upsertJournal(date, p) {
    const existing = get().journal.find((j) => j.date === date)
    if (existing) {
      get().patch('journal', existing.id, p)
      return { ...existing, ...p }
    }
    return get().insert('journal', makeJournal(date, p))
  },

  setBudget(categoryId, amount) {
    set((s) => {
      const budgets = { ...s.budgets }
      if (!amount || amount <= 0) delete budgets[categoryId]
      else budgets[categoryId] = amount
      return { budgets }
    })
  },

  addContribution(goalId, c) {
    const g = get().goals.find((x) => x.id === goalId)
    if (!g) return
    get().patch('goals', goalId, { contributions: [...g.contributions, { ...c, id: uid() }] })
  },

  removeContribution(goalId, contributionId) {
    const g = get().goals.find((x) => x.id === goalId)
    if (!g) return
    get().patch('goals', goalId, {
      contributions: g.contributions.filter((c) => c.id !== contributionId),
    })
  },

  markPaymentPaid(id, opts = {}) {
    const p = get().plannedPayments.find((x) => x.id === id)
    if (!p) return
    const tx = makeTransaction({
      type: 'expense',
      amount: opts.amount ?? p.amount,
      categoryId: p.categoryId,
      date: opts.date ?? todayISO(),
      paymentMethodId: p.paymentMethodId,
      payee: p.name,
      note: p.isSubscription ? 'Subscription' : 'Planned payment',
      plannedPaymentId: p.id,
      scope: p.categoryId === 'fc-business-expense' ? 'business' : 'personal',
    })
    get().insert('transactions', tx)
    const next: Partial<PlannedPayment> =
      p.recurrence === 'none'
        ? { active: false, lastPaid: tx.date }
        : { nextDue: advanceDue(p.nextDue, p.recurrence), lastPaid: tx.date }
    get().patch('plannedPayments', id, next)
    return tx
  },

  markInvoicePaid(id, opts = {}) {
    const inv = get().invoices.find((x) => x.id === id)
    if (!inv || inv.status === 'paid') return
    const client = get().clients.find((c) => c.id === inv.clientId)
    const tx = makeTransaction({
      type: 'income',
      amount: inv.amount,
      categoryId: INVOICE_KIND_CATEGORY[inv.kind],
      date: opts.date ?? todayISO(),
      payee: client?.name ?? inv.title,
      note: `${inv.number} · ${inv.title}`,
      scope: 'business',
      projectId: inv.projectId,
      paymentMethodId: 'pm-bank',
    })
    get().insert('transactions', tx)
    get().patch('invoices', id, { status: 'paid', paidDate: tx.date, transactionId: tx.id })
    return tx
  },

  unmarkInvoicePaid(id) {
    const inv = get().invoices.find((x) => x.id === id)
    if (!inv) return
    if (inv.transactionId) get().remove('transactions', inv.transactionId)
    get().patch('invoices', id, { status: 'sent', paidDate: undefined, transactionId: undefined })
  },

  logHabit(id, date, amount) {
    const h = get().habits.find((x) => x.id === id)
    if (!h) return
    const log = { ...h.log }
    if (amount > 0) log[date] = amount
    else delete log[date]
    get().patch('habits', id, { log })
  },

  replaceAll(data) {
    set({ ...data })
  },
}))

/** Snapshot of just the persisted data (no actions). */
export function getData(): AppData {
  const s = useStore.getState()
  const out = {} as Record<string, unknown>
  for (const k of DATA_KEYS) out[k] = s[k]
  return out as unknown as AppData
}

/** Look up helpers for render code. */
export function byId<T extends { id: ID }>(list: T[], id: ID | undefined): T | undefined {
  return id ? list.find((x) => x.id === id) : undefined
}
