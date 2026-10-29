import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'
import { watching } from 'kehikot-module-protocol/serve'

import { TICKET, answerAt as door, stream } from '../doors.ts'
import { EVENTS_PATH, NEWS, folderOf, stopWatching, topicOf } from '../quiz/news.ts'

/**
 * The reading page's stream: the server says the questions changed, where they change, so the page
 * never asks on a clock. Called as the doors call it, with an `emit` that collects.
 */

const home = realpathSync(mkdtempSync(join(tmpdir(), 'learning-news-')))
afterAll(() => rmSync(home, { recursive: true, force: true }))
afterEach(() => stopWatching())

const EPIC = 'thesis'
const QUIZ = '## Which half? \n<!-- id: q1 -->\n- [ ] the page\n- [x] the manifest\n'
/* Longer than the settling (50 ms) and a file event's arrival. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 250))

function project(name: string): string {
  const dir = join(home, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'methods.tex'), 'The manifest is the half a host reads.')
  return dir
}

const mcp = (dir: string, name: string, args: Record<string, unknown>) =>
  door('POST', '/mcp', new URLSearchParams(), { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { project: dir, ...args } } }, null)

function open(dir: string) {
  const heard: unknown[] = []
  const live = stream('GET', EVENTS_PATH, new URLSearchParams({ project: dir }), (event) => heard.push(event), null)
  if (!live || !('close' in live)) throw new Error('the questions stream did not open')
  return { heard, close: live.close }
}

describe('the questions stream', () => {
  test('opens with the news once, then news at every write: an agent, an answer, a retake, the editor', async () => {
    const dir = project('writes')
    const { heard, close } = open(dir)
    expect(heard).toEqual([NEWS])
    expect(watching(topicOf(folderOf(dir)!))).toBe(1)

    /* An agent's add_quiz, into a project that had no questions folder yet. */
    mcp(dir, 'add_quiz', { epic: EPIC, question: 'Which half?', options: ['the page', 'the manifest'], answer: 1, why: 'Because.', path: 'methods.tex', quote: 'the half a host reads' })
    await settle()
    expect(heard.length).toBe(2)

    const read = door('GET', '/api/questions', new URLSearchParams({ project: dir, epic: EPIC }), null, null)?.body as { order: string; questions: { id: string }[] }
    const id = read.questions[0]!.id
    door('POST', '/api/answer', new URLSearchParams(), { project: dir, epic: EPIC, id, chose: 0, order: read.order }, TICKET)
    await settle()
    expect(heard.length).toBe(3)

    door('POST', '/api/retake', new URLSearchParams(), { project: dir, epic: EPIC }, TICKET)
    await settle()
    expect(heard.length).toBe(4)

    door('POST', '/api/quiz', new URLSearchParams(), { project: dir, epic: 'another', text: QUIZ, base: null, session: 's1' }, TICKET)
    await settle()
    expect(heard.length).toBe(5)
    expect(heard.every((one) => JSON.stringify(one) === JSON.stringify(NEWS))).toBe(true)

    close()
    expect(watching(topicOf(folderOf(dir)!))).toBe(0)
  })

  test('a file edited by hand is news too, once the host has vouched for the folder', async () => {
    const dir = project('by-hand')
    mkdirSync(join(dir, KEHIKOT_DIR, 'learning'), { recursive: true })
    const { heard, close } = open(dir)
    await settle()
    writeFileSync(join(dir, KEHIKOT_DIR, 'learning', `${EPIC}.md`), QUIZ)
    await settle()
    expect(heard.length).toBeGreaterThan(1)
    close()
  })

  test('a questions folder that appears by hand in a project that had none is news', async () => {
    const dir = project('appears')
    const { heard, close } = open(dir)
    await settle()
    mkdirSync(join(dir, KEHIKOT_DIR, 'learning'), { recursive: true })
    await settle()
    const before = heard.length
    expect(before).toBeGreaterThan(1)
    writeFileSync(join(dir, KEHIKOT_DIR, 'learning', `${EPIC}.md`), QUIZ)
    await settle()
    expect(heard.length).toBeGreaterThan(before)
    close()
  })

  test('nobody following: a write publishes nothing; another path, or no project, is not this stream', async () => {
    const dir = project('nobody')
    mcp(dir, 'add_quiz', { epic: EPIC, question: 'Which half?', options: ['the page', 'the manifest'], answer: 1, why: 'Because.', path: 'methods.tex', quote: 'the half a host reads' })
    expect(watching(topicOf(folderOf(dir)!))).toBe(0)
    expect(stream('GET', '/api/questions', new URLSearchParams({ project: dir }), () => {}, null)).toBeNull()
    expect(stream('GET', EVENTS_PATH, new URLSearchParams(), () => {}, null)).toBeNull()
  })
})
