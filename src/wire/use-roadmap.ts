import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ModuleContext } from 'roadmap-module-protocol'

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

/** A passage, as the context carries one and as `passage.set` takes one. */
export type Passage = NonNullable<ModuleContext['passage']>

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
  /**
   * Where the canvas is pointed, or null.
   *
   * ## What this is for here, which is one thing only
   *
   * Marking the question whose passage the canvas is standing on. Nothing else
   * in this app reads it: the questions shown are still decided by the project
   * and the epic, no fetch is keyed on it, and no screen changes when it
   * changes. A quiz that re-scoped itself to whatever somebody was pointing at
   * would be a container that emptied when a reader scrolled past the paragraph
   * the questions were written about.
   *
   * ## It is the host's answer, and never a memory of what this page asked for
   *
   * Pressing a question's source asks the host to point the canvas here; this
   * field is what the host then says about the canvas. They are two variables
   * deliberately. A host may refuse `passage.set`, may not know the method, or
   * may never have greeted this page — and then the canvas did not move, so a
   * card drawn as "where the canvas is pointed" would be a picture of something
   * that did not happen. Driving the mark off the context makes the refusal
   * visible for free: nothing moves, and nothing claims to have.
   *
   * ## Applied on every context, including a null one
   *
   * Never remembered. The protocol makes the field nullable precisely so that
   * "nothing is pointing at anything" is a state a module can move into, and a
   * page holding the last passage would go on marking a card about a chapter
   * the reader closed ten minutes ago — indistinguishable, on screen, from it
   * still being open.
   */
  passage: Passage | null
  /** Ask the host to make this container a given height. */
  resize: (height: number) => void
  /**
   * Point every container on the canvas at a passage.
   *
   * ## The bound, which is the whole of what `passage:set` was declared under
   *
   * This is called when a person presses the source of a question, and at no
   * other time. Not on a load, not on a context, not when the poll brings back
   * a question an agent has just written, not when somebody answers one, and
   * not on any conclusion this app reached by itself. `manifest.ts` carries the
   * argument for why a module that is otherwise a consumer of passages is
   * allowed to produce one at all; this is the line of code that argument
   * constrains, and `dev/pointing.mjs` is the probe that counts whether it is
   * still true.
   *
   * ## It goes through the canvas, and there is no other route
   *
   * `passage.set` puts a passage in the context and the host broadcasts that to
   * every framed module. This app therefore does not know, and must not know,
   * what will react — a paper, a source browser, notes, a diff, or nothing at
   * all today and something next month. Naming a module here would be a second
   * system doing what the context already does, and it would break the day
   * somebody put a question beside a different reader.
   *
   * Fire and forget, and every refusal is swallowed. A host that never learned
   * the method, or has not greeted this page yet, is not a fault in the question
   * somebody just pressed and not something they can do anything about; what it
   * must not do is throw a rejection out of a click handler.
   */
  point: (passage: Passage | null) => void
}

export type GotoHandler = NonNullable<HostEvents['onGoto']>

export function useRoadmap(id: string, onGoto: GotoHandler): Roadmap {
  const [where, setWhere] = useState<Where>('listening')
  const [epic, setEpic] = useState<string | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const [passage, setPassage] = useState<Passage | null>(null)
  const host = useRef<Connection | null>(null)

  /* The handler is read through a ref so that a caller re-creating it does not
     tear down the bridge — reconnecting would mean missing the greeting, which
     is the one message that never comes again. */
  const goto = useRef(onGoto)
  goto.current = onGoto

  useEffect(() => {
    /* Typed as the protocol's own context rather than as the four fields this
       page happens to read. It reads five now, and a hand-written shape that has
       to be widened every time is a shape that will one day be widened wrongly —
       `passage` is nullable and optional in different senses, and the package
       says which. */
    const arrived = (context: ModuleContext) => {
      /*
       * The theme comes from the host, and `prefers-color-scheme` is only the
       * unframed fallback. Both classes are set explicitly rather than one being
       * left off: `.light` is what lets a host's "light" beat a machine set to
       * dark, and without it the media query in `index.css` would win.
       */
      const root = document.documentElement
      root.classList.toggle('dark', context.theme === 'dark')
      root.classList.toggle('light', context.theme === 'light')
      /*
       * And the half of the page this module does not paint.
       *
       * The scrollbar, the focus ring, the caret and every form control are the
       * browser's, and what they follow is `color-scheme`, which defaults to the
       * MACHINE's setting and hears nothing about a class. In a container 220
       * pixels wide with a permanent scrollbar down the side of it, a host
       * switched to light on a machine set to dark leaves a dark gutter beside a
       * white page — which is not a subtle discrepancy, it is the part of the
       * module a person's eye lands on when they look at whether it changed.
       *
       * Set from the host's choice for the same reason the classes are: the
       * theme a person picked in the host is a decision, and their OS setting is
       * not that decision.
       */
      root.style.colorScheme = context.theme

      setWhere('hosted')
      setEpic(context.epic)
      setProjectPath(context.projectPath ?? null)
      setProject(context.project ?? null)
      /*
       * Compared field by field before it is written, because it is an OBJECT.
       *
       * A context arrives after every change anywhere on the canvas, and the
       * host builds a fresh `{path, page, from, to, quoted}` each time whatever
       * happened. Writing it unconditionally would give every render downstream
       * a new identity for a value that did not change — here that is the whole
       * question list re-deciding which card is marked, several times a second,
       * on top of a poll that is already running. The references cannot be
       * compared for the same reason, so the fields are.
       */
      setPassage((was) => (same(was, context.passage ?? null) ? was : (context.passage ?? null)))
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

  const point = useCallback((pointed: Passage | null) => {
    const conversation = host.current
    /* Unframed, or greeted by nothing. The page still works — that is the whole
       design — and a press that cannot leave the frame simply does not. */
    if (!conversation) return
    void conversation.request('passage.set', { passage: pointed }).catch(() => {})
  }, [])

  return useMemo(
    () => ({ where, epic, projectPath, project, passage, resize, point }),
    [where, epic, projectPath, project, passage, resize, point],
  )
}

/**
 * Whether two passages say the same thing.
 *
 * Field by field, including `quoted`, because this is asking whether the object
 * CHANGED rather than whether it names the same place. The second question is
 * `keyOf` in `wire/pointed.ts`, which deliberately leaves the quote out — a
 * quote may be re-read from the file on the way back, and comparing it there
 * would break a match. Here a changed quote is a changed context and worth a
 * render.
 */
function same(a: Passage | null, b: Passage | null): boolean {
  if (a === null || b === null) return a === b
  return a.path === b.path && a.page === b.page && a.from === b.from && a.to === b.to && a.quoted === b.quoted
}
