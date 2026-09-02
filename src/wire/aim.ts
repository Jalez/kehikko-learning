import type { Passage as Pointing } from 'roadmap-module-protocol'

import { pointingAt, type Anchored } from '@/wire/pointed.ts'

/**
 * Which questions are in front of the reader, once the kehikko can say what
 * each of its containers is showing and which of them are picked out.
 *
 * ## The sentence this file implements
 *
 * > "learning modules questions should be similarly tied to the shown text so
 * > that by default it only lists the questions related to the text OR chapter
 * > that is shown in a paper (or the step that is shown in a journey for
 * > instance)."
 *
 * The host lists every container on the kehikko — `context.containers`: which
 * module, whether a person picked it out with the box in its header, and what
 * it says it is showing. The rule the protocol states once, so that three
 * consumers do not state it three ways, is: nothing picked out means
 * everything — the passage, the selection, and the union of what every
 * container shows; some picked out means only what those show. This file is
 * that rule for questions, which are anchored to places in documents and to
 * nothing else — so a container's refs are of no interest here and are never
 * read. A journey step picked out on its own shows no document, and this
 * container says so rather than guessing which chapter a step is about.
 *
 * ## This module keeps the union, where notes deviated, and the reason is the direction it moves in
 *
 * `notes/aim.ts` in the sibling module refuses the union when nothing is
 * picked out: its resting state is already the narrowest rung anybody is on —
 * the reader's own passage — and the union of every open document would
 * WIDEN it, undoing on every context the narrowing that module exists to do.
 * This module's resting state is the opposite. With no aim at all it lists
 * every question about the epic, and the union of what the canvas shows is
 * NARROWER than that: a paper open at chapter three is exactly "the text or
 * chapter that is shown", and taking the union is what makes the pane list
 * chapter three's questions before anybody has ticked a box. That is the
 * owner's sentence, word for word, so the rule is followed as written.
 *
 * The one reading the rule leaves open is a canvas on which nothing shows
 * anything: no container has spoken and nothing is pointed at. Literally,
 * nothing is in front. This module shows the whole epic there, which is what
 * `paper` in the checklist's `list/aim.ts` decides for the same case — nobody
 * has narrowed, and a pane emptied by silence is a pane whose emptiness has
 * no cause a person could see or undo.
 *
 * ## Matched by document, never by range, and `scope` is where the range lives
 *
 * A place a container shows may carry a byte range — the host folds the
 * pointed passage into the container that pointed it, and a highlighted
 * sentence arrives with `from` and `to`. This file matches on the PATH only.
 * The owner's sentence says "the text OR chapter", and the grain — this
 * document, this passage — is already the reader's own choice in the `scope`
 * group beside this one (`wire/scope.ts`), read off the same passage. Two
 * controls that both narrowed by range would be one preference stored twice
 * with two spellings, and a tick on a paper container would silently narrow a
 * reader who had set their scope to the whole document.
 *
 * ## This container's own row is left out, on both sides
 *
 * This module says what it shows — `showing.set`, see `manifest.ts` — so its
 * own row in the host's list carries the documents of the questions it is
 * currently listing. Reading that row back would make the answer depend on
 * itself: with nothing picked out, the union would hold yesterday's chapter
 * beside today's, this pane would list both, say so, and never narrow again.
 * Picked out alone, it would be asked to narrow to what it is showing, which
 * is a sentence with no content. So `self` is dropped before anything is
 * counted, and picking out only this container narrows nothing.
 *
 * ## Narrowing says what it hid
 *
 * A container emptied by a tick on a neighbour has to say so, or its
 * emptiness has no visible cause. So what comes back names the picked-out
 * containers and, separately, the ones showing no document at all —
 * "journeys is picked out and shows no document" is a different sentence from
 * "none of these questions is about what paper shows", with a different
 * remedy. And a third absence, which is this module's own: a question whose
 * anchor does not resolve — `quiz/where.ts` — can never be in front of
 * anything, because the places a container shows are real files and its
 * anchor is not one. Those are counted and named too, because otherwise the
 * eighteen questions this was written against would vanish behind a tick and
 * the sentence would blame the paper.
 *
 * ## An older host
 *
 * Lists no containers, so nothing narrows, no control is offered, and the page
 * is the page it was. Pure, so `test/aim.test.ts` is a table of canvases.
 */

/** A place in a document, as the wire carries one — the path is what this file compares. */
export interface Place {
  path: string
  from: number | null
  to: number | null
}

/** One container on the kehikko, as this page reads the host's list. Refs are not carried; questions have no use for them. */
export interface Shown {
  module: string
  selected: boolean
  documents: Place[]
}

/** The filter group's id and its two options, spelled once and the same as the sibling modules spell them. */
export const AIM = 'aim'
export type Aim = 'follow' | 'all'

/** The choice out of `context.filters`, read leniently: anything that is not `all` is following. */
export function aimOf(chosen: Readonly<Record<string, string>> | null | undefined): Aim {
  return chosen && Object.hasOwn(chosen, AIM) && chosen[AIM] === 'all' ? 'all' : 'follow'
}

export interface InFront {
  /**
   * Whether the whole epic is in front: no containers listed, the aim set to
   * everything, or nothing on the canvas showing any document. Then
   * `documents` is empty and means "no narrowing", not "nothing".
   */
  everything: boolean
  /** Whether the picks narrowed this: some other container is picked out and the reader is following. */
  narrowed: boolean
  /** The places in front, one per path, in the canvas's order — the reader's own passage first when nothing is picked. */
  documents: Place[]
  /** The picked-out containers other than this one, in the canvas's order. */
  picked: string[]
  /** Those of them showing no document. */
  quiet: string[]
}

export function inFrontOf(input: {
  self: string
  passage: Place | null
  containers: readonly Shown[]
  aim: Aim
}): InFront {
  const others = input.containers.filter((one) => one.module !== input.self)
  const picked = others.filter((one) => one.selected)
  const quiet = picked.filter((one) => one.documents.length === 0).map((one) => one.module)
  const names = picked.map((one) => one.module)

  if (input.containers.length === 0 || input.aim === 'all') {
    return { everything: true, narrowed: false, documents: [], picked: names, quiet }
  }

  if (picked.length > 0) {
    return {
      everything: false,
      narrowed: true,
      documents: onePerPath(picked.flatMap((one) => one.documents)),
      picked: names,
      quiet,
    }
  }

  const documents = onePerPath([...(input.passage ? [input.passage] : []), ...others.flatMap((one) => one.documents)])
  return { everything: documents.length === 0, narrowed: false, documents, picked: names, quiet }
}

/**
 * The questions in front, and the ones that are not.
 *
 * `pointingAt()` is the same join a press uses and `wire/scope.ts` uses, so a
 * question is compared against a shown document in exactly the spelling this
 * module would publish it in. A question whose path cannot be spelled — no
 * project — or whose anchor does not resolve is never in front; the second is
 * counted in `unresolved` so the empty sentence can name it.
 */
export function inFront<T extends Anchored & { anchor?: 'holds' | 'missing' | 'unchecked' }>(
  questions: readonly T[],
  projectPath: string | null,
  front: InFront,
): { shown: T[]; unresolved: number } {
  const unresolved = questions.filter((question) => question.anchor === 'missing').length
  if (front.everything) return { shown: [...questions], unresolved }
  const paths = new Set(front.documents.map((one) => one.path))
  const shown = questions.filter((question) => {
    if (question.anchor === 'missing') return false
    const mine = pointingAt(projectPath, question.passage)
    return mine !== null && paths.has(mine.path)
  })
  return { shown, unresolved }
}

/**
 * The offer for the header: one group, only when the host lists containers,
 * with the count in the label — the protocol puts counts in labels because a
 * host cannot count what it does not render. Appended to the scope group
 * `wire/scope.ts` already offers, and worded exactly as the sibling modules
 * word theirs, so that a person who learned the control on one pane knows it
 * on this one.
 */
export function aimOffer(
  containers: readonly Shown[],
): { id: string; label: string; options: { id: string; label: string }[]; fallback: string }[] {
  if (!containers.length) return []
  const picked = containers.filter((one) => one.selected).length
  const count = picked ? `${picked} of ${containers.length} picked out` : 'nothing picked out'
  return [
    {
      id: AIM,
      label: 'aim',
      options: [
        { id: 'follow', label: `follow what is picked out (${count})` },
        { id: 'all', label: 'everything on this kehikko' },
      ],
      fallback: 'follow',
    },
  ]
}

/**
 * The sentence for a pane the aim emptied, or null when the aim did not
 * empty it.
 *
 * Three absences, each named, because each has its own remedy: a picked-out
 * container that shows nothing (pick out one that does), a shown document no
 * question is about (write one, or set the aim to everything), and a question
 * whose anchor does not resolve (re-anchor it — `reword_quiz` with `path`).
 * `held` is how many questions the epic has at all; `unresolved` how many of
 * those cannot be in front of anything.
 */
export interface Emptied {
  /** What emptied the pane. */
  said: string
  /** The way out, which follows the cause: a tick to undo, a document to open, or an anchor to repair. */
  remedy: string
}

export function whyEmpty(front: InFront, held: number, unresolved: number): Emptied | null {
  if (front.everything || held === 0) return null
  const rotten =
    unresolved > 0
      ? ` ${unresolved === held ? (held === 1 ? 'It is' : 'All of them are') : `${unresolved} of them are`} anchored to `
        + `${unresolved === 1 ? 'a document that is' : 'documents that are'} not in this project, so ${unresolved === 1 ? 'it' : 'they'} `
        + 'cannot be in front of anything until re-anchored.'
      : ''
  const off = 'set this container’s aim to everything on this kehikko'
  const remedy =
    unresolved === held
      ? `An agent re-anchors them with reword_quiz. Until then, ${off} to see them.`
      : front.narrowed
        ? `Untick a container, pick out one that shows a document, or ${off}.`
        : `Open one of their documents on this kehikko, or ${off}.`
  if (front.narrowed) {
    const names = front.picked.map(nameOf)
    const one = names.length === 1
    if (front.quiet.length === front.picked.length) {
      return {
        said: `${list(names)} ${one ? 'is' : 'are'} picked out and ${one ? 'shows' : 'show'} no document, so there is nothing here for a question to be about.${rotten}`,
        remedy,
      }
    }
    const quiet = front.quiet.map(nameOf)
    const tail = quiet.length ? ` ${list(quiet)} ${quiet.length === 1 ? 'shows' : 'show'} no document.` : ''
    return {
      said: `${list(names)} ${one ? 'is' : 'are'} picked out; none of the ${count(held)} here is about what ${one ? 'it shows' : 'they show'}.${tail}${rotten}`,
      remedy,
    }
  }
  return { said: `Nothing on this kehikko is showing a document any of the ${count(held)} here is about.${rotten}`, remedy }
}

/**
 * What to say about the questions the aim is hiding from a list that still
 * has some, in the two rooms this module gets — see `hiddenNote` in
 * `wire/scope.ts`, whose shape this shares so the page can draw either.
 */
export function aimNote(front: InFront, hidden: number): { full: string; brief: string } | null {
  if (front.everything || hidden <= 0) return null
  const many = hidden === 1 ? '1 more question' : `${hidden} more questions`
  return {
    full: front.narrowed
      ? `${many} about documents ${list(front.picked.map(nameOf))} ${front.picked.length === 1 ? 'is' : 'are'} not showing`
      : `${many} about documents nothing here is showing`,
    brief: `+${hidden} elsewhere`,
  }
}

/** The last word of a module id, which is what the ids look like: `roadmap.journeys` is `journeys`. */
export function nameOf(module: string): string {
  const cut = module.lastIndexOf('.')
  return cut === -1 ? module : module.slice(cut + 1)
}

/**
 * The documents this container is showing, for `showing.set`: one place per
 * distinct path among the questions on screen, in the spelling the wire
 * uses, with no range and no quote. No range because a container listing
 * four questions about a chapter is showing the chapter and not four
 * paragraphs — and a consumer that keeps one place per path would otherwise
 * narrow to whichever paragraph came first. No quote for the reason the
 * protocol gives: a file being shown is not a highlight. And no question whose
 * anchor does not resolve: telling the canvas this container is showing a
 * file that is not there would be a claim every neighbour is entitled to
 * narrow to, made about nothing.
 */
export function showing<T extends Anchored & { anchor?: 'holds' | 'missing' | 'unchecked' }>(
  questions: readonly T[],
  projectPath: string | null,
  limit: number,
): Pointing[] {
  const seen = new Set<string>()
  const out: Pointing[] = []
  for (const question of questions) {
    if (question.anchor === 'missing') continue
    const mine = pointingAt(projectPath, question.passage)
    if (!mine || seen.has(mine.path)) continue
    seen.add(mine.path)
    out.push({ path: mine.path, page: null, from: null, to: null, quoted: '' })
    if (out.length >= limit) break
  }
  return out
}

function count(n: number): string {
  return n === 1 ? '1 question' : `${n} questions`
}

function onePerPath(documents: readonly Place[]): Place[] {
  const seen = new Set<string>()
  const out: Place[] = []
  for (const one of documents) {
    if (!one.path || seen.has(one.path)) continue
    seen.add(one.path)
    out.push(one)
  }
  return out
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  const all = [...names]
  const last = all.pop()
  return `${all.join(', ')} and ${last}`
}
