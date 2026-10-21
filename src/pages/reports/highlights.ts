// Plain-language insights for a period, ranked by how much they matter.
// Pure: two reports (this period and the one before) in, sorted sentences out.
import { categoryChanges, pctChange, type CompareLabels, type Report } from './metrics'
import {
  hours, moodEmoji, percent, plural, points, score, signed, signedMoney, signedPercent, WEEKDAYS, type MoneyFn,
} from './text'

export type HighlightTone = 'good' | 'bad' | 'warn' | 'neutral'

export type HighlightKind =
  | 'tasks' | 'overdue' | 'ontime' | 'busy'
  | 'spending' | 'savings' | 'budget'
  | 'invoices' | 'paid' | 'profit'
  | 'habit' | 'habit-slip' | 'habits' | 'streak'
  | 'goals' | 'goal-due'
  | 'mood' | 'journal'

export interface Highlight {
  id: HighlightKind
  tone: HighlightTone
  text: string
  /** Higher = more significant. Roughly 0..100. */
  score: number
  /** Where to look for details. */
  to?: string
}

export interface HighlightOptions {
  money: MoneyFn
  labels: CompareLabels
  /** Most highlights to return. */
  limit?: number
}

const isAre = (n: number) => (n === 1 ? 'is' : 'are')

export function buildHighlights(cur: Report, prev: Report, o: HighlightOptions): Highlight[] {
  const { money, labels } = o
  const out: Highlight[] = []
  const unit = cur.period.kind
  const thisUnit = cur.period.current ? `this ${unit}` : `that ${unit}`

  // ── Productivity
  const P = cur.productivity
  const PP = prev.productivity
  if (P.completed || PP.completed) {
    const d = P.completed - PP.completed
    out.push({
      id: 'tasks',
      tone: d > 0 ? 'good' : d < 0 ? 'bad' : 'neutral',
      text: `You completed ${plural(P.completed, 'task')} (${d === 0 ? `same as ${labels.prev}` : `${signed(d)} vs ${labels.prev}`})`,
      score: 48 + Math.min(24, Math.abs(d) * 3) + Math.min(8, P.completed / 2),
      to: '/tasks',
    })
  }
  if (P.overdue) {
    out.push({
      id: 'overdue',
      tone: 'bad',
      text: `${plural(P.overdue, 'task')} due ${thisUnit} ${isAre(P.overdue)} still open`,
      score: 56 + Math.min(20, P.overdue * 4),
      to: '/tasks',
    })
  }
  if (P.onTimeRate != null && P.completedWithDue >= 3) {
    const r = P.onTimeRate
    out.push({
      id: 'ontime',
      tone: r >= 0.8 ? 'good' : r < 0.5 ? 'bad' : 'neutral',
      text: `${percent(r)} of tasks with a due date were done on time`,
      score: 28 + Math.abs(r - 0.65) * 30,
      to: '/tasks',
    })
  }
  if (P.busiest && P.busiest.minutes >= 60) {
    const day = WEEKDAYS[P.busiest.weekday]
    out.push({
      id: 'busy',
      tone: 'neutral',
      text: unit === 'week'
        ? `Busiest day: ${day} (${hours(P.busiest.minutes)} scheduled)`
        : `Busiest weekday: ${day}s (${hours(P.busiest.minutes)} scheduled in total)`,
      score: 26 + Math.min(16, P.busiest.minutes / 60),
      to: '/calendar',
    })
  }

  // ── Money
  const M = cur.money
  const MP = prev.money
  if (M.expense > 0 && MP.expense > 0) {
    const ch = (M.expense - MP.expense) / MP.expense
    const flat = Math.abs(ch) < 0.03
    const lower = ch < 0
    let text = flat
      ? `Spending was about the same as ${labels.than} (${money(M.expense)})`
      : `Spending was ${percent(Math.abs(ch))} ${lower ? 'lower' : 'higher'} than ${labels.than}`
    if (!flat) {
      const changes = categoryChanges(M, MP)
      const mover = lower ? changes[0] : changes[changes.length - 1]
      if (mover && (lower ? mover.diff < 0 : mover.diff > 0)) {
        text += ` — ${mover.label} is ${lower ? 'down' : 'up'} the most`
      }
    }
    out.push({
      id: 'spending',
      tone: flat ? 'neutral' : lower ? 'good' : 'bad',
      text,
      score: 44 + Math.min(34, Math.abs(ch) * 100),
      to: '/money',
    })
  } else if (M.expense > 0) {
    const top = M.categories[0]
    out.push({
      id: 'spending',
      tone: 'neutral',
      text: `You spent ${money(M.expense)}${
        !top ? '' : M.categories.length === 1 ? `, all on ${top.label}` : ` — most on ${top.label} (${percent(top.share)})`
      }`,
      score: 32,
      to: '/money',
    })
  }
  if (M.income > 0 && M.savingsRate != null) {
    if (M.net >= 0) {
      out.push({
        id: 'savings',
        tone: M.savingsRate >= 0.1 ? 'good' : 'neutral',
        text: `You saved ${percent(M.savingsRate)} of your income (${money(M.net)})`,
        score: 34 + Math.min(20, M.savingsRate * 40),
        to: '/money',
      })
    } else {
      out.push({
        id: 'savings',
        tone: 'bad',
        text: `You spent ${money(-M.net)} more than you earned`,
        score: 62,
        to: '/money',
      })
    }
  }
  const B = cur.budget
  if (B) {
    if (B.over.length) {
      const worst = [...B.over].sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget))[0]
      out.push({
        id: 'budget',
        tone: 'bad',
        text: `${plural(B.over.length, 'budget')} ${isAre(B.over.length)} over the limit — ${worst.category.name} by ${money(worst.spent - worst.budget)}`,
        score: 60 + Math.min(16, B.over.length * 4),
        to: '/money/budget',
      })
    } else {
      out.push({
        id: 'budget',
        tone: 'good',
        text: B.rows.length === 1
          ? `Your ${B.rows[0].category.name} budget is on track`
          : `All ${B.rows.length} budgets are within their limits`,
        score: 30,
        to: '/money/budget',
      })
    }
  }

  // ── Business
  const Bz = cur.business
  const BzP = prev.business
  if (Bz.receivables.overdueCount) {
    const n = Bz.receivables.overdueCount
    out.push({
      id: 'invoices',
      tone: 'bad',
      text: `${plural(n, 'invoice')} ${isAre(n)} overdue (${money(Bz.receivables.overdue)})`,
      score: 68 + Math.min(15, n * 3),
      to: '/business',
    })
  }
  if (Bz.paidCount) {
    out.push({
      id: 'paid',
      tone: 'good',
      text: `${plural(Bz.paidCount, 'invoice')} paid (${money(Bz.paidAmount)})`,
      score: 40 + Math.min(10, Bz.paidCount * 2),
      to: '/business',
    })
  }
  if (Bz.income || Bz.expenses) {
    const ch = pctChange(Bz.profit, BzP.profit)
    const d = Bz.profit - BzP.profit
    const hadPrev = BzP.income > 0 || BzP.expenses > 0
    const vs = !hadPrev
      ? ''
      : ` (${ch != null && Math.abs(ch) < 10 ? signedPercent(ch) : signedMoney(money, d)} vs ${labels.prev})`
    out.push({
      id: 'profit',
      tone: !hadPrev ? (Bz.profit >= 0 ? 'neutral' : 'bad') : d > 0 ? 'good' : d < 0 ? 'bad' : 'neutral',
      text: Bz.profit >= 0 ? `Business profit: ${money(Bz.profit)}${vs}` : `Business ran at a loss of ${money(-Bz.profit)}${vs}`,
      score: 42 + Math.min(20, ch != null ? Math.abs(ch) * 40 : 6),
      to: '/business',
    })
  }

  // ── Habits
  const H = cur.habits
  const HP = prev.habits
  if (H.rows.length) {
    const best = H.rows[0]
    if (best.rate > 0) {
      out.push({
        id: 'habit',
        tone: best.rate >= 0.8 ? 'good' : 'neutral',
        text: `Best habit: ${best.name}, ${percent(best.rate)}`,
        score: 34 + best.rate * 14,
        to: '/growth',
      })
    }
    const worst = H.rows[H.rows.length - 1]
    if (H.rows.length > 1 && worst.rate < 0.5 && worst.rate < best.rate) {
      out.push({
        id: 'habit-slip',
        tone: 'warn',
        text: `${worst.name} slipped — done ${worst.done} of ${worst.due} times`,
        score: 38 + (0.5 - worst.rate) * 30,
        to: '/growth',
      })
    }
    if (H.overall != null && HP.overall != null && Math.abs(H.overall - HP.overall) >= 0.05) {
      const d = H.overall - HP.overall
      out.push({
        id: 'habits',
        tone: d > 0 ? 'good' : 'bad',
        text: `Habit consistency ${d > 0 ? 'rose' : 'fell'} to ${percent(H.overall)} (${points(d)})`,
        score: 36 + Math.min(26, Math.abs(d) * 100),
        to: '/growth',
      })
    }
  }
  if (cur.period.current && H.best && H.best.count >= 3) {
    out.push({
      id: 'streak',
      tone: 'good',
      text: `${H.best.name} is on a ${H.best.count}-${H.best.unit} streak`,
      score: 28 + Math.min(18, H.best.count),
      to: '/growth',
    })
  }

  // ── Goals
  const G = cur.goals
  if (G.completed.length) {
    const n = G.completed.length
    const names = G.completed.slice(0, 2).map((g) => g.title).join(', ')
    out.push({
      id: 'goals',
      tone: 'good',
      text: `You completed ${plural(n, 'goal')}: ${names}${n > 2 ? ` and ${n - 2} more` : ''}`,
      score: 64 + Math.min(12, n * 3),
      to: '/growth',
    })
  }
  if (cur.period.current) {
    const soon = G.upcoming.find((g) => g.daysLeft != null && g.daysLeft <= 14 && g.progress < 1)
    if (soon && soon.daysLeft != null) {
      out.push({
        id: 'goal-due',
        tone: soon.progress >= 0.75 ? 'neutral' : 'warn',
        text: `“${soon.title}” is due ${soon.daysLeft === 0 ? 'today' : `in ${plural(soon.daysLeft, 'day')}`} — ${percent(soon.progress)} done`,
        score: 44 + (14 - soon.daysLeft),
        to: '/growth',
      })
    }
  }

  // ── Wellbeing
  const W = cur.wellbeing
  const WP = prev.wellbeing
  if (W.avgMood != null) {
    const d = WP.avgMood != null ? W.avgMood - WP.avgMood : null
    const moved = d != null && Math.abs(d) >= 0.05
    out.push({
      id: 'mood',
      tone: d == null || Math.abs(d) < 0.15 ? 'neutral' : d > 0 ? 'good' : 'bad',
      text: `Mood averaged ${score(W.avgMood)} ${moodEmoji(W.avgMood)}${moved && d != null ? ` (${d > 0 ? '↑' : '↓'}${score(Math.abs(d))})` : ''}`,
      score: 34 + (d != null ? Math.min(24, Math.abs(d) * 30) : 0),
      to: '/journal',
    })
  }
  if (W.entries) {
    out.push({
      id: 'journal',
      tone: W.entries / W.days >= 0.7 ? 'good' : 'neutral',
      text: `You journaled on ${W.entries} of ${plural(W.days, 'day')}${W.gratitude ? ` and noted ${plural(W.gratitude, 'thing')} you're grateful for` : ''}`,
      score: 20 + (W.entries / W.days) * 12,
      to: '/journal',
    })
  }

  return out.sort((a, b) => b.score - a.score).slice(0, o.limit ?? 7)
}
