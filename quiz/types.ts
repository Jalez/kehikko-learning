/**
 * The shapes the server and the page both name, and NOTHING ELSE.
 *
 * This file imports one thing, a TYPE from the protocol package, and nothing
 * of this module's — deliberately. `quiz/questions.ts` imports `node:fs`, and
 * this page runs in a browser: the moment somebody drops the `type` from an
 * import of it, Vite pulls `node:fs` into the browser bundle, the module fails
 * to evaluate, and the only symptom is a container that never answers the
 * host's greeting. A types-only file that reaches nothing here cannot do that,
 * and `test/manifest.test.ts` asserts the rule over every file in `src/`.
 */

import type { CitationView } from 'kehikot-module-protocol'

/**
 * The passage a question rests on, as it was found on this read: the
 * protocol's `CitationView`, the one a slide's citation is too.
 *
 * The file holds the path and the quoted words; the range is looked for again
 * every time, never stored, so an edit above the passage moves the range with
 * it and an edit TO the passage says `adrift` instead of pointing at whatever
 * moved into its bytes.
 */
export type Cited = CitationView

/**
 * One attempt at one question. A list rather than a single "last answer",
 * because a question got right on the third try is a different fact from one
 * got right immediately.
 */
export interface Attempt {
  /** Zero-based index into the question's options. */
  chose: number
  right: boolean
  at: string
}

/**
 * One question as the PAGE is allowed to know it.
 *
 * `answer` and `why` are `null` on a question nobody has answered yet, and
 * filled in for one that has been. The only function that makes one of these
 * is `asked()` in `quiz/questions.ts`, and it takes the decision once.
 */
export interface Asked {
  /** The name answers are filed under: the question's `<!-- id: … -->`. */
  id: string
  question: string
  /** The options, in the order they are shown. */
  options: string[]
  /** Null for a question that names no source, or one that has no line under `Sources:`. */
  source: Cited | null
  /** Every attempt, oldest first. */
  attempts: Attempt[]
  /** The key, and only once it has been earned. `null` means "not yet, and not from here". */
  answer: number | null
  why: string | null
}

/** One write to an epic's quiz file, as the editor's history lists it. The previous text stays on disk. */
export interface HistoryEntry {
  id: string
  epic: string
  /** ISO time. */
  at: string
  /** Who wrote: an agent's name, or `person` for an edit or an undo made in the page. */
  agent: string
  summary: string
}

/**
 * An epic's quiz file, WHOLE — key, explanations and all. It is sent only to
 * the editor, only after a person pressed Edit, through a route behind the
 * page's ticket (`/api/quiz` in `doors.ts`). Nothing else the page is sent has
 * an answer in it.
 */
export interface QuizFile {
  text: string
  /** Opaque: sent back as `base` when saving. Null when there is no file yet. */
  version: string | null
  /** Every line under `Sources:`, looked for in its file. */
  sources: Cited[]
}

/**
 * One quiz file changed on disk: which epic, and the version it is at now
 * (null: the file is gone). Deliberately not a word of the file — it is what
 * the editor's watch is sent, and the editor asks for the text itself.
 */
export interface QuizChange {
  epic: string
  version: string | null
}

/** What one epic's questions add up to, for a container that has not opened them. */
export interface Standing {
  epic: string
  questions: number
  answered: number
  right: number
}
