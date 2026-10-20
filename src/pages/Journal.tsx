import { useCallback, useState, useSyncExternalStore } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CalendarDays, Check, History as HistoryIcon, PenLine, Trash2 } from 'lucide-react'
import { cn, Menu, PageHeader, Segmented, type MenuItem } from '@/components/ui'
import { fmt, isValidISO, relativeDay, todayISO } from '@/lib/dates'
import { useStore } from '@/lib/store'
import { confirm, removeWithUndo } from '@/lib/ui'
import type { ISODate } from '@/lib/types'
import { EntryEditor } from './journal/EntryEditor'
import { History } from './journal/History'

type Tab = 'write' | 'history'

const DESKTOP = '(min-width: 1024px)'

function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const isDesktopNow = () => window.matchMedia(DESKTOP).matches

/** True at the lg breakpoint, where both columns are visible. */
function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, isDesktopNow)
}

export function JournalPage() {
  const params = useParams<{ date?: string }>()
  const [search, setSearch] = useSearchParams()
  const navigate = useNavigate()
  const [dirty, setDirty] = useState(false)
  const isDesktop = useIsDesktop()

  const today = todayISO()
  const date: ISODate = isValidISO(params.date) ? params.date : today
  const tab: Tab = search.get('tab') === 'history' ? 'history' : 'write'
  const hasEntry = useStore((s) => s.journal.some((j) => j.date === date))

  const go = useCallback(
    (d: ISODate, opts: { replace?: boolean } = {}) => navigate(`/journal/${d}`, { replace: opts.replace }),
    [navigate],
  )
  const goReplace = useCallback((d: ISODate) => go(d, { replace: true }), [go])

  if (params.date !== undefined && !isValidISO(params.date)) return <Navigate to="/journal" replace />

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(search)
    if (t === 'history') next.set('tab', 'history')
    else next.delete('tab')
    setSearch(next, { replace: true })
  }

  const deleteEntry = async () => {
    const ok = await confirm({
      title: 'Delete this entry?',
      message: `Your journal entry for ${fmt(date, 'MMMM d, yyyy')} will be removed.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const entry = useStore.getState().journal.find((j) => j.date === date)
    if (entry) removeWithUndo('journal', entry.id, 'Entry deleted')
  }

  const rel = relativeDay(date)
  const full = fmt(date, 'EEEE, MMMM d, yyyy')
  const subtitle = ['Today', 'Yesterday', 'Tomorrow'].includes(rel) ? `${rel} · ${full}` : full

  const menu: MenuItem[] = [
    {
      label: 'Open day in Calendar',
      icon: CalendarDays,
      onClick: () => navigate(`/calendar?view=day&date=${date}`),
    },
  ]
  if (hasEntry) menu.push({ label: 'Delete entry', icon: Trash2, danger: true, onClick: () => void deleteEntry() })

  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle={subtitle}
        actions={
          <>
            <SaveStatus dirty={dirty} saved={hasEntry} />
            <Menu items={menu} label="Entry actions" />
          </>
        }
      />

      <div className="mb-4 lg:hidden">
        <Segmented<Tab>
          block
          value={tab}
          onChange={setTab}
          options={[
            { value: 'write', label: 'Write', icon: PenLine },
            { value: 'history', label: 'History', icon: HistoryIcon },
          ]}
        />
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <section aria-label="Entry" className={cn(tab !== 'write' && 'hidden lg:block')}>
          <EntryEditor key={date} date={date} today={today} onNavigate={goReplace} onDirtyChange={setDirty} />
        </section>
        <section aria-label="History and insights" className={cn(tab !== 'history' && 'hidden lg:block')}>
          <History
            selected={date}
            today={today}
            visible={isDesktop || tab === 'history'}
            onSelect={(d) => go(d)}
            onStartWriting={() => setTab('write')}
          />
        </section>
      </div>
    </div>
  )
}

function SaveStatus({ dirty, saved }: { dirty: boolean; saved: boolean }) {
  if (!dirty && !saved) return null
  return (
    <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted" role="status" aria-live="polite">
      {dirty ? (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" aria-hidden />
          Saving…
        </>
      ) : (
        <>
          <Check size={13} aria-hidden />
          Saved
        </>
      )}
    </span>
  )
}
