import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DIGEST_QUIET_MS } from 'kehikot-module-protocol/proposals'

import { resetDigester, setTeller } from '../digest.ts'
import { TICKET, answerAt as answer } from '../doors.ts'

/**
 * The follow-up digest (protocol 2.75.0): the session that proposed changes to
 * an epic's questions hears ONCE what the person made of them, when every one
 * of its proposals there is answered and nothing more was decided for the
 * quiet while — never a message per decision. The reasons for what was
 * declined are in it.
 */

const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123'
const EPIC = 'modes-are-modules'
let dir = ''
let A = ''
let told: { project: string; token: string; body: string }[] = []

/** Timers the test moves by hand: the quiet while without waiting 30 s. */
function fakeClock() {
  let now = 0
  let timers: { run: () => void; at: number }[] = []
  return {
    setTimer: (run: () => void, ms: number) => {
      const timer = { run, at: now + ms }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer: unknown) => {
      timers = timers.filter((one) => one !== timer)
    },
    advance(ms: number) {
      now += ms
      for (const timer of timers.filter((one) => one.at <= now)) {
        timers = timers.filter((one) => one !== timer)
        timer.run()
      }
    },
    waiting: () => timers.length,
  }
}
let clock = fakeClock()

function call(name: string, args: Record<string, unknown>, token: string | null = null): string {
  const query = new URLSearchParams(token ? { 'kehikot-place': token } : {})
  const reply = answer('POST', '/mcp', query, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, null)
  return (reply?.body as { result?: { content?: { text?: string }[] } }).result?.content?.[0]?.text ?? ''
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-digest-')))
  A = join(dir, 'one')
  mkdirSync(join(A, 'chapters'), { recursive: true })
  writeFileSync(join(A, 'chapters', 'bridge.tex'), 'So the manifest is the smallest half of this program, and the only half a host reads.')
  delete process.env.LEARNING_PROJECT
  delete process.env.KEHIKOT_PROJECT
  const added = call('add_quiz', {
    project: A,
    epic: EPIC,
    question: 'What does a manifest settle?',
    options: ['Which tab the page gets', 'What colour the container is', 'Who owns the repository'],
    answer: 0,
    why: 'The manifest is the only half a host reads.',
    path: 'chapters/bridge.tex',
    quote: 'the manifest is the smallest half of this program',
  })
  expect(added).toMatch(/Question [0-9a-f]{8} written/)
  told = []
  setTeller((project, token, body) => told.push({ project, token, body }))
  clock = fakeClock()
  resetDigester(clock)
})

afterEach(() => {
  setTeller(null)
  resetDigester()
  rmSync(dir, { recursive: true, force: true })
})

function propose(find: string, replace: string, token: string | null = TOKEN): string {
  const said = call('propose_change', { project: A, epic: EPIC, find, replace, why: 'Better.', agent: 'claude' }, token)
  return /Filed as (p-[0-9a-f]+)/.exec(said)![1]!
}

const decide = (id: string, decision: 'accept' | 'decline', reason?: string) =>
  answer('POST', '/api/proposal', new URLSearchParams(), { project: A, epic: EPIC, id, decision, ...(reason ? { reason } : {}) }, TICKET)

describe('the follow-up digest', () => {
  test('answered all: one digest after the quiet while, to the token the proposal came with', () => {
    const a = propose('What does a manifest settle?', 'What does a manifest decide?')
    const b = propose('Who owns the repository', 'Who forked the repository')
    expect(decide(a, 'accept')?.status).toBe(200)
    expect(clock.waiting()).toBe(0)
    expect(decide(b, 'decline', 'Ownership is the point.')?.status).toBe(200)
    expect(told).toEqual([])
    clock.advance(DIGEST_QUIET_MS - 1)
    expect(told).toEqual([])
    clock.advance(1)
    expect(told).toHaveLength(1)
    expect(told[0]!.token).toBe(TOKEN)
    expect(told[0]!.project).toBe(A)
    expect(told[0]!.body).toBe(
      `Your 2 proposed changes to ${EPIC} were answered: 1 accepted, 1 declined: "Ownership is the point.". list_proposals shows each one.`,
    )
  })

  test('no message per decision: one answered of two says nothing while the other is open', () => {
    const a = propose('What does a manifest settle?', 'What does a manifest decide?')
    propose('Who owns the repository', 'Who forked the repository')
    decide(a, 'decline', 'No.')
    clock.advance(DIGEST_QUIET_MS * 10)
    expect(told).toEqual([])
  })

  test('a decision in the quiet while starts it again, and every declined reason is said', () => {
    const a = propose('What does a manifest settle?', 'What does a manifest decide?')
    decide(a, 'decline', 'First.')
    clock.advance(DIGEST_QUIET_MS - 1000)
    const b = propose('Who owns the repository', 'Who forked the repository')
    decide(b, 'decline', 'Second.')
    clock.advance(DIGEST_QUIET_MS - 1000)
    expect(told).toEqual([])
    clock.advance(1000)
    expect(told.map((one) => one.body)).toEqual([
      `Your 2 proposed changes to ${EPIC} were answered: 2 declined: "First."; "Second.". list_proposals shows each one.`,
    ])
  })

  test('a proposal filed without a place token is told nothing', () => {
    const a = propose('What does a manifest settle?', 'What does a manifest decide?', null)
    decide(a, 'decline', 'No.')
    clock.advance(DIGEST_QUIET_MS)
    expect(told).toEqual([])
  })
})
