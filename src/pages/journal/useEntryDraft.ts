// Local draft of one day's journal entry with debounced autosave.
//
// - Nothing is written until the user changes something (a mood click counts).
// - Changes are flushed ~500ms after the last edit, on unmount (date change /
//   leaving the page) and when the page is hidden or closed.
// - Clearing every field removes the entry again, so history never shows blanks.
// - Changes made elsewhere (undo after delete, restore, import) reset the draft.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import type { ISODate, JournalEntry, Mood } from '@/lib/types'
import { hasContent } from './insights'

export interface Draft {
  mood?: Mood
  energy?: Mood
  body: string
  /** Always at least three slots; empties are dropped on save. */
  gratitude: string[]
  wins: string
  lessons: string
  tomorrow: string
  tags: string[]
}

const SAVE_DELAY = 500
const GRATITUDE_SLOTS = 3

export function draftFrom(e?: JournalEntry): Draft {
  const g = e?.gratitude ?? []
  return {
    mood: e?.mood,
    energy: e?.energy,
    body: e?.body ?? '',
    gratitude: [...g, ...Array<string>(Math.max(0, GRATITUDE_SLOTS - g.length)).fill('')],
    wins: e?.wins ?? '',
    lessons: e?.lessons ?? '',
    tomorrow: e?.tomorrow ?? '',
    tags: e?.tags ?? [],
  }
}

function toPatch(d: Draft): Partial<JournalEntry> {
  return {
    mood: d.mood,
    energy: d.energy,
    body: d.body,
    gratitude: d.gratitude.map((g) => g.trim()).filter(Boolean),
    wins: d.wins,
    lessons: d.lessons,
    tomorrow: d.tomorrow,
    tags: d.tags,
  }
}

function findEntry(date: ISODate) {
  return useStore.getState().journal.find((j) => j.date === date)
}

export function useEntryDraft(date: ISODate) {
  // `find` returns the stored object itself, so this selector is reference-stable.
  const entry = useStore((s) => s.journal.find((j) => j.date === date))
  const [draft, setDraft] = useState<Draft>(() => draftFrom(entry))
  const [dirty, setDirty] = useState(false)
  /** Bumped when the draft is replaced from outside, to remount uncontrolled inputs. */
  const [version, setVersion] = useState(0)

  const draftRef = useRef(draft)
  const dirtyRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  /** The stored entry as of the last render we reconciled with. */
  const seenRef = useRef<JournalEntry | undefined>(entry)
  /** Entry objects produced by our own writes (not external changes). */
  const ownRef = useRef(new WeakSet<JournalEntry>())
  /** True when our last write removed the entry. */
  const removedRef = useRef(false)

  const cancelTimer = () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }

  const flush = useCallback(() => {
    cancelTimer()
    if (!dirtyRef.current) return
    dirtyRef.current = false
    const st = useStore.getState()
    const existing = findEntry(date)
    const patch = toPatch(draftRef.current)
    if (hasContent({ ...existing, ...patch })) st.upsertJournal(date, patch)
    else if (existing) st.remove('journal', existing.id)
    const written = findEntry(date)
    if (written) ownRef.current.add(written)
    removedRef.current = !written
    setDirty(false)
  }, [date])

  const update = useCallback(
    (p: Partial<Draft>, opts: { immediate?: boolean } = {}) => {
      draftRef.current = { ...draftRef.current, ...p }
      setDraft(draftRef.current)
      dirtyRef.current = true
      setDirty(true)
      cancelTimer()
      if (opts.immediate) flush()
      else timerRef.current = window.setTimeout(flush, SAVE_DELAY)
    },
    [flush],
  )

  // Entry changed by someone else → adopt it.
  useEffect(() => {
    if (entry === seenRef.current) return
    seenRef.current = entry
    if (entry ? ownRef.current.has(entry) : removedRef.current) return
    // External change: forget our writes so an undo that restores one of them is adopted.
    ownRef.current = new WeakSet()
    removedRef.current = false
    cancelTimer()
    dirtyRef.current = false
    draftRef.current = draftFrom(entry)
    setDraft(draftRef.current)
    setDirty(false)
    setVersion((v) => v + 1)
  }, [entry])

  // Flush on unmount and before the page goes away. Capture phase so the store is
  // updated before persistence's own hide/close handlers write to disk.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    const opts = { capture: true }
    window.addEventListener('pagehide', flush, opts)
    window.addEventListener('visibilitychange', onVisibility, opts)
    return () => {
      window.removeEventListener('pagehide', flush, opts)
      window.removeEventListener('visibilitychange', onVisibility, opts)
      flush()
    }
  }, [flush])

  return { entry, draft, update, dirty, version }
}
