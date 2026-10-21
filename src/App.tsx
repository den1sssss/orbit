import { lazy, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LockScreen, Onboarding, Splash } from '@/components/layout/Gate'
import { isEncrypted, lock } from '@/lib/persistence'
import { useReminders } from '@/lib/reminders'
import { useStore } from '@/lib/store'
import { todayISO } from '@/lib/dates'
import { upcomingPayments } from '@/lib/finance'
import { useUI } from '@/lib/ui'
import { Dashboard } from '@/pages/Dashboard'
import { MoneyLayout } from '@/pages/money/MoneyLayout'

// Screens load on demand so the phone's first paint only needs Home.
const CalendarPage = lazy(() => import('@/pages/Calendar').then((m) => ({ default: m.CalendarPage })))
const TasksPage = lazy(() => import('@/pages/Tasks').then((m) => ({ default: m.TasksPage })))
const NotesPage = lazy(() => import('@/pages/Notes').then((m) => ({ default: m.NotesPage })))
const JournalPage = lazy(() => import('@/pages/Journal').then((m) => ({ default: m.JournalPage })))
const MoneyOverview = lazy(() => import('@/pages/money/Overview').then((m) => ({ default: m.MoneyOverview })))
const TransactionsPage = lazy(() => import('@/pages/money/Transactions').then((m) => ({ default: m.TransactionsPage })))
const BudgetPage = lazy(() => import('@/pages/money/Budget').then((m) => ({ default: m.BudgetPage })))
const GoalsPage = lazy(() => import('@/pages/money/Goals').then((m) => ({ default: m.GoalsPage })))
const PaymentsPage = lazy(() => import('@/pages/money/Payments').then((m) => ({ default: m.PaymentsPage })))
const SearchPage = lazy(() => import('@/pages/Search').then((m) => ({ default: m.SearchPage })))
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })))
const MorePage = lazy(() => import('@/pages/More').then((m) => ({ default: m.MorePage })))
const BusinessPage = lazy(() => import('@/pages/business').then((m) => ({ default: m.BusinessPage })))
const GrowthPage = lazy(() => import('@/pages/growth').then((m) => ({ default: m.GrowthPage })))
const LifePage = lazy(() => import('@/pages/life').then((m) => ({ default: m.LifePage })))
const ReportsPage = lazy(() => import('@/pages/reports').then((m) => ({ default: m.ReportsPage })))
const AssistantPage = lazy(() => import('@/pages/assistant').then((m) => ({ default: m.AssistantPage })))

function useTheme() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) =>
        m.setAttribute('content', dark ? '#0d0d10' : '#f6f6f8'),
      )
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

/** Re-lock after the app has been in the background for a while. */
function useAutoLock() {
  const minutes = useStore((s) => s.settings.autoLockMinutes)
  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && minutes > 0 && isEncrypted() && Date.now() - hiddenAt > minutes * 60_000) void lock()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [minutes])
}

/** Number on the Home Screen icon (iOS 16.4+ / Chrome): tasks due today or overdue + overdue bills. */
function useAppBadge(active: boolean) {
  const tasks = useStore((s) => s.tasks)
  const payments = useStore((s) => s.plannedPayments)
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (!active || !nav.setAppBadge) return
    const today = todayISO()
    const count =
      tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate <= today).length +
      upcomingPayments(payments, 0).filter((d) => d.overdue || d.daysUntil === 0).length
    const p = count ? nav.setAppBadge(count) : nav.clearAppBadge?.()
    p?.catch(() => { /* needs notification permission on iOS */ })
  }, [active, tasks, payments])
}

export function App() {
  const status = useUI((s) => s.status)
  const onboarded = useStore((s) => s.settings.onboarded)
  useTheme()
  useAutoLock()
  useReminders(status === 'ready')
  useAppBadge(status === 'ready')

  if (status === 'loading') return <Splash />
  if (status === 'locked') return <LockScreen />
  if (!onboarded) return <Onboarding />

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="journal/:date" element={<JournalPage />} />
          <Route path="money" element={<MoneyLayout />}>
            <Route index element={<MoneyOverview />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="budget" element={<BudgetPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
          </Route>
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="more" element={<MorePage />} />
          {/* Each module handles its own sub-routes (e.g. /business/invoices). */}
          <Route path="business/*" element={<BusinessPage />} />
          <Route path="growth/*" element={<GrowthPage />} />
          <Route path="life/*" element={<LifePage />} />
          <Route path="reports/*" element={<ReportsPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
