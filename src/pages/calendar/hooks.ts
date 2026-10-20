import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { agendaRange, type DayAgenda } from '@/lib/agenda'
import { useStore } from '@/lib/store'
import type { ISODate, Note } from '@/lib/types'
import { DEFAULT_LAYERS, type LayerKey, type Layers } from './lib'

export interface CalendarData {
  agenda: Map<ISODate, DayAgenda>
  /** Non-archived notes attached to a date (only when the Journal layer is on). */
  notesByDate: Map<ISODate, Note[]>
}

/** Events / tasks / payments / journal joined by date for [start, end], filtered by layer. */
export function useCalendarData(start: ISODate, end: ISODate, layers: Layers): CalendarData {
  // Raw slices only — derived data lives in useMemo (stable selector results).
  const events = useStore((s) => s.events)
  const tasks = useStore((s) => s.tasks)
  const plannedPayments = useStore((s) => s.plannedPayments)
  const journal = useStore((s) => s.journal)
  const notes = useStore((s) => s.notes)
  const { events: showEvents, tasks: showTasks, payments: showPayments, journal: showJournal } = layers

  const agenda = useMemo(
    () =>
      agendaRange(
        {
          events: showEvents ? events : [],
          tasks: showTasks ? tasks : [],
          plannedPayments: showPayments ? plannedPayments : [],
          journal: showJournal ? journal : [],
        },
        start,
        end,
      ),
    [events, tasks, plannedPayments, journal, start, end, showEvents, showTasks, showPayments, showJournal],
  )

  const notesByDate = useMemo(() => {
    const map = new Map<ISODate, Note[]>()
    if (!showJournal) return map
    for (const n of notes) {
      if (!n.date || n.archived || n.date < start || n.date > end) continue
      const list = map.get(n.date)
      if (list) list.push(n)
      else map.set(n.date, [n])
    }
    return map
  }, [notes, start, end, showJournal])

  return { agenda, notesByDate }
}

const LAYERS_KEY = 'orbit:calendar-layers'

function readLayers(): Layers {
  try {
    const raw = localStorage.getItem(LAYERS_KEY)
    if (!raw) return DEFAULT_LAYERS
    const parsed = JSON.parse(raw) as Partial<Record<LayerKey, unknown>>
    const out = { ...DEFAULT_LAYERS }
    for (const k of Object.keys(DEFAULT_LAYERS) as LayerKey[]) {
      if (typeof parsed[k] === 'boolean') out[k] = parsed[k] as boolean
    }
    return out
  } catch {
    return DEFAULT_LAYERS
  }
}

/** Layer toggles, remembered per browser (a convenience; falls back to all-on). */
export function useLayers(): [Layers, (k: LayerKey) => void] {
  const [layers, setLayers] = useState<Layers>(readLayers)
  useEffect(() => {
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(layers))
    } catch {
      /* storage unavailable */
    }
  }, [layers])
  const toggle = useCallback((k: LayerKey) => setLayers((prev) => ({ ...prev, [k]: !prev[k] })), [])
  return [layers, toggle]
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Current time, refreshed every `ms` (for the "now" line). */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return now
}
