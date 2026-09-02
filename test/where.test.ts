import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'roadmap-module-protocol'

import { change, forEpic, questionsFile } from '../quiz/questions.ts'
import { anchorOf, resolved, stored } from '../quiz/where.ts'

/**
 * Where a question's document is, and whether it is there — the which-root
 * bug, asserted against the real shape of the store it was found in.
 *
 * ## The store this is about
 *
 * `test/fixtures/thesis-questions.json` is a copy of the owner's thesis store
 * on 2026-09-02 with the prose replaced and every anchor kept: eighteen
 * questions, six distinct paths, all spelled `chapters/<n>_<name>.tex`. The
 * paper those files belong to lives at `<project>/.kehikot/paper/thesis/`,
 * and nothing exists at `<project>/chapters/`. The store was right when it
 * was written and the paper moved an hour later — `quiz/where.ts` tells it —
 * and what this file holds the module to is that it SAYS so, in every place
 * a question leaves the store, and rewrites nothing.
 */

const FIXTURE = join(import.meta.dir, 'fixtures', 'thesis-questions.json')

let dir = ''
let project = ''

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-where-')))
  project = join(dir, 'CS-DEGREE')
  mkdirSync(project)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** The owner's project as it is on disk: the paper under `.kehikot/paper/thesis`, and the store beside it. */
function layOutTheThesis(): { paper: string; store: string } {
  const paper = join(project, KEHIKOT_DIR, 'paper', 'thesis')
  mkdirSync(join(paper, 'chapters'), { recursive: true })
  for (const chapter of [
    '1_introduction',
    '2_literature_review',
    '3_methods',
    '4_results',
    '5_discussion',
    '6_conclusion',
  ]) {
    writeFileSync(join(paper, 'chapters', `${chapter}.tex`), `\\chapter{${chapter}}\n`)
  }
  const { path } = questionsFile(project)
  expect(path).not.toBeNull()
  mkdirSync(join(path!, '..'), { recursive: true })
  writeFileSync(path!, readFileSync(FIXTURE, 'utf8'))
  return { paper, store: path! }
}

describe('the two spellings', () => {
  const root = '/Users/somebody/Projects/thesis'

  test('an absolute path under the project is stored relative to it', () => {
    expect(stored(root, `${root}/chapters/agents.tex`)).toBe('chapters/agents.tex')
  })

  test('a relative path is folded, and one that climbs out is handed back untouched', () => {
    expect(stored(root, 'chapters/../main.tex')).toBe('main.tex')
    /* Never `/Users/somebody/Projects/elsewhere.tex` and never a tidy name
       inside the project: the one thing this must not do is make a path that
       escapes look like one that does not. */
    expect(stored(root, '../elsewhere.tex')).toBe('../elsewhere.tex')
  })

  test('an absolute path outside the project stays absolute', () => {
    expect(stored(root, '/elsewhere/paper.tex')).toBe('/elsewhere/paper.tex')
  })

  test('resolving joins a relative path onto the root and refuses to climb', () => {
    expect(resolved(root, 'chapters/agents.tex')).toBe(`${root}/chapters/agents.tex`)
    expect(resolved(root, '../etc/passwd')).toBe('../etc/passwd')
    expect(resolved(root, '/elsewhere/paper.tex')).toBe('/elsewhere/paper.tex')
  })

  test('with no root, every spelling passes through', () => {
    expect(stored(null, 'chapters/agents.tex')).toBe('chapters/agents.tex')
    expect(resolved(null, 'chapters/agents.tex')).toBe('chapters/agents.tex')
    expect(anchorOf(null, 'chapters/agents.tex')).toBe('unchecked')
  })
})

describe('whether the document is there', () => {
  test('holds when the file is where the anchor says, missing when it is not, unchecked outside the project', () => {
    mkdirSync(join(project, 'chapters'))
    writeFileSync(join(project, 'chapters', 'a.tex'), 'a')
    expect(anchorOf(project, 'chapters/a.tex')).toBe('holds')
    expect(anchorOf(project, `${project}/chapters/a.tex`)).toBe('holds')
    expect(anchorOf(project, 'chapters/b.tex')).toBe('missing')
    expect(anchorOf(project, '../outside.tex')).toBe('unchecked')
    expect(anchorOf(project, '/somewhere/else.tex')).toBe('unchecked')
  })
})

describe('the owner’s eighteen questions', () => {
  test('every one of them is reported as missing, none is hidden, and the file is not touched', () => {
    const { store } = layOutTheThesis()
    const before = readFileSync(store, 'utf8')

    const { questions, trouble } = forEpic(project, 'thesis')
    expect(trouble).toBeNull()
    expect(questions).toHaveLength(18)
    expect(questions.every((question) => question.anchor === 'missing')).toBe(true)
    /* And the paths are exactly as they were written: a read never respells. */
    expect(new Set(questions.map((question) => question.passage.path))).toEqual(
      new Set([
        'chapters/1_introduction.tex',
        'chapters/2_literature_review.tex',
        'chapters/3_methods.tex',
        'chapters/4_results.tex',
        'chapters/5_discussion.tex',
        'chapters/6_conclusion.tex',
      ]),
    )
    expect(readFileSync(store, 'utf8')).toBe(before)
  })

  test('the repair is a loud one: re-spelling the path through reword, with the bytes and the quote kept', () => {
    const { paper } = layOutTheThesis()
    const [first] = forEpic(project, 'thesis').questions
    expect(first?.anchor).toBe('missing')

    /* An agent that read the sentence gives the absolute path — the one
       spelling it can produce without knowing where the paper module keeps
       papers — and the store writes it back relative to the project. */
    const out = change({
      op: 'reword',
      project,
      id: first!.id,
      passage: { path: join(paper, first!.passage.path) },
    })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.said).toContain('re-anchored to .kehikot/paper/thesis/chapters/1_introduction.tex')

    const after = forEpic(project, 'thesis').questions.find((question) => question.id === first!.id)!
    expect(after.anchor).toBe('holds')
    expect(after.passage.path).toBe('.kehikot/paper/thesis/chapters/1_introduction.tex')
    expect(after.passage.start).toBe(first!.passage.start)
    expect(after.passage.end).toBe(first!.passage.end)
    expect(after.passage.quote).toBe(first!.passage.quote)
    /* And the other seventeen are exactly as they were. */
    expect(forEpic(project, 'thesis').questions.filter((question) => question.anchor === 'missing')).toHaveLength(17)
  })

  test('re-anchoring to a document that is not there is refused, so the eighteen cannot become nineteen', () => {
    layOutTheThesis()
    const [first] = forEpic(project, 'thesis').questions
    const out = change({ op: 'reword', project, id: first!.id, passage: { path: 'chapters/7_appendix.tex' } })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toContain('there is no "chapters/7_appendix.tex" in this project')
      expect(out.error).toContain('relative to something else')
    }
  })
})

describe('writing a new question', () => {
  const question = (path: string) =>
    change({
      op: 'add',
      project,
      epic: 'thesis',
      question: 'What is a module?',
      options: ['A tab', 'A colour'],
      answer: 0,
      why: 'Because.',
      passage: { path, start: 1, end: 9, quote: 'a module' },
      by: 'test',
    })

  test('takes the absolute path the other doors on the canvas hand out, and stores it relative', () => {
    const { paper } = layOutTheThesis()
    const out = question(join(paper, 'chapters', '3_methods.tex'))
    expect(out.ok).toBe(true)
    const held = forEpic(project, 'thesis').questions.find((one) => one.question === 'What is a module?')!
    expect(held.passage.path).toBe('.kehikot/paper/thesis/chapters/3_methods.tex')
    expect(held.anchor).toBe('holds')
  })

  test('refuses the spelling that produced the eighteen, and says what was looked for', () => {
    layOutTheThesis()
    const out = question('chapters/3_methods.tex')
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toContain(`nothing at ${join(project, 'chapters', '3_methods.tex')}`)
      expect(out.error).toContain('Nothing was written')
    }
  })

  test('a document outside the project is unchecked rather than refused', () => {
    /* This module cannot vouch for it either way, and refusing would be a
       claim that the file does not exist. */
    layOutTheThesis()
    const out = question('/somewhere/else/paper.tex')
    expect(out.ok).toBe(true)
    const held = forEpic(project, 'thesis').questions.find((one) => one.question === 'What is a module?')!
    expect(held.anchor).toBe('unchecked')
    expect(held.passage.path).toBe('/somewhere/else/paper.tex')
  })
})
