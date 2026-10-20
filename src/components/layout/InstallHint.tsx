import { useState } from 'react'
import { PlusSquare, Share, X } from 'lucide-react'
import { cn } from '@/components/ui'
import { isIOS, isStandalone } from '@/lib/platform'

const KEY = 'orbit:install-hint-dismissed'

function dismissedBefore() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Should we nudge the user to add Orbit to the Home Screen? (iPhone/iPad in Safari only) */
export function shouldShowInstallHint() {
  return isIOS() && !isStandalone()
}

/**
 * "Add to Home Screen" instructions for iPhone. Safari and the installed app keep
 * separate storage, so the earlier someone installs, the better.
 */
export function InstallHint({ variant = 'banner', dismissible = true }: { variant?: 'banner' | 'card'; dismissible?: boolean }) {
  const [hidden, setHidden] = useState(() => !shouldShowInstallHint() || (dismissible && dismissedBefore()))
  if (hidden) return null
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-accent/30 bg-accent-soft p-4 text-left',
        variant === 'banner' && 'mb-4',
      )}
    >
      {dismissible && (
        <button
          type="button"
          aria-label="Hide install tip"
          onClick={() => {
            try {
              localStorage.setItem(KEY, '1')
            } catch { /* private mode */ }
            setHidden(true)
          }}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-accent-text/70 hover:bg-accent/10"
        >
          <X size={16} />
        </button>
      )}
      <div className="flex items-start gap-3 pr-6">
        <img src="./icon.svg" alt="" className="h-10 w-10 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Install Orbit on your iPhone</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
            It opens full-screen like an app, works offline and keeps your data on the phone.
          </p>
          <ol className="mt-2.5 flex flex-col gap-1.5 text-[13px] text-ink">
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[11px] font-semibold">1</span>
              Tap <Share size={15} className="text-accent-text" aria-label="Share" /> <b className="font-semibold">Share</b> in Safari’s toolbar
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[11px] font-semibold">2</span>
              Choose <PlusSquare size={15} className="text-accent-text" aria-hidden /> <b className="font-semibold">Add to Home Screen</b>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-[11px] font-semibold">3</span>
              Open Orbit from the new icon
            </li>
          </ol>
          <p className="mt-2.5 text-xs text-muted">
            Data entered here in Safari stays separate from the installed app — install first.
          </p>
        </div>
      </div>
    </div>
  )
}
