import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { AskFailed, resetServerStanding, serverStanding } from 'kehikot-module-protocol/client'

import { TICKET, answer as door } from '../doors.ts'
import { answer, files, openEpic, retake } from '../src/store/ask.ts'

/**
 * The page's store against the real doors, with `fetch` and `EventSource` as the only things
 * faked: the ticket header the two halves now share, what a refusal and a stopped server come to,
 * the save's conflict, and whether the watch says it is attached.
 */

const realFetch = globalThis.fetch
const realSource = globalThis.EventSource
const EPIC = 'modes-are-modules'
let dir = ''
let down = false
/** What the page carried on each request: the method, the path and its ticket header. */
let carried: { method: string; path: string; ticket: string | null; keepalive: boolean }[] = []
/** The ticket the doors are told the request carried, when a test wants another than the page's. */
let forged: string | null | undefined

function added(): string {
  const reply = door('POST', '/mcp', new URLSearchParams(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'add_quiz',
      arguments: {
        project: dir,
        epic: EPIC,
        question: 'What does a manifest settle?',
        options: ['Which tab the page gets', 'What colour the container is', 'Who owns the repository'],
        answer: 0,
        why: 'The manifest is the only half a host reads.',
        path: 'chapters/bridge.tex',
        quote: 'the manifest is the smallest half of this program',
      },
    },
  }, null)
  const text = (reply?.body as { result: { content: { text: string }[] } }).result.content[0]!.text
  return /Question ([0-9a-f]{8}) written/.exec(text)![1]!
}

beforeEach(() => {
  resetServerStanding()
  down = false
  carried = []
  forged = undefined
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-wire-')))
  mkdirSync(join(dir, 'chapters'))
  writeFileSync(join(dir, 'chapters', 'bridge.tex'), 'So the manifest is the smallest half of this program, and the only half a host reads.')
  const island = document.createElement('script')
  island.id = 'ticket'
  island.type = 'application/json'
  island.textContent = JSON.stringify(TICKET)
  document.body.appendChild(island)
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    if (down) throw new TypeError('Load failed')
    const at = new URL(String(url), 'http://127.0.0.1')
    const method = (init.method ?? 'GET').toUpperCase()
    const ticket = (init.headers as Record<string, string> | undefined)?.['x-module-ticket'] ?? null
    carried.push({ method, path: at.pathname, ticket, keepalive: init.keepalive === true })
    const said = door(method, at.pathname, at.searchParams, init.body ? JSON.parse(String(init.body)) : null, forged === undefined ? ticket : forged)
    return new Response(JSON.stringify(said?.body ?? null), { status: said?.status ?? 404 })
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  globalThis.EventSource = realSource
  document.getElementById('ticket')?.remove()
  rmSync(dir, { recursive: true, force: true })
})

describe('a write', () => {
  test('carries the page’s ticket in the shared header, which the doors accept', async () => {
    const id = added()
    /* The right option, at whatever position this page was shown it: the file's order is not sent. */
    const opened = await openEpic(dir, EPIC)
    const shown = 'error' in opened ? -1 : opened.questions[0]!.options.indexOf('Which tab the page gets')
    carried = []
    const scored = await answer(dir, EPIC, id, shown)
    expect('error' in scored).toBe(false)
    expect((scored as { right: boolean }).right).toBe(true)
    expect(carried).toEqual([{ method: 'POST', path: '/api/answer', ticket: TICKET, keepalive: false }])
    expect(serverStanding()).toBe('up')
  })

  test('refused for its own reasons is the server’s own sentence, and the page is not called stale', async () => {
    added()
    const out = await answer(dir, EPIC, 'no-such-question', 0)
    expect(out).toMatchObject({ kind: 'refused' })
    expect((out as { error: string }).error.length).toBeGreaterThan(10)
    expect(serverStanding()).toBe('up')
  })

  test('from a page older than its server is marked, and nothing is recorded', async () => {
    const id = added()
    forged = 'a-ticket-from-before-the-restart'
    expect(await answer(dir, EPIC, id, 0)).toMatchObject({ kind: 'stale' })
    expect(serverStanding()).toBe('stale')
    forged = undefined
    const opened = await openEpic(dir, EPIC)
    expect('error' in opened ? null : opened.questions[0]?.attempts).toHaveLength(0)
  })

  test('retake goes through the same door', async () => {
    const id = added()
    await answer(dir, EPIC, id, 1)
    const out = await retake(dir, EPIC)
    expect('error' in out ? null : out.questions[0]?.attempts).toHaveLength(0)
    expect(carried.at(-1)).toMatchObject({ path: '/api/retake', ticket: TICKET })
  })
})

describe('a read', () => {
  test('of the questions carries no ticket and is answered without the key', async () => {
    added()
    const opened = await openEpic(dir, EPIC)
    expect(carried).toEqual([{ method: 'GET', path: '/api/questions', ticket: null, keepalive: false }])
    expect('error' in opened ? null : opened.questions).toHaveLength(1)
    expect(JSON.stringify(opened)).not.toContain('only half a host reads.')
    expect('error' in opened ? null : opened.questions[0]?.answer).toBeNull()
  })

  test('with nothing answering is one sentence and a standing — not an uncaught "Failed to fetch"', async () => {
    down = true
    expect(await openEpic(dir, EPIC)).toEqual({ error: 'This app’s own server is not answering.', kind: 'down' })
    expect(serverStanding()).toBe('down')
    down = false
    await openEpic(dir, EPIC)
    expect(serverStanding()).toBe('up')
  })
})

describe('the editor’s doors', () => {
  test('carry the ticket on the READS too, because those are answered with the key', async () => {
    added()
    const file = await files.read(dir, EPIC)
    expect(file.text).toContain('- [x] Which tab the page gets')
    await files.history(dir, EPIC)
    expect(carried).toEqual([
      { method: 'GET', path: '/api/quiz', ticket: TICKET, keepalive: false },
      { method: 'GET', path: '/api/history', ticket: TICKET, keepalive: false },
    ])
  })

  test('a read from a page older than its server is thrown as stale, with no file in it', async () => {
    added()
    forged = null
    const failed = await files.read(dir, EPIC).catch((caught: unknown) => caught)
    expect(failed).toBeInstanceOf(AskFailed)
    expect((failed as AskFailed).kind).toBe('stale')
    expect(JSON.stringify((failed as AskFailed).body)).not.toContain('[x]')
  })

  test('the trail and an undo from such a page are thrown in the sentence the editor has always drawn', async () => {
    added()
    forged = null
    for (const ask of [() => files.history(dir, EPIC), () => files.undo(dir, EPIC, 'no-such-entry')]) {
      const failed = await ask().catch((caught: unknown) => caught)
      expect((failed as AskFailed).kind).toBe('stale')
      expect((failed as AskFailed).message).toBe('This page is older than its server — reloading…')
    }
  })

  test('a save is sent keepalive, and the file having moved comes back as a conflict, not a failure', async () => {
    added()
    const file = await files.read(dir, EPIC)
    const mine = `${file.text}\n`
    const saved = await files.save(dir, EPIC, mine, file.version, 'sitting')
    expect(saved.ok).toBe(true)
    expect(carried.at(-1)).toEqual({ method: 'POST', path: '/api/quiz', ticket: TICKET, keepalive: true })
    /* Against the version from before that save: the file has moved since. */
    const refused = await files.save(dir, EPIC, `${mine}\n`, file.version, 'sitting')
    expect(refused.ok).toBe(false)
    expect(refused.ok ? null : refused.theirs.text).toBe(saved.ok ? saved.file.text : '')
    expect(serverStanding()).toBe('up')
  })

  test('a file with something wrong in it is still saved, and is not read as a refusal', async () => {
    added()
    const file = await files.read(dir, EPIC)
    const broken = `${file.text}\n## A question with no options\n`
    const saved = await files.save(dir, EPIC, broken, file.version, 'sitting')
    expect(saved.ok).toBe(true)
    expect((await files.read(dir, EPIC)).text).toContain('A question with no options')
  })

  test('a save with nothing answering is thrown as down', async () => {
    down = true
    const failed = await files.save(dir, EPIC, 'x', null, 's').catch((caught: unknown) => caught)
    expect((failed as AskFailed).kind).toBe('down')
    expect((failed as Error).message).toBe('This app’s own server is not answering.')
  })
})

describe('the watch', () => {
  /** An `EventSource` a test drives by hand. */
  class Line {
    static made: Line[] = []
    readyState = 0
    onopen: (() => void) | null = null
    onmessage: ((message: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    closed = false
    constructor(public url: string) {
      Line.made.push(this)
    }
    close() {
      this.closed = true
      this.readyState = 2
    }
  }

  beforeEach(() => {
    Line.made = []
    globalThis.EventSource = Line as unknown as typeof EventSource
  })

  test('carries the ticket in the address, says attached and not attached, and hands over each change', () => {
    const said: string[] = []
    const heard: unknown[] = []
    const stop = files.watch(dir, (change) => heard.push(change), (attachment) => said.push(attachment))
    const line = Line.made[0]!
    const at = new URL(line.url, 'http://127.0.0.1')
    expect(at.pathname).toBe('/api/watch')
    expect(at.searchParams.get('project')).toBe(dir)
    expect(at.searchParams.get('ticket')).toBe(TICKET)
    expect(said).toEqual(['connecting'])

    line.readyState = 1
    line.onopen?.()
    expect(said).toEqual(['connecting', 'attached'])
    line.onmessage?.({ data: JSON.stringify({ epic: EPIC, version: 'v2' }) })
    line.onmessage?.({ data: 'not json' })
    line.onmessage?.({ data: JSON.stringify({ nothing: 'of ours' }) })
    expect(heard).toEqual([{ epic: EPIC, version: 'v2' }])

    /* The server went away: said out loud, where this used to be silent. */
    line.readyState = 0
    line.onerror?.()
    expect(said.at(-1)).toBe('detached')
    line.readyState = 1
    line.onopen?.()
    expect(said.at(-1)).toBe('attached')

    stop()
    expect(line.closed).toBe(true)
  })
})
