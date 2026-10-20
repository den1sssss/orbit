import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, cn, Sheet } from '@/components/ui'
import { dismissToast, useUI } from '@/lib/ui'

export function ConfirmHost() {
  const req = useUI((s) => s.confirmReq)
  if (!req) return null
  return (
    <Sheet
      open
      size="sm"
      onClose={() => req.resolve(false)}
      title={req.title}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => req.resolve(false)}>Cancel</Button>
          <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => req.resolve(true)}>
            {req.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {req.message && <p className="text-sm text-ink-2">{req.message}</p>}
    </Sheet>
  )
}

export function ToastHost() {
  const toasts = useUI((s) => s.toasts)
  if (!toasts.length) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'anim-sheet pointer-events-auto flex min-h-11 w-full max-w-sm items-center gap-3 rounded-xl px-4 py-2 text-sm shadow-pop',
            t.tone === 'error' ? 'bg-bad text-white' : 'bg-ink text-bg',
          )}
        >
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="font-semibold text-accent-soft underline-offset-2 hover:underline"
              onClick={() => {
                t.action!.onClick()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="opacity-60 hover:opacity-100" onClick={() => dismissToast(t.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
