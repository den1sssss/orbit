import type {
  AppData, ColorKey, DashboardWidget, EventType, FinanceCategory, GoalHorizon, LifeArea, NoteCategory,
  PaymentMethod, Priority, Settings, TaskCategory, TaskStatus, WidgetId,
} from './types'

export const DEFAULT_WIDGETS: DashboardWidget[] = (
  ['briefing', 'quick', 'today', 'tasks', 'habits', 'money', 'budget', 'payments', 'business', 'dates', 'goals', 'journal'] as WidgetId[]
).map((id) => ({ id, visible: true }))

export const WIDGET_LABELS: Record<WidgetId, string> = {
  briefing: 'Daily briefing',
  quick: 'Quick add',
  today: "Today's schedule",
  tasks: 'Tasks',
  money: 'This month’s money',
  budget: 'Budget status',
  payments: 'Upcoming payments',
  goals: 'Savings goals',
  journal: 'Journal',
  habits: 'Habits today',
  dates: 'Important dates',
  business: 'Business',
}

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  currency: 'USD',
  weekStartsOn: 1,
  theme: 'system',
  widgets: DEFAULT_WIDGETS,
  monthlySavingsTarget: 0,
  autoLockMinutes: 5,
  onboarded: false,
  assistant: { enabled: false, model: 'claude-opus-5-5' },
}

export const DEFAULT_TASK_CATEGORIES: TaskCategory[] = [
  { id: 'tc-work', name: 'Work', color: 'blue' },
  { id: 'tc-business', name: 'Business', color: 'violet' },
  { id: 'tc-personal', name: 'Personal', color: 'green' },
  { id: 'tc-home', name: 'Home & errands', color: 'amber' },
  { id: 'tc-health', name: 'Health', color: 'pink' },
  { id: 'tc-learning', name: 'Learning', color: 'teal' },
]

export const DEFAULT_FINANCE_CATEGORIES: FinanceCategory[] = [
  // Income
  { id: 'fc-salary', name: 'Salary & employment', type: 'income', color: 'green', icon: 'briefcase' },
  { id: 'fc-business-income', name: 'Business income', type: 'income', color: 'violet', icon: 'trending' },
  { id: 'fc-freelance', name: 'Freelance', type: 'income', color: 'blue', icon: 'laptop' },
  { id: 'fc-commission', name: 'Commissions', type: 'income', color: 'teal', icon: 'percent' },
  { id: 'fc-other-income', name: 'Other income', type: 'income', color: 'slate', icon: 'coins' },
  // Expenses
  { id: 'fc-daily', name: 'Daily expenses', type: 'expense', color: 'orange', icon: 'coffee' },
  { id: 'fc-food', name: 'Food & groceries', type: 'expense', color: 'green', icon: 'cart' },
  { id: 'fc-transport', name: 'Transportation', type: 'expense', color: 'blue', icon: 'bus' },
  { id: 'fc-bills', name: 'Bills & utilities', type: 'expense', color: 'amber', icon: 'receipt' },
  { id: 'fc-subscriptions', name: 'Subscriptions', type: 'expense', color: 'violet', icon: 'repeat' },
  { id: 'fc-business-expense', name: 'Business expenses', type: 'expense', color: 'indigo', icon: 'briefcase' },
  { id: 'fc-housing', name: 'Housing', type: 'expense', color: 'teal', icon: 'home' },
  { id: 'fc-personal', name: 'Personal & shopping', type: 'expense', color: 'pink', icon: 'bag' },
  { id: 'fc-health', name: 'Health', type: 'expense', color: 'red', icon: 'health' },
  { id: 'fc-fun', name: 'Entertainment', type: 'expense', color: 'orange', icon: 'film' },
  { id: 'fc-other-expense', name: 'Other expenses', type: 'expense', color: 'slate', icon: 'package' },
]

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'pm-cash', name: 'Cash' },
  { id: 'pm-debit', name: 'Debit card' },
  { id: 'pm-credit', name: 'Credit card' },
  { id: 'pm-bank', name: 'Bank transfer' },
  { id: 'pm-mobile', name: 'Mobile wallet' },
]

export function emptyData(): AppData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })) },
    tasks: [],
    taskCategories: DEFAULT_TASK_CATEGORIES.map((c) => ({ ...c })),
    projects: [],
    notes: [],
    events: [],
    journal: [],
    transactions: [],
    financeCategories: DEFAULT_FINANCE_CATEGORIES.map((c) => ({ ...c })),
    paymentMethods: DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m })),
    budgets: {},
    goals: [],
    plannedPayments: [],
    clients: [],
    invoices: [],
    habits: [],
    lifeGoals: [],
    reviews: [],
    lists: [],
    importantDates: [],
    vault: [],
    assistantChat: [],
  }
}

/** Fill in anything missing from older/partial data (imports, upgrades). */
export function normalizeData(input: Partial<AppData>): AppData {
  const base = emptyData()
  const settings = { ...base.settings, ...(input.settings ?? {}) }
  settings.assistant = { ...base.settings.assistant, ...(input.settings?.assistant ?? {}) }
  // Make sure every widget id exists exactly once.
  const known = new Set(settings.widgets.map((w) => w.id))
  for (const w of base.settings.widgets) if (!known.has(w.id)) settings.widgets.push({ ...w })
  settings.widgets = settings.widgets.filter((w) => w.id in WIDGET_LABELS)
  return {
    ...base,
    ...input,
    version: 1,
    settings,
    budgets: input.budgets ?? {},
  } as AppData
}

// ───────────────────────── Labels ─────────────────────────

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}
export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  waiting: 'Waiting',
  done: 'Done',
}

export const NOTE_CATEGORY_LABELS: Record<NoteCategory, string> = {
  work: 'Work',
  business: 'Business',
  personal: 'Personal',
  ideas: 'Ideas',
  daily: 'Daily',
  important: 'Important info',
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  meeting: 'Meeting',
  appointment: 'Appointment',
  event: 'Event',
  personal: 'Personal',
  deadline: 'Deadline',
  reminder: 'Reminder',
}

export const EVENT_TYPE_COLORS: Record<EventType, import('./types').ColorKey> = {
  meeting: 'blue',
  appointment: 'teal',
  event: 'indigo',
  personal: 'green',
  deadline: 'red',
  reminder: 'amber',
}

export const MOOD_LABELS = ['', 'Awful', 'Low', 'Okay', 'Good', 'Great'] as const
export const MOOD_EMOJI = ['', '😞', '😕', '😐', '🙂', '😄'] as const

export const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'At time' },
  { value: 5, label: '5 min before' },
  { value: 15, label: '15 min before' },
  { value: 30, label: '30 min before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 10080, label: '1 week before' },
]

export const LIFE_AREAS: LifeArea[] = ['health', 'career', 'finance', 'relationships', 'learning', 'personal', 'business', 'fun']

export const LIFE_AREA_LABELS: Record<LifeArea, string> = {
  health: 'Health & fitness',
  career: 'Career & work',
  finance: 'Money',
  relationships: 'Relationships',
  learning: 'Learning',
  personal: 'Personal growth',
  business: 'Business',
  fun: 'Fun & rest',
}

export const LIFE_AREA_COLORS: Record<LifeArea, ColorKey> = {
  health: 'green',
  career: 'blue',
  finance: 'teal',
  relationships: 'pink',
  learning: 'violet',
  personal: 'indigo',
  business: 'orange',
  fun: 'amber',
}

export const GOAL_HORIZON_LABELS: Record<GoalHorizon, string> = {
  weekly: 'This week',
  monthly: 'This month',
  quarterly: 'This quarter',
  yearly: 'This year',
  'long-term': 'Long-term',
}
