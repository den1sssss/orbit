import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, UserPlus } from 'lucide-react'
import {
  Button, cn, ColorPicker, Field, Input, MoneyInput, Segmented, Select, Sheet, Textarea, Toggle,
} from '@/components/ui'
import { guardClose, useDraft } from '@/components/editors/useDraft'
import { INVOICE_KIND_LABELS, nextInvoiceNumber } from '@/lib/business'
import { addDaysISO, diffDays, todayISO } from '@/lib/dates'
import { parseAmount } from '@/lib/format'
import { makeClient, makeInvoice, uid, useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import type { Client, ID, Invoice, InvoiceKind, InvoiceStatus, Project } from '@/lib/types'
import {
  closeBizSheet, deleteClient, deleteProject, nextColor, PROJECT_STATUS_LABELS, roundCents, shortDate, useBizSheet,
} from './lib'

/** Drop undefined keys so they don't override factory defaults. */
function defined<T extends object>(o: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Renders whichever business sheet `openBizSheet()` asked for. Mounted once in BusinessPage. */
export function BusinessSheetHost() {
  const { sheet, seq } = useBizSheet()
  // Leaving the module must not leave a sheet queued for the next visit.
  useEffect(() => () => closeBizSheet(), [])
  if (!sheet) return null
  switch (sheet.kind) {
    case 'invoice':
      return <InvoiceSheet key={seq} id={sheet.id} initial={sheet.initial} onClose={closeBizSheet} />
    case 'project':
      return <ProjectSheet key={seq} id={sheet.id} initial={sheet.initial} onClose={closeBizSheet} />
    case 'client':
      return <ClientSheet key={seq} id={sheet.id} initial={sheet.initial} onClose={closeBizSheet} />
  }
}

// ───────────────────────── Pickers ─────────────────────────

/** Client picker with inline "New client". */
export function ClientSelect({ value, onChange }: { value?: ID; onChange: (id: ID | undefined) => void }) {
  const clients = useStore((s) => s.clients)
  const insert = useStore((s) => s.insert)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const options = useMemo(
    () => clients.filter((c) => !c.archived || c.id === value).sort((a, b) => a.name.localeCompare(b.name)),
    [clients, value],
  )
  const create = () => {
    const n = name.trim()
    if (!n) return
    const c = insert('clients', makeClient({ name: n, color: nextColor(clients.length) }))
    onChange(c.id)
    setCreating(false)
    setName('')
    toast(`Client “${c.name}” added`)
  }
  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={name}
          placeholder="Client name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              create()
            }
          }}
        />
        <Button variant="primary" onClick={create}>Add</Button>
        <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
      </div>
    )
  }
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') setCreating(true)
        else onChange(e.target.value || undefined)
      }}
    >
      <option value="">No client</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.company ? `${c.name} · ${c.company}` : c.name}
        </option>
      ))}
      <option value="__new">+ New client…</option>
    </Select>
  )
}

/** Project picker (this client's projects first) with inline "New project" linked to the client. */
function ProjectPicker({ value, clientId, onChange }: {
  value?: ID
  clientId?: ID
  onChange: (id: ID | undefined) => void
}) {
  const projects = useStore((s) => s.projects)
  const insert = useStore((s) => s.insert)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const options = useMemo(
    () =>
      projects
        .filter((p) => p.id === value || (p.status !== 'done' && (!clientId || !p.clientId || p.clientId === clientId)))
        .sort((a, b) => Number(b.clientId === clientId) - Number(a.clientId === clientId) || a.name.localeCompare(b.name)),
    [projects, value, clientId],
  )
  const create = () => {
    const n = name.trim()
    if (!n) return
    const p = insert('projects', {
      id: uid(), name: n, status: 'active', createdAt: Date.now(), color: nextColor(projects.length),
      ...(clientId ? { clientId } : {}),
    })
    onChange(p.id)
    setCreating(false)
    setName('')
  }
  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={name}
          placeholder="Project name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              create()
            }
          }}
        />
        <Button variant="primary" onClick={create}>Add</Button>
        <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
      </div>
    )
  }
  return (
    <Select
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new') setCreating(true)
        else onChange(e.target.value || undefined)
      }}
    >
      <option value="">No project</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
      <option value="__new">+ New project…</option>
    </Select>
  )
}

function DueChips({ issue, value, onChange }: { issue: string; value?: string; onChange: (d: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[7, 14, 30].map((n) => {
        const d = addDaysISO(issue, n)
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(d)}
            className={cn(
              'h-8 rounded-lg px-3 text-xs font-medium transition-colors',
              value === d ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-ink-2 hover:text-ink',
            )}
          >
            +{n} days
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────── Invoice ─────────────────────────

const KINDS: InvoiceKind[] = ['invoice', 'freelance', 'commission']

export function InvoiceSheet({ id, initial, onClose }: { id?: ID; initial?: Partial<Invoice>; onClose: () => void }) {
  const existing = useStore((s) => (id ? s.invoices.find((x) => x.id === id) : undefined))
  const projects = useStore((s) => s.projects)
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const [errors, setErrors] = useState<Partial<Record<'title' | 'amount' | 'number' | 'due', string>>>({})
  const [recordNow, setRecordNow] = useState(false)

  const { draft, set, merge, dirty } = useDraft<Invoice>(() => {
    if (existing) return { ...existing }
    const issueDate = initial?.issueDate ?? todayISO()
    return makeInvoice({
      title: '',
      amount: 0,
      number: nextInvoiceNumber(useStore.getState().invoices),
      issueDate,
      dueDate: initial && 'dueDate' in initial ? initial.dueDate : addDaysISO(issueDate, 14),
      ...defined(initial),
    })
  })
  const [amountText, setAmountText] = useState(() => {
    const a = existing?.amount ?? initial?.amount
    return a ? String(a) : ''
  })

  const numberTaken = useMemo(
    () => useStore.getState().invoices.some((i) => i.id !== draft.id && i.number.trim() === draft.number.trim()),
    [draft.id, draft.number],
  )

  if (id && !existing) return null
  const isPaid = existing?.status === 'paid'

  const pickProject = (pid: ID | undefined) => {
    const p = projects.find((x) => x.id === pid)
    merge({ projectId: pid, ...(p?.clientId && !draft.clientId ? { clientId: p.clientId } : {}) })
  }

  const save = () => {
    const e: typeof errors = {}
    const title = draft.title.trim()
    const number = draft.number.trim()
    const amount = parseAmount(amountText)
    if (!title) e.title = 'Give it a title, e.g. “Website redesign”'
    if (!number) e.number = 'Needs a number'
    if (!isFinite(amount) || amount <= 0) e.amount = 'Enter an amount greater than zero'
    if (draft.dueDate && draft.dueDate < draft.issueDate) e.due = 'Due date is before the issue date'
    setErrors(e)
    if (Object.keys(e).length) return
    const final: Invoice = {
      ...draft,
      title,
      number,
      amount: roundCents(amount),
      notes: draft.notes?.trim() || undefined,
      dueDate: draft.dueDate || undefined,
    }
    const st = useStore.getState()
    if (existing) {
      patch('invoices', existing.id, final)
      // Keep the recorded payment in step with the invoice.
      if (existing.status === 'paid' && existing.transactionId) {
        const client = st.clients.find((c) => c.id === final.clientId)
        patch('transactions', existing.transactionId, {
          amount: final.amount,
          projectId: final.projectId,
          ...(final.paidDate ? { date: final.paidDate } : {}),
          payee: client?.name ?? final.title,
          note: `${final.number} · ${final.title}`,
        })
      }
      toast('Invoice updated')
    } else {
      insert('invoices', final)
      if (recordNow) {
        st.markInvoicePaid(final.id)
        toast(`${final.number} saved · payment recorded`, {
          action: { label: 'Undo', onClick: () => useStore.getState().unmarkInvoicePaid(final.id) },
        })
      } else {
        toast(`${final.number} saved`)
      }
    }
    onClose()
  }

  const close = () => guardClose(dirty, onClose)
  const statusOptions: { value: InvoiceStatus; label: string }[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    ...(draft.status === 'cancelled' ? [{ value: 'cancelled' as const, label: 'Cancelled' }] : []),
  ]

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? `Edit ${existing.number}` : `New ${INVOICE_KIND_LABELS[draft.kind].toLowerCase()}`}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>Cancel</Button>
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
        <Segmented<InvoiceKind>
          block
          value={draft.kind}
          onChange={(v) => set('kind', v)}
          options={KINDS.map((k) => ({ value: k, label: INVOICE_KIND_LABELS[k] }))}
        />

        <Field label="Title" error={errors.title}>
          <Input
            data-autofocus
            value={draft.title}
            placeholder={draft.kind === 'commission' ? 'e.g. Referral – Smith deal' : 'e.g. Website redesign'}
            onChange={(e) => {
              set('title', e.target.value)
              setErrors((x) => ({ ...x, title: undefined }))
            }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" error={errors.amount}>
            <MoneyInput
              placeholder="0.00"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value)
                setErrors((x) => ({ ...x, amount: undefined }))
              }}
            />
          </Field>
          <Field label="Number" error={errors.number} hint={numberTaken ? 'Already used by another invoice' : undefined}>
            <Input value={draft.number} onChange={(e) => set('number', e.target.value)} />
          </Field>
        </div>

        <Field label="Client">
          <ClientSelect value={draft.clientId} onChange={(v) => set('clientId', v)} />
        </Field>
        <Field label="Project">
          <ProjectPicker value={draft.projectId} clientId={draft.clientId} onChange={pickProject} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Issued">
            <Input
              type="date"
              value={draft.issueDate}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                // Keep the payment term when moving the issue date.
                const term = draft.dueDate ? diffDays(draft.dueDate, draft.issueDate) : undefined
                merge({ issueDate: v, ...(term !== undefined && term >= 0 ? { dueDate: addDaysISO(v, term) } : {}) })
              }}
            />
          </Field>
          <Field label="Due" error={errors.due}>
            <Input
              type="date"
              value={draft.dueDate ?? ''}
              onChange={(e) => {
                set('dueDate', e.target.value || undefined)
                setErrors((x) => ({ ...x, due: undefined }))
              }}
            />
          </Field>
        </div>
        <DueChips issue={draft.issueDate} value={draft.dueDate} onChange={(d) => set('dueDate', d)} />

        {isPaid ? (
          <div className="rounded-xl bg-good-soft p-3">
            <Field label={<span className="text-good">Paid on</span>}>
              <Input type="date" value={draft.paidDate ?? ''} onChange={(e) => e.target.value && set('paidDate', e.target.value)} />
            </Field>
            <p className="mt-2 text-xs text-ink-2">Changes here update the recorded payment. Use “Mark unpaid” in the list to undo it.</p>
          </div>
        ) : (
          <Field label="Status" hint={draft.status === 'draft' ? 'Drafts don’t count as money you’re owed yet.' : undefined}>
            <Segmented<InvoiceStatus>
              block
              value={draft.status}
              onChange={(v) => set('status', v)}
              options={statusOptions}
            />
          </Field>
        )}

        {!existing && (
          <Toggle
            checked={recordNow}
            onChange={setRecordNow}
            label="Already paid"
            description="Record the payment as business income today"
          />
        )}

        <Field label="Notes">
          <Textarea
            className="min-h-16"
            value={draft.notes ?? ''}
            placeholder="Payment details, scope, PO number…"
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}

// ───────────────────────── Project ─────────────────────────

const PROJECT_STATUSES: Project['status'][] = ['active', 'paused', 'done']

export function ProjectSheet({ id, initial, onClose }: { id?: ID; initial?: Partial<Project>; onClose: () => void }) {
  const navigate = useNavigate()
  const existing = useStore((s) => (id ? s.projects.find((x) => x.id === id) : undefined))
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const [errors, setErrors] = useState<{ name?: string; fee?: string }>({})
  const { draft, set, dirty } = useDraft<Project>(() =>
    existing
      ? { ...existing }
      : {
          id: uid(),
          name: '',
          status: 'active',
          color: nextColor(useStore.getState().projects.length),
          createdAt: Date.now(),
          ...defined(initial),
        },
  )
  const [feeText, setFeeText] = useState(() => (draft.fee ? String(draft.fee) : ''))

  if (id && !existing) return null

  const save = () => {
    const e: typeof errors = {}
    const name = draft.name.trim()
    if (!name) e.name = 'Give the project a name'
    const fee = feeText.trim() ? parseAmount(feeText) : undefined
    if (fee !== undefined && (!isFinite(fee) || fee < 0)) e.fee = 'Enter a valid amount'
    setErrors(e)
    if (Object.keys(e).length) return
    const final: Project = {
      ...draft,
      name,
      fee: fee ? roundCents(fee) : undefined,
      deadline: draft.deadline || undefined,
      description: draft.description?.trim() || undefined,
    }
    if (existing) {
      patch('projects', existing.id, final)
      toast('Project updated')
    } else {
      insert('projects', final)
      toast('Project created', {
        action: { label: 'Open', onClick: () => navigate(`/business/projects/${final.id}`) },
      })
    }
    onClose()
  }

  const legacyClient = existing && !draft.clientId ? existing.client?.trim() : undefined
  const close = () => guardClose(dirty, onClose)

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? 'Edit project' : 'New project'}
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="text-bad"
              onClick={() => void deleteProject(existing).then((ok) => ok && onClose())}
            >
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>Cancel</Button>
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
          <Input
            data-autofocus
            value={draft.name}
            placeholder="e.g. Acme website"
            onChange={(e) => {
              set('name', e.target.value)
              setErrors((x) => ({ ...x, name: undefined }))
            }}
          />
        </Field>

        <Field label="Client">
          <ClientSelect value={draft.clientId} onChange={(v) => set('clientId', v)} />
          {legacyClient && (
            <LegacyClientHint name={legacyClient} onCreate={(cid) => set('clientId', cid)} />
          )}
        </Field>

        <Field label="Color">
          <ColorPicker value={draft.color} onChange={(c) => set('color', c)} />
        </Field>

        <Field label="Status">
          <Segmented<Project['status']>
            block
            value={draft.status}
            onChange={(v) => set('status', v)}
            options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fee" error={errors.fee} hint={errors.fee ? undefined : 'Agreed / expected'}>
            <MoneyInput
              placeholder="0.00"
              value={feeText}
              onChange={(e) => {
                setFeeText(e.target.value)
                setErrors((x) => ({ ...x, fee: undefined }))
              }}
            />
          </Field>
          <Field
            label="Deadline"
            hint={
              draft.deadline ? (
                <button type="button" className="text-accent-text" onClick={() => set('deadline', undefined)}>
                  Clear · {shortDate(draft.deadline)}
                </button>
              ) : 'Optional'
            }
          >
            <Input type="date" value={draft.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || undefined)} />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            className="min-h-20"
            value={draft.description ?? ''}
            placeholder="Scope, deliverables, links…"
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}

/** Older projects stored the client as text: offer to turn it into a client record. */
function LegacyClientHint({ name, onCreate }: { name: string; onCreate: (id: ID) => void }) {
  const clients = useStore((s) => s.clients)
  const insert = useStore((s) => s.insert)
  const match = clients.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
      Saved as “{name}”.
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1 font-medium text-accent-text"
        onClick={() => onCreate(match ? match.id : insert('clients', makeClient({ name, color: nextColor(clients.length) })).id)}
      >
        <UserPlus size={13} />
        {match ? `Link to ${match.name}` : 'Create client'}
      </button>
    </p>
  )
}

// ───────────────────────── Client ─────────────────────────

export function ClientSheet({ id, initial, onClose }: { id?: ID; initial?: Partial<Client>; onClose: () => void }) {
  const navigate = useNavigate()
  const existing = useStore((s) => (id ? s.clients.find((x) => x.id === id) : undefined))
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const [error, setError] = useState('')
  const { draft, set, dirty } = useDraft<Client>(() =>
    existing
      ? { ...existing }
      : makeClient({ name: '', color: nextColor(useStore.getState().clients.length), ...defined(initial) }),
  )

  if (id && !existing) return null

  const save = () => {
    const name = draft.name.trim()
    if (!name) return setError('Give the client a name')
    const email = draft.email?.trim()
    const final: Client = {
      ...draft,
      name,
      company: draft.company?.trim() || undefined,
      email: email || undefined,
      phone: draft.phone?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
    }
    if (existing) {
      patch('clients', existing.id, final)
      toast('Client updated')
    } else {
      insert('clients', final)
      toast('Client added', { action: { label: 'Open', onClick: () => navigate(`/business/clients/${final.id}`) } })
    }
    onClose()
  }

  const close = () => guardClose(dirty, onClose)

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? 'Edit client' : 'New client'}
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              icon={Trash2}
              className="text-bad"
              onClick={() => void deleteClient(existing).then((ok) => ok && onClose())}
            >
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>Cancel</Button>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={error}>
            <Input
              data-autofocus
              value={draft.name}
              placeholder="Contact name"
              autoComplete="off"
              onChange={(e) => {
                set('name', e.target.value)
                setError('')
              }}
            />
          </Field>
          <Field label="Company">
            <Input value={draft.company ?? ''} placeholder="Optional" autoComplete="off" onChange={(e) => set('company', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              value={draft.email ?? ''}
              placeholder="name@company.com"
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={draft.phone ?? ''}
              placeholder="+1 555 123 4567"
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={draft.color} onChange={(c) => set('color', c)} />
        </Field>
        <Field label="Notes">
          <Textarea
            className="min-h-20"
            value={draft.notes ?? ''}
            placeholder="Rates, preferences, billing address…"
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
        {existing && (
          <Toggle
            checked={!!draft.archived}
            onChange={(v) => set('archived', v || undefined)}
            label="Archived"
            description="Hide from lists and pickers; history stays linked"
          />
        )}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
