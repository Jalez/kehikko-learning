import { existsSync, readFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { normaliseQuote } from 'kehikot-module-protocol'
import { z } from 'zod'

import { dataFile, put } from '../store.ts'
import { emptyQuiz, serialiseQuiz, writable, type Quiz } from './format.ts'
import type { Attempt } from './types.ts'

/**
 * The one move out of `questions.json`, which is how this module kept its
 * questions before they were Markdown: one JSON file for the whole project,
 * every question carrying its epic, its key, a byte range and its attempts.
 *
 * It runs the first time that file is found — on a read as well as a write,
 * since the folder is already there — and it does exactly this:
 *
 * - for every epic in it, writes `<epic>.md` holding that epic's questions in
 *   their order, each with its old id, and one `Sources:` list at the bottom
 *   (two questions about the same words share a line). **An `<epic>.md` that
 *   already exists is left alone** and that epic's old questions are not
 *   merged into it;
 * - copies every attempt into `answers.json`, under the same epic and id;
 * - renames `questions.json` to `questions.migrated.json`, untouched, so
 *   nothing is destroyed and the move does not run twice.
 *
 * What does not come across, and stays readable in the renamed file: who wrote
 * each question and when, and the byte range — a source is found by its words
 * now, on every read. A quote's line breaks become spaces, which is how a
 * source line spells it.
 *
 * A `questions.json` that will not parse is not moved and not treated as
 * empty: the sentence comes back as trouble and nothing is written.
 */

const OLD = 'questions.json'
const MIGRATED = 'questions.migrated'

const oldSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        epic: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        answer: z.number().int().nonnegative(),
        why: z.string().default(''),
        passage: z.object({ path: z.string(), quote: z.string() }),
        attempts: z.array(z.object({ chose: z.number().int(), right: z.boolean(), at: z.string() })).default([]),
      }),
    )
    .default([]),
})

/** An attempt as kept: `of` names the options and key it was made against (see `stamp` in `questions.ts`). */
export type Stored = Attempt & { of?: string }

export type Answers = Record<string, Record<string, Stored[]>>

/** Move what is there; `all` gains the attempts. A sentence when it could not be done, else null. */
export function migrate(projectPath: string | null | undefined, all: Answers, answersFile: string): string | null {
  const old = dataFile(projectPath, OLD)
  if (old.path === null || !existsSync(old.path)) return old.trouble
  let questions: z.infer<typeof oldSchema>['questions']
  try {
    questions = oldSchema.parse(JSON.parse(readFileSync(old.path, 'utf8'))).questions
  } catch (e) {
    return (
      `${old.path} could not be read (${e instanceof Error ? (e.message.split('\n')[0] ?? '') : String(e)}), so it has `
      + 'not been moved into Markdown, no question is being shown and nothing will be written. Every question in that '
      + 'file and every answer anybody gave is recoverable: fix or move it.'
    )
  }

  const quizzes = new Map<string, Quiz>()
  const ids = new Set<string>()
  let attempts = false
  for (const question of questions) {
    if (!/^[a-z0-9-]+$/.test(question.epic)) continue
    const file = dataFile(projectPath, `${question.epic}.md`)
    if (file.trouble) return file.trouble
    if (file.path === null || (!quizzes.has(question.epic) && existsSync(file.path))) continue
    const quiz = quizzes.get(question.epic) ?? emptyQuiz()
    quizzes.set(question.epic, quiz)

    const quote = normaliseQuote(question.passage.quote)
    const same = quiz.sources.find((one) => one.path === question.passage.path && one.quote === quote)
    const label = same?.label ?? String(quiz.sources.length + 1)
    if (!same) quiz.sources.push({ label, path: question.passage.path, quote })
    const id = /^[A-Za-z0-9_-]{1,64}$/.test(question.id) && !ids.has(question.id) ? question.id : crypto.randomUUID().slice(0, 8)
    ids.add(id)
    quiz.questions.push({
      id,
      question: normaliseQuote(question.question),
      label,
      options: question.options.map(normaliseQuote),
      correct: question.answer < question.options.length ? [question.answer] : [],
      why: question.why.trim(),
    })
    if (question.attempts.length) {
      ;(all[question.epic] ??= {})[id] ??= question.attempts
      attempts = true
    }
  }

  for (const [epic, quiz] of quizzes) {
    /* An explanation with a line the file would read as structure is joined
       into one line rather than left to split the question in two. */
    if (!writable(quiz)) for (const question of quiz.questions) question.why = normaliseQuote(question.why)
    put(join(dirname(old.path), `${epic}.md`), serialiseQuiz(quiz))
  }
  if (attempts) put(answersFile, `${JSON.stringify(all, null, 1)}\n`)
  let to = join(dirname(old.path), `${MIGRATED}.json`)
  for (let n = 2; existsSync(to); n++) to = join(dirname(old.path), `${MIGRATED}-${n}.json`)
  renameSync(old.path, to)
  return null
}
