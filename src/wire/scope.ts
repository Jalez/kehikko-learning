import type { FilterChoice, FilterGroup, Passage as Pointing } from 'roadmap-module-protocol'

import { pointingAt, type Anchored } from '@/wire/pointed.ts'

/**
 * How narrow the reader likes this container, offered to the host as a filter.
 *
 * ## What was here before, and which half of it was wrong
 *
 * `src/app.tsx` used to carry a paragraph saying this module had nothing to
 * offer `roadmap.filters`. Its argument was in two halves and they have not
 * fared the same:
 *
 * - **`only unanswered` is refused, and that half stands.** A quiz whose list
 *   silently loses a card the moment it is answered takes away the one thing a
 *   reader comes back for, which is reading the explanation again. It is still
 *   not offered, and inventing it to have something to send would be a control
 *   built for the header rather than for the reader.
 * - **"`shown` and `part` are a position, not a filter" was true and was not the
 *   whole answer.** It is a correct thing to say about the two rungs of the
 *   ladder, and it quietly stood in for a claim about the whole module — that
 *   there was nothing here to narrow BY. There is, and the owner had already
 *   asked for it in different words: "in learning you should also have a similar
 *   focused mode where it can either show questions related to all files,
 *   current file, current page or highlighted section". That is a filter, and it
 *   is this file.
 *
 * ## Grain, not place — which is what makes it a preference rather than a position
 *
 * The distinction the old paragraph was reaching for is real and this offer is
 * built to respect it. What the host remembers per container is one of `all`,
 * `file`, `section`: **how narrow the reader likes it**. WHICH file and WHICH
 * section are never stored and never sent — they are read off the passage the
 * canvas is standing on, every time, in `narrow()` below.
 *
 * So a reader who set `this document` and came back tomorrow, standing in a
 * different chapter, gets that chapter's questions rather than yesterday's.
 * Storing the place instead would be a container remembering a position nobody
 * chose to keep, which is exactly the thing the old paragraph refused — and it
 * would rot the first time a file was renamed.
 *
 * ## Why there is no `page` rung, having gone and looked
 *
 * The owner's sentence named one, so this is a check rather than an omission.
 * `kehikko-paper` does publish a page: `src/use-published-passage.ts` sends
 * `page: sheet.page` on every page turn, so the context genuinely carries one
 * for this material. The half that is missing is on this side. A question is
 * anchored by `path` and a byte range and nothing else — `quiz/types.ts` — and
 * this module has never opened the file, never paginated anything, and has no
 * way to say which sheet a byte offset lands on. `wire/pointed.ts` sends
 * `page: null` for exactly that reason and spends a paragraph on it.
 *
 * A `page` rung would therefore be an option that either hid everything or hid
 * nothing, decided by a comparison this module cannot make. An option that
 * cannot be honoured must not be in the offer, which is the same rule that keeps
 * `file` and `section` out of it when nothing is pointing anywhere.
 */

/** The group id. Named because both halves of this file have to agree on it. */
export const SCOPE = 'scope'

/** How narrow, and nothing about where. The stored value is one of these three. */
export type Scope = 'all' | 'file' | 'section'

/**
 * Which rungs the canvas can honour right now.
 *
 * Derived from the context on every render and never remembered, which is the
 * whole grain-not-place discipline in one type: this says a document is being
 * pointed at, not which one.
 */
export interface Reach {
  /** Something on the canvas names a document, and this module can spell it. */
  file: boolean
  /** That something also names a range within it — a highlighted section. */
  section: boolean
}

/**
 * What can be narrowed by, given where the canvas is standing.
 *
 * `projectPath` is in here because it is what `pointingAt()` needs to turn a
 * question's project-relative path into the absolute one a host sends. With no
 * project path this module cannot compare a question to a passage at all — see
 * the essay in `wire/pointed.ts` — so it cannot honour `file` either, and a page
 * in that state has no questions to narrow anyway.
 */
export function reachOf(projectPath: string | null, passage: Pointing | null): Reach {
  if (!projectPath || !passage) return { file: false, section: false }
  return { file: true, section: passage.from !== null && passage.to !== null }
}

/**
 * The offer, which is a function of the context rather than a constant.
 *
 * ## Only rungs that exist right now
 *
 * `notes/sift.ts` re-sends whenever a COUNT in one of its labels changes; this
 * re-sends whenever a whole rung appears or disappears, which is the stronger
 * version of the same obligation. Nothing is pointing anywhere on a canvas that
 * has just opened, and `this document` there is a control a person can press
 * that answers nothing — worse than a missing one, because it teaches them the
 * header lies.
 *
 * The offer REPLACES the last one whole, so a rung that goes away takes its
 * place in the control with it, and the host reconciles a stored `section`
 * against an offer that no longer has one by falling back. `scopeOf()` below
 * defends the same thing from this side, because the host cannot reconcile
 * anything before this module has offered anything and the greeting goes first.
 *
 * ## And an offer of one option is an empty offer
 *
 * With nothing pointed at, the only rung left is `all` — a group with a single
 * option, which is a menu with one item in it and a press that cannot change
 * anything. So this sends `[]`, which the protocol defines as "nothing here can
 * be narrowed now" and which takes the control away until there is something to
 * choose between.
 *
 * ## The count is NOT in these labels
 *
 * The protocol allows it and notes uses it, and it is wrong here. The number a
 * reader wants is how many questions the narrowing is hiding, which changes
 * every time the canvas moves — that would be an offer re-sent several times a
 * second, on every host on the canvas, to keep a number current in a menu that
 * is usually closed. The count is drawn in the page instead, where this module
 * is already re-rendering anyway, and where there is room to say what it is a
 * count OF. The host cannot count rows it does not render; this module can, and
 * it does it in its own words in `view/quiz.tsx`.
 */
export function offer(reach: Reach): FilterGroup[] {
  if (!reach.file) return []
  const options = [
    { id: 'all', label: 'Anywhere' },
    { id: 'file', label: 'This document' },
  ]
  if (reach.section) options.push({ id: 'section', label: 'This passage' })
  return [{ id: SCOPE, label: 'scope', options, fallback: 'all' }]
}

/**
 * How narrow the reader asked for, as this context can actually honour it.
 *
 * Lenient twice over, and both are required rather than defensive:
 *
 * - **A value this module does not recognise is `all`.** The host reconciles a
 *   stored choice against what a module offers, but it cannot do that before the
 *   module has offered anything, and the greeting goes out first. So the first
 *   choice this page ever receives may name a rung from a version of itself that
 *   no longer exists.
 * - **A rung that cannot be honoured NOW is `all`.** A reader who set `this
 *   passage` and then cleared their selection is not asking for an empty
 *   container; the thing they narrowed to has gone away. The choice is kept by
 *   the host and comes back the moment they highlight something again, which is
 *   the difference between a scope that follows them and one that strands them.
 */
export function scopeOf(chosen: FilterChoice, reach: Reach): Scope {
  const said = chosen[SCOPE]
  if (said === 'section' && reach.section) return 'section'
  if ((said === 'file' || said === 'section') && reach.file) return 'file'
  return 'all'
}

/**
 * The questions this scope leaves on screen.
 *
 * ## Which document, and which section, are read from the context every time
 *
 * Nothing here consults anything remembered. `pointingAt()` is the same join the
 * press uses in the other direction, and `keyOf()`'s argument applies: two
 * spellings of one place would mean a scope that quietly matched nothing. The
 * comparison is on the path only — `keyOf` includes the range, which is what
 * marking a card needs and the opposite of what narrowing to a document needs.
 *
 * ## What `section` means, spelled out
 *
 * Overlap, not containment. A question anchored to bytes 1024–1180 is about the
 * paragraph the reader highlighted if the two ranges touch at all: a person who
 * selects one sentence of a paragraph a question was written about is standing
 * in that question's passage, and demanding their selection contain the whole
 * anchor would empty the container for a reader who was in exactly the right
 * place. The failure in the other direction — a huge selection matching a lot —
 * is a reader asking for a lot.
 *
 * A passage with no range cannot narrow to a section, and `scopeOf()` has
 * already turned that into `file` before this is called. The check is repeated
 * here anyway, because "unreachable" is a property of a caller somebody may
 * change.
 */
export function narrow<T extends Anchored>(
  questions: readonly T[],
  projectPath: string | null,
  passage: Pointing | null,
  scope: Scope,
): T[] {
  if (scope === 'all' || !passage || !projectPath) return [...questions]
  const from = passage.from
  const to = passage.to
  const ranged = scope === 'section' && from !== null && to !== null
  return questions.filter((question) => {
    const mine = pointingAt(projectPath, question.passage)
    if (!mine || mine.path !== passage.path) return false
    if (!ranged) return true
    return question.passage.start < to && question.passage.end > from
  })
}

/**
 * What to say about the questions a scope is hiding, in this module's words.
 *
 * Here rather than in the view because it is the sentence that has to stay true
 * to what `narrow()` actually did, and the two should be read together. The host
 * cannot write it: it does not render the rows, cannot read the document, and is
 * looking at a frame on another origin.
 *
 * Null when nothing is hidden, because a line reading "0 more" is a row of chrome
 * saying nothing happened.
 *
 * ## Two spellings, for the two rooms this module gets
 *
 * The same trade as `sourceLabel()` and the retake note, and for the same reason.
 * At the `list` rung the count has a line to itself under the heading and says
 * what it is a count of. At the paged rungs it goes into the one row of controls
 * beside the pager and the score, in a box 220 pixels wide where a forty-
 * character sentence would take a whole extra row from the question — so it is
 * `+3 elsewhere`, with the long form on the row's `title`.
 *
 * `brief` is deliberately shaped so `controlsHeight()` in `view/room.ts` can
 * reserve it from the question COUNT alone, without knowing whether anything is
 * hidden. Reserving a row that is usually not drawn is the conservative
 * direction; measuring the row that is drawn would be the layout deciding its own
 * height, which is the loop that whole file is arranged to avoid.
 */
export interface Hidden {
  /** For a line of its own: `3 more questions outside this passage`. */
  full: string
  /** For a row of controls in a 220-pixel column: `+3 elsewhere`. */
  brief: string
}

export function hiddenNote(scope: Scope, hidden: number): Hidden | null {
  if (hidden <= 0 || scope === 'all') return null
  const many = hidden === 1 ? '1 more question' : `${hidden} more questions`
  return {
    full: scope === 'section' ? `${many} outside this passage` : `${many} about other documents`,
    brief: `+${hidden} elsewhere`,
  }
}
