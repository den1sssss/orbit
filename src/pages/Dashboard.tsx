import { useState, type ComponentType } from 'react'
import { LayoutGrid } from 'lucide-react'
import { Button, cn, PageHeader } from '@/components/ui'
import { greeting, UI_LOCALE } from '@/lib/dates'
import { useStore } from '@/lib/store'
import type { WidgetId } from '@/lib/types'
import { CustomizeDashboard } from './dashboard/Customize'
import {
  BriefingWidget, BudgetWidget, BusinessWidget, DatesWidget, GoalsWidget, HabitsWidget, JournalWidget, MoneyWidget,
  PaymentsWidget, QuickWidget, TasksWidget, TodayWidget,
} from './dashboard/Widgets'

const WIDGETS: Record<WidgetId, { component: ComponentType; wide?: boolean }> = {
  briefing: { component: BriefingWidget, wide: true },
  quick: { component: QuickWidget, wide: true },
  today: { component: TodayWidget },
  tasks: { component: TasksWidget },
  money: { component: MoneyWidget },
  budget: { component: BudgetWidget },
  payments: { component: PaymentsWidget },
  goals: { component: GoalsWidget },
  journal: { component: JournalWidget },
  habits: { component: HabitsWidget },
  dates: { component: DatesWidget },
  business: { component: BusinessWidget },
}

export function Dashboard() {
  const widgets = useStore((s) => s.settings.widgets)
  const name = useStore((s) => s.settings.userName)
  const [customizing, setCustomizing] = useState(false)
  const first = name.trim().split(' ')[0]

  return (
    <>
      <PageHeader
        title={`${greeting()}${first ? `, ${first}` : ''}`}
        subtitle={new Date().toLocaleDateString(UI_LOCALE, { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <Button size="sm" variant="ghost" icon={LayoutGrid} onClick={() => setCustomizing(true)} className="max-sm:hidden">
            Customize
          </Button>
        }
      />
      <div className="grid grid-flow-row-dense grid-cols-1 gap-4 lg:grid-cols-2">
        {widgets
          .filter((w) => w.visible && WIDGETS[w.id])
          .map((w) => {
            const { component: C, wide } = WIDGETS[w.id]
            return (
              <div key={w.id} className={cn('min-w-0 [&>*]:h-full', wide && 'lg:col-span-2')}>
                <C />
              </div>
            )
          })}
      </div>
      <div className="mt-6 flex justify-center sm:hidden">
        <Button size="sm" variant="ghost" icon={LayoutGrid} onClick={() => setCustomizing(true)}>
          Customize dashboard
        </Button>
      </div>
      <CustomizeDashboard open={customizing} onClose={() => setCustomizing(false)} />
    </>
  )
}
