import { describe, expect, test } from 'bun:test'

import { findQuote, resolveSource } from '../quiz/cite.ts'
import { idOf, keyOf, parseQuiz, quizProblems, serialiseQuiz, writable, type Quiz } from '../quiz/format.ts'

/**
 * The file format, with no disk: what a quiz file means, that what this module
 * writes reads back as what was written, and that a file a person typed —
 * loosely, or wrongly — is read rather than refused.
 */

const QUIZ: Quiz = {
  preamble: '# Chapter two',
  questions: [
    {
      id: 'b13a66fc',
      question: 'Which surface does the thesis study?',
      label: '1',
      options: ['The graded activity', 'The open chat', 'Both equally'],
      correct: [0],
      why: 'The introduction narrows it.\n\nThe open chat exists and is not studied.',
    },
    { id: 'q2', question: 'What is mixed-initiative?', label: '2', options: ['Either party steers', 'Strict alternation'], correct: [0], why: '' },
  ],
  sources: [
    { label: '1', path: 'chapters/1_introduction.tex', quote: 'It is the graded activity that this thesis takes as its object of study.' },
    { label: '2', path: 'chapters/2_review.tex', quote: 'either party can steer the exchange' },
  ],
  strays: [],
}

const WRITTEN = `# Chapter two

## Which surface does the thesis study? [^1]
<!-- id: b13a66fc -->
- [x] The graded activity
- [ ] The open chat
- [ ] Both equally

Why:
The introduction narrows it.

The open chat exists and is not studied.

## What is mixed-initiative? [^2]
<!-- id: q2 -->
- [x] Either party steers
- [ ] Strict alternation

Sources:
[^1]: chapters/1_introduction.tex | "It is the graded activity that this thesis takes as its object of study."
[^2]: chapters/2_review.tex | "either party can steer the exchange"
`

describe('what this module writes', () => {
  test('is the documented shape: a heading, ticked options, Why:, and one Sources: list at the bottom', () => {
    expect(serialiseQuiz(QUIZ)).toBe(WRITTEN)
  })

  test('reads back as what was written', () => {
    expect(parseQuiz(WRITTEN)).toEqual(QUIZ)
    expect(serialiseQuiz(parseQuiz(WRITTEN))).toBe(WRITTEN)
    expect(writable(QUIZ)).toBe(true)
  })

  test('the correct option is the ticked one', () => {
    expect(parseQuiz(WRITTEN).questions.map(keyOf)).toEqual([0, 0])
  })

  test('an empty file is an empty quiz, and writes as nothing', () => {
    expect(parseQuiz('')).toEqual({ preamble: '', questions: [], sources: [], strays: [] })
    expect(serialiseQuiz(parseQuiz(''))).toBe('\n')
  })
})

describe('what a person types', () => {
  const TYPED = [
    'Some notes of my own.\r',
    '',
    '## What is asked,',
    'over two lines? [^a]',
    '* the first option',
    '-   [X]   the second,',
    '    wrapped onto a second line',
    '- [ ] the third',
    'Why:',
    'Because.',
    '',
    'Sources:',
    '[^a]: ch/one.tex | "some words"',
    'a line that is not a source',
    '',
    '---',
    '',
    '## A second, added below the sources [^b]',
    '- [x] yes',
    '- no',
    '',
    'Sources:',
    '[^b]: ch/two.tex | "he said "quoted" words"',
  ].join('\n')

  test('is read loosely: CRLF, * bullets, plain options, [X], wrapped lines, --- between, questions after a Sources: list', () => {
    const quiz = parseQuiz(TYPED)
    expect(quiz.preamble).toBe('Some notes of my own.')
    expect(quiz.questions).toEqual([
      {
        id: idOf('What is asked,\nover two lines?'),
        question: 'What is asked,\nover two lines?',
        label: 'a',
        options: ['the first option', 'the second, wrapped onto a second line', 'the third'],
        correct: [1],
        why: 'Because.',
      },
      { id: idOf('A second, added below the sources'), question: 'A second, added below the sources', label: 'b', options: ['yes', 'no'], correct: [0], why: '' },
    ])
    expect(quiz.sources).toEqual([
      { label: 'a', path: 'ch/one.tex', quote: 'some words' },
      { label: 'b', path: 'ch/two.tex', quote: 'he said "quoted" words' },
    ])
    expect(quiz.strays).toEqual(['a line that is not a source'])
  })

  test('is a fixed point once written: writing it again changes nothing, and nothing typed is lost', () => {
    const once = serialiseQuiz(parseQuiz(TYPED))
    expect(serialiseQuiz(parseQuiz(once))).toBe(once)
    expect(writable(parseQuiz(TYPED))).toBe(true)
    expect(once).toContain('a line that is not a source')
    expect(once.trimEnd().split('\n').at(-1)).toBe('a line that is not a source')
  })

  test('a question with no id is named after its words, so the same file gives the same name every read', () => {
    expect(parseQuiz(TYPED).questions[0]?.id).toBe(parseQuiz(TYPED).questions[0]?.id)
    expect(idOf('a')).toMatch(/^[0-9a-f]{8}$/)
    expect(idOf('a')).not.toBe(idOf('b'))
  })

  test('two questions never share a name: a pasted copy gets its own', () => {
    const quiz = parseQuiz('## Same\n<!-- id: one -->\n- [x] a\n- b\n\n## Same\n<!-- id: one -->\n- [x] a\n- b\n\n## Same\n- [x] a\n- b\n\n## Same\n- [x] a\n- b\n')
    expect(quiz.questions.map((q) => q.id)).toEqual(['one', 'one-2', idOf('Same'), `${idOf('Same')}-2`])
  })
})

describe('what is wrong with a file', () => {
  const problems = (text: string) => quizProblems(parseQuiz(text))

  test('nothing, for a good one', () => {
    expect(problems(WRITTEN)).toEqual([])
  })

  test('no tick, two ticks, one option, the same option twice: not asked, and said', () => {
    expect(keyOf(parseQuiz('## Q [^1]\n- a\n- b\n').questions[0]!)).toBeNull()
    expect(problems('## Q [^1]\n- a\n- b\n\nSources:\n[^1]: a.tex | "w"\n')).toEqual(['Question 1 (“Q”) has no option ticked, so it is not asked. Tick exactly one: - [x].'])
    expect(problems('## Q [^1]\n- [x] a\n- [x] b\n\nSources:\n[^1]: a.tex | "w"\n')[0]).toContain('has 2 options ticked')
    expect(problems('## Q [^1]\n- [x] a\n\nSources:\n[^1]: a.tex | "w"\n')[0]).toContain('fewer than two options')
    expect(problems('## Q [^1]\n- [x] a\n- a\n\nSources:\n[^1]: a.tex | "w"\n')[0]).toContain('the same option twice')
  })

  test('a question with no source, or a marker with no line, is said: every question is tied to a passage', () => {
    expect(problems('## Q\n- [x] a\n- b\n')).toEqual(['Question 1 (“Q”) names no source. Put a [^n] on it and its line under Sources:.'])
    expect(problems('## Q [^9]\n- [x] a\n- b\n')[0]).toContain('names [^9], which has no line under Sources:')
  })

  test('a source line that is not one, a label given twice, a path outside the project', () => {
    const found = problems('## Q [^1]\n- [x] a\n- b\n\nSources:\n[^1]: a.tex | "w"\n[^1]: b.tex | "w"\n[^2]: /etc/passwd | "w"\n[^3]: no quote here\n')
    expect(found).toContain('[^1] is given two sources.')
    expect(found.join('\n')).toContain('"/etc/passwd" is not relative to the project and inside it')
    expect(found.join('\n')).toContain('"[^3]: no quote here" under Sources: is not [^label]')
  })

  test('garbage is an empty quiz with a preamble, not an error', () => {
    const quiz = parseQuiz('{"questions": [1, 2\n\u0000\n### not a question\n')
    expect(quiz.questions).toEqual([])
    expect(quizProblems(quiz)).toEqual([])
  })

  test('text that would be read as structure is caught before it is written', () => {
    const bent = (over: Partial<Quiz['questions'][number]>) => writable({ ...QUIZ, questions: [{ ...QUIZ.questions[0]!, ...over }] })
    expect(bent({ why: 'fine\n## not fine' })).toBe(false)
    expect(bent({ why: 'Sources:' })).toBe(false)
    expect(bent({ question: 'two\n- lines' })).toBe(false)
    expect(bent({ options: ['a\nb', 'c'] })).toBe(false)
    expect(bent({ why: 'a dash - in a sentence is fine, and so is a # sign' })).toBe(true)
  })
})

describe('finding the words again', () => {
  const FILE = 'First line.\nThe manifest is the\n  smallest half — “quoted”.\nThe manifest is here twice: the manifest.\n'
  const source = (quote: string) => ({ label: '1', path: 'a.tex', quote })

  test('holds: once, with byte offsets and lines, whatever the whitespace between the words', () => {
    const found = resolveSource(source('manifest is the smallest half'), FILE)
    expect(found).toMatchObject({ status: 'holds', count: 1, at: { from: 16, to: 47, line: 2, endLine: 3 } })
    expect(new TextDecoder().decode(new TextEncoder().encode(FILE).subarray(16, 47))).toBe('manifest is the\n  smallest half')
  })

  test('offsets are bytes, not characters: what a passage carries', () => {
    const found = findQuote(FILE, '“quoted”.')
    expect(found.at?.from).toBe(new TextEncoder().encode(FILE.slice(0, FILE.indexOf('“quoted”'))).length)
    expect(found.at!.to - found.at!.from).toBe(new TextEncoder().encode('“quoted”.').length)
  })

  test('ambiguous, adrift, unreadable', () => {
    expect(resolveSource(source('manifest'), FILE)).toMatchObject({ status: 'ambiguous', count: 3 })
    expect(resolveSource(source('Manifest is the smallest'), FILE)).toMatchObject({ status: 'adrift', at: null, count: 0 })
    expect(resolveSource(source('anything'), null)).toMatchObject({ status: 'unreadable', at: null })
  })
})
