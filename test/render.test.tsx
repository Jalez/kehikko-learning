import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, screen } from '@testing-library/react'

import type { Asked } from '../quiz/types.ts'
import { QuestionCard, QuizView } from '../src/view/quiz.tsx'
import { NoEpic, NoProject } from '../src/view/nowhere.tsx'

afterEach(cleanup)

/**
 * The components, rendered for real, asserting on what is in the document.
 *
 * The most important test in this file is the first one, and what it asserts is
 * an ABSENCE: that the correct option is nowhere in the DOM before it has been
 * earned. An absence is only worth asserting if the thing would otherwise be
 * there, so the fixture below is deliberately built the way a careless version
 * of this module would have built it — with the key present in the data — and
 * then the projection that removes it is what the card is actually given.
 */

const KEY = 2
const WHY = 'Because the manifest is the only half a host reads.'

/** A question as the server would send it BEFORE the reader has answered. */
const unanswered: Asked = {
  id: 'a1b2c3d4',
  epic: 'modes-are-modules',
  question: 'What does a module’s manifest settle?',
  options: [
    'What colour the pane is painted',
    'Who owns the repository the module lives in',
    'Which tab the page gets, and what the module would like to be allowed to ask',
  ],
  passage: {
    path: 'data/papers/modes-are-modules/chapters/bridge.tex',
    start: 1024,
    end: 1180,
    quote: 'The manifest is the smallest half of this program and the only half a host ever reads.',
  },
  by: 'claude',
  viaMcp: true,
  at: '2026-08-30T10:00:00.000Z',
  attempts: [],
  /* Null, because the server did not send them. This is the whole mechanism. */
  answer: null,
  why: null,
}

/** The same question after the reader chose wrongly. The key has now been earned. */
const answered: Asked = {
  ...unanswered,
  id: 'e5f6a7b8',
  attempts: [{ chose: 0, right: false, at: '2026-08-30T10:01:00.000Z' }],
  answer: KEY,
  why: WHY,
}

describe('the answer is not in the page before it is asked for', () => {
  test('nothing in the rendered document names the correct option as correct', () => {
    const { container } = render(<QuestionCard question={unanswered} onAnswer={() => {}} busy={false} />)

    /* Every option is drawn — the reader can read all three. */
    for (const option of unanswered.options) expect(screen.getByText(option)).toBeTruthy()

    /* And nothing distinguishes the right one. `data-correct` is the attribute
       the component adds once a key has arrived, and it is not here. */
    expect(container.querySelectorAll('[data-correct]')).toHaveLength(0)
    expect(container.querySelector('[data-question="a1b2c3d4"]')?.getAttribute('data-answered')).toBe('no')

    /* The explanation is nowhere in the document, under any element. */
    expect(container.innerHTML).not.toContain('only half a host reads')

    /* And the classes on the three options are identical, so there is no
       styling channel giving it away either. A test that only checked
       attributes would pass on a version that coloured the right one green. */
    const buttons = [...container.querySelectorAll('button')]
    expect(buttons).toHaveLength(3)
    const classes = new Set(buttons.map((button) => button.className))
    expect(classes.size).toBe(1)
  })

  test('the key is not recoverable from the markup by any string search', () => {
    /* The blunt version of the same assertion, and the one that would catch a
       key smuggled into a `key=`, a `value=`, an `aria-` attribute or a comment.
       The whole document, as a string, and the index 2 must not appear as an
       answer anywhere. */
    const { container } = render(<QuestionCard question={unanswered} onAnswer={() => {}} busy={false} />)
    /* `data-answered="no"` is the one place the word appears, and it says the
       opposite of a leak — it is how the card reports that nothing has been
       earned. Removed before the search so that the search can be absolute. */
    const html = container.innerHTML.replace(/ data-answered="no"/g, '')
    expect(html).not.toMatch(/answer/i)
    expect(html).not.toMatch(/correct/i)
    expect(html).not.toContain(WHY)
  })

  test('once answered, the key is shown — being coy afterwards would be useless', () => {
    const { container } = render(<QuestionCard question={answered} onAnswer={() => {}} busy={false} />)
    const correct = container.querySelectorAll('[data-correct="true"]')
    expect(correct).toHaveLength(1)
    expect(correct[0]?.textContent).toBe(answered.options[KEY])
    expect(container.querySelector('[data-chose="true"]')?.textContent).toBe(answered.options[0])
    expect(screen.getByText(WHY)).toBeTruthy()
    expect(screen.getByText('wrong')).toBeTruthy()
  })

  test('an answered question cannot be answered again without a retake', () => {
    render(<QuestionCard question={answered} onAnswer={() => {}} busy={false} />)
    for (const button of screen.getAllByRole('button')) {
      if (button.textContent && answered.options.includes(button.textContent)) {
        expect((button as HTMLButtonElement).disabled).toBe(true)
      }
    }
  })
})

describe('the passage', () => {
  test('is shown, since it is the module’s whole claim', () => {
    render(<QuestionCard question={unanswered} onAnswer={() => {}} busy={false} />)
    expect(screen.getByText(unanswered.passage.path)).toBeTruthy()
    expect(screen.getByText(unanswered.passage.quote)).toBeTruthy()
    expect(screen.getByText(/bytes/)).toBeTruthy()
  })

  test('says who wrote the question and that it came through the door', () => {
    render(<QuestionCard question={unanswered} onAnswer={() => {}} busy={false} />)
    expect(screen.getByText(/written by claude, over MCP/)).toBeTruthy()
  })
})

describe('the quiz', () => {
  test('an epic with nothing in it says so rather than showing an empty list', () => {
    render(
      <QuizView epic="modes-are-modules" questions={[]} onAnswer={() => {}} onRetake={() => {}} trouble={null} busy={false} />,
    )
    expect(screen.getByText(/Nothing has been asked about this paper yet/)).toBeTruthy()
  })

  test('the score says all three numbers rather than a percentage', () => {
    render(
      <QuizView
        epic="modes-are-modules"
        questions={[answered, unanswered]}
        onAnswer={() => {}}
        onRetake={() => {}}
        trouble={null}
        busy={false}
      />,
    )
    expect(screen.getByText('2 asked · 1 answered · 0 right')).toBeTruthy()
  })

  test('the way to ask them again appears only once something has been answered', () => {
    const { rerender } = render(
      <QuizView epic="e" questions={[unanswered]} onAnswer={() => {}} onRetake={() => {}} trouble={null} busy={false} />,
    )
    expect(screen.queryByText('Ask these again')).toBeNull()
    rerender(
      <QuizView epic="e" questions={[answered]} onAnswer={() => {}} onRetake={() => {}} trouble={null} busy={false} />,
    )
    expect(screen.getByText('Ask these again')).toBeTruthy()
  })
})

describe('the screens that are not errors', () => {
  test('no epic open is a real screen, and it points somewhere', () => {
    render(
      <NoEpic
        project="roadmap"
        standings={[{ epic: 'modes-are-modules', questions: 4, answered: 2, right: 1 }]}
      />,
    )
    expect(screen.getByText('No paper is open')).toBeTruthy()
    expect(screen.getByText('modes-are-modules')).toBeTruthy()
    expect(screen.getByText('2/4 answered')).toBeTruthy()
  })

  test('no epic and no questions says both things', () => {
    render(<NoEpic project={null} standings={[]} />)
    expect(screen.getByText('No paper is open')).toBeTruthy()
    expect(screen.getByText(/No questions have been written about anything in this project yet/)).toBeTruthy()
  })

  test('no project says where the questions live, and offers NOT a picker', () => {
    /* This screen used to carry a receipt: the projects this app held questions
       for, listed out of its own store. There is no such store now — the
       questions are inside the projects — so it names the file instead, which is
       a better answer to the question the receipt was really for.
       It is still not a picker, and never was: choosing one here would be this
       page deciding where it is standing, which is the thing it has just said it
       cannot know. */
    const { container } = render(<NoProject unhosted={false} />)
    expect(screen.getByText('This canvas did not say where it is')).toBeTruthy()
    expect(screen.getByText('.kehikot/learning/questions.json')).toBeTruthy()
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  test('opened directly, it says that instead of blaming the host', () => {
    render(<NoProject unhosted />)
    expect(screen.getByText('Nothing is framing this page')).toBeTruthy()
  })
})

describe('the layout at 220 pixels', () => {
  test('no component sets whitespace-nowrap on the long strings', () => {
    /*
     * The trap: shadcn ships `whitespace-nowrap` in the base of both Badge and
     * Button, and `white-space: nowrap` makes an element's MIN-CONTENT WIDTH the
     * full width of its text. Everything in this module is a long string — a
     * question, an option, a quoted passage, a document path — and one of them
     * inside a nowrap element sets a floor under the whole pane. Measured at
     * 1187px in a 220px pane in another module here.
     *
     * happy-dom does not lay out, so the geometry cannot be measured; what CAN
     * be asserted is that no element carrying one of those strings also carries
     * the class. That is the cause rather than the symptom, and the browser
     * probe measures the symptom.
     */
    const { container } = render(
      <QuizView
        epic="modes-are-modules"
        questions={[answered, unanswered]}
        onAnswer={() => {}}
        onRetake={() => {}}
        trouble={null}
        busy={false}
      />,
    )
    const long = [
      unanswered.question,
      ...unanswered.options,
      unanswered.passage.path,
      unanswered.passage.quote,
      WHY,
    ]
    for (const element of container.querySelectorAll('*')) {
      const text = element.textContent ?? ''
      if (!long.some((string) => text.includes(string))) continue
      if (element.className.includes('whitespace-nowrap')) {
        throw new Error(`whitespace-nowrap on an element containing a long string: ${element.className}`)
      }
    }
  })

  test('the short verdict marks DO opt back in, since they are one word', () => {
    const { container } = render(<QuestionCard question={answered} onAnswer={() => {}} busy={false} />)
    const mark = [...container.querySelectorAll('[data-slot="badge"]')].find((b) => b.textContent === 'wrong')
    expect(mark?.className).toContain('whitespace-nowrap')
    expect(mark?.className).toContain('shrink-0')
  })
})
