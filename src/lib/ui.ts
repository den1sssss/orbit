import { create } from 'zustand'
import { uid, useStore } from './store'
import type { CalendarEvent, CollectionKey, ID, ISODate, ItemOf, Note, Task, Transaction } from './types'

export type EditorRequest =
  | { kind: 'task'; id?: ID; initial?: Partial<Task> }
  | { kind: 'event'; id?: ID; initial?: Partial<CalendarEvent>; occurrenceDate?: ISODate }
  | { kind: 'transaction'; id?: ID; initial?: Partial<Transaction> }
  | { kind: 'note'; id?: ID; initial?: Partial<Note> }

export interface Toast {
  id: string
  message: string
  tone?: 'default' | 'error'
  action?: { label: string; onClick: () => void }
}

export interface ConfirmRequest {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface UIState {
  /** loading → (new | locked | ready) */
  status: 'loading' | 'locked' | 'ready'
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt?: number
  editor: EditorRequest | null
  quickAddOpen: boolean
  toasts: Toast[]
  confirmReq: ConfirmRequest | null
}

export const useUI = create<UIState>()(() => ({
  status: 'loading',
  saveState: 'idle',
  editor: null,
  quickAddOpen: false,
  toasts: [],
  confirmReq: null,
}))

/** Open the shared editor sheet for a task / event / transaction / note. */
export function openEditor(req: EditorRequest) {
  useUI.setState({ editor: req, quickAddOpen: false })
}

export function closeEditor() {
  useUI.setState({ editor: null })
}

export function setQuickAdd(open: boolean) {
  useUI.setState({ quickAddOpen: open })
}

export function toast(message: string, opts: Omit<Toast, 'id' | 'message'> = {}) {
  const t: Toast = { id: uid(), message, ...opts }
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-2), t] }))
  setTimeout(() => dismissToast(t.id), opts.action ? 6000 : 3000)
}

export function dismissToast(id: string) {
  useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

/** Promise-based confirm dialog. */
export function confirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useUI.setState({
      confirmReq: {
        ...opts,
        resolve: (ok) => {
          useUI.setState({ confirmReq: null })
          resolve(ok)
        },
      },
    })
  })
}

/** Delete a record and show an Undo toast. */
export function removeWithUndo<K extends CollectionKey>(key: K, id: ID, label = 'Deleted') {
  const removed = useStore.getState().remove(key, id)
  if (!removed) return
  toast(label, {
    action: {
      label: 'Undo',
      onClick: () => useStore.getState().insert(key, removed as ItemOf<K>),
    },
  })
}
