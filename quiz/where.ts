import { existsSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * Where a question's document is, in the two spellings this program needs —
 * and whether it is actually there.
 *
 * ## The bug this file was written against, and where it came from
 *
 * Eighteen questions in the owner's thesis store were anchored to paths like
 * `chapters/1_introduction.tex`. `quiz/types.ts` says a path is "relative to
 * the project", and `wire/pointed.ts` joined every one of them onto the project
 * root before publishing it — so every press pointed the canvas at
 * `<project>/chapters/1_introduction.tex`, a file that does not exist, and the
 * module could not say so because a wrong path and a missing file look the
 * same from a string.
 *
 * Nobody wrote them wrong. They were written on the evening of 2026-08-31,
 * when the project WAS the paper: its chapters sat at `<project>/chapters/`,
 * and `chapters/1_introduction.tex` was exactly the project-relative path the
 * door asked for. An hour later the paper module moved every paper into
 * `<project>/.kehikot/paper/<epic>/`, and the project itself was moved again
 * the day after. The store travelled with the project, which is what storing
 * a relative path is FOR; the paper moved inside the project, which is the one
 * move a relative path cannot survive. The sibling notes module lost
 * fifty-nine anchors to the same hour and its `notes/where.ts` tells the same
 * story.
 *
 * ## What is fixed here, and what deliberately is not
 *
 * Nothing rewrites the store. A migration that guessed where the six files
 * went — they all happen to resolve under `.kehikot/paper/thesis/`, and a
 * program could notice that — would be this module deciding for itself what a
 * path is relative to, which is exactly the decision two programs must not
 * each make alone. And it would be silent: a store quietly respelled is a store
 * whose owner does not know it was ever wrong, and does not know to distrust
 * the next one.
 *
 * What is done instead is the honest thing and the cheaper one: every question
 * that leaves the store says whether its document is where the anchor says —
 * `anchorOf` below — so the page can draw "not in this project" on the card,
 * the MCP `quizzes` tool can print it, and a press has nothing to point at
 * rather than pointing at nothing. The repair is a loud one: `reword_quiz`
 * takes a `path` now, and an agent that has read the sentence can re-spell the
 * six paths in six calls it can see itself making.
 *
 * ## Absolute paths are accepted at the door, and stored relative
 *
 * The other half of the hazard is still live. The paper module's door hands
 * an agent file names relative to the PAPER — `chapters/wire.tex` — and this
 * module's door asks for a path relative to the PROJECT, and neither sentence
 * says what the other is relative to. An agent holding both has no honest way
 * to produce the second from the first without knowing where the paper module
 * keeps its papers, which is not its business. What it does hold is an
 * absolute `projectPath`, and the protocol's own passages are absolute. So an
 * absolute path under the project is now taken and stored relative — `stored`
 * below, the same conversion `notes/where.ts` makes at its one boundary — and
 * the door refuses an anchor whose document is not there, so that the next
 * eighteen cannot be written.
 *
 * ## The two spellings
 *
 * - **stored** — relative to the project root, for every document inside the
 *   project. The file is the partition (`quiz/questions.ts`), so the root is a
 *   fact the file's own location carries and would only be wrong when
 *   repeated. A document outside the project stays absolute, for the reason
 *   notes gives: dropping it is not an option, and forcing it relative would
 *   write `../../elsewhere.tex` into a file that is later opened from another
 *   root and pointed at the wrong sentence.
 * - **resolved** — absolute, under the project, spelled the way the host spells
 *   the root. It is what `wire/pointed.ts` publishes and compares, and what
 *   this file checks against the disk.
 *
 * A relative path that climbs out of the project is never resolved and never
 * checked: it comes back as it is, and `anchorOf` calls it unchecked. Nothing
 * here can name a file outside the project that the store did not already name
 * absolutely.
 */

import type { Anchor } from './types.ts'

/*
 * `Anchor` is spelled in `quiz/types.ts` beside the shapes the page reads,
 * because the page reads it. What `holds` does NOT say is worth repeating
 * here, where it is decided: the bytes are never checked. A paper edited
 * underneath a question moves its range silently, and the quote is what a
 * reader checks that against.
 */

/**
 * A path as it goes into the file.
 *
 * Absolute and under the root becomes relative; absolute elsewhere stays as it
 * is; relative is folded — `chapters/../main.tex` and `main.tex` are one path —
 * and handed back untouched when the folding climbs out, because the one thing
 * this function must never do is turn `../../elsewhere.tex` into a tidy name
 * inside the project. Nothing here reads the disk: a question about a file that
 * has since been deleted is stored exactly like one about a file that is there.
 */
export function stored(root: string | null, path: string): string {
  if (!path || root === null) return path
  if (!isAbsolute(path)) {
    const folded = under(root, resolve(root, path))
    return folded ?? path
  }
  const full = resolve(path)
  return under(root, full) ?? full
}

/**
 * A stored path as the wire and the disk use it: absolute, under the root.
 *
 * An absolute stored path is handed back as it stands. A relative one is
 * joined onto the root, and handed back UNRESOLVED — still relative — when it
 * climbs out, so that no caller can be given an absolute path outside the
 * project by this function.
 */
export function resolved(root: string | null, path: string): string {
  if (!path || root === null) return path
  if (isAbsolute(path)) return path
  const full = resolve(root, path)
  return under(root, full) === null ? path : full
}

/** Whether the document a stored path names is on the disk, as far as this module looks. */
export function anchorOf(root: string | null, path: string): Anchor {
  if (!path || root === null) return 'unchecked'
  const full = resolved(root, path)
  if (!isAbsolute(full) || under(root, full) === null) return 'unchecked'
  return existsSync(full) ? 'holds' : 'missing'
}

/**
 * `child` relative to `parent` when it is inside it, else null. A path equal
 * to the parent is not a document and answers null too.
 */
function under(parent: string, child: string): string | null {
  const rel = relative(parent, child)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}
