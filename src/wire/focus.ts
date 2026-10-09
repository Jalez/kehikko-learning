import { FOCUS_WHERE, type Anchors } from 'kehikot-module-protocol'

import type { Anchored } from '@/wire/pointed.ts'
import type { Hidden } from '@/wire/scope.ts'

/**
 * The parts of the epic a person ticked in the host's bar, as this module
 * follows them.
 *
 * The rule, the count and the sentence are the protocol's (`useFocus`,
 * 0.34.0). What is here is the two things only this module knows: what
 * anchors a question, and how the sentence shares the one note this page
 * already has for a narrowing (`hiding` in `app.tsx`).
 *
 * ## Third, after the aim and the scope — and ahead of the aim's guess
 *
 * The parts are applied to what the aim and the scope leave, so the three
 * never count one question twice. But while a part is ticked the aim leaves
 * everything, unless a person picked a container out: what the canvas happens
 * to be showing is a guess at where the reader is, and a tick is them saying.
 * `wire/aim.ts` has what went wrong when the guess was applied first. So the
 * number in the sentence is the questions about the rest of the epic, unless
 * a picked-out container or the reader's own scope narrowed first.
 *
 * The editor does not come through here: Edit shows the whole file. Nor does
 * the MCP door: an agent has no canvas and sees every question.
 */

/**
 * What ties a question to a part: the file its source cites, spelled from the
 * project so the protocol can find the paper's folder in it. Null for a
 * question with no source, which is then in no picked part.
 *
 * Not `documentOf`: that answers null for a file that cannot be read, and an
 * unreadable chapter is still the chapter the question is about.
 */
export function anchorOf(projectPath: string | null): (question: Anchored) => Anchors {
  return (question) => (question.source ? { file: `${projectPath ?? ''}/${question.source.path}` } : null)
}

/** What `focus.narrow` said, as much as the note needs. */
interface Narrowing {
  sentence: string
  outside: number
  kept: number
}

/**
 * The page's one note about what is not on screen, with the parts in it.
 *
 * `other` is what the scope or the aim already had to say about the `hidden`
 * questions they put aside, or null. Nothing ticked: `other`, untouched.
 * Otherwise the protocol's sentence, after theirs. The short form — a row of
 * controls 220 pixels wide — stays one phrase: theirs with the two counts
 * added, or `3 outside parts`.
 */
export function focusNote(narrowing: Narrowing, other: Hidden | null, hidden: number): Hidden | null {
  if (!narrowing.sentence) return other
  const kept = narrowing.kept ? ' The one you are on is among them, and stays until you leave it.' : ''
  const away = narrowing.outside - narrowing.kept
  return {
    full: `${other ? `${other.full}. ` : ''}${narrowing.sentence}${kept}`,
    brief: other ? `+${hidden + away} elsewhere` : `${narrowing.outside} outside parts`,
    where: FOCUS_WHERE,
  }
}

/**
 * The empty screen when the ticked parts are what emptied it: there ARE
 * questions the aim and the scope would show. Null when they left none, or
 * nothing is ticked — then the page's other sentences apply.
 */
export function whyUnfocused(narrowing: Narrowing, left: number, before: number): { said: string; remedy: string } | null {
  if (!narrowing.sentence || left > 0 || before === 0) return null
  return { said: `No question here is in the picked parts. ${narrowing.sentence}`, remedy: FOCUS_WHERE }
}

/**
 * Where the reader stands after the ticks changed: the index, in the new
 * list, of the question they were on — or the top when they were on none.
 */
export function standingOn(shown: readonly { id: string }[], on: string | null): number {
  return Math.max(0, on === null ? 0 : shown.findIndex((question) => question.id === on))
}

/**
 * The question a change of ticks may not take away, or null.
 *
 * `keep` is for what a person is in the middle of. Here that is a question
 * whose answer is on its way — the reply has to land on a card — or one they
 * have opened a piece of: the question in full, its explanation. NOT the question that
 * merely happens to be on screen. At the paged rungs one always is, so
 * holding it meant a tick never moved this pane at all: somebody who went
 * from Methods to Results was left on a Methods question, with the reason in
 * a tooltip.
 *
 * `on` is the question on screen at a paged rung, or null at the list.
 */
export function inHand(input: { answering: string | null; on: string | null; part: string }): string | null {
  return input.answering ?? (input.part === 'options' ? null : input.on)
}
