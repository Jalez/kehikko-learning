import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'

import { change, forEpic, score, standings, withKey } from '../quiz/questions.ts'

/**
 * The move out of `questions.json` — the one JSON file this module kept before
 * its questions were Markdown — against a real folder holding a file in the
 * shape real projects hold.
 */
let project = ''
let folder = ''

const question = (id: string, epic: string, over: Record<string, unknown> = {}) => ({
  id,
  epic,
  question: `What does ${id} ask?`,
  options: ['the first', 'the second', 'the third'],
  answer: 1,
  why: `Because of ${id}.`,
  passage: { path: 'chapters/1_introduction.tex', start: 10, end: 60, quote: 'It is the graded activity\nthat this thesis takes as its object of study.' },
  by: 'claude-code',
  viaMcp: true,
  at: '2026-08-31T22:09:26.946Z',
  attempts: [],
  ...over,
})

const OLD = {
  questions: [
    question('b13a66fc', 'thesis'),
    question('6a485eae', 'thesis', { attempts: [{ chose: 0, right: false, at: '2026-09-04T12:06:45.181Z' }] }),
    question('0c0ffee0', 'thesis', { passage: { path: 'chapters/gone.tex', start: 1, end: 2, quote: 'words in a file that moved' } }),
    question('aaaa1111', 'bridge', { why: 'Two lines.\n## And a heading, which a file would read as a question' }),
  ],
}

const raw = JSON.stringify(OLD, null, 2)

beforeEach(() => {
  project = realpathSync(mkdtempSync(join(tmpdir(), 'learning-migrate-')))
  folder = join(project, KEHIKOT_DIR, 'learning')
  mkdirSync(folder, { recursive: true })
  mkdirSync(join(project, 'chapters'))
  writeFileSync(join(project, 'chapters', '1_introduction.tex'), 'Intro.\nIt is the graded activity\nthat this thesis takes as its object of study.\n')
  writeFileSync(join(folder, 'questions.json'), raw)
})

afterEach(() => {
  rmSync(project, { recursive: true, force: true })
})

describe('the first time questions.json is found', () => {
  test('a READ moves it: one Markdown file per epic, the answers beside them, and the old file renamed untouched', () => {
    const { questions, trouble } = forEpic(project, 'thesis')
    expect(trouble).toBeNull()
    expect(questions.map((q) => q.id)).toEqual(['b13a66fc', '6a485eae', '0c0ffee0'])
    expect(readdirSync(folder).sort()).toEqual(['answers.json', 'bridge.md', 'questions.migrated.json', 'thesis.md'])
    expect(readFileSync(join(folder, 'questions.migrated.json'), 'utf8')).toBe(raw)
  })

  test('the Markdown is the documented shape, with the old ids, the key as a tick, and shared sources listed once', () => {
    forEpic(project, 'thesis')
    expect(readFileSync(join(folder, 'thesis.md'), 'utf8')).toBe(
      [
        '## What does b13a66fc ask? [^1]',
        '<!-- id: b13a66fc -->',
        '- [ ] the first',
        '- [x] the second',
        '- [ ] the third',
        '',
        'Why:',
        'Because of b13a66fc.',
        '',
        '## What does 6a485eae ask? [^1]',
        '<!-- id: 6a485eae -->',
        '- [ ] the first',
        '- [x] the second',
        '- [ ] the third',
        '',
        'Why:',
        'Because of 6a485eae.',
        '',
        '## What does 0c0ffee0 ask? [^2]',
        '<!-- id: 0c0ffee0 -->',
        '- [ ] the first',
        '- [x] the second',
        '- [ ] the third',
        '',
        'Why:',
        'Because of 0c0ffee0.',
        '',
        'Sources:',
        '[^1]: chapters/1_introduction.tex | "It is the graded activity that this thesis takes as its object of study."',
        '[^2]: chapters/gone.tex | "words in a file that moved"',
        '',
      ].join('\n'),
    )
  })

  test('every answer comes across under the same id, and keeps the key earned', () => {
    const { questions } = forEpic(project, 'thesis')
    expect(questions[1]).toMatchObject({ id: '6a485eae', attempts: [{ chose: 0, right: false, at: '2026-09-04T12:06:45.181Z' }], answer: 1 })
    expect(questions[0]).toMatchObject({ attempts: [], answer: null, why: null })
    expect(standings(project).standings).toEqual([
      { epic: 'bridge', questions: 1, answered: 0, right: 0 },
      { epic: 'thesis', questions: 3, answered: 1, right: 0 },
    ])
  })

  test('the byte range is not carried: the words are found again, and a source that has gone says so', () => {
    const { questions } = forEpic(project, 'thesis')
    expect(questions[0]?.source).toMatchObject({ status: 'holds', at: { from: 7, line: 2, endLine: 3 } })
    expect(questions[2]?.source).toMatchObject({ status: 'unreadable', at: null })
  })

  test('an explanation the file would read as structure is joined into one line rather than splitting the question', () => {
    const { questions } = withKey(project, 'bridge')
    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({ key: 1, question: { id: 'aaaa1111', why: 'Two lines. ## And a heading, which a file would read as a question' } })
  })

  test('it happens once: the moved files are then the truth, and deleting one does not bring it back', () => {
    forEpic(project, 'thesis')
    rmSync(join(folder, 'bridge.md'))
    expect(forEpic(project, 'bridge').questions).toEqual([])
    expect(existsSync(join(folder, 'bridge.md'))).toBe(false)
  })

  test('a write finds it too, and adds to what was moved rather than starting an empty file over it', () => {
    const out = change({
      op: 'add',
      project,
      epic: 'thesis',
      question: 'A new one',
      options: ['a', 'b'],
      answer: 0,
      why: '',
      path: 'chapters/1_introduction.tex',
      quote: 'It is the graded activity',
    })
    expect(out.ok).toBe(true)
    expect(forEpic(project, 'thesis').questions).toHaveLength(4)
    expect('scored' in score(project, 'thesis', 'b13a66fc', 1)).toBe(true)
  })
})

describe('what the move will not do', () => {
  test('write over an <epic>.md that is already there: that epic’s old questions stay in the renamed file only', () => {
    writeFileSync(join(folder, 'thesis.md'), '## Mine [^1]\n- [x] a\n- b\n')
    expect(forEpic(project, 'thesis').questions.map((q) => q.question)).toEqual(['Mine'])
    expect(readFileSync(join(folder, 'thesis.md'), 'utf8')).toBe('## Mine [^1]\n- [x] a\n- b\n')
    expect(existsSync(join(folder, 'bridge.md'))).toBe(true)
    expect(readFileSync(join(folder, 'questions.migrated.json'), 'utf8')).toBe(raw)
  })

  test('write over an earlier questions.migrated.json', () => {
    writeFileSync(join(folder, 'questions.migrated.json'), 'an earlier one')
    forEpic(project, 'thesis')
    expect(readFileSync(join(folder, 'questions.migrated.json'), 'utf8')).toBe('an earlier one')
    expect(readFileSync(join(folder, 'questions.migrated-2.json'), 'utf8')).toBe(raw)
  })

  test('treat a questions.json that will not parse as empty: nothing is moved, shown or written', () => {
    writeFileSync(join(folder, 'questions.json'), '{ "questions": [')
    const { questions, trouble } = forEpic(project, 'thesis')
    expect(questions).toEqual([])
    expect(trouble).toContain('could not be read')
    expect(trouble).toContain('recoverable')
    expect(change({ op: 'retake', project, epic: 'thesis' }).ok).toBe(false)
    expect(readdirSync(folder)).toEqual(['questions.json'])
    expect(readFileSync(join(folder, 'questions.json'), 'utf8')).toBe('{ "questions": [')
  })
})
