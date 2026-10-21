import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Backpack, BookHeart, Bot, Briefcase, ChartColumn, NotebookPen, Search, Settings, Target, type LucideIcon,
} from 'lucide-react'
import { cn, PageHeader } from '@/components/ui'
import { receivables } from '@/lib/business'
import { todayISO } from '@/lib/dates'
import { doneOn, isDueToday } from '@/lib/habits'
import { upcomingDates } from '@/lib/lifeDates'
import { useStore } from '@/lib/store'

interface Tile {
  to: string
  title: string
  icon: LucideIcon
  tone: string
  hint: string
  alert?: boolean
}

/** Phone launcher for everything that doesn't fit in the tab bar. */
export function MorePage() {
  const habits = useStore((s) => s.habits)
  const invoices = useStore((s) => s.invoices)
  const dates = useStore((s) => s.importantDates)
  const journal = useStore((s) => s.journal)
  const notes = useStore((s) => s.notes)
  const lists = useStore((s) => s.lists)
  const weekStartsOn = useStore((s) => s.settings.weekStartsOn)
  const assistantOn = useStore((s) => s.settings.assistant.enabled && !!s.settings.assistant.apiKey)

  const tiles = useMemo(() => {
    const today = todayISO()
    const due = habits.filter((h) => isDueToday(h, today, weekStartsOn))
    const left = due.filter((h) => !doneOn(h, today)).length
    const r = receivables(invoices, today)
    const next = upcomingDates(dates, 30)[0]
    const wroteToday = journal.some((j) => j.date === today)
    const openItems = lists.reduce((s, l) => s + l.items.filter((i) => !i.done).length, 0)

    const daily: Tile[] = [
      { to: `/journal/${today}`, title: 'Journal', icon: BookHeart, tone: '#d6409f', hint: wroteToday ? 'Today’s entry written' : 'Reflect on today' },
      { to: '/notes', title: 'Notes', icon: NotebookPen, tone: '#e2a336', hint: `${notes.filter((n) => !n.archived).length} notes` },
    ]
    const grow: Tile[] = [
      {
        to: '/growth', title: 'Goals & Habits', icon: Target, tone: '#30a46c',
        hint: due.length ? (left ? `${left} habit${left === 1 ? '' : 's'} left today` : 'All habits done today') : 'Build routines, reach goals',
      },
      {
        to: '/life', title: 'Life organizer', icon: Backpack, tone: '#12a594',
        hint: next ? `${next.item.title} ${next.daysUntil === 0 ? 'today' : `in ${next.daysUntil} d`}` : openItems ? `${openItems} items on lists` : 'Lists, dates, documents',
        alert: next?.daysUntil === 0,
      },
      {
        to: '/business', title: 'Business', icon: Briefcase, tone: '#5b5bd6',
        hint: r.overdueCount ? `${r.overdueCount} invoice${r.overdueCount === 1 ? '' : 's'} overdue` : r.pendingCount ? `${r.pendingCount} awaiting payment` : 'Clients, projects, invoices',
        alert: r.overdueCount > 0,
      },
      { to: '/reports', title: 'Reports', icon: ChartColumn, tone: '#0090ff', hint: 'Weekly & monthly insights' },
      { to: '/assistant', title: 'Assistant', icon: Bot, tone: '#8e4ec6', hint: assistantOn ? 'Ask about your day & money' : 'Optional AI helper' },
    ]
    const app: Tile[] = [
      { to: '/search', title: 'Search', icon: Search, tone: '#71717f', hint: 'Find anything' },
      { to: '/settings', title: 'Settings', icon: Settings, tone: '#71717f', hint: 'Preferences, privacy, backup' },
    ]
    return { daily, grow, app }
  }, [habits, invoices, dates, journal, notes, lists, weekStartsOn, assistantOn])

  return (
    <>
      <PageHeader title="More" subtitle="Everything in Orbit" />
      <div className="flex flex-col gap-6">
        <TileGroup title="Daily" tiles={tiles.daily} />
        <TileGroup title="Plan & grow" tiles={tiles.grow} />
        <TileGroup title="App" tiles={tiles.app} />
      </div>
    </>
  )
}

function TileGroup({ title, tiles }: { title: string; tiles: Tile[] }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-line bg-surface p-3.5 shadow-card transition-colors active:bg-surface-2 hover:border-line-strong"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in srgb, ${t.tone} 14%, transparent)`, color: t.tone }}
            >
              <t.icon size={20} />
            </span>
            <span className="mt-3 block">
              <span className="block text-[15px] font-semibold tracking-tight text-ink">{t.title}</span>
              <span className={cn('mt-0.5 block truncate text-xs', t.alert ? 'text-bad' : 'text-muted')}>{t.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
