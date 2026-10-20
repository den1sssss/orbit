import { Suspense, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookHeart, CalendarDays, CheckCircle2, Cloud, CloudOff, House, Loader2, Lock, NotebookPen,
  Plus, Search, Settings, Wallet, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/components/ui'
import { EditorHost } from '@/components/editors/EditorHost'
import { isEncrypted, lock } from '@/lib/persistence'
import { setQuickAdd, useUI } from '@/lib/ui'
import { QuickAddSheet } from './QuickAdd'
import { ConfirmHost, ToastHost } from './Overlays'
import { ErrorBoundary } from './ErrorBoundary'
import { InstallHint } from './InstallHint'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Extra path prefixes that should highlight this item. */
  also?: string[]
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tasks', label: 'Tasks', icon: CheckCircle2 },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/journal', label: 'Journal', icon: BookHeart },
  { to: '/money', label: 'Money', icon: Wallet },
]

const MONEY_SUB = [
  { to: '/money', label: 'Overview', end: true },
  { to: '/money/transactions', label: 'Transactions' },
  { to: '/money/budget', label: 'Budget' },
  { to: '/money/goals', label: 'Savings goals' },
  { to: '/money/payments', label: 'Payments & subs' },
]

// Phones get five tabs; Notes lives behind the Tasks tab (Tasks | Notes switch).
const MOBILE_NAV: NavItem[] = [
  NAV[0], NAV[1], { ...NAV[2], also: ['/notes'] }, NAV[5], NAV[4],
]

function isActive(pathname: string, item: NavItem) {
  if (item.end) return pathname === item.to
  return [item.to, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function SaveIndicator() {
  const state = useUI((s) => s.saveState)
  if (state === 'saving') return <Loader2 size={14} className="animate-spin text-muted" aria-label="Saving" />
  if (state === 'error') return <CloudOff size={15} className="text-bad" aria-label="Save failed" />
  if (state === 'saved') return <Cloud size={15} className="text-muted" aria-label="All changes saved" />
  return null
}

function Sidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const inMoney = pathname.startsWith('/money')
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/60 px-3 py-5 backdrop-blur lg:flex">
      <div className="mb-5 flex items-center justify-between px-2">
        <div className="flex items-center gap-2.5">
          <img src="./icon.svg" alt="" className="h-7 w-7" />
          <span className="text-[17px] font-semibold tracking-tight">Orbit</span>
        </div>
        <SaveIndicator />
      </div>
      <button
        type="button"
        onClick={() => setQuickAdd(true)}
        className="mb-4 flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-ink shadow-card transition-colors hover:bg-accent-hover"
      >
        <Plus size={17} /> New
      </button>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = isActive(pathname, item)
          return (
            <div key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2/70 hover:text-ink',
                )}
              >
                <item.icon size={18} className={active ? 'text-accent-text' : 'text-muted'} />
                {item.label}
              </NavLink>
              {item.to === '/money' && inMoney && (
                <div className="mb-1 ml-[22px] mt-0.5 flex flex-col border-l border-line pl-3">
                  {MONEY_SUB.map((s) => (
                    <NavLink
                      key={s.to}
                      to={s.to}
                      end={s.end}
                      className={({ isActive: a }) =>
                        cn('rounded-md px-2 py-1.5 text-[13px] transition-colors', a ? 'font-medium text-ink' : 'text-muted hover:text-ink')
                      }
                    >
                      {s.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => navigate('/search')}
          className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2/70 hover:text-ink"
        >
          <Search size={18} className="text-muted" /> Search
          <kbd className="ml-auto rounded border border-line px-1.5 text-[11px] text-muted">⌘K</kbd>
        </button>
        <NavLink
          to="/settings"
          className={({ isActive: a }) =>
            cn(
              'flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors',
              a ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2/70 hover:text-ink',
            )
          }
        >
          <Settings size={18} className="text-muted" /> Settings
        </NavLink>
        {isEncrypted() && (
          <button
            type="button"
            onClick={() => void lock()}
            className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2/70 hover:text-ink"
          >
            <Lock size={18} className="text-muted" /> Lock now
          </button>
        )}
      </div>
    </aside>
  )
}

function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
      <div className="mx-auto flex max-w-lg">
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={cn(
                'flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors',
                active ? 'text-accent-text' : 'text-muted',
              )}
            >
              <item.icon size={21} strokeWidth={active ? 2.3 : 1.9} />
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function Fab() {
  return (
    <button
      type="button"
      aria-label="Quick add"
      onClick={() => setQuickAdd(true)}
      className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-pop transition-transform active:scale-95 lg:hidden"
    >
      <Plus size={26} />
    </button>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        navigate('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <main className="min-w-0 lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 pb-36 pt-[max(16px,env(safe-area-inset-top))] sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">
          <InstallHint />
          <Suspense fallback={<div className="flex justify-center py-24"><Loader2 size={22} className="animate-spin text-muted" /></div>}>
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </Suspense>
        </div>
      </main>
      <BottomNav />
      <Fab />
      <QuickAddSheet />
      <EditorHost />
      <ConfirmHost />
      <ToastHost />
    </div>
  )
}
