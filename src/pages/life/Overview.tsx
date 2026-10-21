import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarClock, CalendarHeart, ChevronRight, Footprints, Info, Lightbulb, ListChecks, Plus, Repeat, ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Card, CardHeader, Checkbox, cn, EmptyState } from '@/components/ui'
import { addDaysISO, fmtTime, occurrencesBetween, relativeDay, todayISO } from '@/lib/dates'
import { PRIORITY_ORDER } from '@/lib/defaults'
import { monthlyCommitments, upcomingPayments } from '@/lib/finance'
import { useMoney } from '@/lib/format'
import { colorHex } from '@/lib/icons'
import { upcomingDates } from '@/lib/lifeDates'
import { useStore } from '@/lib/store'
import { openEditor, toast } from '@/lib/ui'
import type { ColorKey, ID, ISODate, OrgList, Task } from '@/lib/types'
import { IconTile, LifeHeader } from './common'
import { DateRow } from './Dates'
import { expiryInfo, isExpiringSoon, LIST_KINDS, listCounts, qtyLabel, toggleItem, VAULT_KINDS } from './lib'

const HOME_CATEGORY = 'tc-home'
const ERRANDS_SHOWN = 6
const LIST_PREVIEW_ITEMS = 5

/** Card with a padded header and edge-to-edge rows. */
function Panel({ title, icon, action, subtitle, children }: {
  title: ReactNode
  icon: LucideIcon
  action?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <Card padded={false}>
      <div className="px-4 pt-4 sm:px-5">
        <CardHeader title={title} icon={icon} action={action} subtitle={subtitle} />
      </div>
      <div className="pb-2">{children}</div>
    </Card>
  )
}

function HeaderLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-mr-2 -mt-1 inline-flex h-10 items-center gap-0.5 rounded-xl px-2 text-[13px] font-medium text-accent-text hover:bg-surface-2"
    >
      {children}
      <ChevronRight size={15} />
    </Link>
  )
}

const rowCls = 'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2/60 sm:px-5'

// ───────────────────────── Errands ─────────────────────────

function errandRank(t: Task, today: ISODate) {
  if (t.status === 'done') return 3
  if (!t.dueDate) return 2
  return t.dueDate < today ? 0 : 1
}

function ErrandsCard({ today }: { today: ISODate }) {
  const tasks = useStore((s) => s.tasks)
  const toggleTask = useStore((s) => s.toggleTask)
  // Tasks checked here stay visible (struck through) until the page is left.
  const [kept, setKept] = useState<Set<ID>>(() => new Set())

  const errands = useMemo(
    () =>
      tasks
        .filter((t) => t.categoryId === HOME_CATEGORY && (t.status !== 'done' || kept.has(t.id)))
        .filter((t) => !t.dueDate || t.dueDate <= today)
        .sort(
          (a, b) =>
            errandRank(a, today) - errandRank(b, today) ||
            (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
            a.createdAt - b.createdAt,
        ),
    [tasks, kept, today],
  )
  const open = errands.filter((t) => t.status !== 'done').length

  const toggle = (t: Task) => {
    const completing = t.status !== 'done'
    toggleTask(t.id)
    if (completing) {
      setKept((s) => new Set(s).add(t.id))
      toast('Errand done', {
        action: {
          label: 'Undo',
          onClick: () => {
            const cur = useStore.getState().tasks.find((x) => x.id === t.id)
            if (cur?.status === 'done') useStore.getState().toggleTask(t.id)
          },
        },
      })
    }
  }
  const add = () => openEditor({ kind: 'task', initial: { categoryId: HOME_CATEGORY, dueDate: today } })

  return (
    <Panel
      title="Today’s errands"
      icon={Footprints}
      subtitle={open ? `${open} to do` : undefined}
      action={<Button variant="soft" icon={Plus} className="-mt-1 px-3!" onClick={add}>Add errand</Button>}
    >
      {errands.length === 0 ? (
        <EmptyState compact title="No errands today" description="Home & errands tasks that are due, overdue or undated show up here." />
      ) : (
        <div>
          {errands.slice(0, ERRANDS_SHOWN).map((t) => {
            const done = t.status === 'done'
            const overdue = !done && !!t.dueDate && t.dueDate < today
            return (
              <div key={t.id} className={cn(rowCls, 'cursor-pointer')} onClick={() => openEditor({ kind: 'task', id: t.id })}>
                <div
                  className="-m-2.5 flex shrink-0 p-2.5"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(t)
                  }}
                >
                  <Checkbox round size={22} checked={done} label={done ? `Mark “${t.title}” as not done` : `Complete “${t.title}”`} onChange={() => toggle(t)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-[15px] leading-snug sm:text-sm', done ? 'text-muted line-through' : 'text-ink')}>{t.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {overdue ? (
                      <span className="font-medium text-bad">Overdue · {relativeDay(t.dueDate!)}</span>
                    ) : t.dueDate ? (
                      'Today'
                    ) : (
                      'Anytime'
                    )}
                    {t.dueDate && t.dueTime ? ` · ${fmtTime(t.dueTime)}` : ''}
                  </p>
                </div>
              </div>
            )
          })}
          {errands.length > ERRANDS_SHOWN && (
            <Link to="/tasks" className="block px-4 py-2.5 text-[13px] font-medium text-accent-text sm:px-5">
              +{errands.length - ERRANDS_SHOWN} more in Tasks
            </Link>
          )}
        </div>
      )}
    </Panel>
  )
}

// ───────────────────────── Lists ─────────────────────────

function ListPreview({ list }: { list: OrgList }) {
  const { open, total } = listCounts(list)
  const items = list.items.filter((i) => !i.done)
  const meta = LIST_KINDS[list.kind] ?? LIST_KINDS.other
  const check = (id: ID, title: string) => {
    toggleItem(list.id, id)
    toast(`Checked ${title}`, { action: { label: 'Undo', onClick: () => toggleItem(list.id, id) } })
  }
  return (
    <Panel
      title={list.name}
      icon={meta.icon}
      subtitle={total ? (open ? `${open} of ${total} left` : 'All done') : 'Empty'}
      action={<HeaderLink to={`/life/lists/${list.id}`}>Open</HeaderLink>}
    >
      {items.length === 0 ? (
        <p className="px-4 pb-2 text-[13px] text-muted sm:px-5">
          {total ? 'Everything is checked off.' : 'Nothing on this list yet.'}{' '}
          <Link to={`/life/lists/${list.id}`} className="font-medium text-accent-text">
            {total ? 'Reuse it' : 'Add items'}
          </Link>
        </p>
      ) : (
        <>
          {items.slice(0, LIST_PREVIEW_ITEMS).map((i) => (
            <button key={i.id} type="button" className={rowCls} onClick={() => check(i.id, i.title)}>
              <span
                aria-hidden
                className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] bg-surface"
                style={{ borderColor: colorHex(list.color) }}
              />
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink sm:text-sm">{i.title}</span>
              {i.qty && <Badge>{qtyLabel(i.qty)}</Badge>}
            </button>
          ))}
          {items.length > LIST_PREVIEW_ITEMS && (
            <Link to={`/life/lists/${list.id}`} className="block px-4 py-2.5 text-[13px] font-medium text-accent-text sm:px-5">
              +{items.length - LIST_PREVIEW_ITEMS} more
            </Link>
          )}
        </>
      )}
    </Panel>
  )
}

function ListsSection() {
  const lists = useStore((s) => s.lists)
  const navigate = useNavigate()
  const pinned = useMemo(() => lists.filter((l) => l.pinned).sort((a, b) => b.updatedAt - a.updatedAt), [lists])
  const recent = useMemo(() => [...lists].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3), [lists])

  if (pinned.length) return <>{pinned.map((l) => <ListPreview key={l.id} list={l} />)}</>

  return (
    <Panel title="Lists" icon={ListChecks} action={<HeaderLink to="/life/lists">All lists</HeaderLink>}>
      {recent.length === 0 ? (
        <EmptyState
          compact
          title="No lists yet"
          description="Groceries, packing, weekend errands."
          action={<Button variant="soft" icon={Plus} onClick={() => navigate('/life/lists?new=1')}>New list</Button>}
        />
      ) : (
        <>
          {recent.map((l) => {
            const { open, total } = listCounts(l)
            const meta = LIST_KINDS[l.kind] ?? LIST_KINDS.other
            return (
              <Link key={l.id} to={`/life/lists/${l.id}`} className={rowCls}>
                <IconTile icon={meta.icon} color={l.color} size={34} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink sm:text-sm">{l.name}</span>
                <span className="tabular text-[13px] text-muted">{total ? (open ? `${open} left` : 'Done') : 'Empty'}</span>
              </Link>
            )
          })}
          <p className="px-4 pt-1 text-xs text-muted sm:px-5">Pin a list to check items off right here.</p>
        </>
      )}
    </Panel>
  )
}

// ───────────────────────── Dates, vault, subscriptions ─────────────────────────

function DatesCard({ today }: { today: ISODate }) {
  const dates = useStore((s) => s.importantDates)
  const navigate = useNavigate()
  const upcoming = useMemo(() => upcomingDates(dates, 30, today), [dates, today])
  return (
    <Panel
      title="Coming up"
      icon={CalendarHeart}
      subtitle="Next 30 days"
      action={<HeaderLink to="/life/dates">All dates</HeaderLink>}
    >
      {upcoming.length === 0 ? (
        <EmptyState
          compact
          title={dates.length ? 'Nothing in the next 30 days' : 'No important dates yet'}
          description={dates.length ? undefined : 'Birthdays, anniversaries, renewals.'}
          action={<Button variant="soft" icon={Plus} onClick={() => navigate('/life/dates?new=1')}>Add date</Button>}
        />
      ) : (
        <div className="divide-y divide-line">
          {upcoming.slice(0, 5).map((u) => (
            <DateRow key={u.item.id} u={u} compact onClick={() => navigate(`/life/dates?open=${u.item.id}`)} />
          ))}
          {upcoming.length > 5 && (
            <Link to="/life/dates" className="block px-4 py-2.5 text-[13px] font-medium text-accent-text sm:px-5">
              +{upcoming.length - 5} more
            </Link>
          )}
        </div>
      )}
    </Panel>
  )
}

function ExpiringCard({ today }: { today: ISODate }) {
  const vault = useStore((s) => s.vault)
  const navigate = useNavigate()
  const expiring = useMemo(
    () =>
      vault
        .filter((v) => isExpiringSoon(v.expiresOn, today))
        .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '')),
    [vault, today],
  )
  if (!expiring.length) {
    return (
      <Link to="/life/vault" className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-muted shadow-card hover:border-line-strong">
        <ShieldCheck size={16} className="shrink-0 text-good" />
        <span className="min-w-0 flex-1">No documents expiring in the next 60 days</span>
        <ChevronRight size={15} />
      </Link>
    )
  }
  return (
    <Panel title="Documents to renew" icon={ShieldCheck} action={<HeaderLink to="/life/vault">Vault</HeaderLink>}>
      {expiring.slice(0, 5).map((v) => {
        const meta = VAULT_KINDS[v.kind] ?? VAULT_KINDS.other
        const info = expiryInfo(v.expiresOn, today)
        return (
          <button key={v.id} type="button" className={rowCls} onClick={() => navigate(`/life/vault?open=${v.id}`)}>
            <IconTile icon={meta.icon} color={meta.color} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink sm:text-sm">{v.title}</span>
              <span className="block text-[12.5px] text-muted">{meta.label}</span>
            </span>
            {info && <Badge tone={info.tone}>{info.label}</Badge>}
          </button>
        )
      })}
    </Panel>
  )
}

function renewWhen(date: ISODate) {
  const r = relativeDay(date)
  return r === 'Today' || r === 'Tomorrow' ? r.toLowerCase() : r
}

function SubscriptionsCard({ today }: { today: ISODate }) {
  const payments = useStore((s) => s.plannedPayments)
  const money = useMoney()
  const monthly = useMemo(() => monthlyCommitments(payments, true), [payments])
  const activeCount = useMemo(() => payments.filter((p) => p.active && p.isSubscription).length, [payments])
  const renewals = useMemo(() => {
    const seen = new Set<ID>()
    return upcomingPayments(payments, 120, today)
      .filter((d) => d.payment.isSubscription && !seen.has(d.payment.id) && (seen.add(d.payment.id), true))
      .slice(0, 3)
  }, [payments, today])

  return (
    <Panel title="Subscriptions" icon={Repeat} action={<HeaderLink to="/money/payments">Manage</HeaderLink>}>
      {activeCount === 0 ? (
        <EmptyState
          compact
          title="No subscriptions tracked"
          description="Add streaming, phone or gym plans in Money to see what they cost and when they renew."
          action={<Link to="/money/payments" className="inline-flex h-10 items-center rounded-xl bg-accent-soft px-4 text-sm font-medium text-accent-text">Track a subscription</Link>}
        />
      ) : (
        <>
          <div className="px-4 pb-2 sm:px-5">
            <p className="tabular text-2xl font-semibold tracking-tight text-ink">
              {money(monthly)}
              <span className="ml-1 text-sm font-normal text-muted">/ month</span>
            </p>
            <p className="text-[13px] text-muted">
              ≈ {money(monthly * 12, { compact: true })} a year · {activeCount} active
            </p>
          </div>
          {renewals.length > 0 && (
            <div className="divide-y divide-line border-t border-line">
              {renewals.map((d) => (
                <div key={d.payment.id} className={cn(rowCls, 'min-h-12')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink sm:text-sm">{d.payment.name}</span>
                    <span className={cn('block text-[12.5px]', d.overdue ? 'font-medium text-bad' : 'text-muted')}>
                      {d.overdue ? `Overdue · ${relativeDay(d.date)}` : `Renews ${renewWhen(d.date)}`}
                    </span>
                  </span>
                  <span className="tabular text-sm font-medium text-ink">{money(d.payment.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

// ───────────────────────── Quick links ─────────────────────────

function QuickTile({ to, icon, color, label, hint }: { to: string; icon: LucideIcon; color: ColorKey; label: string; hint: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card transition-colors hover:border-line-strong"
    >
      <IconTile icon={icon} color={color} size={34} />
      <span className="min-w-0 max-w-full">
        <span className="block truncate text-[13px] font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
    </Link>
  )
}

function QuickLinks({ today }: { today: ISODate }) {
  const notes = useStore((s) => s.notes)
  const events = useStore((s) => s.events)
  const counts = useMemo(() => {
    let ideas = 0
    let important = 0
    for (const n of notes) {
      if (n.archived) continue
      if (n.category === 'ideas') ideas++
      else if (n.category === 'important') important++
    }
    const end = addDaysISO(today, 30)
    const appts = events
      .filter((e) => e.type === 'appointment')
      .reduce((sum, e) => sum + occurrencesBetween(e, today, end).length, 0)
    return { ideas, important, appts }
  }, [notes, events, today])

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Ideas & references</h2>
        <Button
          variant="ghost"
          icon={Plus}
          className="-mr-2 px-3!"
          onClick={() => openEditor({ kind: 'note', initial: { category: 'ideas' } })}
        >
          Jot an idea
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <QuickTile to="/notes?category=ideas" icon={Lightbulb} color="amber" label="Ideas" hint={`${counts.ideas} note${counts.ideas === 1 ? '' : 's'}`} />
        <QuickTile to="/notes?category=important" icon={Info} color="red" label="Important" hint={`${counts.important} note${counts.important === 1 ? '' : 's'}`} />
        <QuickTile to="/calendar?view=agenda" icon={CalendarClock} color="blue" label="Appointments" hint={counts.appts ? `${counts.appts} in 30 days` : 'None soon'} />
      </div>
    </section>
  )
}

// ───────────────────────── Page ─────────────────────────

export function LifeOverview() {
  const today = todayISO()
  const tasks = useStore((s) => s.tasks)
  const dates = useStore((s) => s.importantDates)
  const subtitle = useMemo(() => {
    const errands = tasks.filter(
      (t) => t.categoryId === HOME_CATEGORY && t.status !== 'done' && (!t.dueDate || t.dueDate <= today),
    ).length
    const soon = upcomingDates(dates, 7, today).length
    const parts = [
      errands ? `${errands} errand${errands === 1 ? '' : 's'}` : 'No errands',
      soon ? `${soon} date${soon === 1 ? '' : 's'} this week` : '',
    ].filter(Boolean)
    return parts.join(' · ')
  }, [tasks, dates, today])

  return (
    <>
      <LifeHeader subtitle={subtitle} />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <ErrandsCard today={today} />
          <ListsSection />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <DatesCard today={today} />
          <SubscriptionsCard today={today} />
          <ExpiringCard today={today} />
          <QuickLinks today={today} />
        </div>
      </div>
    </>
  )
}
