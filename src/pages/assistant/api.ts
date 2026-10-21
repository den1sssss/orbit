// Minimal Claude Messages API client for the browser (fetch + SSE), using the user's own key.
// The key only ever travels in the `x-api-key` header to api.anthropic.com. Never log it.
import { modelOption } from './models'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
/** Beta header for the `fallbacks: "default"` scalar form (server-side refusal fallback). */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const MAX_TOKENS = 16000

// ───────────────────────── Request types (subset of the Messages API) ─────────────────────────

export type ContentParam =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface MessageParam {
  role: 'user' | 'assistant'
  content: string | ContentParam[]
}

export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

export interface ToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
  eager_input_streaming?: boolean
}

// ───────────────────────── Response (accumulated from the stream) ─────────────────────────

/** One content block as accumulated from SSE events. `json` holds raw tool input fragments. */
export interface StreamBlock {
  type: string
  text?: string
  thinking?: string
  signature?: string
  data?: string
  id?: string
  name?: string
  json?: string
}

export type StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal' | string

export interface StreamResult {
  blocks: StreamBlock[]
  stopReason: StopReason | null
  model?: string
}

// ───────────────────────── Errors ─────────────────────────

export type ApiErrorKind =
  | 'auth' | 'permission' | 'billing' | 'model' | 'rate' | 'overloaded' | 'server'
  | 'bad_request' | 'too_large' | 'offline' | 'network' | 'aborted' | 'other'

export class AssistantApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    /** Seconds, from the retry-after header when the browser can read it. */
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'AssistantApiError'
  }

  get retryable(): boolean {
    return ['rate', 'overloaded', 'server', 'offline', 'network'].includes(this.kind)
  }
}

function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400: return 'bad_request'
    case 401: return 'auth'
    case 402: return 'billing'
    case 403: return 'permission'
    case 404: return 'model'
    case 413: return 'too_large'
    case 429: return 'rate'
    case 529: return 'overloaded'
    default: return status >= 500 ? 'server' : 'other'
  }
}

function kindForErrorType(type: string | undefined, status = 0): ApiErrorKind {
  switch (type) {
    case 'authentication_error': return 'auth'
    case 'permission_error': return 'permission'
    case 'billing_error': return 'billing'
    case 'not_found_error': return 'model'
    case 'rate_limit_error': return 'rate'
    case 'overloaded_error': return 'overloaded'
    case 'api_error': return 'server'
    case 'request_too_large': return 'too_large'
    case 'invalid_request_error': return 'bad_request'
    default: return kindForStatus(status)
  }
}

async function errorFromResponse(res: Response): Promise<AssistantApiError> {
  let type: string | undefined
  let message = `HTTP ${res.status}`
  try {
    const body = (await res.json()) as { error?: { type?: string; message?: string } }
    type = body.error?.type
    if (body.error?.message) message = body.error.message
  } catch { /* non-JSON body */ }
  const ra = Number(res.headers.get('retry-after'))
  return new AssistantApiError(kindForErrorType(type, res.status), message, res.status, Number.isFinite(ra) && ra > 0 ? ra : undefined)
}

function networkError(e: unknown): AssistantApiError {
  if (e instanceof AssistantApiError) return e
  if (e instanceof DOMException && e.name === 'AbortError') return new AssistantApiError('aborted', 'Stopped')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new AssistantApiError('offline', 'You are offline')
  }
  return new AssistantApiError('network', 'Could not reach api.anthropic.com')
}

/** A 400 caused by the optional fallback beta (header not enabled for this org, or param rejected). */
function isFallbackRejection(e: AssistantApiError) {
  return e.kind === 'bad_request' && /anthropic-beta|fallback/i.test(e.message)
}

// ───────────────────────── Requests ─────────────────────────

function headers(apiKey: string, beta?: string): HeadersInit {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    // Required for CORS: the user's own key is called directly from their own device.
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  if (beta) h['anthropic-beta'] = beta
  return h
}

export interface ChatRequest {
  apiKey: string
  model: string
  system: SystemBlock[]
  tools: ToolDef[]
  messages: MessageParam[]
  signal?: AbortSignal
}

/** Set once a fallback-beta 400 was seen, so later requests skip it. */
let fallbackUnsupported = false

function buildBody(req: ChatRequest, withFallback: boolean) {
  const opt = modelOption(req.model)
  return {
    model: req.model,
    max_tokens: MAX_TOKENS,
    stream: true,
    // Thinking is adaptive by default on current models; effort is the depth/cost control.
    ...(opt ? { output_config: { effort: opt.effort } } : {}),
    // Retry a safety-classifier decline on Anthropic's recommended model instead of failing.
    ...(withFallback ? { fallbacks: 'default' } : {}),
    system: req.system,
    tools: req.tools,
    messages: req.messages,
  }
}

/**
 * Stream one Messages API response. `onUpdate` fires with the accumulated blocks as text arrives.
 * Throws AssistantApiError (kind 'aborted' when the signal fires).
 */
export async function streamMessage(
  req: ChatRequest,
  onUpdate: (blocks: StreamBlock[]) => void,
): Promise<StreamResult> {
  const withFallback = !fallbackUnsupported && !!modelOption(req.model)?.fallbacks
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: headers(req.apiKey, withFallback ? FALLBACK_BETA : undefined),
      body: JSON.stringify(buildBody(req, withFallback)),
      signal: req.signal,
    })
  } catch (e) {
    throw networkError(e)
  }
  if (!res.ok) {
    const err = await errorFromResponse(res)
    if (withFallback && isFallbackRejection(err)) {
      fallbackUnsupported = true
      return streamMessage(req, onUpdate)
    }
    throw err
  }
  if (!res.body) throw new AssistantApiError('network', 'Empty response from the API')
  return readStream(res.body, onUpdate)
}

interface SseData {
  type?: string
  index?: number
  message?: { model?: string }
  content_block?: Record<string, unknown> & { type?: string }
  delta?: {
    type?: string
    text?: string
    thinking?: string
    signature?: string
    partial_json?: string
    stop_reason?: string | null
  }
  error?: { type?: string; message?: string }
}

async function readStream(body: ReadableStream<Uint8Array>, onUpdate: (blocks: StreamBlock[]) => void): Promise<StreamResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const blocks: StreamBlock[] = []
  const result: StreamResult = { blocks, stopReason: null }
  let buffer = ''
  let done = false

  const handle = (data: SseData) => {
    switch (data.type) {
      case 'message_start':
        result.model = data.message?.model
        break
      case 'content_block_start': {
        const cb = data.content_block ?? {}
        const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
        blocks[data.index ?? blocks.length] = {
          type: str(cb.type) ?? 'unknown',
          text: str(cb.text),
          thinking: str(cb.thinking),
          signature: str(cb.signature),
          data: str(cb.data),
          id: str(cb.id),
          name: str(cb.name),
          json: cb.type === 'tool_use' ? '' : undefined,
        }
        break
      }
      case 'content_block_delta': {
        const b = blocks[data.index ?? -1]
        const d = data.delta
        if (!b || !d) break
        if (d.type === 'text_delta') b.text = (b.text ?? '') + (d.text ?? '')
        else if (d.type === 'thinking_delta') b.thinking = (b.thinking ?? '') + (d.thinking ?? '')
        else if (d.type === 'signature_delta') b.signature = (b.signature ?? '') + (d.signature ?? '')
        else if (d.type === 'input_json_delta') b.json = (b.json ?? '') + (d.partial_json ?? '')
        if (d.type === 'text_delta') onUpdate(blocks)
        break
      }
      case 'message_delta':
        if (data.delta?.stop_reason) result.stopReason = data.delta.stop_reason
        break
      case 'message_stop':
        done = true
        break
      case 'error':
        throw new AssistantApiError(kindForErrorType(data.error?.type), data.error?.message ?? 'Stream error')
    }
  }

  try {
    while (!done) {
      const { value, done: eof } = await reader.read()
      if (eof) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line.
      let sep: number
      while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '')
        const dataLines = raw.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart())
        if (!dataLines.length) continue
        let parsed: SseData
        try {
          parsed = JSON.parse(dataLines.join('\n')) as SseData
        } catch {
          continue
        }
        handle(parsed)
      }
    }
  } catch (e) {
    throw networkError(e)
  } finally {
    reader.cancel().catch(() => { /* already closed */ })
  }
  if (!done && result.stopReason === null) {
    throw new AssistantApiError('network', 'The connection dropped before the answer finished')
  }
  return result
}

/** Tiny non-streaming request to check the key and model. */
export async function testConnection(apiKey: string, model: string): Promise<{ model: string }> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 64,
        ...(modelOption(model) ? { output_config: { effort: 'low' } } : {}),
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
      }),
    })
  } catch (e) {
    throw networkError(e)
  }
  if (!res.ok) throw await errorFromResponse(res)
  const body = (await res.json().catch(() => ({}))) as { model?: string }
  return { model: body.model ?? model }
}

/** Short user-facing explanation for an error. */
export function describeError(e: AssistantApiError): string {
  switch (e.kind) {
    case 'auth': return 'Your API key was rejected. Check it in Settings.'
    case 'permission': return `This key isn't allowed to do that: ${e.message}`
    case 'billing': return 'Anthropic reported a billing problem with your account. Check console.anthropic.com.'
    case 'model': return 'This model isn\'t available for your key. Pick another model in Settings.'
    case 'rate': return e.retryAfter
      ? `Rate limit reached. Try again in ${Math.ceil(e.retryAfter)} s.`
      : 'Rate limit reached. Wait a moment and try again.'
    case 'overloaded': return 'Claude is busy right now. Try again in a moment.'
    case 'server': return 'Anthropic had a temporary problem. Try again.'
    case 'too_large': return 'The request was too large. Clear the chat and try again.'
    case 'offline': return 'You\'re offline. Connect to the internet to use the assistant.'
    case 'network': return 'Couldn\'t reach Anthropic. Check your connection and try again.'
    case 'aborted': return 'Stopped.'
    case 'bad_request': return `The request was rejected: ${e.message}`
    default: return e.message || 'Something went wrong.'
  }
}
