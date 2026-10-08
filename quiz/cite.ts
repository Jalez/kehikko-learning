/**
 * Sources: which exact words of which file a question rests on, written down
 * and found again.
 *
 * COPIED from `kehikko-slides` (`deck/format.ts` and `deck/cite.ts`), so that a
 * question cites a passage in exactly the syntax and by exactly the rules a
 * slide does. It belongs in `kehikot-module-protocol`; until it is there, keep
 * the two copies the same and change neither alone. (One difference: Slides'
 * `markersIn` skips Markdown code spans, which a question has no use for.)
 *
 * A source is one line: `[^1]: <project-relative path> | "<exact words>"`, and
 * a `[^1]` in the text is the place that rests on it. By the words, not by byte
 * offsets: words survive edits above them, and when they do not, the source
 * can SAY it is adrift rather than quietly point at whatever moved into its
 * bytes.
 *
 * A run of whitespace in the quote matches any run of whitespace in the file,
 * and that is the only latitude. The four answers:
 *
 * - `holds`: the words are in the file exactly once. The range is where.
 * - `ambiguous`: they are in it more than once. The range is the first.
 * - `adrift`: they are not in it. The paper changed under the question.
 * - `unreadable`: the file is not there, or not inside the project.
 *
 * Plain functions over strings: no I/O, so every rule is a unit test.
 */

export interface Source {
  /** What the text's `[^label]` names. */
  label: string
  /** Relative to the project root. */
  path: string
  /** The passage's words as they are in the file; whitespace is not significant. */
  quote: string
}

export type CiteStatus = 'holds' | 'ambiguous' | 'adrift' | 'unreadable'

/** Where a quote was found: UTF-8 byte offsets (what a passage carries) and 1-based lines. */
export interface Found {
  from: number
  to: number
  line: number
  endLine: number
}

export interface Resolved extends Source {
  status: CiteStatus
  /** Null unless the words were found. */
  at: Found | null
  /** How many times the words occur in the file. */
  count: number
}

const SOURCE_LINE = /^\[\^([A-Za-z0-9_-]{1,20})\]:[ \t]*([^|]+?)[ \t]*\|[ \t]*"(.*)"[ \t]*$/
/** A marker in the text. Not followed by `:`, which would be a source line. */
export const MARKER = /\[\^([A-Za-z0-9_-]{1,20})\](?!:)/g

/** One `[^label]: path | "quote"` line, or null when it is not one. */
export function parseSource(line: string): Source | null {
  const match = SOURCE_LINE.exec(line)
  if (!match) return null
  const quote = (match[3] ?? '').trim()
  return quote ? { label: match[1]!, path: match[2]!.trim(), quote } : null
}

export function serialiseSource(source: Source): string {
  return `[^${source.label}]: ${source.path} | "${source.quote}"`
}

/**
 * Why a source cannot be written as a source line, or null when it can. The
 * path must be inside the project and hold no `|`; the quote is one line.
 */
export function uncitable(source: Pick<Source, 'path' | 'quote'>): string | null {
  if (!source.path || /[|\n]/.test(source.path)) return `the source path "${source.path.slice(0, 80)}" is empty or has | or a line break in it.`
  if (source.path.startsWith('/') || /^[A-Za-z]:/.test(source.path) || source.path.split('/').includes('..')) {
    return `the source path "${source.path.slice(0, 80)}" is not relative to the project and inside it.`
  }
  if (!source.quote.trim()) return 'a source needs the exact words it cites.'
  if (/\n/.test(source.quote)) return 'a source quote is one line; whitespace in it is not significant, so join its lines with spaces.'
  return null
}

/** The labels a text's markers name, in order, each once. */
export function markersIn(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(MARKER)) if (!found.includes(match[1]!)) found.push(match[1]!)
  return found
}

/** A quote's words as they are compared: one space between runs, no ends. */
export function normaliseQuote(quote: string): string {
  return quote.replace(/\s+/g, ' ').trim()
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const encoder = new TextEncoder()
const bytes = (text: string) => encoder.encode(text).length

function lineOf(text: string, at: number): number {
  let line = 1
  for (let i = text.indexOf('\n'); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) line++
  return line
}

/** Where `quote` is in `file`, and how many times. */
export function findQuote(file: string, quote: string): { count: number; at: Found | null } {
  const words = normaliseQuote(quote).split(' ').filter(Boolean)
  if (!words.length) return { count: 0, at: null }
  const pattern = new RegExp(words.map(escape).join('\\s+'), 'g')
  let count = 0
  let at: Found | null = null
  for (const match of file.matchAll(pattern)) {
    count++
    if (at) continue
    const start = match.index
    const end = start + match[0].length
    at = { from: bytes(file.slice(0, start)), to: bytes(file.slice(0, end)), line: lineOf(file, start), endLine: lineOf(file, end - 1) }
  }
  return { count, at }
}

/** A source, looked for in its file's text (null: the file could not be read). */
export function resolveSource(source: Source, file: string | null): Resolved {
  if (file === null) return { ...source, status: 'unreadable', at: null, count: 0 }
  const { count, at } = findQuote(file, source.quote)
  return { ...source, status: count === 0 ? 'adrift' : count === 1 ? 'holds' : 'ambiguous', at, count }
}

/** "lines 31–33" or "line 31". */
export function linesOf(at: Found): string {
  return at.line === at.endLine ? `line ${at.line}` : `lines ${at.line}–${at.endLine}`
}
