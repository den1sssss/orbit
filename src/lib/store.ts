import { create } from 'zustand'
import { emptyData } from './defaults'
import { advanceDue, todayISO } from './dates'
import type {
  AppData, CalendarEvent, CollectionKey, Contribution, ID, ISODate, ItemOf, JournalEntry, Note,
  PlannedPayment, Settings, Task, Transaction,
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
    get().patch('tasks', id, {
      status: done ? 'done' : 'todo',
      completedAt: done ? Date.now() : undefined,
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
