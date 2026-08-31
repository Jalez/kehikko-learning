import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR, moduleFolder } from 'roadmap-module-protocol'

import { ID } from '../manifest.ts'
import { FILE, dataFile, makeDir } from '../store.ts'
import { change, forEpic } from '../quiz/questions.ts'

/**
 * Where the questions go, what happens when there is nowhere for them to go, and
 * the fence around the folder they go in.
 *
 * Every one of these needs a real filesystem, because every one of them is about
 * something only a filesystem knows: whether a folder exists, what a symlink
 * resolves to, whether a `.gitignore` gained a line. A mock would let all of
 * them pass while the program wrote into somebody else's directory.
 */
let dir = ''
let project = ''
let outside = ''

/** This module's own folder inside `.kehikot`, derived the way the store does. */
const MINE = moduleFolder(ID)
/** `<project>/.kehikot/learning`, which is the only directory this app owns. */
const mine = (root: string) => join(root, KEHIKOT_DIR, MINE)

beforeEach(() => {
  /* `realpathSync` because macOS puts the temp directory behind a symlink —
     `/var` is `/private/var` — and the store resolves before it writes. */
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-store-')))
  project = join(dir, 'project')
  outside = join(dir, 'somewhere-else')
  mkdirSync(project)
  mkdirSync(outside)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const question = (over: Record<string, unknown> = {}) =>
  change({
    op: 'add',
    project,
    epic: 'modes-are-modules',
    question: 'What does the manifest settle?',
    options: ['Which tab the page gets', 'What colour the pane is'],
    answer: 0,
    why: 'The manifest is the only half a host reads.',
    passage: { path: 'chapters/bridge.tex', start: 100, end: 240, quote: 'the manifest is the smallest half' },
    by: 'claude',
    ...over,
  } as Parameters<typeof change>[0])

describe('where the file is', () => {
  test('is this module’s own folder inside .kehikot, inside the project', () => {
    const { path, trouble } = dataFile(project)
    expect(trouble).toBeNull()
    expect(path).toBe(join(project, KEHIKOT_DIR, 'learning', `${FILE}.json`))
    /* The folder name is derived from the id with `roadmap.` taken off, and
       nothing here spells either half a second time. */
    expect(MINE).toBe('learning')
    expect(path).toBe(join(mine(project), `${FILE}.json`))
  })

  test('a trailing slash does not produce a doubled one', () => {
    expect(dataFile(`${project}/`).path).toBe(join(mine(project), `${FILE}.json`))
  })

  test('reading does not create the folder', () => {
    /* Opening a pane against somebody's repository must leave no trace of having
       done so. The folder appears on the first WRITE and not before. */
    expect(dataFile(project).path).not.toBeNull()
    expect(forEpic(project, 'modes-are-modules').questions).toHaveLength(0)
    expect(existsSync(join(project, KEHIKOT_DIR))).toBe(false)
  })

  test('writing creates it', () => {
    expect(question().ok).toBe(true)
    expect(existsSync(join(mine(project), `${FILE}.json`))).toBe(true)
  })

  test('this module writes into its own folder and nowhere else in .kehikot', () => {
    /* The point of the extra level: one module's data can be deleted, copied or
       read on its own. Nothing of this module's lands beside somebody else's. */
    expect(question().ok).toBe(true)
    expect(readdirSync(join(project, KEHIKOT_DIR))).toEqual(['learning'])
    expect(readdirSync(mine(project))).toEqual([`${FILE}.json`])
  })
})

describe('no project at all', () => {
  test('is not an error and not trouble — it is nowhere', () => {
    for (const nothing of [null, undefined, '', '   ']) {
      const { path, trouble } = dataFile(nothing)
      expect(path).toBeNull()
      expect(trouble).toBeNull()
    }
  })

  test('reads as empty and says nothing is wrong', () => {
    const out = forEpic(null, 'modes-are-modules')
    expect(out.questions).toHaveLength(0)
    expect(out.nowhere).toBe(true)
    expect(out.trouble).toBeNull()
  })

  test('refuses every write, and creates nothing anywhere', () => {
    const out = question({ project: null })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toContain('no project is open')
      expect(out.error).toContain('Nothing was recorded')
    }
    /* Not in the project, not beside this app, not in the working directory. A
       module that guessed here would be writing somebody's questions into a
       folder they will never open. */
    expect(existsSync(join(project, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(dir, KEHIKOT_DIR))).toBe(false)
    expect(existsSync(join(process.cwd(), KEHIKOT_DIR))).toBe(false)
  })

  test('makeDir on nowhere makes nothing', () => {
    const { dir: made, trouble } = makeDir(null)
    expect(made).toBeNull()
    expect(trouble).toBeNull()
  })
})

describe('a project that cannot be used', () => {
  test('one that is not on this machine gets a sentence, not silence', () => {
    const { path, trouble } = dataFile(join(dir, 'no-such-folder'))
    expect(path).toBeNull()
    expect(trouble).toContain('there is no folder at')
  })

  test('a file where a folder should be is refused', () => {
    const file = join(dir, 'a-file')
    writeFileSync(file, 'not a directory')
    expect(dataFile(file).trouble).toContain('is not a folder')
  })

  test('a relative path is refused, naming the reason', () => {
    expect(dataFile('some/relative/path').trouble).toContain('is not an absolute path')
  })

  test('a control character is refused', () => {
    expect(dataFile('/a/\u0000b').trouble).toContain('control character')
  })
})

describe('the fence', () => {
  /*
   * The case the whole fence exists for. `<project>/.kehikot` is a symlink to a
   * directory outside the project, so every string comparison in the world says
   * the write is landing inside the project and the filesystem puts it somewhere
   * else. This is why the check is after `realpath` and not before it.
   */
  test('a .kehikko that resolves outside the project is refused, and nothing is written through it', () => {
    symlinkSync(outside, join(project, KEHIKOT_DIR))

    const { path, trouble } = dataFile(project)
    expect(path).toBeNull()
    expect(trouble).toContain('is outside the project it claims to be inside')

    const out = question()
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('outside the project')

    /* The decisive assertion: the directory the link points at is untouched. */
    expect(existsSync(join(outside, `${FILE}.json`))).toBe(false)
    expect(existsSync(join(outside, MINE))).toBe(false)
  })

  test('reading through such a link is refused too, rather than answering with somebody else’s questions', () => {
    symlinkSync(outside, join(project, KEHIKOT_DIR))
    mkdirSync(join(outside, MINE))
    writeFileSync(join(outside, MINE, `${FILE}.json`), JSON.stringify({ questions: [{ id: 'x' }] }))
    const out = forEpic(project, 'modes-are-modules')
    expect(out.questions).toHaveLength(0)
    expect(out.trouble).toContain('outside the project')
  })

  test('a data file that is itself a symlink out of the folder is refused', () => {
    /* The folder is honest and the file is not. Checked separately, because a
       fence that only looked at the directory would follow this one. */
    mkdirSync(mine(project), { recursive: true })
    symlinkSync(join(outside, 'elsewhere.json'), join(mine(project), `${FILE}.json`))
    writeFileSync(join(outside, 'elsewhere.json'), '{"questions":[]}')
    expect(dataFile(project).trouble).toContain('outside the project')
  })

  test('a sibling folder whose name merely starts the same is not mistaken for the real one', () => {
    /* `startsWith` says `/p/.kehikko-elsewhere` is inside `/p/.kehikko`. It is
       not, and that one character is the whole escape. */
    const decoy = join(dir, `${KEHIKOT_DIR}-elsewhere`)
    mkdirSync(decoy)
    symlinkSync(decoy, join(project, KEHIKOT_DIR))
    expect(dataFile(project).trouble).toContain('outside the project')
  })
})

describe('the project’s .gitignore', () => {
  const gitignore = () => join(project, '.gitignore')

  test('gains the block once, when the folder is first created', () => {
    mkdirSync(join(project, '.git'))
    writeFileSync(gitignore(), 'node_modules\ndist\n')

    expect(question().ok).toBe(true)
    const after = readFileSync(gitignore(), 'utf8')
    expect(after.startsWith('node_modules\ndist\n')).toBe(true)
    expect(after).toContain(`${KEHIKOT_DIR}/`)
    /* And it says what the folder is and how to share it, because a rule
       somebody cannot explain is a rule they delete. */
    expect(after).toContain('Remove these lines to')
  })

  test('does not gain it twice on a second write', () => {
    mkdirSync(join(project, '.git'))
    writeFileSync(gitignore(), 'node_modules\n')

    expect(question().ok).toBe(true)
    const once = readFileSync(gitignore(), 'utf8')
    expect(question({ question: 'A second question entirely' }).ok).toBe(true)
    expect(readFileSync(gitignore(), 'utf8')).toBe(once)

    const occurrences = once.split(`${KEHIKOT_DIR}/`).length - 1
    expect(occurrences).toBe(1)
  })

  test('a repository with no .gitignore gets one holding only this', () => {
    mkdirSync(join(project, '.git'))
    expect(question().ok).toBe(true)
    expect(readFileSync(gitignore(), 'utf8')).toContain(`${KEHIKOT_DIR}/`)
  })

  test('a project inside a repository, but not the root of one, still gets the rule', () => {
    /* The case that forced the walk upwards, and it is a real one: the thesis at
       `…/CS-DEGREE/05_drafts/thesis_latex` has no `.git` of its own and sits
       several directories inside the CS-DEGREE repository. Under a check that
       only looked at `<project>/.git` it got nothing, and a `.kehikot/` full of
       somebody's questions would have turned up in their next `git status` with
       nothing there to explain it. */
    const repo = join(dir, 'repo')
    const deep = join(repo, 'drafts', 'thesis_latex')
    mkdirSync(join(repo, '.git'), { recursive: true })
    mkdirSync(deep, { recursive: true })

    expect(question({ project: deep }).ok).toBe(true)
    /* Written AT THE PROJECT, not at the repository root: git honours a
       `.gitignore` in any directory over that directory's subtree, so the rule
       belongs beside the folder it is about rather than in a file shared with
       everything else in the repository. */
    expect(readFileSync(join(deep, '.gitignore'), 'utf8')).toContain(`${KEHIKOT_DIR}/`)
    expect(existsSync(join(repo, '.gitignore'))).toBe(false)
  })

  test('a worktree’s .git, which is a FILE and not a directory, still counts', () => {
    /* Every worktree in this workspace would otherwise be read as "not under
       version control", because git writes a file there pointing at the real
       repository. */
    const work = join(dir, 'worktree')
    mkdirSync(work)
    writeFileSync(join(work, '.git'), 'gitdir: /somewhere/else/.git/worktrees/x\n')
    expect(question({ project: work }).ok).toBe(true)
    expect(readFileSync(join(work, '.gitignore'), 'utf8')).toContain(`${KEHIKOT_DIR}/`)
  })

  test('a project with no .git anywhere above it gets no file at all', () => {
    /* Creating one would be this program deciding how somebody keeps their
       folder. The questions are still written — the ignore is a courtesy, not a
       precondition. */
    expect(question().ok).toBe(true)
    expect(existsSync(gitignore())).toBe(false)
    expect(existsSync(join(mine(project), `${FILE}.json`))).toBe(true)
  })

  test('a .gitignore that already ignores the folder is left byte for byte alone', () => {
    mkdirSync(join(project, '.git'))
    const before = `dist\n/${KEHIKOT_DIR}/\n`
    writeFileSync(gitignore(), before)
    expect(question().ok).toBe(true)
    expect(readFileSync(gitignore(), 'utf8')).toBe(before)
  })

  test('the folder existing already means the .gitignore is not touched', () => {
    /* Only the run that CREATES the folder says anything. A project that has
       deleted the rule has said something, and re-adding it on every save would
       be overruling them every few seconds. */
    mkdirSync(join(project, '.git'))
    mkdirSync(mine(project), { recursive: true })
    writeFileSync(gitignore(), 'dist\n')
    expect(question().ok).toBe(true)
    expect(readFileSync(gitignore(), 'utf8')).toBe('dist\n')
  })
})
