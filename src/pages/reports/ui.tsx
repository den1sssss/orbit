// Report-only building blocks: section card, stat grid and period-over-period deltas.
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, ChevronRight, type LucideIcon } from 'lucide-react'
import { Card, CardHeader, cn, EmptyState, IconButton } from '@/components/ui'
import { pctChange } from './metrics'
import { signedMoney, signedPercent, type MoneyFn } from './text'

/** Which direction is good news; 'none' keeps the delta neutral (e.g. tasks created). */
export type Good = 'up' | 'down' | 'none'

/**
 * Signed change vs the previous period: arrow + sign carry direction, color says
 * whether that direction is good (status colors, never color alone).
 */
export function Delta({
  diff, format, good = 'up', vs, epsilon = 1e-9,
}: {
  diff: number | null | undefined
  format: (n: number) => string
  good?: Good
  /** Short name of the previous period: "last week", "Sep". */
  vs: string
  /** Changes smaller than this read as "Same as …". */
  epsilon?: number
}) {
  if (diff == null || !isFinite(diff)) return null
  if (Math.abs(diff) < epsilon) return <>Same as {vs}</>
  const up = diff > 0
  const tone = good === 'none' ? 'text-ink-2' : up === (good === 'up') ? 'text-good' : 'text-bad'
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <>
      <span className={cn('inline-flex items-center font-medium', tone)}>
        <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
        {format(diff)}
      </span>{' '}
      vs {vs}
    </>
  )
}

/** Money change: a percentage when there is a base, otherwise the amount. Nothing when both are 0. */
export function MoneyDelta({ cur, prev, good = 'up', vs, money }: {
  cur: number
  prev: number
  good?: Good
  vs: string
  money: MoneyFn
}) {
  if (!cur && !prev) return null
  const ch = pctChange(cur, prev)
  if (ch != null && Math.abs(ch) < 10) {
    return <Delta diff={ch} format={signedPercent} good={good} vs={vs} epsilon={0.005} />
  }
  return <Delta diff={cur - prev} format={(n) => signedMoney(money, n)} good={good} vs={vs} epsilon={0.005} />
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3', className)}>{children}</div>
}

export function Section({
  title, icon, subtitle, to, children, className,
}: {
  title: string
  icon: LucideIcon
  subtitle?: ReactNode
  /** Module route for "see details". */
  to?: string
  children: ReactNode
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <Card as="section" className={cn('min-w-0', className)}>
      <CardHeader
        title={title}
        icon={icon}
        subtitle={subtitle}
        action={
          to ? (
            <IconButton icon={ChevronRight} label={`Open ${title}`} className="-my-2 -mr-2" onClick={() => navigate(to)} />
          ) : undefined
        }
      />
      {children}
    </Card>
  )
}

export function SectionEmpty({ icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <EmptyState compact icon={icon} title={title} description={description} />
}

export function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-baseline justify-between gap-3">
      <h4 className="text-[13px] font-semibold text-ink-2">{children}</h4>
      {aside && <span className="tabular min-w-0 truncate text-xs text-muted">{aside}</span>}
    </div>
  )
}
