import { MARKER, markersIn, parseSource, serialiseSource, uncitable, type Source } from './cite.ts'

/**
 * An epic's questions are one Markdown file, and this is the only place that
 * reads or writes one. It works the way a Slides deck does (`deck/format.ts`
 * there), so a person who can edit one can edit the other.
 *
 * ```md
 * # Anything above the first question is yours, and is kept as it is.
 *
 * ## Which surface does the thesis take as its object of study? [^1]
 * <!-- id: b13a66fc -->
 * - [x] The structured, graded activity
 * - [ ] The open chat surface
 * - [ ] Both surfaces equally
 *
 * Why:
 * The introduction narrows the scope to the graded activity, in so many words.
 *
 * Sources:
 * [^1]: chapters/1_introduction.tex | "It is the graded activity that this thesis takes as its object of study."
 * ```
 *
 * - A question is a `## ` heading. Lines under it, before the options, are part
 *   of what is asked.
 * - Its options are the list items under it, in the order they are shown. **The
 *   correct one is the one ticked: `- [x]`.** The others are `- [ ]`, or a plain
 *   `- `. A question with no tick, or more than one, cannot be asked, and
 *   `quizProblems` says so.
 * - Everything after a line that is exactly `Why:` is the explanation, shown
 *   once the reader has answered.
 * - A `[^1]` on the question is the passage it rests on, and a line that is
 *   exactly `Sources:` opens the list of them, in Slides' syntax:
 *   `[^1]: <project-relative path> | "<exact words>"` (see `cite.ts`). One list
 *   at the bottom is how this module writes it; a list after each question
 *   reads the same, because labels are the file's and not a question's.
 * - `<!-- id: … -->` is the name a reader's answers are filed under (they are
 *   kept in `answers.json`, never in this file). A question typed by hand needs
 *   none: it is named after its words until this module next writes the file,
 *   which gives it one — so rewording a question that has an id keeps its
 *   answers, and rewording one that has none starts it afresh.
 * - A line that is exactly `---` between questions is allowed and means nothing.
 *
 * Plain functions over strings: no I/O, so every rule is a unit test, and the
 * editor in the page parses what is being typed with the same code. Only the
 * editor does: the answering page is never sent the file — the tick IS the
 * answer key (see `asked` and `readQuiz` in `questions.ts`).
 */

export interface Question {
  id: string
  /** What is asked: the heading and any lines under it, markers taken out. */
  question: string
  /** The source it rests on — its first `[^label]` — or null when it names none. */
  label: string | null
  options: string[]
  /** Which options are ticked. Exactly one, or the question cannot be asked. */
  correct: number[]
  why: string
}

export interface Quiz {
  /** Everything above the first question, verbatim. */
  preamble: string
  questions: Question[]
  /** Every `Sources:` line in the file, in the order written. */
  sources: Source[]
  /** Lines under `Sources:` that are not a source, kept so a person's text survives. */
  strays: string[]
}

const HEADING = /^##[ \t]+(.*\S)[ \t]*$/
const OPTION = /^[ \t]*[-*][ \t]+(?:\[([ xX])\][ \t]+)?(.*\S)[ \t]*$/
const ID_LINE = /^<!--[ \t]*id:[ \t]*([A-Za-z0-9_-]{1,64})[ \t]*-->$/
const WHY = /^Why:[ \t]*$/
const SOURCES = /^Sources:[ \t]*$/
const SEPARATOR = /^---[ \t]*$/

export function emptyQuiz(): Quiz {
  return { preamble: '', questions: [], sources: [], strays: [] }
}

/** A name for a question nobody named: eight hex characters of its words (FNV-1a). */
export function idOf(question: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < question.length; i++) hash = Math.imul(hash ^ question.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function parseQuiz(text: string): Quiz {
  const quiz = emptyQuiz()
  const preamble: string[] = []
  let one: Question | null = null
  let asked: string[] = []
  let why: string[] = []
  let zone: 'question' | 'options' | 'why' | 'sources' = 'question'

  const close = () => {
    if (!one) return
    const words = asked.join('\n')
    one.label = markersIn(words)[0] ?? null
    one.question = words
      .replace(MARKER, '')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
    one.why = why.join('\n').trim()
  }

  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    const heading = HEADING.exec(raw)
    if (heading) {
      close()
      one = { id: '', question: '', label: null, options: [], correct: [], why: '' }
      quiz.questions.push(one)
      asked = [heading[1]!]
      why = []
      zone = 'question'
    } else if (SOURCES.test(raw)) {
      zone = 'sources'
    } else if (zone === 'sources') {
      const source = parseSource(line)
      if (source) quiz.sources.push(source)
      else if (line && !SEPARATOR.test(line)) quiz.strays.push(line)
    } else if (!one) {
      preamble.push(raw)
    } else if (!line || SEPARATOR.test(line)) {
      if (zone === 'why' && !line) why.push('')
    } else if (zone === 'why') {
      why.push(raw)
    } else if (!one.id && ID_LINE.test(line)) {
      one.id = ID_LINE.exec(line)![1]!
    } else if (WHY.test(line)) {
      zone = 'why'
    } else {
      const option = OPTION.exec(raw)
      if (option) {
        if (option[1] && option[1] !== ' ') one.correct.push(one.options.length)
        one.options.push(option[2]!)
        zone = 'options'
      } else if (zone === 'options') {
        /* A wrapped option: the line belongs to the one above it. */
        one.options[one.options.length - 1] += ` ${line}`
      } else {
        asked.push(line)
      }
    }
  }
  close()
  quiz.preamble = preamble.join('\n').trim()

  /* Every question has a name, and no two share one: a repeated or missing id
     would file two questions' answers together. */
  const taken = new Set<string>()
  for (const question of quiz.questions) {
    const base = question.id || idOf(question.question)
    let id = base
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
    taken.add(id)
    question.id = id
  }
  return quiz
}

export function serialiseQuestion(question: Question): string {
  const [head = '', ...rest] = question.question.split('\n')
  const lines = [
    `## ${head}${question.label ? ` [^${question.label}]` : ''}`,
    `<!-- id: ${question.id} -->`,
    ...rest,
    ...question.options.map((option, index) => `- [${question.correct.includes(index) ? 'x' : ' '}] ${option}`),
  ]
  if (question.why) lines.push('', 'Why:', question.why)
  return lines.join('\n')
}

export function serialiseQuiz(quiz: Quiz): string {
  const parts: string[] = []
  if (quiz.preamble) parts.push(quiz.preamble)
  parts.push(...quiz.questions.map(serialiseQuestion))
  if (quiz.sources.length || quiz.strays.length) {
    parts.push(['Sources:', ...quiz.sources.map(serialiseSource), ...quiz.strays].join('\n'))
  }
  return `${parts.join('\n\n')}\n`
}

/**
 * Whether a quiz reads back as what was written. Text put into a question by a
 * tool can hold a line the file would read as structure — a `## ` heading, a
 * `- ` option, `Why:`, `Sources:` — and this is the one check that catches all
 * of them, refused rather than escaped because the file is meant to be read.
 */
export function writable(quiz: Quiz): boolean {
  return JSON.stringify(parseQuiz(serialiseQuiz(quiz))) === JSON.stringify(quiz)
}

/** The index of the correct option, or null for a question that cannot be asked. */
export function keyOf(question: Question): number | null {
  const askable =
    question.options.length >= 2
    && new Set(question.options).size === question.options.length
    && question.correct.length === 1
  return askable ? question.correct[0]! : null
}

/**
 * What is wrong with a quiz file, one sentence each, questions counted from 1.
 * Nothing here says which option is ticked: these sentences are shown to the
 * reader.
 */
export function quizProblems(quiz: Quiz): string[] {
  const problems: string[] = []
  const labels = new Set<string>()
  for (const source of quiz.sources) {
    if (labels.has(source.label)) problems.push(`[^${source.label}] is given two sources.`)
    labels.add(source.label)
    const why = uncitable(source)
    if (why) problems.push(`[^${source.label}]: ${why}`)
  }
  for (const line of quiz.strays) {
    problems.push(`"${line.slice(0, 80)}" under Sources: is not [^label]: <project-relative path> | "<exact words>".`)
  }
  quiz.questions.forEach((question, at) => {
    const name = `Question ${at + 1} (“${question.question.length > 50 ? `${question.question.slice(0, 50)}…` : question.question}”)`
    if (question.options.length < 2) problems.push(`${name} has fewer than two options, so it is not asked.`)
    else if (new Set(question.options).size !== question.options.length) problems.push(`${name} has the same option twice, so it is not asked.`)
    else if (question.correct.length !== 1) {
      problems.push(`${name} has ${question.correct.length || 'no'} option${question.correct.length > 1 ? 's' : ''} ticked, so it is not asked. Tick exactly one: - [x].`)
    }
    if (question.label === null) problems.push(`${name} names no source. Put a [^n] on it and its line under Sources:.`)
    else if (!labels.has(question.label)) problems.push(`${name} names [^${question.label}], which has no line under Sources:.`)
  })
  return problems
}
