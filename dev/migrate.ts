/**
 * Move the questions out of this app's own `data/questions.json` and into the
 * projects they were always about.
 *
 * ## What this is for, once
 *
 * Until now this app kept one file beside itself with a `projects` record at the
 * top of it, keyed by absolute path. The store moved into the projects —
 * `<projectPath>/.kehikot/learning/questions.json` — and the outer key came out
 * with it,
 * because the path IS the partition now. So there is a file on this machine
 * holding several projects' questions and no program that reads it any more.
 *
 * This is the one program that reads it. It runs once, by hand.
 *
 * ## Why a script and not a migration on read
 *
 * Checklist migrates `papers.json` on read, and the argument there is good: a
 * migration that has to be RUN is one the person who needs it does not know
 * exists. It does not transfer here, for a reason that is specific to this
 * change rather than a matter of taste.
 *
 * A migration on read happens inside a request, for ONE project — whichever
 * project the container is standing in. The old file holds several. Reading it in the
 * `/Users/…/roadmap` request would mean either writing other projects' questions
 * into folders nobody asked about, or migrating a third of the file and leaving
 * the rest for a request that may never come. Both leave the same material in
 * two places, which is the state this is most trying to avoid: a migration that
 * half-happened across two locations is worse than one that has not started.
 *
 * So it is a script, and it is loud, and it does the whole thing or none of it.
 *
 * ## The order, which is the only part that matters
 *
 * WRITE every destination, READ every destination back, VERIFY every question
 * against the original, and only then rename the source. Never delete: the
 * original becomes `questions.json.migrated` and stays on disk, so a migration
 * that went wrong can be looked at rather than reconstructed.
 *
 * Verification is a comparison of the actual material — every question, every
 * option, the answer key, the passage, and every recorded attempt — and not a
 * count. A count matches when the ids are right and the keys are all zero, which
 * is exactly the corruption worth catching: an answer key silently reset makes
 * every question in the file wrong in a way nobody would see until they answered
 * one.
 *
 *     bun dev/migrate.ts            # say what would happen, touch nothing
 *     bun dev/migrate.ts --apply    # do it
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { moduleDir, moduleFile } from 'roadmap-module-protocol'

import { ID } from '../manifest.ts'
import { FILE } from '../store.ts'

/** The file this migration reads. Beside the program, where it used to live. */
const SOURCE = join(import.meta.dir, '..', 'data', 'questions.json')

interface Question {
  id: string
  epic: string
  question: string
  options: string[]
  answer: number
  why?: string
  passage?: { path: string; start: number; end: number; quote: string }
  by?: string
  viaMcp?: boolean
  at: string
  attempts?: { chose: number; right: boolean; at: string }[]
}

interface Old {
  projects?: Record<string, { questions?: Question[] }>
}

export interface Plan {
  /** One row per project key in the old file, in the order they were found. */
  rows: Row[]
  /** Why the whole thing cannot proceed, if it cannot. */
  refused: string | null
}

export interface Row {
  /** The project path exactly as the old file spelled it. */
  project: string
  questions: Question[]
  /** Where they would go, or null if the project is not on this machine. */
  destination: string | null
  /** Why this row cannot be written, or null. */
  trouble: string | null
}

/**
 * What would happen, worked out without touching anything.
 *
 * A project key that names a folder which is not here is a ROW WITH TROUBLE and
 * never a row silently dropped. Somebody may have renamed a directory, or the
 * questions may have been written from a machine this is not; either way the
 * material is real and the person running this has to be told about it in
 * words, because the alternative is a migration that reports success while
 * leaving questions behind in a file it is about to rename.
 */
export function plan(source: string = SOURCE): Plan {
  if (!existsSync(source)) {
    return { rows: [], refused: `there is nothing at ${source}, so there is nothing to migrate.` }
  }
  let old: Old
  try {
    old = JSON.parse(readFileSync(source, 'utf8')) as Old
  } catch (e) {
    return {
      rows: [],
      refused:
        `${source} could not be read (${e instanceof Error ? e.message.split('\n')[0] : String(e)}). Nothing has been `
        + 'touched. Fix or move it and run this again — every question in it is recoverable.',
    }
  }
  if (!old.projects || typeof old.projects !== 'object') {
    return { rows: [], refused: `${source} has no "projects" key, so it is not the file this migration is for.` }
  }

  const rows: Row[] = []
  for (const [project, held] of Object.entries(old.projects)) {
    const questions = Array.isArray(held?.questions) ? held.questions : []
    if (!existsSync(project)) {
      rows.push({
        project,
        questions,
        destination: null,
        trouble:
          `there is no folder at ${project} on this machine, so its ${questions.length} question(s) have nowhere to `
          + 'go. They are NOT lost — they stay in the source file, which is not renamed while any row is in this '
          + 'state. Create or restore that folder, or move the questions by hand.',
      })
      continue
    }
    const destination = moduleFile(project, ID, FILE)
    if (destination === null) {
      rows.push({ project, questions, destination: null, trouble: `${project} is not a usable project path.` })
      continue
    }
    /* Refused rather than merged. A destination that already holds questions is
       either a migration that has already run or a project somebody has started
       writing into, and merging two authored files by guesswork — which id wins,
       which attempt is newer — is how a person loses an answer they gave. */
    const already = existsSync(destination) ? readFileSync(destination, 'utf8').trim() : ''
    if (already && already !== '{}' && !isEmptyStore(already)) {
      rows.push({
        project,
        questions,
        destination,
        trouble:
          `${destination} already exists and is not empty. Nothing has been written over it. If this migration has `
          + 'already run, the source file is safe to remove by hand; if it has not, move that file aside first.',
      })
      continue
    }
    rows.push({ project, questions, destination, trouble: null })
  }
  return { rows, refused: null }
}

function isEmptyStore(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { questions?: unknown[] }
    return Array.isArray(parsed.questions) && parsed.questions.length === 0
  } catch {
    return false
  }
}

/** Every question, compared field by field, so a count cannot pass for a copy. */
function same(a: Question[], b: Question[]): string | null {
  if (a.length !== b.length) return `${a.length} question(s) went in and ${b.length} came back`
  for (let i = 0; i < a.length; i += 1) {
    const one = a[i]!
    const two = b[i]!
    if (JSON.stringify(one) !== JSON.stringify(two)) {
      return `question ${one.id} did not survive the write — it reads back as something else`
    }
  }
  return null
}

export interface Outcome {
  written: { project: string; destination: string; questions: number }[]
  left: { project: string; questions: number; trouble: string }[]
  /** Where the source went, or null if it was left where it was. */
  renamedTo: string | null
  refused: string | null
}

/**
 * Do it: write, read back, verify, and only then rename the source.
 *
 * The rename is conditional on EVERY row having been written and verified. One
 * project whose folder is missing is enough to leave the source exactly where it
 * is, because the source is then the only remaining copy of those questions and
 * renaming it would be filing the evidence away under a name nothing looks for.
 */
export function apply(source: string = SOURCE): Outcome {
  const { rows, refused } = plan(source)
  if (refused) return { written: [], left: [], renamedTo: null, refused }

  const written: Outcome['written'] = []
  const left: Outcome['left'] = []

  for (const row of rows) {
    if (row.trouble || row.destination === null) {
      left.push({ project: row.project, questions: row.questions.length, trouble: row.trouble ?? 'no destination' })
      continue
    }
    const dir = moduleDir(row.project, ID)
    if (dir === null) {
      left.push({ project: row.project, questions: row.questions.length, trouble: 'no destination' })
      continue
    }
    const fresh = !existsSync(dir)
    mkdirSync(dir, { recursive: true })
    /* This used to append `.kehikot/` to the project's `.gitignore` here, and
       no longer does. A migration that quietly added an ignore rule to every
       project it touched was the fourth program writing that one line — with
       notes, checklist and journeys — none of them able to take it back. It is
       a checkbox in the host now, per project: `shareKehikot` in the host's
       `server/projects.ts`. */
    void fresh

    /* The outer `projects` key is dropped here, and this is the whole of the
       shape change: the folder the file is in says which project it is. */
    writeFileSync(row.destination, `${JSON.stringify({ questions: row.questions }, null, 2)}\n`)

    /* Read back from disk rather than trusting the write. A verification against
       the object still in memory verifies nothing about the file. */
    let back: Question[]
    try {
      back = (JSON.parse(readFileSync(row.destination, 'utf8')) as { questions?: Question[] }).questions ?? []
    } catch (e) {
      left.push({
        project: row.project,
        questions: row.questions.length,
        trouble: `${row.destination} was written and will not read back (${String(e)}).`,
      })
      continue
    }
    const wrong = same(row.questions, back)
    if (wrong) {
      left.push({ project: row.project, questions: row.questions.length, trouble: `${row.destination}: ${wrong}.` })
      continue
    }
    written.push({ project: row.project, destination: row.destination, questions: row.questions.length })
  }

  /* Only when nothing was left behind. */
  let renamedTo: string | null = null
  if (!left.length && written.length) {
    renamedTo = `${source}.migrated`
    renameSync(source, renamedTo)
  }
  return { written, left, renamedTo, refused: null }
}

/* ------------------------------------------------------------------------ *
 * The command
 * ------------------------------------------------------------------------ */

function main(): void {
  const doIt = process.argv.includes('--apply')

  if (!doIt) {
    const { rows, refused } = plan()
    if (refused) {
      console.log(refused)
      return
    }
    console.log(`Reading ${SOURCE}\n`)
    for (const row of rows) {
      const head = `  ${row.project} — ${row.questions.length} question(s)`
      if (row.trouble) console.log(`${head}\n    NOT MIGRATED: ${row.trouble}`)
      else console.log(`${head}\n    → ${row.destination}`)
    }
    const blocked = rows.filter((row) => row.trouble)
    console.log(
      `\n${rows.length} project(s), ${rows.reduce((n, row) => n + row.questions.length, 0)} question(s) in all.`,
    )
    if (blocked.length) {
      console.log(
        `${blocked.length} of them cannot be written. Nothing will be renamed while that is true — the source file is `
        + 'the only remaining copy of those questions.',
      )
    }
    console.log('\nThis was a dry run. Add --apply to do it.')
    return
  }

  const out = apply()
  if (out.refused) {
    console.log(out.refused)
    process.exitCode = 1
    return
  }
  for (const row of out.written) {
    console.log(`wrote ${row.questions} question(s) to ${row.destination}`)
  }
  for (const row of out.left) {
    console.log(`LEFT BEHIND: ${row.project} — ${row.questions} question(s). ${row.trouble}`)
  }
  if (out.renamedTo) {
    console.log(`\nVerified. ${SOURCE} is now ${out.renamedTo} — renamed, not deleted.`)
  } else {
    console.log(`\n${SOURCE} was NOT renamed, because not everything in it could be written. Nothing is lost.`)
    process.exitCode = 1
  }
}

if (import.meta.main) main()
