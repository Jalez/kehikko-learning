import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { z } from 'zod'

import { dataFile, makeDir, rootOf } from '../store.ts'
import type { Asked, Attempt, Question, Standing } from './types.ts'
import { anchorOf, resolved, stored } from './where.ts'

/* ------------------------------------------------------------------------ *
 * Bounds
 * ------------------------------------------------------------------------ *
 *
 * Every string that reaches this store comes from outside the process — from a
 * form in a browser, or from an agent over MCP — and every one of them is later
 * written into a page. So each is bounded here, once, and the two doors
 * interpolate these numbers into their own error sentences rather than
 * restating them: a rule that has to be remembered twice is a rule that will be
 * forgotten at one of them.
 *
 * The numbers are chosen to be far longer than anything a real question needs
 * and far shorter than anything worth carrying around. A question nobody can
 * read on one screen is not a question, and a store that will accept two hundred
 * thousand characters is a store somebody will eventually put two hundred
 * thousand characters in.
 */
export const MAX_EPIC = 80
export const MAX_QUESTION = 600
export const MAX_OPTION = 240
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 8
export const MAX_WHY = 1200
export const MAX_PATH = 480
export const MAX_QUOTE = 2000
export const MAX_BY = 80
export const MAX_ID = 64
/** Per project. A store that grows without bound is a page that stops loading. */
export const MAX_QUESTIONS = 2000
/**
 * How many attempts at one question are kept.
 *
 * Enough to see whether somebody is getting better and few enough that a
 * question answered by a script in a loop cannot grow the file. The OLDEST go,
 * unlike the kept-state map elsewhere in this workspace, because the interesting
 * attempt is the most recent one and the first one — and when only one can be
 * kept it is the most recent, which is what the container shows.
 */
export const MAX_ATTEMPTS = 12

/**
 * What an epic slug is allowed to look like.
 *
 * The same class the host holds a slug to, restated here rather than imported,
 * because this program is meant to be taken away whole and an import into
 * somebody else's repository would not survive being copied out.
 *
 * SHAPE, not membership. There is no character in this class that can leave a
 * directory: no dot, so no `..`; no slash and no backslash, so no path at all.
 * The check does not depend on what is on disk when it runs, so it cannot be
 * weakened by a file appearing under it.
 */
const SLUG = /^[a-z0-9-]+$/

/* ------------------------------------------------------------------------ *
 * The file
 * ------------------------------------------------------------------------ */

const passageSchema = z.object({
  path: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  quote: z.string(),
})

const attemptSchema = z.object({
  chose: z.number().int(),
  right: z.boolean(),
  at: z.string(),
})

const questionSchema = z.object({
  id: z.string(),
  epic: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  answer: z.number().int().nonnegative(),
  why: z.string().default(''),
  passage: passageSchema,
  by: z.string().default('somebody who did not say'),
  viaMcp: z.boolean().default(false),
  at: z.string(),
  attempts: z.array(attemptSchema).default([]),
})

/**
 * The whole store — one project's — holding an ARRAY.
 *
 * ## Where the project went
 *
 * There used to be a `projects` record above this, keyed by path, and the
 * nesting WAS the partition: a question could not be in two projects because it
 * was not a row with a project column, it was a value under a project key.
 *
 * The partition is still real and is now the path itself. This file lives at
 * `<projectPath>/.kehikot/learning/questions.json`, so the store a reader opened is
 * already that project's and there is nothing left for an outer key to say. That
 * is the same argument taken one step further rather than abandoned — a check
 * can be forgotten at a new call site, a shape cannot, and a file in a different
 * folder cannot even be reached from the wrong place. See `store.ts`.
 *
 * ## Why the questions inside are an array and not a record keyed by id
 *
 * A record was the first shape and it was wrong twice over, and the second way
 * is the interesting one.
 *
 * The obvious reason is ordering. Questions come back in the order they were
 * written, because an agent that read a chapter top to bottom has already put
 * them in the reader's order and re-sorting throws that away. With a record, the
 * order had to be reconstructed from the `at` timestamps — and three questions
 * written by one agent in one loop land in the same millisecond, at which point
 * the tiebreak was the id, which is random. The container showed them shuffled, and
 * only sometimes, which is the worst kind of wrong.
 *
 * The sharper reason is that JavaScript would eventually have reordered them
 * anyway. An object's integer-like string keys are enumerated first, in numeric
 * order, before every other key — and an id here is eight hex characters, so
 * roughly one in ten million is all digits. `"12345678"` is an integer-like key.
 * That question would have silently jumped to the front of its project, on one
 * machine, once, and nothing about the symptom would have pointed at the id.
 *
 * So the order is the array's order, the way `list/checklists.ts` in Checklist
 * argues item order should be: not an `order` column, which is two sources for
 * one fact and lets a partial write leave two questions claiming position three.
 * `test/questions.test.ts` asserts it against the file on disk.
 */
const storeSchema = z.object({
  questions: z.array(questionSchema).default([]),
})

type Store = z.infer<typeof storeSchema>

/** Where one project's questions are, or a sentence, or nowhere. See `store.ts`. */
export function questionsFile(projectPath: string | null | undefined): { path: string | null; trouble: string | null } {
  return dataFile(projectPath)
}

const empty = (): Store => storeSchema.parse({})

/**
 * The store for one project — or a sentence about why there is not one, or the
 * plain fact that there is no project.
 *
 * ## Three states, and why collapsing any two of them destroys something
 *
 * `nowhere` means no project is open: the host had no folder to point at, or
 * nothing is framing this page. It is an ORDINARY state with a screen of its
 * own. It is not an error and it is not an empty store — and that last
 * distinction is the load-bearing one, because a caller handed an empty store
 * for "nowhere" would go on to WRITE it, and a write with no project is a write
 * with nowhere to go or, worse, somewhere guessed.
 *
 * `trouble` is a project that was named and could not be used: it does not
 * exist, it is not a folder, its `.kehikot` resolves outside it, or the file
 * inside will not parse. A file that will not parse is NOT treated as an empty
 * store, and that is the single most important line in this file. Everything
 * here is authored — a person or an agent wrote every question and a person gave
 * every answer — so "there is nothing here" and "this could not be read" must
 * never look the same on screen, and a program that returned empty for a broken
 * file would then WRITE over it on the next `add_quiz` and destroy the
 * recoverable original.
 *
 * So a bad file yields an empty store AND a trouble sentence, and every write
 * path refuses while trouble is set. The file stays exactly as it is, and the
 * sentence says so, because a person who can see the words "recoverable: fix or
 * move it" is a person who does not delete the directory.
 */
function read(projectPath: string | null | undefined): {
  store: Store
  trouble: string | null
  nowhere: boolean
  /** The resolved project root, for saying where each question's document is. Null with `nowhere` or trouble. */
  root: string | null
} {
  const { path, trouble } = dataFile(projectPath)
  if (trouble) return { store: empty(), trouble, nowhere: false, root: null }
  if (path === null) return { store: empty(), trouble: null, nowhere: true, root: null }
  const root = rootOf(projectPath)
  /* An absent file in a real project is an empty store and not trouble: it is
     what a project nobody has written a question about looks like, and it is the
     ordinary first run. */
  if (!existsSync(path)) return { store: empty(), trouble: null, nowhere: false, root }
  try {
    return { store: storeSchema.parse(JSON.parse(readFileSync(path, 'utf8'))), trouble: null, nowhere: false, root }
  } catch (e) {
    return {
      store: empty(),
      nowhere: false,
      root,
      trouble:
        `${path} could not be read (${e instanceof Error ? (e.message.split('\n')[0] ?? '') : String(e)}), so no `
        + 'question is being shown and nothing will be written over it. Every question in that file and every answer '
        + 'anybody gave is recoverable: fix or move it.',
    }
  }
}

/**
 * Write one project's questions, making the folder first.
 *
 * `makeDir` is called here and nowhere on the read path, so that opening a container
 * against a repository leaves no `.kehikot` in it until somebody actually writes
 * something. It is also where the project's `.gitignore` learns about the folder
 * — once, on the run that created it.
 *
 * Returns a sentence rather than throwing when the folder cannot be made or does
 * not stay inside the project, because every caller of this already has a place
 * to put a refusal and none of them has a place to put an exception.
 */
function save(projectPath: string | null | undefined, store: Store): string | null {
  const { dir, trouble } = makeDir(projectPath)
  if (trouble) return trouble
  if (dir === null) {
    return 'no project is open, so there is nowhere to write. Nothing was recorded.'
  }
  const { path, trouble: after } = dataFile(projectPath)
  if (after) return after
  if (path === null) return 'no project is open, so there is nowhere to write. Nothing was recorded.'
  writeFileSync(path, `${JSON.stringify(storeSchema.parse(store), null, 2)}\n`)
  return null
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

function now(): string {
  return new Date().toISOString()
}

/* ------------------------------------------------------------------------ *
 * The one rule this module exists to enforce
 * ------------------------------------------------------------------------ */

/**
 * A question, as a page is allowed to know it.
 *
 * ## Where the answer lives, and when it crosses the wire
 *
 * **It lives here, on disk, in this process, and it crosses the wire exactly
 * once per question: in the reply to the request that submitted an answer.**
 *
 * That is the module's one genuine design constraint and it is worth spelling
 * out what the obvious alternative would have been. A quiz container could perfectly
 * well be handed the whole question — options, key and all — and simply not draw
 * the key until you press something. Every browser quiz on the internet works
 * that way. It is also worthless, for two reasons and the second is the one that
 * matters here:
 *
 *  1. Anybody can open the inspector. `document.querySelector` or a glance at
 *     the network tab and the key is there. This is the reason people usually
 *     cite and it is the weaker one, because a person cheating at their own
 *     self-check has only cheated themselves.
 *  2. **An agent reading this page would see it.** That is not a person choosing
 *     to cheat; it is the ordinary operation of the thing that wrote the
 *     question and is now standing next to the reader. An agent that reads the
 *     DOM of a canvas — which agents in this workspace do, with a headless
 *     browser, routinely — would have the answer key to every question on
 *     screen, and would use it while helping. The reader would then be told the
 *     right answer by a helpful assistant and would learn nothing, and neither
 *     of them would have done anything wrong.
 *
 * So `asked()` is a projection, not a filter. `answer` and `why` are `null`
 * until this question has an attempt against it, at which point they are filled
 * in — because once you have chosen, the key is yours, and a container that still hid
 * it would be coy rather than careful.
 *
 * `score()` below does the grading, server-side, and returns the key with the
 * verdict. The browser never holds the material to grade with, so there is no
 * arrangement of DOM inspection, breakpoints or network replay that gets it out
 * early: the bytes are not there.
 *
 * The three-line version, for whoever changes this next: **a `Question` never
 * leaves this process. An `Asked` is what leaves. The only function that makes
 * one is here.**
 */
export function asked(question: Question, root: string | null): Asked {
  const answered = question.attempts.length > 0
  return {
    id: question.id,
    epic: question.epic,
    question: question.question,
    options: question.options,
    passage: question.passage,
    /* Decided here, on every read, and never stored: the disk is the thing
       that moved last time, and a verdict written into the file would have
       gone on saying `holds` about a document that was no longer there. */
    anchor: anchorOf(root, question.passage.path),
    by: question.by,
    viaMcp: question.viaMcp,
    at: question.at,
    attempts: question.attempts,
    answer: answered ? question.answer : null,
    why: answered ? question.why : null,
  }
}

/* ------------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------------ */

/**
 * What every reader here answers with, beyond its own material.
 *
 * `nowhere` is carried out to the callers rather than folded into `trouble`
 * because the two get different screens and different sentences: one says "open
 * a project", the other says what went wrong with the project that was named.
 */
export interface Read {
  trouble: string | null
  nowhere: boolean
}

/** What each epic in one project adds up to. The no-epic screen is drawn from this. */
export function standings(projectPath: string | null | undefined): { standings: Standing[] } & Read {
  const { store, trouble, nowhere } = read(projectPath)
  if (trouble || nowhere) return { standings: [], trouble, nowhere }
  const by = new Map<string, Standing>()
  for (const question of store.questions) {
    const row = by.get(question.epic) ?? { epic: question.epic, questions: 0, answered: 0, right: 0 }
    row.questions += 1
    const last = question.attempts.at(-1)
    if (last) {
      row.answered += 1
      if (last.right) row.right += 1
    }
    by.set(question.epic, row)
  }
  return { standings: [...by.values()].sort((a, b) => a.epic.localeCompare(b.epic)), trouble, nowhere }
}

/**
 * One epic's questions in one project, as a page is allowed to know them.
 *
 * Oldest first, which is the order they were written in — an agent that read a
 * chapter top to bottom and wrote questions as it went has already put them in
 * the reader's order, and re-sorting by anything else would throw that away.
 */
export function forEpic(projectPath: string | null | undefined, epic: string): { questions: Asked[] } & Read {
  const { store, trouble, nowhere, root } = read(projectPath)
  if (trouble || nowhere) return { questions: [], trouble, nowhere }
  /* No sort. The array's order is the order they were written in. */
  const questions = store.questions.filter((question) => question.epic === epic).map((question) => asked(question, root))
  return { questions, trouble, nowhere }
}

/**
 * The same, WITH the key, for the one caller entitled to it.
 *
 * Not exported to anything the page can reach. `doors.ts` uses it for the MCP
 * `quizzes` tool under an explicit `reveal: true`, and for nothing else. It is a
 * separate function rather than a flag on `forEpic` so that the call sites are
 * countable: `grep -n 'withKey' doors.ts` is the whole audit.
 */
export function withKey(
  projectPath: string | null | undefined,
  epic: string | null,
): { questions: Question[]; root: string | null } & Read {
  const { store, trouble, nowhere, root } = read(projectPath)
  if (trouble || nowhere) return { questions: [], trouble, nowhere, root: null }
  const questions = store.questions.filter((question) => epic === null || question.epic === epic)
  /* The root rides along so the door can say, beside each anchor, whether its
     document is there — `anchorOf` needs the same resolved spelling every
     stored path was relativised against. */
  return { questions, trouble, nowhere, root }
}

/* ------------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------------ */

/**
 * What a caller may ask this store to do.
 *
 * One discriminated union and one function, rather than five exported verbs,
 * for the reason the checklist module gives: the page and the MCP door are two
 * callers of the same rules, and two entry points would eventually enforce them
 * two slightly different ways. The bounds are applied at the doors, where a
 * string arrives; the RULES are here, where the questions are.
 *
 * `project` is the path of the folder the questions live in, and it is on every
 * variant rather than being a second parameter so that no operation can be
 * constructed without one. A write with no project has nowhere to go, and the
 * type is where that is said first.
 */
export type Op =
  | {
      op: 'add'
      project: string | null
      epic: string
      question: string
      options: string[]
      answer: number
      why: string
      passage: { path: string; start: number; end: number; quote: string }
      by: string
      viaMcp?: boolean
    }
  | {
      op: 'reword'
      project: string | null
      id: string
      question?: string
      options?: string[]
      answer?: number
      why?: string
      /**
       * The anchor, re-spelled in whole or in part. Any field left out is
       * kept, so `{ path }` alone moves a question to the same bytes of the
       * same file under a new name — which is the repair for a document that
       * moved inside its project. See `quiz/where.ts`.
       */
      passage?: { path?: string; start?: number; end?: number; quote?: string }
    }
  | { op: 'drop'; project: string | null; id: string }
  | { op: 'retake'; project: string | null; epic: string }

export type Done =
  | { ok: true; said: string; id: string }
  | { ok: false; error: string }

const no = (error: string): Done => ({ ok: false, error })

/**
 * The sentence a write gets when there is no project to write into.
 *
 * Written once, here, because all four operations get it and the page and the
 * MCP door both surface it. It says what to do rather than merely refusing:
 * a caller told only "no" writes the question somewhere else, or twice.
 */
const NOWHERE =
  'no project is open, so there is nowhere to put this. Questions live inside the project they are about, at '
  + '.kehikot/learning/questions.json, so this app needs to be told which folder that is before it can write anything. '
  + 'Nothing was recorded.'

export function change(op: Op): Done {
  const { store, trouble, nowhere, root } = read(op.project)
  /* Nothing is written while there is no project, and nothing is written while
     the file is unreadable. The second is the sharper rule — see `read`. */
  if (nowhere) return no(NOWHERE)
  if (trouble) return no(trouble)

  const held = store

  if (op.op === 'add') {
    if (held.questions.length >= MAX_QUESTIONS) {
      return no(
        `there are already ${MAX_QUESTIONS} questions in this project, which is as many as this app holds. Drop some `
        + 'that are no longer worth asking before writing more.',
      )
    }
    if (!SLUG.test(op.epic)) {
      return no(
        `"${op.epic.slice(0, MAX_EPIC)}" is not an epic slug. A slug is lower-case letters, digits and hyphens — it is `
        + 'what list_epics prints, not the title of the epic.',
      )
    }
    if (op.options.length < MIN_OPTIONS || op.options.length > MAX_OPTIONS) {
      return no(
        `a question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options and this one has ${op.options.length}. `
        + 'One option is not a choice, and a reader who cannot be wrong has not been asked anything.',
      )
    }
    if (op.options.some((option) => !option)) {
      return no('one of the options is empty. An option a reader cannot read is not one they can rule out.')
    }
    /* Duplicates are refused rather than deduplicated, because deduplicating
       would silently move the answer index: drop option 1 and the key still says
       2, which is now a different string. A caller that wrote the same option
       twice made a mistake and should be told, not corrected. */
    if (new Set(op.options).size !== op.options.length) {
      return no(
        'two of the options are the same. Whichever the reader picks, one of two identical strings would be marked '
        + 'wrong, so this question cannot be answered correctly.',
      )
    }
    if (!Number.isInteger(op.answer) || op.answer < 0 || op.answer >= op.options.length) {
      return no(
        `the answer must be the index of the correct option, counting from 0, so between 0 and ${op.options.length - 1} `
        + `for this question. It was ${JSON.stringify(op.answer)}.`,
      )
    }
    if (!op.passage.path) {
      return no(
        'a question here is anchored to a passage, and this one named no document. Give the path of the file the '
        + 'passage is in, as the project spells it.',
      )
    }
    if (!op.passage.quote) {
      return no(
        'a question here is anchored to a passage, and this one quoted nothing. The quote is what makes the anchor '
        + 'checkable when the paper is edited underneath it: paste the source those bytes actually held.',
      )
    }
    if (
      !Number.isInteger(op.passage.start)
      || !Number.isInteger(op.passage.end)
      || op.passage.start < 0
      || op.passage.end <= op.passage.start
    ) {
      return no(
        'the passage needs a byte range: start, and end one past the last byte, both whole numbers with end greater '
        + 'than start. If you read the file to write this question you know where in it you were — '
        + '`head -c N file | wc -c` settles it.',
      )
    }
    const path = stored(root, op.passage.path)
    const absent = missingAnchor(root, path)
    if (absent) return no(absent)
    const id = newId()
    /* On the end, which is where a new thing belongs. */
    held.questions.push({
      id,
      epic: op.epic,
      question: op.question,
      options: op.options,
      answer: op.answer,
      why: op.why,
      passage: { ...op.passage, path },
      by: op.by,
      viaMcp: op.viaMcp === true,
      at: now(),
      attempts: [],
    })
    const wrote = save(op.project, store)
    if (wrote) return no(wrote)
    return { ok: true, said: `Question ${id} written about ${op.epic}`, id }
  }

  if (op.op === 'retake') {
    const forgotten = held.questions.filter((question) => question.epic === op.epic && question.attempts.length)
    for (const question of forgotten) question.attempts = []
    const wrote = save(op.project, store)
    if (wrote) return no(wrote)
    return {
      ok: true,
      said: `${forgotten.length} answer${forgotten.length === 1 ? '' : 's'} forgotten for ${op.epic}`,
      id: op.epic,
    }
  }

  const question = held.questions.find((held_) => held_.id === op.id)
  if (!question) {
    return no(
      `there is no question "${op.id}" in this project. Questions are addressed by the id the quizzes tool prints `
      + 'beside each one, and a question written about another project lives in that project’s own file — it is not '
      + 'addressable from this one.',
    )
  }

  if (op.op === 'drop') {
    held.questions = held.questions.filter((held_) => held_.id !== op.id)
    const wrote = save(op.project, store)
    if (wrote) return no(wrote)
    return { ok: true, said: `Question ${op.id} dropped, along with ${question.attempts.length} answer(s) to it`, id: op.id }
  }

  /* reword. The id, the passage and the attempts survive: this is for sharpening
     a question somebody wrote in a hurry, and a question that has changed so
     much that the old answers no longer mean anything is a different question,
     which is what `add_quiz` is for. */
  const options = op.options ?? question.options
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    return no(`a question needs between ${MIN_OPTIONS} and ${MAX_OPTIONS} options and this one would have ${options.length}.`)
  }
  if (options.some((option) => !option)) return no('one of the options is empty.')
  if (new Set(options).size !== options.length) return no('two of the options would be the same.')
  const answer = op.answer ?? question.answer
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
    return no(
      `the answer must be the index of the correct option, counting from 0, so between 0 and ${options.length - 1} for `
      + `this question. It was ${JSON.stringify(answer)}.`,
    )
  }
  if (op.question !== undefined && !op.question) return no('a question cannot be reworded to nothing.')
  /* The anchor, re-spelled. Each field falls back to what is held, so a caller
     re-spelling only the path keeps the bytes and the quote — and the new
     anchor is held to the same rules as a fresh one, including that its
     document is there. A re-anchor that pointed at nothing would be the
     eighteen again, one call at a time. */
  const passage = {
    path: stored(root, op.passage?.path ?? question.passage.path),
    start: op.passage?.start ?? question.passage.start,
    end: op.passage?.end ?? question.passage.end,
    quote: op.passage?.quote ?? question.passage.quote,
  }
  if (!passage.path) return no('a question cannot be re-anchored to no document. Give the path, or leave it out.')
  if (!passage.quote) return no('a question cannot be re-anchored to an empty quote. Paste the source those bytes hold.')
  if (!Number.isInteger(passage.start) || !Number.isInteger(passage.end) || passage.start < 0 || passage.end <= passage.start) {
    return no('the passage needs a byte range: start, and end one past the last byte, both whole numbers with end greater than start.')
  }
  const absent = missingAnchor(root, passage.path)
  if (absent) return no(absent)
  const moved = passage.path !== question.passage.path
  question.question = op.question ?? question.question
  question.options = options
  question.answer = answer
  question.why = op.why ?? question.why
  question.passage = passage
  const wrote = save(op.project, store)
  if (wrote) return no(wrote)
  return { ok: true, said: moved ? `Question ${op.id} reworded and re-anchored to ${passage.path}` : `Question ${op.id} reworded`, id: op.id }
}

/**
 * The refusal for an anchor whose document is not in the project, or null
 * when it is — or when this module cannot look.
 *
 * Refused at the door rather than recorded, because a question that points at
 * nothing is a question a reader will press and get nothing from, and the
 * moment the caller can still do something about it is now. `unchecked` is
 * let through: a document outside the project is not this module's to
 * vouch for either way, and refusing it would be a claim that it does not
 * exist. The sentence names the spelling the other doors on this canvas use —
 * a file name relative to the PAPER is the way these paths go wrong.
 */
function missingAnchor(root: string | null, path: string): string | null {
  if (anchorOf(root, path) !== 'missing') return null
  return (
    `there is no "${path}" in this project — nothing at ${resolved(root, path)}. The path is taken relative to the `
    + 'project root, or absolute. If you read the file through another module\'s door, that door may have spelled it '
    + 'relative to something else, such as the paper\'s own folder: give the absolute path instead. Nothing was written.'
  )
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
 * Grade one answer, here, where the key is.
 *
 * The whole of the answer-visibility decision is this function existing. The
 * page posts an id and an index; the server compares them and replies with a
 * verdict, the key and the explanation. Nothing the browser held before this
 * request could have produced the verdict, so there is nothing to find early.
 *
 * An index outside the options is refused rather than scored as wrong, because
 * "wrong" is a thing a reader did and `chose: 47` is a thing a program did. A
 * store that recorded the second as the first would put a fictional attempt in
 * somebody's history.
 */
export function score(
  projectPath: string | null | undefined,
  id: string,
  chose: number,
): { scored: Scored } | { error: string } {
  const { store, trouble, nowhere, root } = read(projectPath)
  if (nowhere) return { error: NOWHERE }
  if (trouble) return { error: trouble }
  const question = store.questions.find((one) => one.id === id)
  if (!question) {
    return { error: `there is no question "${id.slice(0, MAX_ID)}" in this project, so there is nothing to answer.` }
  }
  if (!Number.isInteger(chose) || chose < 0 || chose >= question.options.length) {
    return {
      error:
        `that is not one of the options. This question has ${question.options.length}, numbered from 0, and the `
        + `answer given was ${JSON.stringify(chose)}. Nothing was recorded.`,
    }
  }
  const attempt: Attempt = { chose, right: chose === question.answer, at: now() }
  question.attempts.push(attempt)
  /* The oldest go. See MAX_ATTEMPTS. */
  if (question.attempts.length > MAX_ATTEMPTS) {
    question.attempts = question.attempts.slice(question.attempts.length - MAX_ATTEMPTS)
  }
  const wrote = save(projectPath, store)
  if (wrote) return { error: wrote }
  return { scored: { right: attempt.right, answer: question.answer, why: question.why, attempt, asked: asked(question, root) } }
}
