// Week, Day and Agenda views (Month lives in MonthView.tsx).
import { useMemo } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { Button, Card, EmptyState } from '@/components/ui'
import type { DayAgenda } from '@/lib/agenda'
import { weekRange } from '@/lib/dates'
import type { ISODate, Note } from '@/lib/types'
import { addEventOn, DayGroup, DayPanel } from './DayBlocks'
import { useMediaQuery } from './hooks'
import { isDayEmpty, type Layers } from './lib'
import { TimeGrid } from './TimeGrid'

interface ViewProps {
  date: ISODate
  today: ISODate
  agenda: Map<ISODate, DayAgenda>
  notesByDate: Map<ISODate, Note[]>
  layers: Layers
  onOpenDay: (date: ISODate) => void
}

export function WeekView({ date, today, agenda, notesByDate, weekStartsOn, onOpenDay }: ViewProps & { weekStartsOn: 0 | 1 }) {
  const days = useMemo(() => weekRange(date, weekStartsOn), [date, weekStartsOn])
  const wide = useMediaQuery('(min-width: 768px)')

  if (wide) {
    return <TimeGrid days={days} agenda={agenda} header allDayRow onOpenDay={onOpenDay} hourHeight={48} />
  }
  // Phones: the week as a vertical agenda, one section per day.
  return (
    <Card padded={false} className="divide-y divide-line">
      {days.map((d) => (
        <DayGroup
          key={d}
          date={d}
          day={agenda.get(d)}
          notes={notesByDate.get(d)}
          today={today}
          showEmpty
          onOpenDay={onOpenDay}
        />
      ))}
    </Card>
  )
}

export function DayView({ date, agenda, notesByDate, layers }: ViewProps) {
  const days = useMemo(() => [date], [date])
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <TimeGrid days={days} agenda={agenda} hourHeight={56} />
      <DayPanel
        date={date}
        day={agenda.get(date)}
        notes={notesByDate.get(date)}
        includeTimed={false}
        journalPlaceholder={layers.journal}
        className="lg:sticky lg:top-8"
      />
    </div>
  )
}

export function AgendaView({ date, today, agenda, notesByDate, onOpenDay }: ViewProps) {
  const days = useMemo(
    () => [...agenda.values()].filter((d) => !isDayEmpty(d, notesByDate.get(d.date))),
    [agenda, notesByDate],
  )

  if (!days.length) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          title="Nothing in the next 30 days"
          description="Events, tasks with due dates, planned payments and journal entries will show up here."
          action={
            <Button variant="primary" icon={Plus} onClick={() => addEventOn(date)}>
              New event
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <Card padded={false} className="divide-y divide-line">
      {days.map((d) => (
        <DayGroup
          key={d.date}
          date={d.date}
          day={d}
          notes={notesByDate.get(d.date)}
          today={today}
          onOpenDay={onOpenDay}
        />
      ))}
    </Card>
  )
}
