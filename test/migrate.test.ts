import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR, moduleFolder } from 'roadmap-module-protocol'

import { apply, plan } from '../dev/migrate.ts'
import { ID } from '../manifest.ts'
import { FILE } from '../store.ts'

/**
 * The one-off move, tested because a migration nobody tested is a migration
 * nobody can rerun.
 *
 * The real file this runs against holds several projects' questions and there is
 * exactly one copy of it. So the order matters more than the mechanics: write,
 * read back, verify the material, and only then rename. Everything below is
 * about that order and about what happens when one row cannot be written — which
 * is the case that decides whether somebody loses work.
 */
let dir = ''
let one = ''
let two = ''
let source = ''

/** A question in the shape the old store actually wrote. */
const q = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  epic: 'modes-are-modules',
  question: `Question ${id}?`,
  options: ['first', 'second', 'third'],
  answer: 2,
  why: 'Because the manifest is the only half a host reads.',
  passage: { path: 'chapters/bridge.tex', start: 10, end: 40, quote: 'the smallest half' },
  by: 'claude',
  viaMcp: true,
  at: '2026-01-01T00:00:00.000Z',
  attempts: [{ chose: 1, right: false, at: '2026-01-02T00:00:00.000Z' }],
  ...over,
})

function writeSource(projects: Record<string, { questions: unknown[] }>): void {
  writeFileSync(source, `${JSON.stringify({ projects }, null, 2)}\n`)
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-migrate-')))
  one = join(dir, 'project-one')
  two = join(dir, 'project-two')
  mkdirSync(one)
  mkdirSync(two)
  source = join(dir, 'questions.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const MINE = moduleFolder(ID)
const destination = (project: string) => join(project, KEHIKOT_DIR, MINE, `${FILE}.json`)

describe('the split', () => {
  test('each project’s questions land in that project, and the outer key comes out', () => {
    writeSource({
      [one]: { questions: [q('aaaa1111'), q('aaaa2222')] },
      [two]: { questions: [q('bbbb1111')] },
    })

    const out = apply(source)
    expect(out.refused).toBeNull()
    expect(out.left).toEqual([])
    expect(out.written.map((row) => row.questions).sort()).toEqual([1, 2])

    const first = JSON.parse(readFileSync(destination(one), 'utf8')) as Record<string, unknown>
    expect(Object.keys(first)).toEqual(['questions'])
    expect((first.questions as { id: string }[]).map((x) => x.id)).toEqual(['aaaa1111', 'aaaa2222'])

    const second = JSON.parse(readFileSync(destination(two), 'utf8')) as { questions: { id: string }[] }
    expect(second.questions.map((x) => x.id)).toEqual(['bbbb1111'])
  })

  test('everything about a question survives, not just its id', () => {
    /* A count matches when the ids are right and every answer key is zero, which
       is exactly the corruption worth catching: nobody sees it until they answer
       one. So the comparison is field by field, and so is this assertion. */
    const original = q('cccc1111', { answer: 2, attempts: [{ chose: 2, right: true, at: '2026-02-02T00:00:00.000Z' }] })
    writeSource({ [one]: { questions: [original] } })

    apply(source)
    const back = JSON.parse(readFileSync(destination(one), 'utf8')) as { questions: unknown[] }
    expect(back.questions[0]).toEqual(original)
  })

  test('the order inside a project is kept, because it is the order they were written', () => {
    writeSource({ [one]: { questions: [q('1111aaaa'), q('2222bbbb'), q('3333cccc')] } })
    apply(source)
    const back = JSON.parse(readFileSync(destination(one), 'utf8')) as { questions: { id: string }[] }
    expect(back.questions.map((x) => x.id)).toEqual(['1111aaaa', '2222bbbb', '3333cccc'])
  })
})

describe('the source file', () => {
  test('is renamed and never deleted, and only after every destination verified', () => {
    writeSource({ [one]: { questions: [q('aaaa1111')] } })
    const out = apply(source)
    expect(out.renamedTo).toBe(`${source}.migrated`)
    expect(existsSync(source)).toBe(false)
    /* Still on disk under its new name: a migration that went wrong can be
       looked at rather than reconstructed. */
    const kept = JSON.parse(readFileSync(`${source}.migrated`, 'utf8')) as { projects: Record<string, unknown> }
    expect(Object.keys(kept.projects)).toEqual([one])
  })

  test('is left exactly where it is when one project cannot be written', () => {
    /* The case that decides whether somebody loses work. One project's folder is
       gone, so the source is the only remaining copy of ITS questions — renaming
       it would file the evidence away under a name nothing looks for. */
    const missing = join(dir, 'project-that-moved')
    writeSource({
      [one]: { questions: [q('aaaa1111')] },
      [missing]: { questions: [q('dddd1111'), q('dddd2222')] },
    })

    const out = apply(source)
    expect(out.renamedTo).toBeNull()
    expect(existsSync(source)).toBe(true)
    expect(out.written.map((row) => row.project)).toEqual([one])
    expect(out.left).toHaveLength(1)
    expect(out.left[0]?.project).toBe(missing)
    expect(out.left[0]?.questions).toBe(2)
    expect(out.left[0]?.trouble).toContain('there is no folder at')
    /* Named loudly rather than silently dropped. */
    expect(out.left[0]?.trouble).toContain('They are NOT lost')
  })

  test('a source that is not there at all is said so, not shrugged at', () => {
    const out = apply(join(dir, 'nothing-here.json'))
    expect(out.refused).toContain('there is nothing at')
    expect(out.written).toEqual([])
  })

  test('a source that will not parse refuses and touches nothing', () => {
    writeFileSync(source, '{ this is not json')
    const out = apply(source)
    expect(out.refused).toContain('could not be read')
    expect(readFileSync(source, 'utf8')).toBe('{ this is not json')
    expect(existsSync(destination(one))).toBe(false)
  })
})

describe('a destination that already holds something', () => {
  test('is refused rather than merged or written over', () => {
    /* Merging two authored files by guesswork — which id wins, which attempt is
       newer — is how a person loses an answer they gave. */
    mkdirSync(join(one, KEHIKOT_DIR, MINE), { recursive: true })
    const already = `${JSON.stringify({ questions: [q('eeee1111')] }, null, 2)}\n`
    writeFileSync(destination(one), already)
    writeSource({ [one]: { questions: [q('aaaa1111')] } })

    const out = apply(source)
    expect(out.written).toEqual([])
    expect(out.left[0]?.trouble).toContain('already exists and is not empty')
    expect(readFileSync(destination(one), 'utf8')).toBe(already)
    expect(existsSync(source)).toBe(true)
  })

  test('an empty store there is not "something", and is written into', () => {
    mkdirSync(join(one, KEHIKOT_DIR, MINE), { recursive: true })
    writeFileSync(destination(one), `${JSON.stringify({ questions: [] }, null, 2)}\n`)
    writeSource({ [one]: { questions: [q('aaaa1111')] } })

    const out = apply(source)
    expect(out.left).toEqual([])
    const back = JSON.parse(readFileSync(destination(one), 'utf8')) as { questions: { id: string }[] }
    expect(back.questions.map((x) => x.id)).toEqual(['aaaa1111'])
  })
})

describe('running it twice', () => {
  test('the second run finds nothing to do rather than making a second copy', () => {
    writeSource({ [one]: { questions: [q('aaaa1111')] } })
    expect(apply(source).renamedTo).not.toBeNull()
    const after = readFileSync(destination(one), 'utf8')

    const again = apply(source)
    expect(again.refused).toContain('there is nothing at')
    expect(readFileSync(destination(one), 'utf8')).toBe(after)
  })

  test('a source restored from the renamed copy does not double up either', () => {
    writeSource({ [one]: { questions: [q('aaaa1111')] } })
    apply(source)
    /* Somebody puts the file back, not realising it already ran. */
    writeSource({ [one]: { questions: [q('aaaa1111')] } })
    const again = apply(source)
    expect(again.written).toEqual([])
    expect(again.left[0]?.trouble).toContain('already exists and is not empty')
    const back = JSON.parse(readFileSync(destination(one), 'utf8')) as { questions: unknown[] }
    expect(back.questions).toHaveLength(1)
  })
})

describe('the dry run', () => {
  test('says what would happen and changes nothing', () => {
    writeSource({ [one]: { questions: [q('aaaa1111'), q('aaaa2222')] }, [two]: { questions: [q('bbbb1111')] } })
    const { rows, refused } = plan(source)
    expect(refused).toBeNull()
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.questions.length)).toEqual([2, 1])
    expect(rows.every((row) => row.trouble === null)).toBe(true)
    /* Nothing on disk moved. */
    expect(existsSync(destination(one))).toBe(false)
    expect(existsSync(destination(two))).toBe(false)
    expect(existsSync(source)).toBe(true)
  })

  test('reports a project that is not on this machine rather than omitting it', () => {
    const missing = join(dir, 'project-that-moved')
    writeSource({ [missing]: { questions: [q('dddd1111')] } })
    const { rows } = plan(source)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.destination).toBeNull()
    expect(rows[0]?.trouble).toContain('there is no folder at')
    expect(rows[0]?.questions).toHaveLength(1)
  })
})

describe('the project’s .gitignore', () => {
  test('learns about the folder when the migration creates it', () => {
    mkdirSync(join(one, '.git'))
    writeFileSync(join(one, '.gitignore'), 'node_modules\n')
    writeSource({ [one]: { questions: [q('aaaa1111')] } })

    apply(source)
    const after = readFileSync(join(one, '.gitignore'), 'utf8')
    expect(after.startsWith('node_modules\n')).toBe(true)
    expect(after.split(`${KEHIKOT_DIR}/`).length - 1).toBe(1)
  })

  test('a project that is not a repository gets no .gitignore', () => {
    writeSource({ [one]: { questions: [q('aaaa1111')] } })
    apply(source)
    expect(existsSync(join(one, '.gitignore'))).toBe(false)
    expect(existsSync(destination(one))).toBe(true)
  })
})
