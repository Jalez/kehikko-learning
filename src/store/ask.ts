import type { Asked, Attempt, Standing } from '../../quiz/types.ts'

/**
 * This app's own store, over this app's own origin.
 *
 * Every path here is relative, which is the whole reason the store is middleware
 * in front of the same Vite server that serves this page rather than a second
 * process on a second port. See `vite.config.ts`.
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
 */

/**
 * The write ticket, read once out of the inert JSON island in the document.
 *
 * It is not fetchable: there is no `/api/ticket`, deliberately, because a route
 * that hands out the write credential to whoever asks is the ticket abolished
 * with extra steps.
 */
function ticket(): string {
  const island = typeof document === 'undefined' ? null : document.getElementById('ticket')
  if (!island?.textContent) return ''
  try {
    const parsed: unknown = JSON.parse(island.textContent)
    return typeof parsed === 'string' ? parsed : ''
  } catch {
    return ''
  }
}

const TICKET = ticket()

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-learning-ticket': TICKET },
    body: JSON.stringify(body),
  })
  return response.json()
}

export type { Asked, Attempt, Standing }

/*
 * There is no `everyProject()` here any more, and its absence is the change.
 *
 * It fetched `/api/projects`, which enumerated the projects one central store
 * held questions for, and the container drew that list when the host had given it no
 * path. There is no central store now: every question is inside the project it
 * is about, at `.kehikot/learning/questions.json`, and this app is handed one project at
 * a time and forgets it. So the list cannot be built, and — more to the point —
 * it is not needed: the questions are in the folder, in plain sight.
 *
 * The screen for a null `projectPath` therefore says where to look rather than
 * showing a receipt. See `NoProject` in `view/nowhere.tsx`.
 */

export interface Opened {
  project: string
  epic: string | null
  standings: Standing[]
  questions: Asked[]
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
export async function openEpic(project: string, epic: string | null): Promise<Opened | { error: string }> {
  const parts = [`project=${encodeURIComponent(project)}`]
  if (epic) parts.push(`epic=${encodeURIComponent(epic)}`)
  const response = await fetch(`/api/questions?${parts.join('&')}`)
  const body = (await response.json()) as Record<string, unknown>
  if (body.ok === true) {
    return {
      project,
      epic,
      standings: Array.isArray(body.standings) ? (body.standings as Standing[]) : [],
      questions: Array.isArray(body.questions) ? (body.questions as Asked[]) : [],
      trouble: typeof body.trouble === 'string' ? body.trouble : null,
    }
  }
  return { error: typeof body.error === 'string' ? body.error : 'this app could not read its questions.' }
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
export async function answer(project: string, id: string, chose: number): Promise<Scored | { error: string }> {
  const body = (await post('/api/answer', { project, id, chose })) as Record<string, unknown>
  if (body.ok === true && typeof body.answer === 'number') {
    return {
      right: body.right === true,
      answer: body.answer,
      why: typeof body.why === 'string' ? body.why : '',
      attempt: body.attempt as Attempt,
      asked: body.asked as Asked,
    }
  }
  return { error: typeof body.error === 'string' ? body.error : 'it did not work, and said nothing about why' }
}

/**
 * Forget one epic's answers, so the questions can be asked again.
 *
 * Worth noticing what this does beyond clearing a score: a question with no
 * attempts is one whose key is withheld again, in the store and therefore on the
 * wire. Retaking genuinely puts the answers back out of reach rather than hiding
 * something the page already has.
 */
export async function retake(project: string, epic: string): Promise<{ questions: Asked[] } | { error: string }> {
  const body = (await post('/api/retake', { project, epic })) as Record<string, unknown>
  if (body.ok === true) return { questions: Array.isArray(body.questions) ? (body.questions as Asked[]) : [] }
  return { error: typeof body.error === 'string' ? body.error : 'it did not work, and said nothing about why' }
}
