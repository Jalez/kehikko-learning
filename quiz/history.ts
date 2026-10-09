import { existsSync, readFileSync } from 'node:fs'

import { dataFile, makeDir, put } from '../store.ts'
import type { HistoryEntry } from './types.ts'

/**
 * The undo trail: what an epic's quiz file held before each write, so a person
 * can put it back. Slides keeps the same trail for a deck (`recordedWrite` in
 * its `store.ts`), and this is that shape, in `history.json` beside the quiz
 * files — it belongs in `kehikot-module-protocol` with the rest of what the two
 * share.
 *
 * Every write to a quiz file is recorded: an agent's `add_quiz`, `reword_quiz`
 * and `drop_quiz`, an undo, and an edit made in the page. A page edit is saved
 * every few keystrokes, so one SITTING at the editor is one entry — the file as
 * it was when the sitting began — rather than one per save.
 *
 * `before` is the whole file, key and all. It is on disk beside the file it
 * came from and no door serves it: the list a page is sent has no `before`.
 */

const FILE = 'history.json'
/** How many entries each epic keeps. */
export const HISTORY_PER_EPIC = 50

/** One entry as kept: `before` is the file's text before the write, null when the write created it. */
export interface Kept extends HistoryEntry {
  before: string | null
  /** The editor sitting a page edit belongs to. */
  session?: string
}

function load(projectPath: string | null | undefined): { path: string; entries: Kept[] } | null {
  const { path } = dataFile(projectPath, FILE)
  if (path === null) return null
  if (!existsSync(path)) return { path, entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { entries?: unknown }
    return { path, entries: Array.isArray(parsed.entries) ? (parsed.entries as Kept[]) : [] }
  } catch {
    /* A trail that cannot be read is not written over, and is not a reason to refuse the write it would have recorded. */
    return null
  }
}

/** Remember what `epic`'s file held before a write. Never throws: the write it records has its own answer. */
export function record(
  projectPath: string | null | undefined,
  epic: string,
  before: string | null,
  by: { agent: string; summary: string; session?: string },
): void {
  if (makeDir(projectPath).dir === null) return
  const trail = load(projectPath)
  if (!trail) return
  const mine = trail.entries.filter((one) => one.epic === epic)
  if (by.session && mine.at(-1)?.session === by.session) return
  const entry: Kept = {
    id: crypto.randomUUID().slice(0, 8),
    epic,
    at: new Date().toISOString(),
    agent: by.agent.trim().slice(0, 80) || 'an agent',
    summary: by.summary.replace(/\s+/g, ' ').trim().slice(0, 300) || 'an edit',
    before,
    ...(by.session ? { session: by.session } : {}),
  }
  const drop = new Set(mine.slice(0, Math.max(0, mine.length + 1 - HISTORY_PER_EPIC)).map((one) => one.id))
  put(trail.path, `${JSON.stringify({ entries: [...trail.entries.filter((one) => !drop.has(one.id)), entry] }, null, 1)}\n`)
}

/** An epic's trail, newest first, without the previous texts. */
export function history(projectPath: string | null | undefined, epic: string): HistoryEntry[] {
  return (load(projectPath)?.entries ?? [])
    .filter((one) => one.epic === epic)
    .reverse()
    .map(({ id, epic: of, at, agent, summary }) => ({ id, epic: of, at, agent, summary }))
}

/** One entry, with what the file held before it. */
export function kept(projectPath: string | null | undefined, epic: string, id: string): Kept | null {
  return load(projectPath)?.entries.find((one) => one.epic === epic && one.id === id) ?? null
}
