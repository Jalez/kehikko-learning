import { useCallback, useEffect, useRef, useState } from 'react'

import type { Files, QuizFile } from '@/store/ask.ts'

export type SaveState = 'loading' | 'saved' | 'unsaved' | 'saving' | 'conflict' | 'failed'

export interface QuizDoc {
  /** Null until the file has been read. */
  text: string | null
  /** Every source line as the server last found it: at the read, and after each save. */
  sources: QuizFile['sources']
  state: SaveState
  error: string | null
  /** The file moved on disk under these edits. Nothing is saved until one of the two is chosen. */
  conflict: boolean
  edit(text: string): void
  /** Save now, if there is anything to save. */
  flush(): Promise<void>
  /** Drop these edits and take what is on disk. */
  theirs(): void
  /** Write these edits over what is on disk. */
  mine(): Promise<void>
  /** Take a file the server just answered with (an undo). */
  take(file: QuizFile): void
}

/**
 * One epic's quiz file, open in the editor: Slides' `useDeck`, without the
 * watch this module has no stream for.
 *
 * Typing saves a beat after the last keystroke, against the version last seen.
 * A save the server refuses because the file moved — an agent wrote, or
 * somebody edited it elsewhere — STOPS saving and says so; it is never
 * retried over what is there. The person chooses which stays.
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

  const current = useRef<string | null>(null)
  const saved = useRef<string | null>(null)
  const version = useRef<string | null>(null)
  const there = useRef<QuizFile | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)
  const alive = useRef(true)
  /* One sitting at the editor is one entry in the undo trail. */
  const session = useRef('')
  session.current ||= Math.random().toString(36).slice(2, 12)

  const dirty = () => current.current !== null && current.current !== saved.current

  const take = useCallback((file: QuizFile) => {
    current.current = file.text
    saved.current = file.text
    version.current = file.version
    there.current = null
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

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (saving.current || there.current || !dirty()) return
    const sent = current.current as string
    saving.current = true
    if (alive.current) setState('saving')
    try {
      const result = await files.save(project, epic, sent, version.current, session.current)
      if (result.ok) {
        version.current = result.file.version
        saved.current = sent
        if (alive.current) {
          setSources(result.file.sources)
          setError(null)
          setState(dirty() ? 'unsaved' : 'saved')
        }
      } else {
        there.current = result.theirs
        if (alive.current) {
          setConflict(true)
          setState('conflict')
        }
      }
    } catch (caught) {
      failed(caught)
    } finally {
      saving.current = false
    }
    /* Typed while that save was in flight: it goes next. */
    if (dirty() && !there.current && alive.current) timer.current = setTimeout(() => void flush(), saveDelay)
  }, [files, project, epic, saveDelay])

  useEffect(() => {
    alive.current = true
    files.read(project, epic).then((file) => alive.current && take(file), failed)
    return () => {
      alive.current = false
      /* Closed with a save still waiting: send it, rather than lose the last words typed. */
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
        if (dirty() && !there.current) void files.save(project, epic, current.current as string, version.current, session.current).catch(() => {})
      }
    }
  }, [files, project, epic, take])

  const edit = useCallback(
    (next: string) => {
      current.current = next
      setText(next)
      if (there.current) return
      setState(dirty() ? 'unsaved' : 'saved')
      if (timer.current) clearTimeout(timer.current)
      if (dirty()) timer.current = setTimeout(() => void flush(), saveDelay)
    },
    [flush, saveDelay],
  )

  const theirs = useCallback(() => {
    if (there.current) take(there.current)
  }, [take])

  const mine = useCallback(async () => {
    if (!there.current) return
    version.current = there.current.version
    there.current = null
    setConflict(false)
    await flush()
  }, [flush])

  return { text, sources, state, error, conflict, edit, flush, theirs, mine, take }
}
