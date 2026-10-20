import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Info, LayoutGrid, ListChecks, Smartphone, UserRound } from 'lucide-react'
import { Button, Input, PageHeader, Segmented, Select } from '@/components/ui'
import { CURRENCIES } from '@/lib/format'
import { isIOS, isStandalone } from '@/lib/platform'
import { notificationsSupported, requestNotifications } from '@/lib/reminders'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import type { Settings } from '@/lib/types'
import { CustomizeDashboard } from './dashboard/Customize'
import { DataSettings } from './settings/DataSettings'
import { MoneySettings } from './settings/MoneySettings'
import { SecuritySettings } from './settings/SecuritySettings'
import { Row, Section } from './settings/Section'

function NotificationRow() {
  const [perm, setPerm] = useState(notificationsSupported() ? Notification.permission : 'unsupported')
  return (
    <Row
      label="Reminders"
      hint="Event and task reminders show as notifications while Orbit is open (and in-app toasts)."
    >
      {perm === 'granted' ? (
        <p className="text-sm text-good sm:text-right">Enabled</p>
      ) : perm === 'unsupported' && isIOS() && !isStandalone() ? (
        <p className="text-sm text-muted sm:text-right">Add Orbit to your Home Screen first</p>
      ) : perm === 'unsupported' ? (
        <p className="text-sm text-muted sm:text-right">Not supported in this browser</p>
      ) : perm === 'denied' ? (
        <p className="text-sm text-muted sm:text-right">Blocked in browser settings</p>
      ) : (
        <Button
          icon={Bell}
          block
          onClick={async () => {
            const r = await requestNotifications()
            setPerm(r)
            if (r === 'granted') toast('Notifications enabled')
          }}
        >
          Enable notifications
        </Button>
      )}
    </Row>
  )
}

export function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const [customizing, setCustomizing] = useState(false)

  return (
    <>
      <PageHeader title="Settings" subtitle="Make Orbit yours" />
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Section title="Profile & preferences" icon={UserRound}>
          <Row label="Name">
            <Input value={settings.userName} placeholder="Your name" onChange={(e) => updateSettings({ userName: e.target.value })} />
          </Row>
          <Row label="Currency" hint="Used everywhere money is shown.">
            <Select value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Row>
          <Row label="Week starts on">
            <Segmented<'1' | '0'>
              block
              value={String(settings.weekStartsOn) as '1' | '0'}
              onChange={(v) => updateSettings({ weekStartsOn: Number(v) as 0 | 1 })}
              options={[
                { value: '1', label: 'Monday' },
                { value: '0', label: 'Sunday' },
              ]}
            />
          </Row>
          <Row label="Appearance">
            <Segmented<Settings['theme']>
              block
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
          <NotificationRow />
        </Section>

        <Section title="Dashboard & lists" icon={LayoutGrid}>
          <Row label="Home widgets" hint="Show, hide and reorder what you see on Home.">
            <Button icon={LayoutGrid} block onClick={() => setCustomizing(true)}>Customize dashboard</Button>
          </Row>
          <Row label="Task categories & projects" hint="Managed from the Tasks screen.">
            <Link to="/tasks">
              <Button icon={ListChecks} block>Open Tasks</Button>
            </Link>
          </Row>
        </Section>

        <MoneySettings />
        <SecuritySettings />
        <DataSettings />

        <Section title="Install on your phone" icon={Smartphone} description="Orbit is a web app that installs like a native app and works offline.">
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
            <li><span className="font-medium text-ink">iPhone / iPad:</span> open Orbit in Safari → Share → <em>Add to Home Screen</em>, then always open it from that icon (Safari and the installed app keep separate data).</li>
            <li><span className="font-medium text-ink">Android:</span> open in Chrome → ⋮ menu → <em>Install app</em>.</li>
            <li><span className="font-medium text-ink">Desktop:</span> Chrome or Edge → install icon in the address bar.</li>
          </ul>
          <p className="text-[13px] text-muted">
            Data lives on each device separately. To move it, export a backup here and import it on the other device.
          </p>
        </Section>

        <Section title="About" icon={Info}>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Orbit 0.1 — your personal command center for work, money and life. Local-first: no account, no tracking.
            Shortcut: <kbd className="rounded border border-line px-1 text-xs">⌘K</kbd> / <kbd className="rounded border border-line px-1 text-xs">Ctrl K</kbd> to search.
          </p>
        </Section>
      </div>
      <CustomizeDashboard open={customizing} onClose={() => setCustomizing(false)} />
    </>
  )
}
