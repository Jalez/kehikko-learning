import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'

import { MAX_ATTEMPTS, MAX_OPTIONS, MIN_OPTIONS, change, forEpic, score, standings, withKey, type Op } from '../quiz/questions.ts'

/**
 * The store, with real files, in real project directories. Not a mock: the
 * store resolves the project path with `realpathSync` before it writes, and
 * half of what this file asserts is about what is ON DISK — the Markdown a
 * person edits, the answers kept beside it, a broken file not written over.
 */
let dir = ''
let A = ''
let B = ''
const EPIC = 'modes-are-modules'
const PAPER = 'So the manifest is the smallest half of this program, and the only half a host reads.'

beforeEach(() => {
  /* `realpathSync` because macOS puts the temp directory behind a symlink. */
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-test-')))
  A = join(dir, 'one')
  B = join(dir, 'two')
  for (const project of [A, B]) {
    mkdirSync(join(project, 'chapters'), { recursive: true })
    writeFileSync(join(project, 'chapters', 'bridge.tex'), PAPER)
  }
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const folder = (project: string) => join(project, KEHIKOT_DIR, 'learning')
const quizFile = (project: string, epic = EPIC) => join(folder(project), `${epic}.md`)
const markdown = (project = A, epic = EPIC) => readFileSync(quizFile(project, epic), 'utf8')

function add(over: Partial<Extract<Op, { op: 'add' }>> = {}) {
  return change({
    op: 'add',
    project: A,
    epic: EPIC,
    question: 'What does the manifest settle?',
    options: ['Which tab the page gets', 'What colour the container is', 'Who owns the repository'],
    answer: 0,
    why: 'The manifest is the only half a host reads.',
    path: 'chapters/bridge.tex',
    quote: 'the manifest is the smallest half',
    ...over,
  })
}

function added(over: Partial<Extract<Op, { op: 'add' }>> = {}): string {
  const out = add(over)
  if (!out.ok) throw new Error(out.error)
  return out.id
}

/** A quiz a person typed, with no ids and no help from this module. */
function typed(text: string, project = A, epic = EPIC): void {
  mkdirSync(folder(project), { recursive: true })
  writeFileSync(quizFile(project, epic), text)
}

const BY_HAND = [
  '# Notes to self: chapter two',
  '',
  '## Which half does a host read? [^1]',
  '- the page',
  '- [x] the manifest',
  '- the stylesheet',
  '',
  'Why:',
  'The manifest is the only half a host reads.',
  '',
  'Sources:',
  '[^1]: chapters/bridge.tex | "the only half a host reads"',
  '',
].join('\n')

describe('writing a question', () => {
  test('an added question comes back for its epic, with its source found', () => {
    const id = added()
    const { questions, trouble, nowhere } = forEpic(A, EPIC)
    expect(trouble).toBeNull()
    expect(nowhere).toBe(false)
    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({ id, question: 'What does the manifest settle?', attempts: [] })
    expect(questions[0]?.source).toMatchObject({ label: '1', path: 'chapters/bridge.tex', status: 'holds', at: { from: 3, to: 36, line: 1, endLine: 1 } })
  })

  test('it is one Markdown file per epic, and nothing else is in the folder', () => {
    added()
    added({ epic: 'another-epic' })
    expect(readdirSync(folder(A)).sort()).toEqual(['another-epic.md', `${EPIC}.md`])
  })

  test('an epic that is not a slug is refused, and nothing is written', () => {
    for (const epic of ['../escape', 'Has Spaces', 'a/b', '']) {
      const out = add({ epic })
      expect(out.ok).toBe(false)
    }
    expect(existsSync(join(A, KEHIKOT_DIR))).toBe(false)
  })

  test(`fewer than ${MIN_OPTIONS} or more than ${MAX_OPTIONS} options is refused`, () => {
    expect(add({ options: ['only one'] }).ok).toBe(false)
    expect(add({ options: Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => `option ${i}`) }).ok).toBe(false)
  })

  test('an empty option, or two identical ones, are refused rather than repaired', () => {
    expect(add({ options: ['a', ''] }).ok).toBe(false)
    const out = add({ options: ['same', 'same', 'other'] })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('two of the options are the same')
  })

  test('an answer outside the options, or a fractional one, is refused', () => {
    expect(add({ answer: 3 }).ok).toBe(false)
    expect(add({ answer: 0.5 }).ok).toBe(false)
  })

  test('a question with no document or no words is refused: every question is tied to a passage', () => {
    expect(add({ path: '' }).ok).toBe(false)
    expect(add({ quote: '' }).ok).toBe(false)
    expect(add({ quote: '   \n ' }).ok).toBe(false)
  })

  test('a quote with line breaks is one line in the file, and still found', () => {
    writeFileSync(join(A, 'chapters', 'bridge.tex'), 'So the manifest\n   is the smallest\nhalf of this program.')
    added({ quote: 'the manifest is\nthe smallest half' })
    expect(markdown()).toContain('[^1]: chapters/bridge.tex | "the manifest is the smallest half"')
    expect(forEpic(A, EPIC).questions[0]?.source).toMatchObject({ status: 'holds', at: { line: 1, endLine: 3 } })
  })
})

describe('the partition by project', () => {
  test('the SAME epic slug in two projects is two files', () => {
    added({ project: A })
    added({ project: B, question: 'A different one' })
    expect(forEpic(A, EPIC).questions.map((q) => q.question)).toEqual(['What does the manifest settle?'])
    expect(forEpic(B, EPIC).questions.map((q) => q.question)).toEqual(['A different one'])
  })

  test('a trailing slash is the same project', () => {
    added({ project: `${A}/` })
    expect(forEpic(A, EPIC).questions).toHaveLength(1)
  })

  test('a write with no project is refused, and a read is nowhere rather than empty', () => {
    const out = add({ project: null })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('no project is open')
    expect(forEpic(null, EPIC)).toMatchObject({ questions: [], nowhere: true, trouble: null })
  })

  test('a project that is not on this machine, or a relative path, is refused with a sentence', () => {
    expect(forEpic(join(dir, 'nope'), EPIC).trouble).toContain('there is no folder')
    expect(forEpic('relative/path', EPIC).trouble).toContain('not an absolute path')
  })

  test('reading creates nothing', () => {
    forEpic(A, EPIC)
    standings(A)
    expect(existsSync(join(A, KEHIKOT_DIR))).toBe(false)
  })
})

describe('a file a person edits', () => {
  test('is read as it was typed: no ids, plain options, a heading above', () => {
    typed(BY_HAND)
    const { questions, problems } = forEpic(A, EPIC)
    expect(problems).toEqual([])
    expect(questions).toHaveLength(1)
    expect(questions[0]).toMatchObject({ question: 'Which half does a host read?', options: ['the page', 'the manifest', 'the stylesheet'] })
    expect(questions[0]?.source?.status).toBe('holds')
  })

  test('an edit shows on the next read, with nothing to restart', () => {
    typed(BY_HAND)
    typed(BY_HAND.replace('- the stylesheet', '- the stylesheet\n- the favicon'))
    expect(forEpic(A, EPIC).questions[0]?.options).toHaveLength(4)
  })

  test('a question that cannot be asked is left out and named, and the others are still asked', () => {
    typed(`${BY_HAND}\n## Half-written\n- one\n- two\n`)
    const { questions, problems } = forEpic(A, EPIC)
    expect(questions).toHaveLength(1)
    expect(problems.join('\n')).toContain('Question 2 (“Half-written”) has no option ticked')
  })

  test('an agent’s write keeps what the person typed, and gives every question a name', () => {
    typed(BY_HAND)
    const before = forEpic(A, EPIC).questions[0]!.id
    added()
    const text = markdown()
    expect(text.startsWith('# Notes to self: chapter two\n')).toBe(true)
    expect(text).toContain(`## Which half does a host read? [^1]\n<!-- id: ${before} -->\n- [ ] the page\n- [x] the manifest`)
    expect(text).toContain('[^1]: chapters/bridge.tex | "the only half a host reads"')
    expect(text).toContain('[^2]: chapters/bridge.tex | "the manifest is the smallest half"')
    expect(forEpic(A, EPIC).questions.map((q) => q.id)[0]).toBe(before)
  })

  test('rewording by hand keeps the answers of a question that has an id', () => {
    const id = added()
    score(A, EPIC, id, 1)
    typed(markdown().replace('What does the manifest settle?', 'What is it that a manifest settles?'))
    const [question] = forEpic(A, EPIC).questions
    expect(question?.question).toBe('What is it that a manifest settles?')
    expect(question?.attempts).toHaveLength(1)
  })

  test('moving the tick by hand changes the key the next answer is graded against', () => {
    const id = added()
    typed(markdown().replace('- [x] Which tab', '- [ ] Which tab').replace('- [ ] Who owns', '- [x] Who owns'))
    const out = score(A, EPIC, id, 2)
    expect('scored' in out && out.scored.right).toBe(true)
  })
})

describe('rewording and dropping', () => {
  test('a reword keeps the id, the source and the attempts', () => {
    const id = added()
    score(A, EPIC, id, 1)
    const out = change({ op: 'reword', project: A, epic: EPIC, id, question: 'What does a manifest decide?', why: '' })
    expect(out.ok).toBe(true)
    const [question] = withKey(A, EPIC).questions
    expect(question).toMatchObject({ question: { id, question: 'What does a manifest decide?', why: '' }, key: 0 })
    expect(question?.attempts).toHaveLength(1)
    expect(question?.source?.status).toBe('holds')
  })

  test('a reword that leaves the key pointing past the options, or blanks the question, is refused', () => {
    const id = added({ answer: 2 })
    expect(change({ op: 'reword', project: A, epic: EPIC, id, options: ['only', 'two'] }).ok).toBe(false)
    expect(change({ op: 'reword', project: A, epic: EPIC, id, question: '' }).ok).toBe(false)
    expect(withKey(A, EPIC).questions[0]?.question.options).toHaveLength(3)
  })

  test('a reword can cite other words, and a source shared with another question is left for it', () => {
    const first = added()
    const second = added({ question: 'A second question about the same words' })
    const out = change({ op: 'reword', project: A, epic: EPIC, id: second, quote: 'the only half a host reads' })
    expect(out.ok).toBe(true)
    const sources = withKey(A, EPIC).questions.map((one) => [one.question.id, one.source?.label, one.source?.quote])
    expect(sources).toEqual([
      [first, '1', 'the manifest is the smallest half'],
      [second, '2', 'the only half a host reads'],
    ])
  })

  test('a drop takes the question, its answers and its source line with it', () => {
    const id = added()
    score(A, EPIC, id, 0)
    const out = change({ op: 'drop', project: A, epic: EPIC, id })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.said).toContain('1 answer')
    expect(markdown()).toBe('\n')
    expect(readFileSync(join(folder(A), 'answers.json'), 'utf8')).not.toContain(id)
  })

  test('a question that is not here is named rather than shrugged at', () => {
    const out = change({ op: 'drop', project: A, epic: EPIC, id: 'nope' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('there is no question "nope"')
  })
})

describe('answers are kept apart from the material', () => {
  test('answering writes answers.json and does not touch the Markdown', () => {
    const id = added()
    const before = markdown()
    score(A, EPIC, id, 1)
    expect(markdown()).toBe(before)
    expect(JSON.parse(readFileSync(join(folder(A), 'answers.json'), 'utf8'))).toMatchObject({ [EPIC]: { [id]: [{ chose: 1, right: false }] } })
  })

  test(`only the most recent ${MAX_ATTEMPTS} attempts survive, on disk`, () => {
    const id = added()
    for (let i = 0; i < MAX_ATTEMPTS + 3; i += 1) score(A, EPIC, id, i % 3)
    const kept = JSON.parse(readFileSync(join(folder(A), 'answers.json'), 'utf8'))[EPIC][id]
    expect(kept).toHaveLength(MAX_ATTEMPTS)
    expect(kept.at(-1).chose).toBe((MAX_ATTEMPTS + 2) % 3)
  })

  test('an answers.json that will not parse is not treated as no answers, and is not written over', () => {
    const id = added()
    writeFileSync(join(folder(A), 'answers.json'), '{ not json')
    expect(forEpic(A, EPIC).trouble).toContain('could not be read')
    expect(forEpic(A, EPIC).questions).toEqual([])
    expect('error' in score(A, EPIC, id, 0)).toBe(true)
    expect(add().ok).toBe(false)
    expect(readFileSync(join(folder(A), 'answers.json'), 'utf8')).toBe('{ not json')
  })

  test('the standings count what has been answered and what was right', () => {
    const first = added()
    added({ question: 'A second' })
    added({ epic: 'another-epic' })
    score(A, EPIC, first, 0)
    expect(standings(A).standings).toEqual([
      { epic: 'another-epic', questions: 1, answered: 0, right: 0 },
      { epic: EPIC, questions: 2, answered: 1, right: 1 },
    ])
  })
})

describe('the key is withheld until it is earned', () => {
  test('a question nobody has answered leaves here with no key and no explanation, under any name', () => {
    added()
    typed(`${markdown()}`)
    const out = forEpic(A, EPIC)
    expect(out.questions[0]?.answer).toBeNull()
    expect(out.questions[0]?.why).toBeNull()
    const sent = JSON.stringify(out)
    expect(sent).not.toContain('The manifest is the only half a host reads.')
    expect(sent).not.toContain('[x]')
    expect(sent).not.toContain('correct')
  })

  test('what is wrong with a file is said without saying which option is ticked', () => {
    typed('## Two ticks [^1]\n- [x] the first\n- [x] the second\n- the third\n\nSources:\n[^1]: chapters/bridge.tex | "smallest half"\n')
    const sent = JSON.stringify(forEpic(A, EPIC))
    expect(sent).toContain('has 2 options ticked')
    expect(sent).not.toContain('the first')
  })

  test('it is handed over once there is an attempt, and a retake puts it back out of reach', () => {
    const id = added()
    const out = score(A, EPIC, id, 2)
    expect(out).toMatchObject({ scored: { right: false, answer: 0, why: 'The manifest is the only half a host reads.', asked: { answer: 0 } } })
    expect(forEpic(A, EPIC).questions[0]).toMatchObject({ answer: 0, why: 'The manifest is the only half a host reads.' })
    expect(change({ op: 'retake', project: A, epic: EPIC })).toMatchObject({ ok: true, said: `1 answer forgotten for ${EPIC}` })
    expect(forEpic(A, EPIC).questions[0]).toMatchObject({ answer: null, why: null, attempts: [] })
  })

  test('an option that does not exist is refused, not scored as wrong', () => {
    const id = added()
    for (const chose of [3, -1, 0.5]) expect('error' in score(A, EPIC, id, chose)).toBe(true)
    expect(existsSync(join(folder(A), 'answers.json'))).toBe(false)
  })

  test('a question in another project, or one that cannot be asked, cannot be answered', () => {
    const id = added()
    expect('error' in score(B, EPIC, id, 0)).toBe(true)
    typed(markdown().replace('- [x]', '- [ ]'))
    expect('error' in score(A, EPIC, id, 0)).toBe(true)
  })
})
