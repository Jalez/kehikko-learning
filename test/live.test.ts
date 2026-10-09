import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'

import { TICKET, answer, stream } from '../doors.ts'
import { SETTLE_MS, watchQuizzes, watching } from '../quiz/live.ts'
import { versionOf } from '../quiz/questions.ts'
import type { QuizChange, QuizFile } from '../quiz/types.ts'

/**
 * The watch an open editor listens to: what it is told when a quiz file
 * changes, by which path, and who may listen.
 */

const home = realpathSync(mkdtempSync(join(tmpdir(), 'learning-live-')))
afterAll(() => rmSync(home, { recursive: true, force: true }))

function project(name: string): string {
  const dir = join(home, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS * 4))
const QUIZ = '## Which half? \n<!-- id: q1 -->\n- [ ] the page\n- [x] the manifest\n'
const save = (dir: string, text: string, base: string | null) =>
  answer('POST', '/api/quiz', new URLSearchParams(), { project: dir, epic: 'thesis', text, base, session: 's1' }, TICKET)

describe('watching quiz files', () => {
  test('a save from the page is told to every watcher, once, with the version it answered with', async () => {
    const dir = project('page')
    const seen: QuizChange[] = []
    const open = stream('GET', '/api/watch', new URLSearchParams({ project: dir, ticket: TICKET }), (change) => seen.push(change))
    if (!open || !('close' in open)) throw new Error('the watch did not open')

    const reply = save(dir, QUIZ, null)
    await settle()
    expect(seen).toEqual([{ epic: 'thesis', version: (reply?.body as { file: QuizFile }).file.version }])
    open.close()
    expect(watching()).toBe(0)
  })

  test('a file edited on disk, and a file going away, are told too — and nothing that is not a quiz file is', async () => {
    const dir = project('disk')
    save(dir, QUIZ, null)
    const folder = join(dir, KEHIKOT_DIR, 'learning')
    const seen: QuizChange[] = []
    const stop = watchQuizzes(dir, (change) => seen.push(change))
    if ('error' in stop) throw new Error(stop.error)

    writeFileSync(join(folder, 'thesis.md'), '## by hand\n')
    writeFileSync(join(folder, 'answers.json'), '{}')
    await settle()
    expect(seen).toEqual([{ epic: 'thesis', version: versionOf('## by hand\n') }])

    rmSync(join(folder, 'thesis.md'))
    await settle()
    expect(seen.at(-1)).toEqual({ epic: 'thesis', version: null })
    stop.close()
  })

  test('what is told is never a word of the file', async () => {
    const dir = project('key')
    const seen: QuizChange[] = []
    const stop = watchQuizzes(dir, (change) => seen.push(change))
    if ('error' in stop) throw new Error(stop.error)
    save(dir, QUIZ, null)
    await settle()
    expect(seen).toHaveLength(1)
    expect(Object.keys(seen[0]!).sort()).toEqual(['epic', 'version'])
    expect(JSON.stringify(seen)).not.toContain('manifest')
    stop.close()
  })

  test('a project with no questions folder yet can be watched without one being made', () => {
    const dir = project('empty')
    const stop = watchQuizzes(dir, () => {})
    if ('error' in stop) throw new Error(stop.error)
    stop.close()
    expect(watching()).toBe(0)
    expect(existsSync(join(dir, KEHIKOT_DIR))).toBe(false)
    expect('error' in watchQuizzes('relative', () => {})).toBe(true)
  })

  test('the door is behind the ticket, and is only this path', () => {
    const dir = project('gate')
    const without = stream('GET', '/api/watch', new URLSearchParams({ project: dir }), () => {})
    expect(without && 'reply' in without ? without.reply.status : null).toBe(403)
    const wrong = stream('GET', '/api/watch', new URLSearchParams({ project: dir, ticket: 'nope' }), () => {})
    expect(wrong && 'reply' in wrong ? wrong.reply.status : null).toBe(403)
    expect(stream('GET', '/api/quiz', new URLSearchParams({ project: dir, ticket: TICKET }), () => {})).toBeNull()
    expect(stream('POST', '/api/watch', new URLSearchParams({ project: dir, ticket: TICKET }), () => {})).toBeNull()
    expect(watching()).toBe(0)
  })
})
