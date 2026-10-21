// Realistic sample data relative to today, so every screen can be explored.
import { addDaysISO, eachDay, fromISO, monthStart, shiftMonth, todayISO, toISO, weekKey } from './dates'
import { emptyData } from './defaults'
import {
  makeClient, makeEvent, makeHabit, makeImportantDate, makeInvoice, makeJournal, makeLifeGoal, makeList, makeNote,
  makeTask, makeTransaction, makeVaultItem, uid,
} from './store'
import type { AppData, Mood, PlannedPayment, Transaction } from './types'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `day` of `month` clamped to the month length. */
function onDay(month: string, day: number) {
  const first = fromISO(monthStart(month))
  const len = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return `${month}-${String(Math.min(day, len)).padStart(2, '0')}`
}

export function buildDemoData(keep: Pick<AppData, 'settings'>): AppData {
  const data = emptyData()
  const r = rng(7)
  const today = todayISO()
  const d = (n: number) => addDaysISO(today, n)
  const thisMonth = today.slice(0, 7)
  const between = (lo: number, hi: number) => Math.round((lo + r() * (hi - lo)) * 100) / 100
  const weekday = fromISO(today).getDay()

  data.settings = { ...keep.settings, onboarded: true, monthlySavingsTarget: 800 }

  // ── Projects
  const acmeClient = makeClient({ name: 'Acme Co.', company: 'Acme Co.', email: 'tom@acme.example', phone: '+1 555 0100', color: 'indigo', notes: 'Main contact: Tom (marketing).' })
  const lena = makeClient({ name: 'Lena Petrova', email: 'lena@example.com', color: 'orange', notes: 'Coaching — 4-session pack.' })
  const studio = makeClient({ name: 'Studio Nine', company: 'Studio Nine LLC', email: 'hello@studionine.example', color: 'teal' })
  data.clients = [acmeClient, lena, studio]
  const acme = { id: uid(), name: 'Acme website redesign', color: 'indigo' as const, clientId: acmeClient.id, client: 'Acme Co.', status: 'active' as const, fee: 6500, deadline: d(30), createdAt: Date.now() }
  const store = { id: uid(), name: 'Online store', color: 'teal' as const, client: 'My business', status: 'active' as const, createdAt: Date.now() }
  const coaching = { id: uid(), name: 'Coaching clients', color: 'orange' as const, clientId: lena.id, status: 'active' as const, fee: 1280, createdAt: Date.now() }
  data.projects = [acme, store, coaching]

  // ── Tasks
  data.tasks = [
    makeTask({ title: 'Send Acme homepage mockups', priority: 'high', categoryId: 'tc-work', projectId: acme.id, dueDate: today, dueTime: '16:00', reminder: 30, subtasks: [
      { id: uid(), title: 'Export desktop + mobile', done: true },
      { id: uid(), title: 'Write change notes', done: false },
    ] }),
    makeTask({ title: 'Pay electricity bill', priority: 'medium', categoryId: 'tc-home', dueDate: today }),
    makeTask({ title: '30 min walk', priority: 'low', categoryId: 'tc-health', dueDate: today, status: 'done', completedAt: Date.now() }),
    makeTask({ title: 'Follow up with Lena about invoice #104', priority: 'urgent', categoryId: 'tc-business', projectId: coaching.id, dueDate: d(-2) }),
    makeTask({ title: 'Renew passport photos', priority: 'medium', categoryId: 'tc-personal', dueDate: d(-1) }),
    makeTask({ title: 'Prepare Q4 product list for store', priority: 'high', categoryId: 'tc-business', projectId: store.id, dueDate: d(2), status: 'in_progress' }),
    makeTask({ title: 'Book dentist follow-up', priority: 'low', categoryId: 'tc-health', dueDate: d(4) }),
    makeTask({ title: 'Draft proposal for new coaching package', priority: 'medium', categoryId: 'tc-business', projectId: coaching.id, dueDate: d(6) }),
    makeTask({ title: 'Acme: review analytics setup', priority: 'medium', categoryId: 'tc-work', projectId: acme.id, dueDate: d(3), status: 'waiting' }),
    makeTask({ title: 'Read 2 chapters of “Deep Work”', priority: 'low', categoryId: 'tc-learning', dueDate: d(1) }),
    makeTask({ title: 'Organize tax documents', priority: 'medium', categoryId: 'tc-personal' }),
    makeTask({ title: 'Clean up product photos', priority: 'low', categoryId: 'tc-business', projectId: store.id }),
    makeTask({ title: 'Update CV', priority: 'low', categoryId: 'tc-work', status: 'done', completedAt: Date.now() - 86400000 * 2, dueDate: d(-3) }),
    makeTask({ title: 'Grocery run', priority: 'medium', categoryId: 'tc-home', dueDate: d(-1), status: 'done', completedAt: Date.now() - 86400000 }),
  ]

  // ── Events
  const mondayOffset = (8 - weekday) % 7 // days until next Monday (0 if today)
  data.events = [
    makeEvent({ title: 'Client call — Acme', type: 'meeting', date: today, startTime: '14:00', endTime: '14:45', location: 'Zoom', projectId: acme.id, reminder: 15 }),
    makeEvent({ title: 'Deep work block', type: 'personal', date: today, startTime: '09:30', endTime: '11:30' }),
    makeEvent({ title: 'Weekly planning', type: 'meeting', date: d(mondayOffset - 7), startTime: '10:00', endTime: '10:30', recurrence: { freq: 'weekly', interval: 1, weekdays: [1] }, reminder: 10 }),
    makeEvent({ title: 'Gym', type: 'personal', date: d(-14), startTime: '07:00', endTime: '08:00', recurrence: { freq: 'weekly', interval: 1, weekdays: [2, 4] } }),
    makeEvent({ title: 'Dentist', type: 'appointment', date: d(3), startTime: '15:30', endTime: '16:15', location: 'Smile Dental, 12 Oak St.', reminder: 60 }),
    makeEvent({ title: 'Store: Q4 launch deadline', type: 'deadline', date: d(9), allDay: true, projectId: store.id }),
    makeEvent({ title: 'Dinner with friends', type: 'event', date: d(5), startTime: '19:30', endTime: '22:00', location: 'Olive & Co.' }),
    makeEvent({ title: 'Monthly money review', type: 'personal', date: onDay(shiftMonth(thisMonth, -2), 1), startTime: '18:00', endTime: '18:30', recurrence: { freq: 'monthly', interval: 1 } }),
    makeEvent({ title: 'Coaching session — Lena', type: 'meeting', date: d(1), startTime: '11:00', endTime: '12:00', projectId: coaching.id }),
  ]

  // ── Notes
  data.notes = [
    makeNote({ title: 'Store growth ideas', category: 'ideas', pinned: true, projectId: store.id, body: '• Bundle offers for the holidays\n• Ask happy customers for photo reviews\n• Try a referral code (10% off both sides)\n• Short-form videos showing packaging' }),
    makeNote({ title: 'Weekly shopping list', category: 'daily', checklist: [
      { id: uid(), title: 'Oat milk', done: false }, { id: uid(), title: 'Eggs', done: true },
      { id: uid(), title: 'Spinach', done: false }, { id: uid(), title: 'Coffee beans', done: false },
    ], body: '' }),
    makeNote({ title: 'Acme kickoff notes', category: 'work', projectId: acme.id, date: d(-8), body: 'Goals: modern look, faster pages, clearer pricing.\nStakeholders: Tom (marketing), Priya (product).\nLaunch target: end of next month.' }),
    makeNote({ title: 'Car & insurance info', category: 'important', pinned: true, body: 'Policy renews every quarter.\nRoadside assistance: see card in glovebox.\nNext service due at 60,000 km.' }),
    makeNote({ title: 'Podcast idea: “Small business, calm life”', category: 'ideas', body: 'Interview solo founders about systems that keep them sane.' }),
    makeNote({ title: 'Pricing for coaching packages', category: 'business', projectId: coaching.id, body: 'Single session: 90\nPack of 4: 320\nMonthly retainer: 550' }),
    makeNote({ title: 'Books to read', category: 'personal', checklist: [
      { id: uid(), title: 'Deep Work', done: false }, { id: uid(), title: 'The Psychology of Money', done: true },
      { id: uid(), title: 'Atomic Habits', done: true },
    ], body: '' }),
  ]

  // ── Journal (last ~2 weeks with a few gaps)
  const moods: Mood[] = [4, 3, 4, 5, 2, 3, 4, 4, 5, 3, 4, 4]
  const bodies = [
    'Productive morning. Finished the mockups draft before lunch and felt in flow.',
    'Slow day, low energy after poor sleep. Still managed the important call.',
    'Great session with Lena — she landed her first client. Proud of her and of the program.',
    'Spent too much on takeout this week. Cooking more next week.',
    'Long walk in the evening cleared my head. Want more of these.',
    'Got the store photos sorted. Small wins add up.',
  ]
  const gratitude = [['Coffee with a friend', 'Sunny walk', 'A quiet evening'], ['Good health', 'Supportive clients'], ['Finished a hard task', 'Fresh bread from the bakery']]
  moods.forEach((mood, i) => {
    const date = d(-(i + 1) - (i > 6 ? 1 : 0))
    data.journal.push(makeJournal(date, {
      mood, energy: (Math.max(1, Math.min(5, mood + (i % 2 ? -1 : 0))) as Mood),
      body: bodies[i % bodies.length],
      gratitude: gratitude[i % gratitude.length],
      wins: i % 2 ? 'Kept my focus block free from notifications.' : 'Closed two open loops on my task list.',
      lessons: i % 3 === 0 ? 'Plan the next day before shutting down.' : '',
      tomorrow: 'Start with the hardest task.',
    }))
  })

  // ── Money
  data.budgets = {
    'fc-food': 600, 'fc-daily': 250, 'fc-transport': 150, 'fc-bills': 220, 'fc-subscriptions': 60,
    'fc-housing': 1350, 'fc-personal': 200, 'fc-fun': 150, 'fc-health': 90, 'fc-business-expense': 300,
  }

  const nextOnDay = (day: number) => {
    const cand = onDay(thisMonth, day)
    return cand >= today ? cand : onDay(shiftMonth(thisMonth, 1), day)
  }
  const pp = (p: Omit<PlannedPayment, 'id' | 'createdAt' | 'active'> & { day?: number }): PlannedPayment & { day?: number } => ({
    ...p, id: uid(), createdAt: Date.now(), active: true,
  })
  const payments = [
    pp({ name: 'Rent', amount: 1350, categoryId: 'fc-housing', recurrence: 'monthly', isSubscription: false, nextDue: nextOnDay(1), day: 1, paymentMethodId: 'pm-bank' }),
    pp({ name: 'Netflix', amount: 15.49, categoryId: 'fc-subscriptions', recurrence: 'monthly', isSubscription: true, nextDue: nextOnDay(12), day: 12, paymentMethodId: 'pm-credit' }),
    pp({ name: 'Spotify', amount: 10.99, categoryId: 'fc-subscriptions', recurrence: 'monthly', isSubscription: true, nextDue: d(2), day: Number(d(2).slice(8)), paymentMethodId: 'pm-credit' }),
    pp({ name: 'iCloud+', amount: 2.99, categoryId: 'fc-subscriptions', recurrence: 'monthly', isSubscription: true, nextDue: nextOnDay(27), day: 27, paymentMethodId: 'pm-credit' }),
    pp({ name: 'Phone plan', amount: 25, categoryId: 'fc-bills', recurrence: 'monthly', isSubscription: true, nextDue: d(5), day: Number(d(5).slice(8)), paymentMethodId: 'pm-debit' }),
    pp({ name: 'Internet', amount: 45, categoryId: 'fc-bills', recurrence: 'monthly', isSubscription: false, nextDue: nextOnDay(8), day: 8, paymentMethodId: 'pm-debit' }),
    // Overdue on purpose so the overdue state is visible.
    pp({ name: 'Gym membership', amount: 39, categoryId: 'fc-health', recurrence: 'monthly', isSubscription: true, nextDue: d(-2), day: Number(d(-2).slice(8)), paymentMethodId: 'pm-debit' }),
    pp({ name: 'Car insurance', amount: 210, categoryId: 'fc-bills', recurrence: 'quarterly', isSubscription: false, nextDue: d(18), paymentMethodId: 'pm-bank' }),
    pp({ name: 'Website domain + hosting', amount: 96, categoryId: 'fc-business-expense', recurrence: 'yearly', isSubscription: true, nextDue: d(40), paymentMethodId: 'pm-credit' }),
    pp({ name: 'Design software', amount: 22, categoryId: 'fc-business-expense', recurrence: 'monthly', isSubscription: true, nextDue: nextOnDay(15), day: 15, paymentMethodId: 'pm-credit' }),
  ]
  data.plannedPayments = payments.map(({ day: _day, ...p }) => p)

  const txs: Transaction[] = []
  const add = (t: Omit<Partial<Transaction>, 'type' | 'amount' | 'categoryId'> & Pick<Transaction, 'type' | 'amount' | 'categoryId' | 'date'>) => {
    if (t.date <= today) txs.push(makeTransaction(t))
  }

  for (let m = -3; m <= 0; m++) {
    const month = shiftMonth(thisMonth, m)
    // Income
    add({ type: 'income', amount: 4200, categoryId: 'fc-salary', date: onDay(month, 1), payee: 'Northwind Ltd.', paymentMethodId: 'pm-bank', note: 'Monthly salary' })
    add({ type: 'income', amount: between(450, 900), categoryId: 'fc-freelance', date: onDay(month, 9), payee: 'Acme Co.', paymentMethodId: 'pm-bank', scope: 'business', projectId: acme.id })
    add({ type: 'income', amount: between(250, 600), categoryId: 'fc-freelance', date: onDay(month, 21), payee: 'Studio Nine', paymentMethodId: 'pm-bank', scope: 'business' })
    add({ type: 'income', amount: between(300, 700), categoryId: 'fc-business-income', date: onDay(month, 14), payee: 'Store payouts', paymentMethodId: 'pm-bank', scope: 'business', projectId: store.id })
    add({ type: 'income', amount: between(180, 360), categoryId: 'fc-business-income', date: onDay(month, 28), payee: 'Coaching — Lena', paymentMethodId: 'pm-mobile', scope: 'business', projectId: coaching.id })
    if (m % 2 === 0) add({ type: 'income', amount: between(80, 200), categoryId: 'fc-commission', date: onDay(month, 17), payee: 'Referral partner', paymentMethodId: 'pm-bank', scope: 'business' })

    // Planned payments history
    for (const p of payments) {
      if (p.recurrence !== 'monthly' || !p.day) continue
      const date = onDay(month, p.day)
      if (date >= p.nextDue) continue // not paid yet
      add({ type: 'expense', amount: p.amount, categoryId: p.categoryId, date, payee: p.name, paymentMethodId: p.paymentMethodId, plannedPaymentId: p.id, note: p.isSubscription ? 'Subscription' : 'Planned payment', scope: p.categoryId === 'fc-business-expense' ? 'business' : 'personal' })
    }

    // Variable spending
    for (let day = 1; day <= 31; day++) {
      const date = onDay(month, day)
      if (Number(date.slice(8)) !== day) break
      if (day % 7 === 3) add({ type: 'expense', amount: between(55, 140), categoryId: 'fc-food', date, payee: r() > 0.5 ? 'FreshMart' : 'Green Grocer', paymentMethodId: 'pm-debit' })
      if (r() < 0.45) add({ type: 'expense', amount: between(3.5, 16), categoryId: 'fc-daily', date, payee: r() > 0.5 ? 'Corner Café' : 'Lunch', paymentMethodId: r() > 0.3 ? 'pm-debit' : 'pm-cash' })
      if (r() < 0.25) add({ type: 'expense', amount: between(2.5, 22), categoryId: 'fc-transport', date, payee: r() > 0.6 ? 'Taxi' : 'Metro', paymentMethodId: 'pm-mobile' })
      if (r() < 0.07) add({ type: 'expense', amount: between(20, 95), categoryId: 'fc-personal', date, payee: 'Shopping', paymentMethodId: 'pm-credit' })
      if (r() < 0.06) add({ type: 'expense', amount: between(12, 60), categoryId: 'fc-fun', date, payee: r() > 0.5 ? 'Cinema' : 'Concert', paymentMethodId: 'pm-credit' })
      if (r() < 0.04) add({ type: 'expense', amount: between(15, 70), categoryId: 'fc-health', date, payee: 'Pharmacy', paymentMethodId: 'pm-debit' })
      if (r() < 0.05) add({ type: 'expense', amount: between(30, 140), categoryId: 'fc-business-expense', date, payee: 'Ads', paymentMethodId: 'pm-credit', scope: 'business', projectId: store.id })
    }
    add({ type: 'expense', amount: between(70, 110), categoryId: 'fc-bills', date: onDay(month, 18), payee: 'City Power', paymentMethodId: 'pm-debit', note: 'Electricity' })
  }
  // Make this month's takeout a bit heavy so the budget insight has something to say.
  add({ type: 'expense', amount: 64.3, categoryId: 'fc-daily', date: d(-1), payee: 'Sushi takeout', paymentMethodId: 'pm-credit' })
  data.transactions = txs.sort((a, b) => a.date.localeCompare(b.date))

  // ── Savings goals
  const contributions = (amounts: number[]) =>
    amounts.map((amount, i) => ({ id: uid(), amount, date: onDay(shiftMonth(thisMonth, -amounts.length + 1 + i), 2) }))
  data.goals = [
    { id: uid(), name: 'Emergency fund', target: 10000, color: 'green', createdAt: Date.now(), contributions: contributions([4800, 500, 400, 500]) },
    { id: uid(), name: 'Japan trip', target: 4000, targetDate: toISO(fromISO(onDay(shiftMonth(thisMonth, 8), 15))), color: 'pink', createdAt: Date.now(), contributions: contributions([600, 300, 300]) },
    { id: uid(), name: 'New laptop', target: 2400, targetDate: onDay(shiftMonth(thisMonth, 4), 1), color: 'blue', createdAt: Date.now(), contributions: contributions([500, 400]) },
  ]

  // ── Business: invoices & pending payments
  data.invoices = [
    makeInvoice({ number: 'INV-0001', title: 'Homepage design — milestone 1', kind: 'invoice', clientId: acmeClient.id, projectId: acme.id, amount: 1950, issueDate: d(-40), dueDate: d(-26), status: 'paid', paidDate: d(-27) }),
    makeInvoice({ number: 'INV-0002', title: 'Homepage design — milestone 2', kind: 'invoice', clientId: acmeClient.id, projectId: acme.id, amount: 1800, issueDate: d(-9), dueDate: d(5), status: 'sent' }),
    makeInvoice({ number: 'INV-0003', title: 'Coaching pack (4 sessions)', kind: 'freelance', clientId: lena.id, projectId: coaching.id, amount: 320, issueDate: d(-20), dueDate: d(-6), status: 'sent' }),
    makeInvoice({ number: 'INV-0004', title: 'Brand illustrations', kind: 'freelance', clientId: studio.id, amount: 650, issueDate: today, status: 'draft' }),
    makeInvoice({ number: 'INV-0005', title: 'Referral commission — Q3', kind: 'commission', amount: 150, issueDate: d(-3), dueDate: d(12), status: 'sent' }),
  ]

  // ── Habits with ~4 weeks of history
  const habitLog = (rate: number, target = 1, scheduled: (iso: string) => boolean = () => true) => {
    const log: Record<string, number> = {}
    for (const day of eachDay(d(-34), d(-1))) {
      if (scheduled(day) && r() < rate) log[day] = target
      else if (target > 1 && scheduled(day) && r() < 0.5) log[day] = Math.max(1, Math.round(target * r()))
    }
    return log
  }
  const isWorkday = (iso: string) => { const w = fromISO(iso).getDay(); return w >= 1 && w <= 5 }
  const created = Date.now() - 35 * 86400000
  data.habits = [
    makeHabit({ name: 'Drink water', emoji: '💧', color: 'blue', area: 'health', target: 8, unit: 'glasses', order: 0, createdAt: created, log: { ...habitLog(0.7, 8), [today]: 3 } }),
    makeHabit({ name: 'Walk 30 minutes', emoji: '🚶', color: 'green', area: 'health', order: 1, createdAt: created, reminderTime: '18:00', log: { ...habitLog(0.85), [today]: 1 } }),
    makeHabit({ name: 'Read 20 pages', emoji: '📚', color: 'violet', area: 'learning', schedule: { kind: 'weekdays', days: [1, 2, 3, 4, 5] }, order: 2, createdAt: created, log: habitLog(0.75, 1, isWorkday) }),
    makeHabit({ name: 'Gym', emoji: '🏋️', color: 'orange', area: 'health', schedule: { kind: 'weekly', times: 3 }, order: 3, createdAt: created, log: habitLog(0.42) }),
    makeHabit({ name: 'No phone after 22:00', emoji: '🌙', color: 'indigo', area: 'personal', order: 4, createdAt: created, log: habitLog(0.6) }),
  ]

  // ── Personal goals & a weekly review
  data.lifeGoals = [
    makeLifeGoal({ title: 'Launch the Q4 product line', why: 'Holiday season is 40% of yearly store revenue.', horizon: 'monthly', area: 'business', targetDate: d(9), measure: 'milestones', milestones: [
      { id: uid(), title: 'Pick 12 products', done: true }, { id: uid(), title: 'Product photos', done: true },
      { id: uid(), title: 'Write descriptions', done: false }, { id: uid(), title: 'Launch email', done: false },
    ] }),
    makeLifeGoal({ title: 'Read 12 books this year', horizon: 'yearly', area: 'learning', targetDate: `${today.slice(0, 4)}-12-31`, measure: 'number', current: 9, target: 12, unit: 'books' }),
    makeLifeGoal({ title: 'Run a 10K', why: 'Feel fit and have more energy for work.', horizon: 'quarterly', area: 'health', targetDate: d(60), measure: 'manual', progress: 40 }),
    makeLifeGoal({ title: 'Inbox zero every Friday', horizon: 'weekly', area: 'career', targetDate: d((12 - fromISO(today).getDay()) % 7 || 7), measure: 'milestones', milestones: [
      { id: uid(), title: 'Work inbox', done: true }, { id: uid(), title: 'Personal inbox', done: false },
    ] }),
    makeLifeGoal({ title: 'Build a 6-month emergency fund', horizon: 'long-term', area: 'finance', measure: 'manual', progress: 62 }),
  ]
  const lastWeek = addDaysISO(today, -7)
  data.reviews = [{
    id: uid(), period: 'week', key: weekKey(lastWeek), rating: 4, createdAt: Date.now(), updatedAt: Date.now(),
    wins: 'Shipped the Acme mockups draft; 5 gym sessions.', challenges: 'Too many meetings on Wednesday.',
    lessons: 'Block deep work before noon.', focus: 'Finish product descriptions; follow up on overdue invoice.',
  }]

  // ── Life organizer
  const item = (title: string, done = false, qty?: string) => ({ id: uid(), title, done, qty })
  data.lists = [
    makeList({ name: 'Groceries', kind: 'shopping', color: 'green', pinned: true, items: [item('Oat milk', false, '2'), item('Eggs', true, '12'), item('Spinach'), item('Coffee beans'), item('Greek yogurt'), item('Bananas', true)] }),
    makeList({ name: 'Weekend errands', kind: 'errands', color: 'amber', items: [item('Return parcel'), item('Pick up dry cleaning'), item('Buy birthday gift for Mom')] }),
    makeList({ name: 'Japan trip packing', kind: 'packing', color: 'pink', items: [item('Passport'), item('Rail pass'), item('Power adapter'), item('Comfortable shoes')] }),
  ]
  data.importantDates = [
    makeImportantDate({ title: 'Mom’s birthday', kind: 'birthday', date: `1968-${d(12).slice(5)}`, yearly: true, remindDays: 3 }),
    makeImportantDate({ title: 'Alex’s birthday', kind: 'birthday', date: `1994-${d(2).slice(5)}`, yearly: true, remindDays: 1 }),
    makeImportantDate({ title: 'Wedding anniversary', kind: 'anniversary', date: `2019-${d(41).slice(5)}`, yearly: true, remindDays: 7 }),
    makeImportantDate({ title: 'Passport expires', kind: 'expiry', date: d(150), yearly: false, remindDays: 60 }),
    makeImportantDate({ title: 'Domain renewal', kind: 'renewal', date: d(40), yearly: true, remindDays: 7 }),
  ]
  const field = (label: string, value: string, secret = false) => ({ id: uid(), label, value, secret })
  data.vault = [
    makeVaultItem({ title: 'Passport', kind: 'id', pinned: true, expiresOn: d(150), fields: [field('Full name', 'Sample Name'), field('Number', 'AB 000000', true), field('Issued', '2017-03-14')] }),
    makeVaultItem({ title: 'Home Wi-Fi', kind: 'home', fields: [field('Network', 'Orbit-Home'), field('Password', 'sample-wifi-pass', true)] }),
    makeVaultItem({ title: 'Health insurance', kind: 'insurance', expiresOn: d(45), fields: [field('Provider', 'Example Health'), field('Policy number', 'EH-0000-0000', true), field('Hotline', '+1 555 0199')] }),
    makeVaultItem({ title: 'Car', kind: 'vehicle', fields: [field('Plate', 'SAMPLE 01'), field('VIN', '0000000000000000', true)] }),
  ]

  return data
}

