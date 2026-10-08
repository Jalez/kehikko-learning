import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { kehikotDir, moduleDir, withKehikotIgnored, within } from 'kehikot-module-protocol'

import { ID } from './manifest.ts'

/**
 * Where this app keeps what is its own: inside the project it is about, in
 * `<project>/.kehikot/learning/`. One Markdown file per epic holds that epic's
 * questions (`<epic>.md`, see `quiz/format.ts`), and `answers.json` beside them
 * holds what a reader answered. The folder name and the join are
 * `kehikot-module-protocol`'s, so every module answers "where does my data
 * live" the same way.
 *
 * ## Null is a place a person can be, and never a guess
 *
 * `projectPath` is nullable on the wire. This answers `null` for it and every
 * caller says so on screen. It does not fall back to `process.cwd()` or to this
 * app's own folder: a silently wrong location is worse than a loud absent one.
 *
 * ## The fence
 *
 * The path arrives over the wire — from a host, or from an agent through the
 * MCP door — so it is resolved with `realpathSync` and every level under it is
 * checked to be inside the project AFTER resolution: a `.kehikot` that is a
 * symlink to somewhere else is exactly the case a string comparison misses.
 * A file's name is a constant or an epic slug that has been checked for shape;
 * no door here takes a filename.
 */

/**
 * One file in this module's folder, or a sentence about why there is not one.
 *
 * - `{ path, trouble: null }` — here it is (it may not exist yet).
 * - `{ path: null, trouble: null }` — there is no project open. Not a fault.
 * - `{ path: null, trouble }` — a project was named and this app will not
 *   read or write under it. The sentence is for a person.
 *
 * Reading does not create anything. `makeDir()` is what creates, and it is
 * called on the write path only.
 */
export function dataFile(projectPath: string | null | undefined, name: string): { path: string | null; trouble: string | null } {
  const root = projectRoot(projectPath)
  if (root === null) return { path: null, trouble: null }
  if ('trouble' in root) return { path: null, trouble: root.trouble }

  /* Every level, because any of them can be the link. Only what exists can be
     resolved and only what exists can escape; `makeDir` checks again AFTER
     creating. */
  const dir = moduleDir(root.path, ID)
  if (dir === null) return { path: null, trouble: null }
  const path = join(dir, name)
  for (const level of [kehikotDir(root.path), dir, path]) {
    if (level === null || !existsSync(level)) continue
    const escaped = escapes(root.path, level)
    if (escaped) return { path: null, trouble: escaped }
  }
  return { path, trouble: null }
}

/**
 * Make this module's folder, and tell the project's `.gitignore` about it —
 * once. Called before a write and not before a read, so that looking at a
 * project never changes it.
 */
export function makeDir(projectPath: string | null | undefined): { dir: string | null; trouble: string | null } {
  const root = projectRoot(projectPath)
  if (root === null) return { dir: null, trouble: null }
  if ('trouble' in root) return { dir: null, trouble: root.trouble }

  const dir = moduleDir(root.path, ID)
  if (dir === null) return { dir: null, trouble: null }
  const fresh = !existsSync(dir)
  mkdirSync(dir, { recursive: true })
  /* After the mkdir as well as before it: the only honest moment to ask where
     a directory actually is, is once it is there. */
  const escaped = escapes(root.path, dir)
  if (escaped) return { dir: null, trouble: escaped }

  /* Only on the run that created it. A project that has removed the ignore rule
     has said something, and re-adding it on every save would overrule them. */
  if (fresh) ignore(root.path)
  return { dir, trouble: null }
}

/** Written to a temporary file and renamed, so a crash never leaves half a file. */
export function put(file: string, text: string): void {
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, text)
  renameSync(temporary, file)
}

/** The largest file a quote is looked for in. A paper's chapter is far smaller. */
const MAX_CITED_BYTES = 5_000_000

/**
 * A project file's text, for finding a quote in, or null when it cannot be
 * read: missing, not a file, too large, or resolving outside the project. The
 * path is a quiz file's, so it is a stranger's string: confined like our own.
 * (Slides' `citedText`, copied.)
 */
export function citedText(root: string, path: string): string | null {
  if (!path || isAbsolute(path) || path.replace(/\\/g, '/').split('/').includes('..')) return null
  const file = join(root, path)
  try {
    if (escapes(root, file)) return null
    const stat = statSync(file)
    if (!stat.isFile() || stat.size > MAX_CITED_BYTES) return null
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * Append the ignore rule to the project's `.gitignore`, if the project is under
 * version control at all.
 *
 * It looks UP for the `.git` — a project several directories inside a
 * repository is still under version control — and still writes at the project
 * root, because git honours a `.gitignore` in any directory and the rule
 * belongs beside the folder it is about. A project with no `.git` anywhere
 * above it gets nothing.
 *
 * The text and the idempotence are `withKehikotIgnored`'s: append-only, never a
 * rewrite. Every failure here is swallowed on purpose — not being able to write
 * somebody's `.gitignore` is not a reason to refuse to save their questions.
 */
function ignore(root: string): void {
  try {
    if (!underGit(root)) return
    const path = join(root, '.gitignore')
    const before = existsSync(path) ? readFileSync(path, 'utf8') : ''
    const after = withKehikotIgnored(before)
    if (after !== before) writeFileSync(path, after)
  } catch {
    /* Deliberately silent. See above. */
  }
}

/**
 * Is this folder inside a git repository — here, or anywhere above it?
 * `existsSync` rather than a directory test, because a worktree's `.git` is a
 * FILE pointing at the real one.
 */
function underGit(from: string): boolean {
  let at = from
  for (;;) {
    if (existsSync(join(at, '.git'))) return true
    const up = dirname(at)
    if (up === at) return false
    at = up
  }
}

/**
 * The project root as this program uses it — resolved, a real directory — or
 * null when there is no project or the path was refused. It is the spelling
 * every path in a quiz file is relative to.
 */
export function rootOf(projectPath: string | null | undefined): string | null {
  const root = projectRoot(projectPath)
  return root !== null && 'path' in root ? root.path : null
}

/** The project, resolved — or null for "no project", or a sentence for a refusal. */
function projectRoot(projectPath: string | null | undefined): { path: string } | { trouble: string } | null {
  if (typeof projectPath !== 'string') return null
  const raw = projectPath.trim()
  if (!raw) return null
  if (raw.length > 4096) return { trouble: 'that project path is longer than any path on this machine can be.' }
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) {
      return { trouble: 'that project path has a control character in it, and no real path does.' }
    }
  }
  if (!isAbsolute(raw)) {
    return {
      trouble:
        `"${raw}" is not an absolute path. A project is somewhere on this machine, and a relative path would be `
        + 'resolved against whatever directory this app happens to have been started in.',
    }
  }
  let resolved: string
  try {
    resolved = realpathSync(raw)
    if (!statSync(resolved).isDirectory()) {
      return { trouble: `"${raw}" is not a folder, so there is nowhere under it to keep anything.` }
    }
  } catch {
    return { trouble: `there is no folder at "${raw}" on this machine, so nothing can be read or written under it.` }
  }
  return { path: resolved }
}

/** The fence: a sentence if `child` is not really under `root`, null if it is. */
function escapes(root: string, child: string): string | null {
  let real: string
  try {
    real = realpathSync(child)
  } catch {
    return `${child} could not be resolved, so this app will not write through it.`
  }
  if (within(root, real)) return null
  return (
    `${child} resolves to ${real}, which is outside the project it claims to be inside. Nothing has been read or `
    + 'written: a folder that points somewhere else is how one project’s questions end up in another’s, and it is '
    + 'refused rather than followed.'
  )
}
