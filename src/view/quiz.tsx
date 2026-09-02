import { useEffect, useRef, useState } from 'react'

import type { Asked } from '@/store/ask.ts'
import type { Ladder, Part, Room } from '@/view/room.ts'
import { PART_LABEL } from '@/view/room.ts'
import { sourceLabel } from '@/wire/pointed.ts'
import type { Hidden } from '@/wire/scope.ts'
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
 * ## Three shapes, not one, and the rung decides which
 *
 * `view.rung` comes from `ladder()` in `view/room.ts` and this component draws
 * one of three things:
 *
 * - `list` — the card as it has always been: bordered, padded, one of several,
 *   with the passage behind a disclosure.
 * - `one` — the same question with **no card chrome at all** and the passage
 *   OPEN. It is the only thing on screen, so a border around it would be a card
 *   inside the container the host already draws — which is the owner's
 *   complaint, and none of the sibling modules do it. Dropping the border and
 *   the padding returns 18 pixels in each axis, and 18 pixels of width at 220 is
 *   a wrapped line back in every option.
 * - `part` — one of `question`, `options` and `quote`, chosen by the switcher in
 *   the row below, with the question above it as a header where there is room
 *   for the whole of it and nowhere else.
 *
 * ### The header is what makes `part` answerable — until it is what makes it unanswerable
 *
 * A multiple-choice question you cannot read is not a question. If `options`
 * were a part shown on its own, the reader would be choosing between four
 * phrases with nothing on screen saying what they are answers TO. So the
 * question text is drawn above every part, and `dev/ladder.mjs` presses an
 * option at 220×300 and 320×200 with nothing scrolled and asserts the reader
 * could tell what they were answering while it did.
 *
 * That was `line-clamp-2`, and the clamp was the bug. At the tightest sizes it
 * drew two lines of a seven-line question, put an ellipsis on the end, and took
 * forty-six pixels off the options — a fragment of a sentence AND less room to
 * answer in. The rule above survives; the clamp does not. `headerOf()` in
 * `view/room.ts` now draws the header only where the WHOLE question fits in two
 * lines and there is still room beneath it for the source control and one whole
 * option, and draws nothing otherwise. A question with no header is exactly a
 * question with a `question` chip, because `partsOf()` reads the same number, so
 * "you cannot read it here" and "here is where to read it" are one decision.
 *
 * ### And the press that points the canvas survives the split
 *
 * The source control is drawn on EVERY part, not only on the one that shows the
 * quote. It is one 16-pixel line and it is the only element on this card that
 * publishes anything, so putting it behind a chip would mean the reader had to
 * navigate to a part in order to reach a control that moves the whole canvas.
 * Switching parts publishes nothing — the chips are in `QuizView` and call
 * nothing but `setState`, which is what `dev/pointing.mjs` counts.
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
  rung = 'list',
  part = null,
  header = 0,
  estimate = 0,
}: {
  question: Asked
  onAnswer: (chose: number) => void
  /** Ask the canvas to stand on this question's passage. Only ever a person's press. */
  onPoint: () => void
  /** Whether the canvas is standing on it now, as the host says. */
  pointed: boolean
  busy: boolean
  room: Room
  /**
   * Which of the three shapes to draw. See the essay above.
   *
   * Optional, and it defaults to `list` — the shape this card has always had.
   * That is not laziness about a required prop: a card asked to draw itself
   * with no opinion about the ladder should draw the whole, bordered, ordinary
   * thing, which is what every one of the render tests wants and what a caller
   * that has not measured anything yet should get.
   */
  rung?: Ladder['rung']
  /** Which piece is showing, at `part` and nowhere else. */
  part?: Part | null
  /**
   * How many lines of the question stand above that piece — and zero means no
   * header at all, which is a real and common answer.
   *
   * Decided in `headerOf()` in `view/room.ts` against the room this card was
   * given, never here. It is a number of LINES rather than a boolean because the
   * only header this card will draw is one the whole question fits in: the
   * element carries no clamp, so what the number says is "the question is this
   * tall, and there is room for it", and the alternative to a number that means
   * that is a truncation nothing on screen can show.
   *
   * Defaults to 0, like every other ladder prop defaults to the list: a caller
   * that has measured nothing is a caller drawing the whole card, where the
   * question is the card's first line anyway and this is never consulted.
   */
  header?: number
  /**
   * What `ladder()` estimated this card would need, in pixels.
   *
   * Written into the DOM so it can be checked. The whole layout below hangs off
   * a number computed before the thing it describes exists, which is the failure
   * mode this workspace has spent a day on — so `dev/ladder.mjs` reads this
   * attribute, measures the card beside it, and fails the build if the estimate
   * ever came in UNDER the truth. An estimate nobody can falsify is a guess with
   * a comment on it.
   */
  estimate?: number
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

  /*
   * Which pieces this rendering draws.
   *
   * `paged` is `one` or `part` — the two rungs where this card is the only one
   * on screen, and therefore the two where it carries no border, no background
   * and no padding of its own. `part === null` means the whole question, which
   * is true at `list` and at `one` alike; the difference between those two is
   * the chrome and whether the passage is behind a disclosure.
   */
  const paged = rung !== 'list'
  const whole = part === null
  const showOptions = whole || part === 'options'
  const showQuote = paged && (whole || part === 'quote')
  /*
   * Whether this drawing of the question is a HEADER above another part rather
   * than the question itself — and, if it is, whether there was room for one.
   *
   * The header is what makes a screen of bare options answerable, so it is drawn
   * wherever it can be. What it is never allowed to be is a fragment: `header` is
   * a line count the whole question fits inside, or it is zero, and zero means
   * the question is not drawn here at all and the `question` chip is the way to
   * it. `headerOf()` in `view/room.ts` carries the whole argument, including why
   * two lines of a seven-line question was worse than none.
   */
  const heading = part !== null && part !== 'question'
  const showQuestion = !heading || header > 0
  /*
   * The two halves of what answering earns you, and they are drawn in two
   * different places now.
   *
   * The VERDICT stays with the options: "right" or "wrong" is about the button
   * that was just pressed, the marks on the options say which one was which, and
   * splitting a judgement from the thing it judges is how you get a reader
   * pressing a chip to find out what they already did. So a press changes the
   * screen the reader is standing on rather than moving them.
   *
   * The EXPLANATION goes to its own part, which is the owner's call and is right
   * for a reason the rest of this file keeps running into: it is prose, it is the
   * longest thing a card holds, and it does not exist until it is earned. On the
   * `question` part — where both of these used to go — it made that part mean two
   * things and pushed the question itself off a 300-pixel box. On its own part it
   * is sized by nothing but itself.
   *
   * Whole, both are simply drawn: there are no parts at `list` or `one`, and the
   * card reads question, options, verdict, explanation, passage, top to bottom.
   */
  const showVerdict = answered && (whole || part === 'options')
  const showWhy = answered && question.why !== null && (whole || part === 'why')

  /*
   * Whether there is anything to point at.
   *
   * A question whose document is not in the project — `quiz/where.ts`, and
   * the eighteen real questions it was written against — used to be drawn
   * with the same press as every other card, and the press pointed the canvas
   * at a file that does not exist. Nothing reacted, and nothing said why. So
   * a missing anchor is not a button: it is the same label, with the sentence
   * that explains it in its title and beside it, and no handler. The path is
   * still on `data-source`, because it is still a fact about the question.
   */
  const missing = question.anchor === 'missing'

  const about = missing
    ? `${question.passage.path} is not in this project — the anchor does not resolve, so there is nothing to point `
      + 'the canvas at. An agent re-anchors it with reword_quiz.'
    : pointed
      ? `the canvas is pointed at this passage of ${question.passage.path}`
      : paged
        ? `${question.passage.path}, bytes ${question.passage.start}–${question.passage.end} — point the canvas `
          + 'at it, wherever this document is open'
        : `${question.passage.path}, bytes ${question.passage.start}–${question.passage.end} — show it, here and wherever `
          + 'this document is open on the canvas'

  /* Only ever true on an answered card in the LIST, and only for options that
     are neither the key nor the one that was pressed. Paged, the options are
     either the whole point of the screen or the whole of a part, and folding
     the reader's own choices away on a screen that exists to show them would be
     saving pixels nobody asked to save. */
  const folding = rung === 'list' && room.others === 'folded' && answered && !others
  const spare = folding
    ? question.options.filter((_, index) => index !== last?.chose && index !== key).length
    : 0

  /*
   * The control that points the canvas, held in a variable because it is drawn
   * in two different places and the difference is a fix rather than a taste.
   *
   * At `one` it sits where it has always sat — at the foot of the card,
   * introducing the quote below it. At `part` it moves to directly under the
   * question, ABOVE whichever part is showing, and the reason is measured: eight
   * options at 220 wide are 516 pixels of buttons in a 254-pixel box, so the
   * `options` part genuinely overflows and everything drawn after it goes with
   * it. The probe found exactly that — "on the long question, the source control
   * is unreachable without a long scroll" — and a capability that is only
   * reachable after a 321-pixel scroll is a capability a reader will not find.
   *
   * Above the part it costs nothing: it is one 16-pixel line either way, and the
   * order reads as a caption on the question rather than a footer on the card.
   */
  const sourceControl = missing ? (
    <span
      data-passage="missing"
      data-source={question.passage.path}
      title={about}
      className="mt-1.5 block min-w-0 text-[0.65rem] text-wrong [overflow-wrap:anywhere]"
    >
      {source} — not in this project
    </span>
  ) : (
    <button
      type="button"
      data-passage="button"
      data-source={question.passage.path}
      title={about}
      onClick={onPoint}
      className={
        pointed
          ? 'mt-1.5 block min-w-0 text-[0.65rem] font-medium text-foreground underline underline-offset-2 [overflow-wrap:anywhere]'
          : 'mt-1.5 block min-w-0 text-[0.65rem] text-muted-foreground underline-offset-2 [overflow-wrap:anywhere] hover:underline'
      }
    >
      {source}
    </button>
  )

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
      data-rung={rung}
      data-estimate={estimate}
      aria-current={pointed ? 'location' : undefined}
      title={paged || room.byline === 'title' ? wrote : undefined}
      className={
        /*
          Paged, there is no card: no border, no background, no radius and no
          padding, because the host already draws a container around this module
          and a second one inside it is a card on a card. What is left of the
          mark is a tint, hung on a negative margin with the same padding back
          again so that turning it on cannot rewrap a single line of the question
          underneath it — the pointed and unpointed cards are the same width to
          the pixel, which is what keeps `ladder()`'s estimate true either way.
        */
        rung !== 'list'
          ? pointed
            ? 'min-w-0 -mx-1 rounded bg-pointed/5 px-1'
            : 'min-w-0'
          : pointed
            ? 'min-w-0 snap-start rounded border border-pointed bg-pointed/5 p-2 ring-1 ring-pointed/50 @sm/container:p-2.5'
            : 'min-w-0 snap-start rounded border bg-card p-2 @sm/container:p-2.5'
      }
    >
      {/*
        The question, whole or not at all.

        There is no `line-clamp` here any more and its absence is the fix. It
        used to be `line-clamp-2` above every part that is not the question,
        which drew two lines of a seven-line question with an ellipsis on the
        end — a fragment of a sentence, and forty-six pixels the options did not
        get. The owner's words for it: "it's still showing the question
        partially when there's only space for the options."

        So the deciding moved to `headerOf()` in `view/room.ts`, where it can be
        made against the measured box and asserted in a test, and what arrives
        here is a line count the whole question is known to fit in. With no clamp
        in the class list a truncated header is not a thing this component can
        draw: if the estimate is ever wrong the header is a line taller than
        planned, which is visible and is measured, rather than a sentence quietly
        cut off, which is not.

        `data-question-text` says which of the two drawings this is — `whole` for
        the question on its own screen, `header` for the same text standing above
        another part. Both are the entire sentence. Its ABSENCE is the third
        state and the new one: no room for a header, and the `question` chip is
        how the reader reads it.
      */}
      {showQuestion ? (
        <p
          data-question-text={heading ? 'header' : 'whole'}
          className="text-[0.78rem] leading-5 font-medium @sm/container:text-[0.85rem] @sm/container:leading-6"
        >
          {question.question}
        </p>
      ) : null}

      {rung === 'part' ? sourceControl : null}

      <ul className={showOptions ? 'mt-1.5 flex min-w-0 flex-col gap-1' : 'hidden'}>
        {!showOptions ? null : question.options.map((option, index) => {
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

      {showVerdict ? (
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

      {showWhy && question.why ? (
        <p
          data-why="shown"
          className="mt-1.5 border-l-2 border-border pl-2 text-[0.7rem] leading-4 text-muted-foreground"
        >
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
      {paged ? (
        /*
          Paged, there is no disclosure and no overlay: either the quote is
          already on screen (`one`, and the `quote` part) or it is one chip away,
          and a press that opened a panel over a card the reader is looking at
          would be a third way of showing one paragraph.

          So this control does exactly one thing — it points the canvas — and it
          is drawn on EVERY part rather than only on the one that shows the
          quote. It is the only element on this card that publishes anything,
          and a publish behind a navigation is a publish a reader has to hunt
          for. Sixteen pixels, on every screen, deliberately.
        */
        <>
          {/* At `part` it was already drawn, above the part — see `sourceControl`. */}
          {rung === 'part' ? null : sourceControl}
          {showQuote ? (
            <>
              {/*
                The byte range, and NOT the path — which is the difference from
                the disclosure below, and it is two decisions rather than one.

                The first is space. Repeating a 48-character path here inside a
                `<code>` costs three lines of grey monospace at 220 wide and two
                at 260, above the quote the reader pressed to see, on the two
                rungs where every row is contested. The path is on the control
                immediately above this — whole where there is width for it, as a
                file name where there is not — and that control's `title` carries
                all of it at every size. So this is a deferral by one hover,
                which is the same trade the short source label already makes.

                The second is that the path made `ladder()` unpredictable. A path
                is one long token in a monospace face and the browser breaks it
                at slashes, at hyphens, and mid-word as it sees fit: measured
                three lines in a 244-pixel column where char-filling,
                slash-breaking and hyphen-breaking models every one said two.
                That was the single largest error in the estimate this whole
                layout hangs off, and it is the only element on the card whose
                height this file could not predict. `bytes 1024–1180` is fifteen
                characters of the body face and is one line in every box this
                module is ever given.
              */}
              <p className="mt-1 text-[0.65rem] leading-4 text-muted-foreground">
                {'bytes '}
                {question.passage.start}–{question.passage.end}
              </p>
              <blockquote className="mt-1 border-l-2 border-quote/50 pl-2 text-[0.7rem] leading-4 text-quote [overflow-wrap:anywhere]">
                {question.passage.quote}
              </blockquote>
            </>
          ) : null}
        </>
      ) : room.passage === 'overlay' ? (
        <>
          <button
            type="button"
            data-passage={missing ? 'missing' : 'button'}
            data-source={question.passage.path}
            title={about}
            onClick={() => {
              setOpen(true)
              /* The quote is still worth reading — it is what the question is
                 about — but there is nothing to point the canvas at. */
              if (!missing) onPoint()
            }}
            className={
              missing
                ? 'mt-1.5 block min-w-0 text-[0.65rem] text-wrong underline-offset-2 [overflow-wrap:anywhere] hover:underline'
                : pointed
                  ? 'mt-1.5 block min-w-0 text-[0.65rem] font-medium text-foreground underline underline-offset-2 [overflow-wrap:anywhere]'
                  : 'mt-1.5 block min-w-0 text-[0.65rem] text-muted-foreground underline-offset-2 [overflow-wrap:anywhere] hover:underline'
            }
          >
            {source}
            {missing ? ' — not in this project' : null}
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
            data-passage={missing ? 'missing' : 'summary'}
            data-source={question.passage.path}
            title={about}
            onClick={() => {
              /* The state before the browser toggles it, so this is "about to
                 open". Closing publishes nothing, and neither does a document
                 that is not there. */
              if (!open && !missing) onPoint()
            }}
            className={
              missing
                ? 'min-w-0 cursor-pointer text-[0.65rem] text-wrong [overflow-wrap:anywhere]'
                : pointed
                  ? 'min-w-0 cursor-pointer text-[0.65rem] font-medium text-foreground [overflow-wrap:anywhere]'
                  : 'min-w-0 cursor-pointer text-[0.65rem] text-muted-foreground [overflow-wrap:anywhere]'
            }
          >
            {source}
            {missing ? ' — not in this project' : null}
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

      {/* Paged, the byline is always the element's `title`: it is a fact almost
          nobody is looking for, and the two rungs that page are the two where
          every row is contested. */}
      {!paged && room.byline === 'row' ? (
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
 *
 * ## Two shapes: a list, and one question with a row of controls under it
 *
 * At `list` this is what it has always been — a heading, then every card, then
 * "Ask these again". At `one` and `part` there is no heading block at all, and
 * one row under the single card carries everything: which question of how many,
 * the way to the next and the previous, the part switcher when there is one, the
 * score, and the retake.
 *
 * Dropping the heading there is the largest single piece of space this pass
 * returns. At 220 wide the paper's name and the score wrap to two rows and cost
 * 43 pixels with the gap — 14% of a 300-pixel box — and every card names the
 * document it came from anyway, on its source control, at every size. So the
 * paper is still on screen; it is spelled as `bridge.tex` rather than as the
 * epic's slug, and the slug is in the row's `title`.
 *
 * The row is reserved whether or not it is full: `controlsHeight()` in
 * `view/room.ts` counts it with every chip and every control, at both paged
 * rungs, so that what the row happens to be showing can never change which rung
 * is being shown. The alternative is a loop with the reader inside it.
 *
 * ## And the row does not move
 *
 * The same instinct, one step further, and it is what the paged shape here is
 * now: a column, of a card body exactly `ladder.available` tall that scrolls
 * inside itself, and the row underneath it. The row used to be simply next in
 * flow, so it rode up and down with the part — 532px on `options` and 160px on
 * `passage` at 220×300, on the one control a reader presses over and over. A
 * control that moves between the look and the press is a control that gets
 * pressed wrong. The essay on the body below carries the rest.
 */
export function QuizView({
  epic,
  questions,
  hiding = null,
  aimed = null,
  onAnswer,
  onPoint,
  pointed,
  onRetake,
  trouble,
  busy,
  room,
  /* All six default to the list, for the same reason `QuestionCard`'s do: a
     caller with no ladder is a caller that has measured nothing, and the list is
     what this view has always drawn. */
  ladder = { rung: 'list', available: 0, heights: [], snap: false, header: 0 },
  parts = ['options', 'quote'],
  shown = 0,
  onShow = () => {},
  part = 'options',
  onPart = () => {},
}: {
  epic: string
  questions: Asked[]
  /**
   * What the scope is hiding, already worded — `3 more questions about other
   * documents` — or null when it is hiding nothing.
   *
   * A string rather than a number and a scope, because the sentence has to stay
   * true to what `narrow()` in `wire/scope.ts` actually did, and the two are read
   * together there. This view's job is to find it a line.
   *
   * It is drawn in the PAGE, and that is the point of it. The scope control lives
   * in the container header now, where the host draws it, and a host cannot count
   * rows it does not render, in a document it cannot read, in a frame on another
   * origin. A container that quietly holds nine questions and shows two, with
   * nothing on screen saying so, is a container that has lost them.
   */
  hiding?: Hidden | null
  /**
   * Why the aim emptied this pane, already worded — `whyEmpty` in
   * `wire/aim.ts` — or null when it did not. Names the picked-out containers,
   * the ones showing nothing, and the questions whose anchors do not resolve,
   * because a pane emptied by a tick on a NEIGHBOUR is a pane whose emptiness
   * has no visible cause otherwise. Drawn before the scope's sentence, since
   * the aim narrows first.
   */
  aimed?: { said: string; remedy: string } | null
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
  /** Which rung, and what each card was estimated at. Decided in `view/room.ts`. */
  ladder?: Ladder
  /** The parts the shown question splits into, at `part`. */
  parts?: Part[]
  /** Which question is being shown, at the paged rungs. Held by `App`. */
  shown?: number
  onShow?: (at: number) => void
  part?: Part
  onPart?: (part: Part) => void
}) {
  const answered = questions.filter((question) => question.attempts.length).length
  const right = questions.filter((question) => question.attempts.at(-1)?.right).length

  if (!questions.length) {
    return (
      <section className="flex min-w-0 flex-col gap-1.5">
        <h2 className="text-[0.8rem] font-semibold [overflow-wrap:anywhere] @sm/container:text-sm">{epic}</h2>
        {/*
          Two empty screens, not one, and telling them apart is the whole reason
          the count is drawn here.

          "Nothing has been asked yet" is a fact about the paper and asks for an
          agent. "The scope you chose has nothing in it" is a fact about a press,
          it is undone by another press, and drawing the first sentence over it
          would be this container blaming an absence on the wrong thing — a reader
          would go looking for questions that are sitting right there.
        */}
        {aimed ? (
          <>
            <p data-aim-note="empty" className="text-[0.7rem] leading-4 text-muted-foreground">
              {aimed.said}
            </p>
            <p data-aim-note="remedy" className="text-[0.65rem] leading-4 text-muted-foreground">
              {aimed.remedy}
            </p>
          </>
        ) : hiding ? (
          <p data-scope-note="empty" className="text-[0.7rem] leading-4 text-muted-foreground">
            Nothing has been asked about this, at the scope this container is set to — {hiding.full}. Widen it in the
            container’s header.
          </p>
        ) : (
          <p className="text-[0.7rem] leading-4 text-muted-foreground">
            Nothing has been asked about this paper yet. An agent writes the questions, with <code>add_quiz</code>.
          </p>
        )}
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

  const score = `${questions.length} asked · ${answered} answered · ${right} right`

  const at = Math.min(Math.max(shown, 0), questions.length - 1)
  const question = questions[at]

  if (ladder.rung !== 'list' && question) {
    const showing = parts.includes(part) ? part : 'options'
    return (
      <section className="flex min-w-0 flex-col gap-1.5">
        {trouble ? (
          <p className="rounded border border-wrong/40 bg-wrong/5 px-2 py-1.5 text-[0.7rem] leading-4 text-wrong">
            {trouble}
          </p>
        ) : null}

        {/*
          The card, in a box of exactly the height the ladder said there was.

          ## The complaint

          "Can we have the navigator component/button group stay put in a way
          that it doesn't go up and down in the component depending on how much
          space the question/options/passage/why takes."

          It was in flow, directly after the card, so it rode up and down with
          whatever the part happened to hold: measured before this, the row sat
          at 532px on `options` and 160px on `passage` at 220×300 — 372 pixels
          apart, on the one control whose entire job is to be pressed over and
          over. A person who looks, then reaches for `passage`, presses `why`,
          because the row moved between the look and the press.

          ## Why a fixed height and not `position: sticky`

          Sticky to the bottom of the viewport would hold the row still on
          screen and would leave it in a different place in the DOCUMENT on
          every part — so a reader who scrolls has the row slide over the
          options underneath it, and the options behind it are unpressable in a
          way nothing on screen explains. A column with a fixed body is the
          honest shape: the part scrolls INSIDE its own box, the box is always
          the same box, and what is below the box is never underneath anything.

          ## And why THIS number

          `ladder.available` is not a new measurement. It is the number that
          decided the rung — the frame, less the page's padding, less the row of
          controls reserved at its widest — so the box drawn here is exactly the
          room the ladder promised the card. That is what keeps the two from
          drifting: if this used any other number, "does the whole question fit"
          and "how tall is the box it is drawn in" would be two answers to one
          question. It does not depend on which part is showing, on which
          question is shown, or on whether anything has been answered, and
          `test/room.test.ts` asserts each of those — which is the whole of this
          fix, stated where it can be checked without a browser.

          Unpinned when it is not positive, which is the unmeasured frame: no
          height, ordinary flow, the shape this had before. A box zero pixels
          tall on the first render would be a card nobody can see.

          ## What it costs, said out loud

          The reservation is for the row at its widest, so a row that is not yet
          full — nothing answered, so no score, no retake and no `why` chip —
          leaves space under itself that the card does not get. Measured at
          220×300: a question that used to just fit now scrolls some fifty
          pixels inside its box, until the first answer fills the row it was
          always going to fill. Lending that space to the card in the meantime
          is exactly the thing being fixed, with an extra step: the card would
          grow, the row would rise, and answering would drop it again under the
          finger of somebody who had just pressed an option.

          One thing genuinely paid for: where the browser draws a classic
          scrollbar rather than an overlay one, this scroller is some fifteen
          pixels narrower than `ladder()` measured the frame to be, so a card
          that overflows may wrap a line more than the estimate expected.
          `dev/ladder.mjs` measures the estimate against the truth on every run
          and would say so.
        */}
        <div
          data-body="pinned"
          style={ladder.available > 0 ? { height: `${Math.round(ladder.available)}px` } : undefined}
          className="min-w-0 overflow-y-auto"
        >
          <ul className="flex min-w-0 flex-col">
            <QuestionCard
              key={question.id}
              question={question}
              busy={busy}
              room={room}
              rung={ladder.rung}
              part={ladder.rung === 'part' ? showing : null}
              header={ladder.header}
              estimate={ladder.heights[at] ?? 0}
              pointed={pointed === question.id}
              onAnswer={(chose) => onAnswer(question.id, chose)}
              onPoint={() => onPoint(question.id)}
            />
          </ul>
        </div>

        {/*
          The one row, and it is deliberately not three rows.

          The owner's standing complaint across this workspace is too much text
          in a narrow column, and a control for moving between parts of a
          question is the easiest place in this module to write a paragraph
          explaining itself. So it is three words, and the words are the names of
          the parts — `question`, `options`, `passage` — which is what a chip has
          to say to be pressable without a legend. What it is FOR is not written
          anywhere on screen, because a reader who presses `passage` and is shown
          the passage has been told.

          `aria-pressed` and not `role="tab"`: a tablist promises arrow-key
          navigation between the tabs and a `tabpanel` to land in, and a half-kept
          promise is worse for somebody navigating by keyboard than an honest row
          of toggle buttons.

          Nothing in this row publishes. The chips and the arrows call `setState`
          and nothing else, which is the claim `dev/pointing.mjs` counts from the
          host's side: zero `passage.set` for a load, a context, an answer or a
          part switch, and exactly one for a press of the source.
        */}
        <div
          data-controls={ladder.rung}
          title={`${epic} — ${score}`}
          className="flex min-w-0 flex-wrap items-center gap-1"
        >
          {questions.length > 1 ? (
            <>
              <Button
                type="button"
                size="container"
                variant="outline"
                aria-label="the question before this one"
                data-page="back"
                className="whitespace-nowrap"
                disabled={at === 0}
                onClick={() => onShow(at - 1)}
              >
                ‹
              </Button>
              <span className="text-[0.65rem] whitespace-nowrap text-muted-foreground">
                {at + 1} / {questions.length}
              </span>
              <Button
                type="button"
                size="container"
                variant="outline"
                aria-label="the question after this one"
                data-page="on"
                className="whitespace-nowrap"
                disabled={at === questions.length - 1}
                onClick={() => onShow(at + 1)}
              >
                ›
              </Button>
            </>
          ) : null}

          {ladder.rung === 'part'
            ? parts.map((each) => (
                <button
                  key={each}
                  type="button"
                  data-part={each}
                  aria-pressed={each === showing}
                  onClick={() => onPart(each)}
                  className={
                    each === showing
                      ? 'rounded bg-accent px-1.5 py-0.5 text-[0.65rem] font-medium whitespace-nowrap text-accent-foreground'
                      : 'rounded px-1.5 py-0.5 text-[0.65rem] whitespace-nowrap text-muted-foreground hover:bg-accent/50'
                  }
                >
                  {PART_LABEL[each]}
                </button>
              ))
            : null}

          {/*
            What the scope is hiding, in the row rather than on a line of its
            own, and in four words rather than forty.

            At 220 wide a sentence here would take a whole extra row from the
            question, so this is `+3 elsewhere` with the long form on the row's
            `title` — the same deferral by one hover that the short source label
            already makes. `controlsHeight()` in `view/room.ts` reserves it at
            every paged rung whether or not it is drawn, so a reader pressing the
            scope control in the container header cannot change which rung they
            are on.
          */}
          {hiding ? (
            <span
              data-scope-note="brief"
              title={hiding.full}
              className="text-[0.65rem] whitespace-nowrap text-muted-foreground"
            >
              {hiding.brief}
            </span>
          ) : null}

          {answered ? (
            <>
              <span className="text-[0.65rem] whitespace-nowrap text-muted-foreground">{right} right</span>
              <Button
                type="button"
                size="container"
                variant="ghost"
                className="whitespace-nowrap"
                disabled={busy}
                onClick={onRetake}
                title={note}
              >
                Ask again
              </Button>
            </>
          ) : null}
        </div>
      </section>
    )
  }

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

        This block only exists on the `list` rung now. The paged rungs draw the
        row of controls at the bottom instead and put the paper's name in its
        `title` — see the essay above.
      */}
      <div className="flex min-w-0 snap-start flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[0.8rem] font-semibold [overflow-wrap:anywhere] @sm/container:text-sm">{epic}</h2>
        <span className="text-[0.65rem] text-muted-foreground">{score}</span>
        {/*
          The whole sentence here, and the short one in the paged row above.

          This block is a list's heading and it already wraps to two rows at 220
          wide; one more phrase in the same wrap costs a row only where the score
          did not already take one. It says what it is a count OF, which is what
          a reader who did not press the scope control themselves — a container
          restored with yesterday's preference on it — needs in order to know why
          there are two questions where there were nine.

          `headingHeight()` in `view/room.ts` does not count it, and that is the
          same decision it makes about `trouble`: the list rung is decided from
          what the questions are rather than from what the reader has done, and a
          row reserved for every reader to pay for a narrowing most of them have
          not chosen is the wrong side of that trade. The consequence is a list
          that scrolls a few pixels more while narrowed, which is what a list does.
        */}
        {hiding ? (
          <span data-scope-note="full" className="text-[0.65rem] text-muted-foreground">
            {hiding.full}
          </span>
        ) : null}
      </div>

      {trouble ? (
        <p className="rounded border border-wrong/40 bg-wrong/5 px-2 py-1.5 text-[0.7rem] leading-4 text-wrong">
          {trouble}
        </p>
      ) : null}

      <ul className="flex min-w-0 flex-col gap-1.5">
        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            busy={busy}
            room={room}
            rung="list"
            part={null}
            estimate={ladder.heights[index] ?? 0}
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
