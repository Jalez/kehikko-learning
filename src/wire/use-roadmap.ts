import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { connect, type Connection, type HostEvents } from 'roadmap-module-protocol/client'

/**
 * The context, as React state, and nothing else.
 *
 * ## What used to be underneath this
 *
 * `wire/host.ts` and `wire/mailbox.ts` — 418 lines, near-identical to the copy
 * in six sibling modules — are `roadmap-module-protocol/client` now. Nothing
 * this page says on the wire changed: `ready` to every greeting, the `goto`
 * handed straight to the caller's handler, and a backstop of 500ms, which is
 * this module's lineage and the client's default so it needed no option.
 *
 * The context was already passed through whole here rather than rebuilt from a
 * list of named fields, so no field starts or stops arriving. What did go is
 * the two-variable box below `connect` that caught an arrival which came too
 * early: the client splits `connect` from `listen()`, so the ordering is three
 * plain lines instead of a workaround for one module's copy of a hazard every
 * module had.
 *
 * ## Why there is no `state.set` here, where Checklist has one
 *
 * Checklist keeps a per-kehikko choice through the protocol's kept state,
 * because a person has to PICK which list a container shows and the pick has to
 * stick. Nothing here is picked. Which questions are shown is decided by two
 * facts that both arrive in the context — the project this canvas is standing
 * in, and the epic that is open — so a kept string would have nothing to hold,
 * and `state:keep` is not declared. See `manifest.ts`.
 *
 * ## How long to wait before deciding nobody is there
 *
 * A host greets on the frame's `load`. If nothing has greeted this page within
 * the grace period it is being opened directly, which is a supported way to run
 * this app and gets a different first paragraph rather than an error. The grace
 * exists so that a slow host does not make the page flash "nothing is framing
 * this" and then correct itself.
 */
const GREETING_GRACE_MS = 700

/** Whether anything is out there, and whether we have stopped waiting to find out. */
export type Where = 'listening' | 'unhosted' | 'hosted'

export interface Roadmap {
  where: Where
  /** Which epic is open, or null. Null is a real screen here, not an error. */
  epic: string | null
  /**
   * The folder this canvas is standing in, added by protocol 0.8, or null.
   *
   * This is the partition key — see `quiz/projects.ts`. Null is a real state and
   * not an oversight: a host with no filesystem of its own knows the project's
   * name and has no folder to point at. A page holding null does NOT fall back
   * to some other project's questions; it says it was not told where it is and
   * shows which projects hold questions, because guessing here means showing one
   * project's questions inside another.
   */
  projectPath: string | null
  /** The project's name, when the host gave one. A label; `projectPath` is the key. */
  project: string | null
  /** Ask the host to make this container a given height. */
  resize: (height: number) => void
}

export type GotoHandler = NonNullable<HostEvents['onGoto']>

export function useRoadmap(id: string, onGoto: GotoHandler): Roadmap {
  const [where, setWhere] = useState<Where>('listening')
  const [epic, setEpic] = useState<string | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const host = useRef<Connection | null>(null)

  /* The handler is read through a ref so that a caller re-creating it does not
     tear down the bridge — reconnecting would mean missing the greeting, which
     is the one message that never comes again. */
  const goto = useRef(onGoto)
  goto.current = onGoto

  useEffect(() => {
    const arrived = (context: {
      epic: string | null
      theme: 'light' | 'dark'
      project?: string | null
      projectPath?: string | null
    }) => {
      /*
       * The theme comes from the host, and `prefers-color-scheme` is only the
       * unframed fallback. Both classes are set explicitly rather than one being
       * left off: `.light` is what lets a host's "light" beat a machine set to
       * dark, and without it the media query in `index.css` would win.
       */
      const root = document.documentElement
      root.classList.toggle('dark', context.theme === 'dark')
      root.classList.toggle('light', context.theme === 'light')

      setWhere('hosted')
      setEpic(context.epic)
      setProjectPath(context.projectPath ?? null)
      setProject(context.project ?? null)
    }

    /*
     * The greeting can arrive before this effect has finished running, so the
     * connection is stored BEFORE it is told to listen.
     *
     * The client's `mailbox` installs its listener at module scope precisely so
     * that nothing is missed, and it replays what it kept SYNCHRONOUSLY the
     * moment `listen()` subscribes. Anything a handler reads must therefore be
     * assigned already. What stood here was two variables holding an early
     * arrival and delivering it one statement later — a workaround for this
     * module's copy of a hazard every module in the family had. `connect` and
     * `listen` are two calls now, so the order is three plain lines that read
     * in the order they happen.
     */
    const live = connect(id, {
      onHello: (context) => arrived(context),
      onContext: (context) => arrived(context),
      onGoto: (message, answer) => goto.current(message, answer),
    })
    host.current = live
    live.listen()

    const grace = setTimeout(() => {
      setWhere((was) => (was === 'listening' ? 'unhosted' : was))
    }, GREETING_GRACE_MS)

    return () => {
      clearTimeout(grace)
      live.stop()
      /* Cleared only if it is still ours: under StrictMode the second mount has
         already assigned its own connection by the time some cleanups run. */
      if (host.current === live) host.current = null
    }
  }, [id])

  const resize = useCallback((height: number) => host.current?.resize(height), [])

  return useMemo(
    () => ({ where, epic, projectPath, project, resize }),
    [where, epic, projectPath, project, resize],
  )
}
