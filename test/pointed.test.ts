import { describe, expect, test } from 'bun:test'

import { documentOf, keyOf, pointedQuestion, pointingAt, sourceLabel } from '../src/wire/pointed.ts'
import type { Cited } from '../quiz/types.ts'

/**
 * The two directions of one join, asserted without a browser.
 *
 * Out: a question's project-relative anchor becomes the absolute passage a host
 * can broadcast. Back: an absolute passage arriving from the canvas becomes the
 * id of the question it names. They have to be the same join read both ways, and
 * the failure when they are not is quiet — a press that points the canvas
 * correctly and then fails to mark the card that did it, which looks like the
 * mark being broken rather than the paths disagreeing.
 *
 * `dev/pointing.mjs` is the other half and cannot be this: it counts what leaves
 * the frame, from where a host sits, and needs a running server and a browser.
 * This is the arithmetic.
 */

const PROJECT = '/Users/somebody/Projects/thesis'

/** A source as the store found it: the words, once, at these bytes. */
function anchored(path: string, from: number, to: number, quote = 'the words'): Cited {
  return { label: '1', path, quote, status: 'holds', at: { from, to, line: 1, endLine: 1 }, count: 1 }
}

describe('the passage a press publishes', () => {
  test('joins the project root onto the path the question was written with', () => {
    expect(pointingAt(PROJECT, anchored('chapters/agents.tex', 8140, 8402, 'A mode is a module.'))).toEqual({
      path: '/Users/somebody/Projects/thesis/chapters/agents.tex',
      page: null, section: null,
      from: 8140,
      to: 8402,
      quoted: 'A mode is a module.',
    })
  })

  test('a trailing slash on the root does not become a double slash', () => {
    /* A host is entitled to send either spelling and both name one directory.
       `//chapters` is a path that exists nowhere, and the passage would be
       broadcast to every module on the canvas before anybody noticed. */
    expect(pointingAt(`${PROJECT}/`, anchored('chapters/agents.tex', 1, 2))?.path).toBe(
      '/Users/somebody/Projects/thesis/chapters/agents.tex',
    )
  })

  test('a source that was not found has nothing to point at, and one with no readable file has no document', () => {
    /* The paper changed under the question: still about that document, with no
       range to stand on. The file gone: about nothing a canvas can show. */
    const adrift: Cited = { ...anchored('chapters/agents.tex', 0, 0), status: 'adrift', at: null, count: 0 }
    expect(pointingAt(PROJECT, adrift)).toBeNull()
    expect(documentOf(PROJECT, adrift)).toBe(`${PROJECT}/chapters/agents.tex`)
    expect(documentOf(PROJECT, { ...adrift, status: 'unreadable' })).toBeNull()
    expect(pointingAt(PROJECT, null)).toBeNull()
  })

  test('names no page, because this module has never opened the file', () => {
    /* `page` is a filter every consumer is entitled to trust. Invented here it
       would be computed from nothing. */
    expect(pointingAt(PROJECT, anchored('a.tex', 0, 1))?.page).toBeNull()
  })

  test('with no project path there is nothing honest to publish', () => {
    /* A relative path sent as a document identity is a claim every other module
       would resolve against its own root. */
    expect(pointingAt(null, anchored('chapters/agents.tex', 1, 2))).toBeNull()
  })
})

describe('the question the canvas is pointed at', () => {
  const questions = [
    { id: 'q1', source: anchored('chapters/agents.tex', 8140, 8402) },
    { id: 'q2', source: anchored('chapters/wire.tex', 10, 40) },
  ]

  const arriving = (path: string, from: number | null, to: number | null, quoted = 'the words') => ({
    path,
    page: null, section: null,
    from,
    to,
    quoted,
  })

  test('is the one whose anchor the passage names', () => {
    const live = arriving('/Users/somebody/Projects/thesis/chapters/wire.tex', 10, 40)
    expect(pointedQuestion(PROJECT, questions, live)).toBe('q2')
  })

  test('is the echo of this module’s own press, and that is the point rather than a bug', () => {
    /*
     * The trap two sibling modules fell into: publishing a passage makes the
     * host broadcast it back to every framed module including this one, so a
     * module that reacts to arriving passages reacts to its own. In notes that
     * collapsed the list; in the paper module it scrolled the reader.
     *
     * Here the reaction is to MARK the card the passage names, which on this
     * module's own echo is exactly the confirmation the press was made to
     * produce. So this asserts the echo is honoured rather than guarded — a
     * guard would suppress the whole feature.
     */
    const published = pointingAt(PROJECT, questions[0]!.source)!
    expect(pointedQuestion(PROJECT, questions, published)).toBe('q1')
  })

  test('is nothing when the passage names another document, or another range of this one', () => {
    expect(pointedQuestion(PROJECT, questions, arriving(`${PROJECT}/chapters/trust.tex`, 8140, 8402))).toBeNull()
    expect(pointedQuestion(PROJECT, questions, arriving(`${PROJECT}/chapters/wire.tex`, 11, 40))).toBeNull()
  })

  test('is nothing when a document is merely open with nothing selected in it', () => {
    /* Rung two of the passage field: a reader has this file open. That is not a
       claim about any question in it, and marking one would be answering a
       question nobody asked. */
    expect(pointedQuestion(PROJECT, questions, arriving(`${PROJECT}/chapters/wire.tex`, null, null, ''))).toBeNull()
  })

  test('is nothing when nothing is pointing at anything', () => {
    expect(pointedQuestion(PROJECT, questions, null)).toBeNull()
  })

  test('ignores the quote entirely, because a host may re-read it from the file', () => {
    /* The quote is the longest and least stable field on a passage. Comparing it
       would mean an anchor going stale silently un-marks a card that is in fact
       where the canvas is standing. */
    const live = arriving(`${PROJECT}/chapters/wire.tex`, 10, 40, 'something else entirely')
    expect(pointedQuestion(PROJECT, questions, live)).toBe('q2')
    expect(keyOf(live)).toBe(keyOf(arriving(`${PROJECT}/chapters/wire.tex`, 10, 40, '')))
  })

  test('is nothing with no project path, since no anchor can be spelled', () => {
    expect(pointedQuestion(null, questions, arriving(`${PROJECT}/chapters/wire.tex`, 10, 40))).toBeNull()
  })
})

describe('what the card says it came from', () => {
  const path = 'data/papers/modes-are-modules/chapters/agents.tex'

  test('the whole path where there is width for it', () => {
    expect(sourceLabel(path, 'path')).toBe(path)
  })

  test('the last segment where there is not — never wrong, only shorter', () => {
    expect(sourceLabel(path, 'file')).toBe('agents.tex')
  })

  test('a path with no directory in it is the same either way', () => {
    expect(sourceLabel('main.tex', 'file')).toBe('main.tex')
    expect(sourceLabel('main.tex', 'path')).toBe('main.tex')
  })
})
