/**
 * Which project a caller means, and what is left of that question now that the
 * path is the partition.
 *
 * ## What this file used to be, and what happened to it
 *
 * It used to hold the partition. `questions.json` was one file beside this
 * program with a `projects` record at the top of it, `projectKey()` produced the
 * key, and the essay here argued at length that a question is the project's
 * before it is the epic's — because `bridge`, `wire` and `agents` are all real
 * epic slugs in one project in this workspace and all of them are words a second
 * project would plausibly use.
 *
 * The argument was right and the mechanism is gone, because the user moved the
 * store into the project itself:
 *
 * > "Each of the modules should hold their data inside the project itself,
 * > mostly as text files inside a kehikko-folder (or json)"
 *
 * `<projectPath>/.kehikot/learning/questions.json`. **The path IS the partition now.**
 * Two projects with an epic called `bridge` do not collide because they are two
 * files in two folders, and there is no longer a shape in which they could — a
 * store that has never heard of a project cannot key by the wrong one. That is
 * strictly stronger than a record key, which is why this file got smaller rather
 * than bigger.
 *
 * ## What survives, and why
 *
 * A path still arrives from outside — from a host in `roadmap.context`, from an
 * agent in a tool argument — and something still has to look at it before
 * `store.ts` takes it to the filesystem. That is all this file is now.
 *
 * What does NOT survive is the listing. `quizzes` with no project used to answer
 * "which projects hold questions", and it was a genuinely useful answer: it was
 * how a person found the bucket their questions had gone into. This app cannot
 * answer it any more, because it no longer holds anybody's questions — they are
 * in the projects. The answer is also no longer needed, which is the good half
 * of the trade: the file is `.kehikot/learning/questions.json` inside the folder you were
 * working in, in plain sight, and `ls` finds it. A module that kept a register of
 * every project it had ever been shown, purely to answer that question, would be
 * reintroducing the central store this change removed.
 *
 * `projectName()` went with it. Nothing called it: the page is told what the
 * project is CALLED by the host, in `context.project`, which is a name a person
 * chose rather than the last segment of a path they chose for their disk.
 */

/**
 * As long as a path may be, matching the protocol's own `LIMITS.PATH`.
 *
 * 4096 is Linux's `PATH_MAX` and the larger of the two numbers this could stand
 * on — macOS imposes 1024 — so the bound never refuses a path the operating
 * system was willing to hand out. It is restated here rather than imported
 * because the MCP tool descriptions interpolate it into a sentence a caller
 * reads, and a number that has to be remembered in two places is a number that
 * will be wrong in one of them.
 */
export const MAX_PROJECT = 4096

/**
 * A project path, tidied — or null if it is not one at all.
 *
 * ## A gate, not a key
 *
 * This used to be called `projectKey` and used to produce the string a store was
 * keyed by. It keys nothing now. What it does is answer, WITHOUT TOUCHING THE
 * FILESYSTEM, whether a caller said something that could be a path — so that
 * `store.ts` is not asked to `realpath` a control character, an empty string, or
 * four kilobytes of somebody's paragraph.
 *
 * Cheap and syntactic on purpose, and it deliberately does not overlap with what
 * `store.ts` does. Whether the folder EXISTS, whether it is a directory, whether
 * `.kehikot` inside it is a symlink pointing somewhere else — those are questions
 * only the filesystem can answer, they are answered there, once, and the refusal
 * comes back as a sentence. Two files both deciding whether a path is usable is
 * two files that will eventually disagree.
 *
 * Null for anything that is not a usable path: not a string, empty once trimmed,
 * longer than the bound, or containing a control character. A control character
 * in a path is the kind of thing that reads back out of JSON fine and then does
 * something surprising in a terminal, and no real path has one.
 *
 * Relative paths pass here and are refused in `store.ts`, with a sentence saying
 * why. That is deliberate: "you did not say which project" and "that is not
 * somewhere on this machine" are two different mistakes, and a caller can only
 * act on the one they actually made.
 *
 * Two spellings of the same directory — `/a/b` and `/a/b/../b` — are no longer
 * this file's problem either, and that is the one behaviour that got BETTER
 * rather than merely moving. The old note here admitted the two were different
 * projects and could not be unified, because resolving would have meant
 * `realpath` on an arbitrary string. `store.ts` now runs exactly that `realpath`,
 * because it has to anyway: it is about to write a file there.
 */
export function usablePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || raw.length > MAX_PROJECT) return null
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return null
  }
  /* Trailing slashes only. `/a/b/` and `/a/b` are the same directory said two
     ways, and a caller that appends one — as a shell completion does — should
     not get a different sentence back. The root is left alone: `/` stripped of
     its trailing slash is the empty string, which is not a path. */
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed || raw
}

/**
 * The default project, for whoever set one.
 *
 * ## Why a default exists at all, when every automatic one is wrong
 *
 * The MCP door refuses a tool call that does not say which project it means, and
 * that refusal is the same decision it always was. Every default AVAILABLE TO
 * THE PROGRAM is wrong, and the list is worth keeping because somebody will
 * propose one of them again:
 *
 * - `process.cwd()` is this MODULE's directory, not the caller's. It would write
 *   `.kehikot/learning/questions.json` inside this module's own repository, and
 *   no canvas would ever show one of those questions.
 * - "the only project that exists, if there is exactly one" is not even
 *   expressible now. This app holds no register of projects; it is handed one
 *   path at a time and forgets it.
 * - Nothing at all is not an option either. There is no unpartitioned bucket to
 *   fall back to — the file lives in a project or it does not exist.
 *
 * `LEARNING_PROJECT` is different in kind from all three, because it is not the
 * program guessing. It is a person who runs this app for exactly one project
 * saying so, once, in an environment they control. `ROADMAP_PROJECT` is honoured
 * after it because somebody running a host and this module together in one
 * project has already said it once, and making them say it twice is how the two
 * end up disagreeing.
 *
 * Neither is a fallback in the sense of a guess: with neither set this returns
 * null, the door refuses, and the refusal names what to pass.
 */
export function defaultProject(): string | null {
  return usablePath(process.env.LEARNING_PROJECT) ?? usablePath(process.env.ROADMAP_PROJECT)
}
