import { useCallback, useMemo, useRef } from 'react'

import { sameParts, type EpicPart, type FilterChoice, type FilterGroup, type Passage } from 'kehikot-module-protocol'
import type { HostEvents } from 'kehikot-module-protocol/client'
import { useHost, type Host } from 'kehikot-module-protocol/client/react'

/**
 * What this page reads off the host: the protocol's `useHost`, and the three things this module
 * adds on top of it.
 *
 * ## What is underneath now
 *
 * The connection, the grace before deciding nobody is there, the theme on `<html>` (both classes
 * spelled, and remembered for the next load's first paint), the flattened context, `point` and a
 * stable `request` are `kehikot-module-protocol/client/react`. This file used to be 445 lines that
 * did all of that by hand; see the protocol's docs/module-plumbing.md.
 *
 * ## What stays here, and why
 *
 * - **Values that keep their identity when nothing changed.** A context arrives after every change
 *   anywhere on the canvas, and the host builds a fresh passage, a fresh filter record and a fresh
 *   parts array each time whatever happened. `useHost` hands those over as they came. Here a new
 *   identity re-narrows the whole question list and re-decides the ladder, several times a second
 *   on top of a poll that is already running — so `passage`, `chosen` and `parts` are compared by
 *   value and the old object is kept when they say the same thing.
 * - **`containers` as ONE STRING.** For the same reason, and because `wire/aim.ts` reads only the
 *   module, the flag and each document's path and range: `App` inflates it once with
 *   `containersFrom`, memoised on the string.
 * - **`show`**, which says which documents this container is showing (`showing.set`).
 *
 * ## Why there is no kept state here
 *
 * The one pick a reader makes — how narrow this container is, `wire/scope.ts` — is a filter
 * choice, which the host already stores per container and hands back in `context.filters`. A
 * second copy under `state.set` would be two records of one preference. So `state:keep` is still
 * not declared; see `manifest.ts`.
 */

/** Whether anything is out there, and whether we have stopped waiting to find out. */
export type Where = Host['where']

export type { Passage }

export interface Kehikot {
  where: Where
  /** Which epic is open, or null. Null is a real screen here, not an error. */
  epic: string | null
  /**
   * The folder this canvas is standing in, or null.
   *
   * This is the partition key — see `quiz/projects.ts`. Null is a real state and not an
   * oversight: a host with no filesystem of its own knows the project's name and has no folder to
   * point at. A page holding null does NOT fall back to some other project's questions, because
   * guessing here means showing one project's questions inside another.
   */
  projectPath: string | null
  /** The project's name, when the host gave one. A label; `projectPath` is the key. */
  project: string | null
  /**
   * Where the canvas is pointed, or null — the HOST'S answer, never a memory of what this page
   * asked for. It marks the question whose passage the canvas is standing on and narrows the
   * list at a scope; no fetch is keyed on it. Applied on every context, including a null one, and
   * the same object while it says the same thing.
   */
  passage: Passage | null
  /**
   * Which of the scopes this page offered is chosen for THIS container. `{}` before any host has
   * said anything and from a host that has never heard of filters. The same object while it says
   * the same thing.
   */
  chosen: FilterChoice
  /**
   * Every container on the kehikko, whether it is picked out, and what documents it says it is
   * showing — flattened to one string. `''` is no containers: nothing is framing this page, or a
   * host too old to say. `wire/aim.ts` reads it; `App` inflates it once.
   */
  containers: string
  /**
   * `context.parts`: every part of the open epic, the ones a person ticked in the host's bar
   * flagged. `[]` from a host that has never heard of parts and before any greeting. The same
   * array while it says the same thing.
   */
  parts: readonly EpicPart[]
  /** Ask the host to make this container a given height. */
  resize: (height: number) => void
  /**
   * Say what this container can be narrowed by, so the host can draw the control. Fire and
   * forget; stable across renders. The client replays the last offer after every greeting.
   */
  filters: (groups: FilterGroup[]) => void
  /**
   * Point every container on the canvas at a passage (`passage.set`).
   *
   * Called when a person presses the source of a question, and at no other time — not on a load,
   * not on a context, not when the poll brings back a question. `manifest.ts` carries the
   * argument for why a module that is otherwise a consumer of passages may produce one at all,
   * and `dev/pointing.mjs` is the probe that counts whether it is still true. Fire and forget:
   * every refusal is swallowed.
   */
  point: (passage: Passage | null) => void
  /**
   * Say which documents this container is showing, so a neighbour can narrow to it
   * (`showing.set`).
   *
   * The opposite kind of message from `point`: sent by the PROGRAM whenever the set of documents
   * on screen changes, and never by a press. What it must not do is fire when nothing changed —
   * the caller compares the set as a string and sends only on a difference. Fire and forget.
   */
  show: (documents: Passage[]) => void
}

export type GotoHandler = NonNullable<HostEvents['onGoto']>

/**
 * `reloadWhenStale: false`, and it is this module's one departure from the hook's defaults.
 *
 * A page that is older than its server reloads itself, and by default the hook arranges that
 * whatever is on screen. Here the screen may be the editor with words in it that have not been
 * saved — and cannot be, from a page whose ticket the new process refuses. So `App` decides: it
 * draws the stale `Cover` (which is what reloads) only when nothing unsaved would go with it.
 * (Vite's dev client reloads the page on its own when its server comes back, which nothing here
 * can decline; `view/editor.tsx` says what that means for unsaved words.)
 */
export function useKehikot(id: string, onGoto: GotoHandler): Kehikot {
  const host = useHost(id, { onGoto }, { reloadWhenStale: false })

  const passage = useSame(host.passage, samePassage)
  const chosen = useSame(host.chosen, agrees)
  const parts = useSame(host.parts, (a, b) => sameParts(a, b))
  const containers = useMemo(() => flattenContainers(host.containers), [host.containers])

  const { request } = host
  const show = useCallback(
    (documents: Passage[]) => {
      /* Refused when nothing is framing the page, by a host that never learned the method, or
         before the greeting: none of which is a fault in this page, and none may throw out of an
         effect. */
      void request('showing.set', { refs: [], documents }).catch(() => {})
    },
    [request],
  )

  const { where, epic, projectPath, project, resize, filters, point } = host
  return useMemo(
    () => ({ where, epic, projectPath, project, passage, chosen, containers, parts, resize, filters, point, show }),
    [where, epic, projectPath, project, passage, chosen, containers, parts, resize, filters, point, show],
  )
}

/** The value as it was last time, for as long as the new one says the same thing. */
function useSame<T>(value: T, same: (a: T, b: T) => boolean): T {
  const held = useRef(value)
  if (held.current !== value && !same(held.current, value)) held.current = value
  return held.current
}

/**
 * The host's containers as one string, or `''`.
 *
 * Only what this page reads survives: the module, the flag, and each document
 * as its path and range. Refs are dropped — a question is never anchored to
 * one — and so are the page and the quote: this page compares documents by
 * path, and the rest is what happened to be pointed at in them.
 */
function flattenContainers(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return ''
  const rows = value.flatMap((one) => {
    if (typeof one !== 'object' || one === null) return []
    const row = one as { module?: unknown; selected?: unknown; showing?: unknown }
    if (typeof row.module !== 'string' || !row.module) return []
    const showing = (typeof row.showing === 'object' && row.showing !== null ? row.showing : {}) as {
      documents?: unknown
    }
    const documents = Array.isArray(showing.documents)
      ? showing.documents.flatMap((d) => {
          const doc = d as { path?: unknown; from?: unknown; to?: unknown } | null
          if (!doc || typeof doc.path !== 'string' || !doc.path) return []
          return [
            {
              path: doc.path,
              from: typeof doc.from === 'number' ? doc.from : null,
              to: typeof doc.to === 'number' ? doc.to : null,
            },
          ]
        })
      : []
    return [{ module: row.module, selected: row.selected === true, documents }]
  })
  return rows.length ? JSON.stringify(rows) : ''
}

/** The string back into rows. The inverse of `flattenContainers`, and lenient about anything that is not one. */
export function containersFrom(flat: string): { module: string; selected: boolean; documents: { path: string; from: number | null; to: number | null }[] }[] {
  if (!flat) return []
  try {
    const parsed: unknown = JSON.parse(flat)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((one) => {
      if (typeof one !== 'object' || one === null) return []
      const row = one as { module?: unknown; selected?: unknown; documents?: unknown }
      if (typeof row.module !== 'string' || !row.module) return []
      const documents = Array.isArray(row.documents)
        ? row.documents.flatMap((d) => {
            const doc = d as { path?: unknown; from?: unknown; to?: unknown } | null
            if (!doc || typeof doc.path !== 'string' || !doc.path) return []
            return [{ path: doc.path, from: typeof doc.from === 'number' ? doc.from : null, to: typeof doc.to === 'number' ? doc.to : null }]
          })
        : []
      return [{ module: row.module, selected: row.selected === true, documents }]
    })
  } catch {
    return []
  }
}

/** Whether two filter choices say the same thing, key by key. */
function agrees(a: FilterChoice, b: FilterChoice): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => a[key] === b[key])
}

/**
 * Whether two passages say the same thing.
 *
 * Field by field, including `quoted`, because this is asking whether the object
 * CHANGED rather than whether it names the same place. The second question is
 * `keyOf` in `wire/pointed.ts`, which deliberately leaves the quote out.
 */
function samePassage(a: Passage | null, b: Passage | null): boolean {
  if (a === null || b === null) return a === b
  return a.path === b.path && a.page === b.page && a.from === b.from && a.to === b.to && a.quoted === b.quoted
}
