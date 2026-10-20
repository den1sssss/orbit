import { useState } from 'react'
import { KeyRound, Lock, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Button, Field, Input, Select, Sheet } from '@/components/ui'
import { cryptoAvailable } from '@/lib/crypto'
import { changePasscode, disablePasscode, enablePasscode, isEncrypted, lock } from '@/lib/persistence'
import { useStore } from '@/lib/store'
import { toast } from '@/lib/ui'
import { Row, Section } from './Section'

type Mode = 'set' | 'change' | 'remove'

function PasscodeSheet({ mode, onClose, onDone }: { mode: Mode; onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError('')
    if (mode !== 'remove') {
      if (next.length < 4) return setError('Use at least 4 characters')
      if (next !== again) return setError('Passcodes don’t match')
    }
    setBusy(true)
    try {
      if (mode === 'set') {
        await enablePasscode(next)
        toast('Passcode set — your data is now encrypted')
      } else if (mode === 'change') {
        if (!(await changePasscode(current, next))) return setError('Current passcode is wrong')
        toast('Passcode changed')
      } else {
        if (!(await disablePasscode(current))) return setError('Passcode is wrong')
        toast('Passcode removed')
      }
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'set' ? 'Set a passcode' : mode === 'change' ? 'Change passcode' : 'Remove passcode'
  return (
    <Sheet
      open
      size="sm"
      onClose={onClose}
      title={title}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={mode === 'remove' ? 'danger' : 'primary'} disabled={busy} onClick={() => void submit()}>
            {busy ? 'Working…' : mode === 'remove' ? 'Remove' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {mode === 'set' && (
          <p className="text-[13px] leading-relaxed text-muted">
            Your data will be encrypted on this device with AES-256 using a key derived from this passcode.
            There is no recovery — if you forget it, the data can’t be decrypted. Keep an exported backup somewhere safe.
          </p>
        )}
        {mode !== 'set' && (
          <Field label="Current passcode">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
        )}
        {mode !== 'remove' && (
          <>
            <Field label="New passcode">
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <Field label="Repeat new passcode">
              <Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
            </Field>
          </>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  )
}

export function SecuritySettings() {
  const autoLock = useStore((s) => s.settings.autoLockMinutes)
  const updateSettings = useStore((s) => s.updateSettings)
  const [enc, setEnc] = useState(isEncrypted())
  const [mode, setMode] = useState<Mode | null>(null)
  const available = cryptoAvailable()

  return (
    <Section
      id="security"
      title="Security & privacy"
      icon={enc ? ShieldCheck : ShieldAlert}
      description="Everything stays on this device. Nothing is sent to a server."
    >
      <div className={enc ? 'rounded-xl bg-good-soft p-3 text-[13px] text-good' : 'rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2'}>
        {enc
          ? 'Passcode lock is on. Your data is encrypted at rest (AES-256-GCM) and is unreadable without your passcode.'
          : 'Passcode lock is off. Anyone with access to this browser profile could open your data.'}
      </div>
      {!available && (
        <p className="text-[13px] text-warn">
          Encryption needs a secure connection. Open Orbit via https:// or localhost to enable the passcode.
        </p>
      )}
      {!enc ? (
        <Row label="Passcode lock" hint="Encrypt journal, notes and finances with a passcode.">
          <Button variant="primary" icon={KeyRound} disabled={!available} onClick={() => setMode('set')} block>
            Set passcode
          </Button>
        </Row>
      ) : (
        <>
          <Row label="Passcode" hint="Change or remove your passcode.">
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setMode('change')}>Change</Button>
              <Button className="flex-1" variant="ghost" onClick={() => setMode('remove')}>Remove</Button>
            </div>
          </Row>
          <Row label="Auto-lock" hint="Lock again after the app has been in the background.">
            <Select value={autoLock} onChange={(e) => updateSettings({ autoLockMinutes: Number(e.target.value) })}>
              <option value={1}>After 1 minute</option>
              <option value={5}>After 5 minutes</option>
              <option value={15}>After 15 minutes</option>
              <option value={60}>After 1 hour</option>
              <option value={0}>Only when reopened</option>
            </Select>
          </Row>
          <Row label="Lock now">
            <Button icon={Lock} block onClick={() => void lock()}>Lock Orbit</Button>
          </Row>
        </>
      )}
      {mode && <PasscodeSheet mode={mode} onClose={() => setMode(null)} onDone={() => setEnc(isEncrypted())} />}
    </Section>
  )
}
