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
 * ## The numbers, and where they came from
 *
 * They are measured, not guessed. `dev/sizes.mjs` lays this module out at four
 * real container sizes and prints the height of a question card:
 *
 *   220 wide → 303–323px    460 wide → 204px
 *   320 wide → 255px        900 wide → 174px
 *
 * That is the whole argument. In a box 300 tall a single card does not fit; in
 * one 200 tall it fits half. Every threshold below is a statement about how many
 * cards the reader can hold in view at once, which is the only thing that
 * decides whether a row of chrome is worth its pixels.
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

export function room({ width, height }: Frame): Room {
  /* Not measured yet. Show everything: a card briefly too tall is a smaller
     mistake than a page that folds itself and then unfolds. */
  if (height <= 0) {
    return { snap: false, byline: 'row', passage: 'inline', others: 'shown', retakeNote: 'paragraph' }
  }
  const tight = height < TIGHT_BELOW
  return {
    snap: height < SNAP_BELOW,
    byline: tight || width < NARROW_BELOW ? 'title' : 'row',
    passage: tight ? 'overlay' : 'inline',
    others: tight ? 'folded' : 'shown',
    retakeNote: tight || width < NARROW_BELOW ? 'title' : 'paragraph',
  }
}
