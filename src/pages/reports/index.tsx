// Reports & Insights: read-only weekly / monthly analytics across the whole app.
// URL state: ?period=week|month&date=YYYY-MM-DD (any day inside the period).
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Share } from 'lucide-react'
import { Button, IconButton, PageHeader, Segmented } from '@/components/ui'
import { isValidISO, todayISO } from '@/lib/dates'
import { useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import { buildHighlights } from './highlights'
import {
  buildReport, compareLabels, fmtRange, hasNext, makePeriod, previousPeriod, periodTitle, shiftPeriod,
  type Period, type PeriodKind, type ReportSource,
} from './metrics'
import {
  BusinessCard, GoalsCard, HabitsCard, HighlightsCard, MoneyCard, ProductivityCard, WellbeingCard,
} from './sections'
import { reportFilename, reportMarkdown, shareReport } from './share'

const PERIOD_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

function usePeriodParam(weekStartsOn: 0 | 1, today: string) {
  const [params, setParams] = useSearchParams()
  const kind: PeriodKind = params.get('period') === 'month' ? 'month' : 'week'
  const raw = params.get('date')
  const anchor = raw && isValidISO(raw) ? raw : today
  const period = useMemo(() => makePeriod(kind, anchor, weekStartsOn, today), [kind, anchor, weekStartsOn, today])
  const go = useCallback(
    (p: Period) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('period', p.kind)
          next.set('date', p.start)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  return [period, go] as const
}

export function ReportsPage() {
  const today = todayISO()
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const [period, go] = usePeriodParam(weekStartsOn, today)

  const tasks = useStore((s) => s.tasks)
  const taskCategories = useStore((s) => s.taskCategories)
  const events = useStore((s) => s.events)
  const journal = useStore((s) => s.journal)
  const transactions = useStore((s) => s.transactions)
  const financeCategories = useStore((s) => s.financeCategories)
  const budgets = useStore((s) => s.budgets)
  const habits = useStore((s) => s.habits)
  const lifeGoals = useStore((s) => s.lifeGoals)
  const invoices = useStore((s) => s.invoices)
  const clients = useStore((s) => s.clients)
  const projects = useStore((s) => s.projects)
  const money = useMoney()

  const src = useMemo<ReportSource>(
    () => ({
      tasks, taskCategories, events, journal, transactions, financeCategories, budgets,
      habits, lifeGoals, invoices, clients, projects,
    }),
    [tasks, taskCategories, events, journal, transactions, financeCategories, budgets, habits, lifeGoals, invoices, clients, projects],
  )

  const prevPeriod = useMemo(() => previousPeriod(period), [period])
  const cur = useMemo(() => buildReport(src, period, weekStartsOn, today), [src, period, weekStartsOn, today])
  const prev = useMemo(() => buildReport(src, prevPeriod, weekStartsOn, today), [src, prevPeriod, weekStartsOn, today])
  const labels = useMemo(() => compareLabels(period), [period])
  const highlights = useMemo(() => buildHighlights(cur, prev, { money, labels }), [cur, prev, money, labels])

  const [sharing, setSharing] = useState(false)
  const share = async () => {
    if (sharing) return
    setSharing(true)
    try {
      const md = reportMarkdown(cur, prev, highlights, { money, labels, today })
      const result = await shareReport(md, reportFilename(cur))
      if (result === 'downloaded') toast('Report saved')
    } catch {
      toast('Couldn’t share the report', { tone: 'error' })
    } finally {
      setSharing(false)
    }
  }

  const unit = period.kind
  const rangeText = `${fmtRange(period.start, period.to, today)}${period.current ? ' so far' : ''}`
  const compareText = fmtRange(prevPeriod.start, prevPeriod.to, today)
  const props = { cur, prev, vs: labels.short, money, today }

  return (
    <div>
      <PageHeader
        title="Reports"
        actions={
          <IconButton icon={Share} label="Share report" variant="secondary" onClick={share} disabled={sharing} />
        }
      >
        <div className="flex items-center justify-between gap-2">
          <Segmented
            options={PERIOD_OPTIONS}
            value={unit}
            onChange={(k) => go(makePeriod(k, period.to, weekStartsOn, today))}
          />
          <div className="flex min-w-0 items-center">
            <IconButton
              icon={ChevronLeft}
              label={`Previous ${unit}`}
              onClick={() => go(shiftPeriod(period, -1, weekStartsOn, today))}
            />
            <button
              type="button"
              onClick={() => go(makePeriod(unit, today, weekStartsOn, today))}
              disabled={period.current}
              title={period.current ? undefined : `Back to this ${unit}`}
              className="h-10 min-w-0 truncate rounded-xl px-1.5 text-center text-sm font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent sm:min-w-32"
            >
              {periodTitle(period, today)}
            </button>
            <IconButton
              icon={ChevronRight}
              label={`Next ${unit}`}
              disabled={!hasNext(period)}
              onClick={() => go(shiftPeriod(period, 1, weekStartsOn, today))}
            />
          </div>
        </div>
        <p className="mt-2 text-[13px] text-muted">
          <span className="tabular text-ink-2">{rangeText}</span> · compared with <span className="tabular">{compareText}</span>
        </p>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <HighlightsCard items={highlights} className="lg:col-span-2" />
        <ProductivityCard {...props} />
        <MoneyCard {...props} />
        <BusinessCard {...props} />
        <HabitsCard {...props} />
        <GoalsCard {...props} />
        <WellbeingCard {...props} />
      </div>

      <Button block size="lg" icon={Share} className="mt-6" onClick={share} disabled={sharing}>
        Share report
      </Button>
    </div>
  )
}
