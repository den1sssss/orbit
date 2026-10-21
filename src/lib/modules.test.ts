import { beforeEach, describe, expect, it } from 'vitest'
import { extraCalendarEvents } from './agenda'
import { invoiceState, nextInvoiceNumber, receivables } from './business'
import { nextRepeatDate, occurrencesBetween, weekKey } from './dates'
import { emptyData } from './defaults'
import { buildDemoData } from './demo'
import { consistency, doneOn, isDueToday, streak } from './habits'
import { buildBriefing } from './insights'
import { nextOccurrence, upcomingDates, yearsLabel } from './lifeDates'
import { makeHabit, makeImportantDate, makeInvoice, makeTask, useStore } from './store'

describe('weeks & repeating tasks', () => {
  it('computes ISO week keys', () => {
    expect(weekKey('2026-10-20')).toBe('2026-W43')
    expect(weekKey('2026-01-01')).toBe('2026-W01')
    expect(weekKey('2021-01-03')).toBe('2020-W53')
  })

  it('finds the next due date', () => {
    expect(nextRepeatDate('2026-10-20', { freq: 'daily', interval: 2 })).toBe('2026-10-22')
    // Mon & Wed: from Monday → Wednesday, from Wednesday → next Monday.
    expect(nextRepeatDate('2026-10-19', { freq: 'weekly', interval: 1, weekdays: [1, 3] })).toBe('2026-10-21')
    expect(nextRepeatDate('2026-10-21', { freq: 'weekly', interval: 1, weekdays: [1, 3] })).toBe('2026-10-26')
    expect(nextRepeatDate('2026-10-21', { freq: 'weekly', interval: 2, weekdays: [1, 3] })).toBe('2026-11-02')
    expect(nextRepeatDate('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28')
  })
})

describe('store: repeating tasks, invoices, habits', () => {
  beforeEach(() => useStore.getState().replaceAll(emptyData()))

  it('completing a repeating task schedules the next one; undo removes it', () => {
    const t = useStore.getState().insert('tasks', makeTask({
      title: 'Weekly report', dueDate: '2026-10-23', repeat: { freq: 'weekly', interval: 1 },
      subtasks: [{ id: 's1', title: 'Collect numbers', done: true }],
    }))
    useStore.getState().toggleTask(t.id)
    let tasks = useStore.getState().tasks
    expect(tasks).toHaveLength(2)
    const next = tasks.find((x) => x.id !== t.id)!
    expect(next).toMatchObject({ dueDate: '2026-10-30', status: 'todo' })
    expect(next.subtasks[0].done).toBe(false)
    expect(tasks.find((x) => x.id === t.id)!.spawnedId).toBe(next.id)

    useStore.getState().toggleTask(t.id) // un-complete
    tasks = useStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ status: 'todo', spawnedId: undefined })
  })

  it('marking an invoice paid books business income, and can be undone', () => {
    const inv = useStore.getState().insert('invoices', makeInvoice({ number: 'INV-0009', title: 'Logo', kind: 'freelance', amount: 400, dueDate: '2026-10-01' }))
    expect(invoiceState(inv, '2026-10-20')).toBe('overdue')
    const tx = useStore.getState().markInvoicePaid(inv.id, { date: '2026-10-20' })
    expect(tx).toMatchObject({ type: 'income', amount: 400, categoryId: 'fc-freelance', scope: 'business' })
    expect(useStore.getState().invoices[0]).toMatchObject({ status: 'paid', paidDate: '2026-10-20', transactionId: tx!.id })
    useStore.getState().unmarkInvoicePaid(inv.id)
    expect(useStore.getState().transactions).toHaveLength(0)
    expect(useStore.getState().invoices[0]).toMatchObject({ status: 'sent', transactionId: undefined })
  })

  it('numbers invoices and totals receivables', () => {
    const invs = [
      makeInvoice({ number: 'INV-0007', title: 'a', amount: 100, status: 'sent', dueDate: '2026-10-01' }),
      makeInvoice({ number: 'INV-0012', title: 'b', amount: 50, status: 'sent', dueDate: '2026-11-01' }),
      makeInvoice({ number: 'INV-0002', title: 'c', amount: 999, status: 'paid' }),
    ]
    expect(nextInvoiceNumber(invs)).toBe('INV-0013')
    expect(receivables(invs, '2026-10-20')).toMatchObject({ pending: 150, overdue: 100, overdueCount: 1, pendingCount: 2 })
  })
})

describe('habits', () => {
  const created = new Date(2026, 8, 1).getTime() // Sep 1 2026

  it('keeps a daily streak while today is still open', () => {
    const h = makeHabit({ name: 'Walk', createdAt: created, log: { '2026-10-17': 1, '2026-10-18': 1, '2026-10-19': 1 } })
    expect(streak(h, 1, '2026-10-20')).toEqual({ count: 3, unit: 'day' })
    expect(streak({ ...h, log: { ...h.log, '2026-10-20': 1 } }, 1, '2026-10-20').count).toBe(4)
  })

  it('weekday habits skip weekends; counter habits need the full target', () => {
    // Fri 16, Mon 19 done; weekend not scheduled.
    const h = makeHabit({ name: 'Read', schedule: { kind: 'weekdays', days: [1, 2, 3, 4, 5] }, createdAt: created, log: { '2026-10-16': 1, '2026-10-19': 1 } })
    expect(streak(h, 1, '2026-10-20').count).toBe(2)
    const water = makeHabit({ name: 'Water', target: 8, createdAt: created, log: { '2026-10-20': 5 } })
    expect(doneOn(water, '2026-10-20')).toBe(false)
  })

  it('weekly-count habits stop nagging once the quota is met', () => {
    // Week of Mon Oct 19: done Mon + Tue → quota 2 met.
    const gym = makeHabit({ name: 'Gym', schedule: { kind: 'weekly', times: 2 }, createdAt: created, log: { '2026-10-19': 1, '2026-10-20': 1 } })
    expect(isDueToday(gym, '2026-10-21', 1)).toBe(false)
    expect(streak(gym, 1, '2026-10-21')).toEqual({ count: 1, unit: 'week' })
  })

  it('measures consistency only since the habit existed', () => {
    const h = makeHabit({ name: 'Walk', createdAt: new Date(2026, 9, 11).getTime(), log: { '2026-10-11': 1, '2026-10-12': 1, '2026-10-14': 1 } })
    const c = consistency(h, '2026-10-01', '2026-10-20')
    expect(c.due).toBe(10)
    expect(c.done).toBe(3)
  })
})

describe('important dates', () => {
  it('rolls yearly dates to the next occurrence and counts years', () => {
    const bday = makeImportantDate({ title: 'Mom', kind: 'birthday', date: '1968-03-05', yearly: true })
    expect(nextOccurrence(bday, '2026-10-20')).toBe('2027-03-05')
    const leap = makeImportantDate({ title: 'Leap', date: '2000-02-29', yearly: true })
    expect(nextOccurrence(leap, '2026-01-01')).toBe('2026-02-28')
    const soon = makeImportantDate({ title: 'Alex', kind: 'birthday', date: '1994-10-22', yearly: true })
    const [u] = upcomingDates([soon], 30, '2026-10-20')
    expect(u).toMatchObject({ date: '2026-10-22', daysUntil: 2, years: 32 })
    expect(yearsLabel(u)).toBe('Turns 32')
  })

  it('shows on the calendar as a yearly all-day item', () => {
    const d = makeImportantDate({ title: 'Mom', kind: 'birthday', date: '1968-11-01', yearly: true })
    const [ev] = extraCalendarEvents([d], [], [])
    expect(ev.allDay).toBe(true)
    expect(occurrencesBetween(ev, '2026-10-01', '2027-12-31')).toEqual(['2026-11-01', '2027-11-01'])
  })
})

describe('briefing with the new modules', () => {
  it('flags overdue invoices and upcoming birthdays from the sample data', () => {
    const data = buildDemoData({ settings: emptyData().settings })
    const ids = buildBriefing(data, new Date()).insights.map((i) => i.id)
    expect(ids).toContain('invoices-overdue')
    expect(ids).toContain('date-soon')
  })
})
