/**
 * What fits, decided once, from the size of the box this page was given.
 *
 * ## Why this is a function and not a pile of classes in the JSX
 *
 * Half of what follows cannot be a CSS class at all. A container query measures
 * `inline-size` — the width — and the thing that actually hurts here is the
 * HEIGHT: a container 320 wide and 200 tall is a perfectly comfortable width and
 * a box that holds two thirds of one question. `@sm/container:` has nothing to
 * say about it. So the height-dependent decisions are made in TypeScript, off a
 * measured frame, and they are made HERE rather than inline so that "what shows
 * at 220×300" is a table somebody can read and a test can assert, instead of six
 * ternaries spread across two components.
 *
 * The width-dependent COSMETICS — padding, gap, type size — are still container
 * queries in the class lists, because those are genuinely about width and CSS
 * does them without a render. This file decides what EXISTS; the classes decide
 * how it is drawn.
 *
 * ## Two decisions, and the second one had to know what the questions say
 *
 * `room()` is the original: six folds, decided from the frame alone, about which
 * ROWS of a card are worth their pixels. `ladder()` below is the newer and the
 * larger one, and it decides how many QUESTIONS are on screen at all — the whole
 * list, exactly one question, or one part of one question. That cannot be a
 * function of the frame alone, because "does one question fit" is a fact about a
 * particular question: a two-line question with two options and a five-line
 * question with eight are not the same problem in the same box. So `ladder()`
 * takes the text as well, and estimates. Its essay is above it.
 *
 * ## The numbers, and where they came from
 *
 * They are measured, not guessed. `dev/sizes.mjs` lays this module out at four
 * real container sizes and prints the height of a question card in the LIST
 * layout — the bordered, padded one, with its passage closed:
 *
 *   220 wide → 307px    460 wide → 212px
 *   320 wide → 239px    900 wide → 182px
 *
 * That is the whole argument. In a box 300 tall a single card does not fit; in
 * one 200 tall it fits half. Every threshold below is a statement about how many
 * cards the reader can hold in view at once, which is the only thing that
 * decides whether a row of chrome is worth its pixels.
 *
 * The paged layouts are shorter than those, and not by a little: the same
 * question at 220 wide measures 164 pixels once the card's own border and
 * padding come off and the heading block above it is replaced by the row of
 * controls those rungs needed anyway. Both halves of that are `ladder()`'s doing
 * and both are argued for where they happen — `metrics()` below, and `QuizView`
 * in `view/quiz.tsx`.
 *
 * ## An unmeasured frame is a roomy one
 *
 * `height <= 0` happens twice: on the very first render, before the observer has
 * run, and in a test environment that does not lay out. Both are answered with
 * "show everything", because the failure of guessing wrong in that direction is
 * a card that is briefly taller than it needs to be, and the failure in the
 * other direction is a page that flashes its full form on top of a folded one.
 */

/** The box this page is being drawn in — the frame's own, not the content's. */
export interface Frame {
  width: number
  height: number
}

export interface Room {
  /**
   * Whether the scroller snaps.
   *
   * `proximity`, never `mandatory`, and the reason is in the numbers above: at
   * 220 wide a card is taller than a 300-tall box, and `mandatory` means the
   * scroller must always come to rest on a snap point — which makes the BOTTOM
   * of an over-tall card a place you cannot stay. `proximity` snaps a flick that
   * ends near a card boundary and leaves a deliberate scroll alone, so a long
   * passage stays readable.
   *
   * This says the box is short enough to WANT snapping. Whether there is a list
   * left to snap is `Ladder.snap`, and that is the one the page writes onto
   * `<html>` — see the essay on `rung` below. A scroller with one card in it and
   * nothing to scroll has no snap points worth the name.
   */
  snap: boolean
  /**
   * Who wrote the question, and whether it came through the MCP door.
   *
   * A whole row, at the bottom of every card, for a fact almost nobody is
   * looking for. Folded into the card's `title` when rows are scarce: still in
   * the document, still readable on hover, no longer costing 16 pixels twelve
   * times over.
   */
  byline: 'row' | 'title'
  /**
   * The passage a question is anchored to.
   *
   * Inline it is a `<details>` that pushes the rest of the card down when opened
   * — fine when three cards fit on screen, useless in a 300-tall box where
   * opening it scrolls the options you were reading off the top and leaves you
   * somewhere you did not ask to be. `overlay` gives it the whole frame instead:
   * one paragraph of somebody's LaTeX, at the width the frame has, and a press
   * to put it back.
   */
  passage: 'inline' | 'overlay'
  /**
   * On an answered card, the options that were neither chosen nor correct.
   *
   * They are why the question was hard and they are worth keeping — but on a
   * card whose verdict is already known they are the rows a reader skips, and
   * there can be four of them. Folded behind one press when height is scarce.
   */
  others: 'shown' | 'folded'
  /** The sentence under "Ask these again", which is a note about a rare press. */
  retakeNote: 'paragraph' | 'title'
  /**
   * How much of the document a question came from is spelled out on the control
   * that points the canvas at it.
   *
   * A question that says nothing about its source gives a reader no reason to
   * press it, so this is never absent — the only choice is how long a name it
   * gets. `path` is the whole project-relative path; `file` is the last segment
   * of it, which is never wrong and is one line at every width this module is
   * given. The full path is in the control's `title` and inside the passage
   * either way, so `file` hides nothing — it defers it by one hover.
   *
   * Width and not height, unlike everything above it: this costs no row that was
   * not already there. The control it labels used to read "the passage this is
   * about" and occupied exactly the same line.
   */
  source: 'path' | 'file'
}

/**
 * Below this many pixels of frame height, fewer than about three cards are in
 * view at once, so a flick lands mid-card and the reader loses their place.
 * Above it the list mostly fits and snapping would only make a free scroll feel
 * like it was arguing with them.
 */
const SNAP_BELOW = 520

/**
 * Below this, a card and its opened passage cannot both be on screen at any
 * width this module gets. A card is 204px at 460 wide and 303 at 220; the
 * passage adds roughly 70 more when it is opened. 274 fits in a 360-tall box and
 * 393 does not fit in a 300-tall one, so the line is drawn between them —
 * everything that costs a row and is not the question, the options or the
 * verdict folds below it.
 */
const TIGHT_BELOW = 340

/** Narrow enough that a row of prose is four lines rather than one. */
const NARROW_BELOW = 260

/**
 * Below this, a project-relative document path is more than one line.
 *
 * Wider than `NARROW_BELOW` on purpose, and the reason is that a path is longer
 * than the prose that thresholds measures. The real ones in this workspace run
 * to `data/papers/modes-are-modules/chapters/agents.tex` — 48 characters, which
 * at the 0.65rem this control is drawn in is roughly 290 pixels of text. It is
 * two lines in a 320-wide letterbox and four in a 220-wide column, and it is
 * grey chrome above a question either way. At 360 and up it is one line, so at
 * 360 and up it is shown whole.
 */
const PATH_FROM = 360

export function room({ width, height }: Frame): Room {
  /* Not measured yet. Show everything: a card briefly too tall is a smaller
     mistake than a page that folds itself and then unfolds. */
  if (height <= 0) {
    return { snap: false, byline: 'row', passage: 'inline', others: 'shown', retakeNote: 'paragraph', source: 'path' }
  }
  const tight = height < TIGHT_BELOW
  return {
    snap: height < SNAP_BELOW,
    byline: tight || width < NARROW_BELOW ? 'title' : 'row',
    passage: tight ? 'overlay' : 'inline',
    others: tight ? 'folded' : 'shown',
    retakeNote: tight || width < NARROW_BELOW ? 'title' : 'paragraph',
    /* Width alone. A short box is a reason to fold a row away; it is not a
       reason to abbreviate a label on a row that is being drawn regardless. */
    source: width < PATH_FROM ? 'file' : 'path',
  }
}

/* ------------------------------------------------------------------------- *
 * The ladder: how many questions are on screen at all.
 * ------------------------------------------------------------------------- */

/**
 * How wide a run of text is, in the font it will be drawn in.
 *
 * ## Why this is injected rather than imported
 *
 * The only honest way to know how many lines a sentence takes is to know how
 * wide the sentence is, and the only thing that knows that is the font engine.
 * In a browser that is `canvas.measureText`; in `bun test` there is no font
 * engine at all. Passing it in keeps every decision below a pure function of
 * numbers — so the table in `test/room.test.ts` can assert a rung against a
 * stub whose metrics are stated in the test rather than discovered on whichever
 * machine ran it — and lets the page use the real thing. `view/text.ts` is the
 * real one.
 *
 * `weight` because `font-weight: 600` is wider than 400 in every face this page
 * can be drawn in, and the heading is semibold. Getting that wrong is a heading
 * that wraps to two rows when this file thought it was one, which is 18 pixels
 * of a 300-pixel box spent without being counted.
 *
 * There is deliberately no `mono` here, and its absence is a decision rather
 * than an omission. A monospace `<code>` did appear on a card — the document
 * path repeated under the source — and it was the one element whose wrapping
 * this file could not predict at any weight or advance. It is not drawn on the
 * paged rungs any more. See `wholeHeight()`.
 */
export interface TextStyle {
  weight?: number
}

export type Measure = (text: string, px: number, style?: TextStyle) => number

/**
 * The stand-in for a page with no font engine.
 *
 * Per-character advances close enough that a test can state a threshold, and
 * nowhere near good enough to decide a layout on — which is why the page never
 * uses it. What it is genuinely for: the first render, before a canvas has been
 * made, where the frame is unmeasured anyway and `ladder()` answers `list`
 * regardless.
 */
export const roughly: Measure = (text, px, style) =>
  text.length * px * ((style?.weight ?? 400) >= 600 ? 0.55 : 0.52)

/**
 * A question, as far as its height is concerned.
 *
 * Deliberately not `Asked`: this file has no business importing the store's
 * shapes, and every field here is one whose LENGTH changes how tall the card
 * is. `why` is `null` until the reader has answered, because the server has not
 * sent it — which is a real hole in the estimate and is wrongness 1 below.
 */
export interface Card {
  question: string
  options: string[]
  /** The label drawn on the source control — `wire/pointed.ts` spells it. */
  source: string
  /** The project-relative path, printed under the source where the label is short. */
  path: string
  quote: string
  /** The explanation, once it has been earned. `null` before that. */
  why: string | null
  answered: boolean
}

/** Which rung of the ladder the page is standing on. */
export type Rung = 'list' | 'one' | 'part'

/** The three pieces one question is made of, when it has to be shown in pieces. */
export type Part = 'question' | 'options' | 'quote'

export interface Ladder {
  /**
   * The whole point of this file's second half.
   *
   * - `list` — several whole questions are in view. Scroll between them, as
   *   this module has always worked.
   * - `one` — exactly one question, whole: its text, every option, and the
   *   passage it came from, all on screen with nothing to scroll and nothing to
   *   press open. A pager moves between questions.
   * - `part` — not even one whole question fits, so one PART of it shows at a
   *   time and a switcher moves between the parts.
   *
   * The rule that decides it is the owner's, stated twice in this workspace
   * today: **do not squeeze many things in partially when one thing shown
   * completely is more useful.** So `list` is not "the box is big"; it is "at
   * least two whole cards are in view at once". A box holding a card and a half
   * is the case this ladder exists to stop, and it is `one`.
   *
   * `list` versus the other two is a fact about the whole list. `one` versus
   * `part` is a fact about the question being SHOWN, and is recomputed as the
   * reader pages: a short question shows whole and the monster three along from
   * it splits, which is the honest answer to a list whose cards are not the same
   * height. That is not a flicker — it happens in answer to a press, and the
   * reader asked for a different question.
   */
  rung: Rung
  /** Height there is for cards, once the chrome that is always drawn is paid for. */
  available: number
  /**
   * What each card was estimated to need, in the layout its rung draws. The page
   * writes it onto the card as `data-estimate` so `dev/ladder.mjs` can measure
   * how wrong it was — see the essay on estimating, below.
   */
  heights: number[]
  /**
   * Whether the document should snap.
   *
   * `room().snap` says the box is short enough to want it; this adds the half it
   * cannot know, which is whether there is a list left. At `one` and `part` the
   * page draws a single card and nothing scrolls, so a snap point is a rule
   * about a gesture nobody can make — and worse than useless, because
   * `scroll-snap-type` on a document that scrolls by a few stray pixels drags
   * the reader to a boundary they did not ask for. Snapping was the right
   * mechanism for a scrolling list and it is still on for one; it is not a
   * second mechanism beside this ladder, it is the mechanism for this ladder's
   * top rung.
   */
  snap: boolean
}

/**
 * ## Estimating, and what the estimate is wrong about
 *
 * This is the recurring bug in this workspace stated in one sentence: a
 * measurement taken before the thing it measures exists. To lay out a card you
 * must know its height; to know its height you must lay it out.
 *
 * The obvious escape is to render, measure, and then change the layout. That is
 * a feedback loop with the reader inside it: the card is 301 in a 300 box, so
 * the page drops a rung, so the card is drawn differently, so it measures
 * something else, so the page climbs back. A layout that flickers between rungs
 * is worse than one rung too conservative, and there is no amount of hysteresis
 * that makes "measure the thing you are about to change" honest.
 *
 * So this estimates, from the text and the width, with no reference to anything
 * it has itself decided. The estimate is therefore a pure function of (what the
 * questions say, how wide the frame is), and it changes exactly when one of
 * those changes and never because of what it decided last frame.
 *
 * It is also very nearly exact, which is not a boast — it is checkable, and it
 * is checked. `lines()` below is a greedy line-breaker over real text metrics,
 * which is what the browser also does; measured against a real element at five
 * widths and five strings it got 25 line counts out of 25 right. The
 * per-element geometry beneath it — 28 pixels minimum for an option, 10 for its
 * border and padding, 4 between them, 1 for the inline-flex baseline gap in the
 * `<li>` around it — is read out of `dev/sizes.mjs` and reproduces the measured
 * card heights of 126, 307 and 722 at 220 wide to the pixel.
 *
 * ### What it is wrong about, said plainly
 *
 * 1. **The explanation of a question nobody has answered.** `Asked.why` is
 *    `null` until the reader chooses, because the server withholds it — that is
 *    the module's whole design constraint and it is not negotiable for a layout.
 *    So a row that WILL exist cannot be measured, and this file does not pretend
 *    to: `verdictHeight()` counts nothing for an unanswered card. The two rungs
 *    then diverge on purpose. `listHeight()` counts nothing for an ANSWERED card
 *    either, so the list rung cannot be moved by the reader working through it;
 *    `wholeHeight()` counts the real explanation as soon as there is one, so a
 *    press can push a card past its box and drop `one` to `part`. That is the
 *    one place in this file where the layout moves under a press, it is a
 *    content change rather than a flicker, and it lands on the part that holds
 *    the verdict and the explanation — which is where the reader was going.
 * 2. **Kerning, ligatures and hyphenation.** `lines()` breaks on spaces and
 *    measures the run; a browser may fit a word this file thinks it cannot.
 *    Wrong in the safe direction: one line too many, one rung too conservative.
 * 3. **The heading.** Its height is computed the same way and is the one piece
 *    of chrome that is not a card. It is estimated with the SCORE AT ITS
 *    WIDEST — every count set to the number of questions — so that answering a
 *    question can never rewrap the heading and move the whole ladder under the
 *    reader.
 * 4. **Nothing at all about `trouble`.** An error paragraph pushes the list
 *    down and is not counted. It is a state nobody should be in for long, and
 *    counting a row that is usually absent would cost every reader pixels for a
 *    fault they do not have.
 */

/** The container-query breakpoint every `@sm/container:` class in this app fires at. */
const WIDE_FROM = 384

/**
 * Every constant below is read out of a real browser by `dev/sizes.mjs` and
 * `/tmp`-scratch calibration beside it, at 220, 260, 320, 460 and 900 wide. They
 * are not guesses about CSS: `p-2` really is 8, an option button really is
 * `max(28, 16n + 10)` tall, and the `<li>` around a wrapped option really does
 * add one pixel of inline-flex baseline gap that a reading of the class list
 * would never predict.
 */
const PAGE_PAD = { narrow: 8, wide: 12 }
const CARD_PAD = { narrow: 8, wide: 10 }
/** The question: `text-[0.78rem] leading-5`, `@sm` `text-[0.85rem] leading-6`. */
const QUESTION = { narrow: { px: 12.48, line: 20 }, wide: { px: 13.6, line: 24 } }
/** The epic's name: `text-[0.8rem] font-semibold`, `@sm` `text-sm`. */
const HEADING = { narrow: { px: 12.8, line: 19.2 }, wide: { px: 14, line: 20 } }
/** `text-[0.65rem]` at the body's own 1.5 line-height, in the heading's flex row. */
const SCORE = { px: 10.4, line: 15.6 }
/** An option button: `text-xs`, `min-h-7`, `px-2 py-1`, one pixel of border each side. */
const OPTION = { px: 12, line: 16, chrome: 10, min: 28, gap: 4, pad: 18 }
/** `text-[0.65rem] leading-4` — the source label and the byte range under it. */
const SMALL = { px: 10.4, line: 16 }
/** `text-[0.7rem] leading-4` — the quote, and the explanation. Both sit behind `border-l-2 pl-2`. */
const ASIDE = { px: 11.2, line: 16, indent: 10 }
/** `text-[0.6rem] leading-3` — who wrote it. */
const BYLINE = { px: 9.6, line: 12 }
/** `gap-1.5` and `mt-1.5`, which is every gap on a card that is not the options. */
const GAP = 6
/** `mt-1` — the tighter one, under the options and above the quote. */
const TUCK = 4
/** The verdict row: a badge, `leading-4` with `py-px` and a border. */
const VERDICT = 20
/** One row of controls: `h-6`, and `gap-1` when it wraps to a second. */
const ROW = 24
const ROW_GAP = 4
/** How many lines of the question stay above a part that is not the question. */
const CLAMP = 2

/** What each part is called on the control that switches to it. Said once. */
export const PART_LABEL: Record<Part, string> = {
  question: 'question',
  options: 'options',
  quote: 'passage',
}

const EVERY_PART: Part[] = ['question', 'options', 'quote']

interface Metrics {
  pagePad: number
  cardPad: number
  /** The text width inside a card, in the layout named. */
  content: number
  /** The text width inside an option button. */
  option: number
  /** The text width inside a quote or an explanation, behind its rule. */
  aside: number
  question: { px: number; line: number }
  heading: { px: number; line: number }
}

/**
 * The widths and type sizes at a given frame width, for a given rung.
 *
 * The `bare` half is the second half of the owner's ask and is not a detail: at
 * `one` and `part` the card has no border, no background, no radius and no
 * padding of its own, because it is the only thing on screen and the HOST
 * already draws a container around this module. A card inside a card is the
 * complaint; the fix returns 18 pixels in each axis, and 18 pixels of width is
 * a wrapped line back at 220. At `list` the card keeps its edge, because there
 * the edge is doing the one job an edge does — saying where one question ends
 * and the next begins.
 */
function metrics(width: number, bare: boolean): Metrics {
  const wide = width >= WIDE_FROM
  const pagePad = wide ? PAGE_PAD.wide : PAGE_PAD.narrow
  const cardPad = bare ? 0 : wide ? CARD_PAD.wide : CARD_PAD.narrow
  const border = bare ? 0 : 2
  const content = Math.max(0, width - 2 * pagePad - border - 2 * cardPad)
  return {
    pagePad,
    cardPad,
    content,
    option: Math.max(0, content - OPTION.pad),
    aside: Math.max(0, content - ASIDE.indent),
    question: wide ? QUESTION.wide : QUESTION.narrow,
    heading: wide ? HEADING.wide : HEADING.narrow,
  }
}

/**
 * How many lines a string takes in a box that wide, by breaking it the way a
 * browser breaks it: greedily, at spaces, and then inside a word that is longer
 * than the line — which is what `overflow-wrap: anywhere` in `index.css` makes
 * the browser do, and this module's text is full of file paths and LaTeX.
 *
 * Validated against a real element at five widths and five strings: 25 of 25.
 */
function lines(text: string, avail: number, px: number, measure: Measure, style?: TextStyle): number {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  if (avail <= 0) return words.length
  let count = 1
  let run = ''
  for (const word of words) {
    const next = run ? `${run} ${word}` : word
    if (measure(next, px, style) <= avail) {
      run = next
      continue
    }
    if (run) count += 1
    run = word
    while (measure(run, px, style) > avail) {
      /* Starts one short of the whole run, so a word that does not fit at all
         still makes progress and this cannot spin. */
      let cut = run.length - 1
      while (cut > 1 && measure(run.slice(0, cut), px, style) > avail) cut -= 1
      run = run.slice(cut)
      count += 1
    }
  }
  return count
}

/** The options, stacked: `min-h-7`, wrapped, `gap-1` apart, in `<li>`s that each cost a baseline pixel. */
function optionsHeight(options: string[], m: Metrics, measure: Measure): number {
  let total = 0
  options.forEach((option, index) => {
    const n = Math.max(1, lines(option, m.option, OPTION.px, measure, { weight: 500 }))
    const height = Math.max(OPTION.min, n * OPTION.line + OPTION.chrome)
    /* The inline-flex baseline gap, which only appears once the button is taller
       than its own minimum. Measured: two 28px options are 60px of `<ul>`, three
       wrapped ones are 201 where the buttons alone are 190 and the gaps 8. */
    total += height + (height > OPTION.min ? 1 : 0) + (index ? OPTION.gap : 0)
  })
  return total
}

/** The verdict badge and the explanation, which only exist once a question is answered. */
function verdictHeight(card: Card, m: Metrics, measure: Measure): number {
  if (!card.answered) return 0
  const why = card.why ? lines(card.why, m.aside, ASIDE.px, measure) : 0
  return GAP + VERDICT + (why ? GAP + why * ASIDE.line : 0)
}

/**
 * A card in the LIST layout: bordered, padded, and with the passage closed
 * behind its disclosure.
 *
 * ## Measured as if nobody had answered it, deliberately
 *
 * An answered card gains a verdict and an explanation and is 80 pixels taller.
 * If this counted them, a list that was comfortable this morning would become a
 * paged one by the afternoon simply because the reader had been working — the
 * rung would change under somebody who had asked for nothing, and it would
 * change on the press that answered a question.
 *
 * So the list rung is decided on what the questions are, not on how far through
 * them the reader has got. What it costs is that a fully answered list scrolls
 * more than an unanswered one, which is what a list does; what it buys is a
 * decision that no press can move.
 *
 * The two folds that DO belong here are the ones `room()` already decided from
 * the frame: whether the byline is a row and whether the passed-over options are
 * folded away. Those are geometry, and they do not change while the reader
 * works.
 */
function listHeight(card: Card, width: number, fits: Room, measure: Measure): number {
  const m = metrics(width, false)
  return Math.ceil(
    2
    + 2 * m.cardPad
    + Math.max(1, lines(card.question, m.content, m.question.px, measure, { weight: 500 })) * m.question.line
    + GAP
    + optionsHeight(card.options, m, measure)
    + GAP
    + Math.max(1, lines(card.source, m.content, SMALL.px, measure)) * SMALL.line
    + (fits.byline === 'row' ? TUCK + BYLINE.line : 0),
  )
}

/**
 * A card in the WHOLE layout: no card chrome at all, and the passage open.
 *
 * The passage is open because that is the rung's whole promise. "Show everything
 * of a single question (question, options, quote) at once" is not satisfied by a
 * disclosure the reader has to press — a question whose source is one press away
 * is the `list` layout with fewer questions in it, which is nobody's idea of a
 * better use of a small box.
 *
 * ## Answered, this one DOES grow, and the page lets it
 *
 * The opposite call from `listHeight` above, for the opposite reason. This
 * rung's whole promise is that there is nothing to scroll, and an answered card
 * carrying a verdict and an explanation the server had withheld genuinely is
 * taller. Reserving space for an explanation nobody has earned would cost every
 * reader three lines of a 300-pixel box for a row that does not exist yet;
 * reserving nothing means a press can push a card past its box, and the rung
 * drops from `one` to `part`.
 *
 * That drop is a content change in answer to the reader's own press, and it
 * lands exactly where the reader was going: `App` moves to the `question` part
 * on a successful answer, and the `question` part is the one holding the verdict
 * and the explanation. The layout moving under a press is a real cost and this
 * is the one place in this file that pays it, in the open.
 */
function wholeHeight(card: Card, width: number, fits: Room, measure: Measure): number {
  const m = metrics(width, true)
  /*
   * The byte range under the source is ONE line and is not measured, because
   * the paged rungs print `bytes 1024–1180` and nothing else there.
   *
   * The disclosure at `list` repeats the whole document path in a `<code>` when
   * the label above it is only a file name, and this rung deliberately does not
   * — see the essay on that element in `view/quiz.tsx`. Half of the reason is
   * the three lines of grey monospace it costs at 220 wide. The other half is
   * this file: a path is one long token in a monospace face, and the browser
   * breaks it at slashes, at hyphens and mid-word by rules that measured three
   * lines in a 244-pixel column where every model here said two. It was the only
   * element on a card whose height this file could not predict, and the fix was
   * to stop drawing it rather than to guess at it better.
   */
  const height =
    Math.max(1, lines(card.question, m.content, m.question.px, measure, { weight: 500 })) * m.question.line
    + GAP
    + optionsHeight(card.options, m, measure)
    + verdictHeight(card, m, measure)
    + GAP
    + Math.max(1, lines(card.source, m.content, SMALL.px, measure)) * SMALL.line
    + TUCK
    + SMALL.line
    + TUCK
    + Math.max(1, lines(card.quote, m.aside, ASIDE.px, measure)) * ASIDE.line
  return Math.ceil(height)
}

/**
 * The heading block: the paper's name and the score, in a wrapping flex row.
 *
 * Estimated with the score at its widest — every count set to the number of
 * questions — so that answering cannot rewrap it. See wrongness 3.
 */
function headingHeight(epic: string, questions: number, width: number, measure: Measure): number {
  const m = metrics(width, true)
  const score = `${questions} asked · ${questions} answered · ${questions} right`
  const name = measure(epic, m.heading.px, { weight: 600 })
  const both = name + 8 + measure(score, SCORE.px)
  if (both <= m.content) return Math.ceil(m.heading.line)
  /* `gap-y-0.5` between the two rows, and each may itself wrap. */
  return Math.ceil(
    Math.max(1, lines(epic, m.content, m.heading.px, measure, { weight: 600 })) * m.heading.line
    + 2
    + Math.max(1, lines(score, m.content, SCORE.px, measure)) * SCORE.line,
  )
}

/**
 * The one row of controls that the paged rungs draw instead of a heading.
 *
 * ## Why the heading goes away when the page starts paging
 *
 * At `list` the block above the cards is the paper's name and the score, and it
 * costs 43 pixels at 220 wide because the score wraps under the name. At `one`
 * and `part` that is 14% of a 300-pixel box spent on a fact the reader can
 * already see: every card names the document it came from, on its source
 * control, at every size. So the paged rungs draw no heading at all, and the row
 * they draw instead — the pager, the part switcher, the score, the way to ask
 * the questions again — is a row they need anyway. One row replaces two, and the
 * paper's name survives in that row's `title`.
 *
 * ## And why it is reserved at its widest
 *
 * With every chip, with the retake control, and with the counter, whether or not
 * the rung being decided will draw them. Reserving only what the CURRENT rung
 * draws would make the room available depend on the rung and the rung depend on
 * the room available, which is a loop with the reader inside it. Paying for one
 * row that is occasionally shorter than reserved is the cheap half of that
 * trade.
 */
function controlsHeight(count: number, width: number, measure: Measure): number {
  const m = metrics(width, true)
  const items: number[] = []
  if (count > 1) items.push(ROW, measure(`${count} / ${count}`, OPTION.px) + 16, ROW)
  for (const part of EVERY_PART) items.push(measure(PART_LABEL[part], SMALL.px) + 12)
  items.push(measure(`${count} right`, SMALL.px))
  items.push(measure('Ask again', OPTION.px) + 16)

  let rows = 1
  let run = 0
  for (const item of items) {
    const next = run ? run + ROW_GAP + item : item
    if (!run || next <= m.content) {
      run = next
      continue
    }
    rows += 1
    run = item
  }
  return rows * ROW + (rows - 1) * ROW_GAP + GAP
}

/**
 * Which parts one question is shown in, when it has to be shown in parts.
 *
 * `options` and `quote` always. `question` only where it would otherwise be
 * hiding something: a question longer than the two lines the header clamps to,
 * or an answered one, because the verdict and the explanation are drawn there.
 * A chip that leads to a screen the reader is already looking at is a chip they
 * press once and distrust afterwards.
 */
export function partsOf(card: Card, width: number, measure: Measure): Part[] {
  const m = metrics(width, true)
  const long = lines(card.question, m.content, m.question.px, measure, { weight: 500 }) > CLAMP
  return long || card.answered ? EVERY_PART : ['options', 'quote']
}

/**
 * Which rung, and how much room there is.
 *
 * `shown` is the index of the question the reader is looking at, and it only
 * matters for `one` versus `part` — see the essay on `rung`.
 */
export function ladder(input: {
  frame: Frame
  epic: string
  cards: Card[]
  fits: Room
  shown: number
  measure: Measure
}): Ladder {
  const { frame, epic, cards, fits, shown, measure } = input

  /*
   * Unmeasured, or nothing to show. The same answer `room()` gives and for the
   * same reason: `list` is the layout this module has always had, so a first
   * render that guesses it wrong unfolds into something rather than folding out
   * of it, and a fold that undoes itself is a flicker every reader sees.
   */
  if (frame.height <= 0 || !cards.length) {
    return { rung: 'list', available: frame.height, heights: [], snap: false }
  }

  const m = metrics(frame.width, true)
  const forList =
    frame.height - 2 * m.pagePad - headingHeight(epic, cards.length, frame.width, measure) - GAP

  const list = cards.map((card) => listHeight(card, frame.width, fits, measure))
  const tall = [...list].sort((a, b) => b - a)

  /* Two whole cards in view, or this is not a list — it is a card and a half,
     which is the shape the owner asked for this ladder to stop drawing. The two
     TALLEST, so that one long question among short ones cannot make the page
     promise a list it then cannot show whole. */
  if (cards.length >= 2 && forList >= (tall[0] ?? 0) + GAP + (tall[1] ?? 0)) {
    return { rung: 'list', available: forList, heights: list, snap: fits.snap }
  }

  const whole = cards.map((card) => wholeHeight(card, frame.width, fits, measure))
  const available = frame.height - 2 * m.pagePad - controlsHeight(cards.length, frame.width, measure)
  const at = Math.min(Math.max(shown, 0), cards.length - 1)
  return {
    rung: (whole[at] ?? 0) <= available ? 'one' : 'part',
    available,
    heights: whole,
    snap: false,
  }
}
