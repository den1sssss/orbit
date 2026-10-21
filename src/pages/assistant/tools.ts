// Tools the assistant can call. Calls only ever become *proposals*: the user must tap Apply.
import { isValidISO, minutesToTime, occursOn, relativeDay, timeToMinutes } from '@/lib/dates'
import { makeEvent, makeTask, useStore } from '@/lib/store'
import type { CalendarEvent, Priority } from '@/lib/types'
import type { ToolDef } from './api'

export const TOOLS: ToolDef[] = [
  {
    name: 'add_task',
    description:
      'Propose adding a task to the user\'s Orbit task list. The user sees a confirmation card and must tap Apply; nothing is saved until they do. Use exact dates based on the "Now" line in the data snapshot.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, specific task title.' },
        due_date: { type: 'string', description: 'Due date, YYYY-MM-DD.' },
        due_time: { type: 'string', description: 'Optional due time, 24h HH:mm.' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Defaults to medium.' },
      },
      required: ['title', 'due_date'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_event',
    description:
      'Propose adding a time block or event to the user\'s Orbit calendar (for example a focus block from a day plan). The user sees a confirmation card and must tap Apply; nothing is saved until they do. It must not overlap existing events.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short event title, e.g. "Deep work: proposal".' },
        date: { type: 'string', description: 'Date, YYYY-MM-DD.' },
        start_time: { type: 'string', description: 'Start, 24h HH:mm.' },
        end_time: { type: 'string', description: 'End, 24h HH:mm, later than start_time on the same day.' },
      },
      required: ['title', 'date', 'start_time', 'end_time'],
      additionalProperties: false,
    },
  },
]

export type ProposalStatus = 'pending' | 'applied' | 'dismissed'

export type Proposal =
  | {
      kind: 'task'
      /** tool_use id */
      id: string
      title: string
      date: string
      time?: string
      priority?: Priority
      status: ProposalStatus
    }
  | {
      kind: 'event'
      id: string
      title: string
      date: string
      start: string
      end: string
      status: ProposalStatus
    }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

function str(v: unknown, max = 120): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
}

/** Strictly validate a tool call. Returns a proposal or an error message for the model. */
export function parseToolCall(id: string, name: string, rawJson: string): Proposal | { error: string } {
  let input: Record<string, unknown>
  try {
    const parsed: unknown = rawJson.trim() ? JSON.parse(rawJson) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'Input must be a JSON object.' }
    input = parsed as Record<string, unknown>
  } catch {
    return { error: `INVALID_JSON: ${rawJson.slice(0, 300)}` }
  }
  const allowed = name === 'add_task' ? ['title', 'due_date', 'due_time', 'priority'] : ['title', 'date', 'start_time', 'end_time']
  const extra = Object.keys(input).filter((k) => !allowed.includes(k))
  if (extra.length) return { error: `Unknown field(s): ${extra.join(', ')}.` }
  const title = str(input.title)
  if (!title) return { error: 'title is required.' }

  if (name === 'add_task') {
    const date = str(input.due_date, 10)
    if (!isValidISO(date)) return { error: 'due_date must be a valid YYYY-MM-DD date.' }
    const time = input.due_time === undefined || input.due_time === null || input.due_time === '' ? undefined : str(input.due_time, 5)
    if (time !== undefined && !TIME_RE.test(time)) return { error: 'due_time must be HH:mm (24h).' }
    const priority = input.priority === undefined ? undefined : (input.priority as Priority)
    if (priority !== undefined && !PRIORITIES.includes(priority)) return { error: 'priority must be low, medium, high or urgent.' }
    return { kind: 'task', id, title, date, time, priority, status: 'pending' }
  }
  if (name === 'add_event') {
    const date = str(input.date, 10)
    if (!isValidISO(date)) return { error: 'date must be a valid YYYY-MM-DD date.' }
    const start = str(input.start_time, 5)
    const end = str(input.end_time, 5)
    if (!start || !TIME_RE.test(start) || !end || !TIME_RE.test(end)) return { error: 'start_time and end_time must be HH:mm (24h).' }
    if (timeToMinutes(end) <= timeToMinutes(start)) return { error: 'end_time must be later than start_time on the same day.' }
    return { kind: 'event', id, title, date, start, end, status: 'pending' }
  }
  return { error: `Unknown tool ${name}.` }
}

/** Tool result text sent back right away: the card is shown, the decision is the user's. */
export function proposalResult(p: Proposal): string {
  return `Shown to the user as a suggestion card (${p.kind} "${p.title}") with Apply / Dismiss buttons. It is NOT saved unless they tap Apply.`
}

/** "today", "tomorrow" or "Thu, Oct 23" — lower-cased relative words for inline use. */
function when(date: string): string {
  const r = relativeDay(date)
  return r === 'Today' || r === 'Tomorrow' ? r.toLowerCase() : r
}

/** The confirmation question, e.g. `Add "Deep work: proposal" 10:00–11:30 today?` */
export function proposalQuestion(p: Proposal): string {
  if (p.kind === 'event') return `Add “${p.title}” ${p.start}–${p.end} ${when(p.date)}?`
  const time = p.time ? ` at ${p.time}` : ''
  return `Add task “${p.title}” due ${when(p.date)}${time}?`
}

/** Readable summary for the conversation history sent to the model. */
export function proposalSummary(p: Proposal): string {
  const what = p.kind === 'event'
    ? `event "${p.title}" ${p.date} ${p.start}–${p.end}`
    : `task "${p.title}" due ${p.date}${p.time ? ` ${p.time}` : ''}${p.priority ? ` (${p.priority})` : ''}`
  const outcome = p.status === 'applied' ? 'the user added it' : p.status === 'dismissed' ? 'the user dismissed it' : 'not decided yet'
  return `${what}: ${outcome}`
}

/** Existing timed events that overlap a proposed event (titles + spans). */
export function eventConflicts(p: Proposal, events: CalendarEvent[]): string[] {
  if (p.kind !== 'event') return []
  const s = timeToMinutes(p.start)
  const e = timeToMinutes(p.end)
  const out: string[] = []
  for (const ev of events) {
    if (ev.allDay || !ev.startTime || !occursOn(ev, p.date)) continue
    const es = timeToMinutes(ev.startTime)
    const ee = ev.endTime ? timeToMinutes(ev.endTime) : es + 60
    if (es < e && ee > s) out.push(`${ev.title} (${ev.startTime}–${ev.endTime ?? minutesToTime(ee)})`)
  }
  return out
}

/** Create the record. Returns a short label for the toast. */
export function applyProposal(p: Proposal): { message: string; route: string } {
  const { insert } = useStore.getState()
  if (p.kind === 'task') {
    insert('tasks', makeTask({ title: p.title, dueDate: p.date, dueTime: p.time, priority: p.priority ?? 'medium' }))
    return { message: 'Task added', route: '/tasks' }
  }
  insert('events', makeEvent({ title: p.title, date: p.date, startTime: p.start, endTime: p.end, type: 'event' }))
  return { message: 'Added to calendar', route: '/calendar' }
}
