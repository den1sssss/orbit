// Joins events, tasks, planned payments and journal entries by date —
// the glue that lets the calendar and dashboard show everything together.
import { eachDay, occurrencesBetween, timeToMinutes } from './dates'
import { paymentsInRange, type DueItem } from './finance'
import { PRIORITY_ORDER } from './defaults'
import type { CalendarEvent, ISODate, JournalEntry, PlannedPayment, Task } from './types'

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
