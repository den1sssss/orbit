// Chat engine: runs one assistant turn (streaming + tool-use loop) and persists the result.
//
// History design (keeps "preserved thinking" valid without storing thinking blocks):
// - Earlier turns are sent as plain text only (no thinking blocks are ever replayed across turns).
// - Within a turn, the system prompt, snapshot, tools and messages are frozen and the assistant's
//   blocks (thinking, text, tool_use) are replayed verbatim with the tool results appended.
// - add_task / add_event calls become proposal cards. The tool result is returned immediately
//   ("shown to the user, not saved"), so the model can write its explanation after the calls;
//   the record is only created when the user taps Apply. The decision is stored with the message
//   and summarized for the model on later turns.
import { create } from 'zustand'
import { uid, useStore } from '@/lib/store'
import type { AssistantMessage } from '@/lib/types'
import {
  AssistantApiError, describeError, streamMessage,
  type ApiErrorKind, type ContentParam, type MessageParam, type StreamBlock,
} from './api'
import { buildSystem } from './context'
import { DEFAULT_MODEL } from './models'
import {
  TOOLS, applyProposal, parseToolCall, proposalResult, proposalSummary, type Proposal, type ProposalStatus,
} from './tools'

const MAX_STORED = 60
/** Recent messages sent with each request. */
const MAX_SENT = 30
/** Model calls per user turn (tool round-trips). */
const MAX_ROUNDS = 3

// ───────────────────────── Stored message format ─────────────────────────

/** Separates the reply text from the proposals JSON inside AssistantMessage.content. */
const MARKER = '\n\n⁣orbit-actions:'

export interface ParsedMessage extends AssistantMessage {
  text: string
  proposals: Proposal[]
}

function isProposal(v: unknown): v is Proposal {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (p.kind === 'task' || p.kind === 'event') && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.date === 'string'
}

export function splitContent(content: string): { text: string; proposals: Proposal[] } {
  const at = content.lastIndexOf(MARKER)
  if (at === -1) return { text: content, proposals: [] }
  let proposals: Proposal[] = []
  try {
    const parsed: unknown = JSON.parse(content.slice(at + MARKER.length))
    if (Array.isArray(parsed)) proposals = parsed.filter(isProposal)
  } catch { /* corrupted: show text only */ }
  return { text: content.slice(0, at), proposals }
}

function joinContent(text: string, proposals: Proposal[]): string {
  const clean = text.split(MARKER).join('\n\n')
  return proposals.length ? `${clean}${MARKER}${JSON.stringify(proposals)}` : clean
}

export function parseMessage(m: AssistantMessage): ParsedMessage {
  return { ...m, ...(m.role === 'assistant' ? splitContent(m.content) : { text: m.content, proposals: [] }) }
}

/** What the model sees for a stored message on later turns. */
function historyText(m: AssistantMessage): string {
  if (m.role === 'user') return m.content
  const { text, proposals } = splitContent(m.content)
  if (!proposals.length) return text
  return `${text}\n\n[Suggestion cards shown in the app: ${proposals.map(proposalSummary).join('; ')}]`.trim()
}

function toApiMessages(chat: AssistantMessage[]): MessageParam[] {
  const out: MessageParam[] = []
  for (const m of chat.slice(-MAX_SENT)) {
    const content = historyText(m).trim()
    if (!content) continue
    if (!out.length && m.role !== 'user') continue // must start with a user turn
    const prev = out[out.length - 1]
    if (prev && prev.role === m.role && typeof prev.content === 'string') prev.content += `\n\n${content}`
    else out.push({ role: m.role, content })
  }
  return out
}

// ───────────────────────── Stream block helpers ─────────────────────────

/** Visible text of a response. A fallback boundary continues the partial text without a gap. */
function textOf(blocks: StreamBlock[]): string {
  let out = ''
  let afterFallback = false
  for (const b of blocks) {
    if (!b) continue
    if (b.type === 'fallback') afterFallback = true
    else if (b.type === 'text' && b.text) {
      out += out && !afterFallback ? `\n\n${b.text}` : b.text
      afterFallback = false
    }
  }
  return out.trim()
}

function parseInput(json: string | undefined): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * The assistant turn echoed back verbatim for the tool-use continuation. After a mid-output
 * refusal fallback, only text survives from before the last `fallback` block; the marker itself
 * and unknown block types are dropped.
 */
function replayContent(blocks: StreamBlock[]): ContentParam[] {
  const list = blocks.filter(Boolean)
  let boundary = -1
  list.forEach((b, i) => { if (b.type === 'fallback') boundary = i })
  const out: ContentParam[] = []
  list.forEach((b, i) => {
    if (i < boundary && b.type !== 'text') return
    switch (b.type) {
      case 'text':
        if (b.text) out.push({ type: 'text', text: b.text })
        break
      case 'thinking':
        out.push({ type: 'thinking', thinking: b.thinking ?? '', signature: b.signature ?? '' })
        break
      case 'redacted_thinking':
        if (b.data) out.push({ type: 'redacted_thinking', data: b.data })
        break
      case 'tool_use':
        if (b.id && b.name) out.push({ type: 'tool_use', id: b.id, name: b.name, input: parseInput(b.json) })
        break
    }
  })
  return out
}

// ───────────────────────── Session state (not persisted) ─────────────────────────

export interface ChatError {
  kind: ApiErrorKind | 'refusal' | 'setup'
  message: string
  /** Offer a Retry button (nothing from the failed turn was saved). */
  retry: boolean
}

interface SessionState {
  busy: boolean
  /** 'waiting' = request sent / thinking, 'writing' = text streaming in. */
  phase: 'idle' | 'waiting' | 'writing'
  draft: string
  draftProposals: Proposal[]
  error: ChatError | null
  notice: string | null
}

const IDLE: SessionState = { busy: false, phase: 'idle', draft: '', draftProposals: [], error: null, notice: null }

export const useChatSession = create<SessionState>()(() => ({ ...IDLE }))

let controller: AbortController | null = null
/** Bumped by clearChat so a turn that is still finishing doesn't write into the cleared chat. */
let generation = 0

function saveMessages(list: AssistantMessage[]) {
  useStore.setState({ assistantChat: list.slice(-MAX_STORED) })
}

function appendMessage(role: AssistantMessage['role'], content: string) {
  saveMessages([...useStore.getState().assistantChat, { id: uid(), role, content, at: Date.now() }])
}

// ───────────────────────── Public actions ─────────────────────────

export function sendMessage(input: string) {
  const text = input.trim()
  if (!text || useChatSession.getState().busy) return
  appendMessage('user', text)
  void runTurn()
}

/** Re-run the last turn (only when the last stored message is the user's). */
export function retryLast() {
  const chat = useStore.getState().assistantChat
  if (useChatSession.getState().busy || chat[chat.length - 1]?.role !== 'user') return
  void runTurn()
}

export function stopStreaming() {
  controller?.abort()
}

export function clearChat() {
  generation++
  controller?.abort()
  useStore.setState({ assistantChat: [] })
  useChatSession.setState({ ...IDLE })
}

export function dismissError() {
  useChatSession.setState({ error: null, notice: null })
}

/**
 * Apply or dismiss a proposal on a stored message. Apply (a user tap) is the only path that
 * creates records. Returns the created record's toast text and route when applied.
 */
export function decideProposal(
  messageId: string, proposalId: string, decision: Exclude<ProposalStatus, 'pending'>,
): { message: string; route: string } | undefined {
  const msg = useStore.getState().assistantChat.find((m) => m.id === messageId)
  if (!msg) return
  const { text, proposals } = splitContent(msg.content)
  const p = proposals.find((x) => x.id === proposalId)
  if (!p || p.status !== 'pending') return
  const created = decision === 'applied' ? applyProposal(p) : undefined
  const next = proposals.map((x) => (x.id === proposalId ? { ...x, status: decision } : x))
  useStore.getState().patch('assistantChat', messageId, { content: joinContent(text, next) })
  return created
}

// ───────────────────────── The turn ─────────────────────────

async function runTurn() {
  const gen = generation
  const state = useStore.getState()
  const cfg = state.settings.assistant
  const set = useChatSession.setState
  if (!cfg.enabled || !cfg.apiKey) {
    set({ ...IDLE, error: { kind: 'setup', message: 'Add your API key in Settings to use the assistant.', retry: false } })
    return
  }
  let messages = toApiMessages(state.assistantChat)
  if (messages[messages.length - 1]?.role !== 'user') return

  // Frozen for the whole turn so replayed thinking blocks keep an identical prefix.
  const system = buildSystem(state)
  const model = cfg.model || DEFAULT_MODEL
  const apiKey = cfg.apiKey
  const ctrl = new AbortController()
  controller = ctrl
  set({ ...IDLE, busy: true, phase: 'waiting' })

  const texts: string[] = []
  const proposals: Proposal[] = []
  let failure: AssistantApiError | null = null
  let refused = false
  let stopped = false
  let notice: string | null = null

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await streamMessage({ apiKey, model, system, tools: TOOLS, messages, signal: ctrl.signal }, (blocks) => {
        if (gen !== generation) return
        set({ phase: 'writing', draft: [...texts, textOf(blocks)].filter(Boolean).join('\n\n') })
      })
      if (gen !== generation) return

      if (res.stopReason === 'refusal') {
        // A decline (after any fallback) — discard this response's partial output.
        refused = true
        break
      }
      const text = textOf(res.blocks)
      if (text) texts.push(text)
      set({ draft: texts.join('\n\n') })

      const calls = res.blocks.filter((b) => b?.type === 'tool_use' && b.id && b.name)
      if (res.stopReason === 'tool_use' && calls.length) {
        const results: ContentParam[] = calls.map((b) => {
          const parsed = parseToolCall(b.id!, b.name!, b.json ?? '')
          if ('error' in parsed) return { type: 'tool_result', tool_use_id: b.id!, content: parsed.error, is_error: true }
          proposals.push(parsed)
          return { type: 'tool_result', tool_use_id: b.id!, content: proposalResult(parsed) }
        })
        set({ draftProposals: [...proposals], phase: 'waiting' })
        if (round === MAX_ROUNDS - 1) break
        // All results go back in one user message, after the verbatim assistant turn.
        messages = [...messages, { role: 'assistant', content: replayContent(res.blocks) }, { role: 'user', content: results }]
        continue
      }
      if (res.stopReason === 'max_tokens') notice = 'The answer was cut off because it got too long.'
      break
    }
  } catch (e) {
    const err = e instanceof AssistantApiError ? e : new AssistantApiError('other', e instanceof Error ? e.message : 'Unexpected error')
    if (err.kind === 'aborted') stopped = true
    else failure = err
  } finally {
    if (controller === ctrl) controller = null
  }
  if (gen !== generation) return

  let text = texts.join('\n\n')
  const saved = !!(text || proposals.length)
  if (saved) {
    if (stopped) text = `${text}\n\n*(stopped)*`.trim()
    appendMessage('assistant', joinContent(text, proposals))
  }

  let error: ChatError | null = null
  if (refused) {
    error = { kind: 'refusal', message: 'Claude declined to answer this request. Try rephrasing it.', retry: false }
  } else if (failure) {
    error = { kind: failure.kind, message: describeError(failure), retry: !saved && failure.retryable }
  }
  set({ ...IDLE, error, notice })
}
