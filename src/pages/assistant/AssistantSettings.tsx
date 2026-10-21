import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, CheckCircle2, Eye, EyeOff, Loader2, PlugZap, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import { Button, Field, IconButton, Input, Select, Toggle } from '@/components/ui'
import { isEncrypted } from '@/lib/persistence'
import { useStore } from '@/lib/store'
import { confirm, toast } from '@/lib/ui'
import type { AssistantSettings } from '@/lib/types'
import { Section } from '@/pages/settings/Section'
import { AssistantApiError, describeError, testConnection } from './api'
import { DEFAULT_MODEL, LEGACY_DEFAULT_MODEL, MODEL_OPTIONS, modelLabel, modelOption } from './models'

export const PRIVACY_TEXT =
  'When you ask something, a compact summary of your schedule, tasks, habits, goals and finances is sent to Anthropic to answer. Documents in the Vault and journal text are never sent. Nothing is sent unless you ask.'

function updateAssistant(patch: Partial<AssistantSettings>) {
  const s = useStore.getState()
  const current = s.settings.assistant
  // First-time setup: move the shipped default onto the recommended model.
  const firstSetup = !current.apiKey && !current.enabled && current.model === LEGACY_DEFAULT_MODEL
  s.updateSettings({
    assistant: { ...current, ...(firstSetup && !patch.model ? { model: DEFAULT_MODEL } : {}), ...patch },
  })
}

type TestState = { state: 'idle' } | { state: 'testing' } | { state: 'ok'; message: string } | { state: 'error'; message: string }

/** Settings card for the AI assistant (API key, model, privacy). Mounted in Settings. */
export function AssistantSettingsSection() {
  const cfg = useStore((s) => s.settings.assistant)
  const { hash } = useLocation()
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<TestState>({ state: 'idle' })

  // Deep link from the Assistant page: /settings#assistant (after AppShell's scroll-to-top).
  useEffect(() => {
    if (hash !== '#assistant') return
    const t = window.setTimeout(() => {
      document.getElementById('assistant')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [hash])

  const typed = keyInput.trim()
  const looksWrong = typed.length > 0 && !typed.startsWith('sk-ant-')

  const saveKey = () => {
    if (!typed) return
    updateAssistant({ apiKey: typed, enabled: true })
    setKeyInput('')
    setShowKey(false)
    setTest({ state: 'idle' })
    toast('API key saved on this device')
  }

  const removeKey = async () => {
    const ok = await confirm({
      title: 'Remove API key?',
      message: 'The assistant stops working until you add a key again. Your chat history stays.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    updateAssistant({ apiKey: undefined })
    setTest({ state: 'idle' })
    toast('API key removed')
  }

  const runTest = async () => {
    const key = typed || cfg.apiKey
    if (!key) return
    setTest({ state: 'testing' })
    try {
      const res = await testConnection(key, cfg.model || DEFAULT_MODEL)
      setTest({ state: 'ok', message: `Connected · ${modelLabel(res.model)} answered${typed ? '. Tap Save to keep this key.' : '.'}` })
    } catch (e) {
      setTest({
        state: 'error',
        message: e instanceof AssistantApiError ? describeError(e) : 'Connection test failed.',
      })
    }
  }

  const known = modelOption(cfg.model)
  const last4 = cfg.apiKey ? cfg.apiKey.slice(-4) : ''

  return (
    <Section
      id="assistant"
      title="AI assistant"
      icon={Bot}
      description="Plan your day, catch deadlines and review spending with Claude, using your own Anthropic API key."
    >
      <Toggle
        checked={cfg.enabled}
        onChange={(enabled) => updateAssistant({ enabled })}
        label="Enable assistant"
        description="Adds a chat under More → Assistant. Optional."
      />

      <Field
        label="Anthropic API key"
        htmlFor="assistant-key"
        error={looksWrong ? 'Anthropic keys usually start with sk-ant-' : undefined}
        hint={
          <>
            Get a key at{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-text underline underline-offset-2"
            >
              console.anthropic.com
            </a>
            . Stored only on this device{isEncrypted() ? ', encrypted with your passcode' : ''} and never included in backups.
          </>
        }
      >
        {cfg.apiKey && (
          <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <CheckCircle2 size={14} className="text-good" />
            Key saved, ending in <span className="tabular font-medium">…{last4}</span>
          </p>
        )}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              id="assistant-key"
              name="anthropic-api-key"
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
              placeholder={cfg.apiKey ? 'Paste a new key to replace it' : 'sk-ant-…'}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className="pr-11 font-mono"
            />
            <IconButton
              icon={showKey ? EyeOff : Eye}
              label={showKey ? 'Hide key' : 'Show key'}
              className="absolute right-0 top-0"
              onClick={() => setShowKey((v) => !v)}
            />
          </div>
          <Button variant="primary" onClick={saveKey} disabled={!typed}>
            Save
          </Button>
        </div>
      </Field>

      <Field label="Model" htmlFor="assistant-model" hint={known?.description ?? 'Custom model id.'}>
        <Select
          id="assistant-model"
          value={cfg.model || DEFAULT_MODEL}
          onChange={(e) => updateAssistant({ model: e.target.value })}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}{m.id === DEFAULT_MODEL ? ' (recommended)' : ''}
            </option>
          ))}
          {!known && cfg.model && <option value={cfg.model}>{cfg.model}</option>}
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            icon={test.state === 'testing' ? Loader2 : PlugZap}
            onClick={() => void runTest()}
            disabled={!(typed || cfg.apiKey) || test.state === 'testing'}
            className={test.state === 'testing' ? '[&>svg]:animate-spin' : undefined}
          >
            {test.state === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
          {cfg.apiKey && (
            <Button variant="ghost" icon={Trash2} className="text-bad hover:text-bad" onClick={() => void removeKey()}>
              Remove key
            </Button>
          )}
        </div>
        {test.state === 'ok' && (
          <p role="status" className="flex items-start gap-1.5 text-[13px] text-good">
            <CheckCircle2 size={15} className="mt-px shrink-0" /> {test.message}
          </p>
        )}
        {test.state === 'error' && (
          <p role="alert" className="flex items-start gap-1.5 text-[13px] text-bad">
            <XCircle size={15} className="mt-px shrink-0" /> {test.message}
          </p>
        )}
      </div>

      <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-[13px] leading-snug text-ink-2">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-muted" />
        <span>{PRIVACY_TEXT}</span>
      </p>
    </Section>
  )
}
