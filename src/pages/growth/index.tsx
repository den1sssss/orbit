// Goals & Habits module, mounted at /growth/*.
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { IconButton, PageHeader } from '@/components/ui'
import { fmt } from '@/lib/dates'
import { GrowthTabs } from './components'
import { GoalEditorSheet } from './GoalSheet'
import { GoalsView } from './Goals'
import { HabitDetailSheet, HabitEditorSheet } from './HabitSheets'
import { HabitsView } from './Habits'
import { useToday } from './lib'
import { PlanView } from './Plan'
import { ReviewView } from './Review'
import {
  closeGoalEditor, closeHabitEditor, openGoalEditor, openHabitEditor, resetGrowthUI, useGrowthUI,
} from './state'
import { TodayView } from './Today'
import './growth.css'

const SUBTITLES: Record<string, string> = {
  habits: 'Routines you’re building',
  goals: 'From this week to the long term',
  plan: 'Your personal development plan',
  review: 'Reflect on your progress',
}

function GrowthSheets() {
  const habitEditor = useGrowthUI((s) => s.habitEditor)
  const goalEditor = useGrowthUI((s) => s.goalEditor)
  const detail = useGrowthUI((s) => s.habitDetail)
  // Sheets are module-local: close them when leaving /growth.
  useEffect(() => resetGrowthUI, [])
  return (
    <>
      {detail && <HabitDetailSheet id={detail} />}
      {habitEditor && <HabitEditorSheet key={habitEditor.nonce} req={habitEditor} onClose={closeHabitEditor} />}
      {goalEditor && <GoalEditorSheet key={goalEditor.nonce} req={goalEditor} onClose={closeGoalEditor} />}
    </>
  )
}

export function GrowthPage() {
  const { pathname } = useLocation()
  const today = useToday()
  const section = pathname.replace(/^\/growth\/?/, '').split('/')[0] || 'today'

  const action =
    section === 'goals' ? (
      <IconButton icon={Plus} variant="primary" label="New goal" onClick={() => openGoalEditor()} />
    ) : section === 'today' || section === 'habits' ? (
      <IconButton icon={Plus} variant="primary" label="New habit" onClick={() => openHabitEditor()} />
    ) : null

  return (
    <div className="min-w-0">
      <PageHeader
        title="Goals & Habits"
        subtitle={section === 'today' ? fmt(today, 'EEEE, MMMM d') : SUBTITLES[section]}
        actions={action}
      >
        <GrowthTabs />
      </PageHeader>
      <Routes>
        <Route index element={<TodayView />} />
        <Route path="habits" element={<HabitsView />} />
        <Route path="goals" element={<GoalsView />} />
        <Route path="plan" element={<PlanView />} />
        <Route path="review" element={<ReviewView />} />
        <Route path="*" element={<Navigate to="/growth" replace />} />
      </Routes>
      <GrowthSheets />
    </div>
  )
}
