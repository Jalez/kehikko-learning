import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, renderHook } from '@testing-library/react'

import { FOCUS_WHERE, partsDeclaration, type EpicPart } from 'kehikot-module-protocol'
import { useFocus } from 'kehikot-module-protocol/client/react'

import { MANIFEST } from '../manifest.ts'
import { anchorOf, focusNote, standingOn, whyUnfocused } from '../src/wire/focus.ts'
import type { Anchored } from '../src/wire/pointed.ts'

/**
 * The parts focus: which questions a ticked part leaves, how many it does
 * not, what the page says, and that the question in the reader's hands stays.
 * The rule itself is the protocol's and is tested there; this is what
 * anchors a question, and the note.
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
  return result.current.narrow(questions, anchorOf(PROJECT), { noun: 'question', keep: (one) => one.id === held })
}
const ids = (list: readonly Anchored[]) => list.map((one) => one.id)

describe('which questions the ticked parts leave', () => {
  test('nothing ticked: every question, and nothing to say', () => {
    const out = narrowed([])
    expect(out.shown).toEqual(QUESTIONS)
    expect(out).toMatchObject({ outside: 0, sentence: '' })
    expect(focusNote(out, null, 0)).toBeNull()
    const scope = { full: '3 more questions about other documents', brief: '+3 elsewhere' }
    expect(focusNote(out, scope, 3)).toBe(scope)
    expect(whyUnfocused(out, 0, 7)).toBeNull()
  })

  test('one part: the questions whose source is a file it owns; the rest are counted', () => {
    const out = narrowed(['intro'])
    expect(ids(out.shown)).toEqual(['intro-1', 'intro-2'])
    expect(out.outside).toBe(5)
    expect(out.sentence).toBe('5 questions outside the picked part (Introduction).')
  })

  test('main.tex, no source and another epic’s paper are outside every focus; an unreadable file is still its part’s', () => {
    const out = narrowed(['intro', 'methods'])
    expect(ids(out.shown)).toEqual(['intro-1', 'intro-2', 'methods-1', 'gone'])
    expect(out.sentence).toBe('3 questions outside the 2 picked parts (Introduction, Methods).')
  })

  test('the question the reader is on stays, in its place, and is still counted outside', () => {
    const out = narrowed(['intro'], 'methods-1')
    expect(ids(out.shown)).toEqual(['intro-1', 'intro-2', 'methods-1'])
    expect(out).toMatchObject({ outside: 5, kept: 1 })
    expect(standingOn(out.shown, 'methods-1')).toBe(2)
    expect(focusNote(out, null, 0)?.full).toBe(
      '5 questions outside the picked part (Introduction). The one you are on is among them, and stays until you leave it.',
    )
  })

  test('where the reader stands follows the question; on none, the top', () => {
    expect(standingOn(narrowed(['intro', 'methods']).shown, 'methods-1')).toBe(2)
    expect(standingOn(narrowed(['intro']).shown, 'methods-1')).toBe(0)
    expect(standingOn(narrowed(['intro']).shown, null)).toBe(0)
  })
})

describe('the note', () => {
  test('alone: the sentence, a short form, and where the control is', () => {
    expect(focusNote(narrowed(['intro']), null, 0)).toEqual({
      full: '5 questions outside the picked part (Introduction).',
      brief: '5 outside parts',
      where: FOCUS_WHERE,
    })
  })

  test('zero outside is still said', () => {
    expect(focusNote(narrowed(['intro'], null, QUESTIONS.slice(0, 2)), null, 0)?.full).toBe(
      '0 questions outside the picked part (Introduction).',
    )
  })

  test('after the scope’s or the aim’s: both sentences, and one short count of everything not on screen', () => {
    const note = focusNote(narrowed(['intro'], 'methods-1'), { full: '3 more questions about other documents', brief: '+3 elsewhere' }, 3)
    expect(note?.full).toStartWith('3 more questions about other documents. 5 questions outside the picked part (Introduction).')
    expect(note?.brief).toBe('+7 elsewhere')
  })

  test('the empty screen says the parts emptied it only when they did', () => {
    const none = narrowed(['methods'], null, QUESTIONS.slice(0, 2))
    expect(whyUnfocused(none, 0, 2)).toEqual({
      said: 'No question here is in the picked parts. 2 questions outside the picked part (Methods).',
      remedy: FOCUS_WHERE,
    })
    expect(whyUnfocused(none, 0, 0)).toBeNull()
    expect(whyUnfocused(narrowed(['intro']), 2, 7)).toBeNull()
  })
})

test('the manifest says it follows the parts', () => {
  expect(MANIFEST.reacts).toContain('parts')
  expect(partsDeclaration(MANIFEST)).toEqual([])
})
