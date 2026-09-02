import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { LIMITS } from 'roadmap-module-protocol'

import { ID } from '../manifest.ts'

import { answer, openEpic, retake, type Asked, type Standing } from '@/store/ask.ts'
import { useRoadmap, type GotoHandler } from '@/wire/use-roadmap.ts'
import { QuizView } from '@/view/quiz.tsx'
import { NoEpic, NoProject } from '@/view/nowhere.tsx'
import { ladder, partsOf, room, roughly, type Card, type Part } from '@/view/room.ts'
import { textWidth } from '@/view/text.ts'
import { useFrame } from '@/view/use-frame.ts'
import { aimNote, aimOf, aimOffer, inFront, inFrontOf, showing, whyEmpty, type Shown } from '@/wire/aim.ts'
import { keyOf, pointedQuestion, pointingAt, sourceLabel } from '@/wire/pointed.ts'
import { hiddenNote, narrow, offer, reachOf, scopeOf } from '@/wire/scope.ts'
import { containersFrom } from '@/wire/use-roadmap.ts'

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

  const { where, epic, projectPath, project, passage, chosen, containers, resize, filters, point, show: tell } = useRoadmap(
    ID,
    onGoto,
  )

  /*
   * The host's list of containers, inflated once from the string the wire
   * holds, and what the picks make of it. Memoised on the string and on the
   * header's choice, so a context that re-states the same canvas is the same
   * object and nothing below re-decides which questions are in front.
   *
   * `self` is this module's own id, so that its own row — which it writes,
   * with `tell` below — is never read back. `wire/aim.ts` says why that is
   * the difference between a pane that narrows and one that ratchets wider.
   */
  const onCanvas = useMemo<Shown[]>(() => containersFrom(containers), [containers])
  const front = useMemo(
    () =>
      inFrontOf({
        self: ID,
        passage: passage ? { path: passage.path, from: passage.from, to: passage.to } : null,
        containers: onCanvas,
        aim: aimOf(chosen),
      }),
    [onCanvas, passage, chosen],
  )

  /*
   * What this container can be narrowed by, said whenever the answer changes.
   *
   * ## The paragraph that used to be here said there was nothing, and half of it was right
   *
   * It argued that everything this page holds is already narrowed by something
   * nobody chooses, that `shown` and `part` are a reader's POSITION rather than a
   * filter, and that `only unanswered` should be refused because a quiz whose
   * list loses a card the moment it is answered takes away the one thing a reader
   * comes back for. The last of those still stands and is still not offered.
   *
   * What the rest of it got wrong is that "the ladder is a position" quietly
   * stood in for "there is nothing here to narrow by". There is, and the owner
   * had already asked for it: questions about all files, this file, or the
   * section being read. The rungs are offered as GRAIN — `all`, `file`,
   * `section` — so what the host remembers per container is how narrow the reader
   * likes it, which is a preference; which file and which section are read off
   * the passage the canvas is standing on every time, which is why the old
   * paragraph's worry about storing a position does not apply. `wire/scope.ts`
   * carries the whole argument, including why there is no `page` rung.
   *
   * ## Why this is an effect, and what it depends on
   *
   * The offer changes when the RUNGS change: nothing is pointed at on a canvas
   * that has just opened, and `this document` there is a control a person can
   * press that answers nothing. So it is re-sent when a document or a selection
   * appears or disappears — and NOT when the passage merely moves, because a
   * reader scrolling through a chapter changes which questions are shown without
   * changing what can be chosen. Two booleans, not the passage.
   */
  const reach = reachOf(projectPath, passage)
  const greeted = where !== 'listening'
  useEffect(() => {
    /* `null` means "nothing to say yet" and is not sent: an empty offer is a
       claim the host acts on by pruning this container's stored choice, and
       making that claim before the canvas has spoken erased the remembered
       scope on every load. See `offer`. */
    const groups = offer({ file: reach.file, section: reach.section }, greeted)
    if (!groups) return
    /* And the `aim` group, only when the host lists containers, with its own
       count in its own label — see `aimOffer` in `wire/aim.ts`. It depends on
       the list, so a tick on any container re-sends the offer with the count
       moved; that is a message per tick and not per context, because the
       string the list is held as does not change when the canvas merely
       re-states itself. */
    filters([...groups, ...aimOffer(onCanvas)])
  }, [filters, reach.file, reach.section, greeted, onCanvas])

  /* How narrow the reader asked for, as this context can honour it. A rung that
     has gone away degrades to `all` rather than emptying the container — the
     host keeps the choice, so it comes back the moment they highlight something
     again. */
  const scope = scopeOf(chosen, reach)

  /* How big the box actually is, and what therefore fits in it. Two lines here
     because the deciding is in `view/room.ts`, where it can be read as a table
     and asserted as one. */
  const frame = useFrame()
  const fits = room(frame)

  /*
   * Which question the reader is looking at, and which piece of it — the state
   * the ladder's lower two rungs need, and the only state in this app that is
   * about a screen rather than about the store.
   *
   * It is HERE rather than in `QuizView` because the rung depends on it: whether
   * one whole question fits is a fact about the question being shown, so
   * `ladder()` has to be told which one that is, and `ladder()` is also what
   * decides whether the document snaps. Two consumers, one owner.
   */
  const [shown, setShown] = useState(0)
  const [part, setPart] = useState<Part>('options')

  /**
   * Move to another question, and start it at its options.
   *
   * The reset is the whole reason this is a function rather than `setShown`
   * handed down bare. A reader who was looking at the passage of question 3 and
   * pressed "next" is not asking for the passage of question 4; they are asking
   * for the next question, and the next question is a thing to answer. Carrying
   * the part across was measured by `dev/ladder.mjs` as a screen with no options
   * on it after a page, which reads as a broken button.
   */
  const show = useCallback((at: number) => {
    setShown(at)
    setPart('options')
  }, [])

  /*
   * A different set of questions is a different place to be standing.
   *
   * A different paper, obviously: starting a reader halfway through one because
   * that is where they were in the last is a position they never chose. And a
   * different SCOPE for the same reason — narrowing to this document is a request
   * to be shown that document's questions, not to be left on whichever index the
   * old list happened to have them at.
   *
   * `narrowedBy` is what makes the second half honest without making it noisy. At
   * `all` it is the constant string, so a reader scrolling through a chapter — a
   * new passage several times a second — is never moved. Narrowed, it names the
   * place being narrowed to, so moving to another paragraph is the one case that
   * genuinely does change which questions exist.
   */
  const narrowedBy = scope === 'all' ? 'all' : `${scope} ${passage ? keyOf(passage) : ''}`
  /* And the aim, by the same argument: a different set of documents in front
     is a different set of questions, and the reader should start at its top.
     The string is the paths, so a context that re-states the same canvas
     moves nobody. */
  const aimedAt = front.everything ? 'everything' : front.documents.map((one) => one.path).join('\n')
  useEffect(() => {
    setShown(0)
    setPart('options')
  }, [projectPath, epic, narrowedBy, aimedAt])

  /*
   * The font engine, asked once.
   *
   * `roughly` is the fallback and it is never good enough to lay out on — see
   * `view/text.ts`. It is reached only where there is no document, and there is
   * no document only where there is no measured frame, and an unmeasured frame
   * is answered with `list` before the estimate is consulted at all.
   */
  const measure = useMemo(() => textWidth() ?? roughly, [])

  /*
   * The questions this scope leaves on screen, and how many it does not.
   *
   * Everything below this line — the cards, the ladder, which question is being
   * shown — is about the narrowed list, because those are all statements about
   * what a reader is looking at. `questions` stays whole above it, because that
   * is what a press, an answer and the poll all act on: narrowing is a view of
   * the store and never an edit to it.
   *
   * The count is kept and drawn in the page. The host cannot count rows it does
   * not render, in a document it cannot read, in a frame on another origin — so a
   * narrowing that says nothing about what it hid is a container that has quietly
   * lost questions.
   */
  /*
   * Two narrowings, in order: first what the canvas shows (the aim), then how
   * narrow the reader likes it (the scope). The aim decides which DOCUMENTS
   * are in front and matches by path alone; the scope is the reader's own
   * grain within the pointed document. `wire/aim.ts` argues for the split.
   */
  const aimed = useMemo(() => inFront(questions, projectPath, front), [questions, projectPath, front])
  const visible = useMemo(
    () => narrow(aimed.shown, projectPath, passage, scope),
    [aimed, projectPath, passage, scope],
  )
  const hidden = questions.length - visible.length
  /* Worded once, and read by both the page and the geometry: `view/room.ts`
     needs the short form's WIDTH, because it is one more item in the row of
     controls the paged rungs measure their room against. The scope's sentence
     wins when both narrowed, because the scope is the reader's own press and
     the thing they will look for first. */
  const hiding = hiddenNote(scope, hidden) ?? aimNote(front, hidden)
  /* Why the aim left nothing, in this module's words — or null. Held apart
     from `hiding`, because it is drawn as the whole screen and not a line. */
  const emptied = aimed.shown.length === 0 ? whyEmpty(front, questions.length, aimed.unresolved) : null

  /*
   * What this container is showing, told to the canvas whenever it changes.
   *
   * The distinct documents of the questions ON SCREEN, compared as a string
   * so that a context re-stating the same canvas — or a poll returning the
   * same list — sends nothing. Sent as `[]` when nothing is on screen,
   * because "showing nothing" is a state the canvas has to be able to move
   * back into. Not sent before the host has greeted: there is nobody to tell,
   * and the client would only queue a refusal. `manifest.ts` carries the
   * argument for declaring the capability at all, and `wire/use-roadmap.ts`
   * the bound this effect is held to.
   */
  const shownDocuments = useMemo(() => showing(visible, projectPath, LIMITS.SHOWING_DOCUMENTS), [visible, projectPath])
  const shownKey = shownDocuments.map((one) => one.path).join('\n')
  const told = useRef<string | null>(null)
  useEffect(() => {
    if (where !== 'hosted') return
    if (told.current === shownKey) return
    told.current = shownKey
    tell(shownDocuments)
    /* `shownDocuments` is a function of `shownKey` and `projectPath`; the key
       is what decides whether to send. */
  }, [where, shownKey, tell])

  /*
   * The questions, reduced to the fields that decide how tall a card is.
   *
   * `view/room.ts` deliberately does not import `Asked`: it is a file of
   * geometry, and a file of geometry that knew about attempts and answer keys
   * would end up making decisions about them. The projection is here.
   */
  const cards = useMemo<Card[]>(
    () =>
      visible.map((question) => ({
        question: question.question,
        options: question.options,
        source: sourceLabel(question.passage.path, fits.source),
        path: question.passage.path,
        anchor: question.anchor,
        quote: question.passage.quote,
        why: question.why,
        answered: question.attempts.length > 0,
      })),
    [visible, fits.source],
  )

  const brief = hiding?.brief ?? null
  const rungs = useMemo(
    () => ladder({ frame, epic: epic ?? '', cards, fits, shown, measure, note: brief }),
    [frame, epic, cards, fits, shown, measure, brief],
  )

  const at = Math.min(Math.max(shown, 0), Math.max(0, cards.length - 1))
  /* The chips, decided by the same number that decided whether the question is
     on screen above them. `rungs.header` is zero when no header was drawn —
     because the question is longer than the header's ceiling, or because drawing
     one would have cost the reader their last whole option — and a question that
     is not on screen is a question that needs a chip leading to it. */
  const parts = useMemo<Part[]>(() => {
    const card = cards[at]
    return card ? partsOf(card, rungs.header) : []
  }, [cards, at, rungs.header])

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
        /*
         * And the reader stays exactly where they are.
         *
         * This line used to be `setPart('question')`, because the verdict and the
         * explanation were both drawn on the `question` part and a press that
         * earned them had to lead somewhere. Both halves of that have changed:
         * the verdict is now drawn with the OPTIONS, which is the screen the
         * reader is already standing on, and the explanation has a part of its
         * own with a chip that appears the moment it exists.
         *
         * So there is nothing left to move them for, and moving them would be the
         * page changing under somebody who was still looking at the option they
         * chose — the complaint this whole ladder keeps being corrected by. What
         * a press does now is change the screen they are on: the badge appears,
         * their choice and the key are marked, and a fourth chip shows up in the
         * row saying there is an explanation to read when they want it.
         */
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
      /* A missing document is not pointed at. The card draws no press for it
         — `view/quiz.tsx` — and this is the same rule from the other side,
         because "unreachable" is a property of a layout somebody may change. */
      if (question.anchor === 'missing') return
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
  const pointed = pointedQuestion(projectPath, visible, passage)

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

  /*
   * Ask the host for the height this page actually is. The observer is
   * re-attached on every render deliberately: the alternative is a dependency
   * list that has to name everything that can change the page's height, which is
   * a list somebody will forget to add to.
   *
   * ## What the pinned card body would have done to this, and why it does not
   *
   * At the paged rungs the card is drawn in a box of exactly `ladder.available`
   * pixels so that the row of controls under it cannot move — see the essay in
   * `view/quiz.tsx`. That box is a function of the frame, and this message asks
   * the host to CHANGE the frame: `modules-client.ts` answers it with
   * `frame.style.height = height`, so measuring the pinned page and asking for
   * sixteen more than it would be a request to grow by sixteen pixels, forever,
   * once per animation frame.
   *
   * So the pinning is undone in the arithmetic. What is reported is the height
   * this page would be if the body were not a scroller — its own box, less the
   * box the card was given, plus the card's real height — which is the same
   * number this line reported before the body was pinned, in every case. The
   * host's side of the conversation is therefore untouched by this fix: pinning
   * decides how the page draws INSIDE the box it has, and never what box it
   * asks for.
   *
   * The inner element is observed as well, and it has to be: with the body
   * pinned the shell's own box no longer changes when the reader switches
   * parts, so an observer watching only the shell would go on reporting the
   * height of a part they left.
   */
  const shell = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = shell.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const inner = node.querySelector('[data-body="pinned"] > *')
    const tell = () => {
      const body = inner?.parentElement
      const pinned = body && inner ? inner.getBoundingClientRect().height - body.getBoundingClientRect().height : 0
      resize(Math.ceil(node.getBoundingClientRect().height + pinned) + 16)
    }
    const watch = new ResizeObserver(tell)
    watch.observe(node)
    if (inner) watch.observe(inner)
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
   *
   * ## And it is `rungs.snap`, not `fits.snap`
   *
   * That comment above is also the reconciliation the ladder needed. Snapping
   * was never a mechanism for making a card fit; it was a mechanism for making a
   * LIST of cards land where a reader could read one, in a box too short to hold
   * two. The ladder's top rung is that list, and snapping is still on for it.
   *
   * At `one` and `part` there is no list and nothing to scroll — the whole point
   * of those rungs — so a snap point there is a rule about a gesture nobody can
   * make. Worse than idle: a document that overruns its box by a few pixels
   * would have `proximity` drag the reader to a boundary they did not ask for,
   * on a screen that was supposed to have nothing to scroll. So it goes off, and
   * it goes off in `ladder()` rather than here, where the table can assert it.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.snap = rungs.snap ? 'on' : 'off'
    return () => {
      delete root.dataset.snap
    }
  }, [rungs.snap])

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
        questions={visible}
        /* What the narrowing hid, in this module's own words. Drawn in the page
           because the host cannot count rows it does not render. */
        hiding={hiding}
        aimed={emptied}
        onAnswer={(id, chose) => void onAnswer(id, chose)}
        onPoint={onPoint}
        pointed={pointed}
        onRetake={() => void onRetake()}
        trouble={trouble}
        busy={busy}
        room={fits}
        ladder={rungs}
        parts={parts}
        shown={at}
        onShow={show}
        part={part}
        onPart={setPart}
      />
    )

  return (
    <div
      ref={shell}
      data-rung={rungs.rung}
      className="flex min-w-0 flex-col gap-2 p-2 text-foreground @sm/container:p-3"
    >
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
