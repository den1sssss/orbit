import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown, ArrowUp, Copy, Eye, EyeOff, Info, Lock, Pencil, Pin, PinOff, Plus, Search, ShieldAlert, ShieldCheck,
  Trash2, Vault as VaultIcon, X,
} from 'lucide-react'
import {
  Badge, Button, Card, Chip, cn, EmptyState, Field, IconButton, Input, Select, Sheet, Textarea, Toggle,
} from '@/components/ui'
import { fmt, isValidISO, todayISO } from '@/lib/dates'
import { isEncrypted, verifyPasscode } from '@/lib/persistence'
import { isIOS } from '@/lib/platform'
import { makeVaultItem, uid, useStore } from '@/lib/store'
import { confirm, removeWithUndo, toast } from '@/lib/ui'
import type { ID, ISODate, VaultField, VaultItem, VaultKind } from '@/lib/types'
import { IconTile, LifeHeader, useQueryAction } from './common'
import {
  copyText, expiryInfo, markVaultUnlocked, REMASK_MS, templateFields, VAULT_KIND_KEYS, VAULT_KINDS, vaultUnlocked,
} from './lib'

const MASK = '••••••••'

// ───────────────────────── Passcode gate ─────────────────────────

function PasscodeSheet({ onResult }: { onResult: (ok: boolean) => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!code || busy) return
    setBusy(true)
    setError('')
    try {
      if (await verifyPasscode(code)) {
        markVaultUnlocked()
        onResult(true)
      } else {
        setError('Wrong passcode')
        setCode('')
      }
    } catch {
      setError('Couldn’t check the passcode')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open
      size="sm"
      onClose={() => onResult(false)}
      title="Enter passcode"
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => onResult(false)}>Cancel</Button>
          <Button variant="primary" icon={Lock} disabled={!code || busy} onClick={() => void submit()}>
            {busy ? 'Checking…' : 'Unlock'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Secrets stay available for 2 minutes after you unlock, and hide again on their own.
        </p>
        <Field error={error}>
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            aria-label="Passcode"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setError('')
            }}
          />
        </Field>
      </form>
    </Sheet>
  )
}

/** `ensure()` resolves once secrets may be shown — asking for the passcode when needed. */
function useVaultGate() {
  const [pending, setPending] = useState<((ok: boolean) => void) | null>(null)
  const ensure = useCallback((): Promise<{ ok: boolean; prompted: boolean }> => {
    if (!isEncrypted() || vaultUnlocked()) return Promise.resolve({ ok: true, prompted: false })
    return new Promise((resolve) => {
      setPending(() => (ok: boolean) => resolve({ ok, prompted: true }))
    })
  }, [])
  const sheet = pending ? (
    <PasscodeSheet
      onResult={(ok) => {
        pending(ok)
        setPending(null)
      }}
    />
  ) : null
  return { ensure, sheet }
}

type Ensure = ReturnType<typeof useVaultGate>['ensure']

function ExpiryBadge({ expiresOn, today }: { expiresOn?: ISODate; today: ISODate }) {
  const info = expiryInfo(expiresOn, today)
  if (!info) return null
  return <Badge tone={info.tone}>{info.label}</Badge>
}

// ───────────────────────── Detail ─────────────────────────

function FieldRow({ field, shown, onReveal, onCopy }: {
  field: VaultField
  shown: boolean
  onReveal: () => void
  onCopy: () => void
}) {
  const empty = !field.value
  return (
    <div className="flex min-h-14 items-center gap-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[12px] font-medium text-muted">
          {field.secret && <Lock size={11} />}
          {field.label || 'Field'}
        </p>
        <p
          className={cn(
            'mt-0.5 break-all text-[15px] leading-snug',
            empty ? 'text-muted' : 'text-ink',
            field.secret && !shown && !empty && 'tracking-widest text-ink-2',
          )}
        >
          {empty ? '—' : field.secret && !shown ? MASK : field.value}
        </p>
      </div>
      {!empty && field.secret && (
        <IconButton icon={shown ? EyeOff : Eye} label={shown ? `Hide ${field.label}` : `Reveal ${field.label}`} onClick={onReveal} />
      )}
      {!empty && <IconButton icon={Copy} label={`Copy ${field.label}`} onClick={onCopy} />}
    </div>
  )
}

function VaultDetailSheet({ item, ensure, onClose, onEdit }: {
  item: VaultItem
  ensure: Ensure
  onClose: () => void
  onEdit: () => void
}) {
  const patch = useStore((s) => s.patch)
  const [revealed, setRevealed] = useState<Set<ID>>(new Set())
  const timers = useRef(new Map<ID, number>())
  const today = todayISO()
  const meta = VAULT_KINDS[item.kind] ?? VAULT_KINDS.other

  const hide = useCallback((id: ID) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setRevealed((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
  }, [])

  useEffect(() => {
    const map = timers.current
    // Hide everything when the app goes to the background (app switcher snapshots).
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        map.forEach((t) => window.clearTimeout(t))
        map.clear()
        setRevealed(new Set())
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      map.forEach((t) => window.clearTimeout(t))
      map.clear()
    }
  }, [])

  const reveal = async (f: VaultField) => {
    if (revealed.has(f.id)) return hide(f.id)
    const { ok } = await ensure()
    if (!ok) return
    setRevealed((s) => new Set(s).add(f.id))
    window.clearTimeout(timers.current.get(f.id))
    timers.current.set(f.id, window.setTimeout(() => hide(f.id), REMASK_MS))
  }

  const copy = async (f: VaultField) => {
    if (f.secret) {
      const { ok, prompted } = await ensure()
      if (!ok) return
      // iOS only allows clipboard writes directly inside a tap; the passcode check broke that chain.
      if (prompted && isIOS()) {
        toast('Unlocked for 2 minutes — tap Copy again')
        return
      }
    }
    const done = await copyText(f.value)
    if (done) toast(`${f.label || 'Value'} copied`)
    else toast(f.secret ? 'Couldn’t copy — tap Copy again' : 'Couldn’t copy', { tone: 'error' })
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${item.title}”?`,
      message: 'All its fields and notes will be removed.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    onClose()
    removeWithUndo('vault', item.id, 'Vault item deleted')
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.title}
      headerAction={
        <IconButton
          size="sm"
          icon={item.pinned ? PinOff : Pin}
          label={item.pinned ? 'Unpin' : 'Pin to top'}
          onClick={() => patch('vault', item.id, { pinned: !item.pinned })}
        />
      }
      footer={
        <>
          <Button variant="ghost" icon={Trash2} className="text-bad!" onClick={() => void remove()}>Delete</Button>
          <div className="flex-1" />
          <Button variant="primary" icon={Pencil} onClick={onEdit}>Edit</Button>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge color={meta.color}>{meta.label}</Badge>
        <ExpiryBadge expiresOn={item.expiresOn} today={today} />
        {item.expiresOn && (
          <span className="text-[12.5px] text-muted">Expiry date {fmt(item.expiresOn, 'd MMM yyyy')}</span>
        )}
      </div>
      {item.fields.length ? (
        <div className="divide-y divide-line">
          {item.fields.map((f) => (
            <FieldRow
              key={f.id}
              field={f}
              shown={revealed.has(f.id)}
              onReveal={() => void reveal(f)}
              onCopy={() => void copy(f)}
            />
          ))}
        </div>
      ) : (
        <EmptyState compact icon={meta.icon} title="No fields" description="Edit this item to add numbers, names or codes." />
      )}
      {item.notes && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3">
          <p className="text-[12px] font-medium text-muted">Notes</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{item.notes}</p>
        </div>
      )}
      {item.fields.some((f) => f.secret && f.value) && (
        <p className="mt-3 text-xs text-muted">Revealed values hide again after 30 seconds.</p>
      )}
    </Sheet>
  )
}

// ───────────────────────── Editor ─────────────────────────

function FieldEditor({ field, first, last, onChange, onMove, onRemove }: {
  field: VaultField
  first: boolean
  last: boolean
  onChange: (p: Partial<VaultField>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const [visible, setVisible] = useState(false)
  const masked = field.secret && !visible
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-2.5">
      <div className="flex items-center gap-0.5">
        <Input
          value={field.label}
          placeholder="Label"
          aria-label="Field label"
          onChange={(e) => onChange({ label: e.target.value })}
          className="mr-1 flex-1 font-medium"
        />
        <IconButton icon={ArrowUp} label="Move up" disabled={first} onClick={() => onMove(-1)} />
        <IconButton icon={ArrowDown} label="Move down" disabled={last} onClick={() => onMove(1)} />
        <IconButton icon={Trash2} label="Remove field" onClick={onRemove} />
      </div>
      <div className="mt-2 flex items-center gap-1">
        <Input
          value={field.value}
          placeholder="Value"
          aria-label={`${field.label || 'Field'} value`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange({ value: e.target.value })}
          className={cn('min-w-0 flex-1', masked && '[-webkit-text-security:disc]')}
        />
        {field.secret && (
          <IconButton icon={visible ? EyeOff : Eye} label={visible ? 'Hide value' : 'Show value'} onClick={() => setVisible((v) => !v)} />
        )}
        <button
          type="button"
          aria-pressed={field.secret}
          onClick={() => onChange({ secret: !field.secret })}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition-colors',
            field.secret ? 'bg-accent-soft text-accent-text' : 'border border-line bg-surface text-muted hover:text-ink',
          )}
        >
          <Lock size={14} />
          Secret
        </button>
      </div>
    </div>
  )
}

function VaultEditorSheet({ item, initialKind, onClose, onSaved }: {
  item?: VaultItem
  initialKind?: VaultKind
  onClose: () => void
  onSaved?: (id: ID) => void
}) {
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const startKind = item?.kind ?? initialKind ?? 'id'
  const [title, setTitle] = useState(item?.title ?? '')
  const [kind, setKind] = useState<VaultKind>(startKind)
  const [fields, setFields] = useState<VaultField[]>(() => item?.fields.map((f) => ({ ...f })) ?? templateFields(startKind))
  const [expiresOn, setExpiresOn] = useState(item?.expiresOn ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [pinned, setPinned] = useState(item?.pinned ?? false)
  const [error, setError] = useState('')

  const changeKind = (k: VaultKind) => {
    setKind(k)
    // Swap in the new kind's labels while nothing has been typed yet.
    if (fields.every((f) => !f.value.trim())) setFields(templateFields(k))
  }
  const update = (id: ID, p: Partial<VaultField>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)))
  const move = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const j = i + dir
      if (j < 0 || j >= fs.length) return fs
      const next = [...fs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const save = () => {
    const t = title.trim()
    if (!t) return setError('Give it a name')
    const clean = fields
      .filter((f) => f.label.trim() || f.value.trim())
      .map((f) => ({ ...f, label: f.label.trim() || 'Field', value: f.value.trim() }))
    const data = {
      title: t,
      kind,
      fields: clean,
      expiresOn: isValidISO(expiresOn) ? expiresOn : undefined,
      notes: notes.trim() || undefined,
      pinned,
    }
    if (item) {
      patch('vault', item.id, data)
      toast('Saved')
      onSaved?.(item.id)
    } else {
      const created = insert('vault', makeVaultItem(data))
      toast('Added to vault')
      onSaved?.(created.id)
    }
    onClose()
  }

  return (
    <Sheet
      open
      size="lg"
      onClose={onClose}
      title={item ? 'Edit vault item' : 'New vault item'}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <Field label="Name" error={error}>
            <Input
              value={title}
              placeholder={kind === 'id' ? 'e.g. Passport' : kind === 'insurance' ? 'e.g. Health insurance' : 'Name'}
              onChange={(e) => {
                setTitle(e.target.value)
                setError('')
              }}
            />
          </Field>
          <Field label="Kind">
            <Select value={kind} onChange={(e) => changeKind(e.target.value as VaultKind)}>
              {VAULT_KIND_KEYS.map((k) => <option key={k} value={k}>{VAULT_KINDS[k].label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium text-ink-2">Fields</p>
          {fields.map((f, i) => (
            <FieldEditor
              key={f.id}
              field={f}
              first={i === 0}
              last={i === fields.length - 1}
              onChange={(p) => update(f.id, p)}
              onMove={(dir) => move(i, dir)}
              onRemove={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}
            />
          ))}
          <Button
            variant="soft"
            icon={Plus}
            onClick={() => setFields((fs) => [...fs, { id: uid(), label: '', value: '', secret: false }])}
          >
            Add field
          </Button>
          <p className="text-xs text-muted">Secret fields stay masked until you reveal them.</p>
          {kind === 'account' && (
            <p className="flex items-start gap-1.5 text-xs text-warn">
              <Info size={13} className="mt-px shrink-0" />
              For passwords, a dedicated password manager is safer.
            </p>
          )}
        </div>

        <Field label="Expires on" hint="Shows a warning on the Life overview 60 days ahead.">
          <div className="flex gap-2">
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className="min-w-0 flex-1" />
            {expiresOn && <IconButton icon={X} label="Clear expiry date" variant="secondary" onClick={() => setExpiresOn('')} />}
          </div>
        </Field>

        <Field label="Notes" hint="Notes aren’t masked — keep numbers and codes in secret fields.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20!" />
        </Field>

        <Toggle checked={pinned} onChange={setPinned} label="Pin to top" />
      </div>
    </Sheet>
  )
}

// ───────────────────────── Page ─────────────────────────

function VaultCard({ item, today, onOpen }: { item: VaultItem; today: ISODate; onOpen: () => void }) {
  const meta = VAULT_KINDS[item.kind] ?? VAULT_KINDS.other
  const secrets = item.fields.filter((f) => f.secret).length
  const n = item.fields.length
  return (
    <Card as="button" onClick={onOpen} className="w-full">
      <div className="flex items-start gap-3">
        <IconTile icon={meta.icon} color={meta.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[15px] font-semibold text-ink">{item.title}</p>
            {item.pinned && <Pin size={13} className="shrink-0 text-muted" aria-label="Pinned" />}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {meta.label} · {n} field{n === 1 ? '' : 's'}
            {secrets ? ` · ${secrets} hidden` : ''}
          </p>
        </div>
      </div>
      {item.expiresOn && (
        <div className="mt-2.5 pl-[52px]">
          <ExpiryBadge expiresOn={item.expiresOn} today={today} />
        </div>
      )}
    </Card>
  )
}

function PrivacyBanner() {
  if (isEncrypted()) {
    return (
      <p className="mb-4 flex items-center gap-2 text-[13px] text-muted">
        <ShieldCheck size={16} className="shrink-0 text-good" />
        Encrypted on this device · secrets ask for your passcode
      </p>
    )
  }
  return (
    <div className="mb-4 flex gap-3 rounded-2xl border border-warn/25 bg-warn-soft p-4">
      <ShieldAlert size={20} className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">Your vault isn’t encrypted</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
          Data is only encrypted at rest once you set a passcode. Until then anyone who can open Orbit on this device can read it.
        </p>
        <Link
          to="/settings"
          className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface px-3.5 text-sm font-medium text-ink shadow-card hover:bg-surface-2"
        >
          <Lock size={15} />
          Set a passcode
        </Link>
      </div>
    </div>
  )
}

type Filter = VaultKind | 'all'

export function VaultPage() {
  const vault = useStore((s) => s.vault)
  const { ensure, sheet: gateSheet } = useVaultGate()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [detailId, setDetailId] = useState<ID | null>(null)
  const [editor, setEditor] = useState<{ item?: VaultItem; kind?: VaultKind } | null>(null)
  const today = todayISO()

  useQueryAction('new', (v) => setEditor({ kind: (VAULT_KIND_KEYS as string[]).includes(v) ? (v as VaultKind) : undefined }))
  useQueryAction('open', (id) => {
    if (useStore.getState().vault.some((v) => v.id === id)) setDetailId(id)
  })

  const counts = useMemo(() => {
    const m = new Map<VaultKind, number>()
    for (const v of vault) m.set(v.kind, (m.get(v.kind) ?? 0) + 1)
    return m
  }, [vault])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vault
      .filter((v) => filter === 'all' || v.kind === filter)
      // Titles and labels only — never values.
      .filter((v) => !q || v.title.toLowerCase().includes(q) || v.fields.some((f) => f.label.toLowerCase().includes(q)))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.title.localeCompare(b.title))
  }, [vault, filter, query])

  const detail = detailId ? vault.find((v) => v.id === detailId) : undefined

  const edit = async (item: VaultItem) => {
    if (item.fields.some((f) => f.secret && f.value)) {
      const { ok } = await ensure()
      if (!ok) return
    }
    setDetailId(null)
    setEditor({ item })
  }

  return (
    <>
      <LifeHeader />
      <PrivacyBanner />

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Documents, IDs, policies & useful info</p>
        <Button variant="primary" icon={Plus} onClick={() => setEditor({})}>Add</Button>
      </div>

      {vault.length > 0 && (
        <>
          <div className="-mx-4 mb-3 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            <div className="flex w-max gap-2">
              <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={vault.length}>All</Chip>
              {VAULT_KIND_KEYS.filter((k) => counts.get(k) || filter === k).map((k) => (
                <Chip key={k} active={filter === k} icon={VAULT_KINDS[k].icon} count={counts.get(k) ?? 0} onClick={() => setFilter(k)}>
                  {VAULT_KINDS[k].label}
                </Chip>
              ))}
            </div>
          </div>
          {vault.length >= 6 && (
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search names and labels"
                aria-label="Search vault"
                className="pl-9!"
              />
            </div>
          )}
        </>
      )}

      {vault.length === 0 ? (
        <Card>
          <EmptyState
            icon={VaultIcon}
            title="Your vault is empty"
            description="Keep passport and ID numbers, insurance policies, car details, medical info and Wi-Fi codes in one place."
            action={<Button variant="primary" icon={Plus} onClick={() => setEditor({ kind: 'id' })}>Add an ID document</Button>}
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState compact icon={Search} title="Nothing matches" description="Try another filter or search." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((v) => <VaultCard key={v.id} item={v} today={today} onOpen={() => setDetailId(v.id)} />)}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-[13px] text-muted">
        <Info size={15} className="mt-0.5 shrink-0" />
        For passwords, a dedicated password manager is safer.
      </p>

      {detail && (
        <VaultDetailSheet item={detail} ensure={ensure} onClose={() => setDetailId(null)} onEdit={() => void edit(detail)} />
      )}
      {editor && (
        <VaultEditorSheet
          item={editor.item}
          initialKind={editor.kind}
          onClose={() => setEditor(null)}
          onSaved={(id) => setDetailId(id)}
        />
      )}
      {gateSheet}
    </>
  )
}
