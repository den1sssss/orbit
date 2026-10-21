import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Backpack, BookHeart, Briefcase, CalendarDays, CheckCircle2, NotebookPen, Search as SearchIcon, Target, Wallet, X,
  type LucideIcon,
} from 'lucide-react'
import { INVOICE_STATE_LABELS, invoiceState } from '@/lib/business'
import { describeSchedule } from '@/lib/habits'
import { DATE_KIND_LABELS, nextOccurrence } from '@/lib/lifeDates'
import { GOAL_HORIZON_LABELS, LIFE_AREA_LABELS } from '@/lib/defaults'
import { CategoryIcon, Chip, cn, EmptyState, PageHeader } from '@/components/ui'
import { describeRecurrence, fmtTime, relativeDay } from '@/lib/dates'
import { MOOD_EMOJI, NOTE_CATEGORY_LABELS, STATUS_LABELS } from '@/lib/defaults'
import { useMoney } from '@/lib/format'
import { useStore } from '@/lib/store'
import { openEditor } from '@/lib/ui'

type Kind = 'all' | 'tasks' | 'notes' | 'events' | 'journal' | 'money' | 'business' | 'growth' | 'life'

interface Result {
  id: string
  kind: Exclude<Kind, 'all'>
  title: string
  sub: string
  date?: string
  right?: ReactNode
  icon?: ReactNode
  open: () => void
}

const KIND_META: Record<Exclude<Kind, 'all'>, { label: string; icon: LucideIcon }> = {
  tasks: { label: 'Tasks', icon: CheckCircle2 },
  notes: { label: 'Notes', icon: NotebookPen },
  events: { label: 'Events', icon: CalendarDays },
  journal: { label: 'Journal', icon: BookHeart },
  money: { label: 'Transactions', icon: Wallet },
  business: { label: 'Business', icon: Briefcase },
  growth: { label: 'Goals & habits', icon: Target },
  life: { label: 'Life', icon: Backpack },
}

/** Case-insensitive match of every word in the query. */
function matcher(q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return (...fields: (string | number | undefined | null | string[])[]) => {
    const hay = fields.flat().filter((f) => f !== undefined && f !== null).join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  }
}

function Highlight({ text, q }: { text: string; q: string }) {
  const words = q.trim().split(/\s+/).filter((w) => w.length > 1)
  if (!words.length) return <>{text}</>
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const lower = words.map((w) => w.toLowerCase())
  return (
    <>
      {text.split(re).map((part, i) =>
        lower.includes(part.toLowerCase())
          ? <mark key={i} className="rounded bg-accent-soft px-0.5 text-accent-text">{part}</mark>
          : <span key={i}>{part}</span>,
      )}
    </>
  )
}

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const money = useMoney()
  const [q, setQ] = useState(params.get('q') ?? '')
  const kind = (params.get('type') as Kind) || 'all'

  const tasks = useStore((s) => s.tasks)
  const notes = useStore((s) => s.notes)
  const events = useStore((s) => s.events)
  const journal = useStore((s) => s.journal)
  const transactions = useStore((s) => s.transactions)
  const taskCategories = useStore((s) => s.taskCategories)
  const financeCategories = useStore((s) => s.financeCategories)
  const projects = useStore((s) => s.projects)
  const methods = useStore((s) => s.paymentMethods)
  const clients = useStore((s) => s.clients)
  const invoices = useStore((s) => s.invoices)
  const habits = useStore((s) => s.habits)
  const lifeGoals = useStore((s) => s.lifeGoals)
  const lists = useStore((s) => s.lists)
  const importantDates = useStore((s) => s.importantDates)
  const vault = useStore((s) => s.vault)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const results = useMemo(() => {
    const query = q.trim()
    if (!query) return [] as Result[]
    const m = matcher(query)
    const out: Result[] = []
    const projectName = (id?: string) => projects.find((p) => p.id === id)?.name

    for (const t of tasks) {
      const cat = taskCategories.find((c) => c.id === t.categoryId)?.name
      if (m(t.title, t.notes, t.tags, cat, projectName(t.projectId), t.subtasks.map((s) => s.title)))
        out.push({
          id: t.id, kind: 'tasks', title: t.title, date: t.dueDate,
          sub: [STATUS_LABELS[t.status], cat, t.dueDate ? `Due ${relativeDay(t.dueDate)}` : null, projectName(t.projectId)].filter(Boolean).join(' · '),
          open: () => openEditor({ kind: 'task', id: t.id }),
        })
    }
    for (const n of notes) {
      if (m(n.title, n.body, n.tags, NOTE_CATEGORY_LABELS[n.category], n.checklist.map((c) => c.title), projectName(n.projectId)))
        out.push({
          id: n.id, kind: 'notes', title: n.title || 'Untitled', date: n.date,
          sub: [NOTE_CATEGORY_LABELS[n.category], n.archived ? 'Archived' : null, n.body.split('\n')[0]].filter(Boolean).join(' · '),
          open: () => openEditor({ kind: 'note', id: n.id }),
        })
    }
    for (const e of events) {
      if (m(e.title, e.location, e.notes, e.type, projectName(e.projectId)))
        out.push({
          id: e.id, kind: 'events', title: e.title, date: e.date,
          sub: [relativeDay(e.date), e.allDay ? 'All day' : fmtTime(e.startTime), e.recurrence.freq !== 'none' ? describeRecurrence(e) : null, e.location].filter(Boolean).join(' · '),
          open: () => navigate(`/calendar?view=day&date=${e.date}`),
        })
    }
    for (const j of journal) {
      if (m(j.title, j.body, j.gratitude, j.wins, j.lessons, j.tomorrow, j.tags))
        out.push({
          id: j.id, kind: 'journal', title: relativeDay(j.date), date: j.date,
          sub: (j.body || j.wins || j.gratitude.join(', ')).slice(0, 120),
          right: j.mood ? <span className="text-lg">{MOOD_EMOJI[j.mood]}</span> : undefined,
          open: () => navigate(`/journal/${j.date}`),
        })
    }
    for (const t of transactions) {
      const cat = financeCategories.find((c) => c.id === t.categoryId)
      const method = methods.find((x) => x.id === t.paymentMethodId)?.name
      if (m(t.payee, t.note, cat?.name, method, t.amount.toFixed(2), t.type, t.scope, projectName(t.projectId)))
        out.push({
          id: t.id, kind: 'money', title: t.payee || cat?.name || 'Transaction', date: t.date,
          sub: [relativeDay(t.date), cat?.name, method, t.note].filter(Boolean).join(' · '),
          icon: <CategoryIcon icon={cat?.icon} color={cat?.color} size={32} />,
          right: (
            <span className={cn('text-sm font-medium tabular', t.type === 'income' ? 'text-good' : 'text-ink')}>
              {t.type === 'income' ? '+' : '−'}{money(t.amount)}
            </span>
          ),
          open: () => openEditor({ kind: 'transaction', id: t.id }),
        })
    }
    // Business
    for (const c of clients) {
      if (m(c.name, c.company, c.email, c.phone, c.notes))
        out.push({ id: c.id, kind: 'business', title: c.name, sub: ['Client', c.company, c.email].filter(Boolean).join(' · '), open: () => navigate('/business/clients') })
    }
    for (const p of projects) {
      const client = clients.find((c) => c.id === p.clientId)?.name ?? p.client
      if (m(p.name, p.description, client))
        out.push({ id: p.id, kind: 'business', title: p.name, date: p.deadline, sub: ['Project', client, p.status].filter(Boolean).join(' · '), open: () => navigate(`/business/projects/${p.id}`) })
    }
    for (const inv of invoices) {
      const client = clients.find((c) => c.id === inv.clientId)?.name
      if (m(inv.number, inv.title, inv.notes, client, inv.amount.toFixed(2)))
        out.push({
          id: inv.id, kind: 'business', title: `${inv.number} · ${inv.title}`, date: inv.issueDate,
          sub: [INVOICE_STATE_LABELS[invoiceState(inv)], client, inv.dueDate ? `Due ${relativeDay(inv.dueDate)}` : null].filter(Boolean).join(' · '),
          right: <span className="text-sm font-medium tabular text-ink">{money(inv.amount)}</span>,
          open: () => navigate('/business/invoices'),
        })
    }
    // Goals & habits
    for (const h of habits) {
      if (m(h.name, h.unit, LIFE_AREA_LABELS[h.area]))
        out.push({ id: h.id, kind: 'growth', title: `${h.emoji ? h.emoji + ' ' : ''}${h.name}`, sub: ['Habit', describeSchedule(h), h.archived ? 'Archived' : null].filter(Boolean).join(' · '), open: () => navigate('/growth/habits') })
    }
    for (const g of lifeGoals) {
      if (m(g.title, g.why, g.milestones.map((x) => x.title), LIFE_AREA_LABELS[g.area]))
        out.push({ id: g.id, kind: 'growth', title: g.title, date: g.targetDate, sub: ['Goal', GOAL_HORIZON_LABELS[g.horizon], LIFE_AREA_LABELS[g.area], g.status !== 'active' ? g.status : null].filter(Boolean).join(' · '), open: () => navigate('/growth/goals') })
    }
    // Life organizer (vault: titles and field labels only — never values)
    for (const l of lists) {
      const hits = l.items.filter((i) => m(i.title, i.note))
      if (m(l.name) || hits.length)
        out.push({ id: l.id, kind: 'life', title: l.name, sub: ['List', hits.length ? hits.slice(0, 3).map((i) => i.title).join(', ') : `${l.items.filter((i) => !i.done).length} open`].join(' · '), open: () => navigate(`/life/lists/${l.id}`) })
    }
    for (const d of importantDates) {
      if (m(d.title, d.notes, DATE_KIND_LABELS[d.kind]))
        out.push({ id: d.id, kind: 'life', title: d.title, date: nextOccurrence(d) ?? d.date, sub: [DATE_KIND_LABELS[d.kind], relativeDay(nextOccurrence(d) ?? d.date)].join(' · '), open: () => navigate(`/life/dates?open=${d.id}`) })
    }
    for (const v of vault) {
      if (m(v.title, v.kind, v.fields.map((f) => f.label)))
        out.push({ id: v.id, kind: 'life', title: v.title, sub: ['Vault', `${v.fields.length} fields`].join(' · '), open: () => navigate(`/life/vault?open=${v.id}`) })
    }
    // Newest first within each kind.
    return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }, [q, tasks, notes, events, journal, transactions, taskCategories, financeCategories, projects, methods, money, navigate,
    clients, invoices, habits, lifeGoals, lists, importantDates, vault])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of results) c[r.kind] = (c[r.kind] ?? 0) + 1
    return c
  }, [results])

  const groups = (Object.keys(KIND_META) as Exclude<Kind, 'all'>[])
    .filter((k) => kind === 'all' || kind === k)
    .map((k) => ({ kind: k, items: results.filter((r) => r.kind === k) }))
    .filter((g) => g.items.length)

  return (
    <>
      <PageHeader title="Search" subtitle="Tasks, notes, events, journal and transactions" />
      <div className="relative mb-3">
        <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setParam('q', e.target.value)
          }}
          placeholder="Search everything…"
          aria-label="Search"
          className="h-12 w-full rounded-2xl border border-line bg-surface pl-11 pr-11 text-base text-ink shadow-card outline-none placeholder:text-muted focus:border-accent focus:ring-3 focus:ring-accent/15"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQ('')
              setParam('q', '')
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="scrollbar-none -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip active={kind === 'all'} onClick={() => setParam('type', '')} count={q ? results.length : undefined}>All</Chip>
        {(Object.keys(KIND_META) as Exclude<Kind, 'all'>[]).map((k) => (
          <Chip key={k} active={kind === k} icon={KIND_META[k].icon} onClick={() => setParam('type', k)} count={q ? counts[k] ?? 0 : undefined}>
            {KIND_META[k].label}
          </Chip>
        ))}
      </div>

      {!q.trim() ? (
        <EmptyState icon={SearchIcon} title="Find anything" description="Try a client name, a store, an amount like 45.00, a tag, or a word from your journal." />
      ) : groups.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No matches" description={`Nothing found for “${q}”.`} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => {
            const Icon = KIND_META[g.kind].icon
            return (
              <section key={g.kind}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <Icon size={14} /> {KIND_META[g.kind].label} <span className="tabular">{g.items.length}</span>
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {g.items.slice(0, kind === 'all' ? 8 : 200).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={r.open}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                      >
                        {r.icon}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink"><Highlight text={r.title} q={q} /></span>
                          {r.sub && <span className="block truncate text-xs text-muted"><Highlight text={r.sub} q={q} /></span>}
                        </span>
                        {r.right}
                      </button>
                    </li>
                  ))}
                </ul>
                {kind === 'all' && g.items.length > 8 && (
                  <button type="button" onClick={() => setParam('type', g.kind)} className="mt-2 text-[13px] font-medium text-accent-text hover:underline">
                    Show all {g.items.length} {KIND_META[g.kind].label.toLowerCase()}
                  </button>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
