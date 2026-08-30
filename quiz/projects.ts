/**
 * Which project a question belongs to, and why this app partitions by one at all.
 *
 * ## The failure this prevents
 *
 * One process, one port, one store — and two projects open on two canvases. The
 * user asked for exactly this and named it:
 *
 * > the `workspaceState` idea
 *
 * Without a partition, a question written about a chapter of one paper appears
 * in the pane while somebody is reading a different repository's paper that
 * happens to share an epic slug. Slugs are short, lower-case and hand-picked;
 * `bridge`, `wire` and `agents` are all real epic slugs in one project in this
 * workspace and all of them are words a second project would plausibly use. So
 * this is not a hypothetical collision, it is the expected one.
 *
 * The partition is the FIRST key in the store, above the epic, because a
 * question is the project's before it is the epic's: an epic slug means nothing
 * without saying whose epic it is.
 *
 * ## Where the project comes from, on each of the two doors
 *
 * - **The page** is told, by the host, in `roadmap.context.projectPath` — added
 *   by protocol 0.8. It is nullable: a host with no filesystem of its own knows
 *   the project's name and has no folder to point at. A page holding null asks
 *   for nothing and says so, rather than guessing, because guessing means
 *   showing one project's questions inside another.
 * - **An agent over MCP** says which, in the `project` argument, and is refused
 *   if it does not. This is the part worth defending, because a default was
 *   available and every default on offer is wrong:
 *   - `process.cwd()` is this MODULE's directory, not the caller's. It would
 *     file every question under `/Users/…/kehikko-learning` and no page would
 *     ever show one.
 *   - "The only project that exists, if there is exactly one" is correct until
 *     the day there are two, at which point questions silently start landing in
 *     whichever one was created first.
 *   - Nothing at all — an unpartitioned bucket — is a place questions go to be
 *     invisible.
 *
 *   So it is refused, with a sentence saying what to pass. `LEARNING_PROJECT`
 *   sets a default for somebody running this app for exactly one project, which
 *   is a decision a person makes in an environment rather than one this file
 *   makes on their behalf.
 *
 * ## What "the same project" means, and where this is honest about being wrong
 *
 * A path, normalised: trailing slashes removed, nothing else. Symlinks are NOT
 * resolved and `..` is NOT collapsed against the filesystem, because this
 * process may have no access to the path it is being told about — it is a path
 * on the machine, named by a caller, not a file this app opens. Resolving would
 * mean `realpath` on an arbitrary string from the network, which is both a
 * filesystem call this app otherwise never makes and a way for two callers to
 * disagree depending on what happens to be mounted.
 *
 * The cost is real and worth naming rather than hiding: a host that says
 * `/Users/x/Projects/roadmap` and an agent working in a git worktree at
 * `/Users/x/Projects/roadmap/.claude/worktrees/thing` are, to this file, two
 * projects. That is arguably even correct — they are two checkouts — but it will
 * surprise somebody, so `quizzes` with no project lists every project that holds
 * questions, which is how a person finds the bucket their questions went into.
 */

/** As long as a path may be, matching the protocol's own `LIMITS.PATH`. */
export const MAX_PROJECT = 4096

/**
 * A project path as this app keys by one, or null.
 *
 * Null for anything that is not a usable path: not a string, empty once trimmed,
 * longer than the bound, or containing a control character. A control character
 * in an object key is the kind of thing that reads back out of JSON fine and
 * then does something surprising in a terminal, and no real path has one.
 *
 * Relative paths are accepted rather than refused. This app cannot tell a
 * relative path from an absolute one on a machine it is not resolving against,
 * and a caller that consistently says `.` gets a consistent bucket — which is
 * wrong in the sense that it will not match the host's, and right in the sense
 * that it is at least a bucket they can find with `quizzes`.
 */
export function projectKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || raw.length > MAX_PROJECT) return null
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return null
  }
  /* Trailing slashes only. `/a/b/` and `/a/b` are the same directory said two
     ways, and a caller that appends one — as a shell completion does — must not
     get a second store. The root is left alone: `/` normalised to `` would be a
     project with an empty key. */
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed || raw
}

/**
 * The default project, for whoever set one.
 *
 * `LEARNING_PROJECT` first, then `ROADMAP_PROJECT` — the second because a person
 * running a host and this module together in one project has already said so
 * once, and making them say it twice is how the two end up disagreeing. Neither
 * is a fallback in the sense of a guess: if neither is set this returns null and
 * the door refuses, which is the whole argument above.
 */
export function defaultProject(): string | null {
  return projectKey(process.env.LEARNING_PROJECT) ?? projectKey(process.env.ROADMAP_PROJECT)
}

/**
 * The short name for a path, for a heading in a 220px pane.
 *
 * The last segment, which is what a person calls their project. The full path is
 * never dropped from the store and never dropped from what the MCP door prints —
 * this is a label, and a label that could be two different projects is fine on a
 * screen that is only ever showing one of them.
 */
export function projectName(project: string): string {
  const cut = project.lastIndexOf('/')
  return cut === -1 ? project : project.slice(cut + 1) || project
}
