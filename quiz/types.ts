/**
 * The shapes the server and the page both name, and NOTHING ELSE.
 *
 * ## Why this file exists at all, when the store could have exported its own types
 *
 * Because `quiz/questions.ts` imports `node:fs`, and this page runs in a
 * browser. A `import type { Question } from '../../quiz/questions.ts'` is erased
 * at compile time and costs nothing — but the moment somebody drops the `type`
 * keyword, or imports one runtime value beside the types "just for the bounds",
 * Vite follows the edge, pulls `node:fs` into the browser bundle, and the module
 * fails to evaluate. The symptom is the worst one this protocol has: the
 * document loads, the frame's `load` fires, the host greets it, and nothing
 * answers. The container says the module did not answer the greeting, which is true
 * and gives no hint that a `node:` import is the reason. It is only visible in
 * the browser console, and only if somebody thinks to open one.
 *
 * A types-only file with no imports of any kind cannot do that. Importing it
 * wrongly is still free, because there is nothing here to import at runtime.
 *
 * The bounds therefore live in `quiz/questions.ts` beside the code that applies
 * them, and are re-stated in the MCP tool descriptions by interpolation rather
 * than duplicated. This file holds shapes.
 */

/**
 * Where a question came from — the whole of what makes this module's claim true.
 *
 * A question that merely says it is "about chapter three" is a vibe. This is the
 * fact: a document, a byte range inside it, and the exact source those bytes
 * held when the question was written.
 *
 * ## Why the range AND the quote, when either alone would locate it
 *
 * They fail differently, and that is the point.
 *
 * The range is cheap and precise and it goes wrong SILENTLY. Somebody edits a
 * paragraph three pages earlier, every offset after it shifts, and the range now
 * names a different piece of prose with no error anywhere — the question is
 * about something it was never about, and nothing in the store knows.
 *
 * The quote is expensive to search for and it goes wrong LOUDLY. When the source
 * no longer contains it, that is a fact anybody can check with a single grep,
 * and the honest answer — "the paper moved under this question" — is available
 * rather than merely true.
 *
 * So the range is how you find it and the quote is how you know you found the
 * right thing. Keeping one and dropping the other would be choosing between a
 * fast wrong answer and a slow one.
 */
export interface Passage {
  /** The document, as the project spells it. Relative to the project, not absolute. */
  path: string
  /** Byte offset of the first byte of the passage. */
  start: number
  /** Byte offset one past the last. Always greater than `start`. */
  end: number
  /** What those bytes said when the question was written. */
  quote: string
}

/**
 * One attempt at one question.
 *
 * Kept as a list rather than as a single "last answer" field, because the same
 * question can be asked again later and the interesting thing about a second
 * attempt is that there was a first. A question somebody got right on the third
 * try is a different fact from one they got right immediately, and a store that
 * overwrote would have made the two indistinguishable.
 */
export interface Attempt {
  /** Zero-based index into the question's options. */
  chose: number
  right: boolean
  at: string
}

/**
 * One question, as this app holds it on disk — **including the answer key**.
 *
 * This shape is the SERVER'S. It is deliberately not what the page is sent; see
 * `Asked` below, and the essay on `score` in `quiz/questions.ts` for the whole
 * argument. If you find yourself sending one of these to a browser, that is the
 * bug this module was written to not have.
 */
export interface Question {
  /**
   * Issued here, by this app, and never taken from a caller.
   *
   * It is the key an answer is filed under and the value of a `data-` attribute
   * on the page, so it has one shape and this program is the only thing that
   * chooses one. A caller-supplied id would be a caller-supplied key in the
   * store and a caller-supplied string in the markup, which are two of the bugs
   * this workspace's reviews have found repeatedly.
   */
  id: string
  /** The epic whose paper this question was written about. */
  epic: string
  /** What the reader is asked. */
  question: string
  /**
   * The options, in the order they are shown.
   *
   * A JSON array of strings, held inline. This is lifted verbatim from the
   * thesis workbench's `quizzes` table, whose schema carried the reasoning as a
   * comment: SQLite has no list type, and a second table for four short strings
   * would cost more to read than it saves. There is no SQLite here and the
   * argument survives the change of storage unchanged — a `options` table would
   * be a join, an order column and a second place for a partial write to leave
   * an inconsistency, in exchange for normalising four strings that are only
   * ever read together.
   */
  options: string[]
  /** Zero-based index into `options`. THE ANSWER KEY. Never sent to a page unearned. */
  answer: number
  /** Why, in the author's words. Revealed with the answer and under the same rule. */
  why: string
  passage: Passage
  /** Who wrote it, and whether it came through the MCP door. */
  by: string
  viaMcp: boolean
  at: string
  /** Every attempt, oldest first. */
  attempts: Attempt[]
}

/**
 * One question as the PAGE is allowed to know it.
 *
 * Note what is absent: `answer` and `why`. They are `null` on a question nobody
 * has answered yet, and they are filled in for one that has been — because once
 * you have chosen, the answer is yours, and a container that still hid it would be
 * useless as well as coy.
 *
 * The distinction is enforced by this being a separate type rather than a
 * `Partial<Question>` or an `Omit<>`: a field that is sometimes present is a
 * field somebody will one day fill in "for convenience", and TypeScript would
 * not complain. Here the only function that can produce an `Asked` is `asked()`
 * in `quiz/questions.ts`, and it takes the decision once.
 */
export interface Asked {
  id: string
  epic: string
  question: string
  options: string[]
  passage: Passage
  by: string
  viaMcp: boolean
  at: string
  attempts: Attempt[]
  /** The key, and only once it has been earned. `null` means "not yet, and not from here". */
  answer: number | null
  why: string | null
}

/** What one epic's questions add up to, for a container that has not opened them. */
export interface Standing {
  epic: string
  questions: number
  answered: number
  right: number
}

/*
 * `ProjectStanding` used to be here: a project's path and what was in it, for
 * the screen and the tool that listed every project one central store held
 * questions for.
 *
 * It has no subject any more. Questions live inside the project they are about,
 * at `.kehikot/learning/questions.json`, so this app never holds more than one project's
 * at a time and cannot enumerate the others — it is handed a path and forgets
 * it. A shape describing a list nothing can build is a shape somebody will one
 * day try to fill.
 */
