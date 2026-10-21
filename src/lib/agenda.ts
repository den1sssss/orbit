// Joins events, tasks, planned payments and journal entries by date —
// the glue that lets the calendar and dashboard show everything together.
import { eachDay, occurrencesBetween, timeToMinutes } from './dates'
import { paymentsInRange, type DueItem } from './finance'
import { PRIORITY_ORDER } from './defaults'
import type { CalendarEvent, Client, ColorKey, ImportantDate, ImportantDateKind, Invoice, ISODate, JournalEntry, PlannedPayment, Task } from './types'

export interface EventOccurrence {
  event: CalendarEvent
  date: ISODate
  /** Stable key for React lists. */
  key: string
}

export interface DayAgenda {
  date: ISODate
  events: EventOccurrence[]
  tasks: Task[]
  payments: DueItem[]
  journal?: JournalEntry
}

export interface AgendaSource {
  events: CalendarEvent[]
  tasks: Task[]
  plannedPayments: PlannedPayment[]
  journal: JournalEntry[]
}

export function sortOccurrences(list: EventOccurrence[]): EventOccurrence[] {
  return list.sort((a, b) => {
    if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1
    return timeToMinutes(a.event.startTime) - timeToMinutes(b.event.startTime)
  })
}

export function sortTasks(list: Task[]): Task[] {
  return list.sort((a, b) => {
    const doneA = a.status === 'done' ? 1 : 0
    const doneB = b.status === 'done' ? 1 : 0
    if (doneA !== doneB) return doneA - doneB
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (p) return p
    return (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99')
  })
}

/** Agenda for every date in [start, end]. */
export function agendaRange(src: AgendaSource, start: ISODate, end: ISODate): Map<ISODate, DayAgenda> {
  const map = new Map<ISODate, DayAgenda>()
  for (const d of eachDay(start, end)) map.set(d, { date: d, events: [], tasks: [], payments: [] })

  for (const ev of src.events) {
    for (const d of occurrencesBetween(ev, start, end)) {
      map.get(d)?.events.push({ event: ev, date: d, key: `${ev.id}:${d}` })
    }
  }
  for (const t of src.tasks) {
    if (t.dueDate && t.dueDate >= start && t.dueDate <= end) map.get(t.dueDate)?.tasks.push(t)
  }
  for (const due of paymentsInRange(src.plannedPayments, start, end)) {
    map.get(due.date)?.payments.push(due)
  }
  for (const j of src.journal) {
    const day = map.get(j.date)
    if (day) day.journal = j
  }
  for (const day of map.values()) {
    sortOccurrences(day.events)
    sortTasks(day.tasks)
  }
  return map
}

export function dayAgenda(src: AgendaSource, date: ISODate): DayAgenda {
  return agendaRange(src, date, date).get(date)!
}

/** Open tasks whose due date is before `today`. */
export function overdueTasks(tasks: Task[], today: ISODate): Task[] {
  return sortTasks(tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today))
}

// ───────────────────────── Read-only calendar items from other modules ─────────────────────────

const DATE_KIND_STYLE: Record<ImportantDateKind, { emoji: string; color: ColorKey }> = {
  birthday: { emoji: '🎂', color: 'pink' },
  anniversary: { emoji: '💞', color: 'red' },
  renewal: { emoji: '🔁', color: 'amber' },
  expiry: { emoji: '⏳', color: 'orange' },
  holiday: { emoji: '🌴', color: 'green' },
  other: { emoji: '📌', color: 'slate' },
}

/** Prefix of ids for items that live elsewhere (important dates, invoices). */
export const VIRTUAL_EVENT = { date: 'date:', invoice: 'inv:' } as const

export function isVirtualEvent(id: string): boolean {
  return id.startsWith(VIRTUAL_EVENT.date) || id.startsWith(VIRTUAL_EVENT.invoice)
}

/**
 * Important dates (yearly or one-off) and invoice due dates as all-day calendar items,
 * so the calendar shows everything that matters on a day. They open their own screens.
 */
export function extraCalendarEvents(dates: ImportantDate[], invoices: Invoice[], clients: Client[]): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const d of dates) {
    const style = DATE_KIND_STYLE[d.kind]
    out.push({
      id: VIRTUAL_EVENT.date + d.id,
      title: `${style.emoji} ${d.title}`,
      type: 'reminder',
      date: d.date,
      allDay: true,
      color: style.color,
      recurrence: d.yearly ? { freq: 'yearly', interval: 1 } : { freq: 'none', interval: 1 },
      exdates: [],
      notes: d.notes,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })
  }
  for (const inv of invoices) {
    if (inv.status !== 'sent' || !inv.dueDate) continue
    const client = clients.find((c) => c.id === inv.clientId)
    out.push({
      id: VIRTUAL_EVENT.invoice + inv.id,
      title: `💸 ${inv.number} due — ${client?.name ?? inv.title}`,
      type: 'deadline',
      date: inv.dueDate,
      allDay: true,
      color: 'indigo',
      recurrence: { freq: 'none', interval: 1 },
      exdates: [],
      projectId: inv.projectId,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    })
  }
  return out
}
