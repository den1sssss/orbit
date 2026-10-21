// Which Goals & Habits sheet is open, plus the store actions the module's screens share.
import { create } from 'zustand'
import { amountOn } from '@/lib/habits'
import { makeHabit, useStore } from '@/lib/store'
import { removeWithUndo, toast } from '@/lib/ui'
import type { GoalStatus, Habit, ID, ISODate, LifeGoal } from '@/lib/types'
import { habitTarget, type StarterHabit } from './lib'

export interface HabitEditorReq {
  id?: ID
  initial?: Partial<Habit>
  nonce: number
}

export interface GoalEditorReq {
  id?: ID
  initial?: Partial<LifeGoal>
  nonce: number
}

interface GrowthUI {
  habitEditor: HabitEditorReq | null
  goalEditor: GoalEditorReq | null
  habitDetail: ID | null
}

export const useGrowthUI = create<GrowthUI>()(() => ({ habitEditor: null, goalEditor: null, habitDetail: null }))

let nonce = 0

export function openHabitEditor(req: { id?: ID; initial?: Partial<Habit> } = {}) {
  useGrowthUI.setState({ habitEditor: { ...req, nonce: ++nonce } })
}
export function closeHabitEditor() {
  useGrowthUI.setState({ habitEditor: null })
}
export function openGoalEditor(req: { id?: ID; initial?: Partial<LifeGoal> } = {}) {
  useGrowthUI.setState({ goalEditor: { ...req, nonce: ++nonce } })
}
export function closeGoalEditor() {
  useGrowthUI.setState({ goalEditor: null })
}
export function openHabitDetail(id: ID) {
  useGrowthUI.setState({ habitDetail: id })
}
export function closeHabitDetail() {
  useGrowthUI.setState({ habitDetail: null })
}
export function resetGrowthUI() {
  useGrowthUI.setState({ habitEditor: null, goalEditor: null, habitDetail: null })
}

// ───────────────────────── Habit actions ─────────────────────────

export function nextHabitOrder(): number {
  return useStore.getState().habits.reduce((m, h) => Math.max(m, h.order), -1) + 1
}

export function addStarterHabit(s: StarterHabit) {
  const { hint: _hint, ...fields } = s
  useStore.getState().insert('habits', makeHabit({ ...fields, order: nextHabitOrder() }))
  toast(`Added “${s.name}”`)
}

/** Tap on a day cell: mark fully done, or clear it if it already was. */
export function toggleHabitDay(h: Habit, date: ISODate) {
  const target = habitTarget(h)
  useStore.getState().logHabit(h.id, date, amountOn(h, date) >= target ? 0 : target)
}

export function archiveHabit(h: Habit, archived: boolean) {
  const { patch } = useStore.getState()
  patch('habits', h.id, { archived })
  toast(archived ? `“${h.name}” archived` : `“${h.name}” restored`, {
    action: { label: 'Undo', onClick: () => useStore.getState().patch('habits', h.id, { archived: !archived }) },
  })
}

export function deleteHabit(h: Habit) {
  if (useGrowthUI.getState().habitDetail === h.id) closeHabitDetail()
  removeWithUndo('habits', h.id, `“${h.name}” deleted`)
}

/** Swap a habit with its neighbour in `list` (already sorted) and renumber orders. */
export function moveHabit(list: Habit[], id: ID, dir: -1 | 1) {
  const i = list.findIndex((h) => h.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  const { patch } = useStore.getState()
  next.forEach((h, idx) => {
    if (h.order !== idx) patch('habits', h.id, { order: idx })
  })
}

// ───────────────────────── Goal actions ─────────────────────────

export function patchGoal(id: ID, p: Partial<LifeGoal>) {
  useStore.getState().patch('lifeGoals', id, p)
}

export function completeGoal(g: LifeGoal) {
  const prev = { status: g.status, completedAt: g.completedAt }
  patchGoal(g.id, { status: 'done', completedAt: Date.now() })
  toast('Goal completed 🎉', { action: { label: 'Undo', onClick: () => patchGoal(g.id, prev) } })
}

export function setGoalStatus(g: LifeGoal, status: GoalStatus) {
  const prev = { status: g.status, completedAt: g.completedAt }
  patchGoal(g.id, { status, completedAt: status === 'done' ? Date.now() : undefined })
  const msg = status === 'paused' ? 'Goal paused' : status === 'dropped' ? 'Goal dropped' : 'Goal is active again'
  toast(msg, { action: { label: 'Undo', onClick: () => patchGoal(g.id, prev) } })
}

export function deleteGoal(g: LifeGoal) {
  removeWithUndo('lifeGoals', g.id, 'Goal deleted')
}
