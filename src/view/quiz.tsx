import { useState } from 'react'

import type { Asked } from '@/store/ask.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'

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
 */
export function QuestionCard({
  question,
  onAnswer,
  busy,
}: {
  question: Asked
  onAnswer: (chose: number) => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const last = question.attempts.at(-1)
  const answered = last !== undefined
  /* Both are null together and only ever arrive together. The second half of the
     condition is what tells TypeScript that, and it is also a real check: a
     server that answered `attempts: [...]` with `answer: null` would be a bug,
     and drawing the card as unanswered is the safe way to be wrong about it. */
  const key = answered && question.answer !== null ? question.answer : null

  return (
    <li
      data-question={question.id}
      data-answered={answered ? 'yes' : 'no'}
      className="min-w-0 rounded border bg-card p-2"
    >
      <p className="text-[0.78rem] leading-5 font-medium">{question.question}</p>

      <ul className="mt-1.5 flex min-w-0 flex-col gap-1">
        {question.options.map((option, index) => {
          const chosen = last?.chose === index
          const correct = key !== null && key === index
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
        The passage, behind a disclosure.

        Open by default it would be the largest thing on the card and would push
        the options off the first screen of a 220px pane; absent it would be the
        module's whole claim left unshown. `<details>` is the honest middle, and
        it is a `<details>` rather than a piece of state so that it is one
        element in the accessibility tree and works with no JavaScript at all.
      */}
      <details
        open={open}
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="mt-1.5 min-w-0"
      >
        <summary className="cursor-pointer text-[0.65rem] text-muted-foreground">
          the passage this is about
        </summary>
        <p className="mt-1 text-[0.65rem] leading-4 text-muted-foreground">
          <code className="[overflow-wrap:anywhere]">{question.passage.path}</code>
          {' · bytes '}
          {question.passage.start}–{question.passage.end}
        </p>
        <blockquote className="mt-1 border-l-2 border-quote/50 pl-2 text-[0.7rem] leading-4 text-quote [overflow-wrap:anywhere]">
          {question.passage.quote}
        </blockquote>
      </details>

      <p className="mt-1 text-[0.6rem] leading-3 text-muted-foreground">
        written by {question.by}
        {question.viaMcp ? ', over MCP' : ''}
      </p>
    </li>
  )
}

/**
 * One epic's questions, with the score and the way to ask them again.
 *
 * The score is drawn from what the reader has actually answered and says all
 * three numbers — asked, answered, right — rather than a percentage, because a
 * percentage of two questions is a number that sounds like it means something.
 */
export function QuizView({
  epic,
  questions,
  onAnswer,
  onRetake,
  trouble,
  busy,
}: {
  epic: string
  questions: Asked[]
  onAnswer: (id: string, chose: number) => void
  onRetake: () => void
  trouble: string | null
  busy: boolean
}) {
  const answered = questions.filter((question) => question.attempts.length).length
  const right = questions.filter((question) => question.attempts.at(-1)?.right).length

  if (!questions.length) {
    return (
      <section className="flex min-w-0 flex-col gap-1.5">
        <h2 className="text-[0.8rem] font-semibold [overflow-wrap:anywhere]">{epic}</h2>
        <p className="text-[0.7rem] leading-4 text-muted-foreground">
          Nothing has been asked about this paper yet. Nothing here ships a question, so an empty pane means nobody has
          written one — an agent that has just read a chapter writes them with <code>add_quiz</code>, anchored to the
          passage they are about.
        </p>
      </section>
    )
  }

  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-[0.8rem] font-semibold [overflow-wrap:anywhere]">{epic}</h2>
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
            onAnswer={(chose) => onAnswer(question.id, chose)}
          />
        ))}
      </ul>

      {answered ? (
        <div className="min-w-0">
          <Button type="button" size="pane" variant="ghost" className="whitespace-nowrap" disabled={busy} onClick={onRetake}>
            Ask these again
          </Button>
          <p className="mt-0.5 text-[0.6rem] leading-3 text-muted-foreground">
            Forgets what you answered for this paper, here and on the wire — the correct options go back out of reach
            rather than merely out of sight.
          </p>
        </div>
      ) : null}
    </section>
  )
}
