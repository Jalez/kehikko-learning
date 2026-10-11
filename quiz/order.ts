import { createHash } from 'node:crypto'

/**
 * The order a question's options are SHOWN in, which is not the order the file
 * has them in.
 *
 * An author writes the right option first more often than not — one real quiz
 * had it first in all thirty-seven questions — so file order on the page is the
 * key in plain sight. The page is therefore sent the options shuffled, and
 * speaks only in shown positions; the file, `answers.json`, the editor and the
 * MCP door keep file order. The two are translated in `quiz/questions.ts`
 * (`shownEpic`, `scoreShown`) and nowhere else.
 *
 * Pure: the same seed and the same options give the same order, so nothing is
 * remembered per reader. The seed holds a salt the page is never sent (see
 * `saltOf`), so the page cannot work the order back out.
 */

/**
 * Options that are about the OTHER options — "All of the above", "None of
 * these", "Kaikki edellä mainitut" — and so only make sense underneath them.
 * They keep their place at the end, in the order the file has them.
 *
 * Deliberately narrow — the quantifier and then, at once, "the above" or its
 * like, so "All three modules were above neutral" moves like any other. An
 * option naming others by letter or number ("Both A and B") is not caught,
 * because no order would make it right once the rest have moved. Authors are
 * told not to write those.
 */
const LAST = [
  /^(all|none|both|neither|any|either|each|some|one|two|three|more than one)\s+(of\s+)?(the\s+)?(above|these|them|others?|((other|preceding|previous|listed)\s+)?(options|answers|choices|alternatives))\b/,
  /^(kaikki|ei mikään|eivät mitkään|molemmat|ei kumpikaan|kumpikin|jokin|mikä tahansa|useampi kuin yksi)\s+(edellä|yllä|näistä|edellis|vaihtoehdo|muista|muut)/,
  /^(all|none|both|neither|kaikki|molemmat|kumpikin|ei mikään|ei kumpikaan)$/,
]

export function staysLast(option: string): boolean {
  const said = option.trim().toLowerCase().replace(/[.!\s]+$/, '')
  return LAST.some((shape) => shape.test(said))
}

/** A whole number from the seed, one per draw. */
const draw = (seed: string, at: number) => createHash('sha256').update(`${seed}\n${at}`).digest().readUInt32BE(0)

/**
 * The shown order, as file indexes: `order[shown] === file`. A Fisher–Yates
 * shuffle of the options that may move, then the ones that stay last.
 */
export function shownOrder(seed: string, options: readonly string[]): number[] {
  const loose: number[] = []
  const last: number[] = []
  options.forEach((option, index) => (staysLast(option) ? last : loose).push(index))
  for (let at = loose.length - 1; at > 0; at -= 1) {
    const other = draw(seed, at) % (at + 1)
    ;[loose[at], loose[other]] = [loose[other]!, loose[at]!]
  }
  return [...loose, ...last]
}

/** The file index of the option shown at this position, or undefined when there is no such position. */
export const toFile = (order: readonly number[], shown: number): number | undefined => order[shown]

/** The position this file index is shown at, or -1 when it is not an option. */
export const toShown = (order: readonly number[], file: number): number => order.indexOf(file)

/**
 * The name of one dealing of an epic's options, which the page is sent with
 * the questions and sends back with an answer.
 *
 * A position only means something in the order it was shown in, and "Ask these
 * again" deals a new one. A page that has not yet read it — another tab, in the
 * seconds before its next poll — would post a position from the old order and
 * have it read in the new, which is somebody recorded as choosing an option
 * they never pressed. So the answer says which dealing its position is in, and
 * one that names any but the current is refused (`scoreShown`).
 *
 * It says WHICH and nothing about WHAT. It is one value for the whole epic, the
 * same for every question and whatever the file holds, so there is no position
 * in it; and it is a one-way hash of the salt under a prefix no draw uses
 * (`draw` hashes the salt FIRST, and a salt is hex), so neither the salt nor
 * any draw made from it can be worked back out. Derived rather than stored, so
 * it cannot fall out of step with the salt it names.
 */
export function orderTag(salt: string): string {
  return createHash('sha256').update(`the name of a dealing\n${salt}`).digest('hex').slice(0, 16)
}
