import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { TICKET, answer as door } from '../doors.ts'
import { App } from '../src/app.tsx'

/**
 * The whole page against the real doors, walked through the ticks a person makes in the host's
 * bar: no part, one, another, two, none again — with the paper beside it saying what a paper
 * really says while that happens, which is the one file its caret is in and, once somebody else
 * has walked it to a passage, nothing new at all.
 *
 * Found in a real project: the questions followed the paper's one file and were then narrowed to
 * the parts, so two ticked parts showed one part's questions under `0 questions outside`, and a
 * paper that had gone quiet left this pane on the old chapter whatever was ticked.
 */

const realFetch = globalThis.fetch
const EPIC = 'thesis'
const PAPER = `.kehikot/paper/${EPIC}`
const WHY = 'Because the chapter says so, in so many words.'
const ASKED = {
  methods: ['What did the methods chapter measure first?', 'What did the methods chapter measure second?'],
  results: ['What did the results chapter report?'],
}
let dir = ''

const add = (question: string, file: string, quote: string) =>
  door('POST', '/mcp', new URLSearchParams(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'add_quiz',
      arguments: { project: dir, epic: EPIC, question, options: ['One thing', 'Another thing', 'A third thing'], answer: 1, why: WHY, path: `${PAPER}/chapters/${file}`, quote },
    },
  }, null)

beforeEach(() => {
  resetServerStanding()
  mailbox.forget?.()
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-follows-')))
  mkdirSync(join(dir, PAPER, 'chapters'), { recursive: true })
  writeFileSync(join(dir, PAPER, 'main.tex'), '\\include{chapters/3_methods}\n\\include{chapters/4_results}\n')
  writeFileSync(join(dir, PAPER, 'chapters', '3_methods.tex'), 'The methods chapter measured satisfaction first and confidence second.')
  writeFileSync(join(dir, PAPER, 'chapters', '4_results.tex'), 'The results chapter reported that satisfaction was above neutral.')
  add(ASKED.methods[0]!, '3_methods.tex', 'measured satisfaction first')
  add(ASKED.methods[1]!, '3_methods.tex', 'confidence second')
  add(ASKED.results[0]!, '4_results.tex', 'satisfaction was above neutral')
  const island = document.createElement('script')
  island.id = 'ticket'
  island.type = 'application/json'
  island.textContent = JSON.stringify(TICKET)
  document.body.appendChild(island)
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const at = new URL(String(url), 'http://127.0.0.1')
    const ticket = (init.headers as Record<string, string> | undefined)?.['x-module-ticket'] ?? null
    const said = door((init.method ?? 'GET').toUpperCase(), at.pathname, at.searchParams, init.body ? JSON.parse(String(init.body)) : null, ticket)
    return new Response(JSON.stringify(said?.body ?? null), { status: said?.status ?? 404 })
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
  document.getElementById('ticket')?.remove()
  document.documentElement.className = ''
  rmSync(dir, { recursive: true, force: true })
})

const parts = (...picked: string[]) => [
  { id: 'methods', heading: 'Methods', refs: [], picked: picked.includes('methods'), files: ['chapters/3_methods.tex'] },
  { id: 'results', heading: 'Results', refs: [], picked: picked.includes('results'), files: ['chapters/4_results.tex'] },
]
const file = (name: string) => `${dir}/${PAPER}/${name}`
const place = (name: string) => ({ path: file(name), page: null, from: null, to: null, quoted: '' })
/** A canvas with a paper on it showing `shown`, the passage on the same file, and these parts ticked. */
const canvas = (shown: string, picked: string[], selected = false, more: Record<string, unknown> = {}) => ({
  ...base(shown, picked, selected),
  ...more,
})
const base = (shown: string, picked: string[], selected: boolean) => ({
  project: 'thesis',
  projectPath: dir,
  epic: EPIC,
  theme: 'dark',
  parts: parts(...picked),
  passage: place(shown),
  containers: [
    { module: 'kehikot.paper', selected, showing: { refs: [], documents: [place(shown)] } },
    { module: 'kehikot.learning', selected: false, showing: { refs: [], documents: [] } },
  ],
})
const say = async (type: 'kehikot.hello' | 'kehikot.context', context: Record<string, unknown>) => {
  await act(async () => {
    window.postMessage(type === 'kehikot.hello' ? { type, protocol: 2, session: 's', state: null, context } : { type, protocol: 2, ...context }, '*')
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}
/** Which chapters' questions are drawn. */
const drawn = () => {
  const text = document.body.textContent ?? ''
  return {
    methods: ASKED.methods.filter((one) => text.includes(one)).length,
    results: ASKED.results.filter((one) => text.includes(one)).length,
  }
}
/** The one sentence an EMPTY pane says, or null. A pane with questions says nothing about the rest. */
const note = () => document.querySelector('[data-empty-note]')?.textContent ?? null
/** Whether anything on the page counts or names what is not shown. */
const announces = () => /outside the|picked part|elsewhere|more questions?\b|not narrowing|stays until/.test(document.body.textContent ?? '') || document.querySelector('[data-scope-note], [data-aim-note]') !== null

describe('the questions follow the ticked parts, whatever the paper beside them last said', () => {
  test('no part, one, another, two, none: each tick is that part’s questions, and no line counts the rest', async () => {
    render(<App />)
    /* Nothing ticked, the paper on a chapter: that chapter, as before. */
    await say('kehikot.hello', canvas('chapters/3_methods.tex', []))
    await waitFor(() => expect(drawn()).toEqual({ methods: 2, results: 0 }))

    await say('kehikot.context', canvas('chapters/3_methods.tex', ['methods']))
    expect(drawn()).toEqual({ methods: 2, results: 0 })
    expect([note(), announces()]).toEqual([null, false])

    /* The tick moves and the paper has not said anything new: a paper somebody else walked to a
       passage stays quiet until a person touches it. */
    await say('kehikot.context', canvas('chapters/3_methods.tex', ['results']))
    expect(drawn()).toEqual({ methods: 0, results: 1 })
    expect([note(), announces()]).toEqual([null, false])

    /* Two parts, and a paper showing both names the one file its caret is in. */
    await say('kehikot.context', canvas('chapters/4_results.tex', ['methods', 'results']))
    expect(drawn()).toEqual({ methods: 2, results: 1 })
    expect([note(), announces()]).toEqual([null, false])

    /* Nothing ticked again: back to what the canvas shows. */
    await say('kehikot.context', canvas('chapters/4_results.tex', []))
    expect(drawn()).toEqual({ methods: 0, results: 1 })

    /* And through all of it, nothing that gives an answer away. */
    expect(document.documentElement.innerHTML).not.toContain(WHY)
  })

  test('a container somebody picked out still narrows, beside the ticks', async () => {
    render(<App />)
    await say('kehikot.hello', canvas('chapters/4_results.tex', ['methods', 'results'], true))
    await waitFor(() => expect(drawn()).toEqual({ methods: 0, results: 1 }))
  })

  test('ticked parts beside a paper on main.tex: the parts’ questions, not an empty pane', async () => {
    render(<App />)
    await say('kehikot.hello', canvas('main.tex', ['methods']))
    await waitFor(() => expect(drawn()).toEqual({ methods: 2, results: 0 }))
    expect([note(), announces()]).toEqual([null, false])
  })
})

describe('an empty pane says why, in one sentence, and nothing else does', () => {
  /* Inside the pane: the page's own heading, drawn only when nothing frames it, is not part of it. */
  const lines = () => [...document.querySelectorAll('section p')].map((one) => one.textContent)

  test('a picked part no question is in', async () => {
    render(<App />)
    const context = canvas('chapters/3_methods.tex', [])
    const withIntro = (picked: boolean) => ({ ...context, parts: [...context.parts, { id: 'intro', heading: 'Introduction', refs: [], picked, files: ['chapters/1_introduction.tex'] }] })
    await say('kehikot.hello', withIntro(false))
    await waitFor(() => expect(drawn()).toEqual({ methods: 2, results: 0 }))
    await say('kehikot.context', withIntro(true))
    expect(drawn()).toEqual({ methods: 0, results: 0 })
    expect(note()).toBe('No question here is in the picked parts.')
    expect(lines()).toEqual(['No question here is in the picked parts.'])
  })

  test('the reader’s scope on a document no question is about', async () => {
    render(<App />)
    /* The paper shows Methods, so the aim leaves its questions; the canvas points at main.tex, which none is about. */
    const containers = [
      { module: 'kehikot.paper', selected: false, showing: { refs: [], documents: [place('chapters/3_methods.tex')] } },
      { module: 'kehikot.learning', selected: false, showing: { refs: [], documents: [] } },
    ]
    await say('kehikot.hello', canvas('main.tex', [], false, { filters: { scope: 'file' }, containers }))
    await waitFor(() => expect(note()).toBe('No question here is about this document; this container’s scope is “This document”, in its header.'))
    expect(lines()).toHaveLength(1)
  })

  test('nothing on the kehikko showing a document any question is about', async () => {
    render(<App />)
    await say('kehikot.hello', canvas('main.tex', []))
    await waitFor(() => expect(note()).toBe('Nothing on this kehikko is showing a document any of the 3 questions here is about.'))
    expect(lines()).toHaveLength(1)
  })
})

describe('the reader’s scope beside the picked parts', () => {
  /* The reader set this container to "This document" in its header; the host keeps that and says it on every context. */
  const scoped = (shown: string, picked: string[], scope = 'file', passage: Record<string, unknown> = {}) =>
    canvas(shown, picked, false, { filters: { scope }, passage: { ...place('chapters/3_methods.tex'), ...passage } })

  test('“This document” on a passage left in another chapter: the parts lead, and nothing is said about it', async () => {
    render(<App />)
    /* Nothing picked, the passage in Methods: that document's questions, as the scope has always done. */
    await say('kehikot.hello', scoped('chapters/3_methods.tex', []))
    await waitFor(() => expect(drawn()).toEqual({ methods: 2, results: 0 }))
    expect([note(), announces()]).toEqual([null, false])

    /* Results is picked. Nothing re-points the canvas, so the passage is still in Methods — a
       document no picked part owns. This was an empty pane saying no question is in the part. */
    await say('kehikot.context', scoped('chapters/3_methods.tex', ['results']))
    expect(drawn()).toEqual({ methods: 0, results: 1 })
    expect([note(), announces()]).toEqual([null, false])
    expect([note(), announces()]).toEqual([null, false])

    /* The part the passage IS in: the scope applies again, and nothing is said about it. */
    await say('kehikot.context', scoped('chapters/3_methods.tex', ['methods']))
    expect(drawn()).toEqual({ methods: 2, results: 0 })
    expect([note(), announces()]).toEqual([null, false])

    /* Both picked, the passage in one of them: the reader asked for one document, and gets it — said. */
    await say('kehikot.context', scoped('chapters/3_methods.tex', ['methods', 'results']))
    expect(drawn()).toEqual({ methods: 2, results: 0 })
    expect([note(), announces()]).toEqual([null, false])

    /* Nothing picked again: the scope was kept all along. */
    await say('kehikot.context', scoped('chapters/3_methods.tex', []))
    expect(drawn()).toEqual({ methods: 2, results: 0 })
    expect([note(), announces()]).toEqual([null, false])
    expect(document.documentElement.innerHTML).not.toContain(WHY)
  })

  test('“This passage” on a highlight left in another chapter: the same, in its own words', async () => {
    render(<App />)
    const highlight = { from: 4, to: 30, quoted: 'methods chapter measured' }
    await say('kehikot.hello', scoped('chapters/3_methods.tex', [], 'section', highlight))
    await waitFor(() => expect(drawn()).toEqual({ methods: 1, results: 0 }))
    await say('kehikot.context', scoped('chapters/3_methods.tex', ['results'], 'section', highlight))
    expect(drawn()).toEqual({ methods: 0, results: 1 })
    expect([note(), announces()]).toEqual([null, false])
  })
})

describe('a pick leaves the reader on their question while it is still shown', () => {
  /* A box too short for a list, so one question is in front at a time: 220 by 300, the narrow container. */
  const root = document.documentElement
  let height = 300
  beforeEach(() => {
    height = 300
    Object.defineProperty(root, 'clientWidth', { configurable: true, get: () => 220 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, get: () => height })
  })
  afterEach(() => {
    delete (root as unknown as Record<string, unknown>).clientWidth
    delete (root as unknown as Record<string, unknown>).clientHeight
  })

  const MORE = 'What else did the results chapter report?'
  /** The one question in front, by its words, and which piece of it is open. */
  const front = () => {
    const text = document.body.textContent ?? ''
    const on = [...ASKED.methods, ...ASKED.results, MORE].filter((one) => text.includes(one))
    return { on, part: document.querySelector('[data-part][aria-pressed="true"]')?.getAttribute('data-part') ?? null, rung: document.querySelector('[data-rung]')?.getAttribute('data-rung') }
  }
  const press = async (selector: string) => {
    await act(async () => {
      ;(document.querySelector(selector) as HTMLElement).click()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }

  test('none, one, another, none: only a question the pick leaves out moves them', async () => {
    add(MORE, '4_results.tex', 'results chapter reported')
    render(<App />)
    await say('kehikot.hello', canvas('chapters/3_methods.tex', []))
    await waitFor(() => expect(front().on).toEqual([ASKED.methods[0]!]))
    expect(front().rung).not.toBe('list')

    /* On to the second Methods question. */
    await press('[data-page="on"]')
    expect(front().on).toEqual([ASKED.methods[1]!])

    /* None to one, and the question in front is in the part: nobody is moved. It used to be the first again. */
    await say('kehikot.context', canvas('chapters/3_methods.tex', ['methods']))
    expect(front().on).toEqual([ASKED.methods[1]!])

    /* Another part instead, which does not hold it: the top of that part's questions. */
    await say('kehikot.context', canvas('chapters/3_methods.tex', ['results']))
    expect(front().on).toEqual([ASKED.results[0]!])
    await press('[data-page="on"]')
    expect(front().on).toEqual([MORE])

    /* One to none, the paper on that chapter: still shown, so still in front. */
    await say('kehikot.context', canvas('chapters/4_results.tex', []))
    expect(front().on).toEqual([MORE])

    /* And a moment later the paper says what it shows now that nothing is picked — every chapter,
       in a context of its own. That is the aim changing with no pick beside it, which used to be
       the top of the list; the question is still shown, so it is still in front. */
    const both = [
      { module: 'kehikot.paper', selected: false, showing: { refs: [], documents: [place('main.tex'), place('chapters/3_methods.tex'), place('chapters/4_results.tex')] } },
      { module: 'kehikot.learning', selected: false, showing: { refs: [], documents: [] } },
    ]
    await say('kehikot.context', canvas('main.tex', [], false, { containers: both }))
    expect(front().on).toEqual([MORE])
    expect(document.body.textContent).toContain('4 / 4')

    /* And a different chapter with nothing picked is a different place, as before: its top. */
    await say('kehikot.context', canvas('chapters/3_methods.tex', []))
    expect(front().on).toEqual([ASKED.methods[0]!])
    expect(document.documentElement.innerHTML).not.toContain(WHY)
  })

  test('the reader’s own scope, pressed while on a question: on it still when it is about that document, at the top when it is not', async () => {
    render(<App />)
    const paper = (scope: string) => canvas('chapters/3_methods.tex', [], false, { filters: { scope }, containers: [
      { module: 'kehikot.paper', selected: false, showing: { refs: [], documents: [place('chapters/3_methods.tex'), place('chapters/4_results.tex')] } },
      { module: 'kehikot.learning', selected: false, showing: { refs: [], documents: [] } },
    ] })
    await say('kehikot.hello', paper('all'))
    await waitFor(() => expect(front().on).toEqual([ASKED.methods[0]!]))
    await press('[data-page="on"]')
    expect(front().on).toEqual([ASKED.methods[1]!])
    /* “This document”, and the document pointed at is the one this question is about. */
    await say('kehikot.context', paper('file'))
    expect(front().on).toEqual([ASKED.methods[1]!])
    /* Back to anywhere, on to the Results question, and “This document” again: it is not about Methods. */
    await say('kehikot.context', paper('all'))
    expect(front().on).toEqual([ASKED.methods[1]!])
    await press('[data-page="on"]')
    expect(front().on).toEqual([ASKED.results[0]!])
    await say('kehikot.context', paper('file'))
    expect(front().on).toEqual([ASKED.methods[0]!])
  })

  test('none to one that leaves the question out: the top of the picked part, at its options', async () => {
    render(<App />)
    await say('kehikot.hello', canvas('chapters/3_methods.tex', []))
    await waitFor(() => expect(front().on).toEqual([ASKED.methods[0]!]))
    await press('[data-page="on"]')
    await say('kehikot.context', canvas('chapters/3_methods.tex', ['results']))
    expect(front().on).toEqual([ASKED.results[0]!])
    expect([note(), announces()]).toEqual([null, false])
  })

  test('a piece of the question opened: the first pick does not close it, in the part or out of it', async () => {
    /* Shorter still, so the question is a piece of its own, behind a chip. */
    height = 200
    render(<App />)
    await say('kehikot.hello', canvas('chapters/3_methods.tex', []))
    await waitFor(() => expect(document.querySelector('[data-page="on"]')).not.toBeNull())
    await press('[data-page="on"]')
    await press('[data-part="question"]')
    expect(front()).toMatchObject({ on: [ASKED.methods[1]!], part: 'question' })

    await say('kehikot.context', canvas('chapters/3_methods.tex', ['methods']))
    expect(front()).toMatchObject({ on: [ASKED.methods[1]!], part: 'question' })

    /* Out of the part now, and in their hands: held, as a pick has held it since the parts were followed. */
    await say('kehikot.context', canvas('chapters/3_methods.tex', ['results']))
    expect(front()).toMatchObject({ on: [ASKED.methods[1]!], part: 'question' })
    /* Kept, and not announced. */
    expect([note(), announces()]).toEqual([null, false])
    expect(document.documentElement.innerHTML).not.toContain('stays until you leave it')
  })
})
