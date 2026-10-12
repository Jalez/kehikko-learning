import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR, WELL_KNOWN } from 'kehikot-module-protocol'
import { doorsHandler, type DoorRequest, type DoorResponse } from 'kehikot-module-protocol/serve'

import { BUILD, MANIFEST, TICKET, answer, stream } from '../doors.ts'

/**
 * The answer-withholding rule, asked of the doors AS THEY ARE SERVED.
 *
 * `test/doors.test.ts` asks `answer()`; this asks the protocol's `doors()` handler configured
 * exactly as `vite.config.ts` configures it, because that handler now writes things this module
 * used to write itself — the page document, the manifest, the health check's answer, a header on
 * every reply. None of them may carry a word of the key for a question nobody has answered: not
 * the tick, not the correct option's index, not the explanation — and not the ORDER THE FILE
 * HAS THE OPTIONS IN, which with an author who writes the right one first is the key by position.
 */

const EPIC = 'modes-are-modules'
const WHY = 'The manifest is the only half a host reads.'
let dir = ''

/** Where the manifest was also served before protocol 1.0.0. Not a door any more: asked here so that stays true. */
const OLD_WELL_KNOWN = '/.well-known/roadmap-module.json'

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
      headers: { ...(body === null ? {} : { 'content-type': 'application/json' }), ...(ticket === null ? {} : { 'x-module-ticket': ticket }) },
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
      expect(islands).toEqual(['ticket', 'build', 'origins'])
      expect(page.headers['cache-control']).toBe('no-store')
      expect(page.headers['content-security-policy']).toContain('frame-ancestors')
    }
  })

  test('the build is a version, a commit, a start time and the protocol’s version, and nothing else', () => {
    expect(Object.keys(BUILD).sort()).toEqual(['commit', 'protocol', 'started', 'version'])
  })

  test('the health check and the manifest: the build was added, and nothing of anybody’s questions', async () => {
    const health = await get('/healthz')
    expect(Object.keys(JSON.parse(health.text) as object).sort()).toEqual(['build', 'id', 'ok', 'version'])
    keyless(health)
    const manifest = await get(WELL_KNOWN)
    expect(manifest.status).toBe(200)
    keyless(manifest)
    expect(manifest.text).not.toContain(dir)
  })

  test('the manifest’s old address is not a door: this app answers nothing there, so nothing of the key', async () => {
    const old = await get(OLD_WELL_KNOWN)
    expect(old.passed).toBe(true)
    expect(old.text).toBe('')
    expect(old.headers).toEqual({})
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

  test('the order the file has the options in is not recoverable from any door served before answering', async () => {
    /* Forty more questions, each written as authors write them: the right option FIRST. */
    const MANY = 40
    const right = (n: number) => `the right one, ${n}`
    const inFile = (n: number) => [right(n), `a wrong one, ${n}`, `another wrong one, ${n}`, `a third wrong one, ${n}`]
    for (let n = 0; n < MANY; n += 1) {
      const reply = answer('POST', '/mcp', new URLSearchParams(), {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'add_quiz', arguments: { project: dir, epic: EPIC, question: `Asked ${n}?`, options: inFile(n), answer: 0, why: WHY, path: 'chapters/bridge.tex', quote: 'the manifest is the smallest half of this program' } },
      }, null)
      expect((reply?.body as { result: { isError?: boolean } }).result.isError).not.toBe(true)
    }

    const asked = await get(`/api/questions?${where()}`)
    keyless(asked)
    const { questions } = JSON.parse(asked.text) as { questions: Record<string, unknown>[] }
    const ours = questions.slice(1)
    expect(ours).toHaveLength(MANY)

    /* No field beside the options that could be an index, an order or a seed: a question is these seven things. */
    for (const question of questions) {
      expect(Object.keys(question).sort()).toEqual(['answer', 'attempts', 'id', 'options', 'question', 'source', 'why'])
      expect(question).toMatchObject({ answer: null, why: null, attempts: [] })
      for (const option of question.options as unknown[]) expect(typeof option).toBe('string')
    }
    /* The top of the document is as it was, with one thing more: the name of the order, which the
       page posts back with an answer. One short string for the whole epic — not one per question,
       so there is no position in it. */
    expect(Object.keys(JSON.parse(asked.text) as object).sort()).toEqual(['epic', 'file', 'ok', 'order', 'project', 'questions', 'standings', 'trouble'])
    const { order } = JSON.parse(asked.text) as { order: string }
    expect(order).toMatch(/^[0-9a-f]{16}$/)

    /* Where the right option is SERVED — known here only because this test wrote the file. In the
       file it is at 0 forty times out of forty; served, no position has it every time. */
    const at = [0, 0, 0, 0]
    ours.forEach((question, n) => {
      const options = question.options as string[]
      expect(options.toSorted()).toEqual(inFile(n).toSorted())
      at[options.indexOf(right(n))]! += 1
    })
    for (const count of at) expect(count).toBeGreaterThan(0)
    for (const count of at) expect(count).toBeLessThan(MANY * 0.6)
    /* Nor is it one fixed re-arrangement applied to every question, which would be file order renamed. */
    const arrangements = new Set(ours.map((question, n) => (question.options as string[]).map((option) => inFile(n).indexOf(option)).join('')))
    expect(arrangements.size).toBeGreaterThan(5)

    /* The salt the order is made from is on disk, and in nothing that is served — the page,
       the health check, the manifests, the questions, the watch — before or after asking. */
    const salt = (JSON.parse(readFileSync(join(dir, KEHIKOT_DIR, 'learning', 'order.json'), 'utf8')) as Record<string, string>)[EPIC]!
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
    const doors = ['/app', '/', '/healthz', WELL_KNOWN, `/api/questions?${where()}`, `/api/questions?project=${encodeURIComponent(dir)}`, `/api/watch?project=${encodeURIComponent(dir)}&ticket=${TICKET}`]
    for (const path of doors) {
      const got = await get(path)
      expect(got.status).toBe(200)
      keyless(got)
      expect(said(got)).not.toContain(salt)
      expect(said(got)).not.toContain('order.json')
    }
    /* The name of the order is not the salt, nor a piece of it, nor the other way round: it is a
       one-way hash, so what the page holds cannot be turned back into what the order is made from. */
    expect(order).not.toBe(salt)
    expect(salt).not.toContain(order)
    expect(order).not.toContain(salt.slice(0, 8))
    /* It does not depend on the file at all. The same questions written in ANOTHER file order —
       so another key position for every one of them — under the same salt have the same name;
       there is nothing about the options, their order or the key for it to carry. */
    const before = JSON.parse(asked.text) as { questions: { id: string }[] }
    for (let n = 0; n < MANY; n += 1) {
      const moved = [...inFile(n).slice(1), right(n)]
      const reply = answer('POST', '/mcp', new URLSearchParams(), {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'reword_quiz', arguments: { project: dir, epic: EPIC, id: before.questions[n + 1]!.id, options: moved, answer: 3 } },
      }, null)
      expect((reply?.body as { result: { isError?: boolean } }).result.isError).not.toBe(true)
    }
    const rewritten = await get(`/api/questions?${where()}`)
    keyless(rewritten)
    expect((JSON.parse(rewritten.text) as { order: string }).order).toBe(order)
    /* Nor is it a count of anything: an epic with one question, dealt once, has a name of the same shape. */
    const other = await get(`/api/questions?project=${encodeURIComponent(dir)}&epic=nothing-here`)
    expect((JSON.parse(other.text) as { order: unknown }).order).toBeNull()

    /* And the manifest's old address, which is no door at all now, serves none of it either. */
    const old = await get(OLD_WELL_KNOWN)
    expect(old.passed).toBe(true)
    expect(said(old)).toBe('{}\n')
    /* Asking twice is the same answer: nothing to average an order out of. */
    expect((await get(`/api/questions?${where()}`)).text).toBe(rewritten.text)
  })

  test('quiz_state, served: whether a question was answered, and never the key, its position, the order or what the order is made from', async () => {
    /* Twelve more, the right option FIRST in the file, as authors write them. */
    const MANY = 12
    const right = (n: number) => `the right one, ${n}`
    const inFile = (n: number) => [right(n), `a wrong one, ${n}`, `another wrong one, ${n}`, `a third wrong one, ${n}`]
    const call = (name: string, args: Record<string, unknown>) =>
      get('/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { project: dir, epic: EPIC, ...args } } } })
    for (let n = 0; n < MANY; n += 1) {
      const wrote = await call('add_quiz', { question: `Asked ${n}?`, options: inFile(n), answer: 0, why: WHY, path: 'chapters/bridge.tex', quote: 'the manifest is the smallest half of this program' })
      expect((JSON.parse(wrote.text) as { result: { isError?: boolean } }).result.isError).not.toBe(true)
    }
    interface State {
      result: { content: { text: string }[]; structuredContent: { done: boolean; questions: Record<string, unknown>[] } }
    }
    const state = async (args: Record<string, unknown> = {}) => {
      const got = await call('quiz_state', args)
      expect(got.status).toBe(200)
      return { got, body: JSON.parse(got.text) as State }
    }
    /* What may never be in it, whoever has answered what: no option's words, no question, no
       explanation, no file, and none of the names a key or a choice goes by. */
    const wordless = (got: Got) => {
      keyless(got)
      const all = said(got)
      for (const words of ['the right one', 'wrong one', 'Asked ', 'What does a manifest settle?', 'Which tab the page gets', 'What colour', 'Who owns', 'chapters/bridge.tex', 'smallest half']) {
        expect(all).not.toContain(words)
      }
      for (const name of ['"answer"', '"chose"', '"options"', '"order"', '"why"', '"key"', '"correct"', '"salt"', 'order.json']) expect(all).not.toContain(name)
    }

    /* Before anyone has answered, and before the page has asked: nothing has been dealt, and asking does not deal. */
    const fresh = await state()
    wordless(fresh.got)
    expect(existsSync(join(dir, KEHIKOT_DIR, 'learning', 'order.json'))).toBe(false)
    expect(fresh.body.result.structuredContent.done).toBe(false)
    expect(fresh.body.result.structuredContent.questions).toHaveLength(MANY + 1)
    for (const question of fresh.body.result.structuredContent.questions) {
      expect(Object.keys(question).sort()).toEqual(['at', 'attempts', 'epic', 'id', 'right', 'state'])
      expect(question).toMatchObject({ epic: EPIC, state: 'unanswered', right: null, attempts: 0, at: null })
    }

    /* The page asks, so there is an order and a salt now. Neither is in what quiz_state says. */
    const asked = JSON.parse((await get(`/api/questions?${where()}`)).text) as { order: string; questions: { id: string; options: string[] }[] }
    const salt = (JSON.parse(readFileSync(join(dir, KEHIKOT_DIR, 'learning', 'order.json'), 'utf8')) as Record<string, string>)[EPIC]!
    const dealt = await state()
    wordless(dealt.got)
    expect(said(dealt.got)).not.toContain(salt)
    expect(said(dealt.got)).not.toContain(asked.order)
    expect(dealt.got.text).toBe(fresh.got.text)

    /* The answer does not depend on where the key is. Every key is moved from first to last; what
       quiz_state says of questions nobody has answered is the same to the byte, so there is
       nothing in it the key, or its position in the file or on the page, could be read from. */
    for (let n = 0; n < MANY; n += 1) {
      const moved = await call('reword_quiz', { id: asked.questions[n + 1]!.id, options: [...inFile(n).slice(1), right(n)], answer: 3 })
      expect((JSON.parse(moved.text) as { result: { isError?: boolean } }).result.isError).not.toBe(true)
    }
    expect((await state()).got.text).toBe(fresh.got.text)

    /* Somebody answers three: one right and two wrong. quiz_state says so and still names no option —
       not the one chosen, not the one that was right, not a position in either order. */
    const now = JSON.parse((await get(`/api/questions?${where()}`)).text) as { order: string; questions: { id: string; options: string[] }[] }
    const press = async (at: number, words: string) => {
      const question = now.questions[at]!
      const pressed = await get('/api/answer', { method: 'POST', ticket: TICKET, body: { project: dir, epic: EPIC, id: question.id, chose: question.options.indexOf(words), order: now.order } })
      expect(pressed.status).toBe(200)
    }
    await press(1, right(0))
    await press(2, 'a wrong one, 1')
    await press(3, 'a third wrong one, 2')
    const after = await state()
    wordless(after.got)
    expect(said(after.got)).not.toContain(salt)
    expect(said(after.got)).not.toContain(now.order)
    const [, one, two, three, four] = after.body.result.structuredContent.questions
    expect(one).toMatchObject({ state: 'answered', right: true, attempts: 1 })
    expect(two).toMatchObject({ state: 'answered', right: false, attempts: 1 })
    expect(three).toMatchObject({ state: 'answered', right: false, attempts: 1 })
    expect(four).toMatchObject({ state: 'unanswered', right: null, attempts: 0, at: null })
    for (const question of after.body.result.structuredContent.questions) {
      expect(Object.keys(question).sort()).toEqual(['at', 'attempts', 'epic', 'id', 'right', 'state'])
    }
    /* The two wrong answers chose different options, at different places, and read the same but for the id and the time. */
    const bare = (question: Record<string, unknown> | undefined) => ({ ...question, id: '', at: '' })
    expect(bare(two)).toEqual(bare(three))
    /* The top of the answer is five plain things, and the listing declares exactly those. */
    expect(Object.keys(after.body.result.structuredContent).sort()).toEqual(['done', 'epic', 'project', 'questions', 'state'])
    /* A refusal carries nothing either. */
    wordless(await call('quiz_state', { state: 'done' }))
    wordless(await call('quiz_state', { ids: 'x' }))
    /* And it is listed as a tool that only reads; the listing itself holds no key. */
    const listed = await get('/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
    keyless(listed)
    expect(said(listed)).not.toContain(salt)
  })

  test('an answer refused for naming an old order is told nothing: no verdict, no key, no order, and the new name only by reading again', async () => {
    const asked = JSON.parse((await get(`/api/questions?${where()}`)).text) as { order: string; questions: { id: string }[] }
    const retaken = await get('/api/retake', { method: 'POST', ticket: TICKET, body: { project: dir, epic: EPIC } })
    expect(retaken.status).toBe(200)
    keyless(retaken)
    const now = (JSON.parse(retaken.text) as { order: string }).order
    expect(now).toMatch(/^[0-9a-f]{16}$/)
    expect(now).not.toBe(asked.order)
    const salt = (JSON.parse(readFileSync(join(dir, KEHIKOT_DIR, 'learning', 'order.json'), 'utf8')) as Record<string, string>)[EPIC]!
    expect(said(retaken)).not.toContain(salt)

    for (const chose of [0, 1, 2]) {
      const refused = await get('/api/answer', { method: 'POST', ticket: TICKET, body: { project: dir, epic: EPIC, id: asked.questions[0]!.id, chose, order: asked.order } })
      expect(refused.status).toBe(409)
      keyless(refused)
      expect(Object.keys(JSON.parse(refused.text) as object).sort()).toEqual(['error', 'ok'])
      expect(said(refused)).not.toContain(salt)
      expect(said(refused)).not.toContain(now)
    }
    /* Three refused guesses later the question is still one nobody has answered. */
    const after = JSON.parse((await get(`/api/questions?${where()}`)).text) as { order: string; questions: { answer: unknown; why: unknown; attempts: unknown[] }[] }
    expect(after.order).toBe(now)
    expect(after.questions[0]).toMatchObject({ answer: null, why: null, attempts: [] })
  })

  test('with the ticket the file does come whole — the one place, and it is the editor’s', async () => {
    const file = await get(`/api/quiz?${where()}`, { ticket: TICKET })
    expect(file.status).toBe(200)
    expect(file.text).toContain('[x] Which tab the page gets')
    expect(file.text).toContain(WHY)
  })
})
