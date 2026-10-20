// Month grid where each day is shaded by mood (single-hue ordinal ramp of the accent).
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardHeader, cn, IconButton } from '@/components/ui'
import { fmt, fmtMonth, monthGrid, monthOf, shiftMonth } from '@/lib/dates'
import { MOOD_EMOJI, MOOD_LABELS } from '@/lib/defaults'
import { useStore } from '@/lib/store'
import type { ISODate, JournalEntry, Mood } from '@/lib/types'
import { MOODS, moodFill } from './insights'

export function MoodCalendar({
  byDate, selected, today, onSelect,
}: {
  byDate: Map<ISODate, JournalEntry>
  selected: ISODate
  today: ISODate
  onSelect: (date: ISODate) => void
}) {
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const [month, setMonth] = useState(() => monthOf(selected))
  const thisMonth = monthOf(today)

  // Follow the selected date when it moves to another month.
  useEffect(() => setMonth(monthOf(selected)), [selected])

  const weeks = useMemo(() => {
    const days = monthGrid(month, weekStartsOn)
    const rows: ISODate[][] = []
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))
    return rows.filter((r) => r.some((d) => monthOf(d) === month))
  }, [month, weekStartsOn])

  const logged = useMemo(
    () => weeks.flat().filter((d) => monthOf(d) === month && byDate.has(d)).length,
    [weeks, month, byDate],
  )

  return (
    <Card>
      <CardHeader
        title={fmtMonth(month)}
        subtitle={`${logged} ${logged === 1 ? 'entry' : 'entries'}`}
        action={
          <div className="-mr-2 -mt-1 flex">
            <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))} />
            <IconButton
              icon={ChevronRight}
              label="Next month"
              disabled={month >= thisMonth}
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
            />
          </div>
        }
      />

      <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Moods in ${fmtMonth(month)}`}>
        {weeks[0]?.map((d) => (
          <div key={`h-${d}`} aria-hidden className="pb-1 text-center text-[11px] font-medium text-muted">
            {fmt(d, 'EEEEE')}
          </div>
        ))}
        {weeks.flat().map((d) => {
          if (monthOf(d) !== month) return <div key={d} aria-hidden />
          const entry = byDate.get(d)
          const mood = entry?.mood as Mood | undefined
          const future = d > today
          const isSelected = d === selected
          const dark = mood != null && mood >= 4
          const label =
            fmt(d, 'EEEE, MMMM d') +
            (mood ? `, ${MOOD_LABELS[mood]}` : entry ? ', entry without mood' : future ? '' : ', no entry')
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              aria-label={label}
              aria-current={isSelected ? 'date' : undefined}
              onClick={() => onSelect(d)}
              style={mood ? { background: moodFill(mood) } : undefined}
              className={cn(
                'relative flex aspect-square min-h-10 items-center justify-center rounded-lg text-[13px] tabular transition',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                !mood && 'bg-surface-2',
                future ? 'text-muted/60' : dark ? 'font-medium text-white' : 'text-ink-2',
                isSelected
                  ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface'
                  : !future && 'hover:ring-1 hover:ring-line-strong',
                d === today && 'font-bold',
              )}
            >
              {Number(d.slice(8, 10))}
              {entry && !mood && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] bg-surface-2 ring-1 ring-inset ring-line" aria-hidden />
          No mood
        </span>
        <span className="inline-flex items-center gap-1.5" aria-label="Mood scale from Awful to Great">
          <span aria-hidden>{MOOD_EMOJI[1]}</span>
          {MOODS.map((m) => (
            <span
              key={m}
              title={MOOD_LABELS[m]}
              className="h-3 w-3 rounded-[4px]"
              style={{ background: moodFill(m) }}
              aria-hidden
            />
          ))}
          <span aria-hidden>{MOOD_EMOJI[5]}</span>
        </span>
      </div>
    </Card>
  )
}
