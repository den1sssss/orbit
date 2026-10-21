import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowUp, Bot, CalendarPlus, Check, KeyRound, ListPlus, Loader2, RotateCcw, Settings, ShieldCheck, Square,
  Trash2, WifiOff, X,
} from 'lucide-react'
import { Badge, Button, Card, IconButton, Menu, PageHeader, cn } from '@/components/ui'
import { PRIORITY_LABELS } from '@/lib/defaults'
import { relativeDay } from '@/lib/dates'
import { useStore } from '@/lib/store'
import { confirm, toast } from '@/lib/ui'
import type { CalendarEvent } from '@/lib/types'
import {
  clearChat, decideProposal, dismissError, parseMessage, retryLast, sendMessage, stopStreaming, useChatSession,
  type ChatError,
} from './chat'
import { Markdown } from './Markdown'
import { DEFAULT_MODEL, modelLabel } from './models'
import { eventConflicts, proposalQuestion, type Proposal } from './tools'

const QUICK_ACTIONS = [
  'Plan my day',
  'What\'s urgent this week?',
  'Review my spending',
  'How are my habits & goals?',
  'Suggest budget improvements',
  'Summarize my week',
]

const SETTINGS_TARGET = { pathname: '/settings', hash: '#assistant' }

export function AssistantPage() {
  const cfg = useStore((s) => s.settings.assistant)
  return cfg.enabled && cfg.apiKey ? <ChatView /> : <SetupView hasKey={!!cfg.apiKey} />
}

// ───────────────────────── Not configured ─────────────────────────

function SetupView({ hasKey }: { hasKey: boolean }) {
  const navigate = useNavigate()
  const enable = () => {
    const current = useStore.getState().settings.assistant
    useStore.getState().updateSettings({ assistant: { ...current, enabled: true } })
  }
  return (
    <>
      <PageHeader title="Assistant" subtitle="Your AI helper for plans, deadlines and money" />
      <div className="mx-auto max-w-xl">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
              <Bot size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold tracking-tight text-ink">
                {hasKey ? 'The assistant is turned off' : 'Set up your assistant'}
              </h2>
              <p className="text-[13px] text-muted">Optional · powered by Claude with your own Anthropic API key</p>
            </div>
          </div>
          <ul className="flex flex-col gap-2 text-sm text-ink-2">
            {[
              'Plan your day in exact time blocks around your events',
              'Summarize tasks and flag what’s urgent or overdue',
              'Spot upcoming deadlines, bills and important dates',
              'Review spending against your budgets and suggest fixes',
              'Add the tasks and events it suggests, after you tap Apply',
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Check size={16} className="mt-0.5 shrink-0 text-accent-text" />
                {t}
              </li>
            ))}
          </ul>
          <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-[13px] leading-snug text-ink-2">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-muted" />
            Nothing is sent unless you ask. Vault documents and journal text are never sent.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {hasKey && (
              <Button variant="primary" size="lg" icon={Bot} onClick={enable} block>
                Turn on assistant
              </Button>
            )}
            <Button
              variant={hasKey ? 'secondary' : 'primary'}
              size="lg"
              icon={hasKey ? Settings : KeyRound}
              onClick={() => navigate(SETTINGS_TARGET)}
              block
            >
              {hasKey ? 'Assistant settings' : 'Add API key in Settings'}
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}

// ───────────────────────── Chat ─────────────────────────

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function nearBottom() {
  const el = document.documentElement
  return window.innerHeight + window.scrollY >= el.scrollHeight - 160
}

function scrollToEnd(smooth = false) {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

function ChatView() {
  const navigate = useNavigate()
  const chat = useStore((s) => s.assistantChat)
  const events = useStore((s) => s.events)
  const userName = useStore((s) => s.settings.userName)
  const model = useStore((s) => s.settings.assistant.model)
  const session = useChatSession()
  const online = useOnline()
  const messages = useMemo(() => chat.map(parseMessage), [chat])
  const [composerHeight, setComposerHeight] = useState(140)
  const stick = useRef(true)

  // Follow the conversation while the user is at the bottom.
  useEffect(() => {
    const onScroll = () => { stick.current = nearBottom() }
    window.addEventListener('scroll', onScroll, { passive: true })
    // AppShell scrolls to the top on navigation; land on the latest message after that.
    const t = window.setTimeout(() => scrollToEnd(), 60)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(t)
    }
  }, [])
  useLayoutEffect(() => {
    if (stick.current) scrollToEnd()
  }, [messages.length, session.draft, session.phase, session.error, composerHeight])

  const send = (text: string) => {
    if (!online || session.busy) return
    stick.current = true
    sendMessage(text)
  }

  const onClear = async () => {
    const ok = await confirm({
      title: 'Clear chat?',
      message: 'This deletes the conversation from this device. Tasks and events you added stay.',
      confirmLabel: 'Clear',
      danger: true,
    })
    if (ok) clearChat()
  }

  const empty = messages.length === 0 && !session.busy

  return (
    <>
      <PageHeader
        title="Assistant"
        subtitle={modelLabel(model || DEFAULT_MODEL)}
        actions={
          <Menu
            label="Assistant menu"
            items={[
              { label: 'Assistant settings', icon: Settings, onClick: () => navigate(SETTINGS_TARGET) },
              ...(messages.length ? [{ label: 'Clear chat', icon: Trash2, danger: true, onClick: () => void onClear() }] : []),
            ]}
          />
        }
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {empty && <Welcome name={userName} />}
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} text={m.text} />
          ) : (
            <AssistantRow key={m.id}>
              {m.text && <Markdown text={m.text} />}
              {m.proposals.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  events={events}
                  onApply={() => {
                    const done = decideProposal(m.id, p.id, 'applied')
                    if (done) toast(done.message, { action: { label: 'View', onClick: () => navigate(done.route) } })
                  }}
                  onDismiss={() => decideProposal(m.id, p.id, 'dismissed')}
                />
              ))}
            </AssistantRow>
          ),
        )}
        {session.busy && (
          <AssistantRow>
            {session.draft ? (
              <Markdown text={session.draft} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted" role="status">
                <Loader2 size={15} className="animate-spin" />
                {session.draftProposals.length ? 'Writing…' : 'Thinking…'}
              </p>
            )}
            {session.draftProposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} events={events} pendingSave />
            ))}
          </AssistantRow>
        )}
        {session.notice && <p className="text-center text-[13px] text-muted">{session.notice}</p>}
        {session.error && <ErrorCard error={session.error} onSettings={() => navigate(SETTINGS_TARGET)} />}
        {!online && (
          <p className="flex items-center justify-center gap-2 text-[13px] text-muted">
            <WifiOff size={14} /> You’re offline. The assistant needs an internet connection.
          </p>
        )}
        {/* Room for the fixed composer. */}
        <div aria-hidden style={{ height: composerHeight }} />
      </div>
      <Composer
        busy={session.busy}
        online={online}
        onSend={send}
        onStop={stopStreaming}
        onHeight={setComposerHeight}
      />
    </>
  )
}

function Welcome({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center px-2 pt-4 text-center sm:pt-10">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
        <Bot size={24} />
      </span>
      <h2 className="text-lg font-semibold tracking-tight text-ink">{name ? `Hi ${name}, how can I help?` : 'How can I help?'}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Ask me to plan your day, find what’s urgent, or review your spending. I use what’s in Orbit and can add tasks and events after you approve them.
      </p>
      <p className="mt-3 flex max-w-sm items-start gap-1.5 text-left text-xs text-muted">
        <ShieldCheck size={14} className="mt-px shrink-0" />
        A compact summary of your data is sent to Anthropic only when you ask. Vault documents and journal text never are.
      </p>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[15px] leading-relaxed text-accent-ink sm:text-sm">
        {text}
      </p>
    </div>
  )
}

function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text" aria-hidden>
        <Bot size={15} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">{children}</div>
    </div>
  )
}

function proposalDetail(p: Proposal): string {
  if (p.kind === 'event') return `Calendar · ${relativeDay(p.date)} · ${p.start}–${p.end}`
  return ['Task', `due ${relativeDay(p.date)}${p.time ? ` ${p.time}` : ''}`, PRIORITY_LABELS[p.priority ?? 'medium'] + ' priority'].join(' · ')
}

function ProposalCard({
  proposal: p, events, onApply, onDismiss, pendingSave,
}: {
  proposal: Proposal
  events: CalendarEvent[]
  onApply?: () => void
  onDismiss?: () => void
  /** Shown while the answer is still streaming: buttons wait until it's saved. */
  pendingSave?: boolean
}) {
  const conflicts = useMemo(() => (p.status === 'pending' ? eventConflicts(p, events) : []), [p, events])
  const Icon = p.kind === 'event' ? CalendarPlus : ListPlus
  return (
    <div className={cn('rounded-2xl border border-line bg-surface p-3 shadow-card', p.status !== 'pending' && 'opacity-80')}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-ink">{proposalQuestion(p)}</p>
          <p className="mt-0.5 text-[13px] text-muted">{proposalDetail(p)}</p>
          {conflicts.length > 0 && (
            <p className="mt-1 text-[13px] text-warn">Overlaps {conflicts.join(', ')}</p>
          )}
        </div>
        {p.status === 'applied' && <Badge tone="good" icon={Check}>Added</Badge>}
        {p.status === 'dismissed' && <Badge icon={X}>Dismissed</Badge>}
      </div>
      {p.status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <Button variant="primary" icon={Check} className="flex-1" disabled={pendingSave} onClick={onApply}>
            Apply
          </Button>
          <Button variant="secondary" className="flex-1" disabled={pendingSave} onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}

function ErrorCard({ error, onSettings }: { error: ChatError; onSettings: () => void }) {
  const toSettings = ['auth', 'permission', 'billing', 'model', 'setup'].includes(error.kind)
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-line bg-bad-soft p-3.5">
      <p className="flex items-start gap-2 text-sm text-bad">
        <AlertCircle size={17} className="mt-px shrink-0" />
        <span className="min-w-0 break-words">{error.message}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {toSettings && (
          <Button size="md" icon={KeyRound} onClick={onSettings}>
            Open assistant settings
          </Button>
        )}
        {error.retry && (
          <Button size="md" icon={RotateCcw} onClick={retryLast}>
            Retry
          </Button>
        )}
        <Button size="md" variant="ghost" onClick={dismissError}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

// ───────────────────────── Composer ─────────────────────────

function Composer({
  busy, online, onSend, onStop, onHeight,
}: {
  busy: boolean
  online: boolean
  onSend: (text: string) => void
  onStop: () => void
  onHeight: (h: number) => void
}) {
  const [text, setText] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeight])

  // Auto-grow up to ~6 lines.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [text])

  const canSend = online && !busy && text.trim().length > 0

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    onSend(text)
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on devices with a keyboard; on phones Enter inserts a newline.
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    if (window.matchMedia('(pointer: coarse)').matches) return
    e.preventDefault()
    submit()
  }

  return (
    <div
      ref={wrap}
      className={cn(
        'fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-40 border-t border-line bg-bg/95 backdrop-blur-lg',
        'lg:bottom-0 lg:left-64 lg:border-t-0 lg:bg-transparent lg:backdrop-blur-none',
      )}
    >
      <div className="px-4 pt-2 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-3xl pb-2 lg:rounded-t-2xl lg:bg-bg/95 lg:pb-5 lg:backdrop-blur-lg">
          <div className="scrollbar-none -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={!online || busy}
                onClick={() => onSend(q)}
                className="inline-flex h-10 shrink-0 items-center rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50 sm:h-9"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={submit}
            className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-1.5 shadow-card transition focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15"
          >
            <label htmlFor="assistant-input" className="sr-only">Message the assistant</label>
            <textarea
              id="assistant-input"
              ref={area}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={online ? 'Ask about your day, tasks or money…' : 'Offline'}
              className="max-h-[168px] min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-base leading-6 text-ink outline-none placeholder:text-muted sm:text-sm"
            />
            {busy ? (
              <IconButton icon={Square} label="Stop" variant="secondary" onClick={onStop} />
            ) : (
              <IconButton icon={ArrowUp} label="Send" variant="primary" type="submit" disabled={!canSend} />
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
