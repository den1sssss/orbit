import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui'

export function Section({
  title, description, icon: Icon, children, id,
}: {
  title: string
  description?: ReactNode
  icon: LucideIcon
  children: ReactNode
  id?: string
}) {
  return (
    <Card as="section" className="scroll-mt-6">
      <div id={id} className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  )
}

/** Label on the left, control on the right (stacks on phones). */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="text-[13px] text-muted">{hint}</p>}
      </div>
      <div className="shrink-0 sm:min-w-56">{children}</div>
    </div>
  )
}
