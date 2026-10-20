import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, CreditCard, Plus, Trash2, Wallet } from 'lucide-react'
import {
  Badge, Button, CategoryIcon, cn, ColorPicker, Field, IconButton, Input, MoneyInput, Segmented, Sheet,
} from '@/components/ui'
import { CATEGORY_ICONS } from '@/lib/icons'
import { parseAmount, useMoney } from '@/lib/format'
import { uid, useStore } from '@/lib/store'
import { confirm, toast } from '@/lib/ui'
import type { ColorKey, FinanceCategory, TxType } from '@/lib/types'
import { Row, Section } from './Section'

function CategorySheet({
  category, type, onClose,
}: { category?: FinanceCategory; type: TxType; onClose: () => void }) {
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const remove = useStore((s) => s.remove)
  const transactions = useStore((s) => s.transactions)
  const payments = useStore((s) => s.plannedPayments)
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? (type === 'income' ? 'coins' : 'package'))
  const [color, setColor] = useState<ColorKey>(category?.color ?? 'indigo')
  const [error, setError] = useState('')
  const used = category
    ? transactions.filter((t) => t.categoryId === category.id).length + payments.filter((p) => p.categoryId === category.id).length
    : 0

  const save = () => {
    const n = name.trim()
    if (!n) return setError('Name the category')
    if (category) patch('financeCategories', category.id, { name: n, icon, color })
    else insert('financeCategories', { id: uid(), name: n, icon, color, type })
    toast(category ? 'Category updated' : 'Category added')
    onClose()
  }

  const del = async () => {
    if (!category) return
    if (used) {
      const ok = await confirm({
        title: 'Archive instead?',
        message: `“${category.name}” is used by ${used} record${used === 1 ? '' : 's'}. Archiving hides it from pickers but keeps your history intact.`,
        confirmLabel: 'Archive',
      })
      if (ok) {
        patch('financeCategories', category.id, { archived: true })
        onClose()
      }
      return
    }
    const ok = await confirm({ title: `Delete “${category.name}”?`, confirmLabel: 'Delete', danger: true })
    if (ok) {
      remove('financeCategories', category.id)
      useStore.getState().setBudget(category.id, null)
      onClose()
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? 'Edit category' : `New ${type} category`}
      footer={
        <>
          {category && (
            <>
              <Button variant="ghost" icon={Trash2} className="text-bad" onClick={() => void del()}>Delete</Button>
              <Button
                variant="ghost"
                icon={category.archived ? ArchiveRestore : Archive}
                onClick={() => {
                  patch('financeCategories', category.id, { archived: !category.archived })
                  onClose()
                }}
              >
                {category.archived ? 'Restore' : 'Archive'}
              </Button>
            </>
          )}
          <div className="flex-1" />
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <CategoryIcon icon={icon} color={color} size={44} />
          <Field className="flex-1" error={error}>
            <Input value={name} placeholder="Category name" onChange={(e) => { setName(e.target.value); setError('') }} />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <Field label="Icon">
          <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={cn(
                  'flex h-10 items-center justify-center rounded-xl border transition-colors',
                  icon === key ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-ink-2 hover:border-line-strong',
                )}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Sheet>
  )
}

export function MoneySettings() {
  const categories = useStore((s) => s.financeCategories)
  const methods = useStore((s) => s.paymentMethods)
  const transactions = useStore((s) => s.transactions)
  const target = useStore((s) => s.settings.monthlySavingsTarget)
  const updateSettings = useStore((s) => s.updateSettings)
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const remove = useStore((s) => s.remove)
  const money = useMoney()
  const [type, setType] = useState<TxType>('expense')
  const [editing, setEditing] = useState<FinanceCategory | 'new' | null>(null)
  const [targetText, setTargetText] = useState(target ? String(target) : '')
  const [newMethod, setNewMethod] = useState('')

  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + 1)
    return m
  }, [transactions])
  const methodUsage = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) if (t.paymentMethodId) m.set(t.paymentMethodId, (m.get(t.paymentMethodId) ?? 0) + 1)
    return m
  }, [transactions])

  const list = categories
    .filter((c) => c.type === type)
    .sort((a, b) => Number(!!a.archived) - Number(!!b.archived))

  return (
    <>
      <Section id="money" title="Money" icon={Wallet} description="Categories, payment methods and your savings target.">
        <Row label="Monthly savings target" hint="Used by the budget planner and daily briefing.">
          <MoneyInput
            value={targetText}
            placeholder="0"
            onChange={(e) => setTargetText(e.target.value)}
            onBlur={() => {
              const n = parseAmount(targetText)
              updateSettings({ monthlySavingsTarget: isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0 })
              if (isFinite(n) && n > 0) toast(`Savings target set to ${money(n)}`)
            }}
          />
        </Row>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">Categories</p>
            <Segmented<TxType>
              size="sm"
              value={type}
              onChange={setType}
              options={[
                { value: 'expense', label: 'Expenses' },
                { value: 'income', label: 'Income' },
              ]}
            />
          </div>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2', c.archived && 'opacity-60')}
                >
                  <CategoryIcon icon={c.icon} color={c.color} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                  {c.archived && <Badge>Archived</Badge>}
                  <span className="text-xs tabular text-muted">{usage.get(c.id) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" icon={Plus} className="mt-2" onClick={() => setEditing('new')}>
            Add {type} category
          </Button>
        </div>
      </Section>

      <Section title="Payment methods" icon={CreditCard} description="Cash, cards, bank accounts, wallets — whatever you pay with.">
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {methods.map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-3 py-1.5">
              <input
                value={m.name}
                aria-label="Payment method name"
                onChange={(e) => patch('paymentMethods', m.id, { name: e.target.value })}
                className="h-9 min-w-0 flex-1 bg-transparent text-base text-ink outline-none sm:text-sm"
              />
              <span className="text-xs tabular text-muted">{methodUsage.get(m.id) ?? 0}</span>
              <IconButton
                size="sm"
                icon={Trash2}
                label={`Delete ${m.name}`}
                onClick={async () => {
                  const n = methodUsage.get(m.id) ?? 0
                  const ok = await confirm({
                    title: `Delete “${m.name}”?`,
                    message: n ? `${n} transaction${n === 1 ? '' : 's'} will show no payment method.` : undefined,
                    confirmLabel: 'Delete',
                    danger: true,
                  })
                  if (ok) remove('paymentMethods', m.id)
                }}
              />
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const n = newMethod.trim()
            if (!n) return
            insert('paymentMethods', { id: uid(), name: n })
            setNewMethod('')
          }}
        >
          <Input value={newMethod} placeholder="e.g. Revolut, Amex Gold" onChange={(e) => setNewMethod(e.target.value)} />
          <Button type="submit" icon={Plus}>Add</Button>
        </form>
      </Section>

      {editing && (
        <CategorySheet
          category={editing === 'new' ? undefined : editing}
          type={editing === 'new' ? type : editing.type}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
