// Tiny, safe markdown renderer for assistant replies: builds React elements only
// (no dangerouslySetInnerHTML). Supports paragraphs, bullet/numbered lists, headings
// (rendered as bold lines), blockquotes, rules, fenced code, **bold**, *italic*, `code`, https links.
import { Fragment, type ReactNode } from 'react'

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: { text: string; depth: number }[] }
  | { kind: 'ol'; items: { text: string; depth: number; n: number }[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'hr' }

const BULLET = /^(\s*)[-*•]\s+(.*)$/
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const FENCE = /^\s{0,3}```/

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = []
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  const last = () => blocks[blocks.length - 1]
  while (i < lines.length) {
    const line = lines[i]
    if (FENCE.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++])
      i++ // closing fence (or end)
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }
    if (!line.trim()) {
      blocks.push({ kind: 'p', lines: [] }) // paragraph break marker
      i++
      continue
    }
    let m: RegExpMatchArray | null
    if (RULE.test(line)) blocks.push({ kind: 'hr' })
    else if ((m = line.match(HEADING))) blocks.push({ kind: 'h', text: m[1] })
    else if ((m = line.match(BULLET))) {
      const item = { text: m[2], depth: m[1].length >= 2 ? 1 : 0 }
      const b = last()
      if (b?.kind === 'ul') b.items.push(item)
      else blocks.push({ kind: 'ul', items: [item] })
    } else if ((m = line.match(ORDERED))) {
      const item = { text: m[3], depth: m[1].length >= 2 ? 1 : 0, n: Number(m[2]) }
      const b = last()
      if (b?.kind === 'ol') b.items.push(item)
      else blocks.push({ kind: 'ol', items: [item] })
    } else if ((m = line.match(QUOTE))) {
      const b = last()
      if (b?.kind === 'quote') b.lines.push(m[1])
      else blocks.push({ kind: 'quote', lines: [m[1]] })
    } else {
      const b = last()
      // A plain line right after a list item continues that item.
      if (b?.kind === 'ul' || b?.kind === 'ol') {
        if (/^\s+/.test(line)) {
          b.items[b.items.length - 1].text += ` ${line.trim()}`
          i++
          continue
        }
      }
      if (b?.kind === 'p' && b.lines.length) b.lines.push(line)
      else blocks.push({ kind: 'p', lines: [line] })
    }
    i++
  }
  return blocks.filter((b) => b.kind !== 'p' || b.lines.length)
}

// No lookbehind (older iOS Safari can't parse it); `_italic_` is skipped to protect snake_case words.
const INLINE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*[^*\s][^*\n]*?\*)/g

function renderInline(text: string, keyPrefix = ''): ReactNode[] {
  const out: ReactNode[] = []
  let lastIndex = 0
  let k = 0
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0]
    const start = m.index ?? 0
    if (start > lastIndex) out.push(text.slice(lastIndex, start))
    const key = `${keyPrefix}${k++}`
    if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push(<strong key={key} className="font-semibold text-ink">{renderInline(tok.slice(2, -2), `${key}.`)}</strong>)
    } else if (tok.startsWith('`')) {
      out.push(<code key={key} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>)
    } else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(tok)
      if (mm) {
        out.push(
          <a key={key} href={mm[2]} target="_blank" rel="noopener noreferrer" className="text-accent-text underline underline-offset-2">
            {mm[1]}
          </a>,
        )
      } else out.push(tok)
    } else {
      out.push(<em key={key}>{renderInline(tok.slice(1, -1), `${key}.`)}</em>)
    }
    lastIndex = start + tok.length
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex))
  return out
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className={className ?? 'flex flex-col gap-2 text-[15px] leading-relaxed text-ink sm:text-sm'}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h':
            return <p key={i} className="mt-1 font-semibold text-ink">{renderInline(b.text)}</p>
          case 'p':
            return (
              <p key={i} className="break-words">
                {b.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {renderInline(l)}
                  </Fragment>
                ))}
              </p>
            )
          case 'ul':
            return (
              <ul key={i} className="flex flex-col gap-1">
                {b.items.map((it, j) => (
                  <li key={j} className={it.depth ? 'flex gap-2 pl-5' : 'flex gap-2'}>
                    <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                    <span className="min-w-0 break-words">{renderInline(it.text)}</span>
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} className="flex flex-col gap-1">
                {b.items.map((it, j) => (
                  <li key={j} className={it.depth ? 'flex gap-2 pl-5' : 'flex gap-2'}>
                    <span className="tabular min-w-[1.25rem] shrink-0 text-right font-medium text-muted">{it.n}.</span>
                    <span className="min-w-0 break-words">{renderInline(it.text)}</span>
                  </li>
                ))}
              </ol>
            )
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-line-strong pl-3 text-ink-2">
                {b.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {renderInline(l)}
                  </Fragment>
                ))}
              </blockquote>
            )
          case 'code':
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[13px] leading-snug">
                {b.text}
              </pre>
            )
          case 'hr':
            return <hr key={i} className="border-line" />
        }
      })}
    </div>
  )
}
