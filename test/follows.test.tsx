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

beforeEach(() => {
  resetServerStanding()
  mailbox.forget?.()
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-follows-')))
  mkdirSync(join(dir, PAPER, 'chapters'), { recursive: true })
  writeFileSync(join(dir, PAPER, 'main.tex'), '\\include{chapters/3_methods}\n\\include{chapters/4_results}\n')
  writeFileSync(join(dir, PAPER, 'chapters', '3_methods.tex'), 'The methods chapter measured satisfaction first and confidence second.')
  writeFileSync(join(dir, PAPER, 'chapters', '4_results.tex'), 'The results chapter reported that satisfaction was above neutral.')
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
const canvas = (shown: string, picked: string[], selected = false) => ({
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
const note = () => document.querySelector('[data-scope-note]')?.textContent ?? null

describe('the questions follow the ticked parts, whatever the paper beside them last said', () => {
  test('no part, one, another, two, none: each tick is that part’s questions, and the count is the rest of the epic', async () => {
    render(<App />)
    /* Nothing ticked, the paper on a chapter: that chapter, as before. */
    await say('kehikot.hello', canvas('chapters/3_methods.tex', []))
    await waitFor(() => expect(drawn()).toEqual({ methods: 2, results: 0 }))

    await say('kehikot.context', canvas('chapters/3_methods.tex', ['methods']))
    expect(drawn()).toEqual({ methods: 2, results: 0 })
    expect(note()).toBe('1 question outside the picked part (Methods).')

    /* The tick moves and the paper has not said anything new: a paper somebody else walked to a
       passage stays quiet until a person touches it. */
    await say('kehikot.context', canvas('chapters/3_methods.tex', ['results']))
    expect(drawn()).toEqual({ methods: 0, results: 1 })
    expect(note()).toBe('2 questions outside the picked part (Results).')

    /* Two parts, and a paper showing both names the one file its caret is in. */
    await say('kehikot.context', canvas('chapters/4_results.tex', ['methods', 'results']))
    expect(drawn()).toEqual({ methods: 2, results: 1 })
    expect(note()).toBe('0 questions outside the 2 picked parts (Methods, Results).')

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
    expect(document.querySelector('[data-aim-note]')).toBeNull()
  })
})
