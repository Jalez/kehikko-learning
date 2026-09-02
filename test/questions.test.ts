import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'roadmap-module-protocol'

import {
  MAX_ATTEMPTS,
  MAX_OPTIONS,
  MIN_OPTIONS,
  asked,
  change,
  forEpic,
  questionsFile,
  score,
  standings,
  withKey,
} from '../quiz/questions.ts'

/**
 * The store, with real files, in real project directories.
 *
 * Not a mock, and now doubly not: the store resolves the project path with
 * `realpathSync` before it writes anything under it, so a project that is merely
 * a plausible-looking string is refused. `A` and `B` are therefore two actual
 * directories, made and removed per test, and every assertion below about "one
 * project's questions are not in another's" is an assertion about two files in
 * two folders rather than two keys in one object.
 *
 * Half of what this file asserts is about what is ON DISK — that a broken file
 * is not written over, that the attempts array is bounded there and not merely
 * in memory — and a fake filesystem would let every one of those pass while the
 * program did the opposite.
 */
let dir = ''
let A = ''
let B = ''

beforeEach(() => {
  /* `realpathSync` because macOS puts the temp directory behind a symlink —
     `/var` is `/private/var` — and the store resolves before it writes. Taking
     the resolved form here is the honest thing: it is what the program will
     use, so it is what the assertions should be about. */
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-test-')))
  A = join(dir, 'one')
  B = join(dir, 'two')
  mkdirSync(A)
  mkdirSync(B)
  /* The document the fixture questions are anchored to has to EXIST now: the
     store refuses an anchor whose file is not in the project, because eighteen
     real questions were once written about a paper that then moved and nothing
     could say so. See `quiz/where.ts`. */
  mkdirSync(join(A, 'chapters'))
  writeFileSync(join(A, 'chapters', 'bridge.tex'), 'the manifest is the smallest half')
  mkdirSync(join(B, 'chapters'))
  writeFileSync(join(B, 'chapters', 'bridge.tex'), 'the manifest is the smallest half')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Where one project's questions actually are, for the tests that read the file. */
function fileFor(project: string): string {
  const { path } = questionsFile(project)
  expect(path).not.toBeNull()
  return path!
}

function add(over: Partial<Parameters<typeof change>[0] & Record<string, unknown>> = {}) {
  return change({
    op: 'add',
    project: A,
    epic: 'modes-are-modules',
    question: 'What does the manifest settle?',
    options: ['Which tab the page gets', 'What colour the container is', 'Who owns the repository'],
    answer: 0,
    why: 'The manifest is the only half a host reads.',
    passage: { path: 'chapters/bridge.tex', start: 100, end: 240, quote: 'the manifest is the smallest half' },
    by: 'claude',
    viaMcp: true,
    ...(over as object),
  } as Parameters<typeof change>[0])
}

describe('writing a question', () => {
  test('an added question comes back for its epic, in its project', () => {
    const out = add()
    expect(out.ok).toBe(true)
    const { questions } = forEpic(A, 'modes-are-modules')
    expect(questions).toHaveLength(1)
    expect(questions[0]?.question).toBe('What does the manifest settle?')
    expect(questions[0]?.passage.start).toBe(100)
    expect(questions[0]?.passage.quote).toBe('the manifest is the smallest half')
  })

  test('the id is issued here and is not anything a caller sent', () => {
    const out = add({ id: 'chosen-by-the-caller' } as never)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.id).not.toBe('chosen-by-the-caller')
    expect(out.id).toMatch(/^[0-9a-f]{8}$/)
  })

  test('an epic that is not a slug is refused, and nothing is written', () => {
    const out = add({ epic: 'Modes Are Modules' })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.error).toContain('is not an epic slug')
    expect(forEpic(A, 'Modes Are Modules').questions).toHaveLength(0)
  })

  test(`fewer than ${MIN_OPTIONS} options is refused`, () => {
    const out = add({ options: ['only this'], answer: 0 })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('One option is not a choice')
  })

  test(`more than ${MAX_OPTIONS} options is refused`, () => {
    const out = add({ options: Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => `option ${i}`), answer: 0 })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain(`between ${MIN_OPTIONS} and ${MAX_OPTIONS} options`)
  })

  test('an empty option is refused', () => {
    const out = add({ options: ['a', '', 'c'], answer: 0 })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('one of the options is empty')
  })

  test('two identical options are refused rather than deduplicated', () => {
    /* Deduplicating would silently move the key: drop option 1 and `answer: 2`
       now names a different string. */
    const out = add({ options: ['same', 'same', 'other'], answer: 2 })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('two of the options are the same')
  })

  test('an answer outside the options is refused', () => {
    const out = add({ answer: 3 })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('between 0 and 2')
  })

  test('a fractional answer is refused', () => {
    const out = add({ answer: 1.5 })
    expect(out.ok).toBe(false)
  })

  test('a passage with no document is refused', () => {
    const out = add({ passage: { path: '', start: 1, end: 2, quote: 'x' } })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('named no document')
  })

  test('a passage with no quote is refused', () => {
    const out = add({ passage: { path: 'a.tex', start: 1, end: 2, quote: '' } })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('quoted nothing')
  })

  test('a byte range that does not go forwards is refused', () => {
    expect(add({ passage: { path: 'a.tex', start: 5, end: 5, quote: 'x' } }).ok).toBe(false)
    expect(add({ passage: { path: 'a.tex', start: 9, end: 4, quote: 'x' } }).ok).toBe(false)
    expect(add({ passage: { path: 'a.tex', start: -1, end: 4, quote: 'x' } }).ok).toBe(false)
  })
})

describe('the partition by project', () => {
  test('a question written for one project is not in another', () => {
    add({ project: A })
    add({ project: B, question: 'A different question entirely' })

    expect(forEpic(A, 'modes-are-modules').questions).toHaveLength(1)
    expect(forEpic(B, 'modes-are-modules').questions).toHaveLength(1)
    expect(forEpic(A, 'modes-are-modules').questions[0]?.question).toBe('What does the manifest settle?')
    expect(forEpic(B, 'modes-are-modules').questions[0]?.question).toBe('A different question entirely')
  })

  test('the SAME epic slug in two projects is two sets of questions', () => {
    /* The collision this partition exists for. `bridge` is a real epic slug and
       exactly the kind of word two unrelated projects both use. */
    add({ project: A, epic: 'bridge', question: 'Project one’s bridge question' })
    add({ project: B, epic: 'bridge', question: 'Project two’s bridge question' })
    const one = forEpic(A, 'bridge').questions
    const two = forEpic(B, 'bridge').questions
    expect(one).toHaveLength(1)
    expect(two).toHaveLength(1)
    expect(one[0]?.id).not.toBe(two[0]?.id)
  })

  test('a question is not addressable from the wrong project', () => {
    const out = add({ project: A })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const wrong = change({ op: 'drop', project: B, id: out.id })
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.error).toContain('it is not addressable from this one')
    /* And it is still there. */
    expect(forEpic(A, 'modes-are-modules').questions).toHaveLength(1)
  })

  test('a trailing slash is the same project', () => {
    add({ project: A })
    expect(forEpic(A, 'modes-are-modules').questions).toHaveLength(1)
    add({ project: `${A}/`, question: 'Second question in the same project' })
    expect(forEpic(A, 'modes-are-modules').questions).toHaveLength(2)
  })

  test('the order on disk IS the order they were written, not an order column', () => {
    /* Two sources for one fact would let a partial write leave two questions
       claiming position three. And an id that happens to be all digits would be
       an integer-like object key, which JavaScript enumerates FIRST — which is
       why this is an array and not a record. */
    for (const n of ['first', 'second', 'third']) add({ question: `The ${n} question` })
    const raw = JSON.parse(readFileSync(fileFor(A), 'utf8')) as { questions: { question: string }[] }
    expect(raw.questions.map((q) => q.question)).toEqual([
      'The first question',
      'The second question',
      'The third question',
    ])
  })

  test('the partition is the PATH, and there is no project key left in the file', () => {
    /* The shape used to carry the partition: a `projects` record keyed by path.
       It is the folder now, which is strictly stronger — the file a reader
       opened cannot name the wrong project because it does not name one at
       all. */
    add({ project: A })
    add({ project: B })
    expect(fileFor(A)).toBe(join(A, KEHIKOT_DIR, 'learning', 'questions.json'))
    expect(fileFor(B)).toBe(join(B, KEHIKOT_DIR, 'learning', 'questions.json'))
    const raw = JSON.parse(readFileSync(fileFor(A), 'utf8')) as Record<string, unknown>
    expect(Object.keys(raw)).toEqual(['questions'])
    expect(raw.projects).toBeUndefined()
  })

  test('a write with no project is refused, and nothing is created anywhere', () => {
    const out = add({ project: null })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('no project is open')
    if (!out.ok) expect(out.error).toContain('Nothing was recorded')
    /* Not "somewhere sensible". Nowhere. */
    expect(existsSync(join(A, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(B, KEHIKOT_DIR))).toBe(false)
  })

  test('a project that is not on this machine is refused with a sentence, not a guess', () => {
    const out = add({ project: join(dir, 'no-such-project') })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('there is no folder at')
  })

  test('a relative path is refused, because it would resolve against this app’s cwd', () => {
    const out = add({ project: 'some/relative/path' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('is not an absolute path')
  })
})

describe('the ordering', () => {
  test('questions come back in the order they were written', () => {
    /* An agent that read a chapter top to bottom has already put them in the
       reader's order; re-sorting would throw that away. */
    for (const n of [1, 2, 3]) add({ question: `Question ${n}` })
    const { questions } = forEpic(A, 'modes-are-modules')
    expect(questions.map((q) => q.question)).toEqual(['Question 1', 'Question 2', 'Question 3'])
  })
})

describe('rewording and dropping', () => {
  test('a reword keeps the id, the passage and the attempts', () => {
    const made = add()
    expect(made.ok).toBe(true)
    if (!made.ok) return
    score(A, made.id, 0)
    const out = change({ op: 'reword', project: A, id: made.id, question: 'Sharper wording' })
    expect(out.ok).toBe(true)
    const [question] = withKey(A, 'modes-are-modules').questions
    expect(question?.id).toBe(made.id)
    expect(question?.question).toBe('Sharper wording')
    expect(question?.passage.start).toBe(100)
    expect(question?.attempts).toHaveLength(1)
  })

  test('a reword that leaves an answer index pointing past the options is refused', () => {
    const made = add()
    if (!made.ok) return
    const out = change({ op: 'reword', project: A, id: made.id, options: ['only', 'two'] })
    /* The old key was 0, which is still valid — so this one succeeds. */
    expect(out.ok).toBe(true)
    const again = change({ op: 'reword', project: A, id: made.id, answer: 5 })
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error).toContain('between 0 and 1')
  })

  test('a reword to an empty question is refused', () => {
    const made = add()
    if (!made.ok) return
    const out = change({ op: 'reword', project: A, id: made.id, question: '' })
    expect(out.ok).toBe(false)
  })

  test('a drop takes the attempts with it', () => {
    const made = add()
    if (!made.ok) return
    score(A, made.id, 0)
    const out = change({ op: 'drop', project: A, id: made.id })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.said).toContain('1 answer')
    expect(forEpic(A, 'modes-are-modules').questions).toHaveLength(0)
  })

  test('a question that is not here is named rather than shrugged at', () => {
    const out = change({ op: 'drop', project: A, id: 'deadbeef' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('there is no question "deadbeef"')
  })
})

describe('the standings', () => {
  test('they count what has been answered and what was right', () => {
    const one = add({ question: 'One' })
    const two = add({ question: 'Two' })
    add({ question: 'Three' })
    if (!one.ok || !two.ok) return
    score(A, one.id, 0) // right
    score(A, two.id, 1) // wrong
    const { standings: rows } = standings(A)
    expect(rows).toEqual([{ epic: 'modes-are-modules', questions: 3, answered: 2, right: 1 }])
  })

  test('a retake forgets the answers and the questions stay', () => {
    const one = add()
    if (!one.ok) return
    score(A, one.id, 0)
    const out = change({ op: 'retake', project: A, epic: 'modes-are-modules' })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.said).toContain('1 answer')
    const { questions } = forEpic(A, 'modes-are-modules')
    expect(questions).toHaveLength(1)
    expect(questions[0]?.attempts).toHaveLength(0)
  })
})

describe('a file that will not parse', () => {
  test('is not treated as an empty store, and is not written over', () => {
    add()
    const before = readFileSync(fileFor(A), 'utf8')
    writeFileSync(fileFor(A), '{ this is not json')

    const read = forEpic(A, 'modes-are-modules')
    expect(read.questions).toHaveLength(0)
    expect(read.trouble).toContain('could not be read')
    expect(read.trouble).toContain('recoverable: fix or move it')

    const out = add({ question: 'A question that must not land' })
    expect(out.ok).toBe(false)

    /* The broken file is still exactly as it was — not repaired, not replaced. */
    expect(readFileSync(fileFor(A), 'utf8')).toBe('{ this is not json')
    expect(before).toContain('What does the manifest settle?')
  })
})

describe('attempts are bounded on disk', () => {
  test(`only the most recent ${MAX_ATTEMPTS} survive`, () => {
    const made = add()
    if (!made.ok) return
    for (let i = 0; i < MAX_ATTEMPTS + 5; i += 1) score(A, made.id, i % 3)
    const raw = JSON.parse(readFileSync(fileFor(A), 'utf8')) as {
      questions: { id: string; attempts: unknown[] }[]
    }
    expect(raw.questions.find((q) => q.id === made.id)?.attempts).toHaveLength(MAX_ATTEMPTS)
    /* The most recent, not the first: the last write was `(MAX_ATTEMPTS+4) % 3`. */
    const kept = forEpic(A, 'modes-are-modules').questions[0]?.attempts.at(-1)
    expect(kept?.chose).toBe((MAX_ATTEMPTS + 4) % 3)
  })
})

describe('asked()', () => {
  test('withholds the key on a question nobody has answered', () => {
    const question = withKey(A, null).questions[0]
    add()
    const [held] = withKey(A, 'modes-are-modules').questions
    expect(question).toBeUndefined()
    expect(held?.answer).toBe(0)
    const shown = asked(held!, A)
    expect(shown.answer).toBeNull()
    expect(shown.why).toBeNull()
    /* And nothing else about it is missing — this is a projection, not a stub. */
    expect(shown.options).toEqual(held!.options)
    expect(shown.passage).toEqual(held!.passage)
  })

  test('hands it over once there is an attempt', () => {
    const made = add()
    if (!made.ok) return
    score(A, made.id, 2)
    const [held] = withKey(A, 'modes-are-modules').questions
    const shown = asked(held!, A)
    expect(shown.answer).toBe(0)
    expect(shown.why).toBe('The manifest is the only half a host reads.')
  })

  test('a retake puts it back out of reach', () => {
    const made = add()
    if (!made.ok) return
    score(A, made.id, 0)
    expect(forEpic(A, 'modes-are-modules').questions[0]?.answer).toBe(0)
    change({ op: 'retake', project: A, epic: 'modes-are-modules' })
    expect(forEpic(A, 'modes-are-modules').questions[0]?.answer).toBeNull()
    expect(forEpic(A, 'modes-are-modules').questions[0]?.why).toBeNull()
  })
})

describe('scoring', () => {
  test('the right option is right and a wrong one is wrong', () => {
    const made = add()
    if (!made.ok) return
    const right = score(A, made.id, 0)
    expect('scored' in right && right.scored.right).toBe(true)
    const wrong = score(A, made.id, 1)
    expect('scored' in wrong && wrong.scored.right).toBe(false)
  })

  test('the reply carries the key and the explanation, and only then', () => {
    const made = add()
    if (!made.ok) return
    const out = score(A, made.id, 1)
    expect('scored' in out).toBe(true)
    if (!('scored' in out)) return
    expect(out.scored.answer).toBe(0)
    expect(out.scored.why).toBe('The manifest is the only half a host reads.')
  })

  test('an option that does not exist is refused, not scored as wrong', () => {
    const made = add()
    if (!made.ok) return
    const out = score(A, made.id, 47)
    expect('error' in out).toBe(true)
    if ('error' in out) expect(out.error).toContain('Nothing was recorded')
    expect(forEpic(A, 'modes-are-modules').questions[0]?.attempts).toHaveLength(0)
  })

  test('a fractional index is refused', () => {
    const made = add()
    if (!made.ok) return
    expect('error' in score(A, made.id, 0.5)).toBe(true)
  })

  test('a question in another project cannot be answered from this one', () => {
    const made = add({ project: A })
    if (!made.ok) return
    const out = score(B, made.id, 0)
    expect('error' in out).toBe(true)
    if ('error' in out) expect(out.error).toContain('there is no question')
  })

  test('answering twice keeps both attempts, newest last', () => {
    const made = add()
    if (!made.ok) return
    score(A, made.id, 1)
    score(A, made.id, 0)
    const attempts = forEpic(A, 'modes-are-modules').questions[0]?.attempts ?? []
    expect(attempts).toHaveLength(2)
    expect(attempts[0]?.right).toBe(false)
    expect(attempts[1]?.right).toBe(true)
  })
})
