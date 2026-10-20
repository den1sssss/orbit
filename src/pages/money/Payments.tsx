import { useMemo, useState, type ReactNode } from 'react'
import {
  CalendarClock, ChevronDown, Pause, Pencil, Play, Plus, Repeat, SkipForward, Trash2,
} from 'lucide-react'
import {
  Button, Card, Chip, cn, EmptyState, Field, Input, Menu, MoneyInput, PageHeader, Select, Sheet, Stat,
  Textarea, Toggle, type MenuItem,
} from '@/components/ui'
import { addDaysISO, advanceDue, isValidISO, monthlyFactor, relativeDay, relativeDistance, todayISO } from '@/lib/dates'
import { monthlyCommitments, upcomingPayments } from '@/lib/finance'
import { parseAmount, useMoney } from '@/lib/format'
import { uid, useStore } from '@/lib/store'
import { confirm, removeWithUndo, toast } from '@/lib/ui'
import type { ID, PaymentRecurrence, PlannedPayment } from '@/lib/types'
import { RECURRENCE_LABELS, roundCents, useCategoryMap } from './components/lib'
import { MoneyToolbar } from './components/nav'
import { MarkPaidButton, PaymentRow } from './components/rows'

// ───────────────────────── Actions ─────────────────────────

function skipPayment(p: PlannedPayment) {
  const prev = p.nextDue
  const next = advanceDue(p.nextDue, p.recurrence)
  useStore.getState().patch('plannedPayments', p.id, { nextDue: next })
  toast(`Skipped · next due ${relativeDay(next)}`, {
    action: { label: 'Undo', onClick: () => useStore.getState().patch('plannedPayments', p.id, { nextDue: prev }) },
  })
}

function setActive(p: PlannedPayment, active: boolean) {
  useStore.getState().patch('plannedPayments', p.id, { active })
  toast(active ? `${p.name} resumed` : `${p.name} paused`, {
    action: { label: 'Undo', onClick: () => useStore.getState().patch('plannedPayments', p.id, { active: !active }) },
  })
}

async function deletePayment(p: PlannedPayment, after?: () => void) {
  const ok = await confirm({
    title: `Delete “${p.name}”?`,
    message: 'Past transactions logged for it are kept.',
    confirmLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  removeWithUndo('plannedPayments', p.id, 'Payment deleted')
  after?.()
}

// ───────────────────────── Page ─────────────────────────

export function PaymentsPage() {
  const payments = useStore((s) => s.plannedPayments)
  const catMap = useCategoryMap()
  const money = useMoney()
  const [subsOnly, setSubsOnly] = useState(false)
  const [editing, setEditing] = useState<{ id?: ID } | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const today = todayISO()
  const in30 = addDaysISO(today, 30)

  const stats = useMemo(() => {
    const upcoming = upcomingPayments(payments, 30, today)
    return {
      monthly: monthlyCommitments(payments),
      recurringCount: payments.filter((p) => p.active && p.recurrence !== 'none').length,
      subsMonthly: monthlyCommitments(payments, true),
      subsCount: payments.filter((p) => p.active && p.isSubscription).length,
      due30: upcoming.filter((d) => !d.overdue).reduce((s, d) => s + d.payment.amount, 0),
      due30Count: upcoming.filter((d) => !d.overdue).length,
      overdue: upcoming.filter((d) => d.overdue).reduce((s, d) => s + d.payment.amount, 0),
    }
  }, [payments, today])

  const sections = useMemo(() => {
    const visible = subsOnly ? payments.filter((p) => p.isSubscription) : payments
    const active = visible.filter((p) => p.active).sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    return {
      overdue: active.filter((p) => p.nextDue < today),
      soon: active.filter((p) => p.nextDue >= today && p.nextDue <= in30),
      later: active.filter((p) => p.nextDue > in30),
      inactive: visible.filter((p) => !p.active).sort((a, b) => a.name.localeCompare(b.name)),
      count: visible.length,
    }
  }, [payments, subsOnly, today, in30])

  const allSubsCount = payments.filter((p) => p.isSubscription).length
  const editingPayment = editing?.id ? payments.find((p) => p.id === editing.id) : undefined

  const row = (p: PlannedPayment) => {
    const items: MenuItem[] = []
    if (p.active) {
      if (p.recurrence !== 'none') items.push({ label: 'Skip this one', icon: SkipForward, onClick: () => skipPayment(p) })
      items.push({ label: 'Edit', icon: Pencil, onClick: () => setEditing({ id: p.id }) })
      items.push({ label: 'Pause', icon: Pause, onClick: () => setActive(p, false) })
    } else {
      items.push({ label: p.recurrence === 'none' ? 'Reactivate' : 'Resume', icon: Play, onClick: () => setActive(p, true) })
      items.push({ label: 'Edit', icon: Pencil, onClick: () => setEditing({ id: p.id }) })
    }
    items.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => void deletePayment(p) })

    const yearly = p.amount * monthlyFactor(p.recurrence) * 12
    const dueLabel = subsOnly && p.active ? (
      <span className={cn('min-w-0 max-w-full truncate', p.nextDue < today ? 'text-bad' : 'text-muted')}>
        Renews {relativeDay(p.nextDue)} · {relativeDistance(p.nextDue)}
        {yearly > 0 && <span className="tabular"> · {money(yearly)}/yr</span>}
      </span>
    ) : !p.active ? (
      <span className="min-w-0 max-w-full truncate text-muted">
        {p.lastPaid ? `Last paid ${relativeDay(p.lastPaid)}` : 'Paused'}
      </span>
    ) : undefined

    return (
      <PaymentRow
        key={p.id}
        payment={p}
        category={catMap.get(p.categoryId)}
        money={money}
        onOpen={() => setEditing({ id: p.id })}
        dueLabel={dueLabel}
        actions={
          <>
            {p.active && <MarkPaidButton id={p.id} />}
            <Menu label={`${p.name} actions`} items={items} />
          </>
        }
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Payments"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            <span className="hidden sm:inline">Add payment</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      >
        <MoneyToolbar>
          <Chip active={!subsOnly} onClick={() => setSubsOnly(false)} count={payments.length}>
            All
          </Chip>
          <Chip active={subsOnly} icon={Repeat} onClick={() => setSubsOnly(true)} count={allSubsCount}>
            Subscriptions
          </Chip>
        </MoneyToolbar>
      </PageHeader>

      {payments.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="Plan bills and subscriptions"
            description="Add rent, utilities, loans and subscriptions to see what’s due and what you’re committed to each month."
            action={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Add payment</Button>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <Card>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
              <Stat
                label="Monthly commitments"
                value={<span className="tabular">{money(stats.monthly)}</span>}
                hint={`${stats.recurringCount} recurring`}
              />
              <Stat
                label="Subscriptions / month"
                value={<span className="tabular">{money(stats.subsMonthly)}</span>}
                hint={`${stats.subsCount} active`}
              />
              <Stat
                label="Subscriptions / year"
                value={<span className="tabular">{money(stats.subsMonthly * 12)}</span>}
                hint="At current prices"
              />
              <Stat
                label="Due in next 30 days"
                value={<span className="tabular">{money(stats.due30)}</span>}
                hint={
                  stats.overdue > 0 ? (
                    <span className="text-bad">+ {money(stats.overdue)} overdue</span>
                  ) : (
                    `${stats.due30Count} payment${stats.due30Count === 1 ? '' : 's'}`
                  )
                }
              />
            </div>
          </Card>

          {sections.count === 0 ? (
            <Card>
              <EmptyState
                compact
                icon={Repeat}
                title="No subscriptions"
                description="Mark a planned payment as a subscription to track renewals here."
              />
            </Card>
          ) : (
            <>
              <Group title="Overdue" tone="bad" items={sections.overdue} render={row} />
              <Group title="Due in the next 30 days" items={sections.soon} render={row} />
              <Group title="Later" items={sections.later} render={row} />
              {sections.overdue.length + sections.soon.length + sections.later.length === 0 && (
                <Card>
                  <EmptyState compact icon={CalendarClock} title="Nothing active" description="All planned payments are paused or done." />
                </Card>
              )}
              {sections.inactive.length > 0 && (
                <section>
                  <button
                    type="button"
                    aria-expanded={showInactive}
                    onClick={() => setShowInactive((v) => !v)}
                    className="flex h-10 items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink"
                  >
                    <ChevronDown size={15} className={cn('transition-transform', !showInactive && '-rotate-90')} />
                    Inactive & cancelled · {sections.inactive.length}
                  </button>
                  {showInactive && (
                    <Card padded={false} className="mt-1 divide-y divide-line">
                      {sections.inactive.map(row)}
                    </Card>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {editing && (
        <PaymentSheet key={editing.id ?? 'new'} payment={editingPayment} onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function Group({ title, tone, items, render }: {
  title: string
  tone?: 'bad'
  items: PlannedPayment[]
  render: (p: PlannedPayment) => ReactNode
}) {
  const money = useMoney()
  if (!items.length) return null
  const total = items.reduce((s, p) => s + p.amount, 0)
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className={cn('text-xs font-semibold uppercase tracking-wider', tone === 'bad' ? 'text-bad' : 'text-muted')}>
          {title} · {items.length}
        </h2>
        <span className="tabular text-xs font-medium text-muted">{money(total)}</span>
      </div>
      <Card padded={false} className="divide-y divide-line">
        {items.map(render)}
      </Card>
    </section>
  )
}

// ───────────────────────── Create / edit ─────────────────────────

const RECURRENCES: PaymentRecurrence[] = ['monthly', 'weekly', 'quarterly', 'yearly', 'none']

function PaymentSheet({ payment, onClose }: { payment?: PlannedPayment; onClose: () => void }) {
  const cats = useStore((s) => s.financeCategories)
  const methods = useStore((s) => s.paymentMethods)
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)

  const expenseCats = useMemo(
    () => cats.filter((c) => c.type === 'expense' && (!c.archived || c.id === payment?.categoryId)),
    [cats, payment?.categoryId],
  )
  const has = (id: string) => expenseCats.some((c) => c.id === id)
  const defaultCategory = (sub: boolean) =>
    (sub && has('fc-subscriptions') ? 'fc-subscriptions' : has('fc-bills') ? 'fc-bills' : expenseCats[0]?.id) ?? ''

  const [name, setName] = useState(payment?.name ?? '')
  const [amountText, setAmountText] = useState(payment ? String(payment.amount) : '')
  const [categoryId, setCategoryId] = useState(payment?.categoryId ?? defaultCategory(false))
  const [catTouched, setCatTouched] = useState(!!payment)
  const [nextDue, setNextDue] = useState(payment?.nextDue ?? todayISO())
  const [recurrence, setRecurrence] = useState<PaymentRecurrence>(payment?.recurrence ?? 'monthly')
  const [methodId, setMethodId] = useState(payment?.paymentMethodId ?? '')
  const [isSubscription, setIsSubscription] = useState(payment?.isSubscription ?? false)
  const [notes, setNotes] = useState(payment?.notes ?? '')
  const [errors, setErrors] = useState<{ name?: string; amount?: string; date?: string; category?: string }>({})

  const save = () => {
    const n = name.trim()
    const amount = parseAmount(amountText)
    const next: typeof errors = {}
    if (!n) next.name = 'Give it a name'
    if (!isFinite(amount) || amount <= 0) next.amount = 'Enter an amount greater than zero'
    if (!isValidISO(nextDue)) next.date = 'Pick a due date'
    if (!categoryId) next.category = 'Pick a category'
    setErrors(next)
    if (Object.keys(next).length) return
    const fields = {
      name: n,
      amount: roundCents(amount),
      categoryId,
      nextDue,
      recurrence,
      paymentMethodId: methodId || undefined,
      isSubscription,
      notes: notes.trim() || undefined,
    }
    if (payment) {
      patch('plannedPayments', payment.id, fields)
      toast('Payment updated')
    } else {
      insert('plannedPayments', { ...fields, id: uid(), active: true, createdAt: Date.now() })
      toast('Payment planned')
    }
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={payment ? 'Edit payment' : 'Plan a payment'}
      footer={
        <>
          {payment && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="text-bad"
              onClick={() => void deletePayment(payment, onClose)}
            >
              Delete
            </Button>
          )}
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
        <Field label="Name" error={errors.name}>
          <Input data-autofocus value={name} placeholder="Rent, Electricity, Netflix…" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" error={errors.amount}>
            <MoneyInput placeholder="0.00" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </Field>
          <Field label="Next due" error={errors.date}>
            <Input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeats">
            <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as PaymentRecurrence)}>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>{RECURRENCE_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Payment method">
            <Select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">—</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Category" error={errors.category}>
          <Select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setCatTouched(true)
            }}
          >
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>
            ))}
          </Select>
        </Field>
        <Toggle
          checked={isSubscription}
          onChange={(v) => {
            setIsSubscription(v)
            if (!catTouched) setCategoryId(defaultCategory(v))
          }}
          label="Subscription"
          description="Streaming, software, memberships. Tracked with renewal dates."
        />
        <Field label="Notes">
          <Textarea className="min-h-16" value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
