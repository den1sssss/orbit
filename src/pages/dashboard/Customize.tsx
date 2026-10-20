import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'
import { Button, IconButton, Sheet, Toggle } from '@/components/ui'
import { DEFAULT_WIDGETS, WIDGET_LABELS } from '@/lib/defaults'
import { useStore } from '@/lib/store'

/** Show/hide and reorder dashboard widgets. */
export function CustomizeDashboard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const widgets = useStore((s) => s.settings.widgets)
  const updateSettings = useStore((s) => s.updateSettings)

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= widgets.length) return
    const next = [...widgets]
    ;[next[i], next[j]] = [next[j], next[i]]
    updateSettings({ widgets: next })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Customize dashboard"
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            icon={RotateCcw}
            onClick={() => updateSettings({ widgets: DEFAULT_WIDGETS.map((w) => ({ ...w })) })}
          >
            Reset
          </Button>
          <div className="flex-1" />
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-muted">Choose what you see on Home and in which order.</p>
      <div className="divide-y divide-line rounded-2xl border border-line">
        {widgets.map((w, i) => (
          <div key={w.id} className="flex items-center gap-2 px-3 py-2">
            <div className="flex flex-col">
              <IconButton size="sm" icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="h-6" />
              <IconButton size="sm" icon={ArrowDown} label="Move down" disabled={i === widgets.length - 1} onClick={() => move(i, 1)} className="h-6" />
            </div>
            <div className="flex-1">
              <Toggle
                checked={w.visible}
                label={WIDGET_LABELS[w.id]}
                onChange={(visible) =>
                  updateSettings({ widgets: widgets.map((x) => (x.id === w.id ? { ...x, visible } : x)) })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
