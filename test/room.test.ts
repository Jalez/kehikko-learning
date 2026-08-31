import { describe, expect, test } from 'bun:test'

import { ladder, partsOf, room, roughly, type Card, type Frame } from '../src/view/room.ts'

/**
 * What shows at what size, as a table.
 *
 * This is the whole reason `room()` is a function rather than six ternaries in
 * the JSX: the decision can be read here in one screen, and a change to it shows
 * up as a changed row rather than as a diff somebody has to lay out in their
 * head. `dev/sizes.mjs` measures the geometry these numbers are about; this
 * file asserts the rules that were drawn from it.
 */

/** The sizes a container on a canvas actually gets, and what each one is. */
const SIZES = {
  /** The narrow column the module is really designed for. One card, not quite. */
  narrow: { width: 220, height: 300 },
  /** A wide letterbox: plenty of width, two thirds of one card of height. */
  letterbox: { width: 320, height: 200 },
  /** A comfortable container. Room for a card and a half. */
  container: { width: 460, height: 360 },
  /** Half a monitor. Four cards in view. */
  large: { width: 900, height: 700 },
}

describe('what fits', () => {
  test('a short box snaps and a tall one does not', () => {
    expect(room(SIZES.narrow).snap).toBe(true)
    expect(room(SIZES.letterbox).snap).toBe(true)
    expect(room(SIZES.container).snap).toBe(true)
    /* At 700 tall four cards are in view; there is nothing to align, and
       snapping would only make a free scroll feel like it was arguing back. */
    expect(room(SIZES.large).snap).toBe(false)
  })

  test('height alone decides snapping — a wide letterbox is still a short box', () => {
    expect(room({ width: 1600, height: 240 }).snap).toBe(true)
    expect(room({ width: 200, height: 900 }).snap).toBe(false)
  })

  test('the passage becomes an overlay exactly where a disclosure would not fit', () => {
    expect(room(SIZES.narrow).passage).toBe('overlay')
    expect(room(SIZES.letterbox).passage).toBe('overlay')
    expect(room(SIZES.container).passage).toBe('inline')
    expect(room(SIZES.large).passage).toBe('inline')
  })

  test('the byline goes into a title when the box is short OR the column is very narrow', () => {
    expect(room(SIZES.narrow).byline).toBe('title')
    expect(room(SIZES.letterbox).byline).toBe('title')
    expect(room(SIZES.container).byline).toBe('row')
    /* Tall but 240 wide: "written by claude, over MCP" is three lines there. */
    expect(room({ width: 240, height: 900 }).byline).toBe('title')
  })

  test('options are folded only where height is scarce, never merely because it is narrow', () => {
    expect(room(SIZES.narrow).others).toBe('folded')
    expect(room({ width: 200, height: 900 }).others).toBe('shown')
    expect(room(SIZES.large).others).toBe('shown')
  })

  test('the source is a whole path only where a whole path is one line', () => {
    /* A real one in this workspace is 48 characters, which is about 290 pixels
       at the size this control is drawn in. Two lines in a letterbox and four in
       the narrow column, and it is grey chrome above the question either way. */
    expect(room(SIZES.narrow).source).toBe('file')
    expect(room(SIZES.letterbox).source).toBe('file')
    expect(room(SIZES.container).source).toBe('path')
    expect(room(SIZES.large).source).toBe('path')
  })

  test('the source label is decided by width alone — a short box is no reason to abbreviate a row it is drawing anyway', () => {
    expect(room({ width: 900, height: 200 }).source).toBe('path')
    expect(room({ width: 240, height: 1200 }).source).toBe('file')
  })

  test('the retake note stops being a paragraph when it would be three lines', () => {
    expect(room(SIZES.narrow).retakeNote).toBe('title')
    expect(room(SIZES.container).retakeNote).toBe('paragraph')
    expect(room(SIZES.large).retakeNote).toBe('paragraph')
  })
})

describe('an unmeasured frame', () => {
  /*
   * Zero happens twice for real: the first render, before anything has been
   * observed, and any environment that does not lay out. Both are answered with
   * the roomy layout, because folding and then unfolding is a flicker every
   * reader sees, and showing one row too many for one frame is a mistake nobody
   * does.
   */
  test('shows everything and does not snap', () => {
    expect(room({ width: 0, height: 0 })).toEqual({
      snap: false,
      byline: 'row',
      passage: 'inline',
      others: 'shown',
      retakeNote: 'paragraph',
      source: 'path',
    })
  })

  test('a measured width with no height is still treated as unmeasured', () => {
    /* The width can be known before the height in a document that has not been
       laid out yet, and a page that folded on that would fold on every mount. */
    expect(room({ width: 220, height: 0 }).passage).toBe('inline')
  })
})

/* ------------------------------------------------------------------------- *
 * The ladder: how many questions are on screen at all.
 * ------------------------------------------------------------------------- */

/**
 * The rungs, as a table.
 *
 * Same argument as the table above and a stronger one, because `ladder()` takes
 * the QUESTIONS as well as the frame: "at 220×300 a two-option question shows
 * whole and an eight-option one shows in parts" is a sentence somebody has to be
 * able to check without opening a browser.
 *
 * ## Why `roughly` and not the real font engine
 *
 * `roughly` is the stand-in measurer in `view/room.ts`: a fixed advance per
 * character, stated there. The page never uses it — the page uses
 * `view/text.ts`, which asks the font engine — and this file uses nothing else,
 * deliberately. A test that measured real text would be asserting on whichever
 * faces the machine running it happens to have installed, and would pass in one
 * place and fail in another for a reason nobody could see.
 *
 * What is being tested here is the LADDER: given heights, which rung. The
 * heights themselves are checked where they can be checked honestly, which is in
 * a browser — `dev/ladder.mjs` prints every card's estimate beside its measured
 * height and fails the run on any that came in under. So the numbers below are a
 * little different from a real browser's and the rungs are the same rungs, which
 * is the point of the split.
 */
const card = (over: Partial<Card> = {}): Card => ({
  question: 'What does the wire settle?',
  options: ['The host', 'The module'],
  source: 'bridge.tex',
  path: 'data/papers/modes-are-modules/chapters/bridge.tex',
  quote: 'A wire is two programs agreeing on one sentence.',
  why: null,
  answered: false,
  ...over,
})

/** Two options, one line of question, one line of quote. */
const SHORT = card()

/** What an agent actually writes: a sentence, three clauses, a paragraph quoted. */
const MEDIUM = card({
  question: 'Question 1: what does the manifest settle, and who reads it?',
  options: [
    'Whatever the host happens to have decided that morning, which is not written down anywhere',
    'Which tab the module gets, and what it would like to be allowed to ask for',
    'Nothing at all — it is a comment with a file extension',
  ],
  quote:
    'The manifest is the smallest half of this program and the only half a host ever reads, which is why it '
    + 'is the half that has to be true.',
})

/** Five lines of question and eight options. The case a single rung gets wrong. */
const LONG = card({
  question:
    'Question 2: when a host frames a module and the module declares a capability the host has never heard of, '
    + 'what is the host obliged to do about it, and what does the module do when the host says nothing at all?',
  options: [
    'Refuse the frame entirely, because an unknown capability is an unknown program',
    'Answer no, in words, so the module can draw a screen that is not an error',
    'Say nothing, and let the module’s own backstop answer after half a second',
    'Forward the declaration to whichever other module claims to understand it',
    'Log it somewhere nobody reads and carry on as if it had not been said',
    'Ask the person who opened the canvas whether they meant to allow it',
    'Treat it as granted, on the grounds that a module would not ask idly',
    'Nothing at all — it is a comment with a file extension',
  ],
  quote:
    'The manifest is the smallest half of this program and the only half a host ever reads, which is why it '
    + 'is the half that has to be true, and why it is the half that is checked, every time, by a probe.',
})

const climb = (frame: Frame, cards: Card[], shown = 0) =>
  ladder({ frame, epic: 'modes-are-modules', cards, fits: room(frame), shown, measure: roughly })

describe('the ladder', () => {
  test('half a monitor holds a list, because two whole cards fit in it', () => {
    expect(climb(SIZES.large, [SHORT, MEDIUM, LONG]).rung).toBe('list')
  })

  test('a card and a half is not a list — it is one question', () => {
    /*
     * The owner's rule, and the reason this file has a second half: do not
     * squeeze many things in partially when one thing shown completely is more
     * useful. At 460×360 two of these cards do not both fit, so the page stops
     * pretending it is showing a list.
     */
    expect(climb(SIZES.container, [SHORT, MEDIUM, LONG]).rung).not.toBe('list')
  })

  test('the narrow column and the letterbox are never a list', () => {
    expect(climb(SIZES.narrow, [SHORT, MEDIUM, LONG]).rung).not.toBe('list')
    expect(climb(SIZES.letterbox, [SHORT, MEDIUM, LONG]).rung).not.toBe('list')
  })

  test('one whole question where it fits, and one PART of it where it does not', () => {
    /* The same box and the same list; only which question is being looked at
       changes, which is the half that a rung decided once for the whole list
       would get wrong. In a 300-pixel column a two-option question is whole and
       an eight-option one is not. */
    expect(climb(SIZES.narrow, [SHORT, MEDIUM, LONG], 0).rung).toBe('one')
    expect(climb(SIZES.narrow, [SHORT, MEDIUM, LONG], 2).rung).toBe('part')
  })

  test('a letterbox 200 tall cannot hold even the shortest question whole', () => {
    expect(climb(SIZES.letterbox, [SHORT, MEDIUM, LONG], 0).rung).toBe('part')
  })

  test('one question on its own is still a whole question, or still splits', () => {
    /* No list is possible with one card, so the choice is only ever between the
       two paged rungs — and it is still decided by whether the thing fits. */
    expect(climb(SIZES.large, [SHORT]).rung).toBe('one')
    expect(climb(SIZES.letterbox, [LONG]).rung).toBe('part')
  })

  test('nothing to show is the layout that has always been there', () => {
    expect(climb(SIZES.narrow, []).rung).toBe('list')
  })

  test('an unmeasured frame answers list and does not snap', () => {
    /* Same reasoning as `room()`'s: the list is what this module has always
       drawn, so a first render that guesses wrong unfolds into something rather
       than folding out of it. */
    const first = climb({ width: 220, height: 0 }, [SHORT, MEDIUM, LONG])
    expect(first.rung).toBe('list')
    expect(first.snap).toBe(false)
  })

  test('the shown index is clamped rather than trusted', () => {
    /* The poll can drop a question out from under a reader who is standing on
       the last one, and an index past the end would be a card that is not there. */
    expect(climb(SIZES.narrow, [SHORT], 9).rung).toBe(climb(SIZES.narrow, [SHORT], 0).rung)
    expect(climb(SIZES.narrow, [SHORT], -3).rung).toBe(climb(SIZES.narrow, [SHORT], 0).rung)
  })
})

describe('snapping, reconciled with the ladder', () => {
  /*
   * `room().snap` says the box is short enough to WANT snapping; `Ladder.snap`
   * says whether there is a list left to snap. They are different questions, and
   * the page writes the second one onto `<html>`.
   */
  test('a short box with a list in it still snaps', () => {
    const short = { width: 460, height: 500 }
    expect(room(short).snap).toBe(true)
    expect(climb(short, [SHORT, SHORT, SHORT, SHORT]).rung).toBe('list')
    expect(climb(short, [SHORT, SHORT, SHORT, SHORT]).snap).toBe(true)
  })

  test('a paged rung never snaps, however short the box', () => {
    /* One card and nothing to scroll, so a snap point is a rule about a gesture
       nobody can make — and `proximity` on a document that overruns its box by a
       few pixels would drag the reader to a boundary they did not ask for. */
    expect(room(SIZES.narrow).snap).toBe(true)
    expect(climb(SIZES.narrow, [SHORT, MEDIUM, LONG]).snap).toBe(false)
    expect(climb(SIZES.letterbox, [SHORT, MEDIUM, LONG]).snap).toBe(false)
  })
})

describe('what the reader has answered', () => {
  const worked = (one: Card) =>
    card({
      ...one,
      answered: true,
      why: 'Because the manifest is the only half a host reads, and it is read every single time.',
    })

  test('answering cannot move the list rung', () => {
    /*
     * `listHeight()` measures every card as if nobody had answered it, and this
     * is the assertion of that. An answered card gains a verdict and an
     * explanation and is eighty pixels taller; if the list rung counted them, a
     * list that was comfortable this morning would be a paged one by the
     * afternoon because the reader had been working — and it would change on the
     * very press that answered a question.
     */
    expect(climb(SIZES.large, [SHORT, MEDIUM, LONG].map(worked)).rung).toBe('list')
    expect(climb(SIZES.large, [SHORT, MEDIUM, LONG]).rung).toBe('list')
  })

  test('answering CAN drop one whole question to its parts, and that is on purpose', () => {
    /*
     * The other side of the same coin, and the one place in `room.ts` where the
     * layout moves under a press. `Asked.why` is null until the reader chooses,
     * because the server withholds it, so the explanation's height cannot be
     * known in advance and is not reserved. When it arrives the card is genuinely
     * taller — and `App` moves to the `question` part, which is exactly where the
     * verdict and the explanation are drawn.
     */
    const box = { width: 220, height: 300 }
    expect(climb(box, [SHORT, MEDIUM], 0).rung).toBe('one')
    const wordy =
      'A host that says nothing leaves the module to guess, and a guess about permission is the one guess '
      + 'that cannot be made safely, which is why the protocol requires an answer in words rather than silence.'
    expect(climb(box, [card({ ...SHORT, answered: true, why: wordy }), MEDIUM], 0).rung).toBe('part')
  })
})

describe('which parts a question splits into', () => {
  test('a question that fits the header does not get a chip leading to itself', () => {
    /* The header above every part clamps to two lines. Where the whole question
       is inside that clamp, a `question` chip leads to a screen the reader is
       already looking at — a chip they press once and distrust afterwards. */
    expect(partsOf(SHORT, 900, roughly)).toEqual(['options', 'quote'])
  })

  test('a question longer than the clamp gets one', () => {
    expect(partsOf(LONG, 220, roughly)).toEqual(['question', 'options', 'quote'])
  })

  test('and so does an answered one, however short, because the verdict lives there', () => {
    expect(partsOf(card({ answered: true }), 900, roughly)).toEqual(['question', 'options', 'quote'])
  })

  test('the same question splits differently in a narrower column', () => {
    /* Two lines at 900 and five at 220 is not a different question; it is the
       same one wrapped, and the chip appears exactly where the clamp begins
       hiding something. */
    expect(partsOf(MEDIUM, 900, roughly)).toEqual(['options', 'quote'])
    expect(partsOf(MEDIUM, 220, roughly)).toEqual(['question', 'options', 'quote'])
  })
})
