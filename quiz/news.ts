import { existsSync, watch, type FSWatcher } from 'node:fs'
import { dirname } from 'node:path'

import { events, publish, resolveDoorProject, watching } from 'kehikot-module-protocol/serve'

import { dataFile, rootOf } from '../store.ts'

/**
 * Telling the reading page that a project's questions changed, over one held stream: the page never
 * asks on a clock (protocol 2.32.0, `events`/`subscribe`). What travels is that there IS news, and
 * never a word of a file; the page reads `/api/questions` again, the door it already reads, which is
 * the one built to hold no answer key.
 *
 * A change is published where it happens: every file this module writes (`put` in `store.ts` — an
 * answer, a retake, the editor's save, an agent's `add_quiz`), and a watcher over the project's
 * `.kehikot/learning/` while a page follows it, for a file somebody edited by hand. A project with no
 * such folder yet is watched one level up, at the nearest folder that exists, until it appears.
 *
 * This sits beside the editor's `/api/watch` (`quiz/live.ts`) on the same stream door
 * (`streams(…)` in `doors.ts`): that one tells an open editor which file moved and to which version;
 * this one only says "read again".
 */

export const EVENTS_PATH = '/api/questions/events'

/** The news itself. The page re-reads on any event; the first is sent as a stream opens. */
export const NEWS = { changed: true } as const

/** One topic per questions folder, so a write (which knows its file, not its project) finds it. */
export const topicOf = (dir: string) => `questions:${dir}`

/** This module's folder in `project`, without making it; null when there is none to watch. */
export function folderOf(project: string | null | undefined): string | null {
  const { path } = dataFile(project, 'x.md')
  return path === null ? null : dirname(path)
}

/* Several writes in one breath (a write, then the watcher seeing it) are one piece of news. */
const SETTLE_MS = 50
const settling = new Map<string, ReturnType<typeof setTimeout>>()

/** Say that the questions in `dir` changed. Nothing is sent when no page follows them. */
export function changed(dir: string | null | undefined): void {
  if (!dir || settling.has(dir)) return
  if (watching(topicOf(dir)) === 0) return
  settling.set(
    dir,
    setTimeout(() => {
      settling.delete(dir)
      publish(topicOf(dir), NEWS)
    }, SETTLE_MS),
  )
}

/** A file this module wrote or removed: news for the folder it is in. */
export function wrote(file: string): void {
  changed(dirname(file))
}

interface Watched {
  watcher: FSWatcher
  /** The folder actually watched: `dir` itself, or the nearest one above it that exists. */
  at: string
}

const watchers = new Map<string, Watched>()

function stop(dir: string): void {
  watchers.get(dir)?.watcher.close()
  watchers.delete(dir)
}

/** The questions folder if it exists, else the nearest folder above it, up to the project. */
function nearest(dir: string, root: string): string | null {
  for (let at = dir; ; at = dirname(at)) {
    if (existsSync(at)) return at
    if (at === root || dirname(at) === at) return null
  }
}

/**
 * Watch `dir` while a page follows it. A watcher whose topic nobody follows any more is closed at its
 * next event. Watching the folder above until `dir` exists means a quiz file an agent writes by hand
 * into a project that had none still arrives, without a clock.
 */
function watchFolder(dir: string, root: string): void {
  if (watchers.get(dir)?.at === dir) return
  const at = nearest(dir, root)
  if (!at) return
  stop(dir)
  try {
    const watcher = watch(at, () => {
      if (watching(topicOf(dir)) === 0) {
        stop(dir)
        return
      }
      /* The folder appeared: watch it from now on. */
      if (at !== dir && existsSync(dir)) watchFolder(dir, root)
      changed(dir)
    })
    watcher.on('error', () => {
      if (watchers.get(dir)?.watcher === watcher) stop(dir)
    })
    watchers.set(dir, { watcher, at })
  } catch {
    /* A folder that cannot be watched: writes through this server still publish. */
  }
}

/** Stop every watcher (tests, and a server that stops). */
export function stopWatching(): void {
  for (const dir of [...watchers.keys()]) stop(dir)
  for (const timer of settling.values()) clearTimeout(timer)
  settling.clear()
}

/**
 * The questions' stream: `/api/questions/events?project=…`. The watcher is opened once the host has
 * vouched for the folder, as the editor's is: nothing is watched under a path it does not hold.
 */
export const questionsStream = events((path, query) => {
  if (path !== EVENTS_PATH) return null
  const named = query.get('project')
  const dir = folderOf(named)
  if (!named || !dir) return null
  void resolveDoorProject(named).then((at) => {
    if (!at.ok || watching(topicOf(dir)) === 0) return
    const root = rootOf(at.path)
    if (root && folderOf(at.path) === dir) watchFolder(dir, root)
  })
  return { topic: topicOf(dir), initial: NEWS }
})
