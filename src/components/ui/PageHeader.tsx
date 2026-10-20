import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Settings } from 'lucide-react'
import { IconButton } from './primitives'

/**
 * Page title row. On phones it also carries the global Search and Settings
 * buttons (the desktop sidebar has them instead).
 */
export function PageHeader({
  title, subtitle, actions, children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Extra row under the title (tabs, filters). */
  children?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="mb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1">
          <h1 className="truncate text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <div className="flex items-center lg:hidden">
            <IconButton icon={Search} label="Search" onClick={() => navigate('/search')} />
            <IconButton icon={Settings} label="Settings" onClick={() => navigate('/settings')} />
          </div>
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  )
}
