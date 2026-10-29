import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { answerAt as door } from '../doors.ts'
import { stopWatching } from '../quiz/news.ts'
import { App } from '../src/app.tsx'
import { DoorSource } from './events.ts'

/**
 * The question list is told, and never asks on a clock: the whole page against the real doors, with
 * `fetch` counting and the stream served in-process (`test/events.ts`). It reads once as the stream
 * opens, sets no repeating timer, and reads again only when the server says the questions changed.
 */

const realFetch = globalThis.fetch
const realInterval = globalThis.setInterval
const realTimeout = globalThis.setTimeout
const EPIC = 'thesis'
let dir = ''
let reads = 0

const addQuiz = (question: string) =>
  door('POST', '/mcp', new URLSearchParams(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'add_quiz', arguments: { project: dir, epic: EPIC, question, options: ['Satisfaction', 'Confidence'], answer: 0, why: 'It says so.', path: 'methods.tex', quote: 'measured satisfaction first' } },
  }, null)

beforeEach(() => {
  resetServerStanding()
  mailbox.forget?.()
  reads = 0
  DoorSource.opened = []
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-told-')))
  writeFileSync(join(dir, 'methods.tex'), 'The methods chapter measured satisfaction first and confidence second.')
  addQuiz('What did the methods chapter measure first?')
  /* The very first read of an epic deals its options and writes down that dealing, which is news in
     its own right (another tab reading the same epic has to hear of it). Dealt here, before the page. */
  door('GET', '/api/questions', new URLSearchParams({ project: dir, epic: EPIC }), null, null)
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const at = new URL(String(url), 'http://127.0.0.1')
    if (at.pathname === '/api/questions') reads += 1
    const said = door((init.method ?? 'GET').toUpperCase(), at.pathname, at.searchParams, init.body ? JSON.parse(String(init.body)) : null, null)
    return new Response(JSON.stringify(said?.body ?? null), { status: said?.status ?? 404 })
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
  globalThis.setInterval = realInterval
  globalThis.setTimeout = realTimeout
  stopWatching()
  document.documentElement.className = ''
  rmSync(dir, { recursive: true, force: true })
})

describe('the questions are told, never asked for on a clock', () => {
  test('one read as the stream opens, no repeating timer, and one more read per change the server publishes', async () => {
    /* Every timer the page's own code arms itself (the caller is in `src/`; a host request's timeout
       is armed by the protocol's client, and asks the host, not this server), and every interval at all. */
    const PAGE = `${join(import.meta.dir, '..', 'src')}/`
    const ours = () => {
      const frames = (new Error().stack ?? '').split('\n').filter((frame) => frame.includes('/'))
      const caller = frames.find((frame) => !frame.includes('told.test'))
      return caller?.includes(PAGE) ?? false
    }
    let intervals = 0
    const armed: number[] = []
    globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => (intervals++, realInterval(...args))) as typeof setInterval
    globalThis.setTimeout = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) => {
      if (ours()) armed.push(ms ?? 0)
      return realTimeout(handler, ms, ...rest)
    }) as typeof setTimeout

    render(<App />)
    await act(async () => {
      window.postMessage({ type: 'kehikot.hello', protocol: 2, session: 's', state: null, context: { project: 'thesis', projectPath: dir, epic: EPIC, theme: 'dark' } }, '*')
      await new Promise((resolve) => realTimeout(resolve, 80))
    })
    /* Counted before `waitFor`, which keeps an interval of its own. */
    expect(intervals).toBe(0)
    expect(armed).toEqual([])
    expect(screen.getAllByText('What did the methods chapter measure first?').length).toBeGreaterThan(0)
    expect(reads).toBe(1)
    const line = DoorSource.opened.find((one) => one.url.startsWith('/api/questions/events'))
    expect(new URL(line!.url, 'http://127.0.0.1').searchParams.get('project')).toBe(dir)

    /* Nothing changes for a while: nothing is asked. */
    await act(async () => void (await new Promise((resolve) => realTimeout(resolve, 400))))
    expect(reads).toBe(1)

    /* An agent writes a question; the server publishes, and the page reads once more. */
    addQuiz('What did it measure second?')
    await waitFor(() => expect(screen.getAllByText('What did it measure second?').length).toBeGreaterThan(0))
    expect(reads).toBe(2)

    cleanup()
    expect(line!.readyState).toBe(2)
  })
})
