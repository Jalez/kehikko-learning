import type { FilterChoice, FilterGroup, Passage as Pointing } from 'kehikot-module-protocol'

import { documentOf, type Anchored } from '@/wire/pointed.ts'

/**
 * How narrow the reader likes this container, offered to the host as a filter.
 *
 * ## What was here before, and which half of it was wrong
 *
 * `src/app.tsx` used to carry a paragraph saying this module had nothing to
 * offer `kehikot.filters`. Its argument was in two halves and they have not
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
 * found by its `path` and its words, as a byte range of the SOURCE file —
 * `quiz/types.ts` — and this module has never paginated anything, and has no
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
 * ## No count in these labels, and none in the page
 *
 * The protocol allows a count in a label and notes uses it. Here the number
 * would change every time the canvas moves — an offer re-sent several times a
 * second to keep a number current in a menu that is usually closed. Nor is one
 * drawn in the page: the questions on screen are the message, and a line saying
 * how many more exist elsewhere cost a row of a box that is often 220 pixels
 * wide. The one thing the page says is why it is EMPTY, when a scope emptied
 * it — `whyUnscoped` below.
 */
export function offer(reach: Reach, greeted = true): FilterGroup[] | null {
  /*
   * Three answers, not two, and the third is the one that was missing.
   *
   * An empty offer is a CLAIM — "there is nothing here to narrow by" — and the
   * host acts on it: it withdraws the control and prunes this container's
   * stored choice, which is right when a module genuinely has no ladder.
   *
   * But this effect first runs on mount, before the canvas has said anything,
   * when `passage` is null and `reach.file` is therefore false. So a module that
   * answered `[]` there would claim it had nothing to offer at the one moment it
   * could not possibly know — and the host, believing it, would erase the
   * remembered scope on every single load. The setting would appear to work
   * perfectly and be forgotten every time the page was reloaded.
   *
   * Found in the checklist module against the real host, where it did exactly
   * that. `null` is the honest answer for "I have nothing to say yet": the
   * caller sends nothing at all, and whatever was last offered stands.
   */
  if (!greeted) return null
  if (!reach.file) return []
  const options = [
    { id: 'all', label: 'Anywhere' },
    { id: 'file', label: RUNG.file },
  ]
  if (reach.section) options.push({ id: 'section', label: RUNG.section })
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

/** What the two narrow rungs are called in the header, spelled once. */
const RUNG = { file: 'This document', section: 'This passage' } as const

/**
 * The scope as it can apply beside the picked parts of the epic.
 *
 * The scope narrows to the document the canvas points at, and the parts
 * (`wire/focus.ts`) narrow what it leaves to the files they own. When that
 * document is in none of the picked parts the two have nothing in common: no
 * question can be about it and in a picked part at once. A passage is not
 * always moved by a tick — on a kehikko with no paper it is wherever a
 * question's source was last pressed — so the scope stood on the old chapter
 * and every part picked after it came up empty.
 *
 * So there the parts lead and the scope is `all`, silently. The reader's
 * choice is untouched: the host still holds it, its control still shows it,
 * and it narrows again the moment the canvas points into a picked part or the
 * parts are unpicked. Where the document IS in a picked part the scope applies
 * as it always did — that is the reader asking for one document of the parts
 * they picked.
 *
 * `inParts` is whether the pointed document is in a picked part; it is not
 * read unless `focused`.
 */
export function besideParts(scope: Scope, focused: boolean, inParts: boolean): Scope {
  return focused && !inParts ? 'all' : scope
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
 * Overlap, not containment. A question whose words were found at bytes 1024–1180 is about the
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
    if (documentOf(projectPath, question.source) !== passage.path) return false
    if (!ranged) return true
    const at = question.source?.at
    return !!at && at.from < to && at.to > from
  })
}

/**
 * The one sentence for a pane the reader's own scope emptied, or null at
 * `all`, which empties nothing.
 *
 * Said only where there would otherwise be nothing on screen at all: a
 * narrowing that leaves questions says nothing about the ones it left out. It
 * names the control by the words on it and where it is, because that press is
 * the way back.
 */
export function whyUnscoped(scope: Scope): string | null {
  if (scope === 'all') return null
  const what = scope === 'section' ? 'passage' : 'document'
  return `No question here is about this ${what}; this container’s scope is “${RUNG[scope]}”, in its header.`
}
