import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn, IconButton } from './primitives'

/**
 * Track the visible viewport. On iPhone the on-screen keyboard shrinks the visual
 * viewport but not the layout one, so a bottom sheet would sit behind the keyboard.
 */
function useVisualViewport(active: boolean): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>()
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const update = () => {
      // Only pin to the visual viewport while it's clearly smaller (keyboard open).
      const keyboard = window.innerHeight - vv.height > 80
      setStyle(keyboard ? { top: vv.offsetTop, height: vv.height, bottom: 'auto' } : undefined)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])
  return style
}

/** Open sheets, newest last — only the top one reacts to Escape. */
const stack: symbol[] = []

/**
 * Modal surface: a bottom sheet on phones, a centered dialog on larger screens.
 * Closes on Escape and backdrop click.
 */
export function Sheet({
  open, onClose, title, children, footer, size = 'md', headerAction,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  headerAction?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const viewport = useVisualViewport(open)

  useEffect(() => {
    if (!open) return
    const id = Symbol('sheet')
    stack.push(id)
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    // Focus the first field for quick entry (desktop); keep phones from popping the keyboard.
    const t = window.setTimeout(() => {
      if (window.matchMedia('(min-width: 640px)').matches) {
        const el = panelRef.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]), textarea')
        el?.focus()
      }
    }, 30)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(id), 1)
      if (!stack.length) document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" style={viewport}>
      <div className="anim-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'anim-sheet relative flex max-h-[92%] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop sm:rounded-3xl',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-surface-3 sm:hidden" />
        {(title || headerAction) && (
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-3 sm:pt-5">
            <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{title}</h2>
            <div className="flex items-center gap-1">
              {headerAction}
              <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
