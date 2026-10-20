import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, CategoryIcon, cn, Field, Input, MoneyInput, Segmented, Select, Sheet, Textarea } from '@/components/ui'
import { parseAmount } from '@/lib/format'
import { makeTransaction, useStore } from '@/lib/store'
import { removeWithUndo, toast } from '@/lib/ui'
import type { ID, Scope, Transaction, TxType } from '@/lib/types'
import { ProjectSelect } from './fields'
import { guardClose, useDraft } from './useDraft'

const BUSINESS_CATEGORIES = new Set(['fc-business-income', 'fc-business-expense'])

export function TransactionEditor({
  id, initial, onClose,
}: { id?: ID; initial?: Partial<Transaction>; onClose: () => void }) {
  const existing = useStore((s) => (id ? s.transactions.find((t) => t.id === id) : undefined))
  const allCategories = useStore((s) => s.financeCategories)
  const methods = useStore((s) => s.paymentMethods)
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const [error, setError] = useState('')
  const [addAnother, setAddAnother] = useState(false)

  const firstOf = (type: TxType) => allCategories.find((c) => c.type === type && !c.archived)?.id ?? ''
  const { draft, set, merge, dirty } = useDraft<Transaction>(() => {
    if (existing) return { ...existing }
    const type = initial?.type ?? 'expense'
    return makeTransaction({
      amount: 0,
      categoryId: firstOf(type),
      paymentMethodId: methods[1]?.id ?? methods[0]?.id,
      ...initial,
      type,
    })
  })
  const [amountText, setAmountText] = useState(existing ? String(existing.amount) : initial?.amount ? String(initial.amount) : '')

  const categories = useMemo(
    () => allCategories.filter((c) => c.type === draft.type && (!c.archived || c.id === draft.categoryId)),
    [allCategories, draft.type, draft.categoryId],
  )

  const switchType = (type: TxType) => {
    const keep = allCategories.find((c) => c.id === draft.categoryId)?.type === type
    merge({ type, categoryId: keep ? draft.categoryId : firstOf(type) })
  }

  const save = (another = false) => {
    const amount = parseAmount(amountText)
    if (!isFinite(amount) || amount <= 0) return setError('Enter an amount greater than zero')
    if (!draft.categoryId) return setError('Pick a category')
    const final: Transaction = { ...draft, amount: Math.round(amount * 100) / 100, payee: draft.payee?.trim() || undefined }
    if (existing) patch('transactions', existing.id, final)
    else insert('transactions', final)
    toast(existing ? 'Transaction updated' : final.type === 'income' ? 'Income recorded' : 'Expense recorded')
    if (another && !existing) {
      // Keep type/category/date/method for fast batch entry.
      setAmountText('')
      merge(makeTransaction({ ...final, id: undefined, createdAt: undefined, amount: 0, note: undefined, payee: undefined }))
      setAddAnother(true)
      return
    }
    onClose()
  }

  const close = () => guardClose(dirty && !addAnother, onClose)

  return (
    <Sheet
      open
      onClose={close}
      title={existing ? 'Edit transaction' : draft.type === 'income' ? 'Add income' : 'Add expense'}
      footer={
        <>
          {existing ? (
            <Button
              variant="ghost"
              icon={Trash2}
              className="text-bad"
              onClick={() => {
                removeWithUndo('transactions', existing.id, 'Transaction deleted')
                onClose()
              }}
            >
              Delete
            </Button>
          ) : (
            <Button variant="ghost" className="max-sm:hidden" onClick={() => save(true)}>Save & add another</Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={() => save()}>{existing ? 'Save' : 'Save'}</Button>
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
        <Segmented<TxType>
          block
          value={draft.type}
          onChange={switchType}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
          ]}
        />

        <Field error={error}>
          <MoneyInput
            big
            data-autofocus
            placeholder="0.00"
            value={amountText}
            onChange={(e) => {
              setAmountText(e.target.value)
              setError('')
            }}
          />
        </Field>

        <Field label="Category">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => merge({
                  categoryId: c.id,
                  scope: BUSINESS_CATEGORIES.has(c.id) ? 'business' : draft.scope,
                })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors',
                  draft.categoryId === c.id
                    ? 'border-accent bg-accent-soft'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size={30} />
                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink-2">{c.name}</span>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={draft.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
          </Field>
          <Field label="Payment method">
            <Select value={draft.paymentMethodId ?? ''} onChange={(e) => set('paymentMethodId', e.target.value || undefined)}>
              <option value="">—</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={draft.type === 'income' ? 'From (payer / client)' : 'Paid to (store / payee)'}>
          <Input
            value={draft.payee ?? ''}
            placeholder={draft.type === 'income' ? 'Employer, client…' : 'Store, service…'}
            onChange={(e) => set('payee', e.target.value)}
          />
        </Field>

        <Field label="Belongs to" hint="Business entries are tracked separately from personal money.">
          <Segmented<Scope>
            block
            value={draft.scope}
            onChange={(v) => set('scope', v)}
            options={[
              { value: 'personal', label: 'Personal' },
              { value: 'business', label: 'Business' },
            ]}
          />
        </Field>

        {draft.scope === 'business' && (
          <Field label="Project / client work">
            <ProjectSelect value={draft.projectId} onChange={(v) => set('projectId', v)} />
          </Field>
        )}

        <Field label="Notes">
          <Textarea className="min-h-16" value={draft.note ?? ''} placeholder="Optional" onChange={(e) => set('note', e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
