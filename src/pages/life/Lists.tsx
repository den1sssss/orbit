import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Check, CheckCheck, ChevronDown, ChevronLeft, ListChecks, Palette, Pencil, Pin, PinOff, Plus, RotateCcw, Trash2,
} from 'lucide-react'
import {
  Badge, Button, Card, cn, ColorPicker, EmptyState, Field, Input, Menu, PageHeader, Progress,
  SectionTitle, Sheet, Toggle, type MenuItem,
} from '@/components/ui'
import { colorHex } from '@/lib/icons'
import { makeList, useStore } from '@/lib/store'
import { confirm, removeWithUndo, toast } from '@/lib/ui'
import type { ColorKey, ID, ListItem, OrgList } from '@/lib/types'
import { BIG_MENU, IconTile, KindPicker, LifeHeader, useQueryAction } from './common'
import {
  LIST_KIND_KEYS, LIST_KINDS, LIST_TEMPLATES, listCounts, newItem, parseItem, qtyLabel, toggleItem, updateItems,
  type ListKind, type ListTemplate,
} from './lib'

const KIND_OPTIONS = LIST_KIND_KEYS.map((k) => ({ value: k, label: LIST_KINDS[k].label, icon: LIST_KINDS[k].icon }))
const KIND_COLORS: Record<ListKind, ColorKey> = { shopping: 'green', packing: 'blue', errands: 'amber', other: 'indigo' }

// ───────────────────────── Settings sheet (create / edit) ─────────────────────────

export function ListSettingsSheet({ list, onClose, onCreated }: {
  /** Undefined = create a new list. */
  list?: OrgList
  onClose: () => void
  onCreated?: (list: OrgList) => void
}) {
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const [name, setName] = useState(list?.name ?? '')
  const [kind, setKind] = useState<ListKind>(list?.kind ?? 'shopping')
  const [color, setColor] = useState<ColorKey>(list?.color ?? 'green')
  const [colorTouched, setColorTouched] = useState(!!list)
  const [pinned, setPinned] = useState(list?.pinned ?? false)
  const [error, setError] = useState('')

  const save = () => {
    const n = name.trim()
    if (!n) return setError('Give the list a name')
    if (list) {
      patch('lists', list.id, { name: n, kind, color, pinned })
      toast('List updated')
    } else {
      const created = insert('lists', makeList({ name: n, kind, color, pinned }))
      onCreated?.(created)
    }
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={list ? 'List settings' : 'New list'}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{list ? 'Save' : 'Create'}</Button>
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
        <Field label="Name" error={error}>
          <Input
            value={name}
            placeholder="e.g. Groceries, Beach trip"
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            enterKeyHint="done"
          />
        </Field>
        <Field label="Kind">
          <KindPicker
            options={KIND_OPTIONS}
            value={kind}
            onChange={(k) => {
              setKind(k)
              if (!colorTouched) setColor(KIND_COLORS[k])
            }}
          />
        </Field>
        <Field label="Color">
          <ColorPicker
            value={color}
            onChange={(c) => {
              setColor(c)
              setColorTouched(true)
            }}
          />
        </Field>
        <Toggle checked={pinned} onChange={setPinned} label="Pin to Overview" description="Check items off right from the Life overview." />
      </form>
    </Sheet>
  )
}

/** Create a list from a template and open it. */
function useCreateFromTemplate() {
  const insert = useStore((s) => s.insert)
  const navigate = useNavigate()
  return (t: ListTemplate) => {
    const list = insert('lists', makeList({ name: t.name, kind: t.kind, color: t.color, items: t.items.map((i) => newItem(i)) }))
    navigate(`/life/lists/${list.id}`)
  }
}

// ───────────────────────── All lists ─────────────────────────

function ListCard({ list }: { list: OrgList }) {
  const navigate = useNavigate()
  const { done, open, total } = listCounts(list)
  const meta = LIST_KINDS[list.kind] ?? LIST_KINDS.other
  return (
    <Card as="button" onClick={() => navigate(`/life/lists/${list.id}`)} className="w-full">
      <div className="flex items-start gap-3">
        <IconTile icon={meta.icon} color={list.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[15px] font-semibold text-ink">{list.name}</p>
            {list.pinned && <Pin size={13} className="shrink-0 text-muted" aria-label="Pinned" />}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {total === 0 ? 'Empty' : open === 0 ? `All ${total} done` : `${open} left · ${total} item${total === 1 ? '' : 's'}`}
          </p>
        </div>
        <span className="tabular pt-0.5 text-[13px] font-medium text-ink-2">{total ? `${done}/${total}` : ''}</span>
      </div>
      {total > 0 && <Progress className="mt-3" value={done / total} color={list.color} height={5} label={`${list.name} progress`} />}
    </Card>
  )
}

function TemplateButtons() {
  const fromTemplate = useCreateFromTemplate()
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {LIST_TEMPLATES.map((t) => {
        const Icon = LIST_KINDS[t.kind].icon
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => fromTemplate(t)}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-accent hover:bg-surface-2"
          >
            <span style={{ color: colorHex(t.color) }}><Icon size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{t.name}</span>
              <span className="block truncate text-xs text-muted">{t.items.slice(0, 3).join(', ')}…</span>
            </span>
            <Plus size={17} className="shrink-0 text-muted" />
          </button>
        )
      })}
    </div>
  )
}

export function ListsPage() {
  const lists = useStore((s) => s.lists)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  useQueryAction('new', () => setCreating(true))

  const sorted = useMemo(
    () => [...lists].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt),
    [lists],
  )

  return (
    <>
      <LifeHeader />
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {lists.length ? `${lists.length} list${lists.length === 1 ? '' : 's'}` : 'Shopping, packing, errands'}
        </p>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New list</Button>
      </div>

      {sorted.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((l) => <ListCard key={l.id} list={l} />)}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={ListChecks}
            title="No lists yet"
            description="Make a shopping, packing or errands list and check things off as you go."
            action={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New list</Button>}
          />
        </Card>
      )}

      <SectionTitle>Start from a template</SectionTitle>
      <TemplateButtons />

      {creating && (
        <ListSettingsSheet onClose={() => setCreating(false)} onCreated={(l) => navigate(`/life/lists/${l.id}`)} />
      )}
    </>
  )
}

// ───────────────────────── One list ─────────────────────────

function ItemEditor({ item, onDone }: { item: ListItem; onDone: (patch?: Partial<ListItem>) => void }) {
  const [title, setTitle] = useState(item.title)
  const [qty, setQty] = useState(item.qty ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const save = () => {
    const t = title.trim()
    if (!t) return onDone()
    onDone({ title: t, qty: qty.trim() || undefined, note: note.trim() || undefined })
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      onDone()
    }
  }
  return (
    <div className="flex flex-col gap-2 px-3.5 py-3 sm:px-4">
      <div className="flex gap-2">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onKey} aria-label="Item" className="h-11!" />
        <Input value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={onKey} placeholder="Qty" aria-label="Quantity" className="h-11! w-20 shrink-0" />
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={onKey} placeholder="Note (brand, size…)" aria-label="Note" className="h-11!" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone()}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save</Button>
      </div>
    </div>
  )
}

function ItemRow({ listId, item, color, editing, onEdit }: {
  listId: ID
  item: ListItem
  color: ColorKey
  editing: boolean
  onEdit: (on: boolean) => void
}) {
  if (editing) {
    return (
      <ItemEditor
        item={item}
        onDone={(p) => {
          if (p) updateItems(listId, (items) => items.map((i) => (i.id === item.id ? { ...i, ...p } : i)))
          onEdit(false)
        }}
      />
    )
  }
  const qty = qtyLabel(item.qty)
  const menu: MenuItem[] = [
    { label: 'Edit', icon: Pencil, onClick: () => onEdit(true) },
    {
      label: 'Delete',
      icon: Trash2,
      danger: true,
      onClick: () => {
        let index = -1
        updateItems(listId, (items) => {
          index = items.findIndex((i) => i.id === item.id)
          return items.filter((i) => i.id !== item.id)
        })
        toast('Item removed', {
          action: {
            label: 'Undo',
            onClick: () => updateItems(listId, (items) => {
              const next = [...items]
              next.splice(Math.max(0, Math.min(index, next.length)), 0, item)
              return next
            }),
          },
        })
      },
    },
  ]
  return (
    <div
      role="checkbox"
      aria-checked={item.done}
      tabIndex={0}
      onClick={() => toggleItem(listId, item.id)}
      onDoubleClick={(e) => {
        e.preventDefault()
        onEdit(true)
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          toggleItem(listId, item.id)
        }
      }}
      className="flex min-h-14 cursor-pointer select-none items-center gap-3 px-3.5 py-2 outline-none transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-2/60 focus-visible:bg-surface-2 active:bg-surface-2 sm:px-4"
    >
      <span
        aria-hidden
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all',
          item.done ? 'border-transparent text-white' : 'border-line-strong bg-surface',
        )}
        style={item.done ? { background: colorHex(color) } : { borderColor: colorHex(color) }}
      >
        {item.done && <Check size={15} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block break-words text-base leading-snug', item.done ? 'text-muted line-through decoration-1' : 'text-ink')}>
          {item.title}
        </span>
        {item.note && <span className="mt-0.5 block truncate text-[13px] text-muted">{item.note}</span>}
      </span>
      {qty && <Badge className={cn('tabular h-6! px-2! text-xs!', item.done && 'opacity-60')}>{qty}</Badge>}
      <div
        className={cn('-mr-1.5 shrink-0', BIG_MENU)}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Menu items={menu} label={`Actions for “${item.title}”`} />
      </div>
    </div>
  )
}

function AddBar({ list }: { list: OrgList }) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const raw = text.trim()
    if (!raw) return
    const { title, qty } = parseItem(raw)
    if (!title) return
    const key = title.toLowerCase()
    const current = useStore.getState().lists.find((l) => l.id === list.id)?.items ?? []
    const existing = current.find((i) => i.title.trim().toLowerCase() === key)
    if (existing && !existing.done) {
      if (qty && qty !== existing.qty) {
        updateItems(list.id, (items) => items.map((i) => (i.id === existing.id ? { ...i, qty } : i)))
        toast(`Updated ${existing.title} to ${qtyLabel(qty)}`)
      } else {
        toast(`${existing.title} is already on the list`)
      }
    } else if (existing) {
      // Reuse the checked-off item (keeps notes), move it back up.
      updateItems(list.id, (items) => [
        ...items.filter((i) => i.id !== existing.id),
        { ...existing, done: false, ...(qty ? { qty } : {}) },
      ])
    } else {
      updateItems(list.id, (items) => [...items, newItem(title, qty)])
    }
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 bg-bg/90 px-4 pb-2 pt-2 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      <form onSubmit={submit} className="flex gap-2">
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add item — e.g. 2x milk"
          aria-label={`Add to ${list.name}`}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="enter"
          className="h-12! rounded-2xl! px-4! shadow-card sm:text-base!"
        />
        <button
          type="submit"
          aria-label="Add item"
          disabled={!text.trim()}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-card transition-colors hover:bg-accent-hover disabled:opacity-40"
        >
          <Plus size={22} />
        </button>
      </form>
    </div>
  )
}

export function ListDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const lists = useStore((s) => s.lists)
  const patch = useStore((s) => s.patch)
  const list = useMemo(() => lists.find((l) => l.id === id), [lists, id])
  const [settings, setSettings] = useState(false)
  const [editingId, setEditingId] = useState<ID | null>(null)
  const [showDone, setShowDone] = useState(true)

  const openItems = useMemo(() => list?.items.filter((i) => !i.done) ?? [], [list])
  const doneItems = useMemo(() => list?.items.filter((i) => i.done) ?? [], [list])

  if (!list) {
    return (
      <>
        <LifeHeader />
        <Card>
          <EmptyState
            icon={ListChecks}
            title="List not found"
            description="It may have been deleted."
            action={<Button onClick={() => navigate('/life/lists')}>Back to lists</Button>}
          />
        </Card>
      </>
    )
  }

  const meta = LIST_KINDS[list.kind] ?? LIST_KINDS.other
  const total = list.items.length

  const uncheckAll = () => {
    const before = list.items
    updateItems(list.id, (items) => items.map((i) => ({ ...i, done: false })))
    toast('Unchecked all items', { action: { label: 'Undo', onClick: () => patch('lists', list.id, { items: before }) } })
  }
  const clearDone = () => {
    const before = list.items
    updateItems(list.id, (items) => items.filter((i) => !i.done))
    toast(`Cleared ${doneItems.length} done`, { action: { label: 'Undo', onClick: () => patch('lists', list.id, { items: before }) } })
  }
  const deleteList = async () => {
    const ok = await confirm({
      title: `Delete “${list.name}”?`,
      message: total ? `Its ${total} item${total === 1 ? '' : 's'} will be deleted too.` : undefined,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    navigate('/life/lists')
    removeWithUndo('lists', list.id, 'List deleted')
  }

  const menu: MenuItem[] = [
    { label: 'Rename & style', icon: Palette, onClick: () => setSettings(true) },
    list.pinned
      ? { label: 'Unpin from Overview', icon: PinOff, onClick: () => patch('lists', list.id, { pinned: false }) }
      : { label: 'Pin to Overview', icon: Pin, onClick: () => patch('lists', list.id, { pinned: true }) },
  ]
  if (doneItems.length) {
    menu.push({ label: 'Uncheck all', icon: RotateCcw, onClick: uncheckAll })
    menu.push({ label: 'Clear done', icon: CheckCheck, onClick: clearDone })
  }
  menu.push({ label: 'Delete list', icon: Trash2, danger: true, onClick: () => void deleteList() })

  return (
    <>
      <Link
        to="/life/lists"
        className="-ml-2 mb-1 inline-flex h-10 items-center gap-0.5 rounded-xl pl-1 pr-3 text-sm font-medium text-accent-text hover:bg-surface-2"
      >
        <ChevronLeft size={19} />
        Lists
      </Link>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            <IconTile icon={meta.icon} color={list.color} size={32} />
            <span className="truncate">{list.name}</span>
          </span>
        }
        subtitle={total ? (openItems.length ? `${openItems.length} of ${total} left` : `All ${total} done`) : meta.label}
        actions={<div className={BIG_MENU}><Menu items={menu} label="List actions" /></div>}
      />
      {total > 0 && <Progress className="-mt-2 mb-3" value={doneItems.length / total} color={list.color} height={4} label="Progress" />}

      <AddBar list={list} />

      {total === 0 ? (
        <Card>
          <EmptyState
            icon={meta.icon}
            title="Nothing on this list yet"
            description="Type above and press Enter. “2x milk”, “milk x2” or “milk 2kg” sets a quantity."
          />
        </Card>
      ) : (
        <>
          {openItems.length > 0 ? (
            <Card padded={false} className="divide-y divide-line">
              {openItems.map((i) => (
                <ItemRow
                  key={i.id}
                  listId={list.id}
                  item={i}
                  color={list.color}
                  editing={editingId === i.id}
                  onEdit={(on) => setEditingId(on ? i.id : null)}
                />
              ))}
            </Card>
          ) : (
            <Card className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-good-soft text-good">
                <CheckCheck size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">All done</p>
                <p className="text-[13px] text-muted">Uncheck everything to reuse this list next time.</p>
              </div>
            </Card>
          )}

          {doneItems.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={showDone}
                  className="-ml-2 inline-flex h-10 items-center gap-1 rounded-xl px-2 text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink"
                >
                  <ChevronDown size={15} className={cn('transition-transform', !showDone && '-rotate-90')} />
                  Done ({doneItems.length})
                </button>
                <div className="flex gap-1">
                  <Button variant="ghost" icon={RotateCcw} className="px-3!" onClick={uncheckAll}>Uncheck all</Button>
                  <Button variant="ghost" icon={Trash2} className="px-3!" onClick={clearDone}>Clear</Button>
                </div>
              </div>
              {showDone && (
                <Card padded={false} className="divide-y divide-line">
                  {doneItems.map((i) => (
                    <ItemRow
                      key={i.id}
                      listId={list.id}
                      item={i}
                      color={list.color}
                      editing={editingId === i.id}
                      onEdit={(on) => setEditingId(on ? i.id : null)}
                    />
                  ))}
                </Card>
              )}
            </div>
          )}
          <p className="mt-4 text-center text-xs text-muted">Tap an item to check it off · ⋯ to edit or delete</p>
        </>
      )}

      {settings && <ListSettingsSheet list={list} onClose={() => setSettings(false)} />}
    </>
  )
}
