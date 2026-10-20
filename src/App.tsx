import { lazy, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { LockScreen, Onboarding, Splash } from '@/components/layout/Gate'
import { isEncrypted, lock } from '@/lib/persistence'
import { useReminders } from '@/lib/reminders'
import { useStore } from '@/lib/store'
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

export function App() {
  const status = useUI((s) => s.status)
  const onboarded = useStore((s) => s.settings.onboarded)
  useTheme()
  useAutoLock()
  useReminders(status === 'ready')

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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
