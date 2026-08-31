import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

import { kehikotDir, moduleDir, moduleFile, withKehikotIgnored, within } from 'roadmap-module-protocol'

import { ID } from './manifest.ts'

/**
 * Where this app keeps what is its own — which is inside the project, now, and
 * not beside this program.
 *
 * ## What moved, and why the user asked for it
 *
 * There used to be a `data/` directory next to this app holding one
 * `questions.json` for every project at once, keyed by project path. The user's
 * sentence retired it:
 *
 * > "Each of the modules should hold their data inside the project itself,
 * > mostly as text files inside a kehikko-folder (or json) … That way
 * > everything is transparent etc and easily usable by others in the project."
 *
 * and a second one gave it its shape:
 *
 * > "I think it'd be best if each module has their own folder inside the
 * > .kehikot folder."
 *
 * So: `<projectPath>/.kehikot/learning/questions.json`. The folder name, the
 * derivation of `learning` from this module's id, and the join are all
 * `roadmap-module-protocol`'s, deliberately, because four modules answering
 * "where does my data live" separately is four answers and the disagreement has
 * no symptom — every module starts, every module saves, and a person finds half
 * their work in one folder and half in another. Nothing in this file spells
 * either folder: `moduleDir` is imported, and this module's id comes from
 * `manifest.ts` rather than being written out a second time.
 *
 * A folder of this app's own rather than a file among everybody else's, because
 * it means the next file this module needs does not have to invent a name that
 * says whose it is, and because `rm -r .kehikot/learning` is a sentence a person
 * can say about their own project.
 *
 * ## The path is the partition, so nothing here is keyed by project
 *
 * The store this opens is already one project's. That REPLACES the outer
 * `projects` record that used to sit at the top of `questions.json` rather than
 * sitting on top of it, and the shape it leaves behind is smaller: a store that
 * has never heard of a project has no way to show one project's questions under
 * another's name. The failure the old nesting existed to prevent — two projects
 * both having an epic called `bridge`, which is the expected collision and not a
 * hypothetical one — is now prevented by the file being somewhere else entirely.
 *
 * The cost is named rather than hidden: this app can no longer enumerate the
 * projects it holds questions for, because it holds none of them. `quizzes` used
 * to answer "which projects hold questions" and cannot any more. That answer is
 * also no longer needed, which is the good half of the trade — the questions are
 * in the project, in a folder called `.kehikot/learning`, in plain sight, and a
 * person looking for them can use `ls`.
 *
 * ## Null is a place a person can be, and never a guess
 *
 * `projectPath` is nullable on the wire — no project open, or a host older than
 * protocol 0.8, or a host with no filesystem of its own that knows a project's
 * name and has no folder to point at. This answers `null` for it and every
 * caller has to say so on screen.
 *
 * It does not fall back to `process.cwd()`, to this app's own folder, or to
 * anything else, and the reason is recorded in this file's own history. The
 * version this replaces resolved its directory with `import.meta.dir`, which
 * inside a bundled Vite config is `node_modules/.vite-temp/` — and under Node is
 * `undefined`. Had it merely been the wrong string rather than a throw, this app
 * would have started cleanly, found no `questions.json`, reported that nobody
 * had written a question, and put a new store into a directory Vite deletes.
 * That is every question and every answer gone, with a page that looked fine. A
 * silently wrong location is worse than a loud absent one, and `LEARNING_DATA`
 * is gone with the directory it named: a variable that moves the store would now
 * be a second answer to a question the host already answers.
 *
 * ## The fence, which matters more here than it did before
 *
 * This app is about to write files into a path it was handed OVER THE WIRE — by
 * a host through `roadmap.context`, or by an agent through the MCP door. So the
 * path is resolved with `realpathSync` and the folder it lands in is checked to
 * be under the project it claims to be under, AFTER resolution, because a
 * `.kehikot` that is a symlink to somewhere else is exactly the case a string
 * comparison misses. Resolving this module's own folder covers the whole chain:
 * a link at either level lands outside the project and is refused. `within()` is
 * the comparison and not the check; see its note in the protocol package.
 *
 * The file NAME is a constant in this file and never a string from a request.
 * There is no door here that takes a filename, and `moduleFile` throws rather
 * than returns null if one ever tries.
 */

/** This app's own file, inside this app's own folder. A constant, never an argument. */
export const FILE = 'questions'

/**
 * The one file, or a sentence about why there is not one.
 *
 * Three answers, and they are three because they mean three different things:
 *
 * - `{ path, trouble: null }` — here it is.
 * - `{ path: null, trouble: null }` — there is no project open. An ordinary
 *   state and not a fault; the page says so and nothing is written.
 * - `{ path: null, trouble }` — a project was named and this app will not write
 *   under it. The sentence is for a person, and it says what was refused.
 *
 * Collapsing the middle two would be the bug worth guarding against: an empty
 * store returned for a project that could not be opened is a store the next
 * write flattens a real file with.
 *
 * Reading does not create anything. `makeDir()` is what creates, and it is
 * called on the write path only, so opening a pane against a project never
 * leaves a folder in somebody's repository they did not ask for.
 */
export function dataFile(projectPath: string | null | undefined): { path: string | null; trouble: string | null } {
  const root = projectRoot(projectPath)
  if (root === null) return { path: null, trouble: null }
  if ('trouble' in root) return { path: null, trouble: root.trouble }

  /* Both levels, and both are checked because either can be the link.
     `.kehikot` may point out of the project while this module's folder inside it
     does not exist yet, in which case resolving only the inner one finds nothing
     to resolve and answers as if all were well. Only what exists can be resolved
     and only what exists can escape, so each is checked if it is there — and
     `makeDir` checks again AFTER creating, because a folder that was not there a
     moment ago can be a symlink by the time it is. */
  for (const level of [kehikotDir(root.path), moduleDir(root.path, ID)]) {
    if (level === null || !existsSync(level)) continue
    const escaped = escapes(root.path, level)
    if (escaped) return { path: null, trouble: escaped }
  }
  const path = moduleFile(root.path, ID, FILE)
  if (path !== null && existsSync(path)) {
    const escaped = escapes(root.path, path)
    if (escaped) return { path: null, trouble: escaped }
  }
  return { path, trouble: null }
}

/**
 * Make this module's folder, and tell the project's `.gitignore` about it —
 * once.
 *
 * Called before a write and not before a read, so that looking at a project
 * never changes it. A reader who opens a pane against a repository and writes
 * nothing leaves no trace of having done so.
 */
export function makeDir(projectPath: string | null | undefined): { dir: string | null; trouble: string | null } {
  const root = projectRoot(projectPath)
  if (root === null) return { dir: null, trouble: null }
  if ('trouble' in root) return { dir: null, trouble: root.trouble }

  const dir = moduleDir(root.path, ID)
  if (dir === null) return { dir: null, trouble: null }
  const fresh = !existsSync(dir)
  mkdirSync(dir, { recursive: true })
  /* After the mkdir as well as before it. `existsSync` said nothing was there
     and `mkdirSync` is happy to have followed a symlink somebody put there in
     between; the only honest moment to ask where a directory actually is, is
     once it is there. */
  const escaped = escapes(root.path, dir)
  if (escaped) return { dir: null, trouble: escaped }

  /* Only on the run that created it. A project that has removed the ignore rule
     has said something, and a program that re-added it on every save would be
     overruling them every few seconds. */
  if (fresh) ignore(root.path)
  return { dir, trouble: null }
}

/**
 * Append the ignore rule to the project's `.gitignore`, if the project is under
 * version control at all.
 *
 * ## Why it looks UP for the `.git`, and still writes at the project root
 *
 * The first version of this asked whether `<project>/.git` existed and did
 * nothing otherwise. A real project broke it: the thesis at
 * `…/CS-DEGREE/05_drafts/thesis_latex` has no `.git` of its own and sits several
 * directories inside the CS-DEGREE repository. Under that rule it got no ignore
 * line at all, and a `.kehikot/` full of somebody's questions would have turned
 * up in their next `git status` with nothing there to explain it.
 *
 * So the search walks up. What it does NOT do is write at the repository root:
 * git honours a `.gitignore` in any directory, applied to that directory's
 * subtree, so the rule belongs beside the folder it is about. Writing at the
 * repository root would put a line concerning `05_drafts/thesis_latex` into a
 * file shared by everything else in that repository — a bigger edit to somebody
 * else's project to achieve the same thing.
 *
 * A project with no `.git` anywhere above it gets nothing. Creating an ignore
 * file where there is nothing to ignore for would be this program deciding how
 * somebody keeps their folder.
 *
 * The text and the idempotence are `withKehikotIgnored`'s — append-only, never a
 * rewrite, because this file is in the user's own repository and shows up in
 * their next diff under their name. The rule covers the whole `.kehikot/` rather
 * than this module's folder inside it: the modules are all the same program's
 * working material, and a per-module rule would need a new line every time a
 * module was added, which is a rule that goes quietly stale in somebody else's
 * repository.
 *
 * Every failure here is swallowed on purpose. Not being able to write somebody's
 * `.gitignore` is not a reason to refuse to save their questions.
 */
function ignore(root: string): void {
  try {
    if (!underGit(root)) return
    const path = join(root, '.gitignore')
    /* A project with no `.gitignore` of its own gets one holding only this,
       which is not editing somebody's file. */
    const before = existsSync(path) ? readFileSync(path, 'utf8') : ''
    const after = withKehikotIgnored(before)
    if (after !== before) writeFileSync(path, after)
  } catch {
    /* Deliberately silent. See above. */
  }
}

/**
 * Is this folder inside a git repository — here, or anywhere above it?
 *
 * `.git` is tested with `existsSync` rather than as a directory because a git
 * worktree's `.git` is a FILE pointing at the real one, and a check that
 * insisted on a directory would decide every worktree in this workspace was not
 * under version control.
 *
 * The walk stops at the filesystem root, which `dirname` reports by returning
 * its argument unchanged. That is the termination condition rather than a depth
 * count, because a count is a guess about how deep somebody's directories go.
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
