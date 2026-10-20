import { useState } from 'react'
import { confirm } from '@/lib/ui'

/** Local editable copy of a record + dirty tracking. */
export function useDraft<T extends object>(init: () => T) {
  const [draft, setDraft] = useState<T>(init)
  const [dirty, setDirty] = useState(false)
  function set<K extends keyof T>(key: K, value: T[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
  }
  function merge(patch: Partial<T>) {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }
  return { draft, set, merge, dirty }
}

/** Ask before throwing away unsaved edits. */
export async function guardClose(dirty: boolean, onClose: () => void) {
  if (!dirty) return onClose()
  const ok = await confirm({
    title: 'Discard changes?',
    message: 'Your unsaved edits will be lost.',
    confirmLabel: 'Discard',
    danger: true,
  })
  if (ok) onClose()
}
