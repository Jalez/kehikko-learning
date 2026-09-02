import { describe, expect, test } from 'bun:test'

import { aimNote, aimOf, aimOffer, inFront, inFrontOf, showing, whyEmpty, type Shown } from '../src/wire/aim.ts'

/**
 * The consumer rule, as a table of canvases.
 *
 * The protocol's essay on `context.containers` states it once: nothing picked
 * out means everything — the passage and the union of what every container
 * shows; some picked out means only what those show. `wire/aim.ts` argues for
 * following it as written where the sibling notes module deviated, and for
 * one reading it leaves open (a canvas showing nothing at all). Every row here
 * is one of those sentences made concrete, plus the two things a consumer
 * owes a person: a way to turn the narrowing off, and a reason when it
 * empties the pane.
 */

const SELF = 'roadmap.learning'
const PROJECT = '/Users/somebody/Projects/thesis'
const PAPER = `${PROJECT}/.kehikot/paper/thesis`
const CH1 = `${PAPER}/chapters/1_introduction.tex`
const CH3 = `${PAPER}/chapters/3_methods.tex`

const place = (path: string, from: number | null = null, to: number | null = null) => ({ path, from, to })
const container = (module: string, selected: boolean, documents: ReturnType<typeof place>[] = []): Shown => ({
  module,
  selected,
  documents,
})

/** The questions, anchored the way the store spells them — relative to the project. */
const ask = (id: string, path: string, anchor: 'holds' | 'missing' = 'holds') => ({
  id,
  anchor,
  passage: { path, start: 10, end: 20, quote: 'words' },
})
const QUESTIONS = [
  ask('q1', '.kehikot/paper/thesis/chapters/1_introduction.tex'),
  ask('q3a', '.kehikot/paper/thesis/chapters/3_methods.tex'),
  ask('q3b', '.kehikot/paper/thesis/chapters/3_methods.tex'),
  ask('q5', '.kehikot/paper/thesis/chapters/5_discussion.tex'),
]
const ids = (rows: { id: string }[]) => rows.map((row) => row.id)

describe('what is in front, by the protocol’s rule', () => {
  test('an older host lists no containers, so everything is in front and nothing is offered', () => {
    const front = inFrontOf({ self: SELF, passage: null, containers: [], aim: 'follow' })
    expect(front.everything).toBe(true)
    expect(front.narrowed).toBe(false)
    expect(aimOffer([])).toEqual([])
    expect(ids(inFront(QUESTIONS, PROJECT, front).shown)).toEqual(['q1', 'q3a', 'q3b', 'q5'])
  })

  test('nothing picked out: the union of what every container shows, which NARROWS this module', () => {
    /* The reading the owner asked for in so many words — "by default it only
       lists the questions related to the text OR chapter that is shown in a
       paper" — and the reason this module keeps the union where notes did
       not: its resting state is the whole epic, and the union is smaller. */
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container('roadmap.paper', false, [place(CH3)]), container('roadmap.journeys', false), container(SELF, false)],
      aim: 'follow',
    })
    expect(front.everything).toBe(false)
    expect(front.narrowed).toBe(false)
    expect(front.documents.map((one) => one.path)).toEqual([CH3])
    expect(ids(inFront(QUESTIONS, PROJECT, front).shown)).toEqual(['q3a', 'q3b'])
  })

  test('nothing picked out and nothing shown anywhere: the whole epic, not an empty pane', () => {
    /* The one case the rule leaves open. Literally nothing is in front; a pane
       emptied by silence has no cause a person could see or undo, so this
       module answers as the checklist does for the same case. */
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container('roadmap.paper', false), container('roadmap.journeys', false)],
      aim: 'follow',
    })
    expect(front.everything).toBe(true)
    expect(ids(inFront(QUESTIONS, PROJECT, front).shown)).toHaveLength(4)
    expect(whyEmpty(front, 4, 0)).toBeNull()
  })

  test('the reader’s own passage leads when nothing is picked out', () => {
    const front = inFrontOf({
      self: SELF,
      passage: place(CH1, 100, 200),
      containers: [container('roadmap.paper', false, [place(CH3)])],
      aim: 'follow',
    })
    expect(front.documents.map((one) => one.path)).toEqual([CH1, CH3])
    expect(ids(inFront(QUESTIONS, PROJECT, front).shown)).toEqual(['q1', 'q3a', 'q3b'])
  })

  test('one container picked out: only what it shows, and not the passage unless it shows that too', () => {
    const front = inFrontOf({
      self: SELF,
      passage: place(CH1),
      containers: [container('roadmap.paper', true, [place(CH3)]), container('roadmap.notes', false, [place(CH1)])],
      aim: 'follow',
    })
    expect(front.narrowed).toBe(true)
    expect(front.picked).toEqual(['roadmap.paper'])
    expect(front.documents.map((one) => one.path)).toEqual([CH3])
    expect(ids(inFront(QUESTIONS, PROJECT, front).shown)).toEqual(['q3a', 'q3b'])
  })

  test('two picked out: the union of what those two show', () => {
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [
        container('roadmap.paper', true, [place(CH3)]),
        container('roadmap.notes', true, [place(CH1)]),
        container('roadmap.references', false, [place(`${PAPER}/chapters/5_discussion.tex`)]),
      ],
      aim: 'follow',
    })
    expect(front.picked).toEqual(['roadmap.paper', 'roadmap.notes'])
    expect(ids(inFront(QUESTIONS, PROJECT, front).shown)).toEqual(['q1', 'q3a', 'q3b'])
  })

  test('a picked-out container showing nothing empties the pane, and the pane says which one', () => {
    /* A journeys pane picked out on its own shows a step and no document. This
       module does not guess which chapter a step is about. */
    const front = inFrontOf({
      self: SELF,
      passage: place(CH3),
      containers: [container('roadmap.journeys', true), container('roadmap.paper', false, [place(CH3)])],
      aim: 'follow',
    })
    expect(front.narrowed).toBe(true)
    expect(front.quiet).toEqual(['roadmap.journeys'])
    expect(inFront(QUESTIONS, PROJECT, front).shown).toEqual([])
    expect(whyEmpty(front, 4, 0)).toEqual({
      said: 'journeys is picked out and shows no document, so there is nothing here for a question to be about.',
      remedy: 'Untick a container, pick out one that shows a document, or set this container’s aim to everything on this kehikko.',
    })
  })

  test('nothing picked out and nothing shown that any question is about: the remedy is a document, not a tick', () => {
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container('roadmap.paper', false, [place(`${PAPER}/main.tex`)])],
      aim: 'follow',
    })
    expect(inFront(QUESTIONS, PROJECT, front).shown).toEqual([])
    expect(whyEmpty(front, 4, 0)).toEqual({
      said: 'Nothing on this kehikko is showing a document any of the 4 questions here is about.',
      remedy: 'Open one of their documents on this kehikko, or set this container’s aim to everything on this kehikko.',
    })
  })

  test('a picked-out container showing a document nothing here is about says so, and names the quiet one', () => {
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [
        container('roadmap.paper', true, [place(`${PAPER}/main.tex`)]),
        container('roadmap.journeys', true),
      ],
      aim: 'follow',
    })
    expect(inFront(QUESTIONS, PROJECT, front).shown).toEqual([])
    expect(whyEmpty(front, 4, 0)?.said).toBe(
      'paper and journeys are picked out; none of the 4 questions here is about what they show. journeys shows no document.',
    )
  })

  test('the aim turned off: everything, whatever is picked', () => {
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container('roadmap.journeys', true)],
      aim: 'all',
    })
    expect(front.everything).toBe(true)
    expect(ids(inFront(QUESTIONS, PROJECT, front).shown)).toHaveLength(4)
  })

  test('matched by document and never by range — the scope group owns the range', () => {
    /* A paper pointing at one paragraph of chapter three is showing chapter
       three; a tick on it must not narrow to the paragraph, because the
       reader's grain is the `scope` control beside this one. */
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container('roadmap.paper', true, [place(CH3, 5000, 5100)])],
      aim: 'follow',
    })
    expect(ids(inFront(QUESTIONS, PROJECT, front).shown)).toEqual(['q3a', 'q3b'])
  })
})

describe('this container’s own row', () => {
  test('is never read back, so what it says it shows cannot widen what it shows', () => {
    /* The loop: this module says "chapter three", the host echoes it in the
       next context, and a union that read it would hold chapter three beside
       whatever the paper moved to — forever. */
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container(SELF, false, [place(CH3)]), container('roadmap.paper', false, [place(CH1)])],
      aim: 'follow',
    })
    expect(front.documents.map((one) => one.path)).toEqual([CH1])
  })

  test('picked out alone, it narrows nothing — narrowing to what you show is a sentence with no content', () => {
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container(SELF, true, [place(CH3)]), container('roadmap.paper', false, [place(CH1)])],
      aim: 'follow',
    })
    expect(front.narrowed).toBe(false)
    expect(front.picked).toEqual([])
    expect(front.documents.map((one) => one.path)).toEqual([CH1])
  })
})

describe('a question whose anchor does not resolve', () => {
  const ROTTEN = [ask('r1', 'chapters/1_introduction.tex', 'missing'), ask('r3', 'chapters/3_methods.tex', 'missing')]

  test('is reported when everything is in front, and never hidden by the union', () => {
    const front = inFrontOf({ self: SELF, passage: null, containers: [], aim: 'follow' })
    const out = inFront([...QUESTIONS, ...ROTTEN], PROJECT, front)
    expect(ids(out.shown)).toContain('r1')
    expect(out.unresolved).toBe(2)
  })

  test('can never be in front of a shown document, and the empty sentence says so rather than blaming the paper', () => {
    /* `<project>/chapters/3_methods.tex` is not `<project>/.kehikot/paper/thesis/chapters/3_methods.tex`,
       and this module must not decide for itself that they are one file. */
    const front = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container('roadmap.paper', true, [place(CH3)])],
      aim: 'follow',
    })
    const out = inFront(ROTTEN, PROJECT, front)
    expect(out.shown).toEqual([])
    expect(out.unresolved).toBe(2)
    expect(whyEmpty(front, 2, 2)).toEqual({
      said:
        'paper is picked out; none of the 2 questions here is about what it shows. All of them are anchored to documents '
        + 'that are not in this project, so they cannot be in front of anything until re-anchored.',
      /* The remedy follows the cause: no tick will bring these back. */
      remedy: 'An agent re-anchors them with reword_quiz. Until then, set this container’s aim to everything on this kehikko to see them.',
    })
  })

  test('is never told to the canvas as something this container is showing', () => {
    expect(showing([...QUESTIONS, ...ROTTEN], PROJECT, 16).map((one) => one.path)).toEqual([
      CH1,
      CH3,
      `${PAPER}/chapters/5_discussion.tex`,
    ])
  })
})

describe('what this container tells the canvas it is showing', () => {
  test('one place per document, by path, with no range and no quote', () => {
    expect(showing(QUESTIONS, PROJECT, 16)).toEqual([
      { path: CH1, page: null, from: null, to: null, quoted: '' },
      { path: CH3, page: null, from: null, to: null, quoted: '' },
      { path: `${PAPER}/chapters/5_discussion.tex`, page: null, from: null, to: null, quoted: '' },
    ])
  })

  test('bounded by the wire’s limit, and nothing with no project to spell a path against', () => {
    expect(showing(QUESTIONS, PROJECT, 2)).toHaveLength(2)
    expect(showing(QUESTIONS, null, 16)).toEqual([])
  })
})

describe('the offer and the note', () => {
  test('is worded the way the sibling modules word it, with the count in the label', () => {
    expect(aimOffer([container('roadmap.paper', true), container('roadmap.journeys', false)])).toEqual([
      {
        id: 'aim',
        label: 'aim',
        options: [
          { id: 'follow', label: 'follow what is picked out (1 of 2 picked out)' },
          { id: 'all', label: 'everything on this kehikko' },
        ],
        fallback: 'follow',
      },
    ])
    expect(aimOffer([container('roadmap.paper', false)])[0]?.options[0]?.label).toBe(
      'follow what is picked out (nothing picked out)',
    )
  })

  test('the choice is read leniently: only `all` turns it off', () => {
    expect(aimOf({ aim: 'all' })).toBe('all')
    expect(aimOf({ aim: 'follow' })).toBe('follow')
    expect(aimOf({ aim: 'something-from-a-later-version' })).toBe('follow')
    expect(aimOf({})).toBe('follow')
    expect(aimOf(null)).toBe('follow')
  })

  test('a narrowed list with questions still in it says how many it is not showing', () => {
    const picked = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container('roadmap.paper', true, [place(CH3)])],
      aim: 'follow',
    })
    expect(aimNote(picked, 2)).toEqual({
      full: '2 more questions about documents paper is not showing',
      brief: '+2 elsewhere',
    })
    const union = inFrontOf({
      self: SELF,
      passage: null,
      containers: [container('roadmap.paper', false, [place(CH3)])],
      aim: 'follow',
    })
    expect(aimNote(union, 1)?.full).toBe('1 more question about documents nothing here is showing')
    expect(aimNote(union, 0)).toBeNull()
  })
})
