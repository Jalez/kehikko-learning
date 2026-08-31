import type { Passage as Pointing } from 'roadmap-module-protocol'

import type { Passage } from '../../quiz/types.ts'

/**
 * A question's anchor, in the spelling the canvas uses — and the reverse, which
 * is which question the canvas is currently pointed at.
 *
 * ## Why this is a file, and not four lines in `quiz.tsx`
 *
 * The same reason `view/room.ts` is a file. Every decision here is a pure
 * function of values this app already holds, and every one of them is a thing
 * that can only otherwise be checked by driving a browser: whether a relative
 * path and a project root join into the same string a host would send back,
 * whether a passage that arrived names a question in the list, whether the
 * marked card is the pressed card. Those are assertions, and they belong
 * somewhere they can be asserted.
 *
 * `notes/pointed.ts` in the sibling notes module is the same file for the same
 * reason, and `keyOf` below is deliberately the same function it and
 * `kehikko-paper/src/reader/pointed.ts` both hold. That is not duplication
 * anybody should collapse: the protocol's note on `path` says consumers compare
 * a passage for EQUALITY, and equality needs one spelling, so every module that
 * consumes passages ends up writing this. What is shared is the wire, and the
 * wire is the protocol package.
 *
 * ## Nothing here names another module, and that is the whole mechanism
 *
 * There is no paper module in this file. There is no reader, no port, no
 * endpoint and no message type of this app's own. What a press does is put a
 * passage in the canvas's context through `passage.set`, and whatever is on the
 * canvas that understands a passage answers it — a paper today, a source
 * browser, notes, a diff. If this file named the module it expected to react,
 * the feature would break the day somebody put a question beside a different
 * reader, and it would be a second system doing what the context already does.
 *
 * The test of that claim is easy to state: delete every reader on the canvas,
 * replace it with a different one, and nothing in this file changes.
 */

/**
 * The passage to publish for a question, in the spelling a host can use — or
 * null when this app cannot honestly spell one.
 *
 * ## The join, and why it is here rather than at the call site
 *
 * A question's `passage.path` is relative to the project ("as the project
 * spells it" — see the refusal in `quiz/questions.ts`), because that is what
 * survives the project being moved or cloned somewhere else, and the store is
 * partitioned by project path so the root is never in doubt. A `Passage` on the
 * wire is the opposite: the protocol's own note says a host with a filesystem
 * should carry an ABSOLUTE path, because that is the only spelling two modules
 * can agree on without sharing a root.
 *
 * So somebody has to join them, and it has to be the same join every time — the
 * published passage and the arriving one are compared for equality, and two
 * spellings of one place would mean a press that points the canvas correctly
 * and then fails to mark the card that did it. One function, used by both
 * directions, cannot drift from itself.
 *
 * A stored path that is already absolute is passed through rather than nailed
 * onto the root. Nothing forbids an agent writing one — `add_quiz` asks for a
 * project-relative path and does not enforce it, because it has no filesystem
 * of the project to check against — and `${root}//Users/...` is a path that
 * exists nowhere and points at nothing.
 *
 * ## Null when there is no project, and not a guess
 *
 * With no `projectPath` this app has been told a canvas is standing somewhere
 * it will not name, and a relative path published as though it were a document
 * identity is a claim every other module would resolve against its own root.
 * That is the same rule the store keeps — see `Roadmap.projectPath` in
 * `use-roadmap.ts` — and it costs nothing on screen, because a page with no
 * project path is showing `NoProject` and has no questions to press.
 *
 * ## What is deliberately not sent
 *
 * `page` is always null. This module paginates nothing and has never opened the
 * file; a page number invented here would be a filter every consumer is
 * entitled to trust, computed from nothing.
 *
 * `quoted` is the stored quote, whole. It fits: `MAX_QUOTE` in
 * `quiz/questions.ts` is 2000, which is `LIMITS.QUOTE` exactly, so a question
 * that got into this store has a quote the wire will take. That is worth one
 * sentence rather than a clamp, because the protocol REFUSES an over-long quote
 * instead of clipping it — a clipped quote is a quote of something nobody said,
 * and a consumer comparing it against the file would call a good anchor rotten.
 * If those two numbers ever part, the fix is at the store, where the side that
 * knows it shortened something is the side that can say so.
 */
export function pointingAt(projectPath: string | null, passage: Passage): Pointing | null {
  if (!projectPath) return null
  const root = projectPath.endsWith('/') ? projectPath.slice(0, -1) : projectPath
  const path = passage.path.startsWith('/') ? passage.path : `${root}/${passage.path}`
  return { path, page: null, from: passage.start, to: passage.end, quoted: passage.quote }
}

/**
 * One passage, as a string that can be compared.
 *
 * The quote is deliberately not part of it, and this is the third module in the
 * workspace to write that sentence. It is the longest and least stable field: it
 * is bounded on the way out and a host is entitled to re-read it from the file
 * on the way back, so two spellings of one place would stop matching and the
 * mark below would silently stop marking. Where a passage IS is its path, its
 * page and its range; the quote is what happened to be written there.
 */
export function keyOf(pointing: Pick<Pointing, 'path' | 'page' | 'from' | 'to'>): string {
  return `${pointing.path} ${pointing.page ?? ''} ${pointing.from ?? ''} ${pointing.to ?? ''}`
}

/** As much of a question as says where it came from. */
export interface Anchored {
  id: string
  passage: Passage
}

/**
 * Which question the canvas is currently pointed at, or null.
 *
 * ## Why there is no echo guard here, when two sibling modules needed one
 *
 * Publishing a passage makes the host broadcast it back to every framed module
 * INCLUDING the one that asked, so a module that reacts to arriving passages
 * reacts to its own. That has now cost this workspace two bugs: in notes a press
 * re-scoped the list to the note that had just been pressed and hid every other
 * one, and in the paper module it scrolled the reader's document out from under
 * them. Both carry the essay — `notes/pointed.ts` and
 * `kehikko-paper/src/reader/pointed.ts` — and notes needed a second key on top,
 * because there a press changes state immediately and the comparison ran a full
 * render before the echo could arrive.
 *
 * Neither applies here, and the difference is not luck. What both of those
 * modules do about an arriving passage is DESTRUCTIVE of something the reader
 * had: a list scope, a scroll position. Something they cannot get back by
 * pointing again. So an echo mistaken for a person costs them that thing, and
 * the guard is what buys it back.
 *
 * What this module does about an arriving passage is mark the card it names.
 * That is idempotent, it destroys nothing, and on an echo it is not merely
 * harmless — it is the correct answer, and it is the whole of feature 5. A
 * person presses the source of a question, the canvas moves, the context comes
 * back naming that passage, and the card that sent it is marked. The echo IS the
 * confirmation. A guard here would suppress exactly the mark the press was made
 * to produce, and would then have to be undone by remembering the press
 * separately — a second record of a fact the context already carries, wrong
 * whenever the host refuses.
 *
 * That last clause is the reason this is driven by the context and never by a
 * memory of what this page asked for. A host may refuse `passage.set`, or not
 * know the method, or never have greeted this page at all. Then the canvas did
 * not move, and a card marked as "where the canvas is pointed" would be a
 * drawing of something that did not happen.
 *
 * ## Every match, and the first one is taken
 *
 * Two questions can be written about the same passage, and should be — asking
 * two things about one paragraph is ordinary. They would both be where the
 * canvas is pointed, which is true, and marking both is the honest drawing;
 * this returns the first because a caller wanting a set can compare keys itself,
 * and one id is what a `data-` attribute holds. See the call site.
 */
export function pointedQuestion(
  projectPath: string | null,
  questions: readonly Anchored[],
  live: Pointing | null,
): string | null {
  if (!live) return null
  const where = keyOf(live)
  for (const question of questions) {
    const mine = pointingAt(projectPath, question.passage)
    if (mine && keyOf(mine) === where) return question.id
  }
  return null
}

/**
 * What to call the document a question came from, in the room there is for it.
 *
 * ## Why a question says where it came from at all
 *
 * Because otherwise there is no reason to press. The control that points the
 * canvas used to read "the passage this is about", which is a description of a
 * mechanism rather than a fact about this question — every card said the same
 * words, and none of them told a reader whether the question came from the
 * chapter they were reading or from an appendix they have never opened.
 *
 * ## Why the deciding is in `room()` and not in a container query
 *
 * `room()` is where this repo settled every "what earns its space" question,
 * and it is the file somebody reads to find out what shows at 220×300. A ternary
 * on a class list would be that decision written somewhere nobody looks. The
 * width thresholds and the argument for them are there; this function only
 * applies the answer.
 *
 * The narrow spelling is the last segment, which is never wrong — only shorter.
 * `data/papers/modes-are-modules/chapters/agents.tex` is 48 characters and four
 * lines in a 220-pixel column, and four lines of grey path above a question is
 * exactly the too-much-prose-in-a-narrow-column complaint this repo keeps
 * getting. `agents.tex` is one line at every width this module is ever given,
 * and the whole path is still in the control's `title` and inside the passage
 * itself, so nothing is lost — it is one hover or one press away.
 */
export function sourceLabel(path: string, how: 'path' | 'file'): string {
  if (how === 'path') return path
  const cut = path.lastIndexOf('/')
  return cut === -1 ? path : path.slice(cut + 1)
}
