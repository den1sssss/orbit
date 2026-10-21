// Core data model for Orbit. Everything the app stores lives in `AppData`.

export type ID = string
/** Local calendar date, 'YYYY-MM-DD'. */
export type ISODate = string
/** Calendar month, 'YYYY-MM'. */
export type MonthKey = string
/** 24h clock time, 'HH:mm'. */
export type TimeStr = string

export type ColorKey =
  | 'slate' | 'red' | 'orange' | 'amber' | 'green'
  | 'teal' | 'blue' | 'indigo' | 'violet' | 'pink'

// ───────────────────────── Tasks & projects ─────────────────────────

export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done'

export interface Subtask {
  id: ID
  title: string
  done: boolean
}

export interface Task {
  id: ID
  title: string
  notes?: string
  status: TaskStatus
  priority: Priority
  /** TaskCategory id */
  categoryId: ID
  projectId?: ID
  dueDate?: ISODate
  dueTime?: TimeStr
  /** Minutes before the due date/time to remind. Only meaningful with dueDate. */
  reminder?: number
  subtasks: Subtask[]
  tags: string[]
  /** Repeating task: completing it schedules the next occurrence. Needs dueDate. */
  repeat?: TaskRepeat
  /** Id of the next occurrence created when this one was completed (for undo). */
  spawnedId?: ID
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface TaskRepeat {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  /** Every N days/weeks/months/years. >= 1 */
  interval: number
  /** For weekly: weekdays 0 (Sun) .. 6 (Sat). Defaults to the due date's weekday. */
  weekdays?: number[]
}

export interface TaskCategory {
  id: ID
  name: string
  color: ColorKey
}

export interface Project {
  id: ID
  name: string
  color: ColorKey
  /** Client record this project is for. */
  clientId?: ID
  /** Free-text client name (older data / quick entry). Prefer clientId. */
  client?: string
  description?: string
  status: 'active' | 'paused' | 'done'
  /** Agreed fee / expected revenue. */
  fee?: number
  deadline?: ISODate
  createdAt: number
}

// ───────────────────────── Business ─────────────────────────

export interface Client {
  id: ID
  name: string
  company?: string
  email?: string
  phone?: string
  notes?: string
  color: ColorKey
  archived?: boolean
  createdAt: number
  updatedAt: number
}

/** invoice → Business income, freelance → Freelance, commission → Commissions. */
export type InvoiceKind = 'invoice' | 'freelance' | 'commission'
/** "Overdue" is derived (sent + past due date), see lib/business.ts. */
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled'

/** Money you expect to receive: an invoice, a freelance job or a commission. */
export interface Invoice {
  id: ID
  /** Human reference, e.g. "INV-0007". */
  number: string
  title: string
  kind: InvoiceKind
  clientId?: ID
  projectId?: ID
  amount: number
  issueDate: ISODate
  dueDate?: ISODate
  status: InvoiceStatus
  paidDate?: ISODate
  /** Income transaction created when marked paid. */
  transactionId?: ID
  notes?: string
  createdAt: number
  updatedAt: number
}

// ───────────────────────── Goals & habits ─────────────────────────

export type LifeArea =
  | 'health' | 'career' | 'finance' | 'relationships' | 'learning' | 'personal' | 'business' | 'fun'

export type HabitSchedule =
  | { kind: 'daily' }
  /** Specific weekdays 0 (Sun) .. 6 (Sat). */
  | { kind: 'weekdays'; days: number[] }
  /** N times per week, any days. */
  | { kind: 'weekly'; times: number }

export interface Habit {
  id: ID
  name: string
  emoji?: string
  color: ColorKey
  area: LifeArea
  schedule: HabitSchedule
  /** Count per day that counts as done (1 = simple check-off, 8 = glasses of water…). */
  target: number
  unit?: string
  /** Amount done per date. Missing = 0. */
  log: Record<ISODate, number>
  /** Optional daily reminder time. */
  reminderTime?: TimeStr
  archived?: boolean
  order: number
  createdAt: number
  updatedAt: number
}

export type GoalHorizon = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'long-term'
export type GoalStatus = 'active' | 'done' | 'paused' | 'dropped'

/** Personal / development goal (savings goals live in `goals`). */
export interface LifeGoal {
  id: ID
  title: string
  /** Why it matters — shown as motivation. */
  why?: string
  horizon: GoalHorizon
  area: LifeArea
  status: GoalStatus
  targetDate?: ISODate
  /** How progress is measured. */
  measure: 'milestones' | 'number' | 'manual'
  milestones: Subtask[]
  /** For measure = 'number'. */
  current?: number
  target?: number
  unit?: string
  /** For measure = 'manual': 0..100. */
  progress?: number
  createdAt: number
  updatedAt: number
  completedAt?: number
}

/** Weekly / monthly review (reflection on achievements). */
export interface Review {
  id: ID
  period: 'week' | 'month'
  /** '2026-W43' (ISO week, see lib/dates weekKey) or '2026-10'. */
  key: string
  rating?: Mood
  wins: string
  challenges: string
  lessons: string
  focus: string
  createdAt: number
  updatedAt: number
}

// ───────────────────────── Life organizer ─────────────────────────

export interface ListItem {
  id: ID
  title: string
  done: boolean
  qty?: string
  note?: string
}

/** Shopping / packing / errands lists. */
export interface OrgList {
  id: ID
  name: string
  kind: 'shopping' | 'packing' | 'errands' | 'other'
  color: ColorKey
  items: ListItem[]
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export type ImportantDateKind = 'birthday' | 'anniversary' | 'renewal' | 'expiry' | 'holiday' | 'other'

export interface ImportantDate {
  id: ID
  title: string
  kind: ImportantDateKind
  /** First/actual date. For yearly dates the year may be the birth/start year. */
  date: ISODate
  yearly: boolean
  /** Remind this many days before (0 = on the day). */
  remindDays: number
  notes?: string
  createdAt: number
  updatedAt: number
}

export type VaultKind = 'id' | 'document' | 'account' | 'insurance' | 'medical' | 'vehicle' | 'home' | 'contact' | 'other'

export interface VaultField {
  id: ID
  label: string
  value: string
  /** Masked until revealed. */
  secret: boolean
}

/** Important documents & personal info. Encrypted at rest when a passcode is set. */
export interface VaultItem {
  id: ID
  title: string
  kind: VaultKind
  fields: VaultField[]
  expiresOn?: ISODate
  notes?: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

// ───────────────────────── Assistant ─────────────────────────

export interface AssistantMessage {
  id: ID
  role: 'user' | 'assistant'
  content: string
  at: number
}

export interface AssistantSettings {
  enabled: boolean
  /** User's own Anthropic API key. Never exported in backups. */
  apiKey?: string
  model: string
}

// ───────────────────────── Notes ─────────────────────────

export type NoteCategory = 'work' | 'business' | 'personal' | 'ideas' | 'daily' | 'important'

export interface Note {
  id: ID
  title: string
  body: string
  category: NoteCategory
  /** Optional checklist (to-do / shopping lists inside a note). */
  checklist: Subtask[]
  pinned: boolean
  archived: boolean
  tags: string[]
  /** Optionally attach the note to a calendar date. */
  date?: ISODate
  projectId?: ID
  createdAt: number
  updatedAt: number
}

// ───────────────────────── Calendar ─────────────────────────

export type EventType = 'meeting' | 'appointment' | 'event' | 'personal' | 'deadline' | 'reminder'
export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Recurrence {
  freq: RecurrenceFreq
  /** Every N days/weeks/months/years. >= 1 */
  interval: number
  /** Last date (inclusive) the series can occur on. */
  until?: ISODate
  /** For weekly: weekdays 0 (Sun) .. 6 (Sat). Defaults to the start date's weekday. */
  weekdays?: number[]
}

export interface CalendarEvent {
  id: ID
  title: string
  type: EventType
  /** First (or only) occurrence. */
  date: ISODate
  allDay: boolean
  startTime?: TimeStr
  endTime?: TimeStr
  location?: string
  notes?: string
  color?: ColorKey
  recurrence: Recurrence
  /** Occurrence dates removed from a recurring series. */
  exdates: ISODate[]
  /** Minutes before start to remind. */
  reminder?: number
  projectId?: ID
  createdAt: number
  updatedAt: number
}

// ───────────────────────── Journal ─────────────────────────

export type Mood = 1 | 2 | 3 | 4 | 5

export interface JournalEntry {
  id: ID
  /** One entry per day. */
  date: ISODate
  mood?: Mood
  energy?: Mood
  title?: string
  body: string
  gratitude: string[]
  wins: string
  lessons: string
  /** Intentions / focus for tomorrow. */
  tomorrow: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

// ───────────────────────── Money ─────────────────────────

export type TxType = 'income' | 'expense'
export type Scope = 'personal' | 'business'

export interface FinanceCategory {
  id: ID
  name: string
  type: TxType
  color: ColorKey
  /** Key into CATEGORY_ICONS (src/lib/icons.ts). */
  icon: string
  /** Archived categories are hidden from pickers but kept for history. */
  archived?: boolean
}

export interface PaymentMethod {
  id: ID
  name: string
}

export interface Transaction {
  id: ID
  type: TxType
  /** Always positive; `type` carries the sign. */
  amount: number
  date: ISODate
  categoryId: ID
  paymentMethodId?: ID
  /** Who paid / who was paid (store, client, employer…). */
  payee?: string
  note?: string
  scope: Scope
  projectId?: ID
  /** Set when created by marking a planned payment as paid. */
  plannedPaymentId?: ID
  createdAt: number
  updatedAt: number
}

export interface Contribution {
  id: ID
  date: ISODate
  /** Positive = saved, negative = withdrawn. */
  amount: number
  note?: string
}

export interface SavingsGoal {
  id: ID
  name: string
  target: number
  targetDate?: ISODate
  color: ColorKey
  contributions: Contribution[]
  archived?: boolean
  createdAt: number
}

export type PaymentRecurrence = 'none' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface PlannedPayment {
  id: ID
  name: string
  amount: number
  categoryId: ID
  /** Next unpaid due date. */
  nextDue: ISODate
  recurrence: PaymentRecurrence
  paymentMethodId?: ID
  isSubscription: boolean
  notes?: string
  /** false once a one-time payment is paid, or a subscription is cancelled. */
  active: boolean
  lastPaid?: ISODate
  createdAt: number
}

// ───────────────────────── Settings ─────────────────────────

export type WidgetId =
  | 'briefing' | 'today' | 'tasks' | 'money' | 'budget'
  | 'goals' | 'payments' | 'journal' | 'quick'
  | 'habits' | 'dates' | 'business'

export interface DashboardWidget {
  id: WidgetId
  visible: boolean
}

export interface Settings {
  userName: string
  /** ISO 4217 code, e.g. 'USD'. */
  currency: string
  weekStartsOn: 0 | 1
  theme: 'system' | 'light' | 'dark'
  widgets: DashboardWidget[]
  monthlySavingsTarget: number
  /** Minutes in background before the passcode lock re-engages (0 = only on reload). */
  autoLockMinutes: number
  onboarded: boolean
  lastExportAt?: number
  assistant: AssistantSettings
}

export interface AppData {
  version: 1
  settings: Settings
  tasks: Task[]
  taskCategories: TaskCategory[]
  projects: Project[]
  notes: Note[]
  events: CalendarEvent[]
  journal: JournalEntry[]
  transactions: Transaction[]
  financeCategories: FinanceCategory[]
  paymentMethods: PaymentMethod[]
  /** Monthly budget per expense category id. Applies to every month. */
  budgets: Record<ID, number>
  goals: SavingsGoal[]
  plannedPayments: PlannedPayment[]
  clients: Client[]
  invoices: Invoice[]
  habits: Habit[]
  lifeGoals: LifeGoal[]
  reviews: Review[]
  lists: OrgList[]
  importantDates: ImportantDate[]
  vault: VaultItem[]
  assistantChat: AssistantMessage[]
}

/** Keys of AppData that hold arrays of records with an `id`. */
export type CollectionKey =
  | 'tasks' | 'taskCategories' | 'projects' | 'notes' | 'events' | 'journal'
  | 'transactions' | 'financeCategories' | 'paymentMethods' | 'goals' | 'plannedPayments'
  | 'clients' | 'invoices' | 'habits' | 'lifeGoals' | 'reviews' | 'lists' | 'importantDates' | 'vault'
  | 'assistantChat'

export type ItemOf<K extends CollectionKey> = AppData[K] extends (infer U)[] ? U : never
