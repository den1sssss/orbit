// The seven report cards. Each reads the current + previous report and renders;
// no calculations beyond formatting happen here (see metrics.ts).
import { useNavigate } from 'react-router-dom'
import {
  Activity, AlarmClock, BadgeCheck, BookHeart, Briefcase, CalendarClock, ChevronRight, CircleCheck, Flame, Gauge,
  HeartPulse, ListChecks, PiggyBank, Receipt, Repeat, Smile, Sparkles, Target, Timer, TrendingDown, TrendingUp,
  Trophy, Wallet, type LucideIcon,
} from 'lucide-react'
import { Badge, cn, Progress, Stat } from '@/components/ui'
import { fmt, monthOf } from '@/lib/dates'
import { LIFE_AREA_LABELS } from '@/lib/defaults'
import { budgetTone } from '@/lib/finance'
import type { ISODate } from '@/lib/types'
import { DailyColumns, HBarList, MoodLine, type HBar } from './charts'
import type { Highlight, HighlightKind, HighlightTone } from './highlights'
import type { GoalRow, Report, ShareRow } from './metrics'
import {
  energyEmoji, hours, MINUS, moodEmoji, percent, plural, points, score, signed, signedMoney, WEEKDAYS, type MoneyFn,
} from './text'
import { Delta, MoneyDelta, Section, SectionEmpty, StatGrid, SubHeading } from './ui'

export interface SectionProps {
  cur: Report
  prev: Report
  /** Short name of the comparison period ("last week", "Sep"). */
  vs: string
  money: MoneyFn
  today: ISODate
  className?: string
}

const SERIES_1 = 'var(--chart-income)'
const SERIES_SPEND = 'var(--chart-expense)'

const rate = (r: number | null) => (r == null ? '—' : percent(r))

/** "this week" while the period runs, "that week" for past periods. */
function when(r: Report) {
  return `${r.period.current ? 'this' : 'that'} ${r.period.kind}`
}

// ───────────────────────── Highlights ─────────────────────────

const HIGHLIGHT_ICONS: Record<HighlightKind, LucideIcon> = {
  tasks: CircleCheck,
  overdue: AlarmClock,
  ontime: Timer,
  busy: CalendarClock,
  spending: Wallet,
  savings: PiggyBank,
  budget: Gauge,
  invoices: Receipt,
  paid: BadgeCheck,
  profit: Briefcase,
  habit: Flame,
  'habit-slip': Activity,
  habits: Repeat,
  streak: Flame,
  goals: Trophy,
  'goal-due': Target,
  mood: Smile,
  journal: BookHeart,
}

const TONE_CHIP: Record<HighlightTone, string> = {
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  neutral: 'bg-accent-soft text-accent-text',
}

function highlightIcon(h: Highlight): LucideIcon {
  if (h.id === 'spending') return h.tone === 'good' ? TrendingDown : h.tone === 'bad' ? TrendingUp : Wallet
  return HIGHLIGHT_ICONS[h.id]
}

export function HighlightsCard({ items, className }: { items: Highlight[]; className?: string }) {
  const navigate = useNavigate()
  return (
    <Section title="Highlights" icon={Sparkles} className={className}>
      {items.length ? (
        <ul className="-mx-2 flex flex-col">
          {items.map((h) => {
            const Icon = highlightIcon(h)
            const body = (
              <>
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE_CHIP[h.tone])}>
                  <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug text-ink">{h.text}</span>
                {h.to && <ChevronRight size={16} className="shrink-0 text-muted" aria-hidden="true" />}
              </>
            )
            const to = h.to
            return (
              <li key={h.id}>
                {to ? (
                  <button
                    type="button"
                    onClick={() => navigate(to)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex min-h-12 items-center gap-3 px-2 py-2">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <SectionEmpty
          icon={Sparkles}
          title="Nothing to report yet"
          description="Complete tasks, log spending, check off habits or write in your journal — insights appear here."
        />
      )}
    </Section>
  )
}

// ───────────────────────── Productivity ─────────────────────────

export function ProductivityCard({ cur, prev, vs, today, className }: SectionProps) {
  const P = cur.productivity
  const PP = prev.productivity
  const kind = cur.period.kind
  const empty = !P.completed && !P.created && !P.due && !P.scheduledMinutes
  const days = P.perDay.filter((d) => d.value != null).length || 1
  const busiestLabel = kind === 'week' ? 'Busiest day' : 'Busiest weekday'

  return (
    <Section title="Productivity" icon={ListChecks} to="/tasks" className={className}>
      {empty ? (
        <SectionEmpty
          icon={ListChecks}
          title="A quiet stretch"
          description={`No tasks were completed, created or due, and nothing timed was on the calendar ${when(cur)}.`}
        />
      ) : (
        <>
          <StatGrid>
            <Stat
              label="Tasks completed"
              value={P.completed.toLocaleString()}
              hint={<Delta diff={P.completed - PP.completed} format={signed} vs={vs} />}
            />
            <Stat
              label="Tasks created"
              value={P.created.toLocaleString()}
              hint={<Delta diff={P.created - PP.created} format={signed} good="none" vs={vs} />}
            />
            <Stat
              label="Due tasks done"
              value={rate(P.completionRate)}
              hint={
                P.completionRate != null && PP.completionRate != null
                  ? <Delta diff={P.completionRate - PP.completionRate} format={points} vs={vs} epsilon={0.005} />
                  : P.due ? `${P.dueDone} of ${P.due} due` : 'Nothing was due'
              }
            />
            <Stat
              label="Done on time"
              value={rate(P.onTimeRate)}
              hint={
                P.onTimeRate != null && PP.onTimeRate != null
                  ? <Delta diff={P.onTimeRate - PP.onTimeRate} format={points} vs={vs} epsilon={0.005} />
                  : P.completedWithDue ? `${P.onTime} of ${P.completedWithDue}` : 'No dated tasks done'
              }
            />
            <Stat
              label="Scheduled time"
              value={P.scheduledMinutes ? hours(P.scheduledMinutes) : '0 h'}
              hint={
                <Delta
                  diff={P.scheduledMinutes || PP.scheduledMinutes ? P.scheduledMinutes - PP.scheduledMinutes : null}
                  format={(n) => `${n > 0 ? '+' : MINUS}${hours(Math.abs(n))}`}
                  good="none"
                  vs={vs}
                  epsilon={1}
                />
              }
            />
            <Stat
              label={busiestLabel}
              value={P.busiest ? WEEKDAYS[P.busiest.weekday] : '—'}
              hint={P.busiest ? `${hours(P.busiest.minutes)}${kind === 'week' ? ' scheduled' : ' in total'}` : 'No timed events'}
            />
          </StatGrid>

          <SubHeading aside={P.completed ? `${(P.completed / days).toFixed(1)} a day` : undefined}>
            Tasks completed per day
          </SubHeading>
          {P.completed ? (
            <DailyColumns
              data={P.perDay}
              kind={cur.period.kind}
              today={today}
              color={SERIES_1}
              label="Completed"
              format={(n) => n.toLocaleString()}
              integer
              yWidth={28}
            />
          ) : (
            <p className="text-[13px] text-muted">No tasks completed {when(cur)}{cur.period.current ? ' yet' : ''}.</p>
          )}

          {P.byCategory.length === 1 && (
            <p className="mt-3 text-[13px] text-ink-2">
              All {plural(P.completed, 'completed task')} were in <span className="font-medium text-ink">{P.byCategory[0].label}</span>.
            </p>
          )}
          {P.byCategory.length > 1 && (
            <>
              <SubHeading>Completed by category</SubHeading>
              <HBarList
                color={SERIES_1}
                rows={P.byCategory.slice(0, 6).map((c) => ({
                  id: c.id,
                  label: c.label,
                  value: c.value,
                  display: c.value.toLocaleString(),
                  note: percent(c.value / P.completed),
                  tip: {
                    title: c.label,
                    rows: [
                      { label: 'Completed', value: c.value.toLocaleString(), color: SERIES_1 },
                      { label: 'Share', value: percent(c.value / P.completed) },
                    ],
                  },
                }))}
              />
            </>
          )}
        </>
      )}
    </Section>
  )
}

// ───────────────────────── Money ─────────────────────────

/** Top five categories; the tail folds into one "Other" row. */
function foldCategories(rows: ShareRow[], limit = 5): ShareRow[] {
  if (rows.length <= limit + 1) return rows
  const head = rows.slice(0, limit)
  const tail = rows.slice(limit)
  return [
    ...head,
    {
      id: '__other',
      label: `Other (${tail.length})`,
      value: tail.reduce((s, r) => s + r.value, 0),
      share: tail.reduce((s, r) => s + r.share, 0),
    },
  ]
}

export function MoneyCard({ cur, prev, vs, money, today, className }: SectionProps) {
  const M = cur.money
  const MP = prev.money
  const B = cur.budget
  const empty = !M.count && !B
  const days = M.perDay.filter((d) => d.value != null).length || 1
  const prevCats = new Map(MP.categories.map((c) => [c.id, c.value]))
  const link = `/money?month=${monthOf(cur.period.start)}`

  return (
    <Section title="Money" icon={Wallet} to={link} className={className}>
      {empty ? (
        <SectionEmpty
          icon={Wallet}
          title="No transactions"
          description={`Nothing was logged ${when(cur)}. Add income or spending to see where your money goes.`}
        />
      ) : (
        <>
          <StatGrid className="sm:grid-cols-4">
            <Stat
              label="Income"
              value={money(M.income)}
              hint={<MoneyDelta cur={M.income} prev={MP.income} vs={vs} money={money} />}
            />
            <Stat
              label="Expenses"
              value={money(M.expense)}
              hint={<MoneyDelta cur={M.expense} prev={MP.expense} good="down" vs={vs} money={money} />}
            />
            <Stat
              label="Net"
              value={signedMoney(money, M.net)}
              hint={
                <Delta
                  diff={M.count || MP.count ? M.net - MP.net : null}
                  format={(n) => signedMoney(money, n)}
                  vs={vs}
                  epsilon={0.005}
                />
              }
            />
            <Stat
              label="Savings rate"
              value={rate(M.savingsRate)}
              hint={
                M.savingsRate != null && MP.savingsRate != null
                  ? <Delta diff={M.savingsRate - MP.savingsRate} format={points} vs={vs} epsilon={0.005} />
                  : M.income ? undefined : 'No income logged'
              }
            />
          </StatGrid>

          <SubHeading aside={M.expense ? `${money(M.expense / days, { compact: true })} a day on average` : undefined}>
            Daily spending
          </SubHeading>
          {M.expense ? (
            <DailyColumns
              data={M.perDay}
              kind={cur.period.kind}
              today={today}
              color={SERIES_SPEND}
              label="Spent"
              format={(n) => money(n)}
              tick={(n) => money(n, { compact: true })}
              yWidth={52}
            />
          ) : (
            <p className="text-[13px] text-muted">No spending logged {when(cur)}.</p>
          )}

          {M.categories.length === 1 && (
            <p className="mt-3 text-[13px] text-ink-2">
              All spending went to <span className="font-medium text-ink">{M.categories[0].label}</span>.
            </p>
          )}
          {M.categories.length > 1 && (
            <>
              <SubHeading aside={`of ${money(M.expense)}`}>Top expense categories</SubHeading>
              <HBarList
                color={SERIES_SPEND}
                rows={foldCategories(M.categories).map((c): HBar => {
                  const before = prevCats.get(c.id)
                  return {
                    id: c.id,
                    label: c.label,
                    value: c.value,
                    display: money(c.value),
                    note: percent(c.share),
                    tip: {
                      title: c.label,
                      rows: [
                        { label: 'Spent', value: money(c.value), color: SERIES_SPEND },
                        { label: 'Share of spending', value: percent(c.share) },
                        ...(c.id !== '__other' ? [{ label: `vs ${vs}`, value: signedMoney(money, c.value - (before ?? 0)) }] : []),
                      ],
                    },
                  }
                })}
              />
            </>
          )}

          {B && (
            <>
              <SubHeading aside={`${B.onTrack} on track · ${B.over.length} over`}>Budget adherence</SubHeading>
              {cur.period.current && (
                <p className="-mt-1 mb-3 text-xs text-muted">{percent(B.elapsed)} of the month has passed.</p>
              )}
              <ul className="flex flex-col gap-3.5">
                {B.rows.slice(0, 6).map((r) => {
                  const over = r.spent - r.budget
                  return (
                    <li key={r.category.id}>
                      <div className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-ink-2">{r.category.name}</span>
                          {over > 0 && <Badge tone="bad">Over by {money(over)}</Badge>}
                        </span>
                        <span className="tabular shrink-0 text-ink">
                          {money(r.spent)} <span className="text-muted">/ {money(r.budget)}</span>
                        </span>
                      </div>
                      <Progress
                        className="mt-1.5"
                        value={r.ratio}
                        tone={budgetTone(r.ratio)}
                        label={`${r.category.name}: ${percent(r.ratio)} of budget`}
                      />
                    </li>
                  )
                })}
              </ul>
              {B.rows.length > 6 && (
                <p className="mt-3 text-xs text-muted">+{B.rows.length - 6} more in Budget</p>
              )}
            </>
          )}
        </>
      )}
    </Section>
  )
}

// ───────────────────────── Business ─────────────────────────

export function BusinessCard({ cur, prev, vs, money, className }: SectionProps) {
  const Bz = cur.business
  const BzP = prev.business
  const R = Bz.receivables
  return (
    <Section title="Business" icon={Briefcase} to="/business" className={className}>
      {!Bz.active ? (
        <SectionEmpty
          icon={Briefcase}
          title="No business activity"
          description={`No business income, expenses or invoices ${when(cur)}.`}
        />
      ) : (
        <StatGrid>
          <Stat
            label="Revenue"
            value={money(Bz.income)}
            hint={<MoneyDelta cur={Bz.income} prev={BzP.income} vs={vs} money={money} />}
          />
          <Stat
            label="Expenses"
            value={money(Bz.expenses)}
            hint={<MoneyDelta cur={Bz.expenses} prev={BzP.expenses} good="down" vs={vs} money={money} />}
          />
          <Stat
            label="Profit"
            value={signedMoney(money, Bz.profit)}
            hint={
              Bz.income || Bz.expenses || BzP.income || BzP.expenses
                ? <Delta diff={Bz.profit - BzP.profit} format={(n) => signedMoney(money, n)} vs={vs} epsilon={0.005} />
                : undefined
            }
          />
          <Stat
            label={`Invoices paid · ${Bz.paidCount}`}
            value={money(Bz.paidAmount)}
            hint={<MoneyDelta cur={Bz.paidAmount} prev={BzP.paidAmount} vs={vs} money={money} />}
          />
          <Stat
            label="Outstanding now"
            value={money(R.pending)}
            hint={
              R.overdueCount
                ? <span className="font-medium text-bad">{R.overdueCount} overdue · {money(R.overdue)}</span>
                : R.pendingCount ? plural(R.pendingCount, 'unpaid invoice') : 'All invoices paid'
            }
          />
          <Stat
            label="Top client"
            value={Bz.topClient?.name ?? '—'}
            hint={Bz.topClient ? money(Bz.topClient.amount) : 'No client revenue'}
          />
        </StatGrid>
      )}
    </Section>
  )
}

// ───────────────────────── Habits ─────────────────────────

export function HabitsCard({ cur, prev, vs, className }: SectionProps) {
  const H = cur.habits
  const HP = prev.habits
  const prevRate = new Map(HP.rows.map((r) => [r.id, r.rate]))
  return (
    <Section title="Habits" icon={Flame} to="/growth" className={className}>
      {!H.rows.length ? (
        <SectionEmpty
          icon={Flame}
          title="No habits to report"
          description={`None of your active habits were due ${when(cur)}. Add a habit in Goals & Habits to track consistency.`}
        />
      ) : (
        <>
          <StatGrid>
            <Stat
              label="Consistency"
              value={rate(H.overall)}
              hint={
                H.overall != null && HP.overall != null
                  ? <Delta diff={H.overall - HP.overall} format={points} vs={vs} epsilon={0.005} />
                  : `${H.done} of ${H.due} check-ins`
              }
            />
            <Stat
              label="Check-ins"
              value={H.done.toLocaleString()}
              hint={<Delta diff={H.done - HP.done} format={signed} vs={vs} />}
            />
            <Stat
              label="Longest current streak"
              value={H.best ? plural(H.best.count, H.best.unit) : '—'}
              hint={H.best ? `${H.best.emoji ? `${H.best.emoji} ` : ''}${H.best.name}` : 'Start one today'}
            />
          </StatGrid>
          <SubHeading aside="share of times due">By habit</SubHeading>
          <HBarList
            color={SERIES_1}
            max={1}
            rows={H.rows.map((r) => {
              const before = prevRate.get(r.id)
              return {
                id: r.id,
                label: `${r.emoji ? `${r.emoji} ` : ''}${r.name}`,
                value: r.rate,
                display: percent(r.rate),
                note: `${r.done}/${r.due}`,
                tip: {
                  title: r.name,
                  rows: [
                    { label: 'Done', value: `${r.done} of ${r.due}`, color: SERIES_1 },
                    ...(before != null ? [{ label: `vs ${vs}`, value: points(r.rate - before) }] : []),
                  ],
                },
              }
            })}
          />
        </>
      )}
    </Section>
  )
}

// ───────────────────────── Goals ─────────────────────────

function targetNote(g: GoalRow) {
  if (!g.targetDate || g.daysLeft == null) return null
  if (g.daysLeft < 0) return <span className="font-medium text-bad">{plural(-g.daysLeft, 'day')} past target</span>
  if (g.daysLeft === 0) return <span className="font-medium text-warn">Due today</span>
  return <>Due {fmt(g.targetDate, 'MMM d')} · in {plural(g.daysLeft, 'day')}</>
}

export function GoalsCard({ cur, prev, vs, className }: SectionProps) {
  const G = cur.goals
  const GP = prev.goals
  const next = G.upcoming[0]
  return (
    <Section title="Goals" icon={Target} to="/growth" className={className}>
      {!G.active.length && !G.completed.length ? (
        <SectionEmpty
          icon={Target}
          title="No goals yet"
          description="Set a personal goal in Goals & Habits and its progress will show up here."
        />
      ) : (
        <>
          <StatGrid>
            <Stat
              label="Completed"
              value={G.completed.length.toLocaleString()}
              hint={<Delta diff={G.completed.length - GP.completed.length} format={signed} vs={vs} />}
            />
            <Stat
              label="In progress"
              value={G.active.length.toLocaleString()}
              hint={
                G.overdue.length
                  ? <span className="font-medium text-bad">{G.overdue.length} past target</span>
                  : 'Active goals'
              }
            />
            <Stat
              label="Average progress"
              value={rate(G.avgProgress)}
              hint={next ? `Next target ${fmt(next.targetDate as string, 'MMM d')}` : 'No target dates'}
            />
          </StatGrid>

          {G.completed.length > 0 && (
            <>
              <SubHeading>Completed {when(cur)}</SubHeading>
              <ul className="flex flex-col">
                {G.completed.map((g) => (
                  <li key={g.id} className="flex min-h-9 items-center gap-2.5 text-sm">
                    <Trophy size={16} className="shrink-0 text-good" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-ink">{g.title}</span>
                    <span className="tabular shrink-0 text-xs text-muted">{fmt(g.date, 'MMM d')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {G.active.length > 0 && (
            <>
              <SubHeading aside="soonest target first">In progress</SubHeading>
              <ul className="flex flex-col gap-3.5">
                {G.active.slice(0, 5).map((g) => (
                  <li key={g.id}>
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate text-ink-2">{g.title}</span>
                      <span className="tabular shrink-0 font-medium text-ink">{percent(g.progress)}</span>
                    </div>
                    <Progress className="mt-1.5" value={g.progress} label={`${g.title}: ${percent(g.progress)}`} />
                    <p className="mt-1 truncate text-xs text-muted">
                      {LIFE_AREA_LABELS[g.area]}
                      {g.targetDate && <> · {targetNote(g)}</>}
                    </p>
                  </li>
                ))}
              </ul>
              {G.active.length > 5 && <p className="mt-3 text-xs text-muted">+{G.active.length - 5} more goals</p>}
            </>
          )}
        </>
      )}
    </Section>
  )
}

// ───────────────────────── Wellbeing ─────────────────────────

export function WellbeingCard({ cur, prev, vs, today, className }: SectionProps) {
  const W = cur.wellbeing
  const WP = prev.wellbeing
  const moodDays = W.perDay.filter((d) => d.mood != null).length
  return (
    <Section title="Wellbeing" icon={HeartPulse} to="/journal" className={className}>
      {!W.entries ? (
        <SectionEmpty
          icon={BookHeart}
          title="No journal entries"
          description={`No entries ${when(cur)}. Log your mood and energy in the Journal to see the trend here.`}
        />
      ) : (
        <>
          <StatGrid className="sm:grid-cols-4">
            <Stat
              label="Journal entries"
              value={`${W.entries}`}
              hint={<Delta diff={W.entries - WP.entries} format={signed} vs={vs} />}
            />
            <Stat
              label="Average mood"
              value={W.avgMood != null ? `${moodEmoji(W.avgMood)} ${score(W.avgMood)}` : '—'}
              hint={
                W.avgMood != null && WP.avgMood != null
                  ? <Delta diff={W.avgMood - WP.avgMood} format={(n) => signed(n, 1)} vs={vs} epsilon={0.05} />
                  : W.avgMood != null ? 'out of 5' : 'No moods logged'
              }
            />
            <Stat
              label="Average energy"
              value={W.avgEnergy != null ? `${energyEmoji(W.avgEnergy)} ${score(W.avgEnergy)}` : '—'}
              hint={
                W.avgEnergy != null && WP.avgEnergy != null
                  ? <Delta diff={W.avgEnergy - WP.avgEnergy} format={(n) => signed(n, 1)} vs={vs} epsilon={0.05} />
                  : W.avgEnergy != null ? 'out of 5' : 'No energy logged'
              }
            />
            <Stat
              label="Gratitude notes"
              value={W.gratitude.toLocaleString()}
              hint={<Delta diff={W.gratitude - WP.gratitude} format={signed} vs={vs} />}
            />
          </StatGrid>
          <SubHeading aside={`${moodDays} of ${plural(W.days, 'day')} logged`}>Mood per day</SubHeading>
          {moodDays ? (
            <MoodLine data={W.perDay} kind={cur.period.kind} today={today} />
          ) : (
            <p className="text-[13px] text-muted">Add a mood to your journal entries to see the trend.</p>
          )}
        </>
      )}
    </Section>
  )
}
