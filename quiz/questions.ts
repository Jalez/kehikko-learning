import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, relative, sep } from 'node:path'

import { findQuote, normaliseQuote, resolveSource, uncitable } from 'kehikot-module-protocol'
import { z } from 'zod'

import { citedText, dataFile, makeDir, put, rootOf } from '../store.ts'
import { history, kept, record } from './history.ts'
import { emptyQuiz, idOf, keyOf, parseQuiz, quizProblems, serialiseQuiz, writable, type Question, type Quiz } from './format.ts'
import { migrate, type Answers, type Stored } from './migrate.ts'
import { shownOrder, toFile, toShown } from './order.ts'
import type { Asked, Attempt, Cited, HistoryEntry, QuizFile, Standing } from './types.ts'

/**
 * One project's questions and answers, as two kinds of file in
 * `<project>/.kehikot/learning/`:
 *
 * - `<epic>.md` — that epic's questions, their options, which one is right,
 *   the explanations and the sources. Written by an agent through the MCP door
 *   or by a person in any editor; `format.ts` is the only reader and writer.
 * - `answers.json` — what a reader answered, by epic and question id. Kept out
 *   of the Markdown on purpose: an answer is a record of what a person did,
 *   not material to edit, and only `score` adds to it.
 *
 * Every string that reaches this store comes from outside the process, so each
 * is bounded, once, by the numbers below; the doors interpolate them into
 * their own sentences rather than restating them.
 */
export const MAX_EPIC = 80
export const MAX_QUESTION = 600
export const MAX_OPTION = 240
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 8
export const MAX_WHY = 1200
export const MAX_PATH = 480
export const MAX_QUOTE = 2000
export const MAX_ID = 64
/** Per epic. A file that grows without bound is a page that stops loading. */
export const MAX_QUESTIONS = 2000
/** How many attempts at one question are kept. The OLDEST go: the interesting one is the latest. */
export const MAX_ATTEMPTS = 12

/**
 * What an epic slug looks like — and so what a quiz file may be called. SHAPE,
 * not membership: no dot, slash or backslash, so no character in it can leave
 * the folder.
 */
export const SLUG = /^[a-z0-9-]+$/

const ANSWERS = 'answers.json'
/** Each epic's salt for the order its options are shown in: `{ "<epic>": "<hex>" }`. See `saltOf`. */
const ORDER = 'order.json'

const answersSchema = z.record(z.record(z.array(z.object({ chose: z.number().int(), right: z.boolean(), at: z.string(), of: z.string().optional() }))))

/** One epic's quiz, open. */
interface Held {
  quiz: Quiz
  /** The file as it is on disk, or null when there is none: what an undo puts back. */
  text: string | null
  /** Every epic's answers, so a write puts the others back untouched. */
  all: Answers
  /** The resolved project root: what every source path is relative to. */
  root: string
}

/**
 * Three states, and collapsing any two of them destroys something.
 *
 * `nowhere` is no project open: an ordinary state with a screen of its own,
 * and NOT an empty store, because a caller handed one would go on to write it.
 * `trouble` is a project that was named and could not be used, or a file that
 * will not parse — which is never treated as empty either: everything here was
 * written by somebody, and a program that read a broken file as "nothing here"
 * would write over the recoverable original on the next save.
 */
type Opened = { held: Held; trouble: null; nowhere: false } | { held: null; trouble: string | null; nowhere: boolean }

/** What every reader here answers with, beyond its own material. */
export interface Read {
  trouble: string | null
  nowhere: boolean
}

function open(projectPath: string | null | undefined, epic: string): Opened {
  const answers = dataFile(projectPath, ANSWERS)
  const root = rootOf(projectPath)
  if (answers.path === null || root === null) return { held: null, trouble: answers.trouble, nowhere: answers.trouble === null }
  const refused = (trouble: string): Opened => ({ held: null, trouble, nowhere: false })

  let all: Answers = {}
  if (existsSync(answers.path)) {
    try {
      all = answersSchema.parse(JSON.parse(readFileSync(answers.path, 'utf8')))
    } catch (e) {
      return refused(
        `${answers.path} could not be read (${e instanceof Error ? (e.message.split('\n')[0] ?? '') : String(e)}), so no `
        + 'question is being shown and nothing will be written over it. Every answer in that file is recoverable: fix '
        + 'or move it.',
      )
    }
  }
  const unmoved = migrate(projectPath, all, answers.path)
  if (unmoved) return refused(unmoved)

  /* A file that is not there is an empty quiz and not trouble: it is what an
     epic nobody has written a question about looks like. */
  let text: string | null = null
  if (SLUG.test(epic)) {
    const file = dataFile(projectPath, `${epic}.md`)
    if (file.trouble) return refused(file.trouble)
    if (file.path !== null && existsSync(file.path)) text = readFileSync(file.path, 'utf8')
  }
  return { held: { quiz: text === null ? emptyQuiz() : parseQuiz(text), text, all, root }, trouble: null, nowhere: false }
}

/**
 * Write one file, making the folder first. `makeDir` is called here and nowhere
 * on the read path, so opening a container against a repository leaves no
 * `.kehikot` in it until somebody writes something. A sentence when it could
 * not be done.
 */
function save(projectPath: string | null | undefined, name: string, text: string): string | null {
  const { dir, trouble } = makeDir(projectPath)
  if (trouble) return trouble
  const { path, trouble: after } = dir === null ? { path: null, trouble: null } : dataFile(projectPath, name)
  if (after) return after
  if (path === null) return NOWHERE
  put(path, text)
  return null
}

const saveAnswers = (projectPath: string | null | undefined, all: Answers) =>
  save(projectPath, ANSWERS, `${JSON.stringify(all, null, 1)}\n`)

/** Each question's source, looked for in its file. One read per file. */
function citer(held: Held): (question: Question) => Cited | null {
  const files = new Map<string, string | null>()
  return (question) => {
    const source = held.quiz.sources.find((one) => one.label === question.label)
    if (!source) return null
    if (!files.has(source.path)) files.set(source.path, citedText(held.root, source.path))
    return resolveSource(source, files.get(source.path) ?? null)
  }
}

/**
 * What an attempt was made against: the options, in order, and which one was
 * the key. Kept with each attempt (`of`), never sent to a page — four guesses
 * at the key would reproduce it.
 */
function stamp(question: Question): string {
  return idOf(JSON.stringify([question.options, question.correct]))
}

/**
 * The attempts that still say something about this question.
 *
 * A quiz file can be edited after it was answered. An answer is kept while the
 * question's OPTIONS AND KEY are what they were when it was given — rewording
 * the question, its explanation or its source keeps it — and stops counting
 * the moment either changes: "you chose 2 and were wrong" about options that
 * have since been reordered, or a key that has since moved, is a sentence about
 * a different question, and it would put a stale "correct" on screen. The
 * question is then simply unanswered again, key withheld again; the old
 * attempts stay in `answers.json`, and count once more if the edit is undone.
 *
 * Attempts from before this was recorded carry no `of`, and are kept while
 * they are at least consistent with the key as it is now.
 */
function counted(question: Question, stored: Stored[] = []): Attempt[] {
  const now = stamp(question)
  const key = keyOf(question)
  return stored
    .filter((one) => (one.of === undefined ? one.chose < question.options.length && one.right === (one.chose === key) : one.of === now))
    .map(({ chose, right, at }) => ({ chose, right, at }))
}

/* ------------------------------------------------------------------------ *
 * The one rule this module exists to enforce
 * ------------------------------------------------------------------------ */

/**
 * A question, as a page is allowed to know it.
 *
 * **The key lives in the Markdown file, on disk, and it crosses the wire
 * exactly once per question: in the reply to the request that submitted an
 * answer.** The answering page is never sent the file (the editor is, on a
 * person's press: see `readQuiz`). That is not the obvious build — a
 * quiz could be handed everything and simply not draw the key — and it is
 * worthless here, because an agent reading the page (which agents in this
 * workspace do, routinely) would hold the key to every question on screen and
 * would use it while being helpful.
 *
 * So this is a projection, not a filter: `answer` and `why` are `null` until
 * the question has an attempt against it, at which point the key is the
 * reader's and is shown. `score()` grades server-side, so the browser never
 * holds the material to grade with.
 *
 * **A `Question` never leaves this process. An `Asked` is what leaves. The
 * only function that makes one is here.**
 */
export function asked(question: Question, attempts: Attempt[], source: Cited | null): Asked {
  const answered = attempts.length > 0
  return {
    id: question.id,
    question: question.question,
    options: question.options,
    source,
    attempts,
    answer: answered ? keyOf(question) : null,
    why: answered ? question.why : null,
  }
}

/* ------------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------------ */

/** What the order falls back to when `order.json` cannot be written: stable for as long as this process lives. */
const PROCESS_SALT = randomBytes(16).toString('hex')

/**
 * The secret half of an epic's shown order, kept in `order.json` beside the
 * answers and never sent anywhere.
 *
 * Minted the first time the epic's questions are served to the page, so the
 * order is the same on every poll, after a reload and across a restart of this
 * server; `fresh` replaces it, which is what a retake does — the positions
 * somebody learned on the last pass are not the positions on the next.
 *
 * It is the one thing here written on a read, and only into a folder that
 * already holds the quiz file it is about. A file that is missing or unreadable
 * is minted again: nothing in it is anybody's work.
 */
function saltOf(projectPath: string | null | undefined, epic: string, fresh = false): string {
  const { path } = dataFile(projectPath, ORDER)
  let all: Record<string, string> = {}
  try {
    if (path !== null && existsSync(path)) all = z.record(z.string()).parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    all = {}
  }
  if (!fresh && all[epic]) return all[epic]
  const salt = randomBytes(16).toString('hex')
  return save(projectPath, ORDER, `${JSON.stringify({ ...all, [epic]: salt }, null, 1)}\n`) === null ? salt : PROCESS_SALT
}

/** One question with its options in the shown order, and every index in it moved to match. */
function shown(one: Asked, salt: string): Asked {
  const order = shownOrder(`${salt}\n${one.id}`, one.options)
  return {
    ...one,
    options: order.map((file) => one.options[file]!),
    attempts: one.attempts.map((attempt) => ({ ...attempt, chose: toShown(order, attempt.chose) })),
    answer: one.answer === null ? null : toShown(order, one.answer),
  }
}

/**
 * One epic's questions AS THE PAGE IS SENT THEM: `forEpic`, with each
 * question's options shuffled (`quiz/order.ts`). The page never sees file
 * order, nor anything it could be worked out from — the options are simply in
 * another order, and `attempts[].chose` and `answer` are positions in it.
 */
export function shownEpic(projectPath: string | null | undefined, epic: string): ReturnType<typeof forEpic> {
  const out = forEpic(projectPath, epic)
  if (!out.questions.length) return out
  const salt = saltOf(projectPath, epic)
  return { ...out, questions: out.questions.map((one) => shown(one, salt)) }
}

/**
 * One epic's questions, as a page is allowed to know them, in the order the
 * file has them. A question that cannot be asked — no option ticked, or two —
 * is left out, and `problems` says so, in sentences that name no option.
 */
export function forEpic(projectPath: string | null | undefined, epic: string): { questions: Asked[]; problems: string[] } & Read {
  const { held, trouble, nowhere } = open(projectPath, epic)
  if (!held) return { questions: [], problems: [], trouble, nowhere }
  const cite = citer(held)
  const answers = held.all[epic] ?? {}
  const questions = held.quiz.questions
    .filter((question) => keyOf(question) !== null)
    .map((question) => asked(question, counted(question, answers[question.id]), cite(question)))
  return { questions, problems: quizProblems(held.quiz), trouble, nowhere }
}

/** Where an epic's questions are, relative to the project root: what a person is told to open. */
export function fileOf(projectPath: string | null | undefined, epic: string): string {
  const { path } = dataFile(projectPath, `${epic}.md`)
  const root = rootOf(projectPath)
  return path && root ? relative(root, path).split(sep).join('/') : `${epic}.md`
}

/** The epics that have a quiz file in this project. */
function epics(projectPath: string | null | undefined): string[] {
  const { path } = dataFile(projectPath, ANSWERS)
  if (path === null || !existsSync(dirname(path))) return []
  return readdirSync(dirname(path))
    .filter((name) => name.endsWith('.md') && SLUG.test(name.slice(0, -3)))
    .map((name) => name.slice(0, -3))
    .sort()
}

/** What each epic in one project adds up to. The no-epic screen is drawn from this. */
export function standings(projectPath: string | null | undefined): { standings: Standing[] } & Read {
  /* Opened once with no epic first, so a project still holding the old
     `questions.json` is moved before its files are listed. */
  const { trouble, nowhere } = open(projectPath, '')
  if (trouble || nowhere) return { standings: [], trouble, nowhere }
  const rows: Standing[] = []
  for (const epic of epics(projectPath)) {
    const { questions } = forEpic(projectPath, epic)
    if (!questions.length) continue
    const last = questions.map((question) => question.attempts.at(-1))
    rows.push({ epic, questions: questions.length, answered: last.filter(Boolean).length, right: last.filter((one) => one?.right).length })
  }
  return { standings: rows, trouble, nowhere }
}

/** One question with everything about it, key included. */
export interface Keyed {
  question: Question
  /** Null for a question that cannot be asked. */
  key: number | null
  attempts: Attempt[]
  source: Cited | null
}

/**
 * One epic's questions WITH the key, for the one caller entitled to it.
 *
 * Not reachable from anything the page can call. `doors.ts` uses it for the
 * MCP `quizzes` tool, which prints the key only under `reveal: true` or once a
 * reader has answered. A separate function rather than a flag on `forEpic`, so
 * that `grep -n withKey doors.ts` is the whole audit.
 */
export function withKey(projectPath: string | null | undefined, epic: string): { questions: Keyed[]; problems: string[] } & Read {
  const { held, trouble, nowhere } = open(projectPath, epic)
  if (!held) return { questions: [], problems: [], trouble, nowhere }
  const cite = citer(held)
  const answers = held.all[epic] ?? {}
  const questions = held.quiz.questions.map((question) => ({
    question,
    key: keyOf(question),
    attempts: counted(question, answers[question.id]),
    source: cite(question),
  }))
  return { questions, problems: quizProblems(held.quiz), trouble, nowhere }
}

/** Which epics' files hold a question with this id. An id is unique in a file, not in a project. */
export function epicsOf(projectPath: string | null | undefined, id: string): string[] {
  return epics(projectPath).filter((epic) => open(projectPath, epic).held?.quiz.questions.some((one) => one.id === id))
}

/* ------------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------------ */

/**
 * What a caller may ask this store to do. One union and one function, so the
 * page and the MCP door are two callers of the same rules. The bounds are
 * applied at the doors, where a string arrives; the RULES are here.
 */
export type Op =
  | { op: 'add'; project: string | null; epic: string; question: string; options: string[]; answer: number; why: string; path: string; quote: string; agent?: string }
  | {
      op: 'reword'
      project: string | null
      epic: string
      id: string
      question?: string
      options?: string[]
      answer?: number
      why?: string
      /** A new source, in whole or in part: what is left out is kept. */
      path?: string
      quote?: string
      agent?: string
    }
  | { op: 'drop'; project: string | null; epic: string; id: string; agent?: string }
  | { op: 'retake'; project: string | null; epic: string }

export type Done = { ok: true; said: string; id: string } | { ok: false; error: string }

const no = (error: string): Done => ({ ok: false, error })

const NOWHERE =
  'no project is open, so there is nowhere to put this. Questions live inside the project they are about, in '
  + '.kehikot/learning/, so this app needs to be told which folder that is before it can write anything. '
  + 'Nothing was recorded.'

/** Why these options and this key are not a question, or null when they are. */
function unaskable(options: string[], answer: number): string | null {
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    return (
      `a question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options and this one has ${options.length}. `
      + 'One option is not a choice, and a reader who cannot be wrong has not been asked anything.'
    )
  }
  if (options.some((option) => !option)) return 'one of the options is empty. An option a reader cannot read is not one they can rule out.'
  /* Refused rather than deduplicated: dropping one would silently move the key. */
  if (new Set(options).size !== options.length) {
    return 'two of the options are the same. Whichever the reader picks, one of two identical strings would be marked wrong.'
  }
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
    return (
      `the answer must be the index of the correct option, counting from 0, so between 0 and ${options.length - 1} `
      + `for this question. It was ${JSON.stringify(answer)}.`
    )
  }
  return null
}

/** An absolute path under the project, spelled the way a source line spells it. Anything else as it came. */
function inProject(root: string, path: string): string {
  if (!isAbsolute(path)) return path
  const rel = relative(root, path)
  return !rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? path : rel.split(sep).join('/')
}

/**
 * The label of the source for these words in this file, added to the quiz's
 * `Sources:` when it is not there. Refused unless the words are in the file
 * exactly once — Slides' rule for `cite_slide` — so a source cannot be written
 * that already points nowhere.
 */
function cite(held: Held, given: string, quoted: string): { label: string } | { error: string } {
  const path = inProject(held.root, given)
  const quote = normaliseQuote(quoted)
  const why = uncitable({ path, quote })
  if (why) return { error: `${why} Nothing was written.` }
  const file = citedText(held.root, path)
  if (file === null) {
    return {
      error:
        `"${path}" is not a readable file inside this project. The path is taken relative to the project root, or `
        + 'absolute. If you read the file through another module\'s door, that door may have spelled it relative to '
        + 'something else, such as the paper\'s own folder: give the absolute path instead. Nothing was written.',
    }
  }
  const { count } = findQuote(file, quote)
  if (count === 0) {
    return { error: `those words are not in ${path}. Quote the file's own text (LaTeX markup included); only whitespace may differ. Nothing was written.` }
  }
  if (count > 1) return { error: `those words occur ${count} times in ${path}. Quote more of the sentence so they occur once. Nothing was written.` }
  const same = held.quiz.sources.find((one) => one.path === path && normaliseQuote(one.quote) === quote)
  if (same) return { label: same.label }
  const label = String(1 + Math.max(0, ...held.quiz.sources.map((one) => Number(one.label)).filter(Number.isFinite)))
  held.quiz.sources.push({ label, path, quote })
  return { label }
}

/** Take a source out of the list once no question names it. */
function uncite(quiz: Quiz, label: string | null): void {
  if (label === null || quiz.questions.some((one) => one.label === label)) return
  quiz.sources = quiz.sources.filter((one) => one.label !== label)
}

export function change(op: Op): Done {
  if (!SLUG.test(op.epic)) {
    return no(
      `"${op.epic.slice(0, MAX_EPIC)}" is not an epic slug. A slug is lower-case letters, digits and hyphens — it is `
      + 'what list_epics prints, not the title of the epic.',
    )
  }
  const { held, trouble, nowhere } = open(op.project, op.epic)
  /* Nothing is written while there is no project, and nothing is written while
     a file is unreadable. */
  if (nowhere) return no(NOWHERE)
  if (!held) return no(trouble ?? NOWHERE)
  const { quiz, all } = held

  if (op.op === 'retake') {
    const forgotten = Object.values(all[op.epic] ?? {}).filter((attempts) => attempts.length).length
    delete all[op.epic]
    const wrote = forgotten ? saveAnswers(op.project, all) : null
    if (wrote) return no(wrote)
    /* A new pass, a new order: where the right option sat last time says nothing about this time. */
    if (held.text !== null) saltOf(op.project, op.epic, true)
    return { ok: true, said: `${forgotten} answer${forgotten === 1 ? '' : 's'} forgotten for ${op.epic}`, id: op.epic }
  }

  const written = (said: string, id: string): Done => {
    if (!writable(quiz)) {
      return no(
        'that text has a line the quiz file would read as structure: one starting "## " or "- ", or one that is '
        + 'exactly "Why:", "Sources:" or "---". Reword it. Nothing was written.',
      )
    }
    const wrote = save(op.project, `${op.epic}.md`, serialiseQuiz(quiz))
    if (wrote) return no(wrote)
    /* Recorded with what the file held before, so the person can undo it. */
    record(op.project, op.epic, held.text, { agent: op.agent ?? 'an agent', summary: said })
    return { ok: true, said, id }
  }

  if (op.op === 'add') {
    if (quiz.questions.length >= MAX_QUESTIONS) {
      return no(`there are already ${MAX_QUESTIONS} questions about ${op.epic}, which is as many as this app holds. Drop some first.`)
    }
    if (!op.question) return no('a question needs the thing the reader is actually asked.')
    const bad = unaskable(op.options, op.answer)
    if (bad) return no(bad)
    const source = cite(held, op.path, op.quote)
    if ('error' in source) return no(source.error)
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
    /* On the end, which is where a new thing belongs. */
    quiz.questions.push({ id, question: op.question, label: source.label, options: op.options, correct: [op.answer], why: op.why })
    return written(`Question ${id} written about ${op.epic}`, id)
  }

  const question = quiz.questions.find((one) => one.id === op.id)
  if (!question) {
    return no(
      `there is no question "${op.id}" about ${op.epic} in this project. Questions are addressed by the id the `
      + 'quizzes tool prints beside each one.',
    )
  }

  if (op.op === 'drop') {
    quiz.questions = quiz.questions.filter((one) => one !== question)
    uncite(quiz, question.label)
    /* Its answers are left in `answers.json`, under an id nothing has: they
       count for nothing while the question is gone and are there again if the
       drop is undone. */
    const answers = counted(question, all[op.epic]?.[op.id]).length
    return written(`Question ${op.id} (“${question.question.slice(0, 60)}”) dropped, with ${answers} answer(s) to it`, op.id)
  }

  /* reword. The id and the answers survive: this is for sharpening a question,
     and one changed so much that the old answers mean nothing is a different
     question, which is what `add` is for. */
  const options = op.options ?? question.options
  const bad = unaskable(options, op.answer ?? (question.correct.length === 1 ? question.correct[0]! : Number.NaN))
  if (bad) return no(bad)
  if (op.question !== undefined && !op.question) return no('a question cannot be reworded to nothing.')
  let moved = ''
  if (op.path !== undefined || op.quote !== undefined) {
    const old = quiz.sources.find((one) => one.label === question.label)
    const source = cite(held, op.path ?? old?.path ?? '', op.quote ?? old?.quote ?? '')
    if ('error' in source) return no(source.error)
    const was = question.label
    question.label = source.label
    uncite(quiz, was)
    moved = ` and now cites ${quiz.sources.find((one) => one.label === source.label)?.path}`
  }
  question.question = op.question ?? question.question
  question.options = options
  question.correct = [op.answer ?? question.correct[0]!]
  question.why = op.why ?? question.why
  return written(`Question ${op.id} reworded${moved}`, op.id)
}

/* ------------------------------------------------------------------------ *
 * Answering
 * ------------------------------------------------------------------------ */

/** What the reader is told back, and the only place the key ever leaves. */
export interface Scored {
  right: boolean
  /** The key. Sent because they have now earned it, and never before. */
  answer: number
  why: string
  attempt: Attempt
  /** The question as the page may now know it — with the key filled in. */
  asked: Asked
}

/**
 * Grade one answer, here, where the key is, and file it in `answers.json`.
 * The Markdown is not touched.
 *
 * An index outside the options is refused rather than scored as wrong:
 * "wrong" is a thing a reader did and `chose: 47` is a thing a program did.
 */
export function score(
  projectPath: string | null | undefined,
  epic: string,
  id: string,
  chose: number,
): { scored: Scored } | { error: string } {
  const { held, trouble, nowhere } = open(projectPath, epic)
  if (nowhere) return { error: NOWHERE }
  if (!held) return { error: trouble ?? NOWHERE }
  const question = held.quiz.questions.find((one) => one.id === id)
  const key = question ? keyOf(question) : null
  if (!question || key === null) {
    return { error: `there is no question "${id.slice(0, MAX_ID)}" to answer about ${epic.slice(0, MAX_EPIC)} in this project.` }
  }
  if (!Number.isInteger(chose) || chose < 0 || chose >= question.options.length) {
    return {
      error:
        `that is not one of the options. This question has ${question.options.length}, numbered from 0, and the `
        + `answer given was ${JSON.stringify(chose)}. Nothing was recorded.`,
    }
  }
  const attempt: Attempt = { chose, right: chose === key, at: new Date().toISOString() }
  const mine = (held.all[epic] ??= {})
  mine[id] = [...(mine[id] ?? []), { ...attempt, of: stamp(question) }].slice(-MAX_ATTEMPTS)
  const attempts = counted(question, mine[id])
  const wrote = saveAnswers(projectPath, held.all)
  if (wrote) return { error: wrote }
  return { scored: { right: attempt.right, answer: key, why: question.why, attempt, asked: asked(question, attempts, citer(held)(question)) } }
}

/**
 * `score`, for an answer that came from the page — where `chose` is a position
 * in the SHOWN order. It is turned into the file's index here, graded and
 * filed in file order, and the reply is turned back, so the key and the choice
 * point at the options the reader is looking at.
 */
export function scoreShown(projectPath: string | null | undefined, epic: string, id: string, chose: number): ReturnType<typeof score> {
  const question = open(projectPath, epic).held?.quiz.questions.find((one) => one.id === id)
  /* Nothing to translate against: `score` says why, in its own words. */
  if (!question || keyOf(question) === null) return score(projectPath, epic, id, chose)
  const salt = saltOf(projectPath, epic)
  const order = shownOrder(`${salt}\n${id}`, question.options)
  /* A position that is not one is passed on as it came, and refused there. */
  const out = score(projectPath, epic, id, toFile(order, chose) ?? chose)
  if ('error' in out) return out
  const asked = shown(out.scored.asked, salt)
  return { scored: { ...out.scored, answer: asked.answer ?? -1, attempt: asked.attempts.at(-1) ?? out.scored.attempt, asked } }
}

/* ------------------------------------------------------------------------ *
 * The file itself, for the editor
 * ------------------------------------------------------------------------ */

/** The largest quiz file this module keeps, in characters. */
export const MAX_QUIZ_CHARS = 500_000

/** A refusal. `status` is the HTTP status; a conflict carries what is there now. */
export interface Refused {
  error: string
  status?: number
  /** On a conflict: the file as it is now. */
  theirs?: QuizFile
}

/** The opaque version of a file's text: what the editor sends back as `base`. */
export function versionOf(text: string): string
export function versionOf(text: string | null): string | null
export function versionOf(text: string | null): string | null {
  return text === null ? null : createHash('sha1').update(text).digest('hex').slice(0, 16)
}

function fileOfHeld(held: Held): QuizFile {
  const files = new Map<string, string | null>()
  const sources = held.quiz.sources.map((source) => {
    if (!files.has(source.path)) files.set(source.path, citedText(held.root, source.path))
    return resolveSource(source, files.get(source.path) ?? null)
  })
  return { text: held.text ?? '', version: versionOf(held.text), sources }
}

function opened(projectPath: string | null | undefined, epic: string): { held: Held } | Refused {
  if (!SLUG.test(epic)) return { error: `"${epic.slice(0, MAX_EPIC)}" is not an epic slug, so there is no file of that name.` }
  const { held, trouble } = open(projectPath, epic)
  return held ? { held } : { error: trouble ?? NOWHERE }
}

/**
 * One epic's quiz file, WHOLE — **the answer key included**.
 *
 * This is the one way the key reaches a page without being earned, and it
 * exists for the editor: a person who presses Edit is the author, and an
 * author sees what they wrote. `doors.ts` serves it only behind the page's
 * ticket and the page asks only on that press; `grep -n readQuiz doors.ts` is
 * the audit. An epic with no file yet is an empty text with no version.
 */
export function readQuiz(projectPath: string | null | undefined, epic: string): { file: QuizFile } | Refused {
  const out = opened(projectPath, epic)
  return 'held' in out ? { file: fileOfHeld(out.held) } : out
}

/**
 * Replace an epic's quiz file with what a person typed, exactly as typed: a
 * file with something wrong in it is saved and the problems are said, never
 * repaired or refused.
 *
 * Refused as a conflict — carrying what is there now — unless the file is
 * still at `base`, the version the editor last saw. So an agent's write, or an
 * edit in another editor, is never silently written over: the person is shown
 * both and chooses. `session` names the sitting at the editor, which the undo
 * trail records once (see `history.ts`).
 */
export function writeQuiz(
  projectPath: string | null | undefined,
  epic: string,
  text: string,
  base: string | null,
  session: string,
): { file: QuizFile } | Refused {
  const out = opened(projectPath, epic)
  if (!('held' in out)) return out
  const { held } = out
  if (text.length > MAX_QUIZ_CHARS) return { status: 413, error: `That is longer than ${MAX_QUIZ_CHARS} characters, which is more than this module keeps.` }
  if (base !== versionOf(held.text)) {
    return {
      status: 409,
      error: `The questions about ${epic} changed on disk since the editor read them. Nothing was written.`,
      theirs: fileOfHeld(held),
    }
  }
  const next = text.replace(/\r\n/g, '\n')
  if (next !== (held.text ?? '')) {
    const wrote = save(projectPath, `${epic}.md`, next)
    if (wrote) return { error: wrote }
    record(projectPath, epic, held.text, { agent: 'person', summary: 'edited in the page', session })
  }
  return readQuiz(projectPath, epic)
}

/** An epic's undo trail, newest first. */
export function quizHistory(projectPath: string | null | undefined, epic: string): { entries: HistoryEntry[] } | Refused {
  const out = opened(projectPath, epic)
  return 'held' in out ? { entries: history(projectPath, epic) } : out
}

/**
 * Put an epic's file back to how it was before entry `id`. The undo is itself
 * an entry (by `person`), so it can be undone in turn. Undoing the write that
 * created the file removes it.
 */
export function undoQuiz(projectPath: string | null | undefined, epic: string, id: string): { file: QuizFile } | Refused {
  const out = opened(projectPath, epic)
  if (!('held' in out)) return out
  const entry = kept(projectPath, epic, id)
  if (!entry) return { status: 404, error: `There is no entry "${id.slice(0, 40)}" in the history of ${epic}.` }
  if (entry.before === null) {
    const { path } = dataFile(projectPath, `${epic}.md`)
    if (path !== null && existsSync(path)) rmSync(path)
  } else {
    const wrote = save(projectPath, `${epic}.md`, entry.before)
    if (wrote) return { error: wrote }
  }
  record(projectPath, epic, out.held.text, { agent: 'person', summary: `undo: ${entry.summary}` })
  return readQuiz(projectPath, epic)
}
