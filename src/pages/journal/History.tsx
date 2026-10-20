// The "History" side of the journal: stats, mood trend, month calendar,
// "On this day", and a searchable list of past entries.
import { useMemo, useState, type ReactNode } from 'react'
import { BookHeart, Heart, History as HistoryIcon, PenLine, Search, X } from 'lucide-react'
import { Button, Card, CardHeader, cn, EmptyState, Input, Stat } from '@/components/ui'
import { fmt, fmtMonth, monthOf } from '@/lib/dates'
import { MOOD_EMOJI, MOOD_LABELS } from '@/lib/defaults'
import { useStore } from '@/lib/store'
import type { ISODate, JournalEntry, Mood, MonthKey } from '@/lib/types'
import {
  averageMood, currentStreak, entryPreview, matchesQuery, MOODS, moodSeries, onThisDay,
} from './insights'
import { MoodCalendar } from './MoodCalendar'
import { MoodTrend } from './MoodTrend'

const PAGE = 40

export function History({
  selected, today, visible, onSelect, onStartWriting,
}: {
  selected: ISODate
  today: ISODate
  /** False while hidden behind the Write tab on phones (the chart is not drawn then). */
  visible: boolean
  onSelect: (date: ISODate) => void
  onStartWriting: () => void
}) {
  const journal = useStore((s) => s.journal)

  const sorted = useMemo(() => [...journal].sort((a, b) => b.date.localeCompare(a.date)), [journal])
  const byDate = useMemo(() => new Map(journal.map((e) => [e.date, e])), [journal])

  if (!journal.length) {
    return (
      <Card>
        <EmptyState
          icon={BookHeart}
          title="Your journal starts here"
          description="Pick a mood or answer today's prompt. Every entry you write collects here, so you can look back on it."
          action={
            <span className="lg:hidden">
              <Button variant="primary" icon={PenLine} onClick={onStartWriting}>
                Start writing
              </Button>
            </span>
          }
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <StatsCard byDate={byDate} today={today} />
      <TrendCard byDate={byDate} today={today} visible={visible} />
      <MoodCalendar byDate={byDate} selected={selected} today={today} onSelect={onSelect} />
      <OnThisDayCard journal={journal} selected={selected} onSelect={onSelect} />
      <EntriesCard entries={sorted} selected={selected} onSelect={onSelect} />
    </div>
  )
}

// ───────────────────────── Stats ─────────────────────────

function StatsCard({ byDate, today }: { byDate: Map<ISODate, JournalEntry>; today: ISODate }) {
  const stats = useMemo(() => {
    const dates = new Set(byDate.keys())
    const month = monthOf(today)
    let thisMonth = 0
    for (const d of dates) if (monthOf(d) === month && d <= today) thisMonth += 1
    return {
      streak: currentStreak(dates, today),
      wroteToday: dates.has(today),
      thisMonth,
      avg: averageMood(moodSeries(byDate, today, 30)),
      total: dates.size,
    }
  }, [byDate, today])

  const avgMood = stats.avg != null ? (Math.round(stats.avg) as Mood) : null

  return (
    <Card>
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-2">
        <Stat
          label="Current streak"
          value={`${stats.streak} ${stats.streak === 1 ? 'day' : 'days'}`}
          hint={
            stats.streak === 0
              ? 'Write today to start one'
              : stats.wroteToday
                ? 'Including today'
                : 'Write today to keep it'
          }
        />
        <Stat label="This month" value={stats.thisMonth} hint={fmtMonth(monthOf(today), 'MMMM')} />
        <Stat
          label="Average mood"
          value={
            stats.avg != null && avgMood ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>{MOOD_EMOJI[avgMood]}</span>
                <span className="tabular">{stats.avg.toFixed(1)}</span>
              </span>
            ) : (
              '—'
            )
          }
          hint={avgMood ? `${MOOD_LABELS[avgMood]} · last 30 days` : 'Last 30 days'}
        />
        <Stat label="Total entries" value={stats.total} hint="All time" />
      </div>
    </Card>
  )
}

function TrendCard({
  byDate, today, visible,
}: { byDate: Map<ISODate, JournalEntry>; today: ISODate; visible: boolean }) {
  const points = useMemo(() => moodSeries(byDate, today, 30), [byDate, today])
  const any = points.some((p) => p.mood != null)
  return (
    <Card>
      <CardHeader title="Mood trend" subtitle="Last 30 days" />
      {any ? (
        visible ? <MoodTrend points={points} /> : <div className="h-44" />
      ) : (
        <EmptyState compact title="No moods yet" description="Pick a mood when you write and your trend appears here." />
      )}
    </Card>
  )
}

// ───────────────────────── On this day ─────────────────────────

function OnThisDayCard({
  journal, selected, onSelect,
}: { journal: JournalEntry[]; selected: ISODate; onSelect: (d: ISODate) => void }) {
  const past = useMemo(() => onThisDay(journal, selected), [journal, selected])
  if (!past.length) return null
  return (
    <Card>
      <CardHeader title="On this day" icon={HistoryIcon} subtitle={`Earlier entries from the ${fmt(selected, 'do')}`} />
      <div className="-mx-2 flex flex-col">
        {past.map(({ entry, label }) => (
          <EntryRow key={entry.id} entry={entry} onSelect={onSelect} kicker={label} />
        ))}
      </div>
    </Card>
  )
}

// ───────────────────────── Entries ─────────────────────────

function EntriesCard({
  entries, selected, onSelect,
}: { entries: JournalEntry[]; selected: ISODate; onSelect: (d: ISODate) => void }) {
  const [query, setQuery] = useState('')
  const [mood, setMood] = useState<Mood | null>(null)
  const [limit, setLimit] = useState(PAGE)

  const filtered = useMemo(
    () => entries.filter((e) => (mood == null || e.mood === mood) && matchesQuery(e, query)),
    [entries, mood, query],
  )
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit])
  const groups = useMemo(() => {
    const out: { month: MonthKey; items: JournalEntry[] }[] = []
    for (const e of visible) {
      const m = monthOf(e.date)
      const last = out[out.length - 1]
      if (last && last.month === m) last.items.push(e)
      else out.push({ month: m, items: [e] })
    }
    return out
  }, [visible])
  const filtering = Boolean(query.trim()) || mood != null

  return (
    <Card>
      <CardHeader
        title="Entries"
        subtitle={filtering ? `${filtered.length} of ${entries.length} match` : `${entries.length} in total`}
      />

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE)
          }}
          placeholder="Search entries, gratitude, tags…"
          aria-label="Search journal"
          className="appearance-none pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('')
              setLimit(PAGE)
            }}
            className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by mood">
        <FilterChip active={mood == null} onClick={() => setMood(null)}>
          All
        </FilterChip>
        {MOODS.map((m) => (
          <FilterChip
            key={m}
            active={mood === m}
            label={`Only ${MOOD_LABELS[m]}`}
            onClick={() => {
              setMood(mood === m ? null : m)
              setLimit(PAGE)
            }}
          >
            <span className="text-base leading-none">{MOOD_EMOJI[m]}</span>
          </FilterChip>
        ))}
      </div>

      <div className="mt-4">
        {groups.length === 0 ? (
          <EmptyState
            compact
            icon={Search}
            title="No matching entries"
            description="Try another word or clear the mood filter."
          />
        ) : (
          groups.map((g) => (
            <section key={g.month} className="mb-3 last:mb-0">
              <h4 className="mb-1 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider text-muted">
                {fmtMonth(g.month)}
                <span className="tabular font-normal normal-case tracking-normal">{g.items.length}</span>
              </h4>
              <div className="-mx-2 flex flex-col">
                {g.items.map((e) => (
                  <EntryRow key={e.id} entry={e} active={e.date === selected} onSelect={onSelect} />
                ))}
              </div>
            </section>
          ))
        )}
        {filtered.length > visible.length && (
          <Button variant="ghost" block className="mt-2" onClick={() => setLimit((l) => l + PAGE)}>
            Show older entries
          </Button>
        )}
      </div>
    </Card>
  )
}

function EntryRow({
  entry, active, onSelect, kicker,
}: {
  entry: JournalEntry
  active?: boolean
  onSelect: (d: ISODate) => void
  /** Small label above the preview (e.g. "1 year ago"). */
  kicker?: string
}) {
  const preview = entryPreview(entry)
  const grateful = entry.gratitude.filter((g) => g.trim()).length
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.date)}
      aria-current={active ? 'date' : undefined}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors',
        active ? 'bg-accent-soft' : 'hover:bg-surface-2',
      )}
    >
      <div className="w-10 shrink-0 pt-0.5 text-center">
        <div className={cn('text-[11px] font-medium uppercase', active ? 'text-accent-text' : 'text-muted')}>
          {fmt(entry.date, 'EEE')}
        </div>
        <div className="tabular text-lg font-semibold leading-tight text-ink">{fmt(entry.date, 'd')}</div>
      </div>
      <div className="min-w-0 flex-1">
        {kicker && (
          <p className="text-xs text-muted">
            {kicker} · {fmt(entry.date, 'MMM d, yyyy')}
          </p>
        )}
        <p className={cn('line-clamp-2 text-sm leading-snug', preview ? 'text-ink-2' : 'italic text-muted')}>
          {preview || (entry.mood ? `Feeling ${MOOD_LABELS[entry.mood].toLowerCase()}` : 'No words yet')}
        </p>
        {(grateful > 0 || entry.tags.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {grateful > 0 && (
              <span className="inline-flex items-center gap-1">
                <Heart size={12} /> {grateful}
              </span>
            )}
            {entry.tags.slice(0, 3).map((t) => (
              <span key={t} className="max-w-28 truncate">
                #{t}
              </span>
            ))}
            {entry.tags.length > 3 && <span>+{entry.tags.length - 3}</span>}
          </div>
        )}
      </div>
      {entry.mood && (
        <span className="shrink-0 pt-0.5 text-xl leading-none" role="img" aria-label={MOOD_LABELS[entry.mood]}>
          {MOOD_EMOJI[entry.mood]}
        </span>
      )}
    </button>
  )
}

/** Filter pill matching the kit Chip look, with a 40px tap target on phones. */
function FilterChip({
  active, onClick, children, label,
}: { active: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border px-3 text-[13px] font-medium transition-colors sm:h-8 sm:min-w-8',
        active
          ? 'border-transparent bg-ink text-bg'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
