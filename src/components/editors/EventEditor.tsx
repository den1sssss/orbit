import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, cn, ColorPicker, Field, Input, Select, Sheet, Textarea, Toggle } from '@/components/ui'
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, REMINDER_OPTIONS } from '@/lib/defaults'
import { describeRecurrence, fmt, fromISO, minutesToTime, timeToMinutes } from '@/lib/dates'
import { makeEvent, useStore } from '@/lib/store'
import { removeWithUndo, toast } from '@/lib/ui'
import type { CalendarEvent, EventType, ID, ISODate, RecurrenceFreq } from '@/lib/types'
import { ProjectSelect } from './fields'
import { guardClose, useDraft } from './useDraft'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function EventEditor({
  id, initial, occurrenceDate, onClose,
}: {
  id?: ID
  initial?: Partial<CalendarEvent>
  /** The occurrence that was clicked (for "delete this occurrence"). */
  occurrenceDate?: ISODate
  onClose: () => void
}) {
  const existing = useStore((s) => (id ? s.events.find((e) => e.id === id) : undefined))
  const insert = useStore((s) => s.insert)
  const patch = useStore((s) => s.patch)
  const skipOccurrence = useStore((s) => s.skipOccurrence)
  const [error, setError] = useState('')
  const [askDelete, setAskDelete] = useState(false)
  const { draft, set, merge, dirty } = useDraft<CalendarEvent>(() => {
    if (existing) return { ...existing, recurrence: { ...existing.recurrence } }
    const start = initial?.startTime ?? '09:00'
    return makeEvent({
      title: '',
      startTime: start,
      endTime: minutesToTime(Math.min(timeToMinutes(start) + 60, 23 * 60 + 59)),
      ...initial,
    })
  })
  const recurring = draft.recurrence.freq !== 'none'

  const setStart = (t: string) => {
    // Keep the duration when moving the start time.
    const dur = timeToMinutes(draft.endTime) - timeToMinutes(draft.startTime)
    const end = t ? minutesToTime(Math.min(timeToMinutes(t) + (dur > 0 ? dur : 60), 23 * 60 + 59)) : draft.endTime
    merge({ startTime: t || undefined, endTime: end })
  }

  const save = () => {
    const title = draft.title.trim()
    if (!title) return setError('Give the event a title')
    if (!draft.allDay && draft.startTime && draft.endTime && draft.endTime < draft.startTime) {
      return setError('End time is before the start time')
    }
    const final: CalendarEvent = {
      ...draft,
      title,
      startTime: draft.allDay ? undefined : draft.startTime,
      endTime: draft.allDay ? undefined : draft.endTime,
      recurrence: {
        ...draft.recurrence,
        interval: Math.max(1, draft.recurrence.interval || 1),
        weekdays:
          draft.recurrence.freq === 'weekly'
            ? draft.recurrence.weekdays?.length ? draft.recurrence.weekdays : [fromISO(draft.date).getDay()]
            : undefined,
      },
    }
    if (existing) patch('events', existing.id, final)
    else insert('events', final)
    toast(existing ? 'Event updated' : 'Event added')
    onClose()
  }

  const close = () => guardClose(dirty, onClose)

  const deleteAll = () => {
    if (!existing) return
    removeWithUndo('events', existing.id, recurring ? 'Series deleted' : 'Event deleted')
    onClose()
  }

  const footer = askDelete ? (
    <>
      <span className="text-sm text-muted">Delete…</span>
      <div className="flex-1" />
      <Button variant="ghost" onClick={() => setAskDelete(false)}>Cancel</Button>
      <Button
        onClick={() => {
          if (existing && occurrenceDate) skipOccurrence(existing.id, occurrenceDate)
          toast('Occurrence removed')
          onClose()
        }}
      >
        This one
      </Button>
      <Button variant="danger" onClick={deleteAll}>All</Button>
    </>
  ) : (
    <>
      {existing && (
        <Button
          variant="ghost"
          icon={Trash2}
          className="text-bad"
          onClick={() => (recurring && occurrenceDate ? setAskDelete(true) : deleteAll())}
        >
          Delete
        </Button>
      )}
      <div className="flex-1" />
      <Button variant="ghost" onClick={close}>Cancel</Button>
      <Button variant="primary" onClick={save}>{existing ? 'Save' : 'Add event'}</Button>
    </>
  )

  return (
    <Sheet open onClose={close} title={existing ? 'Edit event' : 'New event'} footer={footer}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field error={error}>
          <Input
            data-autofocus
            value={draft.title}
            placeholder="Meeting, appointment, plan…"
            className="h-12 text-[17px] font-medium sm:text-base"
            onChange={(e) => {
              set('title', e.target.value)
              setError('')
            }}
          />
        </Field>

        <Field label="Type">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('type', t)}
                className={cn(
                  'h-8 rounded-lg px-3 text-[13px] font-medium transition-colors',
                  draft.type === t ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 hover:text-ink',
                )}
              >
                {EVENT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Date">
            <Input type="date" value={draft.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
          </Field>
          <div className="pb-2">
            <Toggle checked={draft.allDay} onChange={(v) => set('allDay', v)} label="All day" />
          </div>
        </div>

        {!draft.allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <Input type="time" value={draft.startTime ?? ''} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Ends">
              <Input type="time" value={draft.endTime ?? ''} onChange={(e) => set('endTime', e.target.value || undefined)} />
            </Field>
          </div>
        )}

        <Field label="Repeat" hint={recurring ? describeRecurrence(draft) : undefined}>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Select
              value={draft.recurrence.freq}
              onChange={(e) => set('recurrence', { ...draft.recurrence, freq: e.target.value as RecurrenceFreq })}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
            {recurring && (
              <div className="flex items-center gap-2 text-sm text-muted">
                every
                <Input
                  type="number"
                  min={1}
                  className="w-16"
                  value={draft.recurrence.interval}
                  onChange={(e) => set('recurrence', { ...draft.recurrence, interval: Number(e.target.value) || 1 })}
                />
              </div>
            )}
          </div>
          {draft.recurrence.freq === 'weekly' && (
            <div className="mt-1 flex gap-1.5">
              {WEEKDAYS.map((label, i) => {
                const days = draft.recurrence.weekdays?.length ? draft.recurrence.weekdays : [fromISO(draft.date).getDay()]
                const on = days.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    aria-label={fmt(`2023-01-0${i + 1}`, 'EEEE')}
                    onClick={() => {
                      const next = on ? days.filter((d) => d !== i) : [...days, i]
                      set('recurrence', { ...draft.recurrence, weekdays: next.length ? next : days })
                    }}
                    className={cn(
                      'h-8 w-8 rounded-full text-xs font-semibold transition-colors',
                      on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          {recurring && (
            <div className="mt-1 flex items-center gap-2 text-sm text-muted">
              Ends
              <Input
                type="date"
                className="max-w-44"
                value={draft.recurrence.until ?? ''}
                min={draft.date}
                onChange={(e) => set('recurrence', { ...draft.recurrence, until: e.target.value || undefined })}
              />
              {!draft.recurrence.until && <span className="text-xs">never</span>}
            </div>
          )}
        </Field>

        <Field label="Reminder" hint="Shown as a notification while Orbit is open.">
          <Select
            value={draft.reminder ?? ''}
            onChange={(e) => set('reminder', e.target.value === '' ? undefined : Number(e.target.value))}
          >
            <option value="">No reminder</option>
            {REMINDER_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Location">
          <Input value={draft.location ?? ''} placeholder="Address or link" onChange={(e) => set('location', e.target.value)} />
        </Field>

        <Field label="Project">
          <ProjectSelect value={draft.projectId} onChange={(v) => set('projectId', v)} />
        </Field>

        <Field label="Color">
          <ColorPicker value={draft.color ?? EVENT_TYPE_COLORS[draft.type]} onChange={(c) => set('color', c)} />
        </Field>

        <Field label="Notes">
          <Textarea value={draft.notes ?? ''} placeholder="Agenda, prep, details…" onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}
