// Local draft of one week/month review with debounced autosave (same approach as the
// journal's useEntryDraft):
// - Nothing is stored until the user enters something; clearing everything removes it.
// - Changes flush ~600ms after the last edit, on unmount and when the page is hidden.
// - Changes made elsewhere (undo, import, restore) replace the draft.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { uid, useStore } from '@/lib/store'
import type { Mood, Review } from '@/lib/types'
import type { Period } from './lib'

export interface ReviewDraft {
  rating?: Mood
  wins: string
  challenges: string
  lessons: string
  focus: string
}

const SAVE_DELAY = 600

function draftFrom(r?: Review): ReviewDraft {
  return {
    rating: r?.rating,
    wins: r?.wins ?? '',
    challenges: r?.challenges ?? '',
    lessons: r?.lessons ?? '',
    focus: r?.focus ?? '',
  }
}

export function reviewHasContent(d: Partial<ReviewDraft>): boolean {
  return Boolean(d.rating || d.wins?.trim() || d.challenges?.trim() || d.lessons?.trim() || d.focus?.trim())
}

function findReview(period: Period, key: string): Review | undefined {
  return useStore.getState().reviews.find((r) => r.period === period && r.key === key)
}

export type SaveStatus = 'idle' | 'pending' | 'saved'

export function useReviewDraft(period: Period, key: string) {
  const reviews = useStore((s) => s.reviews)
  const record = useMemo(() => reviews.find((r) => r.period === period && r.key === key), [reviews, period, key])
  const [draft, setDraft] = useState<ReviewDraft>(() => draftFrom(record))
  const [status, setStatus] = useState<SaveStatus>('idle')

  const draftRef = useRef(draft)
  const dirtyRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  const seenRef = useRef<Review | undefined>(record)
  const ownRef = useRef(new WeakSet<Review>())
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
    const existing = findReview(period, key)
    const d = draftRef.current
    const fields = { rating: d.rating, wins: d.wins, challenges: d.challenges, lessons: d.lessons, focus: d.focus }
    if (reviewHasContent(d)) {
      if (existing) st.patch('reviews', existing.id, fields)
      else {
        const now = Date.now()
        st.insert('reviews', { id: uid(), period, key, ...fields, createdAt: now, updatedAt: now })
      }
    } else if (existing) {
      st.remove('reviews', existing.id)
    }
    const written = findReview(period, key)
    if (written) ownRef.current.add(written)
    removedRef.current = !written
    setStatus('saved')
  }, [period, key])

  const update = useCallback(
    (p: Partial<ReviewDraft>, opts: { immediate?: boolean } = {}) => {
      draftRef.current = { ...draftRef.current, ...p }
      setDraft(draftRef.current)
      dirtyRef.current = true
      setStatus('pending')
      cancelTimer()
      if (opts.immediate) flush()
      else timerRef.current = window.setTimeout(flush, SAVE_DELAY)
    },
    [flush],
  )

  // Record changed by someone else → adopt it.
  useEffect(() => {
    if (record === seenRef.current) return
    seenRef.current = record
    if (record ? ownRef.current.has(record) : removedRef.current) return
    ownRef.current = new WeakSet()
    removedRef.current = false
    cancelTimer()
    dirtyRef.current = false
    draftRef.current = draftFrom(record)
    setDraft(draftRef.current)
    setStatus('idle')
  }, [record])

  // Flush on unmount and before the page goes away (capture phase, before persistence writes).
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

  return { record, draft, update, status }
}
