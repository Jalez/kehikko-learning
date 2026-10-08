import { ID, MANIFEST, VERSION } from './manifest.ts'
import { linesOf } from './quiz/cite.ts'
import {
  MAX_EPIC,
  MAX_ID,
  MAX_OPTION,
  MAX_OPTIONS,
  MAX_PATH,
  MAX_QUESTION,
  MAX_QUOTE,
  MAX_WHY,
  MIN_OPTIONS,
  change,
  epicsOf,
  fileOf,
  forEpic,
  quizHistory,
  readQuiz,
  score,
  standings,
  undoQuiz,
  withKey,
  writeQuiz,
  type Keyed,
} from './quiz/questions.ts'
import { MAX_PROJECT, defaultProject, usablePath } from './quiz/projects.ts'

/**
 * Every door this app answers on that is not the page itself.
 *
 * A module is ONE ORIGIN: the page is Vite's, so the manifest, the health
 * check, the MCP door and this app's own store are Vite's too. Hence no
 * listener here. `answer()` takes a method, a path, a query and a body and
 * returns a status and a document, and `vite.config.ts` adapts a node request
 * to it.
 *
 * ## The one thing to know before changing anything here
 *
 * There are two ways out of this file for a question, and they carry different
 * things. `forEpic` produces `Asked`, which has no answer key in it until the
 * reader has answered; `withKey` carries the key. Everything the PAGE can reach
 * uses the first — with ONE exception, `/api/quiz`, which hands the editor the
 * Markdown file itself, key and all, behind the page's ticket and only when a
 * person has pressed Edit (see `readQuiz`). Until that press the page holds no
 * answer it has not earned. The second is reachable only through the MCP door, which
 * prints the key only under an explicit `reveal: true` or once a reader has
 * answered. See `asked` in `quiz/questions.ts`; `grep -n withKey doors.ts` is
 * meant to stay a short list.
 */

/* Nothing here trusts its caller: a string has a length before it has a meaning. */

function str(value: unknown, max: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, max)
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

/** One line: what a heading, an option or a source line can hold. */
const line = (value: unknown, max: number) => str(value, max).replace(/\s+/g, ' ')

function whole(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return Number.NaN
}

/**
 * The ticket a write from the page has to carry. Minted once per process and
 * printed into the page this server serves; it dies with this process.
 *
 * It separates "this app's own page pressed something" from "something else on
 * this machine guessed the port and posted". It is not what protects the
 * ANSWER KEY — that is behind not being sent at all. What it buys is that a
 * stray script cannot fill somebody's history with attempts they never made.
 */
export const TICKET = crypto.randomUUID()

/** What an agent is called when it does not say. */
const AGENT = process.env.LEARNING_AGENT ?? process.env.KEHIKOT_AGENT ?? 'an agent'

/* ------------------------------------------------------------------ *
 * The agent's door
 * ------------------------------------------------------------------ */

const PROJECT_PROPERTY = {
  project: {
    type: 'string',
    description:
      'The absolute path of the project this is about — the folder you are working in, the same one the canvas is '
      + 'standing in. Questions are kept INSIDE it, one Markdown file per epic at .kehikot/learning/<epic>.md, so this '
      + 'is not a label but the place the file is. Required unless LEARNING_PROJECT is set in this app’s environment.',
  },
} as const

/**
 * The four tools, which are the whole of what an agent can do here.
 *
 * **There is no tool that answers a question.** That omission is the module:
 * an agent writes the questions; a PERSON answers them, because the entire
 * value of the record is that it says what a person understood. And `quizzes`
 * withholds the key by default for the same reason the page does — an agent
 * standing beside a reader with the answer key will, being helpful, tell them.
 */
function tools() {
  return [
    {
      name: 'quizzes',
      description:
        'The questions written about a paper, and how they were answered. With no epic it answers with every epic in '
        + 'the project and what each adds up to; with an epic it prints that epic’s questions in the order its file has '
        + 'them, whether each one’s source still holds, and anything wrong with the file. The questions are a Markdown '
        + 'file a person may have edited by hand (.kehikot/learning/<epic>.md), so read this BEFORE writing questions, '
        + 'and AFTER a reader has been through them: a question somebody got wrong is the part of your explanation '
        + 'that did not work. Do not read the file itself to a reader — it holds the answers.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTY,
          epic: { type: 'string', description: 'The epic whose paper the questions are about, as list_epics spells it.' },
          reveal: {
            type: 'boolean',
            description:
              'Print the correct option and the explanation for questions nobody has answered yet. Defaults to false, '
              + 'and leave it false unless you are checking your own work: the answer is withheld from the reader’s '
              + 'container until they have chosen, and an assistant who has read the key is an assistant who will give it '
              + 'away. Questions that HAVE been answered always print their key — the reader has already seen it.',
          },
        },
      },
    },
    {
      name: 'add_quiz',
      description:
        'Write one multiple-choice question about a passage of a paper, at the end of the epic’s quiz file. If you '
        + 'have just explained something from a chapter, the question that would check whether it landed belongs here, '
        + 'written now, while you still have the passage open. Cite it — the file and the exact words — so that what '
        + 'the question is about is a fact rather than a claim. Write wrong options somebody could plausibly pick, and '
        + 'say in the explanation why the others are wrong: that is what the reader reads when they get it wrong.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTY,
          epic: {
            type: 'string',
            description:
              'The epic whose paper this is about, as list_epics spells it — lower-case letters, digits and hyphens. '
              + 'It is the slug and not the title, and it is the name of the file.',
          },
          question: { type: 'string', description: `What the reader is asked, on one line. Up to ${MAX_QUESTION} characters.` },
          options: {
            type: 'array',
            items: { type: 'string', maxLength: MAX_OPTION },
            minItems: MIN_OPTIONS,
            maxItems: MAX_OPTIONS,
            description: `Between ${MIN_OPTIONS} and ${MAX_OPTIONS} options, in the order they will be shown. They must all differ.`,
          },
          answer: {
            type: 'integer',
            minimum: 0,
            description: 'Which option is correct, counting from 0. Index into options, not the text of one.',
          },
          why: {
            type: 'string',
            description: `The explanation, shown once the reader has chosen. Up to ${MAX_WHY} characters. Say why the other options are wrong, not only why this one is right.`,
          },
          path: {
            type: 'string',
            description:
              'The file the passage is in: its absolute path, or a path relative to the PROJECT root (the folder you '
              + 'passed as project). Written relative to the project. If you read the document through another '
              + 'module\'s door, which may spell files relative to the paper\'s own folder, give the absolute path.',
          },
          quote: {
            type: 'string',
            description:
              `The exact words in that file the question rests on, up to ${MAX_QUOTE} characters: the file's own text, `
              + 'markup and all; line breaks and runs of spaces need not match. Refused unless the words are in the '
              + 'file exactly once, so quote a sentence or two — enough to occur once. No byte offsets: the words are '
              + 'found again on every read, and say so when the paper has changed under them.',
          },
          agent: { type: 'string', description: 'Your own name, so the history a person undoes from says who wrote this.' },
        },
        required: ['epic', 'question', 'options', 'answer', 'path', 'quote'],
      },
    },
    {
      name: 'reword_quiz',
      description:
        'Sharpen a question that already exists, keeping its id — and every answer given to it, unless you change '
        + 'its options or its key, which makes it a question nobody has answered yet. For fixing wording, a '
        + 'misleading option, a key you got wrong — or a source that no longer resolves, which `quizzes` marks: give '
        + '`quote` (and `path` if the file moved) to cite it again. To ask a different thing, write a different '
        + 'question — one changed enough that the old answers no longer mean anything has rewritten somebody’s history. '
        + 'Recorded in the history, so the person can undo it.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTY,
          id: { type: 'string', description: 'The question id, as the quizzes tool prints it' },
          epic: { type: 'string', description: 'The epic the question is about. Needed only when two epics hold the same id.' },
          question: { type: 'string', description: 'The new wording. Omit to leave it alone.' },
          options: {
            type: 'array',
            items: { type: 'string', maxLength: MAX_OPTION },
            description: 'The full new set of options, replacing the old. Omit to leave them alone.',
          },
          answer: { type: 'integer', minimum: 0, description: 'The new correct index. Omit to leave it alone.' },
          why: { type: 'string', description: 'The new explanation. Omit to leave it alone.' },
          path: { type: 'string', description: 'Where the cited file now is — absolute, or relative to the project root. Omit to keep it.' },
          quote: { type: 'string', description: 'The exact words to cite instead, occurring once in the file. Omit to keep the quote.' },
          agent: { type: 'string', description: 'Your own name, so the history a person undoes from says who wrote this.' },
        },
        required: ['id'],
      },
    },
    {
      name: 'drop_quiz',
      description:
        'Take one question out of the file. It is recorded in the history, so the person can undo it from the '
        + 'editor in the page; nothing on this door can. A question that turned out to be about nothing is dropped; a question somebody keeps getting '
        + 'wrong is not — that one is telling you something.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTY,
          id: { type: 'string', description: 'The question id' },
          epic: { type: 'string', description: 'The epic the question is about. Needed only when two epics hold the same id.' },
          agent: { type: 'string', description: 'Your own name, so the history a person undoes from says who wrote this.' },
        },
        required: ['id'],
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * The answers, in words
 * ------------------------------------------------------------------ */

/** The refusal for a call that did not say which project it meant. */
function noProjectText(name: string): string {
  return (
    `${name} needs a project: the absolute path of the folder this is about. Questions are kept INSIDE the project `
    + 'they are about, in .kehikot/learning/, so the path is not a label — it is where the files are, and there is '
    + 'no central store to fall back to or to list. There is no default that would be right: a guess would write '
    + `somebody’s questions into a folder they will never open. A path may not be empty, longer than ${MAX_PROJECT} `
    + 'characters, or contain a control character. Nothing was written.'
  )
}

/** One project, epic by epic, for an agent that did not name an epic. */
function standingsText(project: string): string {
  const { standings: rows, trouble, nowhere } = standings(project)
  if (nowhere) return noProjectText('quizzes')
  if (trouble) return trouble
  if (!rows.length) {
    return (
      `No questions have been written about anything in ${project}. add_quiz writes the first — cite a passage of the `
      + 'paper the epic is aimed at.'
    )
  }
  return [
    `Questions in ${project}:`,
    ...rows.map(
      (row) =>
        `  ${row.epic} — ${row.questions} question${row.questions === 1 ? '' : 's'}, `
        + `${row.answered} answered, ${row.right} right`,
    ),
    '',
    'Give an epic to read its questions.',
  ].join('\n')
}

/** Where a question's words are, or the sentence about why they are not — said to the agent, who can fix it. */
function sourceText({ source }: Keyed): string {
  if (!source) return '  the question names NO source in the file. reword_quiz with path and quote cites one.'
  const quote = `“${source.quote.length > 160 ? `${source.quote.slice(0, 160)}…` : source.quote}”`
  if (source.status === 'unreadable') {
    return `  the source does NOT resolve: ${source.path} is not a readable file inside this project. reword_quiz with path says where it is now. ${quote}`
  }
  if (source.status === 'adrift') {
    return `  the source does NOT resolve: ${source.path} no longer has these words — the paper changed under this question. reword_quiz with quote cites it again. ${quote}`
  }
  const where = `  cites ${source.path}, ${source.at ? linesOf(source.at) : ''}: ${quote}`
  return source.status === 'ambiguous' ? `${where}\n  these words occur ${source.count} times there; reword_quiz with a longer quote says which.` : where
}

/**
 * One epic's questions, in words.
 *
 * `reveal` decides whether the key is printed for a question nobody has
 * answered yet. One that HAS been answered prints its key regardless: the
 * reader has already been shown it, and reading what did and did not land is
 * what this tool is for.
 */
function epicText(project: string, epic: string, reveal: boolean): string {
  const { questions, problems, trouble, nowhere } = withKey(project, epic)
  if (nowhere) return noProjectText('quizzes')
  if (trouble) return trouble
  if (!questions.length) {
    return (
      `No questions have been written about ${epic} in ${project}. add_quiz writes the first. If you have just `
      + 'explained a passage of that paper, this is the moment.'
    )
  }
  const lines = questions.map((one, at) => {
    const { question, key, attempts } = one
    const last = attempts.at(-1)
    const shown = reveal || last !== undefined
    return [
      `${at + 1}. ${question.id} — ${question.question}`,
      ...question.options.map((option, index) => `     [${index}] ${option}`),
      key === null
        ? '  NOT ASKED: the file does not tick exactly one option for it'
        : shown
          ? `  answer: ${key}. ${question.options[key] ?? ''}`
          : '  answer: withheld — nobody has answered this one yet',
      last
        ? `  the reader chose ${last.chose} (${question.options[last.chose] ?? '?'}) and was ${last.right ? 'right' : 'WRONG'}, ${last.at}`
          + (attempts.length > 1 ? ` — ${attempts.length} attempts in all` : '')
        : '  not answered yet',
      sourceText(one),
      ...(shown && key !== null && question.why ? [`  why: ${question.why}`] : []),
    ].join('\n')
  })
  const answered = questions.filter((one) => one.attempts.length).length
  const right = questions.filter((one) => one.attempts.at(-1)?.right).length
  const head =
    `${questions.length} question${questions.length === 1 ? '' : 's'} about ${epic} in ${project} — ${answered} answered, `
    + `${right} right. They are ${fileOf(project, epic)}, which a person may edit by hand.`
  const wrong = problems.length ? `\n\nWrong with the file:\n${problems.map((problem) => `  - ${problem}`).join('\n')}` : ''
  return `${head}\n\n${lines.join('\n\n')}${wrong}`
}

/**
 * Every write, bounded and then handed to the one function that decides. The
 * refusal sentence always comes from the store, so the page and this door
 * cannot tell somebody two different things about the same rule.
 */
function call(name: string, args: Record<string, unknown>, project: string): string {
  const agent = str(args.agent, 80) || AGENT

  if (name === 'add_quiz') {
    const epic = str(args.epic, MAX_EPIC)
    if (!epic) {
      throw new Error(
        'add_quiz needs an epic: the one whose paper this question is about, as list_epics spells it. A question '
        + 'belongs to an epic here, because that is how a reader finds it — the container shows the questions for '
        + 'whatever is open on the canvas.',
      )
    }
    const question = line(args.question, MAX_QUESTION)
    if (!question) throw new Error('add_quiz needs a question: the thing the reader is actually asked.')

    /* A non-array is refused rather than split: an option containing a comma
       would become two. */
    if (!Array.isArray(args.options)) {
      throw new Error(
        `add_quiz needs options: an ARRAY of between ${MIN_OPTIONS} and ${MAX_OPTIONS} strings, in the order they will `
        + 'be shown. A single string is not a list of options, however it is punctuated.',
      )
    }
    const answer = whole(args.answer)
    if (!Number.isFinite(answer)) {
      throw new Error(
        'add_quiz needs answer: which option is correct, as a whole number counting from 0. It is an index into '
        + 'options and not the text of one.',
      )
    }
    const path = line(args.path, MAX_PATH)
    const quote = str(args.quote, MAX_QUOTE)
    if (!path || !quote) {
      throw new Error(
        'add_quiz needs the passage this question is about: path and quote. That source is what makes "this question '
        + 'is about that paragraph" a fact rather than a vibe, and it is the one thing this module refuses to do '
        + 'without. Nothing was written.',
      )
    }
    const out = change({
      op: 'add',
      project,
      epic,
      question,
      options: args.options.slice(0, MAX_OPTIONS + 1).map((option) => line(option, MAX_OPTION)),
      answer,
      why: str(args.why, MAX_WHY),
      path,
      quote,
      agent,
    })
    if (!out.ok) throw new Error(out.error)
    return `${out.said}.\n\n${epicText(project, epic, false)}`
  }

  const id = str(args.id, MAX_ID)
  if (!id) {
    throw new Error(
      `${name} needs the id of the question, which the quizzes tool prints beside each one. It is not the words of the `
      + 'question and it is not its position in the list — both of those move, and an id does not.',
    )
  }
  /* An id is unique in a file, so the epic is asked for only when it has to be. */
  const held = str(args.epic, MAX_EPIC) ? [str(args.epic, MAX_EPIC)] : epicsOf(project, id)
  if (held.length !== 1) {
    throw new Error(
      held.length
        ? `there is a question "${id}" about each of ${held.join(', ')}. Say which with epic. Nothing was written.`
        : `there is no question "${id}" in this project. Questions are addressed by the id the quizzes tool prints beside each one.`,
    )
  }
  const epic = held[0]!

  if (name === 'drop_quiz') {
    const out = change({ op: 'drop', project, epic, id, agent })
    if (!out.ok) throw new Error(out.error)
    return `${out.said}.`
  }

  /* reword_quiz. `undefined` means "leave it", so a caller that sends only
     `why` changes only the explanation. An empty string is a caller asking to
     blank a field: refused for `question`, allowed for `why`. */
  if (args.options !== undefined && !Array.isArray(args.options)) {
    throw new Error('reword_quiz was given options that are not an array. Omit them to leave the options alone.')
  }
  const out = change({
    op: 'reword',
    project,
    epic,
    id,
    agent,
    ...(args.question === undefined ? {} : { question: line(args.question, MAX_QUESTION) }),
    ...(args.why === undefined ? {} : { why: str(args.why, MAX_WHY) }),
    ...(args.answer === undefined ? {} : { answer: whole(args.answer) }),
    ...(Array.isArray(args.options) ? { options: args.options.slice(0, MAX_OPTIONS + 1).map((option) => line(option, MAX_OPTION)) } : {}),
    ...(args.path === undefined ? {} : { path: line(args.path, MAX_PATH) }),
    ...(args.quote === undefined ? {} : { quote: str(args.quote, MAX_QUOTE) }),
  })
  if (!out.ok) throw new Error(out.error)
  return `${out.said}.\n\n${epicText(project, epic, false)}`
}

/** A status and a document. Nothing here writes bytes; the adapter does that. */
export interface Reply {
  status: number
  /** `null` means "answer with no body", which is what a notification gets. */
  body: unknown
}

const ok = (body: unknown): Reply => ({ status: 200, body })
const bad = (why: string, status = 400): Reply => ({ status, body: { ok: false, error: why } })

interface Rpc {
  id?: number | string
  method?: string
  params?: { name?: string; arguments?: Record<string, unknown> }
}

function mcp(rpc: Rpc): Reply {
  const reply = (result: unknown) => ok({ jsonrpc: '2.0', id: rpc.id ?? null, result })
  const text = (s: string, isError = false) =>
    reply({ content: [{ type: 'text', text: s }], ...(isError ? { isError } : {}) })

  if (rpc.method === 'initialize') {
    return reply({
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: ID, version: VERSION },
      instructions:
        'Multiple-choice questions about passages of a paper, and what a reader answered. You write them; a person '
        + 'answers them, and there is deliberately no tool here that answers one. Each epic’s questions are one Markdown '
        + 'file in the project (.kehikot/learning/<epic>.md) that a person may edit by hand; every question cites the '
        + 'file and the exact words it rests on. The correct option is withheld from the reader’s container until '
        + 'they have chosen, and from you unless you ask for it — do not give it away.',
    })
  }
  /* A notification carries no id and is answered with nothing. */
  if (typeof rpc.method === 'string' && rpc.method.startsWith('notifications/')) {
    return { status: 202, body: null }
  }
  if (rpc.method === 'tools/list') return reply({ tools: tools() })

  if (rpc.method === 'tools/call') {
    const name = String(rpc.params?.name ?? '')
    const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>

    /* Whether this is a tool at all is settled BEFORE the project is: a caller
       who misremembered the tool's name should be told that. */
    if (name !== 'quizzes' && name !== 'add_quiz' && name !== 'reword_quiz' && name !== 'drop_quiz') {
      const shown = name.length > 60 ? `${name.slice(0, 60)}…` : name
      return text(`no tool "${shown}" here`, true)
    }

    try {
      const gave = args.project !== undefined && args.project !== null && args.project !== ''
      const project = gave ? usablePath(args.project) : defaultProject()
      if (!project) return text(noProjectText(name), true)

      if (name === 'quizzes') {
        const epic = str(args.epic, MAX_EPIC)
        if (!epic) return text(standingsText(project))
        return text(epicText(project, epic, args.reveal === true))
      }
      return text(call(name, args, project))
    } catch (e) {
      /* A refusal is an answer, and the sentence is the useful half. So it
         comes back as a tool error the agent reads, not a transport failure. */
      return text(e instanceof Error ? e.message : String(e), true)
    }
  }

  return {
    status: 404,
    body: { jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32601, message: String(rpc.method) } },
  }
}

/**
 * Every door but the page, as one function.
 *
 * `null` means "this path is not ours", and the caller passes it on to Vite.
 */
export function answer(
  method: string,
  path: string,
  query: URLSearchParams,
  body: Record<string, unknown> | null,
  ticket: string | null,
): Reply | null {
  /* Alive, and saying nothing about anybody's questions: a health check has no project. */
  if (path === '/healthz') {
    return ok({ ok: true, id: ID, version: VERSION })
  }

  if (path === '/mcp') {
    if (method !== 'POST') return bad('the MCP door takes POST', 405)
    if (!body || typeof body.method !== 'string') {
      return { status: 400, body: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'not a request' } } }
    }
    return mcp(body as Rpc)
  }

  /*
   * One epic's questions, or one project's epics.
   *
   * Ungated, like every read here: this answer CONTAINS NO ANSWER KEY.
   * `forEpic` returns `Asked`, whose `answer` and `why` are null for anything
   * nobody has answered yet. `file` says where a person edits them, and what
   * is wrong with the file rides in `trouble`, in sentences that name no option.
   */
  if (path === '/api/questions' && method === 'GET') {
    const project = usablePath(query.get('project'))
    if (!project) {
      return bad(
        'that did not say which project. Questions are kept inside the project they are about, in '
        + '.kehikot/learning/, so without a path there is no file to open — and this app will not guess one, '
        + 'because a guess is one project’s questions shown under another project’s name.',
      )
    }
    const epic = str(query.get('epic'), MAX_EPIC)
    const { standings: rows, trouble: unusable } = standings(project)
    if (!epic) return ok({ ok: true, project, epic: null, standings: rows, questions: [], trouble: unusable })
    const { questions, problems, trouble } = forEpic(project, epic)
    const wrong = problems.length ? `${fileOf(project, epic)}: ${problems.join(' ')}` : null
    return ok({ ok: true, project, epic, file: fileOf(project, epic), standings: rows, questions, trouble: trouble ?? wrong })
  }

  /*
   * The editor's doors, and the one place the page is handed the file.
   *
   * `GET /api/quiz` answers with an epic's Markdown WHOLE — every tick and every
   * explanation. It is behind the ticket even though it is a read, because it
   * is the only read here that carries a key: nothing that is not this app's
   * own page gets it, and the page asks only when a person presses Edit. While
   * the editor is open the page does hold the answers; that is the trade, and
   * the person at the editor is the author. `POST /api/quiz` saves what they
   * typed (409 with what is there now when the file moved under them),
   * `/api/history` lists the writes that can be undone and `/api/undo` undoes one.
   */
  if (path === '/api/quiz' || path === '/api/history' || path === '/api/undo') {
    if (ticket !== TICKET) return bad('that did not come from this app’s own page', 403)
    const from = method === 'GET' ? { project: query.get('project'), epic: query.get('epic') } : (body ?? {})
    const project = usablePath(from.project)
    const epic = str(from.epic, MAX_EPIC)
    if (!project || !epic) return bad('that did not say which project and which epic.')
    const reads = method === 'GET'
    const out =
      path === '/api/quiz' && reads
        ? readQuiz(project, epic)
        : path === '/api/quiz' && method === 'POST' && typeof body?.text === 'string'
          ? writeQuiz(project, epic, body.text, typeof body.base === 'string' ? body.base : null, str(body.session, 64))
          : path === '/api/history' && reads
            ? quizHistory(project, epic)
            : path === '/api/undo' && method === 'POST'
              ? undoQuiz(project, epic, str(body?.id, MAX_ID))
              : { error: 'that was not a request this door takes.' }
    if ('error' in out) return { status: out.status ?? 400, body: { ok: false, error: out.error, ...(out.theirs ? { file: out.theirs } : {}) } }
    return ok({ ok: true, ...out })
  }

  if (method === 'POST' && path.startsWith('/api/')) {
    if (path !== '/api/answer' && path !== '/api/retake') {
      return bad(`there is no "${path}" here — the page posts to /api/answer or /api/retake.`, 404)
    }

    /* The gate on every write from the page. An agent's door is `/mcp` and is
       deliberately above this check: an MCP client has no page to have been
       handed a ticket. */
    if (ticket !== TICKET) return bad('that press did not come from this app’s own page', 403)
    if (!body) return bad('that was not a request')

    const project = usablePath(body.project)
    if (!project) {
      return bad(
        'that did not say which project the question is in. Questions are kept inside the project, in '
        + '.kehikot/learning/, so without a path there is no file to write to and nothing was recorded.',
      )
    }
    const epic = str(body.epic, MAX_EPIC)
    if (!epic) return bad('that did not say which epic the question is about, so nothing was recorded.')

    /*
     * The one place the answer key crosses the wire.
     *
     * The page posts an id and an index; this scores it HERE, against the
     * file, and replies with the verdict, the key and the explanation. This
     * route is the only one that records an attempt, it is behind the ticket,
     * and the MCP door has no equivalent.
     */
    if (path === '/api/answer') {
      const id = str(body.id, MAX_ID)
      if (!id) return bad('that answer did not say which question it was to.')
      const chose = whole(body.chose)
      if (!Number.isFinite(chose)) {
        return bad('that answer did not say which option was chosen, so nothing was recorded.')
      }
      const out = score(project, epic, id, chose)
      if ('error' in out) return bad(out.error)
      return ok({ ok: true, ...out.scored })
    }

    /*
     * Forget one epic's answers so the questions can be asked again. A
     * question with no attempts is one whose key is withheld again: retake
     * genuinely puts the answers back out of reach, on the wire as well.
     */
    const out = change({ op: 'retake', project, epic })
    if (!out.ok) return bad(out.error)
    const { questions, trouble } = forEpic(project, epic)
    return ok({ ok: true, said: out.said, questions, trouble })
  }

  /* An unknown path under `/api/` is ours to refuse rather than Vite's to try
     and serve as a source file. Anything else is not ours at all. */
  if (path.startsWith('/api/')) return bad('not here', 404)
  return null
}

export { MANIFEST }
