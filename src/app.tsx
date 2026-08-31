import { useCallback, useEffect, useRef, useState } from 'react'

import { ID } from '../manifest.ts'

import { answer, openEpic, retake, type Asked, type Standing } from '@/store/ask.ts'
import { useRoadmap, type GotoHandler } from '@/wire/use-roadmap.ts'
import { QuizView } from '@/view/quiz.tsx'
import { NoEpic, NoProject } from '@/view/nowhere.tsx'
import { room } from '@/view/room.ts'
import { useFrame } from '@/view/use-frame.ts'
import { pointedQuestion, pointingAt } from '@/wire/pointed.ts'

/** Whether this page is in a frame. Unframed, it prints its own heading. */
const framed = typeof window !== 'undefined' && window.parent !== window

/**
 * How often the container looks for questions that arrived through the MCP door.
 *
 * ## Why a poll, and not the notifications extension
 *
 * Checklist announces MCP calls onto a notifications panel and drives its own
 * refresh off the same queue. This module declares no extensions at all, and the
 * argument is in `manifest.ts`: what an agent writes through this door lands in
 * the container in front of the reader, as a question they can answer, so the container IS
 * the notification and a second line on a panel two inches away would be telling
 * somebody about a thing they are looking at.
 *
 * That leaves the refresh, which is what this is. Three seconds because the
 * realistic case is an agent writing a handful of questions while somebody reads
 * the chapter they are about, and a question that appears within a few seconds
 * of being written feels like it was written for you. It is a `GET` against
 * loopback returning a few kilobytes; the cost of being wrong about the interval
 * is nothing.
 *
 * The poll never runs while an answer is in flight, and never replaces the list
 * out from under a card the reader is looking at with a version that has fewer
 * attempts on it — see `refresh` below.
 */
const EVERY_MS = 3000

export function App() {
  const [questions, setQuestions] = useState<Asked[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [trouble, setTrouble] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /*
   * This container shows questions about whatever paper is open. There is nothing in
   * it that a reference names, so `goto` is answered with a plain no rather than
   * a silence — the host's backstop would otherwise answer for us after half a
   * second, and "this app did not manage to say" reads as a fault where "there
   * is nothing here to walk to" is a fact.
   */
  const onGoto = useCallback<GotoHandler>((message, said) => {
    said(
      false,
      message.ref
        ? 'This container asks questions about a paper, so there is nothing here to walk to by reference.'
        : 'This container asks questions about whichever paper is open, so there is nothing here to walk to.',
    )
  }, [])

  const { where, epic, projectPath, project, passage, resize, point } = useRoadmap(ID, onGoto)

  /* How big the box actually is, and what therefore fits in it. Two lines here
     because the deciding is in `view/room.ts`, where it can be read as a table
     and asserted as one. */
  const frame = useFrame()
  const fits = room(frame)

  /* Held in a ref as well as in state so the poll can read the current pair
     without being re-created — and therefore re-scheduled — on every context
     change. */
  const standing = useRef<{ project: string | null; epic: string | null }>({ project: null, epic: null })
  standing.current = { project: projectPath, epic }

  /* Set while an answer is in flight, so a poll landing in the middle cannot
     overwrite the reply to a press with a read that started before it. */
  const writing = useRef(false)

  const refresh = useCallback(async () => {
    const { project: where_, epic: which } = standing.current
    /* No project, nothing to fetch. There is no longer anything this app could
       ask for without one: the questions are inside the project, so a request
       with no path has no file behind it. The screen for it says so. */
    if (!where_) {
      setStandings([])
      setQuestions([])
      setTrouble(null)
      return
    }
    const opened = await openEpic(where_, which)
    if (writing.current) return
    if ('error' in opened) {
      setTrouble(opened.error)
      return
    }
    /* Only adopt an answer that is still about the pair we are showing. A slow
       response for the previous epic arriving after a switch would otherwise
       draw one paper's questions under another's heading. */
    if (standing.current.project !== where_ || standing.current.epic !== which) return
    setStandings(opened.standings)
    setQuestions(opened.questions)
    setTrouble(opened.trouble)
  }, [])

  /* One effect for the first read of every new (project, epic) pair, and one
     interval that keeps it current. Separated because the first read must happen
     immediately on a switch and the interval must not be restarted by one. */
  useEffect(() => {
    if (where === 'listening') return
    setQuestions([])
    void refresh()
  }, [where, projectPath, epic, refresh])

  useEffect(() => {
    if (where === 'listening') return
    const timer = setInterval(() => void refresh(), EVERY_MS)
    return () => clearInterval(timer)
  }, [where, refresh])

  /**
   * Answer one question.
   *
   * The reply carries the verdict, the key and the explanation, and it is the
   * only place any of those reach this page. What is done with it is a targeted
   * replacement of the one question rather than a re-read, so that the card the
   * reader just pressed is the card that changes, in the same frame, with no
   * flash of a list that has not caught up.
   */
  const onAnswer = useCallback(
    async (id: string, chose: number) => {
      if (!projectPath) return
      setBusy(true)
      writing.current = true
      try {
        const out = await answer(projectPath, id, chose)
        if ('error' in out) {
          setTrouble(out.error)
          return
        }
        setTrouble(null)
        setQuestions((was) => was.map((question) => (question.id === id ? out.asked : question)))
      } finally {
        writing.current = false
        setBusy(false)
        void refresh()
      }
    },
    [projectPath, refresh],
  )

  /**
   * A person pressed the source of a question.
   *
   * The only place in this app that publishes anything, and the only thing it
   * publishes is a passage. It goes onto the canvas through the general
   * pipeline — `passage.set`, into `roadmap.context`, broadcast to every framed
   * module — and this app therefore does not know and must not know what
   * answers it. A reader of that document reacts; so would a diff, a source
   * browser, or notes. Nothing here names one, and the feature keeps working if
   * the module that reacts today is replaced by a different one tomorrow.
   *
   * Silent when there is no project path, because `pointingAt` cannot spell a
   * document identity without a root and a relative path published as an
   * absolute one is a claim every consumer would resolve against its own. That
   * is unreachable from the screen — a page with no project path shows
   * `NoProject` and has no questions to press — and it is checked here anyway,
   * because "unreachable" is a property of a layout somebody may change.
   */
  const onPoint = useCallback(
    (id: string) => {
      const question = questions.find((held) => held.id === id)
      if (!question) return
      const where_ = pointingAt(projectPath, question.passage)
      if (!where_) return
      point(where_)
    },
    [questions, projectPath, point],
  )

  /*
   * Which card is marked, decided from the host's answer about the canvas.
   *
   * Not from a memory of what was just pressed, and the difference shows the
   * moment a host refuses `passage.set` or nothing is framing this page at all:
   * then the canvas did not move, and no card claims it did. It is also what
   * marks a question when somebody ELSE points at its passage — a reader
   * highlighting the paragraph a question was written about gets the question
   * marked, which is the same feature read backwards and came free.
   *
   * No echo guard, and `wire/pointed.ts` carries the argument: the sibling
   * modules that needed one react to an arriving passage DESTRUCTIVELY, and
   * what this does is mark a card. On this module's own echo that is not merely
   * harmless, it is the confirmation the press was made to produce.
   */
  const pointed = pointedQuestion(projectPath, questions, passage)

  const onRetake = useCallback(async () => {
    if (!projectPath || !epic) return
    setBusy(true)
    writing.current = true
    try {
      const out = await retake(projectPath, epic)
      if ('error' in out) {
        setTrouble(out.error)
        return
      }
      setTrouble(null)
      setQuestions(out.questions)
    } finally {
      writing.current = false
      setBusy(false)
      void refresh()
    }
  }, [projectPath, epic, refresh])

  /* Ask the host for the height this page actually is. The observer is
     re-attached on every render deliberately: the alternative is a dependency
     list that has to name everything that can change the page's height, which is
     a list somebody will forget to add to. */
  const shell = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = shell.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => resize(Math.ceil(node.getBoundingClientRect().height) + 16))
    watch.observe(node)
    return () => watch.disconnect()
  })

  /*
   * Snapping, switched on the document element rather than on a scroller of our
   * own.
   *
   * The thing that scrolls in this page IS the document: the root below reports
   * its full height to the host and the host clamps it, so what the reader
   * scrolls is the frame's own viewport over a taller document. Wrapping the
   * list in an `overflow-y: auto` box would give us a scroller to put
   * `scroll-snap-type` on directly, and would also make the height this page
   * reports equal to the height it was given — the container would never grow
   * again, because it would always exactly fit itself.
   *
   * So the attribute goes on `<html>` and `index.css` answers it. The precedent
   * is `wire/use-roadmap.ts`, which sets `.dark` on the same element for the
   * same reason: it is the one node above this component that CSS can key on.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.snap = fits.snap ? 'on' : 'off'
    return () => {
      delete root.dataset.snap
    }
  }, [fits.snap])

  const screen =
    where === 'listening' ? (
      <p className="text-[0.7rem] leading-4 text-muted-foreground">
        Waiting to hear whether anything is framing this page, and therefore which project it is standing in.
      </p>
    ) : !projectPath ? (
      <NoProject unhosted={where === 'unhosted'} />
    ) : !epic ? (
      <NoEpic project={project} standings={standings} />
    ) : (
      <QuizView
        epic={epic}
        questions={questions}
        onAnswer={(id, chose) => void onAnswer(id, chose)}
        onPoint={onPoint}
        pointed={pointed}
        onRetake={() => void onRetake()}
        trouble={trouble}
        busy={busy}
        room={fits}
      />
    )

  return (
    <div ref={shell} className="flex min-w-0 flex-col gap-2 p-2 text-foreground @sm/container:p-3">
      {/*
        The heading, which only exists when nothing is framing this page.

        It was three sentences: what the module is, that the key is withheld, and
        where the grading happens. All true, and the second and third are said
        again — at length, and better — in `README.md` and at the top of
        `view/quiz.tsx`. Three sentences above the first question is the shape of
        prose nobody reads.

        What is left is the one line a person who has just opened this file needs
        before they scroll.
      */}
      {framed ? null : (
        <header className="min-w-0">
          <h1 className="text-sm font-semibold">Learning</h1>
          <p className="text-[0.7rem] leading-4 text-muted-foreground">
            Multiple-choice questions about passages of a paper. An agent writes them; you answer them. The correct
            option reaches this page only in the reply to an answer.
          </p>
        </header>
      )}

      {trouble && projectPath && epic ? null : trouble ? (
        <p className="rounded border border-wrong/40 bg-wrong/5 px-2 py-1.5 text-[0.7rem] leading-4 text-wrong">
          {trouble}
        </p>
      ) : null}

      {screen}
    </div>
  )
}
