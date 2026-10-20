import { useState } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { Button, Field, Input, Segmented, Select } from '@/components/ui'
import { buildDemoData } from '@/lib/demo'
import { CURRENCIES } from '@/lib/format'
import { eraseAll, unlock } from '@/lib/persistence'
import { useStore } from '@/lib/store'
import { confirm, useUI } from '@/lib/ui'
import { emptyData } from '@/lib/defaults'
import { InstallHint } from './InstallHint'

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <img src="./icon.svg" alt="" className="h-12 w-12 animate-pulse" />
    </div>
  )
}

export function LockScreen() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!code) return
    setBusy(true)
    setError('')
    const ok = await unlock(code)
    setBusy(false)
    if (!ok) {
      setError('Wrong passcode')
      setCode('')
    }
  }

  const reset = async () => {
    const ok = await confirm({
      title: 'Erase everything?',
      message: 'Your data is encrypted with your passcode and cannot be recovered without it. Erasing deletes all data on this device so you can start over (you can then import a backup).',
      confirmLabel: 'Erase all data',
      danger: true,
    })
    if (!ok) return
    await eraseAll()
    useStore.getState().replaceAll(emptyData())
    useUI.setState({ status: 'ready' })
    location.reload()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <form
        className="w-full max-w-xs text-center"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
          <Lock size={26} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Orbit is locked</h1>
        <p className="mt-1 text-sm text-muted">Enter your passcode to decrypt your data.</p>
        <Input
          type="password"
          inputMode="text"
          autoFocus
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-6 h-12 text-center text-lg tracking-widest"
          placeholder="Passcode"
          aria-label="Passcode"
        />
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        <Button type="submit" variant="primary" size="lg" block className="mt-4" disabled={busy || !code}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>
        <button type="button" onClick={() => void reset()} className="mt-6 text-xs text-muted underline-offset-2 hover:underline">
          Forgot passcode?
        </button>
      </form>
      {/* The confirm dialog host lives in the app shell, which isn't mounted here. */}
      <LockConfirmHost />
    </div>
  )
}

function LockConfirmHost() {
  const req = useUI((s) => s.confirmReq)
  if (!req) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-pop">
        <h2 className="text-lg font-semibold">{req.title}</h2>
        <p className="mt-2 text-sm text-ink-2">{req.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => req.resolve(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => req.resolve(true)}>{req.confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}

function guessCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    const map: Record<string, string> = {
      US: 'USD', GB: 'GBP', RU: 'RUB', UA: 'UAH', KZ: 'KZT', TR: 'TRY', AE: 'AED', IN: 'INR', CA: 'CAD',
      AU: 'AUD', CH: 'CHF', JP: 'JPY', CN: 'CNY', BR: 'BRL', MX: 'MXN', PL: 'PLN', SE: 'SEK', NO: 'NOK',
      ZA: 'ZAR', NG: 'NGN', KE: 'KES', PH: 'PHP', ID: 'IDR', SG: 'SGD', GE: 'GEL', AM: 'AMD', UZ: 'UZS',
      TH: 'THB', IL: 'ILS', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', PT: 'EUR', IE: 'EUR',
      AT: 'EUR', BE: 'EUR', FI: 'EUR', GR: 'EUR',
    }
    return (region && map[region]) || 'USD'
  } catch {
    return 'USD'
  }
}

export function Onboarding() {
  const settings = useStore((s) => s.settings)
  const [name, setName] = useState(settings.userName)
  const [currency, setCurrency] = useState(guessCurrency)
  const [weekStart, setWeekStart] = useState<'0' | '1'>(String(settings.weekStartsOn) as '0' | '1')

  const finish = (demo: boolean) => {
    const next = { ...settings, userName: name.trim(), currency, weekStartsOn: Number(weekStart) as 0 | 1, onboarded: true }
    if (demo) useStore.getState().replaceAll(buildDemoData({ settings: next }))
    else useStore.getState().updateSettings(next)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <InstallHint variant="card" dismissible={false} />
        <img src="./icon.svg" alt="" className="mb-6 mt-6 h-12 w-12" />
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Welcome to Orbit</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          Your calendar, tasks, notes, journal and money — together in one calm place.
          Everything is stored privately on this device.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          <Field label="What should we call you?">
            <Input value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Week starts on">
              <Segmented<'0' | '1'>
                block
                value={weekStart}
                onChange={setWeekStart}
                options={[
                  { value: '1', label: 'Mon' },
                  { value: '0', label: 'Sun' },
                ]}
              />
            </Field>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2.5">
          <Button variant="primary" size="lg" block onClick={() => finish(false)}>
            Start fresh
          </Button>
          <Button variant="secondary" size="lg" block icon={Sparkles} onClick={() => finish(true)}>
            Explore with sample data
          </Button>
          <p className="mt-1 text-center text-xs text-muted">
            Sample data can be cleared any time in Settings → Data.
          </p>
        </div>
      </div>
    </div>
  )
}
