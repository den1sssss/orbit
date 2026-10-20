// In-app reminders: while Orbit is open, fire notifications for events and tasks
// whose reminder time has arrived. (Web apps can't wake themselves when closed
// without a push server, so this runs only while the app is open.)
import { useEffect } from 'react'
import { addDaysISO, fmtTime, fromISO, occurrencesBetween, todayISO } from './dates'
import { useStore } from './store'
import { toast } from './ui'

const FIRED_KEY = 'orbit:fired-reminders'
/** Still fire a reminder if the app is opened up to this long after its time. */
const GRACE_MS = 2 * 60 * 60 * 1000

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}

function saveFired(set: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-300)))
  } catch { /* storage unavailable */ }
}

function at(date: string, time = '09:00'): number {
  const d = fromISO(date)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h, m || 0, 0, 0)
  return d.getTime()
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.requestPermission()
}

async function notify(title: string, body: string) {
  toast(`${title} — ${body}`)
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, { body, icon: './icon-192.png', tag: title + body })
    else new Notification(title, { body, icon: './icon-192.png' })
  } catch { /* some mobile browsers only allow SW notifications */ }
}

function check() {
  const s = useStore.getState()
  const now = Date.now()
  const today = todayISO()
  const fired = loadFired()
  let changed = false

  for (const ev of s.events) {
    if (ev.reminder === undefined) continue
    for (const d of occurrencesBetween(ev, addDaysISO(today, -1), addDaysISO(today, 8))) {
      const start = at(d, ev.allDay ? '09:00' : ev.startTime)
      const due = start - ev.reminder * 60_000
      const key = `e:${ev.id}:${d}:${ev.reminder}`
      if (now >= due && now - due < GRACE_MS && !fired.has(key)) {
        fired.add(key)
        changed = true
        void notify(ev.title, ev.allDay ? 'All day today' : `Starts at ${fmtTime(ev.startTime)}${ev.location ? ` · ${ev.location}` : ''}`)
      }
    }
  }

  for (const t of s.tasks) {
    if (t.reminder === undefined || !t.dueDate || t.status === 'done') continue
    const dueAt = at(t.dueDate, t.dueTime)
    const due = dueAt - t.reminder * 60_000
    const key = `t:${t.id}:${t.dueDate}:${t.dueTime ?? ''}:${t.reminder}`
    if (now >= due && now - due < GRACE_MS && !fired.has(key)) {
      fired.add(key)
      changed = true
      void notify(t.title, t.dueTime ? `Due at ${fmtTime(t.dueTime)}` : 'Due today')
    }
  }

  if (changed) saveFired(fired)
}

export function useReminders(active: boolean) {
  useEffect(() => {
    if (!active) return
    check()
    const id = window.setInterval(check, 30_000)
    return () => window.clearInterval(id)
  }, [active])
}
