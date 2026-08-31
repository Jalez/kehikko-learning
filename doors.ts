import { ID, MANIFEST, VERSION } from './manifest.ts'
import {
  MAX_BY,
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
  forEpic,
  score,
  standings,
  withKey,
  type Op,
} from './quiz/questions.ts'
import { MAX_PROJECT, defaultProject, usablePath } from './quiz/projects.ts'

/**
 * Every door this app answers on that is not the page itself.
 *
 * ## Why this is a file of functions rather than a server
 *
 * A module is ONE ORIGIN or it is nothing. The protocol refuses a manifest whose
 * `entry` points anywhere but the origin that served the manifest, and it is
 * right to — a program that could name somebody else's page would be a program
 * that could have the host frame somebody else. The page is served by Vite,
 * because a `dist/` served off disk has cost this workspace whole afternoons of
 * a stale page answering 200 with every symptom of a working app and none of the
 * changes. So the page is Vite's, and therefore the manifest, the health check,
 * the MCP door and this app's own store have to be Vite's too — they cannot be a
 * second process on a second port however much tidier that would look.
 *
 * Hence: no listener here. `answer()` takes a method, a path, a query and a body
 * and returns a status and a document, and `vite.config.ts` adapts a node
 * request to it in a dozen lines.
 *
 * ## The one thing to know before changing anything here
 *
 * There are two ways out of this file for a question, and they carry different
 * things. `forEpic` produces `Asked`, which has no answer key in it until the
 * reader has answered; `withKey` produces `Question`, which does. Everything the
 * PAGE can reach uses the first. The second is reachable only through the MCP
 * door and only under an explicit `reveal: true`. See the essay on `asked` in
 * `quiz/questions.ts` for why, and note that `grep -n withKey doors.ts` is meant
 * to stay a short list.
 */

/* ------------------------------------------------------------------ *
 * Everything that arrives, bounded before it is looked at
 *
 * Nothing here trusts its caller. The page is one caller, an agent over MCP is
 * another, and a third is whatever else is running on this machine and found
 * the port — this listens on loopback, which is a fence around the machine and
 * not around the programs on it. A string has a length before it has a meaning.
 * ------------------------------------------------------------------ */

function str(value: unknown, max: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, max)
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function whole(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return Number.NaN
}

/**
 * The ticket a write has to carry.
 *
 * Minted once per process and printed into the page this server serves. It dies
 * with this process, the way a host's own send ticket does, because a secret
 * that outlives the thing that issued it is one nobody can revoke by restarting.
 *
 * What it separates is "this app's own page pressed something" from "something
 * else on this machine guessed the port and posted", and on a loopback server
 * that separation is not otherwise available. It is worth something here only
 * because the manifest declares `storage: true` and `vite.config.ts` sets no
 * `server.cors`: a page framed opaque would need permissive CORS to read its own
 * `/api`, and permissive CORS means any tab can read `/app` and take the ticket.
 * That was measured on Journeys rather than theorised.
 *
 * It is not an authorization check and there is nothing here it is the last line
 * of defence for — the questions are not secret and the ANSWER KEY is not behind
 * it, it is behind not being sent at all. What the ticket actually buys is that
 * a stray script cannot fill somebody's history with attempts they never made.
 */
export const TICKET = crypto.randomUUID()

/** The word an answer is filed under when the page gave it. */
const OWNER = 'the reader, on this app’s own page'

/** What an agent is called when it does not say. */
const AGENT = process.env.LEARNING_AGENT ?? process.env.ROADMAP_AGENT ?? 'an agent'

/* ------------------------------------------------------------------ *
 * The agent's door
 * ------------------------------------------------------------------ */

/**
 * How a tool says which project it means, written once because every tool here
 * needs it and would otherwise say it four slightly different ways.
 *
 * It is one argument and not an optional convenience, and it is now the thing
 * that says WHERE THE FILE IS rather than which key to look under: questions
 * live at `<project>/.kehikot/learning/questions.json`. See the essay in
 * `quiz/projects.ts` for why every available default is wrong, and why there is
 * no unpartitioned bucket left to fall back to.
 */
const PROJECT_PROPERTY = {
  project: {
    type: 'string',
    description:
      'The absolute path of the project this is about — the folder you are working in, the same one the canvas is '
      + 'standing in. Questions are kept INSIDE it, at .kehikot/learning/questions.json, so this is not a label but the place '
      + 'the file is; two projects both having an epic called "bridge" is the expected collision, not a hypothetical '
      + 'one, and they do not collide because they are two files in two folders. Required unless LEARNING_PROJECT is '
      + 'set in this app’s environment.',
  },
} as const

/**
 * The four tools, which are the whole of what an agent can do here.
 *
 * Streamable HTTP, one request one answer — no sessions and no stream, because
 * nothing here pushes.
 *
 * ## What is NOT here, and why
 *
 * **There is no tool that answers a question.** That omission is the module, not
 * an oversight. The division of labour is the whole point: an agent has just
 * read the chapter and knows what a reader should be able to say about it, so it
 * writes the questions; a PERSON answers them, because the entire value of the
 * record is that it says what a person understood. An agent answering its own
 * questions produces a store full of perfect scores that mean nothing, and an
 * agent answering somebody else's produces a lie about a person. So `quizzes`
 * reads how they were answered and there is no way through this door to answer
 * one.
 *
 * **There is no `reveal_answer` either**, and `quizzes` withholds the key by
 * default for the same reason the page does. An agent standing beside a reader
 * with the answer key is an agent that will, being helpful, tell them. The
 * `reveal` argument exists because an author genuinely needs to read back what
 * they wrote, and its description says plainly when not to use it — which is the
 * most a program can do about a caller that is trying to be kind.
 */
function tools() {
  return [
    {
      name: 'quizzes',
      description:
        'The questions written about a paper, and how they were answered. With no epic it answers with every epic in '
        + 'the project and what each adds up to; with an epic it prints that epic’s questions in the order they were '
        + 'written. A project is always needed: the questions are kept in the project’s own folder, so there is no '
        + 'central store to list. Read this BEFORE writing questions, so you do not ask the same thing twice, and AFTER a '
        + 'reader has been through them: a question somebody got wrong is the part of your explanation that did not '
        + 'work, and is worth more to you than the ones they got right.',
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
              + 'pane until they have chosen, and an assistant who has read the key is an assistant who will give it '
              + 'away. Questions that HAVE been answered always print their key — the reader has already seen it.',
          },
        },
      },
    },
    {
      name: 'add_quiz',
      description:
        'Write one multiple-choice question about a passage of a paper. This is the tool the module exists for: if '
        + 'you have just explained something from a chapter, the question that would check whether it landed belongs '
        + 'here, written now, while you still have the passage open. Anchor it — the document, the byte range and the '
        + 'exact source those bytes held — so that what the question is about is a fact rather than a claim. Write '
        + 'wrong options somebody could plausibly pick; three obviously silly ones and the right answer is not a '
        + 'question. Say in the explanation why the others are wrong, because that is what the reader reads when they '
        + 'get it wrong, and it is the only teaching this module does.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTY,
          epic: {
            type: 'string',
            description:
              'The epic whose paper this is about, as list_epics spells it — lower-case letters, digits and hyphens. '
              + 'It is the slug and not the title.',
          },
          question: { type: 'string', description: `What the reader is asked. Up to ${MAX_QUESTION} characters.` },
          options: {
            type: 'array',
            items: { type: 'string', maxLength: MAX_OPTION },
            minItems: MIN_OPTIONS,
            maxItems: MAX_OPTIONS,
            description:
              `Between ${MIN_OPTIONS} and ${MAX_OPTIONS} options, in the order they will be shown. They must all `
              + 'differ: two identical options mean one of them is marked wrong whichever the reader picks.',
          },
          answer: {
            type: 'integer',
            minimum: 0,
            description: 'Which option is correct, counting from 0. Index into options, not the text of one.',
          },
          why: {
            type: 'string',
            description:
              `The explanation, shown once the reader has chosen. Up to ${MAX_WHY} characters. Say why the other `
              + 'options are wrong, not only why this one is right.',
          },
          path: {
            type: 'string',
            description:
              'The document the passage is in, as the project spells it — a path relative to the project, not an '
              + 'absolute one.',
          },
          start: { type: 'integer', minimum: 0, description: 'Byte offset of the first byte of the passage.' },
          end: { type: 'integer', minimum: 0, description: 'Byte offset one past the last. Must be greater than start.' },
          quote: {
            type: 'string',
            description:
              `The source those bytes actually held, up to ${MAX_QUOTE} characters. Paste it rather than paraphrasing: `
              + 'this is what makes the anchor checkable after somebody edits the paper, because the byte range will '
              + 'shift silently and a quote that is no longer in the file says so.',
          },
          agent: { type: 'string', description: 'Your own name, so the question says who wrote it' },
        },
        required: ['epic', 'question', 'options', 'answer', 'path', 'start', 'end', 'quote'],
      },
    },
    {
      name: 'reword_quiz',
      description:
        'Sharpen a question that already exists, keeping its id, its passage and every answer given to it. For fixing '
        + 'wording, a misleading option, or a key you got wrong. To ask a different thing, write a different question '
        + '— a question changed enough that the old answers no longer mean anything has silently rewritten somebody’s '
        + 'history.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTY,
          id: { type: 'string', description: 'The question id, as the quizzes tool prints it' },
          question: { type: 'string', description: 'The new wording. Omit to leave it alone.' },
          options: {
            type: 'array',
            items: { type: 'string', maxLength: MAX_OPTION },
            description: 'The full new set of options, replacing the old. Omit to leave them alone.',
          },
          answer: { type: 'integer', minimum: 0, description: 'The new correct index. Omit to leave it alone.' },
          why: { type: 'string', description: 'The new explanation. Omit to leave it alone.' },
        },
        required: ['id'],
      },
    },
    {
      name: 'drop_quiz',
      description:
        'Take one question away for good, along with every answer anybody gave it. This is not reversible from here. '
        + 'A question that turned out to be about nothing is dropped; a question somebody keeps getting wrong is not — '
        + 'that one is telling you something.',
      inputSchema: {
        type: 'object',
        properties: {
          ...PROJECT_PROPERTY,
          id: { type: 'string', description: 'The question id' },
        },
        required: ['id'],
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * The answers, in words
 * ------------------------------------------------------------------ */

/**
 * The refusal for a call that did not say which project it meant.
 *
 * ## Why this replaced a listing, and what was lost
 *
 * `quizzes` with no project used to answer "which projects hold questions",
 * enumerated out of the one store this app kept. It was the most useful thing
 * that could be said to a caller who had not passed a path, because it told them
 * where their questions had actually gone.
 *
 * It cannot be said any more, and the reason is the point of the change: this
 * app no longer holds anybody's questions. They are inside the projects, at
 * `.kehikot/learning/questions.json`, and this process is handed one path at a time and
 * forgets it. Keeping a register of every project it had ever been shown, purely
 * to answer this, would be rebuilding the central store that was just removed.
 *
 * So this says where to look instead, which is a worse answer to the question
 * the caller asked and a better answer to the question behind it: the file is in
 * the folder, in plain sight, and `ls` finds it.
 */
function noProjectText(name: string): string {
  return (
    `${name} needs a project: the absolute path of the folder this is about. Questions are kept INSIDE the project `
    + 'they are about, at .kehikot/learning/questions.json, so the path is not a label — it is where the file is, and there is '
    + 'no central store to fall back to or to list. There is no default that would be right: this app is handed one '
    + 'project at a time and forgets it, and a guess would write somebody’s questions into a folder they will never '
    + `open. A path may not be empty, longer than ${MAX_PROJECT} characters, or contain a control character. Nothing `
    + 'was written.'
  )
}

/** One project, epic by epic, for an agent that did not name an epic. */
function standingsText(project: string): string {
  const { standings: rows, trouble, nowhere } = standings(project)
  if (nowhere) return noProjectText('quizzes')
  if (trouble) return trouble
  if (!rows.length) {
    return (
      `No questions have been written about anything in ${project}. add_quiz writes the first — anchor it to a passage `
      + 'of the paper the epic is aimed at.'
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

/**
 * One epic's questions, in words.
 *
 * `reveal` decides whether the key is printed for a question nobody has answered
 * yet. A question that HAS been answered prints its key regardless, because the
 * reader has already been shown it — withholding it from the agent at that point
 * would be protecting nothing while making the tool useless for its actual job,
 * which is reading what did and did not land.
 */
function epicText(project: string, epic: string, reveal: boolean): string {
  const { questions, trouble, nowhere } = withKey(project, epic)
  if (nowhere) return noProjectText('quizzes')
  if (trouble) return trouble
  if (!questions.length) {
    return (
      `No questions have been written about ${epic} in ${project}. add_quiz writes the first. If you have just `
      + 'explained a passage of that paper, this is the moment.'
    )
  }
  const lines = questions.map((question, at) => {
    const last = question.attempts.at(-1)
    const seen = last !== undefined
    const key = reveal || seen ? `  answer: ${question.answer}. ${question.options[question.answer] ?? ''}` : '  answer: withheld — nobody has answered this one yet'
    const said = seen
      ? `  the reader chose ${last.chose} (${question.options[last.chose] ?? '?'}) and was ${last.right ? 'right' : 'WRONG'}, ${last.at}`
        + (question.attempts.length > 1 ? ` — ${question.attempts.length} attempts in all` : '')
      : '  not answered yet'
    const why = (reveal || seen) && question.why ? `\n  why: ${question.why}` : ''
    return [
      `${at + 1}. ${question.id} — ${question.question}`,
      ...question.options.map((option, index) => `     [${index}] ${option}`),
      key,
      said,
      `  anchored to ${question.passage.path} bytes ${question.passage.start}–${question.passage.end}: `
      + `“${question.passage.quote.length > 160 ? `${question.passage.quote.slice(0, 160)}…` : question.passage.quote}”`,
      `  written by ${question.by}${question.viaMcp ? ', over MCP' : ''}, ${question.at}${why}`,
    ].join('\n')
  })
  const answered = questions.filter((question) => question.attempts.length).length
  const right = questions.filter((question) => question.attempts.at(-1)?.right).length
  const head = `${questions.length} question${questions.length === 1 ? '' : 's'} about ${epic} in ${project} — ${answered} answered, ${right} right`
  return `${head}\n\n${lines.join('\n\n')}`
}

/**
 * Every write, bounded and then handed to the one function that decides.
 *
 * The bounds are here and the rules are in `quiz/questions.ts`: a string has a
 * length before it has a meaning, and the question of whether a question exists
 * belongs where the questions are. The refusal sentence always comes from the
 * store, so the page and this door cannot end up telling somebody two different
 * things about the same press.
 */
function call(name: string, args: Record<string, unknown>, project: string): string {
  const by = str(args.agent, MAX_BY) || AGENT

  if (name === 'add_quiz') {
    const epic = str(args.epic, MAX_EPIC)
    if (!epic) {
      throw new Error(
        'add_quiz needs an epic: the one whose paper this question is about, as list_epics spells it. A question '
        + 'belongs to an epic here, because that is how a reader finds it — the pane shows the questions for whatever '
        + 'is open on the canvas.',
      )
    }
    const question = str(args.question, MAX_QUESTION)
    if (!question) throw new Error('add_quiz needs a question: the thing the reader is actually asked.')

    /* Options are bounded one by one rather than as a blob, and a non-array is
       refused rather than wrapped. `options: "a, b, c"` is a caller that meant
       three options; splitting it on commas would guess where, and an option
       containing a comma would then become two. */
    if (!Array.isArray(args.options)) {
      throw new Error(
        `add_quiz needs options: an ARRAY of between ${MIN_OPTIONS} and ${MAX_OPTIONS} strings, in the order they will `
        + 'be shown. A single string is not a list of options, however it is punctuated.',
      )
    }
    const options = args.options.slice(0, MAX_OPTIONS + 1).map((option) => str(option, MAX_OPTION))

    const answer = whole(args.answer)
    if (!Number.isFinite(answer)) {
      throw new Error(
        'add_quiz needs answer: which option is correct, as a whole number counting from 0. It is an index into '
        + 'options and not the text of one — a question whose key is a string would silently stop matching the moment '
        + 'somebody reworded the option.',
      )
    }

    const path = str(args.path, MAX_PATH)
    const quote = str(args.quote, MAX_QUOTE)
    const start = whole(args.start)
    const end = whole(args.end)
    if (!path || !quote || !Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error(
        'add_quiz needs the passage this question is about: path, start, end and quote. That anchor is what makes '
        + '"this question is about that paragraph" a fact rather than a vibe, and it is the one thing this module '
        + 'refuses to do without. Nothing was written.',
      )
    }

    const op: Op = {
      op: 'add',
      project,
      epic,
      question,
      options,
      answer,
      why: str(args.why, MAX_WHY),
      passage: { path, start, end, quote },
      by,
      viaMcp: true,
    }
    const out = change(op)
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

  if (name === 'drop_quiz') {
    const out = change({ op: 'drop', project, id })
    if (!out.ok) throw new Error(out.error)
    return `${out.said}.`
  }

  /* reword_quiz. Every field is optional and `undefined` means "leave it", so a
     caller that sends only `why` changes only the explanation. An empty string
     is NOT the same as absent: it is a caller asking to blank a field, and the
     store refuses it for `question` and allows it for `why`. */
  const op: Op = {
    op: 'reword',
    project,
    id,
    ...(args.question === undefined ? {} : { question: str(args.question, MAX_QUESTION) }),
    ...(args.why === undefined ? {} : { why: str(args.why, MAX_WHY) }),
    ...(args.answer === undefined ? {} : { answer: whole(args.answer) }),
    ...(Array.isArray(args.options)
      ? { options: args.options.slice(0, MAX_OPTIONS + 1).map((option) => str(option, MAX_OPTION)) }
      : {}),
  }
  if (args.options !== undefined && !Array.isArray(args.options)) {
    throw new Error('reword_quiz was given options that are not an array. Omit them to leave the options alone.')
  }
  const out = change(op)
  if (!out.ok) throw new Error(out.error)
  return `${out.said}.\n\n${epicText(project, str(args.epic, MAX_EPIC) || guessEpic(project, id), false)}`
}

/** Which epic a question is in, so a reword can print its neighbours back. */
function guessEpic(project: string, id: string): string {
  const { questions } = withKey(project, null)
  return questions.find((question) => question.id === id)?.epic ?? ''
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
        + 'answers them, and there is deliberately no tool here that answers one. Every question is anchored to a '
        + 'document, a byte range and the quoted source. The correct option is withheld from the reader’s pane until '
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

    /* Whether this is a tool at all is settled BEFORE the project is, because a
       caller who misremembered the tool's name should be told that and not
       handed a paragraph about project partitioning — a refusal that answers the
       wrong question is a refusal somebody acts on wrongly. */
    if (name !== 'quizzes' && name !== 'add_quiz' && name !== 'reword_quiz' && name !== 'drop_quiz') {
      const shown = name.length > 60 ? `${name.slice(0, 60)}…` : name
      return text(`no tool "${shown}" here`, true)
    }

    try {
      /* The project is settled once, before any tool runs, because every tool
         here needs one and a refusal about it is the same sentence in all four
         cases. There used to be an exception — `quizzes` with no project listed
         the projects this app held questions for — and it is gone with the
         central store it read: see `noProjectText`. */
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
      /* A refusal is an answer, and the sentence is the useful half — every one
         of them names what to do instead. So it comes back as a tool error the
         agent reads, not as a transport failure it retries. */
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
 * `null` means "this path is not ours", and the caller passes it on to Vite —
 * which is how the page, the client module and Vite's own hot-reload socket keep
 * working without being enumerated here.
 */
export function answer(
  method: string,
  path: string,
  query: URLSearchParams,
  body: Record<string, unknown> | null,
  ticket: string | null,
): Reply | null {
  /*
   * Alive, and deliberately saying nothing about anybody's questions.
   *
   * It used to count them — projects held, questions in all of them — because
   * there was one store beside this program and counting it was free. There is
   * no such store now: every question is inside the project it is about, and a
   * health check has no project. It could not answer the old question without
   * being handed a path, and a health check that needs an argument is not one.
   *
   * `ok` is therefore unconditionally true and means only what it says: this
   * process is running and answering. Whether one particular project's file
   * parses is a question with a project in it, and the doors that have one
   * answer it, with a sentence.
   */
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
   * Ungated, like every read here, and for a sharper reason than "a checklist is
   * not a secret": this answer CONTAINS NO ANSWER KEY. `forEpic` returns `Asked`,
   * whose `answer` and `why` are null for anything nobody has answered yet. So
   * there is nothing here worth gating — and gating it would only mean the page
   * needed a ticket to read what it is about to draw.
   */
  if (path === '/api/questions' && method === 'GET') {
    const project = usablePath(query.get('project'))
    if (!project) {
      return bad(
        'that did not say which project. Questions are kept inside the project they are about, at '
        + '.kehikot/learning/questions.json, so without a path there is no file to open — and this app will not guess one, '
        + 'because a guess is one project’s questions shown under another project’s name.',
      )
    }
    const epic = str(query.get('epic'), MAX_EPIC)
    if (!epic) {
      const { standings: rows, trouble } = standings(project)
      return ok({ ok: true, project, epic: null, standings: rows, questions: [], trouble })
    }
    const { questions, trouble } = forEpic(project, epic)
    const { standings: rows } = standings(project)
    return ok({ ok: true, project, epic, standings: rows, questions, trouble })
  }

  if (method === 'POST' && path.startsWith('/api/')) {
    /* Whether this is a door at all comes first, so that a POST to a path this
       app does not have is told THAT rather than being told about a missing
       project. Named rather than shrugged at, because the page and this store
       are one program: a path this door does not know is this app's own bug and
       the next person to read a log is the one who has to find it. */
    if (path !== '/api/answer' && path !== '/api/retake') {
      return bad(`there is no "${path}" here — the page posts to /api/answer or /api/retake.`, 404)
    }

    /* The gate on every write, and it is one line because the whole argument for
       it is in `TICKET` above. An agent's door is `/mcp` and is deliberately
       above this check: an MCP client is not a browser, has no page to have been
       handed a ticket, and requiring one there would mean the door could never
       be opened by the thing it exists for. */
    if (ticket !== TICKET) return bad('that press did not come from this app’s own page', 403)
    if (!body) return bad('that was not a request')

    const project = usablePath(body.project)
    if (!project) {
      return bad(
        'that did not say which project the question is in. Questions are kept inside the project, at '
        + '.kehikot/learning/questions.json, so without a path there is no file to write to and nothing was recorded.',
      )
    }

    /*
     * The one place the answer key crosses the wire.
     *
     * The page posts an id and an index; this scores it HERE, against the store,
     * and replies with the verdict, the key and the explanation. Nothing the
     * browser held before this request could have produced the verdict, which is
     * the whole of the answer-visibility decision — see `asked` and `score` in
     * `quiz/questions.ts`. Filed under `OWNER` in the sense that matters: this
     * route is the only one that records an attempt, it is behind the ticket, and
     * the MCP door has no equivalent.
     */
    if (path === '/api/answer') {
      const id = str(body.id, MAX_ID)
      if (!id) return bad('that answer did not say which question it was to.')
      const chose = whole(body.chose)
      if (!Number.isFinite(chose)) {
        return bad('that answer did not say which option was chosen, so nothing was recorded.')
      }
      const out = score(project, id, chose)
      if ('error' in out) return bad(out.error)
      return ok({ ok: true, by: OWNER, ...out.scored })
    }

    /*
     * Forget one epic's answers so the questions can be asked again.
     *
     * This is where "the same question can be asked again later" is a fact
     * rather than a promise, and it has a second effect worth noticing: a
     * question with no attempts is one whose key is withheld again. Pressing
     * retake genuinely puts the answers back out of reach, in the store and
     * therefore on the wire, rather than merely hiding them.
     */
    if (path === '/api/retake') {
      const epic = str(body.epic, MAX_EPIC)
      if (!epic) return bad('that did not say which epic to forget the answers for.')
      const out = change({ op: 'retake', project, epic })
      if (!out.ok) return bad(out.error)
      const { questions, trouble } = forEpic(project, epic)
      return ok({ ok: true, said: out.said, questions, trouble })
    }
  }

  /* An unknown path under `/api/` is ours to refuse rather than Vite's to try
     and serve as a source file. Anything else is not ours at all. */
  if (path.startsWith('/api/')) return bad('not here', 404)
  return null
}

export { MANIFEST }
