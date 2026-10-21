// Markdown export of a report — short enough to paste into a note or a message.
import { saveFile } from '@/lib/platform'
import type { Highlight } from './highlights'
import { fmtRange, pctChange, periodKey, periodName, type CompareLabels, type Report } from './metrics'
import {
  energyEmoji, hours, moodEmoji, percent, plural, points, score, signed, signedMoney, signedPercent, WEEKDAYS,
  type MoneyFn,
} from './text'

export interface MarkdownOptions {
  money: MoneyFn
  labels: CompareLabels
  today: string
}

/** One-line Markdown escape for user-written names. */
function esc(s: string): string {
  return s.replace(/([\\`*_[\]#|<>])/g, '\\$1').replace(/\s+/g, ' ').trim()
}

function vsPct(cur: number, prev: number): string {
  const ch = pctChange(cur, prev)
  return ch == null ? '' : ` (${signedPercent(ch)})`
}

export function reportMarkdown(cur: Report, prev: Report, highlights: Highlight[], o: MarkdownOptions): string {
  const { money, labels, today } = o
  const p = cur.period
  const lines: string[] = []
  const add = (...l: string[]) => lines.push(...l)
  const so = p.current ? ' so far' : ''

  add(
    `# Orbit report — ${periodName(p)}`,
    '',
    `_${fmtRange(p.start, p.to, today)}${so}, compared with ${fmtRange(prev.period.start, prev.period.to, today)}._`,
    '',
  )

  if (highlights.length) {
    add('## Highlights', ...highlights.map((h) => `- ${esc(h.text)}`), '')
  }

  const P = cur.productivity
  const PP = prev.productivity
  if (P.completed || P.created || P.due || P.scheduledMinutes) {
    add('## Productivity', `- Tasks completed: ${P.completed} (${signed(P.completed - PP.completed)} vs ${labels.prev})`)
    add(`- Tasks created: ${P.created}`)
    if (P.completionRate != null) add(`- Due tasks done: ${P.dueDone} of ${P.due} (${percent(P.completionRate)})`)
    if (P.onTimeRate != null) add(`- On time: ${percent(P.onTimeRate)}`)
    if (P.scheduledMinutes) add(`- Scheduled time: ${hours(P.scheduledMinutes)} across ${plural(P.eventCount, 'event')}`)
    if (P.busiest) add(`- ${p.kind === 'week' ? 'Busiest day' : 'Busiest weekday'}: ${WEEKDAYS[P.busiest.weekday]} (${hours(P.busiest.minutes)})`)
    if (P.byCategory.length) add(`- By category: ${P.byCategory.slice(0, 4).map((c) => `${esc(c.label)} ${c.value}`).join(', ')}`)
    add('')
  }

  const M = cur.money
  const MP = prev.money
  if (M.count) {
    add(
      '## Money',
      `- Income: ${money(M.income)}${vsPct(M.income, MP.income)}`,
      `- Expenses: ${money(M.expense)}${vsPct(M.expense, MP.expense)}`,
      `- Net: ${signedMoney(money, M.net)}`,
    )
    if (M.savingsRate != null) add(`- Savings rate: ${percent(M.savingsRate)}`)
    if (M.categories.length) {
      add(`- Top spending: ${M.categories.slice(0, 3).map((c) => `${esc(c.label)} ${money(c.value)} (${percent(c.share)})`).join(', ')}`)
    }
    if (cur.budget) {
      const b = cur.budget
      add(b.over.length
        ? `- Budgets: ${b.over.length} of ${b.rows.length} over (${b.over.map((r) => esc(r.category.name)).join(', ')})`
        : `- Budgets: all ${b.rows.length} within limits`)
    }
    add('')
  }

  const Bz = cur.business
  if (Bz.active) {
    add('## Business', `- Revenue: ${money(Bz.income)} · Expenses: ${money(Bz.expenses)} · Profit: ${signedMoney(money, Bz.profit)}`)
    if (Bz.paidCount) add(`- Invoices paid: ${Bz.paidCount} (${money(Bz.paidAmount)})`)
    if (Bz.receivables.pendingCount) {
      add(`- Outstanding: ${money(Bz.receivables.pending)} across ${plural(Bz.receivables.pendingCount, 'invoice')}${Bz.receivables.overdueCount ? `, ${Bz.receivables.overdueCount} overdue` : ''}`)
    }
    if (Bz.topClient) add(`- Top client: ${esc(Bz.topClient.name)} (${money(Bz.topClient.amount)})`)
    add('')
  }

  const H = cur.habits
  if (H.rows.length && H.overall != null) {
    const d = prev.habits.overall != null ? ` (${points(H.overall - prev.habits.overall)})` : ''
    add('## Habits', `- Consistency: ${percent(H.overall)}${d}`)
    for (const r of H.rows.slice(0, 6)) add(`- ${r.emoji ? `${r.emoji} ` : ''}${esc(r.name)}: ${percent(r.rate)} (${r.done}/${r.due})`)
    if (H.best) add(`- Longest streak: ${esc(H.best.name)}, ${plural(H.best.count, H.best.unit)}`)
    add('')
  }

  const G = cur.goals
  if (G.completed.length || G.active.length) {
    add('## Goals')
    for (const g of G.completed) add(`- Completed: ${esc(g.title)}`)
    for (const g of G.active.slice(0, 5)) {
      add(`- ${esc(g.title)}: ${percent(g.progress)}${g.targetDate ? ` (target ${fmtRange(g.targetDate, g.targetDate, today)})` : ''}`)
    }
    add('')
  }

  const W = cur.wellbeing
  if (W.entries) {
    add('## Wellbeing', `- Journal entries: ${W.entries} of ${plural(W.days, 'day')}`)
    if (W.avgMood != null) add(`- Mood: ${score(W.avgMood)} ${moodEmoji(W.avgMood)}`)
    if (W.avgEnergy != null) add(`- Energy: ${score(W.avgEnergy)} ${energyEmoji(W.avgEnergy)}`)
    if (W.gratitude) add(`- Gratitude notes: ${W.gratitude}`)
    add('')
  }

  add('_Made with Orbit._', '')
  return lines.join('\n')
}

export function reportFilename(r: Report): string {
  return `orbit-report-${periodKey(r.period)}.md`
}

export function shareReport(md: string, filename: string) {
  return saveFile(new Blob([md], { type: 'text/markdown' }), filename)
}
