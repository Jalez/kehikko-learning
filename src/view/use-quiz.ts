import { useCallback, useEffect, useRef, useState } from 'react'

import type { Files, QuizChange, QuizFile } from '@/store/ask.ts'

export type SaveState = 'loading' | 'saved' | 'unsaved' | 'saving' | 'conflict' | 'failed'

export interface QuizDoc {
  /** Null until the file has been read. */
  text: string | null
  /** Every source line as the server last found it: at the read, and after each save. */
  sources: QuizFile['sources']
  state: SaveState
  error: string | null
  /**
   * The file moved on disk under these edits — a save was refused, or the watch
   * said so while something typed was still unsaved. Nothing is saved until one
   * of the two is chosen.
   */
  conflict: boolean
  edit(text: string): void
  /**
   * Save until there is nothing left to save, waiting for a save already on its
   * way. True when what is typed is what is on disk; false when it could not be
   * made so (a conflict, or a save that failed).
   */
  flush(): Promise<boolean>
  /** Drop these edits and take what is on disk. */
  theirs(): Promise<void>
  /** Write these edits over what is on disk. */
  mine(): Promise<void>
  /** Take a file the server just answered with (an undo). */
  take(file: QuizFile): void
}

/**
 * One epic's quiz file, open in the editor: Slides' `useDeck`, for a quiz.
 *
 * Typing saves a beat after the last keystroke, against the version last seen.
 * A save the server refuses because the file moved — an agent wrote, or
 * somebody edited it elsewhere — STOPS saving and says so; it is never
 * retried over what is there. The person chooses which stays.
 *
 * ## The disk is listened to while the editor is open
 *
 * `files.watch` says when this epic's file changed, by any path. A version
 * this editor wrote itself is its own echo and is ignored. Any other, with
 * nothing typed since the last save, is simply taken: the editor shows what is
 * on disk. With something typed and unsaved it is the same question a refused
 * save asks, raised before the save rather than by it.
 *
 * ## Leaving does not lose the last words
 *
 * `flush` is what Done waits on. An unmount (the paper was left) saves what is
 * waiting on its way out, after any save already in flight. A page that is
 * going away altogether — the container closed — cannot be waited on, so the
 * save is sent as it goes, as a request the browser finishes after the page is
 * gone.
 *
 * The text lives here and nowhere else in the page, so it is gone when the
 * editor is closed.
 */
export function useQuiz({ files, project, epic, saveDelay = 600 }: { files: Files; project: string; epic: string; saveDelay?: number }): QuizDoc {
  const [text, setText] = useState<string | null>(null)
  const [sources, setSources] = useState<QuizFile['sources']>([])
  const [state, setState] = useState<SaveState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  /* The truth the async work reads, kept outside render so a late reply sees today's values. */
  const current = useRef<string | null>(null)
  const saved = useRef<string | null>(null)
  const version = useRef<string | null>(null)
  /* Versions this editor wrote: the watch announcing one of them is our own echo. */
  const ours = useRef(new Set<string | null>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef<Promise<boolean> | null>(null)
  const draining = useRef(false)
  /* A change heard while a save was in flight: decided once the save has answered. */
  const held = useRef<QuizChange | null>(null)
  const blocked = useRef(false)
  const alive = useRef(true)
  /* One sitting at the editor is one entry in the undo trail. */
  const session = useRef('')
  session.current ||= Math.random().toString(36).slice(2, 12)

  const dirty = () => current.current !== null && current.current !== saved.current

  const take = useCallback((file: QuizFile) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    current.current = file.text
    saved.current = file.text
    version.current = file.version
    blocked.current = false
    setText(file.text)
    setSources(file.sources)
    setConflict(false)
    setState('saved')
    setError(null)
  }, [])

  const failed = (caught: unknown) => {
    if (!alive.current) return
    setError(caught instanceof Error ? caught.message : String(caught))
    setState('failed')
  }

  const load = useCallback(async () => {
    try {
      const file = await files.read(project, epic)
      if (alive.current) take(file)
    } catch (caught) {
      failed(caught)
    }
  }, [files, project, epic, take])

  const block = () => {
    blocked.current = true
    if (!alive.current) return
    setConflict(true)
    setState('conflict')
  }

  /* Declared before `flush` reads it, through a ref, so the two can call each other. */
  const onWatch = useRef<(change: QuizChange) => void>(() => {})

  /** One save of what is typed now. False when it was refused or failed. */
  const send = useCallback(async (): Promise<boolean> => {
    const sent = current.current as string
    if (alive.current) setState('saving')
    try {
      const result = await files.save(project, epic, sent, version.current, session.current)
      if (!result.ok) {
        block()
        return false
      }
      version.current = result.file.version
      ours.current.add(result.file.version)
      saved.current = sent
      if (alive.current) {
        setSources(result.file.sources)
        setError(null)
        setState(dirty() ? 'unsaved' : 'saved')
      }
      return true
    } catch (caught) {
      failed(caught)
      return false
    }
  }, [files, project, epic])

  /**
   * Save, one run at a time. A keystroke's own save (`drain` false) writes once
   * and leaves what was typed meanwhile to the next beat; `flush` keeps going
   * until nothing is left, and a caller who arrives during a run waits for it.
   */
  const run = useCallback(
    (drain: boolean): Promise<boolean> => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      if (drain) draining.current = true
      saving.current ??= (async () => {
        let went = true
        let first = true
        while (went && dirty() && !blocked.current && (first || draining.current)) {
          first = false
          went = await send()
        }
        return !dirty()
      })().finally(() => {
        saving.current = null
        draining.current = false
        const waiting = held.current
        held.current = null
        if (waiting) onWatch.current(waiting)
        /* Typed while that save was in flight: it goes next. */
        if (dirty() && !blocked.current && alive.current && !timer.current) timer.current = setTimeout(() => void run(false), saveDelay)
      })
      return saving.current
    },
    [send, saveDelay],
  )

  const flush = useCallback(() => run(true), [run])

  onWatch.current = (change: QuizChange) => {
    if (change.epic !== epic || !alive.current) return
    /* Our own write may be announced before its reply lands: decide once it has. */
    if (saving.current) {
      held.current = change
      return
    }
    if (change.version === version.current || ours.current.has(change.version) || blocked.current) return
    if (dirty()) {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      block()
      return
    }
    void load()
  }

  useEffect(() => {
    alive.current = true
    void load()
    const unwatch = files.watch(project, (change) => onWatch.current(change))
    /* The page itself going away — the container closed. Nothing can be
       waited on, so the save is sent and the browser is left to finish it
       (`files.save` asks it to: see `keepalive` there). */
    const leaving = () => {
      if (dirty() && !blocked.current) void flush()
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') leaving()
    }
    const page = typeof window === 'undefined' ? null : window
    page?.addEventListener('pagehide', leaving)
    page?.document.addEventListener('visibilitychange', hidden)
    return () => {
      alive.current = false
      unwatch()
      page?.removeEventListener('pagehide', leaving)
      page?.document.removeEventListener('visibilitychange', hidden)
      /* Closed with edits not yet written: write them now — after a save
         already on its way — rather than lose the last words typed. */
      if (dirty() && !blocked.current) void flush()
    }
  }, [files, project, epic, load, flush])

  const edit = useCallback(
    (next: string) => {
      current.current = next
      setText(next)
      if (blocked.current) return
      setState(dirty() ? 'unsaved' : 'saved')
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      if (dirty()) timer.current = setTimeout(() => void run(false), saveDelay)
    },
    [run, saveDelay],
  )

  const theirs = useCallback(async () => {
    await load()
  }, [load])

  const mine = useCallback(async () => {
    if (!blocked.current) return
    try {
      /* Against what is there NOW, which may have moved again since it was refused. */
      version.current = (await files.read(project, epic)).version
      blocked.current = false
      setConflict(false)
      await flush()
    } catch (caught) {
      failed(caught)
    }
  }, [files, project, epic, flush])

  return { text, sources, state, error, conflict, edit, flush, theirs, mine, take }
}
