import { useMemo, useState } from 'react'
import { Bell, CalendarHeart, ChevronDown, Plus, Repeat, Trash2 } from 'lucide-react'
import {
  Badge, Button, Card, cn, EmptyState, Field, Input, SectionTitle, Sheet, Textarea, Toggle,
} from '@/components/ui'
import { addDaysISO, fmt, isValidISO, todayISO } from '@/lib/dates'
import { DATE_KIND_LABELS, upcomingDates, yearsLabel, type UpcomingDate } from '@/lib/lifeDates'
import { makeImportantDate, useStore } from '@/lib/store'
import { removeWithUndo, toast } from '@/lib/ui'
import type { ImportantDate, ImportantDateKind } from '@/lib/types'
import { IconTile, KindPicker, LifeHeader, PillChoice, useQueryAction } from './common'
import { countdown, DATE_KIND_KEYS, DATE_KIND_META, defaultYearly, REMIND_OPTIONS, remindLabel } from './lib'

const KIND_OPTIONS = DATE_KIND_KEYS.map((k) => ({ value: k, label: DATE_KIND_LABELS[k], icon: DATE_KIND_META[k].icon }))

// ───────────────────────── Editor ─────────────────────────

export function DateSheet({ item, initialKind, onClose }: {
  item?: ImportantDate
  initialKind?: ImportantDateKind
  onClose: () => void
}) {
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const startKind = item?.kind ?? initialKind ?? 'birthday'
  const [title, setTitle] = useState(item?.title ?? '')
  const [kind, setKind] = useState<ImportantDateKind>(startKind)
  const [date, setDate] = useState(item?.date ?? todayISO())
  const [yearly, setYearly] = useState(item?.yearly ?? defaultYearly(startKind))
  const [yearlyTouched, setYearlyTouched] = useState(!!item)
  const [remindDays, setRemindDays] = useState(item?.remindDays ?? 1)
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [errors, setErrors] = useState<{ title?: string; date?: string }>({})

  const save = () => {
    const t = title.trim()
    const errs: typeof errors = {}
    if (!t) errs.title = 'Add a title'
    if (!isValidISO(date)) errs.date = 'Pick a date'
    setErrors(errs)
    if (errs.title || errs.date) return
    const data = { title: t, kind, date, yearly, remindDays, notes: notes.trim() || undefined }
    if (item) {
      patch('importantDates', item.id, data)
      toast('Date updated')
    } else {
      insert('importantDates', makeImportantDate(data))
      toast('Date added')
    }
    onClose()
  }

  const remove = () => {
    if (!item) return
    onClose()
    removeWithUndo('importantDates', item.id, 'Date deleted')
  }

  const showYearHint = yearly && (kind === 'birthday' || kind === 'anniversary')

  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? 'Edit date' : 'New important date'}
      footer={
        <>
          {item && <Button variant="ghost" icon={Trash2} className="text-bad!" onClick={remove}>Delete</Button>}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Title" error={errors.title}>
          <Input
            value={title}
            placeholder={kind === 'birthday' ? 'e.g. Mum’s birthday' : kind === 'renewal' ? 'e.g. Car insurance renewal' : 'Title'}
            onChange={(e) => setTitle(e.target.value)}
            enterKeyHint="done"
          />
        </Field>
        <Field label="Kind">
          <KindPicker
            cols={3}
            options={KIND_OPTIONS}
            value={kind}
            onChange={(k) => {
              setKind(k)
              if (!yearlyTouched) setYearly(defaultYearly(k))
            }}
          />
        </Field>
        <Field
          label="Date"
          error={errors.date}
          hint={showYearHint ? 'Use the real year to see ages and anniversaries (“Turns 34”).' : undefined}
        >
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Toggle
          checked={yearly}
          onChange={(v) => {
            setYearly(v)
            setYearlyTouched(true)
          }}
          label="Repeats every year"
          description={yearly ? `Every ${isValidISO(date) ? fmt(date, 'd MMMM') : 'year'}` : 'A one-off date'}
        />
        <Field label="Remind me">
          <PillChoice options={REMIND_OPTIONS} value={remindDays} onChange={setRemindDays} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gift ideas, policy number, who to call…" className="min-h-20!" />
        </Field>
      </form>
    </Sheet>
  )
}

// ───────────────────────── Rows ─────────────────────────

export function DateRow({ u, onClick, compact }: { u: UpcomingDate; onClick: () => void; compact?: boolean }) {
  const meta = DATE_KIND_META[u.item.kind] ?? DATE_KIND_META.other
  const years = yearsLabel(u)
  const today = u.daysUntil === 0
  const sameYear = u.date.slice(0, 4) === todayISO().slice(0, 4)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors sm:px-5',
        !compact && 'first:rounded-t-2xl last:rounded-b-2xl',
        today ? 'bg-accent-soft/60 hover:bg-accent-soft' : 'hover:bg-surface-2/60',
      )}
    >
      <IconTile icon={meta.icon} color={meta.color} size={compact ? 36 : 40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink sm:text-sm">{u.item.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted">
          <span>{fmt(u.date, sameYear ? 'EEE, d MMM' : 'EEE, d MMM yyyy')}</span>
          {years && <span className="font-medium text-ink-2">{years}</span>}
          {!compact && u.item.yearly && <Repeat size={12} aria-label="Every year" />}
          {!compact && (
            <span className="inline-flex items-center gap-1">
              <Bell size={12} />
              {remindLabel(u.item.remindDays)}
            </span>
          )}
        </span>
      </span>
      {today ? (
        <Badge tone="accent" className="h-6! px-2! text-xs!">Today</Badge>
      ) : (
        <span className={cn('tabular shrink-0 text-right text-[13px]', u.daysUntil <= 7 ? 'font-semibold text-ink' : 'text-muted')}>
          {countdown(u.daysUntil)}
        </span>
      )}
    </button>
  )
}

function Group({ title, items, onOpen }: { title: string; items: UpcomingDate[]; onOpen: (d: ImportantDate) => void }) {
  if (!items.length) return null
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <Card padded={false} className="divide-y divide-line">
        {items.map((u) => <DateRow key={u.item.id} u={u} onClick={() => onOpen(u.item)} />)}
      </Card>
    </section>
  )
}

// ───────────────────────── Page ─────────────────────────

type SheetState = { item?: ImportantDate; kind?: ImportantDateKind } | null

export function DatesPage() {
  const dates = useStore((s) => s.importantDates)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [showPast, setShowPast] = useState(false)
  const today = todayISO()

  useQueryAction('new', (v) => setSheet({ kind: (DATE_KIND_KEYS as string[]).includes(v) ? (v as ImportantDateKind) : undefined }))
  useQueryAction('open', (id) => {
    const item = useStore.getState().importantDates.find((d) => d.id === id)
    if (item) setSheet({ item })
  })

  const groups = useMemo(() => {
    // Ten years ahead covers every future one-off date anyone would store.
    const all = upcomingDates(dates, 3660, today)
    const soonEnd = addDaysISO(today, 30)
    const year = today.slice(0, 4)
    const nextYear = String(Number(year) + 1)
    const ids = new Set(all.map((u) => u.item.id))
    return {
      soon: all.filter((u) => u.date <= soonEnd),
      thisYear: all.filter((u) => u.date > soonEnd && u.date.slice(0, 4) === year),
      nextYear: all.filter((u) => u.date > soonEnd && u.date.slice(0, 4) === nextYear),
      later: all.filter((u) => u.date > soonEnd && u.date.slice(0, 4) > nextYear),
      past: dates.filter((d) => !ids.has(d.id)).sort((a, b) => b.date.localeCompare(a.date)),
    }
  }, [dates, today])

  const open = (item: ImportantDate) => setSheet({ item })

  return (
    <>
      <LifeHeader />
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {dates.length
            ? groups.soon.length
              ? `${groups.soon.length} in the next 30 days`
              : 'Nothing in the next 30 days'
            : 'Birthdays, anniversaries, renewals'}
        </p>
        <Button variant="primary" icon={Plus} onClick={() => setSheet({})}>Add date</Button>
      </div>

      {dates.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={CalendarHeart}
            title="No important dates yet"
            description="Add birthdays, anniversaries, renewals and expiry dates — you'll get a countdown and a reminder."
            action={<Button variant="primary" icon={Plus} onClick={() => setSheet({ kind: 'birthday' })}>Add a birthday</Button>}
          />
        </Card>
      ) : (
        <>
          {groups.soon.length === 0 && (
            <Card className="mt-6">
              <EmptyState compact icon={CalendarHeart} title="A quiet month" description="No important dates in the next 30 days." />
            </Card>
          )}
          <Group title="Next 30 days" items={groups.soon} onOpen={open} />
          <Group title="Later this year" items={groups.thisYear} onOpen={open} />
          <Group title="Next year" items={groups.nextYear} onOpen={open} />
          <Group title="Later" items={groups.later} onOpen={open} />

          {groups.past.length > 0 && (
            <section className="mt-6">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="-ml-2 mb-2 inline-flex h-10 items-center gap-1 rounded-xl px-2 text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink"
              >
                <ChevronDown size={15} className={cn('transition-transform', !showPast && '-rotate-90')} />
                Past ({groups.past.length})
              </button>
              {showPast && (
                <Card padded={false} className="divide-y divide-line">
                  {groups.past.map((d) => {
                    const meta = DATE_KIND_META[d.kind] ?? DATE_KIND_META.other
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => open(d)}
                        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left opacity-75 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2/60 hover:opacity-100 sm:px-4"
                      >
                        <IconTile icon={meta.icon} color={meta.color} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{d.title}</span>
                          <span className="block text-[12.5px] text-muted">{fmt(d.date, 'd MMM yyyy')} · {DATE_KIND_LABELS[d.kind]}</span>
                        </span>
                      </button>
                    )
                  })}
                </Card>
              )}
            </section>
          )}
        </>
      )}

      {sheet && <DateSheet item={sheet.item} initialKind={sheet.kind} onClose={() => setSheet(null)} />}
    </>
  )
}
