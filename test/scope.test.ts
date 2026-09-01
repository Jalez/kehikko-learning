import { describe, expect, test } from 'bun:test'
import { filtersSchema, type Passage as Pointing } from 'roadmap-module-protocol'

import { hiddenNote, narrow, offer, reachOf, scopeOf, SCOPE } from '../src/wire/scope.ts'
import type { Anchored } from '../src/wire/pointed.ts'

/**
 * The scope offer, as a table.
 *
 * Everything here is a pure function of values the page already holds, which is
 * the same reason `wire/pointed.ts` and `view/room.ts` are files: "a canvas with
 * nothing pointed at offers nothing" and "a stored rung that has gone away
 * degrades to `all` rather than emptying the container" are assertions, and the
 * alternative to asserting them is driving a browser and reading a menu.
 */

const PROJECT = '/Users/somebody/Projects/roadmap'
const BRIDGE = 'data/papers/modes-are-modules/chapters/bridge.tex'
const AGENTS = 'data/papers/modes-are-modules/chapters/agents.tex'

const ask = (id: string, path: string, start: number, end: number): Anchored => ({
  id,
  passage: { path, start, end, quote: 'whatever it happened to say' },
})

const QUESTIONS = [
  ask('a', BRIDGE, 1000, 1200),
  ask('b', BRIDGE, 4000, 4200),
  ask('c', AGENTS, 1000, 1200),
]

const at = (path: string, from: number | null, to: number | null): Pointing => ({
  path: `${PROJECT}/${path}`,
  page: null,
  from,
  to,
  quoted: '',
})

describe('what can be narrowed by, given where the canvas is standing', () => {
  test('a canvas pointing at nothing offers nothing at all', () => {
    /* An empty offer is a real message — "nothing here can be narrowed now" —
       and the host takes the control away. The alternative is a group whose only
       option is `all`, which is a menu with one item in it and a press that
       cannot change anything. */
    expect(offer(reachOf(PROJECT, null))).toEqual([])
    expect(offer(reachOf(null, at(BRIDGE, 10, 20)))).toEqual([])
  })

  test('a document, but no selection, offers everywhere and this document', () => {
    const groups = offer(reachOf(PROJECT, at(BRIDGE, null, null)))
    expect(groups.map((group) => group.id)).toEqual([SCOPE])
    expect(groups[0]?.options.map((option) => option.id)).toEqual(['all', 'file'])
  })

  test('a selection adds the passage rung, and only then', () => {
    /* The rule the whole offer is built on: an option that cannot be honoured
       must not be in it. `this passage` on a canvas where nobody has highlighted
       anything is a control that either hides everything or nothing, decided by
       a comparison this module cannot make. */
    const groups = offer(reachOf(PROJECT, at(BRIDGE, 1050, 1100)))
    expect(groups[0]?.options.map((option) => option.id)).toEqual(['all', 'file', 'section'])
  })

  test('everywhere is always the fallback, so a host has one press that puts it all back', () => {
    for (const passage of [at(BRIDGE, null, null), at(BRIDGE, 1050, 1100)]) {
      expect(offer(reachOf(PROJECT, passage))[0]?.fallback).toBe('all')
    }
  })

  test('the offer is something the protocol will actually take', () => {
    /* A stale protocol copy STRIPS what it has never heard of and `parse` does
       not complain, so this is checked against the installed schema rather than
       against a shape written out here by hand. */
    for (const passage of [at(BRIDGE, null, null), at(BRIDGE, 1050, 1100)]) {
      const groups = offer(reachOf(PROJECT, passage))
      expect(filtersSchema.safeParse({ type: 'roadmap.filters', groups }).success).toBe(true)
    }
  })

  test('there is no page rung, and the absence is the decision', () => {
    /* `kehikko-paper` does publish a page and this module cannot honour one: a
       question is anchored by a path and a byte range, and nothing here has ever
       opened the file. See the essay in `wire/scope.ts`. */
    const ids = offer(reachOf(PROJECT, at(BRIDGE, 1050, 1100)))[0]?.options.map((option) => option.id) ?? []
    expect(ids).not.toContain('page')
  })
})

describe('which rung the reader is on', () => {
  const wide = reachOf(PROJECT, at(BRIDGE, 1050, 1100))

  test('what the host says, when this context can honour it', () => {
    expect(scopeOf({ [SCOPE]: 'file' }, wide)).toBe('file')
    expect(scopeOf({ [SCOPE]: 'section' }, wide)).toBe('section')
  })

  test('nothing chosen is everywhere', () => {
    expect(scopeOf({}, wide)).toBe('all')
  })

  test('a rung this version does not know is everywhere, and that is required rather than defensive', () => {
    /* The host reconciles a stored choice against what a module offers, and it
       cannot do that before the module has offered anything — the greeting goes
       out first. So the first choice this page ever receives may name a rung from
       a version of itself that no longer exists. */
    expect(scopeOf({ [SCOPE]: 'chapter' }, wide)).toBe('all')
    expect(scopeOf({ somebodyElse: 'file' }, wide)).toBe('all')
  })

  test('a selection that has gone away drops to the document, not to nothing', () => {
    /* A reader who set `this passage` and then cleared their highlight is not
       asking for an empty container. The host keeps the choice, so it comes back
       the moment they highlight something again. */
    expect(scopeOf({ [SCOPE]: 'section' }, reachOf(PROJECT, at(BRIDGE, null, null)))).toBe('file')
  })

  test('and a canvas pointing at nothing drops all the way to everywhere', () => {
    expect(scopeOf({ [SCOPE]: 'file' }, reachOf(PROJECT, null))).toBe('all')
  })
})

describe('what the scope leaves on screen', () => {
  test('everywhere is every question, and is what a page with no host gets', () => {
    expect(narrow(QUESTIONS, PROJECT, at(BRIDGE, 1050, 1100), 'all').map((q) => q.id)).toEqual(['a', 'b', 'c'])
    expect(narrow(QUESTIONS, null, null, 'file').map((q) => q.id)).toEqual(['a', 'b', 'c'])
  })

  test('this document keeps the questions written about the document being pointed at', () => {
    /* Which document is read off the context every time and never stored — the
       whole grain-not-place discipline in one assertion, because the same stored
       `file` gives two different answers here. */
    expect(narrow(QUESTIONS, PROJECT, at(BRIDGE, null, null), 'file').map((q) => q.id)).toEqual(['a', 'b'])
    expect(narrow(QUESTIONS, PROJECT, at(AGENTS, null, null), 'file').map((q) => q.id)).toEqual(['c'])
  })

  test('this passage keeps the questions whose anchor the selection touches', () => {
    /* Overlap, not containment: somebody who selects one sentence of a paragraph
       a question was written about is standing in that question's passage. */
    expect(narrow(QUESTIONS, PROJECT, at(BRIDGE, 1100, 1150), 'section').map((q) => q.id)).toEqual(['a'])
    expect(narrow(QUESTIONS, PROJECT, at(BRIDGE, 900, 5000), 'section').map((q) => q.id)).toEqual(['a', 'b'])
  })

  test('a range that touches nothing keeps nothing, rather than quietly widening', () => {
    /* The container says so in its own words instead — see `hiddenNote`. A
       narrowing that silently gave up would be a control that does nothing on
       some paragraphs and something on others. */
    expect(narrow(QUESTIONS, PROJECT, at(BRIDGE, 2000, 3000), 'section')).toEqual([])
  })

  test('a range that only abuts an anchor is outside it', () => {
    /* Ends are exclusive at both ends, which is how the store writes them and how
       the protocol describes `to`. */
    expect(narrow(QUESTIONS, PROJECT, at(BRIDGE, 1200, 1300), 'section')).toEqual([])
    expect(narrow(QUESTIONS, PROJECT, at(BRIDGE, 900, 1000), 'section')).toEqual([])
  })

  test('the document is compared as the host spells it, root and all', () => {
    /* A question's path is project-relative and a passage on the wire is
       absolute. One join, used in both directions — see `pointingAt`. A raw
       relative path from a host would match nothing rather than matching wrongly. */
    const relative: Pointing = { path: BRIDGE, page: null, from: null, to: null, quoted: '' }
    expect(narrow(QUESTIONS, PROJECT, relative, 'file')).toEqual([])
  })
})

describe('what the page says about the questions it is not showing', () => {
  test('nothing hidden says nothing', () => {
    expect(hiddenNote('file', 0)).toBeNull()
    expect(hiddenNote('all', 7)).toBeNull()
  })

  test('the long form says what it is a count of, and the short one fits a row of controls', () => {
    expect(hiddenNote('file', 3)?.full).toBe('3 more questions about other documents')
    expect(hiddenNote('section', 3)?.full).toBe('3 more questions outside this passage')
    expect(hiddenNote('section', 3)?.brief).toBe('+3 elsewhere')
  })

  test('one question is one question', () => {
    expect(hiddenNote('file', 1)?.full).toBe('1 more question about other documents')
  })
})
