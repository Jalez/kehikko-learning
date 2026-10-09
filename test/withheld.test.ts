import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LEGACY_WELL_KNOWN, WELL_KNOWN } from 'kehikot-module-protocol'
import { doorsHandler, type DoorRequest, type DoorResponse } from 'kehikot-module-protocol/serve'

import { BUILD, MANIFEST, TICKET, answer, stream } from '../doors.ts'

/**
 * The answer-withholding rule, asked of the doors AS THEY ARE SERVED.
 *
 * `test/doors.test.ts` asks `answer()`; this asks the protocol's `doors()` handler configured
 * exactly as `vite.config.ts` configures it, because that handler now writes things this module
 * used to write itself — the page document, the manifest, the health check's answer, a header on
 * every reply. None of them may carry a word of the key for a question nobody has answered: not
 * the tick, not the correct option's index, not the explanation.
 */

const EPIC = 'modes-are-modules'
const WHY = 'The manifest is the only half a host reads.'
let dir = ''

/* The options exactly as `vite.config.ts` passes them. */
const handler = doorsHandler({ manifest: MANIFEST, answer, stream, build: BUILD, page: { title: 'Learning', ticket: TICKET } })

interface Got {
  status: number
  headers: Record<string, string>
  text: string
  /** The handler passed the request on to Vite: not a door of this app's. */
  passed: boolean
}

/** One request through the handler, as node would hand it over. A stream is read until its first event and hung up on. */
function get(path: string, { method = 'GET', ticket = null as string | null, body = null as unknown } = {}): Promise<Got> {
  return new Promise((resolve) => {
    const listeners: Record<string, ((chunk?: never) => void)[]> = {}
    const got: Got = { status: 0, headers: {}, text: '', passed: false }
    const request = {
      url: path,
      method,
      headers: { ...(ticket === null ? {} : { 'x-module-ticket': ticket }) },
      on(event: string, listener: (chunk?: never) => void) {
        ;(listeners[event] ??= []).push(listener)
        return request
      },
      resume() {},
    } as unknown as DoorRequest
    const finish = () => {
      got.status = response.statusCode
      resolve(got)
    }
    const response: DoorResponse = {
      statusCode: 0,
      setHeader: (name, value) => (got.headers[name.toLowerCase()] = value),
      write: (chunk) => {
        got.text += chunk
        /* An open stream never ends by itself: hang up, as a page going away does. */
        queueMicrotask(() => {
          for (const listener of listeners.close ?? []) listener()
          finish()
        })
      },
      end: (chunk) => {
        if (chunk !== undefined) got.text += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
        finish()
      },
      flushHeaders: () => {},
    }
    handler(request, response, () => {
      got.passed = true
      resolve(got)
    })
    /* The body, then the end of the request, as a socket delivers them. */
    queueMicrotask(() => {
      if (body !== null) for (const listener of listeners.data ?? []) listener(new TextEncoder().encode(JSON.stringify(body)) as never)
      for (const listener of listeners.end ?? []) listener()
    })
  })
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-withheld-')))
  mkdirSync(join(dir, 'chapters'))
  writeFileSync(join(dir, 'chapters', 'bridge.tex'), 'So the manifest is the smallest half of this program, and the only half a host reads.')
  const reply = answer('POST', '/mcp', new URLSearchParams(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'add_quiz',
      arguments: {
        project: dir,
        epic: EPIC,
        question: 'What does a manifest settle?',
        /* The correct option is the THIRD, so its index is not a number that is lying around anyway. */
        options: ['What colour the container is', 'Who owns the repository', 'Which tab the page gets'],
        answer: 2,
        why: WHY,
        path: 'chapters/bridge.tex',
        quote: 'the manifest is the smallest half of this program',
      },
    },
  }, null)
  expect((reply?.body as { result: { isError?: boolean } }).result.isError).not.toBe(true)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Everything a reply said, headers included, as one string to look for the key in. */
const said = (got: Got) => `${JSON.stringify(got.headers)}\n${got.text}`

function keyless(got: Got) {
  const all = said(got)
  expect(all).not.toContain('[x]')
  expect(all).not.toContain(WHY)
  expect(all).not.toContain('only half a host reads')
  expect(all).not.toMatch(/"answer":\s*\d/)
  expect(all).not.toMatch(/"correct"/)
}

describe('what the shared doors serve without being asked for the file', () => {
  const where = () => `project=${encodeURIComponent(dir)}&epic=${EPIC}`

  test('the page document: a root, the ticket and the build — no question, no option, no key', async () => {
    for (const path of ['/app', '/app/', '/']) {
      const page = await get(path)
      expect(page.status).toBe(200)
      keyless(page)
      expect(page.text).not.toContain('What does a manifest settle?')
      expect(page.text).not.toContain('Which tab the page gets')
      expect(page.text).not.toContain(dir)
      /* The only JSON in it is the ticket and the build, and the build is four plain facts. */
      const islands = [...page.text.matchAll(/<script id="([^"]+)" type="application\/json">/g)].map((match) => match[1])
      expect(islands).toEqual(['ticket', 'build'])
      expect(page.headers['cache-control']).toBe('no-store')
      expect(page.headers['content-security-policy']).toContain('frame-ancestors')
    }
  })

  test('the build is a version, a commit, a start time and the protocol’s version, and nothing else', () => {
    expect(Object.keys(BUILD).sort()).toEqual(['commit', 'protocol', 'started', 'version'])
  })

  test('the health check and both manifests: the build was added, and nothing of anybody’s questions', async () => {
    const health = await get('/healthz')
    expect(Object.keys(JSON.parse(health.text) as object).sort()).toEqual(['build', 'id', 'ok', 'version'])
    keyless(health)
    for (const path of [WELL_KNOWN, LEGACY_WELL_KNOWN]) {
      const manifest = await get(path)
      expect(manifest.status).toBe(200)
      keyless(manifest)
      expect(manifest.text).not.toContain(dir)
    }
  })

  test('the questions route, served: the question and its options, and still no key', async () => {
    const asked = await get(`/api/questions?${where()}`)
    expect(asked.status).toBe(200)
    expect(asked.text).toContain('What does a manifest settle?')
    keyless(asked)
    const body = JSON.parse(asked.text) as { questions: { answer: unknown; why: unknown }[] }
    expect(body.questions[0]).toMatchObject({ answer: null, why: null })
  })

  test('the file, its history and the watch are refused without the ticket — in the header or, for the watch, the address', async () => {
    for (const path of [`/api/quiz?${where()}`, `/api/history?${where()}`, `/api/watch?project=${encodeURIComponent(dir)}`]) {
      for (const ticket of [null, 'guess']) {
        const refused = await get(path, { ticket })
        expect(refused.status).toBe(403)
        keyless(refused)
      }
    }
    /* A ticket in the HEADER does not open the watch: only the one in the address is read there. */
    expect((await get(`/api/watch?project=${encodeURIComponent(dir)}&ticket=guess`, { ticket: TICKET })).status).toBe(403)
  })

  test('the watch, opened with the ticket, sends an epic and a version and never a word of the file', async () => {
    const open = await get(`/api/watch?project=${encodeURIComponent(dir)}&ticket=${TICKET}`)
    expect(open.status).toBe(200)
    expect(open.headers['content-type']).toContain('text/event-stream')
    keyless(open)
  })

  test('every reply carries the build’s stamp in a header, and the stamp says nothing of a project', async () => {
    const asked = await get(`/api/questions?${where()}`)
    expect(asked.headers['x-module-build']).toBeTruthy()
    expect(asked.headers['x-module-build']).not.toContain(dir)
  })

  test('there is no door that hands out the ticket, and no path under /api that is new', async () => {
    for (const path of ['/api/ticket', '/api/build', '/api/key', '/api/answers', '/api/file']) {
      const none = await get(path)
      expect(none.status).toBe(404)
      keyless(none)
      expect(none.text).not.toContain(TICKET)
    }
    /* And anything that is not a door goes on to Vite unread, as before. */
    expect((await get('/src/main.tsx')).passed).toBe(true)
  })

  test('with the ticket the file does come whole — the one place, and it is the editor’s', async () => {
    const file = await get(`/api/quiz?${where()}`, { ticket: TICKET })
    expect(file.status).toBe(200)
    expect(file.text).toContain('[x] Which tab the page gets')
    expect(file.text).toContain(WHY)
  })
})
