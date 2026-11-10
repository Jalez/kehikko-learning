import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import { FIND_MARK_ATTRIBUTE, pageFind } from 'kehikot-module-protocol/client'

import type { Asked } from '../quiz/types.ts'
import { QuestionCard } from '../src/view/quiz.tsx'
import { room } from '../src/view/room.ts'

/**
 * Find (protocol 2.69.0). A question's words are plain DOM, so the host's find bar is answered by
 * the protocol client's own search of the page with no code here. It finds only what is drawn,
 * so an answer that has not been earned is not in the page to be found (`render.test.tsx`). The
 * quiz editor searches itself and is skipped. This holds that the search marks, counts, moves and
 * clears on a question this page renders. Marked with `<mark>` here (the test document has no
 * `CSS.highlights`), which also proves the marks come back out of React's DOM without a trace.
 */

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const ROOMY = room({ width: 900, height: 700 })

const asked: Asked = {
  id: 'a1b2c3d4',
  question: 'What does a module’s manifest settle?',
  options: ['What colour the container is painted', 'Who owns the manifest file', 'Which tab the page gets'],
  source: {
    label: '1',
    path: 'data/papers/modes-are-modules/chapters/bridge.tex',
    quote: 'The manifest is the smallest half of this program and the only half a host ever reads.',
    status: 'holds',
    at: { from: 1024, to: 1180, line: 31, endLine: 33 },
    count: 1,
  },
  attempts: [],
  answer: null,
  why: null,
}

const card = () => render(<QuestionCard question={asked} onAnswer={() => {}} onPoint={() => {}} pointed={false} busy={false} room={ROOMY} />).container
const marks = (root: Element) => [...root.querySelectorAll(`mark[${FIND_MARK_ATTRIBUTE}]`)]
const words = { caseSensitive: false, wholeWord: true }

describe('find in a question', () => {
  test('marks and counts the matches in the question and its options, and moves between them', () => {
    const root = card()
    const search = pageFind(() => {}, { root, visible: () => true, highlights: false })
    expect(search.run('manifest', words, 'first')).toEqual({ total: 2, current: 1 })
    expect(marks(root).map((mark) => mark.textContent)).toEqual(['manifest', 'manifest'])
    expect(search.run('manifest', words, 'next')).toEqual({ total: 2, current: 2 })
    expect(search.run('manifest', words, 'next')).toEqual({ total: 2, current: 1 })
    expect(search.run('manifest', words, 'prev')).toEqual({ total: 2, current: 2 })
    expect(root.querySelectorAll('[data-current]')).toHaveLength(1)
    search.close()
  })

  test('close clears every mark and leaves the card as React drew it', () => {
    const root = card()
    const before = root.innerHTML
    const search = pageFind(() => {}, { root, visible: () => true, highlights: false })
    search.run('manifest', words, 'first')
    search.close()
    expect(marks(root)).toHaveLength(0)
    expect(root.innerHTML).toBe(before)
  })
})
