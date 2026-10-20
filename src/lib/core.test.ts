import { beforeEach, describe, expect, it } from 'vitest'
import { advanceDue, occurrencesBetween, occursOn, paymentDueDates, addDaysISO, todayISO } from './dates'
import { budgetRows, goalProgress, monthTotals, upcomingPayments } from './finance'
import { parseAmount } from './format'
import { deriveKey, open, seal } from './crypto'
import { emptyData } from './defaults'
import { buildDemoData } from './demo'
import { buildBriefing } from './insights'
import { makeEvent, makeTask, makeTransaction, useStore } from './store'
import type { PlannedPayment } from './types'

describe('recurrence', () => {
  it('weekly on chosen weekdays, every 2 weeks, with exdates and until', () => {
    // 2026-10-06 is a Tuesday.
    const ev = makeEvent({
      title: 'Gym', date: '2026-10-06',
      recurrence: { freq: 'weekly', interval: 2, weekdays: [2, 4], until: '2026-11-05' },
      exdates: ['2026-10-22'],
    })
    expect(occurrencesBetween(ev, '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-06', '2026-10-08', '2026-10-20', '2026-11-03', '2026-11-05',
    ])
  })

  it('monthly on the 31st falls back to the last day of shorter months', () => {
    const ev = makeEvent({ title: 'Review', date: '2026-01-31', recurrence: { freq: 'monthly', interval: 1 } })
    expect(occursOn(ev, '2026-02-28')).toBe(true)
    expect(occursOn(ev, '2026-04-30')).toBe(true)
    expect(occursOn(ev, '2026-04-29')).toBe(false)
  })

  it('yearly birthdays and never before the start date', () => {
    const ev = makeEvent({ title: 'Birthday', date: '2026-11-01', allDay: true, recurrence: { freq: 'yearly', interval: 1 } })
    expect(occursOn(ev, '2027-11-01')).toBe(true)
    expect(occursOn(ev, '2025-11-01')).toBe(false)
  })
})

describe('planned payments', () => {
  it('rolls due dates forward', () => {
    expect(advanceDue('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advanceDue('2026-10-20', 'quarterly')).toBe('2027-01-20')
    expect(paymentDueDates('2026-10-05', 'weekly', '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26',
    ])
  })

  it('flags overdue payments', () => {
    const p: PlannedPayment = {
      id: 'p', name: 'Gym', amount: 39, categoryId: 'fc-health', nextDue: addDaysISO(todayISO(), -2),
      recurrence: 'monthly', isSubscription: true, active: true, createdAt: 0,
    }
    const dues = upcomingPayments([p], 40)
    expect(dues[0]).toMatchObject({ overdue: true, daysUntil: -2 })
    expect(dues.filter((d) => !d.overdue)).toHaveLength(1) // next month's occurrence
  })
})

describe('money math', () => {
  const txs = [
    makeTransaction({ type: 'income', amount: 3000, categoryId: 'fc-salary', date: '2026-10-01' }),
    makeTransaction({ type: 'expense', amount: 120.5, categoryId: 'fc-food', date: '2026-10-03' }),
    makeTransaction({ type: 'expense', amount: 80, categoryId: 'fc-food', date: '2026-10-09', scope: 'business' }),
    makeTransaction({ type: 'expense', amount: 999, categoryId: 'fc-food', date: '2026-09-30' }),
  ]

  it('totals a month and a scope', () => {
    expect(monthTotals(txs, '2026-10')).toMatchObject({ income: 3000, expense: 200.5, net: 2799.5, count: 3 })
    expect(monthTotals(txs, '2026-10', 'business')).toMatchObject({ income: 0, expense: 80 })
  })

  it('compares budget with actual spending', () => {
    const rows = budgetRows({ 'fc-food': 150 }, emptyData().financeCategories, txs, '2026-10')
    expect(rows[0]).toMatchObject({ budget: 150, spent: 200.5, remaining: -50.5 })
    expect(rows[0].ratio).toBeCloseTo(1.3367, 3)
  })

  it('tracks goal progress and the monthly amount needed', () => {
    const g = goalProgress(
      { id: 'g', name: 'Trip', target: 4000, color: 'pink', createdAt: 0, targetDate: '2027-04-20',
        contributions: [{ id: 'c1', date: '2026-09-01', amount: 1200 }, { id: 'c2', date: '2026-10-01', amount: -200 }] },
      '2026-10-20',
    )
    expect(g.saved).toBe(1000)
    expect(g.remaining).toBe(3000)
    expect(g.monthlyNeeded).toBeGreaterThan(480)
    expect(g.monthlyNeeded).toBeLessThan(520)
  })

  it('parses amounts typed in different locales', () => {
    expect(parseAmount('1,234.50')).toBe(1234.5)
    expect(parseAmount('12,5')).toBe(12.5)
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('$ 42')).toBe(42)
    expect(parseAmount('')).toBeNaN()
  })
})

describe('store actions', () => {
  beforeEach(() => useStore.getState().replaceAll(emptyData()))

  it('marking a planned payment paid logs an expense and advances the due date', () => {
    const s = useStore.getState()
    s.insert('plannedPayments', {
      id: 'rent', name: 'Rent', amount: 1350, categoryId: 'fc-housing', nextDue: '2026-11-01',
      recurrence: 'monthly', isSubscription: false, active: true, createdAt: 0,
    })
    const tx = useStore.getState().markPaymentPaid('rent', { date: '2026-10-31' })
    const after = useStore.getState()
    expect(tx).toMatchObject({ type: 'expense', amount: 1350, categoryId: 'fc-housing', plannedPaymentId: 'rent' })
    expect(after.transactions).toHaveLength(1)
    expect(after.plannedPayments[0]).toMatchObject({ nextDue: '2026-12-01', lastPaid: '2026-10-31', active: true })
  })

  it('keeps one journal entry per day', () => {
    const s = useStore.getState()
    s.upsertJournal('2026-10-20', { mood: 4 })
    s.upsertJournal('2026-10-20', { body: 'Good day' })
    const j = useStore.getState().journal
    expect(j).toHaveLength(1)
    expect(j[0]).toMatchObject({ mood: 4, body: 'Good day' })
  })

  it('toggles tasks done and back', () => {
    const t = useStore.getState().insert('tasks', makeTask({ title: 'Ship it' }))
    useStore.getState().toggleTask(t.id)
    expect(useStore.getState().tasks[0]).toMatchObject({ status: 'done' })
    expect(useStore.getState().tasks[0].completedAt).toBeTypeOf('number')
    useStore.getState().toggleTask(t.id)
    expect(useStore.getState().tasks[0]).toMatchObject({ status: 'todo', completedAt: undefined })
  })
})

describe('encryption', () => {
  it('round-trips with the right passcode and fails with a wrong one', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey('correct horse', salt)
    const sealed = await seal(key, { secret: 'journal entry' })
    expect(sealed.ct).not.toContain('journal')
    await expect(open(key, sealed)).resolves.toEqual({ secret: 'journal entry' })
    const wrong = await deriveKey('wrong', salt)
    await expect(open(wrong, sealed)).rejects.toBeTruthy()
  })
})

describe('daily briefing', () => {
  it('surfaces overdue work first from the sample data', () => {
    const data = buildDemoData({ settings: { ...emptyData().settings, userName: 'Sam Lee' } })
    const b = buildBriefing(data, new Date())
    expect(b.greeting).toMatch(/, Sam$/)
    const ids = b.insights.map((i) => i.id)
    expect(ids).toContain('overdue')
    expect(ids).toContain('pay-overdue')
    expect(b.insights[0].tone).toBe('bad')
  })
})
