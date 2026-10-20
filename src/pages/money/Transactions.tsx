import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Download, Plus, Receipt, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import {
  Button, Card, cn, EmptyState, IconButton, Input, PageHeader, Segmented, Select,
} from '@/components/ui'
import { monthOf, relativeDay } from '@/lib/dates'
import { totals } from '@/lib/finance'
import { useStore } from '@/lib/store'
import { openEditor, toast } from '@/lib/ui'
import type { ISODate, Transaction, TxType } from '@/lib/types'
import {
  downloadCSV, monthParamValue, readMonth, readScope, sortTxDesc, useCategoryMap, useMethodMap,
  useSearchState, useStableMoney,
} from './components/lib'
import { MonthPicker, MoneyToolbar, ScopeToggle } from './components/nav'
import { TxRow } from './components/rows'

const PAGE = 100
const NO_METHOD = '__none'

type TypeFilter = 'all' | TxType

export function TransactionsPage() {
  const [params, update] = useSearchState()
  const month = readMonth(params, true)
  const scope = readScope(params)
  const typeRaw = params.get('type')
  const type: TypeFilter = typeRaw === 'income' || typeRaw === 'expense' ? typeRaw : 'all'
  const category = params.get('category') ?? ''
  const method = params.get('method') ?? ''

  const [query, setQuery] = useState('')
  const q = useDeferredValue(query.trim().toLowerCase())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  const txs = useStore((s) => s.transactions)
  const cats = useStore((s) => s.financeCategories)
  const methods = useStore((s) => s.paymentMethods)
  const catMap = useCategoryMap()
  const methodMap = useMethodMap()
  const money = useStableMoney()

  const filtered = useMemo(() => {
    const numQ = q.replace(',', '.')
    return txs
      .filter((t) => {
        if (month !== 'all' && monthOf(t.date) !== month) return false
        if (scope !== 'all' && t.scope !== scope) return false
        if (type !== 'all' && t.type !== type) return false
        if (category && t.categoryId !== category) return false
        if (method === NO_METHOD ? !!t.paymentMethodId : method && t.paymentMethodId !== method) return false
        if (q) {
          const hay = `${t.payee ?? ''}\n${t.note ?? ''}\n${catMap.get(t.categoryId)?.name ?? ''}`.toLowerCase()
          if (!hay.includes(q) && !t.amount.toFixed(2).includes(numQ) && !String(t.amount).includes(numQ)) return false
        }
        return true
      })
      .sort(sortTxDesc)
  }, [txs, month, scope, type, category, method, q, catMap])

  useEffect(() => setLimit(PAGE), [month, scope, type, category, method, q])

  const sum = useMemo(() => totals(filtered), [filtered])

  const dayNet = useMemo(() => {
    const m = new Map<ISODate, number>()
    for (const t of filtered) m.set(t.date, (m.get(t.date) ?? 0) + (t.type === 'income' ? t.amount : -t.amount))
    return m
  }, [filtered])

  const groups = useMemo(() => {
    const out: { date: ISODate; items: Transaction[] }[] = []
    for (const t of filtered.slice(0, limit)) {
      const last = out[out.length - 1]
      if (last && last.date === t.date) last.items.push(t)
      else out.push({ date: t.date, items: [t] })
    }
    return out
  }, [filtered, limit])

  const categoryOptions = useMemo(() => {
    const visible = cats.filter((c) => (type === 'all' || c.type === type) && (!c.archived || c.id === category))
    return {
      income: visible.filter((c) => c.type === 'income'),
      expense: visible.filter((c) => c.type === 'expense'),
    }
  }, [cats, type, category])

  const activeCount = [type !== 'all', !!category, !!method, scope !== 'all', !!q].filter(Boolean).length

  const clearFilters = () => {
    update({ type: null, category: null, method: null, scope: null })
    setQuery('')
  }

  const setType = (v: TypeFilter) => {
    const keepCategory = !category || v === 'all' || catMap.get(category)?.type === v
    update({ type: v === 'all' ? null : v, category: keepCategory ? category : null })
  }

  const add = (t?: TxType) => {
    const catType = category ? catMap.get(category)?.type : undefined
    const txType = t ?? catType ?? (type === 'all' ? 'expense' : type)
    openEditor({
      kind: 'transaction',
      initial: {
        type: txType,
        ...(category && catType === txType ? { categoryId: category } : {}),
        ...(scope === 'business' ? { scope: 'business' as const } : {}),
      },
    })
  }

  const exportCsv = () => {
    if (!filtered.length) {
      toast('Nothing to export')
      return
    }
    const rows: (string | number | undefined)[][] = [
      ['date', 'type', 'amount', 'category', 'payment method', 'payee', 'note', 'scope'],
      ...filtered.map((t) => [
        t.date,
        t.type,
        t.amount.toFixed(2),
        catMap.get(t.categoryId)?.name ?? '',
        t.paymentMethodId ? methodMap.get(t.paymentMethodId)?.name ?? '' : '',
        t.payee ?? '',
        t.note ?? '',
        t.scope,
      ]),
    ]
    downloadCSV(`orbit-transactions-${month === 'all' ? 'all-time' : month}.csv`, rows)
    toast(`Exported ${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`)
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        actions={
          <>
            <IconButton icon={Download} label="Export CSV" variant="secondary" className="sm:hidden" onClick={exportCsv} />
            <Button icon={Download} className="hidden sm:inline-flex" onClick={exportCsv}>Export CSV</Button>
            <IconButton icon={Plus} label="Add transaction" variant="primary" className="sm:hidden" onClick={() => add()} />
            <Button variant="primary" icon={Plus} className="hidden sm:inline-flex" onClick={() => add()}>Add</Button>
          </>
        }
      >
        <MoneyToolbar>
          <MonthPicker value={month} allowAll onChange={(m) => update({ month: monthParamValue(m) })} />
        </MoneyToolbar>

        <div className="mt-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search payee, note, category, amount"
              aria-label="Search transactions"
              className="pl-9"
            />
          </div>
          <Button
            icon={SlidersHorizontal}
            className="lg:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            Filters
            {activeCount > 0 && (
              <span className="tabular ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink">
                {activeCount}
              </span>
            )}
          </Button>
        </div>

        <div
          className={cn(
            'mt-3 gap-2',
            filtersOpen
              ? 'grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center'
              : 'hidden lg:flex lg:flex-wrap lg:items-center',
          )}
        >
          <div className="col-span-2">
            <Segmented<TypeFilter>
              block
              className="sm:w-auto"
              value={type}
              onChange={setType}
              options={[
                { value: 'all', label: 'All' },
                { value: 'income', label: 'Income' },
                { value: 'expense', label: 'Expenses' },
              ]}
            />
          </div>
          <div className="col-span-2">
            <ScopeToggle
              block
              className="sm:w-auto"
              value={scope}
              onChange={(v) => update({ scope: v === 'all' ? null : v })}
            />
          </div>
          <Select
            aria-label="Category"
            className="sm:w-48"
            value={category}
            onChange={(e) => update({ category: e.target.value || null })}
          >
            <option value="">All categories</option>
            {categoryOptions.income.length > 0 && (
              <optgroup label="Income">
                {categoryOptions.income.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>
                ))}
              </optgroup>
            )}
            {categoryOptions.expense.length > 0 && (
              <optgroup label="Expenses">
                {categoryOptions.expense.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.archived ? ' (archived)' : ''}</option>
                ))}
              </optgroup>
            )}
          </Select>
          <Select
            aria-label="Payment method"
            className="sm:w-44"
            value={method}
            onChange={(e) => update({ method: e.target.value || null })}
          >
            <option value="">All methods</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
            <option value={NO_METHOD}>No method</option>
          </Select>
        </div>

        {activeCount > 0 && (
          <div className="mt-2 flex items-center gap-1 text-[13px] text-muted">
            <span>
              {activeCount} filter{activeCount === 1 ? '' : 's'} active
            </span>
            <Button size="sm" variant="ghost" icon={X} onClick={clearFilters}>
              Clear
            </Button>
          </div>
        )}
      </PageHeader>

      {txs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Record what comes in and what goes out. Totals, summaries and charts update automatically."
            action={<AddButtons onAdd={add} />}
          />
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <MiniStat label="In" value={money(sum.income)} tone={sum.income > 0 ? 'good' : undefined} />
              <MiniStat label="Out" value={money(sum.expense)} />
              <MiniStat label="Net" value={money(sum.net, { sign: true })} tone={sum.net < 0 ? 'bad' : undefined} />
              <MiniStat label="Transactions" value={String(sum.count)} />
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={SearchX}
                title="No matching transactions"
                description={
                  activeCount > 0 ? 'Try clearing some filters or picking another month.' : 'Nothing recorded for this period.'
                }
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {activeCount > 0 && <Button icon={X} onClick={clearFilters}>Clear filters</Button>}
                    <AddButtons onAdd={add} />
                  </div>
                }
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => {
                const net = dayNet.get(g.date) ?? 0
                return (
                  <section key={g.date}>
                    <div className="sticky top-[env(safe-area-inset-top)] z-10 -mx-1 flex items-center justify-between bg-bg/95 px-1 py-2 backdrop-blur">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{relativeDay(g.date)}</h3>
                      <span className={cn('tabular text-xs font-medium', net > 0 ? 'text-good' : 'text-muted')}>
                        {money(net, { sign: true })}
                      </span>
                    </div>
                    <Card padded={false} className="divide-y divide-line overflow-hidden">
                      {g.items.map((t) => (
                        <TxRow
                          key={t.id}
                          tx={t}
                          category={catMap.get(t.categoryId)}
                          method={t.paymentMethodId ? methodMap.get(t.paymentMethodId) : undefined}
                          money={money}
                        />
                      ))}
                    </Card>
                  </section>
                )
              })}
              {filtered.length > limit && (
                <Button block onClick={() => setLimit((l) => l + PAGE)}>
                  Show more · {filtered.length - limit} left
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          'tabular mt-0.5 truncate text-[15px] font-semibold tracking-tight',
          tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function AddButtons({ onAdd }: { onAdd: (t: TxType) => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="primary" icon={Plus} onClick={() => onAdd('expense')}>Add expense</Button>
      <Button icon={Plus} onClick={() => onAdd('income')}>Add income</Button>
    </div>
  )
}
