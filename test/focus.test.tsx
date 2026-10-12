import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, renderHook } from '@testing-library/react'

import { partsDeclaration, type EpicPart } from 'kehikot-module-protocol'
import { useFocus } from 'kehikot-module-protocol/client/react'

import { MANIFEST } from '../manifest.ts'
import { NOUN, anchorOf, inHand, standingOn, stillOn } from '../src/wire/focus.ts'
import type { Anchored } from '../src/wire/pointed.ts'

/**
 * The parts focus: which questions a ticked part leaves, that the question in
 * the reader's hands stays, and the one sentence for a pane the picks emptied.
 * The rule itself is the protocol's and is tested there; this is what
 * anchors a question.
 */

afterEach(cleanup)

const PROJECT = '/Users/somebody/proj'
const PAPER = '.kehikot/paper/thesis'

const ask = (id: string, path: string | null, status: 'holds' | 'unreadable' = 'holds'): Anchored => ({
  id,
  source: path === null ? null : { label: '1', path, quote: 'words', status, at: null, count: 0 },
})

const QUESTIONS = [
  ask('intro-1', `${PAPER}/chapters/1_introduction.tex`),
  ask('intro-2', `${PAPER}/chapters/1_introduction.tex`),
  ask('methods-1', `${PAPER}/chapters/3_methods.tex`),
  ask('main-1', `${PAPER}/main.tex`),
  ask('unsourced', null),
  ask('gone', `${PAPER}/chapters/3_methods.tex`, 'unreadable'),
  ask('elsewhere', '.kehikot/paper/another/chapters/1_introduction.tex'),
]

const parts = (...picked: string[]): EpicPart[] => [
  { id: 'intro', heading: 'Introduction', refs: [], picked: picked.includes('intro'), files: ['chapters/1_introduction.tex'] },
  { id: 'methods', heading: 'Methods', refs: [], picked: picked.includes('methods'), files: ['chapters/3_methods.tex'] },
]

function narrowed(picked: string[], held: string | null = null, questions = QUESTIONS) {
  const { result } = renderHook(() => useFocus({ parts: parts(...picked), epic: 'thesis' }))
  return result.current.narrow(questions, anchorOf(PROJECT), { noun: NOUN, keep: (one) => one.id === held })
}
const ids = (list: readonly Anchored[]) => list.map((one) => one.id)

describe('which questions the ticked parts leave', () => {
  test('nothing ticked: every question, and nothing to say', () => {
    const out = narrowed([])
    expect(out.shown).toEqual(QUESTIONS)
    expect(out).toMatchObject({ outside: 0 })
    expect(out.empty).toBe('')
  })

  test('one part: the questions whose source is a file it owns; the rest are counted', () => {
    const out = narrowed(['intro'])
    expect(ids(out.shown)).toEqual(['intro-1', 'intro-2'])
    expect(out.outside).toBe(5)
  })

  test('main.tex, no source and another epic’s paper are outside every focus; an unreadable file is still its part’s', () => {
    const out = narrowed(['intro', 'methods'])
    expect(ids(out.shown)).toEqual(['intro-1', 'intro-2', 'methods-1', 'gone'])
    expect(out.outside).toBe(3)
  })

  test('the question the reader is on stays, in its place, and is still counted outside', () => {
    const out = narrowed(['intro'], 'methods-1')
    expect(ids(out.shown)).toEqual(['intro-1', 'intro-2', 'methods-1'])
    expect(out).toMatchObject({ outside: 5, kept: 1 })
    expect(standingOn(out.shown, 'methods-1')).toBe(2)
  })

  test('where the reader stands follows the question; on none, the top', () => {
    expect(standingOn(narrowed(['intro', 'methods']).shown, 'methods-1')).toBe(2)
    expect(standingOn(narrowed(['intro']).shown, 'methods-1')).toBe(0)
    expect(standingOn(narrowed(['intro']).shown, null)).toBe(0)
  })

  test('whether their question is still shown is told apart from being at the top', () => {
    expect(stillOn(narrowed(['intro', 'methods']).shown, 'methods-1')).toBe(2)
    expect(stillOn(narrowed(['intro']).shown, 'intro-1')).toBe(0)
    expect(stillOn(narrowed(['intro']).shown, 'methods-1')).toBeNull()
    expect(stillOn(narrowed(['intro']).shown, null)).toBeNull()
  })
})

describe('what a change of ticks may not take away', () => {
  test('the question that is merely on screen is not in anybody’s hands, so a tick moves the pane', () => {
    expect(inHand({ answering: null, on: 'methods-1', part: 'options' })).toBeNull()
    expect(inHand({ answering: null, on: null, part: 'options' })).toBeNull()
  })

  test('one they opened a piece of is, and so is one whose answer is on its way — at any rung', () => {
    expect(inHand({ answering: null, on: 'methods-1', part: 'why' })).toBe('methods-1')
    expect(inHand({ answering: null, on: 'methods-1', part: 'question' })).toBe('methods-1')
    expect(inHand({ answering: 'intro-2', on: null, part: 'options' })).toBe('intro-2')
    expect(inHand({ answering: 'intro-2', on: 'methods-1', part: 'why' })).toBe('intro-2')
  })

  test('left out by the new ticks and not held: the reader is at the top of the new list', () => {
    const { shown } = narrowed(['intro'], inHand({ answering: null, on: 'methods-1', part: 'options' }))
    expect(ids(shown)).toEqual(['intro-1', 'intro-2'])
    expect(standingOn(shown, 'methods-1')).toBe(0)
  })
})

describe('what the page says about the picked parts', () => {
  test('one sentence, the protocol’s, and only when they are what emptied the pane', () => {
    const none = narrowed(['methods'], null, QUESTIONS.slice(0, 2))
    expect(none.shown).toEqual([])
    expect(none.empty).toBe('No question is in the picked part.')
    expect(narrowed(['methods', 'intro'], null, []).empty).toBe('')
    /* Two parts picked, said in their own number. */
    const elsewhere: EpicPart[] = ['a', 'b'].map((id) => ({ id, heading: id, refs: [], picked: true, files: ['chapters/9_nowhere.tex'] }))
    const { result } = renderHook(() => useFocus({ parts: elsewhere, epic: 'thesis' }))
    expect(result.current.narrow(QUESTIONS, anchorOf(PROJECT), { noun: NOUN }).empty).toBe('No question is in the picked parts.')
    /* The aim or the scope had already left nothing: theirs to say. */
    expect(narrowed(['methods'], null, []).empty).toBe('')
    /* Questions on screen: nothing is said about the ones that are not. */
    expect(narrowed(['intro']).empty).toBe('')
  })

  test('the same sentence from a host that sends a part’s documents', () => {
    const documents: EpicPart[] = [{ id: 'methods', heading: 'Methods', refs: [], picked: true, documents: ['.kehikot/paper/thesis/chapters/3_methods.tex'], files: [] }]
    const { result } = renderHook(() => useFocus({ parts: documents, epic: 'thesis', projectPath: PROJECT }))
    const out = result.current.narrow(QUESTIONS.slice(0, 2), anchorOf(PROJECT), { noun: NOUN })
    expect(out.shown).toEqual([])
    expect(out.empty).toBe('No question is in the picked part.')
  })
})

test('the manifest says it follows the parts', () => {
  expect(MANIFEST.reacts).toContain('parts')
  expect(partsDeclaration(MANIFEST)).toEqual([])
})
