import { useEffect, useRef, useState } from 'react'

import type { Asked } from '@/store/ask.ts'
import type { Room } from '@/view/room.ts'
import { sourceLabel } from '@/wire/pointed.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'

/**
 * The passage, given the whole frame.
 *
 * ## Why this stopped being a `<details>` in a short container
 *
 * It still is one where there is room — see `QuestionCard`. What it cannot be in
 * a box 300 pixels tall is a disclosure that grows in place: the passage is a
 * paragraph of somebody's LaTeX, so opening it inline pushes the options the
 * reader was looking at off the top of a box that only held one card to begin
 * with, and closing it drops them somewhere they did not ask to be. The gesture
 * costs the reader their place both ways.
 *
 * `position: fixed` inside a frame IS the frame, so this fills exactly the box
 * the canvas gave the module and nothing outside it. The card underneath does
 * not move, so closing puts the reader back where they were, to the pixel.
 *
 * What is genuinely lost: a `<details>` is one node in the accessibility tree
 * and needs no JavaScript, and this is a dialog that needs both. That is paid
 * for deliberately, and only where the geometry demands it — `room()` returns
 * `passage: 'inline'` the moment there is height for the honest version.
 */
function PassagePanel({ question, onClose }: { question: Asked; onClose: () => void }) {
  const close = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    close.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="the passage this question is about"
      data-passage-panel="open"
      className="fixed inset-0 z-50 flex min-w-0 flex-col gap-1.5 overflow-y-auto bg-background p-2 @sm/container:p-3"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 text-[0.65rem] leading-4 text-muted-foreground">
          <code className="[overflow-wrap:anywhere]">{question.passage.path}</code>
          {' · bytes '}
          {question.passage.start}–{question.passage.end}
        </p>
        <Button
          ref={close}
          type="button"
          size="container"
          variant="outline"
          className="shrink-0 whitespace-nowrap"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      <blockquote className="min-w-0 border-l-2 border-quote/50 pl-2 text-[0.72rem] leading-5 text-quote [overflow-wrap:anywhere]">
        {question.passage.quote}
      </blockquote>
    </div>
  )
}

/**
 * One question, and the whole of the answer-visibility decision as it appears on
 * screen.
 *
 * ## What is in the DOM before the reader has chosen
 *
 * The question, the options, and the passage. **Nothing else.** There is no
 * hidden element, no `data-correct` attribute, no class that differs between the
 * right option and the wrong ones, and no ordering that gives it away — the
 * options are drawn in the order the author wrote them, which is the order they
 * are stored in and the order every reader sees.
 *
 * That is not achieved by being careful in this component. It is achieved by
 * this component NOT HAVING the answer: `Asked.answer` is `null` for a question
 * with no attempts, because the server never sent one. There is no version of
 * this file, however carelessly edited, that could leak a key it was not given.
 * See `asked` in `quiz/questions.ts`.
 *
 * ## What happens when they press one
 *
 * The press goes to the server, which grades it and sends back the verdict, the
 * key and the explanation. So the round trip is not a formality that could be
 * short-circuited for responsiveness — it is where the answer comes from. A
 * pending state is shown rather than an optimistic one, for the plain reason
 * that there is nothing to be optimistic with.
 *
 * ## What folds away when the box is short
 *
 * Three things, decided in `view/room.ts` rather than here, and all of them
 * still reachable: the byline moves into the card's `title`, the passage becomes
 * an overlay instead of a disclosure that grows in place, and on an ALREADY
 * ANSWERED card the options that were neither chosen nor correct go behind one
 * press. Nothing folds on a card nobody has answered — the options ARE the
 * question, and a question you have to unfold to read is not a shorter card, it
 * is a broken one.
 *
 * ## Which press points the canvas, and why it is not the card
 *
 * The notes module makes the whole row pressable, and then has to exclude the
 * controls inside it — `closest('button, a, textarea, input, form')` — because a
 * row that publishes a passage when anything in it is clicked publishes one when
 * somebody presses a button.
 *
 * That shape cannot be borrowed here. This card is almost entirely controls:
 * between two and eight answer buttons, an unfold, a passage disclosure. A
 * pressable card would mean a person choosing an option was one mis-aimed pixel
 * away from moving every other container on the canvas, and the mis-aim would be
 * silent — the option would simply not register and the paper would jump. So the
 * press is a small, explicit, single-purpose control, and choosing an answer
 * cannot be mistaken for asking to be shown the source because they are
 * different elements with different labels.
 *
 * That control is the passage affordance that was already on the card, relabelled
 * with the source it leads to. It was a summary reading "the passage this is
 * about", which is a description of a mechanism rather than a fact about this
 * question — every card said the same words. It now says the document, so the
 * card tells a reader where it came from, and pressing it does the two things
 * that phrase always meant: show the passage here, and point the canvas at it so
 * whatever is reading that document shows it there.
 *
 * A separate "show it in the paper" button was the alternative and was not
 * taken. It would be a second row of chrome about the passage, in a module whose
 * normal container is 220 pixels wide, for a distinction — "show me here" versus
 * "show me there" — that a reader pressing the name of a document is not making.
 * What it costs is that a person who wants to point again at an already-open
 * passage has to close it first. That is a real cost and a small one, and it is
 * paid to keep one control where two would fit badly.
 */
export function QuestionCard({
  question,
  onAnswer,
  onPoint,
  pointed,
  busy,
  room,
}: {
  question: Asked
  onAnswer: (chose: number) => void
  /** Ask the canvas to stand on this question's passage. Only ever a person's press. */
  onPoint: () => void
  /** Whether the canvas is standing on it now, as the host says. */
  pointed: boolean
  busy: boolean
  room: Room
}) {
  const [open, setOpen] = useState(false)
  const [others, setOthers] = useState(false)
  const last = question.attempts.at(-1)
  const answered = last !== undefined
  /* Both are null together and only ever arrive together. The second half of the
     condition is what tells TypeScript that, and it is also a real check: a
     server that answered `attempts: [...]` with `answer: null` would be a bug,
     and drawing the card as unanswered is the safe way to be wrong about it. */
  const key = answered && question.answer !== null ? question.answer : null

  const wrote = `written by ${question.by}${question.viaMcp ? ', over MCP' : ''}`

  /* The document this question came from, at the length the box has room for —
     decided in `view/room.ts`, spelled in `wire/pointed.ts`. The full path is in
     the control's title at every size, so the short form defers it rather than
     hiding it. */
  const source = sourceLabel(question.passage.path, room.source)
  const about = pointed
    ? `the canvas is pointed at this passage of ${question.passage.path}`
    : `${question.passage.path}, bytes ${question.passage.start}–${question.passage.end} — show it, here and wherever `
      + 'this document is open on the canvas'

  /* Only ever true on an answered card, and only for options that are neither
     the key nor the one that was pressed. */
  const folding = room.others === 'folded' && answered && !others
  const spare = folding
    ? question.options.filter((_, index) => index !== last?.chose && index !== key).length
    : 0

  return (
    /*
      The mark, which is what makes the press legible.

      Without it the only evidence that pressing a source did anything is in
      another container — and if that container is not on the canvas, or is
      showing another document, or the host refused, there is no evidence
      anywhere and the press reads as broken. `aria-current` carries the same
      fact to a reader who is not looking at colour, and the source control
      below stops being muted and grey, so the state is said in weight as well
      as in hue. Every other state on this card is said in words for the same
      reason; this one has no word to spare in a 220-pixel column, so it is said
      in two channels that are not colour instead.
    */
    <li
      data-question={question.id}
      data-answered={answered ? 'yes' : 'no'}
      data-pointed={pointed ? 'yes' : 'no'}
      aria-current={pointed ? 'location' : undefined}
      title={room.byline === 'title' ? wrote : undefined}
      className={
        pointed
          ? 'min-w-0 snap-start rounded border border-pointed bg-pointed/5 p-2 ring-1 ring-pointed/50 @sm/container:p-2.5'
          : 'min-w-0 snap-start rounded border bg-card p-2 @sm/container:p-2.5'
      }
    >
      <p className="text-[0.78rem] leading-5 font-medium @sm/container:text-[0.85rem] @sm/container:leading-6">
        {question.question}
      </p>

      <ul className="mt-1.5 flex min-w-0 flex-col gap-1">
        {question.options.map((option, index) => {
          const chosen = last?.chose === index
          const correct = key !== null && key === index
          if (folding && !chosen && !correct) return null
          return (
            <li key={index} className="min-w-0">
              <Button
                type="button"
                size="option"
                variant={correct ? 'default' : chosen ? 'outline' : 'outline'}
                disabled={busy || answered}
                onClick={() => onAnswer(index)}
                /*
                 * `data-correct` exists ONLY once a key has arrived, and it is
                 * the attribute the visibility test asserts on. Rendering it as
                 * `data-correct="false"` on the others would have been tidier
                 * and would have told anybody counting attributes exactly where
                 * the answer was, before it was earned.
                 */
                {...(correct ? { 'data-correct': 'true' } : {})}
                {...(chosen ? { 'data-chose': 'true' } : {})}
                className={
                  correct
                    ? 'border-right bg-right/15 text-foreground hover:bg-right/15'
                    : chosen
                      ? 'border-wrong bg-wrong/10 text-foreground'
                      : answered
                        ? 'opacity-60'
                        : ''
                }
              >
                {option}
              </Button>
            </li>
          )
        })}
      </ul>

      {spare ? (
        <button
          type="button"
          data-unfold="options"
          onClick={() => setOthers(true)}
          className="mt-1 text-[0.65rem] text-muted-foreground underline-offset-2 hover:underline"
        >
          {spare === 1 ? 'the option you passed over' : `the ${spare} options you passed over`}
        </button>
      ) : null}

      {answered ? (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
          <Badge nowrap variant={last.right ? 'right' : 'wrong'}>
            {last.right ? 'right' : 'wrong'}
          </Badge>
          {question.attempts.length > 1 ? (
            <span className="text-[0.65rem] text-muted-foreground">
              {question.attempts.length} attempts
            </span>
          ) : null}
        </div>
      ) : null}

      {answered && question.why ? (
        <p className="mt-1.5 border-l-2 border-border pl-2 text-[0.7rem] leading-4 text-muted-foreground">
          {question.why}
        </p>
      ) : null}

      {/*
        The passage, two ways, and the choice is geometry rather than taste.

        Open by default it would be the largest thing on the card and would push
        the options off the first screen of a 220px container; absent it would be
        the module's whole claim left unshown. A disclosure is the honest middle,
        and where there is height for it this is still a real `<details>` — one
        element in the accessibility tree, working with no JavaScript at all.

        In a box too short to hold one card, a disclosure that grows in place
        costs the reader their scroll position twice. There it becomes a press
        that fills the frame instead. See `PassagePanel`.

        Both spellings now also POINT, and the two do it at slightly different
        moments for one reason. The overlay is a button that only ever opens —
        `Close` is a separate control inside the panel — so its press is
        unambiguously "show me this". The disclosure toggles, and closing it is
        not a request to be shown anything, so the publish hangs off the
        summary's own click and only in the direction that opens.

        Deliberately NOT `onToggle`: a `<details>` can be opened by something
        other than a press. Chrome expands a closed one when find-in-page
        matches text inside it, and a browser searching a page is not a person
        asking every container on the canvas to move. `passage:set` was declared
        under a bound that says a person presses; a handler that fires on a
        find would be that bound quietly broken, and broken in a way nothing on
        screen would show.
      */}
      {room.passage === 'overlay' ? (
        <>
          <button
            type="button"
            data-passage="button"
            data-source={question.passage.path}
            title={about}
            onClick={() => {
              setOpen(true)
              onPoint()
            }}
            className={
              pointed
                ? 'mt-1.5 block min-w-0 text-[0.65rem] font-medium text-foreground underline underline-offset-2 [overflow-wrap:anywhere]'
                : 'mt-1.5 block min-w-0 text-[0.65rem] text-muted-foreground underline-offset-2 [overflow-wrap:anywhere] hover:underline'
            }
          >
            {source}
          </button>
          {open ? <PassagePanel question={question} onClose={() => setOpen(false)} /> : null}
        </>
      ) : (
        <details
          open={open}
          onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
          className="mt-1.5 min-w-0"
        >
          <summary
            data-passage="summary"
            data-source={question.passage.path}
            title={about}
            onClick={() => {
              /* The state before the browser toggles it, so this is "about to
                 open". Closing publishes nothing. */
              if (!open) onPoint()
            }}
            className={
              pointed
                ? 'min-w-0 cursor-pointer text-[0.65rem] font-medium text-foreground [overflow-wrap:anywhere]'
                : 'min-w-0 cursor-pointer text-[0.65rem] text-muted-foreground [overflow-wrap:anywhere]'
            }
          >
            {source}
          </summary>
          {/*
            The path is only repeated here where the summary above did not say
            it. At the widths that get the whole path, printing it twice inside
            one card is 48 characters of grey said again for no reader's
            benefit; at the widths that get only the file name, this is where
            the rest of it lives, which is what makes the short label a deferral
            rather than a loss.
          */}
          <p className="mt-1 text-[0.65rem] leading-4 text-muted-foreground">
            {room.source === 'path' ? null : (
              <>
                <code className="[overflow-wrap:anywhere]">{question.passage.path}</code>
                {' · '}
              </>
            )}
            {'bytes '}
            {question.passage.start}–{question.passage.end}
          </p>
          <blockquote className="mt-1 border-l-2 border-quote/50 pl-2 text-[0.7rem] leading-4 text-quote [overflow-wrap:anywhere]">
            {question.passage.quote}
          </blockquote>
        </details>
      )}

      {room.byline === 'row' ? (
        <p className="mt-1 text-[0.6rem] leading-3 text-muted-foreground">{wrote}</p>
      ) : null}
    </li>
  )
}

/**
 * One epic's questions, with the score and the way to ask them again.
 *
 * The score says all three numbers — asked, answered, right — rather than a
 * percentage, because a percentage of two questions is a number that sounds like
 * it means something. It stays at every size: it is one line even at 220 pixels
 * and it is the first thing a reader coming back wants.
 */
export function QuizView({
  epic,
  questions,
  onAnswer,
  onPoint,
  pointed,
  onRetake,
  trouble,
  busy,
  room,
}: {
  epic: string
  questions: Asked[]
  onAnswer: (id: string, chose: number) => void
  /** A person pressed a question's source. Nothing else may call this. */
  onPoint: (id: string) => void
  /**
   * The question the canvas is standing on, or null.
   *
   * One id rather than a set, and it is worked out in `wire/pointed.ts` from the
   * context rather than from a memory of what this page asked for. Two questions
   * written about the same passage would both be true answers; the pure function
   * takes the first, and its essay says why that is a caller's problem rather
   * than a fudge.
   */
  pointed: string | null
  onRetake: () => void
  trouble: string | null
  busy: boolean
  room: Room
}) {
  const answered = questions.filter((question) => question.attempts.length).length
  const right = questions.filter((question) => question.attempts.at(-1)?.right).length

  if (!questions.length) {
    return (
      <section className="flex min-w-0 flex-col gap-1.5">
        <h2 className="text-[0.8rem] font-semibold [overflow-wrap:anywhere] @sm/container:text-sm">{epic}</h2>
        <p className="text-[0.7rem] leading-4 text-muted-foreground">
          Nothing has been asked about this paper yet. An agent writes the questions, with <code>add_quiz</code>.
        </p>
      </section>
    )
  }

  /*
   * The note under "Ask these again", which is a warning about a rare press and
   * three lines long in a 220px column. It is true and it matters — retaking
   * puts the keys back out of REACH rather than out of sight — so it is not
   * deleted; where there is no height for it, it is the button's `title`.
   */
  const note =
    'Forgets what you answered for this paper, here and on the wire — the correct options go back out of reach rather than merely out of sight.'

  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      {/*
        `snap-start` on the heading and not only on the cards, and it is a fix
        rather than a flourish.

        A scroller with `scroll-snap-type` comes to rest on a snap point after
        every layout, including the first one. With the cards as the only snap
        points, the nearest one to the top of the document is the first card —
        which is 38 pixels down — so the page loaded already scrolled, with the
        paper's name and the score pushed off the top of a 300-pixel box before
        the reader had touched anything. Making the heading a snap point makes
        scroll position zero a legal place to rest.
      */}
      <div className="flex min-w-0 snap-start flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[0.8rem] font-semibold [overflow-wrap:anywhere] @sm/container:text-sm">{epic}</h2>
        <span className="text-[0.65rem] text-muted-foreground">
          {questions.length} asked · {answered} answered · {right} right
        </span>
      </div>

      {trouble ? (
        <p className="rounded border border-wrong/40 bg-wrong/5 px-2 py-1.5 text-[0.7rem] leading-4 text-wrong">
          {trouble}
        </p>
      ) : null}

      <ul className="flex min-w-0 flex-col gap-1.5">
        {questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            busy={busy}
            room={room}
            pointed={pointed === question.id}
            onAnswer={(chose) => onAnswer(question.id, chose)}
            onPoint={() => onPoint(question.id)}
          />
        ))}
      </ul>

      {answered ? (
        <div className="min-w-0">
          <Button
            type="button"
            size="container"
            variant="ghost"
            className="whitespace-nowrap"
            disabled={busy}
            onClick={onRetake}
            title={room.retakeNote === 'title' ? note : undefined}
          >
            Ask these again
          </Button>
          {room.retakeNote === 'paragraph' ? (
            <p className="mt-0.5 text-[0.6rem] leading-3 text-muted-foreground">{note}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
