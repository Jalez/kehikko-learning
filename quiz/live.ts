import { existsSync, readdirSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'

import { dataFile } from '../store.ts'
import { SLUG, versionOf } from './questions.ts'
import type { QuizChange } from './types.ts'

/**
 * What is pushed to an open editor: a quiz file changed, by any path — this
 * module's own routes, an agent over MCP, or a person editing the file on
 * disk. Slides' `live.ts`, for quiz files: plain listeners here, and
 * `vite.config.ts` turns them into server-sent events.
 *
 * What is told is `{ epic, version }` and never a word of the file, so nothing
 * that listens learns an answer from it; the editor asks for the text through
 * the door that is allowed to give it.
 */

type Listener = (change: QuizChange) => void

/** How long a burst of file events is gathered before the files are looked at. */
export const SETTLE_MS = 100

/** How often a project with no questions folder yet is checked for one. */
const LOOK_FOR_FOLDER_MS = 2000

interface Group {
  dir: string
  listeners: Set<Listener>
  /** Last version seen of each epic's file, so an event is sent only for a real change. */
  known: Map<string, string>
  watcher: FSWatcher | null
  timer: ReturnType<typeof setTimeout> | null
  poll: ReturnType<typeof setInterval> | null
}

const groups = new Map<string, Group>()

function versions(dir: string): Map<string, string> {
  const found = new Map<string, string>()
  if (!existsSync(dir)) return found
  for (const name of readdirSync(dir)) {
    const epic = name.endsWith('.md') ? name.slice(0, -3) : ''
    if (!SLUG.test(epic)) continue
    try {
      found.set(epic, versionOf(readFileSync(join(dir, name), 'utf8')))
    } catch {
      /* Gone between the listing and the read: it is reported as gone next time. */
    }
  }
  return found
}

/** Look at the files now and tell every listener about each one that changed since last time. */
function rescan(group: Group): void {
  group.timer = null
  const now = versions(group.dir)
  const changes: QuizChange[] = []
  for (const [epic, version] of now) if (group.known.get(epic) !== version) changes.push({ epic, version })
  for (const epic of group.known.keys()) if (!now.has(epic)) changes.push({ epic, version: null })
  group.known = now
  for (const change of changes) for (const listener of group.listeners) listener(change)
}

function attach(group: Group): void {
  if (group.watcher || !existsSync(group.dir)) return
  try {
    group.watcher = watch(group.dir, () => settle(group))
    group.watcher.on('error', () => {
      group.watcher?.close()
      group.watcher = null
    })
    if (group.poll) clearInterval(group.poll)
    group.poll = null
    /* Anything written between the first look and the watcher starting. */
    settle(group)
  } catch {
    group.watcher = null
  }
}

function settle(group: Group): void {
  if (group.timer) clearTimeout(group.timer)
  group.timer = setTimeout(() => rescan(group), SETTLE_MS)
}

/** This module's folder in a project, without making it; or why there is none. */
function folder(project: string | null | undefined): { dir: string } | { error: string } {
  const { path, trouble } = dataFile(project, 'x.md')
  return path === null ? { error: trouble ?? 'that did not say which project.' } : { dir: dirname(path) }
}

/**
 * Be told `{ epic, version }` whenever a quiz file in this project changes.
 * The folder is watched while anybody is listening, and let go of when the
 * last listener leaves. A project with no questions folder yet is checked for
 * one every couple of seconds rather than having one made by a read.
 */
export function watchQuizzes(project: string | null | undefined, listener: Listener): { close: () => void } | { error: string } {
  const where = folder(project)
  if ('error' in where) return where
  let group = groups.get(where.dir)
  if (!group) {
    group = { dir: where.dir, listeners: new Set(), known: versions(where.dir), watcher: null, timer: null, poll: null }
    groups.set(where.dir, group)
    attach(group)
    if (!group.watcher) {
      const waiting = group
      waiting.poll = setInterval(() => attach(waiting), LOOK_FOR_FOLDER_MS)
    }
  }
  const mine = group
  mine.listeners.add(listener)
  return {
    close: () => {
      mine.listeners.delete(listener)
      if (mine.listeners.size) return
      mine.watcher?.close()
      if (mine.timer) clearTimeout(mine.timer)
      if (mine.poll) clearInterval(mine.poll)
      groups.delete(mine.dir)
    },
  }
}

/**
 * Say a quiz file in this project may have changed. The doors call it after
 * their own writes, so an editor hears about them even where file events are
 * slow or missing; a change the watcher also saw is still sent once.
 */
export function poke(project: string | null | undefined): void {
  const where = folder(project)
  if ('error' in where) return
  const group = groups.get(where.dir)
  if (!group) return
  attach(group)
  settle(group)
}

/** How many projects are being watched; for tests. */
export function watching(): number {
  return groups.size
}
