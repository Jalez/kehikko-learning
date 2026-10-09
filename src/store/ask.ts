import { answered, ask, follow, ticket, type AskFailure, type Attachment } from 'kehikot-module-protocol/client'

import type { Asked, Attempt, HistoryEntry, QuizChange, QuizFile, Standing } from '../../quiz/types.ts'

/**
 * This app's own store, over this app's own origin.
 *
 * Every path here is relative, which is the whole reason the store is middleware
 * in front of the same Vite server that serves this page rather than a second
 * process on a second port. See `vite.config.ts`.
 *
 * ## The asking is the protocol's
 *
 * `ask()` carries the page's ticket on every write and turns every failure into one typed
 * result: the server said no (its own sentence), nothing answered (`down`), or this page is older
 * than its server (`stale`). It never throws, so a read that used to die as an uncaught "Failed
 * to fetch" now tells `useServerStanding`, which is what draws the "own server is not answering"
 * cover in `App`. `follow()` is the same for the one event stream. See the protocol's
 * docs/module-plumbing.md.
 *
 * ## The types come from a file with no imports
 *
 * `quiz/types.ts` and not `quiz/questions.ts`, and the `import type` is not
 * decorative. The store imports `node:fs`; a value import from it — or a plain
 * `import` that somebody later drops the `type` from — drags `node:fs` into the
 * browser bundle, the module fails to evaluate, and the symptom is a page that
 * loads and never answers the host's greeting. That reads on screen as "the
 * module did not answer", which points at the wire and not at an import, and it
 * is visible only in a browser console. A types-only file cannot do it.
 *
 * ## What is deliberately NOT in the shape that comes back
 *
 * `Asked` has `answer: number | null` and `why: string | null`, and they are null
 * for every question nobody has answered yet. That is not this file being
 * careful; it is what the server sends. There is no request this file could make
 * that returns the key for an unanswered question, because there is no such
 * route — `answer()` below is the only thing that ever returns one, and it
 * returns it as the reply to having chosen. See `asked` and `score` in
 * `quiz/questions.ts`.
 *
 * The ticket is not fetchable either: it is read out of the inert JSON island in the document
 * (the protocol's `ticket()`), and there is no `/api/ticket`, deliberately.
 */

export type { Asked, Attempt, Standing }

/** What a failed asking came to: the sentence, and which kind of failure it was. */
export interface Failed {
  error: string
  kind: AskFailure
}

/*
 * There is no `everyProject()` here any more, and its absence is the change.
 *
 * It fetched `/api/projects`, which enumerated the projects one central store
 * held questions for, and the container drew that list when the host had given it no
 * path. There is no central store now: every question is inside the project it
 * is about, at `.kehikot/learning/`, and this app is handed one project at
 * a time and forgets it. So the list cannot be built, and — more to the point —
 * it is not needed: the questions are in the folder, in plain sight.
 */

export interface Opened {
  project: string
  epic: string | null
  standings: Standing[]
  questions: Asked[]
  /** Where this epic's questions are, relative to the project: the Markdown file a person edits. */
  file: string | null
  trouble: string | null
}

/**
 * One epic's questions in one project, or — with no epic — what each epic in the
 * project adds up to.
 *
 * Both in one call rather than two, because the container needs both at once in the
 * no-epic case and needs the standings beside the questions in the other, and a
 * second round trip would mean a render where the questions had arrived and the
 * heading had not.
 */
export async function openEpic(project: string, epic: string | null): Promise<Opened | Failed> {
  const asked = await ask<Record<string, unknown>>('/api/questions', { query: { project, epic: epic || null } })
  if (!asked.ok) return { error: asked.error, kind: asked.kind }
  const body = asked.body ?? {}
  return {
    project,
    epic,
    standings: Array.isArray(body.standings) ? (body.standings as Standing[]) : [],
    questions: Array.isArray(body.questions) ? (body.questions as Asked[]) : [],
    file: typeof body.file === 'string' ? body.file : null,
    trouble: typeof body.trouble === 'string' ? body.trouble : null,
  }
}

/** What comes back from having chosen: the verdict, and the key, now earned. */
export interface Scored {
  right: boolean
  answer: number
  why: string
  attempt: Attempt
  asked: Asked
}

/**
 * Answer one question.
 *
 * The page sends an id and an index and gets back a verdict it could not have
 * computed. This is the moment the key crosses the wire, and it is the only one.
 */
export async function answer(project: string, epic: string, id: string, chose: number): Promise<Scored | Failed> {
  const asked = await ask<Record<string, unknown>>('/api/answer', { body: { project, epic, id, chose } })
  if (!asked.ok) return { error: asked.error, kind: asked.kind }
  const body = asked.body ?? {}
  if (typeof body.answer !== 'number') return { error: 'it did not work, and said nothing about why', kind: 'refused' }
  return {
    right: body.right === true,
    answer: body.answer,
    why: typeof body.why === 'string' ? body.why : '',
    attempt: body.attempt as Attempt,
    asked: body.asked as Asked,
  }
}

/**
 * Forget one epic's answers, so the questions can be asked again.
 *
 * Worth noticing what this does beyond clearing a score: a question with no
 * attempts is one whose key is withheld again, in the store and therefore on the
 * wire. Retaking genuinely puts the answers back out of reach rather than hiding
 * something the page already has.
 */
export async function retake(project: string, epic: string): Promise<{ questions: Asked[] } | Failed> {
  const asked = await ask<Record<string, unknown>>('/api/retake', { body: { project, epic } })
  if (!asked.ok) return { error: asked.error, kind: asked.kind }
  return { questions: Array.isArray(asked.body?.questions) ? (asked.body.questions as Asked[]) : [] }
}

/* ------------------------------------------------------------------ *
 * The editor's file
 * ------------------------------------------------------------------ */

export type { Attachment, HistoryEntry, QuizChange, QuizFile }

/** What a save came to: written, or refused because the file moved — with what is there now. */
export type SaveResult = { ok: true; file: QuizFile } | { ok: false; theirs: QuizFile }

/**
 * An epic's quiz file, as the EDITOR reads and writes it — **the only calls in
 * this page that are answered with the answers.** Nothing here runs until a
 * person presses Edit: `view/editor.tsx` is the one caller, and it is mounted
 * by that press and unmounted by Done, taking the text with it. Every call
 * carries the page's ticket, reads included (`ticket: true`), because the reply holds the key.
 *
 * A failure is thrown as the protocol's `AskFailed`, whose `message` is the sentence and whose
 * `kind` says whether the server refused, did not answer, or is newer than this page.
 *
 * An interface, so a test hands the editor a fake.
 */
export interface Files {
  read(project: string, epic: string): Promise<QuizFile>
  save(project: string, epic: string, text: string, base: string | null, session: string): Promise<SaveResult>
  history(project: string, epic: string): Promise<HistoryEntry[]>
  undo(project: string, epic: string, id: string): Promise<QuizFile>
  /**
   * Be told whenever a quiz file in this project changes on disk, by any path.
   * Answers with the way to stop listening. What is sent is an epic and an
   * opaque version, never a word of the file. `onAttachment` is told whether the
   * line is open: `connecting`, `attached`, and `detached` whenever it is not.
   */
  watch(project: string, onChange: (change: QuizChange) => void, onAttachment?: (attachment: Attachment) => void): () => void
}

export const files: Files = {
  async read(project, epic) {
    return answered(await ask<{ file: QuizFile }>('/api/quiz', { query: { project, epic }, ticket: true })).file
  },
  async save(project, epic, text, base, session) {
    /* `keepalive`, so a save that is on its way when the page goes — the container closed with the
       last words unsaved — is finished by the browser rather than dropped with the page. */
    const asked = await ask<{ file: QuizFile }>('/api/quiz', { body: { project, epic, text, base, session }, keepalive: true })
    /* "Not written, the file moved, and here is what is there now" is an answer of this door's
       own shape rather than a failure of the asking: `ask()` keeps a refusal's body for it. */
    if (!asked.ok && asked.status === 409) {
      const theirs = (asked.body as { file?: QuizFile } | null)?.file
      if (theirs) return { ok: false, theirs }
    }
    return { ok: true, file: answered(asked).file }
  },
  async history(project, epic) {
    return answered(await ask<{ entries: HistoryEntry[] }>('/api/history', { query: { project, epic }, ticket: true })).entries
  },
  async undo(project, epic, id) {
    return answered(await ask<{ file: QuizFile }>('/api/undo', { body: { project, epic, id } })).file
  },
  watch(project, onChange, onAttachment) {
    /* An EventSource cannot carry a header, so the ticket rides in the address. `follow`
       reconnects when the line drops and says so meanwhile; `probe` asks `/healthz` each time it
       does, so a stream a restarted server refuses is told apart from a server that has stopped. */
    return follow<QuizChange>(
      '/api/watch',
      (change) => {
        if (change && typeof change.epic === 'string') onChange(change)
      },
      { query: { project, ticket: ticket() }, probe: true, onAttachment },
    )
  },
}
