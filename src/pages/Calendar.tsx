import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookHeart, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Plus } from 'lucide-react'
import { Button, Chip, IconButton, PageHeader, Segmented, type SegmentOption } from '@/components/ui'
import { isValidISO, monthOf, todayISO } from '@/lib/dates'
import { useStore } from '@/lib/store'
import { openEditor } from '@/lib/ui'
import type { ISODate } from '@/lib/types'
import { useCalendarData, useLayers, useMediaQuery } from './calendar/hooks'
import {
  type CalView, type LayerKey, parseView, PERIOD_UNIT, periodLabel, rangeFor, shiftDate, summarize,
} from './calendar/lib'
import { MonthView } from './calendar/MonthView'
import { AgendaView, DayView, WeekView } from './calendar/Views'

const VIEW_OPTIONS: SegmentOption<CalView>[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
  { value: 'agenda', label: 'Agenda' },
]

const LAYER_CHIPS: { key: LayerKey; label: string; icon: typeof CalendarDays }[] = [
  { key: 'events', label: 'Events', icon: CalendarDays },
  { key: 'tasks', label: 'Tasks', icon: CheckCircle2 },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'journal', label: 'Journal', icon: BookHeart },
]

export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const [layers, toggleLayer] = useLayers()
  // Chip icons only where there's room; phones keep the four filters on one line.
  const roomy = useMediaQuery('(min-width: 640px)')

  const today = todayISO()
  const view = parseView(params.get('view'))
  const rawDate = params.get('date') ?? undefined
  const date: ISODate = isValidISO(rawDate) ? rawDate : today

  /** Update ?view & ?date. View switches push history; date moves replace it. */
  const go = useCallback(
    (next: { view?: CalView; date?: ISODate }) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('view', next.view ?? parseView(prev.get('view')))
          const prevDate = prev.get('date') ?? undefined
          p.set('date', next.date ?? (isValidISO(prevDate) ? prevDate : todayISO()))
          return p
        },
        { replace: !next.view },
      )
    },
    [setParams],
  )
  const selectDate = useCallback((d: ISODate) => go({ date: d }), [go])
  const openDay = useCallback((d: ISODate) => go({ view: 'day', date: d }), [go])

  const [start, end] = useMemo(() => rangeFor(view, date, weekStartsOn), [view, date, weekStartsOn])
  const { agenda, notesByDate } = useCalendarData(start, end, layers)
  const subtitle = useMemo(
    () => summarize(agenda, layers, view === 'month' ? monthOf(date) : undefined),
    [agenda, layers, view, date],
  )
  const label = periodLabel(view, date, weekStartsOn)
  const unit = PERIOD_UNIT[view]

  const viewProps = { date, today, agenda, notesByDate, layers, onOpenDay: openDay }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={subtitle}
        actions={
          <Button
            variant="primary"
            icon={Plus}
            aria-label="New event"
            onClick={() => openEditor({ kind: 'event', initial: { date } })}
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New event</span>
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <IconButton
                icon={ChevronLeft}
                variant="secondary"
                label={view === 'agenda' ? 'Previous 30 days' : `Previous ${unit}`}
                onClick={() => go({ date: shiftDate(view, date, -1) })}
              />
              <Button onClick={() => go({ date: today })} aria-label="Go to today">
                Today
              </Button>
              <IconButton
                icon={ChevronRight}
                variant="secondary"
                label={view === 'agenda' ? 'Next 30 days' : `Next ${unit}`}
                onClick={() => go({ date: shiftDate(view, date, 1) })}
              />
              <h2 className="ml-1.5 min-w-0 truncate text-[17px] font-semibold tracking-tight text-ink" aria-live="polite">
                {label}
              </h2>
            </div>
            <Segmented
              options={VIEW_OPTIONS}
              value={view}
              onChange={(v) => go({ view: v })}
              block
              className="sm:w-auto"
            />
          </div>
          <div
            role="group"
            aria-label="Show on calendar"
            className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5 scrollbar-none"
          >
            {LAYER_CHIPS.map((c) => (
              <Chip key={c.key} icon={roomy ? c.icon : undefined} active={layers[c.key]} onClick={() => toggleLayer(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
      </PageHeader>

      {view === 'month' && (
        <MonthView {...viewProps} weekStartsOn={weekStartsOn} onSelect={selectDate} />
      )}
      {view === 'week' && <WeekView {...viewProps} weekStartsOn={weekStartsOn} />}
      {view === 'day' && <DayView {...viewProps} />}
      {view === 'agenda' && <AgendaView {...viewProps} />}
    </>
  )
}
