import type { Measure } from '@/view/room.ts'

/**
 * How wide a run of text actually is, asked of the font engine.
 *
 * ## Why a canvas, and not an element
 *
 * `view/room.ts` has to know how many lines a question takes before it decides
 * how to draw the question, and the whole argument in that file is that
 * measuring a thing you are about to change is the bug this workspace has spent
 * a day on. So the measurement cannot come from the rendered card.
 *
 * The alternative to a canvas is an off-screen `<div>` of the right width with
 * the text in it, read back with `getBoundingClientRect`. That works, and it is
 * a layout: it forces style and reflow on every call, and `lines()` calls this
 * once per word per string per card. A canvas 2D context answers `measureText`
 * out of the font metrics with no document involved at all, and it answers the
 * same number the layout engine would — verified against a real element at five
 * widths and five strings, 25 line counts out of 25 identical.
 *
 * ## The font string has to be the page's, not a guess
 *
 * `-apple-system` is not a font; it is an instruction to the platform, and a
 * canvas told `12px sans-serif` would measure a different face from the one the
 * page draws. So the family is read off the live `<body>` — the same computed
 * value the buttons and paragraphs inherit — and only the size and weight vary.
 *
 * `font-synthesis-weight: none` is set in `index.css`, so a weight the family
 * does not ship is NOT faked wider by the browser; the canvas and the page make
 * the same substitution and agree. That line was written for legibility and
 * happens to be what makes this file honest.
 *
 * ## What it does when there is no canvas
 *
 * Returns null, and `room.ts` falls back to `roughly`. That happens in `bun
 * test` under happy-dom and in any environment that does not lay out — where
 * the frame is unmeasured anyway, so `ladder()` answers `list` and the estimate
 * is not consulted.
 */

/** One cache, keyed by face, weight, size and string. Cleared when it gets silly. */
const CACHE = new Map<string, number>()
const CEILING = 20000

/**
 * ## One face, and the element that is not drawn in it any more
 *
 * Everything this measures is in the body's own family. There WAS a second face
 * on a card — a document path inside a `<code>`, which Tailwind's preflight gives
 * the monospace stack — and it is the reason this file briefly grew a `mono`
 * flag. It did not help: a 48-character path is one long token, and the browser
 * breaks it at slashes, at hyphens and mid-word by rules that measured three
 * lines in a 244-pixel column where every model in `room.ts` said two. The path
 * is no longer repeated on the paged rungs, which removed the uncertainty along
 * with three lines of grey. If a `<code>` ever comes back onto a card, this is
 * where the second face goes, and `room.ts` will still not be able to predict
 * how it wraps.
 */
export function textWidth(): Measure | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const family = getComputedStyle(document.body).fontFamily
  if (!family) return null

  return (text: string, px: number, style?: { weight?: number }) => {
    const weight = style?.weight ?? 400
    const key = `${weight}|${px}|${text}`
    const had = CACHE.get(key)
    if (had !== undefined) return had
    ctx.font = `${weight} ${px}px ${family}`
    const width = ctx.measureText(text).width
    /* The cache is per (weight, size, prefix) and `lines()` asks for every
       prefix of every option, so it grows with the questions on screen and not
       with time. The ceiling is for a canvas somebody leaves open across a
       thousand epics; dropping the lot is correct because the next render
       rebuilds only what it needs. */
    if (CACHE.size > CEILING) CACHE.clear()
    CACHE.set(key, width)
    return width
  }
}
