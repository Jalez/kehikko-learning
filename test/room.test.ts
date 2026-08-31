import { describe, expect, test } from 'bun:test'

import { room } from '../src/view/room.ts'

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
