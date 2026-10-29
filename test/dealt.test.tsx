import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'
import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { TICKET, answerAt as door } from '../doors.ts'
import { App } from '../src/app.tsx'

/**
 * One quiz open in two places, and "Ask these again" pressed in the other.
 *
 * That press deals every question's options in a new order. This page does not know until it
 * reads again (its stream says so a moment later), and a press made before then is a position in
 * the order it is still showing. The whole page against the real doors: such a press is refused
 * and said, nothing is recorded, the page reads again, and the next press is the option whose
 * words were pressed.
 */

const realFetch = globalThis.fetch
const EPIC = 'thesis'
const WHY = 'Because the chapter says so, in so many words.'
const ASKED = 'What did the methods chapter measure first?'
/* As authors write them: the right one first. */
const IN_FILE = ['Satisfaction', 'Confidence', 'Attendance', 'Grades', 'Nothing at all']
let dir = ''
let posted: Record<string, unknown>[] = []

const stored = () => {
  const file = join(dir, KEHIKOT_DIR, 'learning', 'answers.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, { chose: number; right: boolean }[]>>)[EPIC] ?? {} : {}
}
const served = () =>
  door('GET', '/api/questions', new URLSearchParams({ project: dir, epic: EPIC }), null, null)?.body as { order: string; questions: { id: string; options: string[] }[] }

beforeEach(() => {
  resetServerStanding()
  mailbox.forget?.()
  posted = []
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-dealt-')))
  writeFileSync(join(dir, 'methods.tex'), 'The methods chapter measured satisfaction first and confidence second.')
  door('POST', '/mcp', new URLSearchParams(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'add_quiz', arguments: { project: dir, epic: EPIC, question: ASKED, options: IN_FILE, answer: 0, why: WHY, path: 'methods.tex', quote: 'measured satisfaction first' } },
  }, null)
  const island = document.createElement('script')
  island.id = 'ticket'
  island.type = 'application/json'
  island.textContent = JSON.stringify(TICKET)
  document.body.appendChild(island)
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const at = new URL(String(url), 'http://127.0.0.1')
    const ticket = (init.headers as Record<string, string> | undefined)?.['x-module-ticket'] ?? null
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
    if (at.pathname === '/api/answer' && body) posted.push(body)
    const said = door((init.method ?? 'GET').toUpperCase(), at.pathname, at.searchParams, body, ticket)
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

const greet = async () => {
  await act(async () => {
    window.postMessage({ type: 'kehikot.hello', protocol: 2, session: 's', state: null, context: { project: 'thesis', projectPath: dir, epic: EPIC, theme: 'dark' } }, '*')
    await new Promise((resolve) => setTimeout(resolve, 60))
  })
}
const press = async (words: string) => {
  await act(async () => {
    fireEvent.click(screen.getAllByText(words)[0]!)
    await new Promise((resolve) => setTimeout(resolve, 80))
  })
}
/** The options as this page is drawing them, top to bottom. */
const drawn = () => [...document.querySelectorAll('[data-question] button')].map((one) => one.textContent ?? '').filter((one) => IN_FILE.some((option) => one.includes(option)))

describe('asked again somewhere else, and pressed here before it reads again', () => {
  test('the press is refused and said, nothing is recorded, and the next press is the words that were pressed', async () => {
    render(<App />)
    await greet()
    await waitFor(() => expect(screen.getAllByText(ASKED).length).toBeGreaterThan(0))
    const before = served()
    const { id } = before.questions[0]!

    /* The other tab. Dealt again until the option about to be pressed really is somewhere else, so this is the case that matters. */
    let now = before
    const place = (one: typeof before) => one.questions[0]!.options.indexOf('Confidence')
    for (let tries = 0; tries < 40 && place(now) === place(before); tries += 1) {
      door('POST', '/api/retake', new URLSearchParams(), { project: dir, epic: EPIC }, TICKET)
      now = served()
    }
    expect(now.order).not.toBe(before.order)
    expect(now.questions[0]!.options).not.toEqual(before.questions[0]!.options)

    /* Pressed here, where this page still draws it: a position that is some other option by now. */
    const at = before.questions[0]!.options.indexOf('Confidence')
    expect(now.questions[0]!.options[at]).not.toBe('Confidence')
    await press('Confidence')
    expect(posted).toEqual([{ project: dir, epic: EPIC, id, chose: at, order: before.order }])
    expect(stored()).toEqual({})
    expect(document.body.textContent).toContain('Nothing was recorded. Look at the options again and choose.')
    expect(document.documentElement.innerHTML).not.toContain(WHY)
    /* And it has read again, by itself: the options are where the server has them now. */
    await waitFor(() => expect(drawn().map((one) => IN_FILE.find((option) => one.includes(option)))).toEqual(now.questions[0]!.options))
    expect(document.body.textContent).toContain('Nothing was recorded. Look at the options again and choose.')

    /* The same words, pressed again where they are now. */
    await press('Confidence')
    expect(posted.at(-1)).toEqual({ project: dir, epic: EPIC, id, chose: now.questions[0]!.options.indexOf('Confidence'), order: now.order })
    expect(stored()[id]).toMatchObject([{ chose: IN_FILE.indexOf('Confidence'), right: false }])
    expect(document.body.textContent).not.toContain('Look at the options again')
  })
})
