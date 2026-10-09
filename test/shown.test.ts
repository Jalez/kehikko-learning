import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'

import { TICKET, answer } from '../doors.ts'

/**
 * The shuffle, asked of the doors: the page is sent each question's options in
 * an order that is not the file's, and everything that speaks in option indexes
 * — a press, the reveal, what was answered before, a retake, an undo — points
 * at the right WORDS. What is kept (the Markdown, `answers.json`) and what an
 * agent or the editor is shown stay in file order.
 *
 * Every assertion about "which option" is made by its text, because that is
 * the only thing the page and the file both call it.
 */

const EPIC = 'thesis'
const MANY = 40
let dir = ''

const nothing = new URLSearchParams()
const folder = () => join(dir, KEHIKOT_DIR, 'learning')
const stored = () => JSON.parse(readFileSync(join(folder(), 'answers.json'), 'utf8')) as Record<string, Record<string, { chose: number; right: boolean }[]>>
const salts = () => JSON.parse(readFileSync(join(folder(), 'order.json'), 'utf8')) as Record<string, string>

/** Question `n` as the file has it: the right option FIRST, as authors write them. */
const RIGHT = (n: number) => `right answer to ${n}`
const WRONG = (n: number, k: number) => `wrong answer ${k} to ${n}`
const fileOrder = (n: number) => [RIGHT(n), WRONG(n, 1), WRONG(n, 2), WRONG(n, 3)]

function tool(name: string, args: Record<string, unknown>): string {
  const reply = answer('POST', '/mcp', nothing, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { project: dir, ...args } } }, null)
  const result = (reply?.body as { result: { content: { text: string }[]; isError?: boolean } }).result
  expect([result.content[0]?.text, result.isError]).toEqual([result.content[0]?.text, undefined])
  return result.content[0]?.text ?? ''
}

function add(n: number, options = fileOrder(n), key = 0): string {
  const text = tool('add_quiz', { epic: EPIC, question: `Question ${n}?`, options, answer: key, why: `Because of ${n}.`, path: 'paper.tex', quote: 'the only half a host reads' })
  return /Question ([0-9a-f]{8}) written/.exec(text)?.[1] ?? ''
}

interface Shown {
  id: string
  question: string
  options: string[]
  answer: number | null
  why: string | null
  attempts: { chose: number; right: boolean }[]
}

/** What the page is sent. */
function served(): Shown[] {
  const reply = answer('GET', '/api/questions', new URLSearchParams({ project: dir, epic: EPIC }), null, null)
  return (reply?.body as { questions: Shown[] }).questions
}

/** Press an option by its words, at whatever position the page shows it. */
function press(id: string, words: string) {
  const chose = served().find((one) => one.id === id)!.options.indexOf(words)
  expect(chose).toBeGreaterThanOrEqual(0)
  const reply = answer('POST', '/api/answer', nothing, { project: dir, epic: EPIC, id, chose }, TICKET)
  expect(reply?.status).toBe(200)
  return reply?.body as { right: boolean; answer: number; why: string; attempt: { chose: number; right: boolean }; asked: Shown }
}

const file = () => (answer('GET', '/api/quiz', new URLSearchParams({ project: dir, epic: EPIC }), null, TICKET)?.body as { file: { text: string; version: string } }).file

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-shown-')))
  writeFileSync(join(dir, 'paper.tex'), 'The manifest is the only half a host reads.')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('what the page is sent', () => {
  test('the right option is first in every question of the file, and is not where the page finds it', () => {
    const ids = Array.from({ length: MANY }, (_, n) => add(n))
    const before = served()
    expect(before).toHaveLength(MANY)

    /* The same options, every one of them, and not in the file's order. */
    before.forEach((one, n) => expect(one.options.toSorted()).toEqual(fileOrder(n).toSorted()))
    expect(before.filter((one, n) => one.options.join() === fileOrder(n).join()).length).toBeLessThan(MANY / 4)

    /* Learned the only way the page can learn it: by answering. */
    const at = [0, 0, 0, 0]
    ids.forEach((id, n) => {
      const out = press(id, WRONG(n, 2))
      expect(out.asked.options[out.answer]).toBe(RIGHT(n))
      at[out.answer]! += 1
    })
    /* Forty questions over four positions: none of them holds the key every time, and each holds it sometimes. */
    for (const count of at) expect(count).toBeGreaterThan(0)
    for (const count of at) expect(count).toBeLessThan(MANY * 0.6)
  })

  test('a question carries its options and nothing that says where they came from', () => {
    add(0)
    const reply = answer('GET', '/api/questions', new URLSearchParams({ project: dir, epic: EPIC }), null, null)
    const [question] = (reply?.body as { questions: Record<string, unknown>[] }).questions
    expect(Object.keys(question!).sort()).toEqual(['answer', 'attempts', 'id', 'options', 'question', 'source', 'why'])
    expect(question!.options).toEqual(expect.arrayContaining(fileOrder(0)))
    for (const option of question!.options as unknown[]) expect(typeof option).toBe('string')
    /* The salt the order comes from is on disk and in no reply. */
    expect(JSON.stringify(reply?.body)).not.toContain(salts()[EPIC]!)
    expect(JSON.stringify(reply?.body)).not.toContain('order.json')
  })

  test('an "All of the above" stays last, whatever happens to the rest', () => {
    for (let n = 0; n < 12; n += 1) add(n, [RIGHT(n), WRONG(n, 1), 'None of the above', WRONG(n, 2), 'All of the above'])
    const firsts = new Set<string>()
    for (const one of served()) {
      expect(one.options.slice(3)).toEqual(['None of the above', 'All of the above'])
      firsts.add(one.options[0]!.replace(/ to \d+$/, ''))
    }
    expect(firsts.size).toBeGreaterThan(1)
  })
})

describe('the order holds still', () => {
  test('across polls, across an answer, and across what a restart leaves behind — the file on disk', () => {
    const ids = Array.from({ length: 8 }, (_, n) => add(n))
    const first = served().map((one) => one.options)
    for (let poll = 0; poll < 5; poll += 1) expect(served().map((one) => one.options)).toEqual(first)
    press(ids[3]!, WRONG(3, 1))
    press(ids[5]!, RIGHT(5))
    expect(served().map((one) => one.options)).toEqual(first)
    /* A write by an agent to another question moves nothing either. */
    tool('reword_quiz', { id: ids[0], why: 'Said better.' })
    add(99)
    expect(served().slice(0, 8).map((one) => one.options)).toEqual(first)
    /* Nothing is held in this process: the salt is one line in a file. */
    expect(Object.keys(salts())).toEqual([EPIC])
    expect(salts()[EPIC]).toMatch(/^[0-9a-f]{32}$/)
  })

  test('the salt is minted when the page is first sent questions — not by an agent reading, and not for an epic with none', () => {
    answer('GET', '/api/questions', new URLSearchParams({ project: dir, epic: EPIC }), null, null)
    expect(existsSync(join(dir, KEHIKOT_DIR))).toBe(false)
    add(0)
    tool('quizzes', { epic: EPIC, reveal: true })
    tool('quizzes', {})
    expect(existsSync(join(folder(), 'order.json'))).toBe(false)
    served()
    expect(existsSync(join(folder(), 'order.json'))).toBe(true)
  })

  test('an order file that will not parse is replaced rather than believed, and the answers still land on their words', () => {
    const id = add(0)
    press(id, WRONG(0, 3))
    writeFileSync(join(folder(), 'order.json'), '{ not json')
    const [question] = served()
    expect(question!.options[question!.attempts[0]!.chose]).toBe(WRONG(0, 3))
    expect(question!.options[question!.answer!]).toBe(RIGHT(0))
    expect(salts()[EPIC]).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('a press, the reveal and what was answered before', () => {
  test('a wrong press and a right one are graded against the file, and shown against the words that were pressed', () => {
    const ids = Array.from({ length: 10 }, (_, n) => add(n))
    ids.forEach((id, n) => {
      const pressed = n % 2 ? RIGHT(n) : WRONG(n, 1 + (n % 3))
      const out = press(id, pressed)
      expect(out.right).toBe(n % 2 === 1)
      expect(out.attempt.right).toBe(n % 2 === 1)
      expect(out.asked.options[out.attempt.chose]).toBe(pressed)
      expect(out.asked.options[out.answer]).toBe(RIGHT(n))
      expect(out.asked.answer).toBe(out.answer)
      expect(out.why).toBe(`Because of ${n}.`)
    })
    /* And on the next read — a poll, or the page loaded again. */
    served().forEach((one, n) => {
      const pressed = n % 2 ? RIGHT(n) : WRONG(n, 1 + (n % 3))
      expect(one.options[one.attempts.at(-1)!.chose]).toBe(pressed)
      expect(one.options[one.answer!]).toBe(RIGHT(n))
      expect(one.why).toBe(`Because of ${n}.`)
    })
  })

  test('what is KEPT is the file’s index, so the Markdown and answers.json still mean each other', () => {
    const ids = Array.from({ length: 10 }, (_, n) => add(n))
    ids.forEach((id, n) => press(id, WRONG(n, 2)))
    for (const id of ids) expect(stored()[EPIC]![id]).toMatchObject([{ chose: 2, right: false }])
    /* And the agent is told in the file's numbering, beside the words. */
    const text = tool('quizzes', { epic: EPIC })
    expect(text).toContain(`the reader chose 2 (${WRONG(4, 2)}) and was WRONG`)
    expect(text).toContain(`answer: 0. ${RIGHT(4)}`)
    expect(text).toContain(`     [0] ${RIGHT(4)}\n     [1] ${WRONG(4, 1)}\n     [2] ${WRONG(4, 2)}\n     [3] ${WRONG(4, 3)}`)
  })

  test('answers from before there was a shuffle — file indexes, no stamp — show against the right words', () => {
    const ids = Array.from({ length: 10 }, (_, n) => add(n))
    writeFileSync(
      join(folder(), 'answers.json'),
      JSON.stringify({ [EPIC]: Object.fromEntries(ids.map((id, n) => [id, [{ chose: n % 4, right: n % 4 === 0, at: '2026-09-04T12:00:00.000Z' }]])) }),
    )
    served().forEach((one, n) => {
      expect(one.options[one.attempts[0]!.chose]).toBe(fileOrder(n)[n % 4]!)
      expect(one.attempts[0]!.right).toBe(n % 4 === 0)
      expect(one.options[one.answer!]).toBe(RIGHT(n))
    })
  })

  test('several attempts at one question each keep their own words', () => {
    const id = add(0)
    for (const words of [WRONG(0, 3), WRONG(0, 1), RIGHT(0)]) press(id, words)
    const [question] = served()
    expect(question!.attempts.map((attempt) => question!.options[attempt.chose])).toEqual([WRONG(0, 3), WRONG(0, 1), RIGHT(0)])
    expect(stored()[EPIC]![id]!.map((attempt) => attempt.chose)).toEqual([3, 1, 0])
  })

  test('a position that is not one is refused, and nothing is recorded', () => {
    const id = add(0)
    for (const chose of [4, 47, -1]) {
      const reply = answer('POST', '/api/answer', nothing, { project: dir, epic: EPIC, id, chose }, TICKET)
      expect(reply?.status).toBe(400)
    }
    expect(existsSync(join(folder(), 'answers.json'))).toBe(false)
  })
})

describe('asking again', () => {
  test('a retake forgets the answers and deals a new order, which then holds still', () => {
    const ids = Array.from({ length: MANY }, (_, n) => add(n))
    const first = served().map((one) => one.options)
    const salt = salts()[EPIC]
    press(ids[0]!, RIGHT(0))

    const reply = answer('POST', '/api/retake', nothing, { project: dir, epic: EPIC }, TICKET)
    const again = (reply?.body as { questions: Shown[] }).questions
    expect(again.every((one) => one.answer === null && one.attempts.length === 0)).toBe(true)
    expect(salts()[EPIC]).not.toBe(salt)
    /* Forty questions: most of them moved. The same options, though. */
    expect(again.filter((one, n) => one.options.join() === first[n]!.join()).length).toBeLessThan(MANY / 4)
    again.forEach((one, n) => expect(one.options.toSorted()).toEqual(fileOrder(n).toSorted()))
    /* What the retake answered with is what the next poll says. */
    expect(served().map((one) => one.options)).toEqual(again.map((one) => one.options))
    /* And a press after it lands on its words in the new order. */
    const out = press(ids[1]!, WRONG(1, 2))
    expect(out.asked.options[out.attempt.chose]).toBe(WRONG(1, 2))
    expect(stored()[EPIC]![ids[1]!]).toMatchObject([{ chose: 2 }])
  })

  test('another epic’s order is left alone by it', () => {
    add(0)
    tool('add_quiz', { epic: 'other', question: 'Other?', options: fileOrder(7), answer: 0, why: '', path: 'paper.tex', quote: 'the only half a host reads' })
    served()
    answer('GET', '/api/questions', new URLSearchParams({ project: dir, epic: 'other' }), null, null)
    const before = salts()
    answer('POST', '/api/retake', nothing, { project: dir, epic: EPIC }, TICKET)
    expect(salts().other).toBe(before.other!)
    expect(salts()[EPIC]).not.toBe(before[EPIC]!)
  })
})

describe('the editor and the file', () => {
  test('the editor is handed the file in the file’s order, and a save that changes no option disturbs no answer', () => {
    const ids = Array.from({ length: 6 }, (_, n) => add(n))
    ids.forEach((id, n) => press(id, WRONG(n, 1 + (n % 3))))
    const order = served().map((one) => one.options)
    const { text, version } = file()
    for (let n = 0; n < 6; n += 1) {
      expect(text).toContain(`- [x] ${RIGHT(n)}\n- [ ] ${WRONG(n, 1)}\n- [ ] ${WRONG(n, 2)}\n- [ ] ${WRONG(n, 3)}\n`)
    }
    const saved = answer('POST', '/api/quiz', nothing, { project: dir, epic: EPIC, text: text.replace('Because of 2.', 'Because of two.'), base: version, session: 's' }, TICKET)
    expect(saved?.status).toBe(200)
    const after = served()
    expect(after.map((one) => one.options)).toEqual(order)
    after.forEach((one, n) => {
      expect(one.options[one.attempts[0]!.chose]).toBe(WRONG(n, 1 + (n % 3)))
      expect(one.options[one.answer!]).toBe(RIGHT(n))
    })
    expect(after[2]!.why).toBe('Because of two.')
  })

  test('reordering a question’s options in the editor un-answers that one, as it always did, and an undo brings the answer back on its words', () => {
    const ids = [add(0), add(1)]
    press(ids[0]!, WRONG(0, 3))
    press(ids[1]!, WRONG(1, 2))
    const { text, version } = file()
    const moved = text.replace(`- [x] ${RIGHT(0)}\n- [ ] ${WRONG(0, 1)}\n`, `- [ ] ${WRONG(0, 1)}\n- [x] ${RIGHT(0)}\n`)
    expect(moved).not.toBe(text)
    answer('POST', '/api/quiz', nothing, { project: dir, epic: EPIC, text: moved, base: version, session: 's' }, TICKET)

    let [first, second] = served()
    expect(first).toMatchObject({ attempts: [], answer: null, why: null })
    expect(second!.options[second!.attempts[0]!.chose]).toBe(WRONG(1, 2))

    const history = answer('GET', '/api/history', new URLSearchParams({ project: dir, epic: EPIC }), null, TICKET)
    const entry = (history?.body as { entries: { id: string; agent: string }[] }).entries.find((one) => one.agent === 'person')
    expect(answer('POST', '/api/undo', nothing, { project: dir, epic: EPIC, id: entry!.id }, TICKET)?.status).toBe(200)
    ;[first, second] = served()
    expect(first!.options[first!.attempts[0]!.chose]).toBe(WRONG(0, 3))
    expect(first!.options[first!.answer!]).toBe(RIGHT(0))
    expect(second!.options[second!.attempts[0]!.chose]).toBe(WRONG(1, 2))
  })

  test('an agent moving the key by index means the file’s index', () => {
    const id = add(0)
    tool('reword_quiz', { id, answer: 3 })
    expect(file().text).toContain(`- [ ] ${RIGHT(0)}\n- [ ] ${WRONG(0, 1)}\n- [ ] ${WRONG(0, 2)}\n- [x] ${WRONG(0, 3)}\n`)
    expect(press(id, WRONG(0, 3)).right).toBe(true)
  })

  test('a hand-typed file with no ids is shuffled and answered like any other', () => {
    mkdirSync(folder(), { recursive: true })
    writeFileSync(join(folder(), `${EPIC}.md`), '## Which half does a host read?\n- the page\n- the stylesheet\n- [x] the manifest\n- the README\n\nWhy:\nOnly that.\n')
    const [question] = served()
    const out = press(question!.id, 'the manifest')
    expect(out.right).toBe(true)
    expect(out.asked.options).toEqual(question!.options)
    expect(stored()[EPIC]![question!.id]).toMatchObject([{ chose: 2, right: true }])
  })
})
