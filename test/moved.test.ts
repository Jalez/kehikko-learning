import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'
import { DOOR_PROJECT_SAYS } from 'kehikot-module-protocol/serve'

import { TICKET, answer } from '../doors.ts'
import { host } from './host.ts'

/**
 * A project is its id, not its folder. The door asks the host which folder it means and works on
 * that one, so a path an agent learnt before a rename is followed, a stranger's folder at the old
 * path is not written to, and with no host nothing is written at all.
 */

let dir = ''
let OLD = ''
let NEW = ''
const ID = 'proj-learning-1'
const nothing = new URLSearchParams()

beforeEach(() => {
  host.reset()
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-moved-')))
  OLD = join(dir, 'before')
  NEW = join(dir, 'after')
  delete process.env.LEARNING_PROJECT
  delete process.env.KEHIKOT_PROJECT
})
afterEach(() => {
  host.reset()
  delete process.env.LEARNING_PROJECT
  rmSync(dir, { recursive: true, force: true })
})

/** The project, as it was and as it is after the person renamed its folder. */
function renamed(): void {
  mkdirSync(OLD)
  mkdirSync(join(OLD, 'chapters'))
  writeFileSync(join(OLD, 'chapters', 'bridge.tex'), 'So the manifest is the smallest half of this program, and the only half a host reads.')
  renameSync(OLD, NEW)
  host.auto = false
  host.projects.set(NEW, ID)
  host.moved.set(OLD, { to: NEW, id: ID })
}

const add = (project: string | undefined) =>
  answer(
    'POST',
    '/mcp',
    nothing,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'add_quiz',
        arguments: {
          project,
          epic: 'thesis',
          question: 'What does a manifest settle?',
          options: ['Which tab the page gets', 'What colour the container is', 'Who owns the repository'],
          answer: 0,
          why: 'The manifest is the only half a host reads.',
          path: 'chapters/bridge.tex',
          quote: 'the manifest is the smallest half of this program',
        },
      },
    },
    null,
  ).then((reply) => {
    const result = (reply?.body as { result: { content: { text: string }[]; isError?: boolean } }).result
    return { texts: result.content.map((c) => c.text), isError: result.isError === true }
  })

describe('a project whose folder moved', () => {
  test('a tool call with the former path is followed, works on the new folder, and says so', async () => {
    renamed()
    const { texts, isError } = await add(OLD)
    expect(isError).toBe(false)
    expect(texts.at(-1)).toBe(DOOR_PROJECT_SAYS.followed(OLD, NEW))
    expect(existsSync(join(NEW, KEHIKOT_DIR, 'learning', 'thesis.md'))).toBe(true)
    expect(existsSync(OLD)).toBe(false)
  })

  test('the page’s request with the former path is followed too', async () => {
    renamed()
    const reply = await answer('GET', '/api/questions', new URLSearchParams({ project: OLD }), null, TICKET)
    const body = reply?.body as { ok: boolean; project: string; said?: string }
    expect(body.ok).toBe(true)
    expect(body.project).toBe(NEW)
    expect(body.said).toBe(DOOR_PROJECT_SAYS.followed(OLD, NEW))
  })

  test('an unrelated folder made at the old path is refused, and nothing is written there', async () => {
    renamed()
    mkdirSync(OLD)
    host.moved.set(OLD, { to: NEW, id: 'proj-someone-else' })
    host.projects.set(NEW, ID)
    const { texts, isError } = await add(OLD)
    expect(isError).toBe(true)
    expect(texts[0]).toBe(DOOR_PROJECT_SAYS.moved(NEW))
    expect(existsSync(join(OLD, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(NEW, KEHIKOT_DIR))).toBe(false)
  })

  test('a folder the host does not hold is refused, though it exists', async () => {
    mkdirSync(OLD)
    host.auto = false
    const { texts, isError } = await add(OLD)
    expect(isError).toBe(true)
    expect(texts[0]).toBe(DOOR_PROJECT_SAYS.notProject(OLD))
    expect(existsSync(join(OLD, KEHIKOT_DIR))).toBe(false)
  })

  test('with no host running a door refuses, and writes nothing', async () => {
    mkdirSync(OLD)
    host.up = false
    const { texts, isError } = await add(OLD)
    expect(isError).toBe(true)
    expect(texts[0]).toBe(DOOR_PROJECT_SAYS.notProject(OLD))
    expect(existsSync(join(OLD, KEHIKOT_DIR))).toBe(false)

    const page = await answer('POST', '/api/quiz', nothing, { project: OLD, epic: 'thesis', text: '## q\n' }, TICKET)
    expect((page?.body as { ok: boolean }).ok).toBe(false)
    expect(existsSync(join(OLD, KEHIKOT_DIR))).toBe(false)
  })

  test('LEARNING_PROJECT is a default a person set, and is put to the host like any other path', async () => {
    renamed()
    process.env.LEARNING_PROJECT = OLD
    const { isError, texts } = await add(undefined)
    expect(isError).toBe(false)
    expect(texts.at(-1)).toBe(DOOR_PROJECT_SAYS.followed(OLD, NEW))
    expect(existsSync(join(NEW, KEHIKOT_DIR, 'learning', 'thesis.md'))).toBe(true)
  })

  test('without a project and without a default the door says what to pass', async () => {
    const { isError, texts } = await add(undefined)
    expect(isError).toBe(true)
    expect(texts[0]).toContain('project')
  })
})
