import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEHIKOT_DIR } from 'kehikot-module-protocol'

import { TICKET, answer } from '../doors.ts'

/**
 * Both doors, without a browser and without a socket.
 *
 * `answer()` takes a method, a path, a query, a body and a ticket, and returns a
 * status and a document — so every route here is a function call, and the tests
 * exercise exactly the code a request would. What is NOT covered is the adapter
 * in `vite.config.ts`, which reads the body off a node request and passes it in;
 * that is a dozen lines and its failure mode is loud.
 */

let dir = ''
let A = ''
let B = ''

beforeEach(() => {
  /* Two REAL directories. The store resolves a project path with `realpathSync`
     before it writes under it, so a plausible-looking string is refused — which
     is the point of the fence and would make every route here answer with a
     complaint if the projects were invented. `realpathSync` on the temp root
     because macOS puts it behind a symlink. */
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-doors-')))
  A = join(dir, 'one')
  B = join(dir, 'two')
  mkdirSync(A)
  mkdirSync(B)
  /* The document the fixture questions cite has to EXIST and hold the quoted
     words exactly once: the store refuses a source that already points nowhere. */
  mkdirSync(join(A, 'chapters'))
  writeFileSync(join(A, 'chapters', 'bridge.tex'), 'So the manifest is the smallest half of this program, and the only half a host reads.')
  mkdirSync(join(B, 'chapters'))
  writeFileSync(join(B, 'chapters', 'bridge.tex'), 'So the manifest is the smallest half of this program, and the only half a host reads.')
  delete process.env.LEARNING_PROJECT
  delete process.env.KEHIKOT_PROJECT
  delete process.env.ROADMAP_PROJECT
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const nothing = new URLSearchParams()

/** One JSON-RPC tool call, and the text it answered with. */
function tool(name: string, args: Record<string, unknown> = {}): { text: string; isError: boolean } {
  const reply = answer('POST', '/mcp', nothing, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, null)
  const body = reply?.body as { result?: { content?: { text?: string }[]; isError?: boolean } }
  return { text: body.result?.content?.[0]?.text ?? '', isError: body.result?.isError === true }
}

/* A function rather than a constant, because `A` is a different directory in
   every test now. */
const good = (): Record<string, unknown> => ({
  project: A,
  epic: 'modes-are-modules',
  question: 'What does a manifest settle?',
  options: ['Which tab the page gets', 'What colour the container is', 'Who owns the repository'],
  answer: 0,
  why: 'The manifest is the only half a host reads.',
  path: 'chapters/bridge.tex',
  quote: 'the manifest is the smallest half of this program',
})

/** Add one question and hand back its id, read off what the tool printed. */
function added(over: Record<string, unknown> = {}): string {
  const { text, isError } = tool('add_quiz', { ...good(), ...over })
  expect(isError).toBe(false)
  const id = /Question ([0-9a-f]{8}) written/.exec(text)?.[1]
  expect(id).toBeTruthy()
  return id ?? ''
}

const RIGHT = 'Which tab the page gets'
const WRONG = 'What colour the container is'

interface Shown {
  id: string
  options: string[]
  answer: number | null
  why: string | null
  attempts: { chose: number; right: boolean }[]
}

/** One epic's questions as the page is sent them — options in the SHOWN order. */
function shown(project = A, epic = 'modes-are-modules'): Shown[] {
  const reply = answer('GET', '/api/questions', new URLSearchParams({ project, epic }), null, null)
  return (reply?.body as { questions: Shown[] }).questions
}

/**
 * Press an option the way a reader does: by its words, at whatever position
 * the page was shown it. The page never knows the file's order, so neither
 * does a test that stands where the page stands.
 */
function press(id: string, words: string, epic = 'modes-are-modules') {
  const chose = shown(A, epic).find((one) => one.id === id)?.options.indexOf(words) ?? -1
  expect(chose).toBeGreaterThanOrEqual(0)
  const reply = answer('POST', '/api/answer', nothing, { project: A, epic, id, chose }, TICKET)
  return reply?.body as { ok: boolean; right: boolean; answer: number; why: string; attempt: { chose: number; right: boolean }; asked: Shown }
}

/* ------------------------------------------------------------------ *
 * The shape of the MCP door
 * ------------------------------------------------------------------ */

describe('the MCP door', () => {
  test('takes POST and nothing else', () => {
    expect(answer('GET', '/mcp', nothing, null, null)?.status).toBe(405)
  })

  test('a body that is not a request is refused as one', () => {
    const reply = answer('POST', '/mcp', nothing, { hello: 'there' }, null)
    expect(reply?.status).toBe(400)
    expect((reply?.body as { error?: { code?: number } }).error?.code).toBe(-32600)
  })

  test('initialize names this app and says what the door is for', () => {
    const reply = answer('POST', '/mcp', nothing, { jsonrpc: '2.0', id: 1, method: 'initialize' }, null)
    const result = (reply?.body as { result?: { serverInfo?: { name?: string }; instructions?: string } }).result
    expect(result?.serverInfo?.name).toBe('kehikot.learning')
    expect(result?.instructions).toContain('withheld')
  })

  test('a notification is answered with nothing at all', () => {
    const reply = answer('POST', '/mcp', nothing, { jsonrpc: '2.0', method: 'notifications/initialized' }, null)
    expect(reply?.status).toBe(202)
    expect(reply?.body).toBeNull()
  })

  test('the four tools, and no more', () => {
    const reply = answer('POST', '/mcp', nothing, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, null)
    const tools = (reply?.body as { result?: { tools?: { name: string }[] } }).result?.tools ?? []
    expect(tools.map((t) => t.name).sort()).toEqual(['add_quiz', 'drop_quiz', 'quizzes', 'reword_quiz'])
  })

  test('there is deliberately no tool that answers a question', () => {
    /* A person answers them. An agent answering its own questions produces a
       store full of perfect scores that mean nothing. */
    const reply = answer('POST', '/mcp', nothing, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, null)
    const names = ((reply?.body as { result?: { tools?: { name: string }[] } }).result?.tools ?? []).map((t) => t.name)
    expect(names).not.toContain('answer_quiz')
    expect(names).not.toContain('check_answers')
  })

  test('an unknown tool is named back rather than shrugged at', () => {
    const { text, isError } = tool('take_the_test')
    expect(isError).toBe(true)
    expect(text).toContain('no tool "take_the_test" here')
  })

  test('an unknown method is a JSON-RPC method-not-found', () => {
    const reply = answer('POST', '/mcp', nothing, { jsonrpc: '2.0', id: 1, method: 'resources/list' }, null)
    expect(reply?.status).toBe(404)
    expect((reply?.body as { error?: { code?: number } }).error?.code).toBe(-32601)
  })
})

/* ------------------------------------------------------------------ *
 * Argument validation, tool by tool
 * ------------------------------------------------------------------ */

describe('the project argument', () => {
  test('quizzes with no project now refuses too, and says where to look instead', () => {
    /* It used to LIST the projects this app held questions for, which was the
       most useful thing that could be said to a caller with no path. There is no
       central store to list any more: the questions are inside the projects. So
       the refusal says where they are rather than enumerating them, and the
       question behind the old one — "where did mine go?" — is answered better by
       `ls` than by this tool. */
    const { text, isError } = tool('quizzes')
    expect(isError).toBe(true)
    expect(text).toContain('needs a project')
    expect(text).toContain('.kehikot/learning/')
    expect(text).toContain('no central store')
  })

  test('every tool refuses without one, and says what to pass', () => {
    for (const name of ['quizzes', 'add_quiz', 'reword_quiz', 'drop_quiz']) {
      const { text, isError } = tool(name, { ...good(), project: undefined, id: 'deadbeef' })
      expect(isError).toBe(true)
      expect(text).toContain('needs a project')
      expect(text).toContain('Nothing was written')
    }
  })

  test('a project that is not a usable path is refused', () => {
    const { text, isError } = tool('add_quiz', { ...good(), project: '   ' })
    expect(isError).toBe(true)
    expect(text).toContain('needs a project')
  })

  test('a project that is not on this machine is refused with a sentence, and nothing is guessed', () => {
    const { text, isError } = tool('add_quiz', { ...good(), project: join(dir, 'no-such-folder') })
    expect(isError).toBe(true)
    expect(text).toContain('there is no folder at')
    expect(existsSync(join(A, KEHIKOT_DIR))).toBe(false)
  })

  test('a question written for one project is in that project’s folder and no other', () => {
    added()
    expect(existsSync(join(A, KEHIKOT_DIR, 'learning', 'modes-are-modules.md'))).toBe(true)
    expect(existsSync(join(B, KEHIKOT_DIR))).toBe(false)
  })

  test('LEARNING_PROJECT is a default a person set, not a guess', () => {
    process.env.LEARNING_PROJECT = A
    const { isError } = tool('add_quiz', { ...good(), project: undefined })
    expect(isError).toBe(false)
    expect(tool('quizzes', { epic: 'modes-are-modules' }).text).toContain('What does a manifest settle?')
    delete process.env.LEARNING_PROJECT
  })
})

describe('add_quiz', () => {
  test('writes a question and prints the epic back without the key', () => {
    const { text, isError } = tool('add_quiz', good())
    expect(isError).toBe(false)
    expect(text).toContain('written about modes-are-modules')
    expect(text).toContain('answer: withheld — nobody has answered this one yet')
    expect(text).not.toContain('answer: 0.')
  })

  test('needs an epic', () => {
    const { text, isError } = tool('add_quiz', { ...good(), epic: undefined })
    expect(isError).toBe(true)
    expect(text).toContain('add_quiz needs an epic')
  })

  test('needs a question', () => {
    const { text, isError } = tool('add_quiz', { ...good(), question: '' })
    expect(isError).toBe(true)
    expect(text).toContain('needs a question')
  })

  test('refuses options that are a string, rather than splitting them', () => {
    /* `options: "a, b, c"` is a caller that meant three options; splitting on
       commas would guess where, and an option containing a comma would become
       two. */
    const { text, isError } = tool('add_quiz', { ...good(), options: 'a, b, c' })
    expect(isError).toBe(true)
    expect(text).toContain('an ARRAY')
    expect(text).toContain('however it is punctuated')
  })

  test('needs an answer index, and says it is an index and not a string', () => {
    const { text, isError } = tool('add_quiz', { ...good(), answer: 'Which tab the page gets' })
    expect(isError).toBe(true)
    expect(text).toContain('as a whole number counting from 0')
    expect(text).toContain('not the text of one')
  })

  test('an answer index past the end is refused by the store', () => {
    const { text, isError } = tool('add_quiz', { ...good(), answer: 9 })
    expect(isError).toBe(true)
    expect(text).toContain('between 0 and 2')
  })

  test('needs the passage, as a path and the words', () => {
    for (const missing of [{ path: '' }, { quote: '' }]) {
      const { text, isError } = tool('add_quiz', { ...good(), ...missing })
      expect(isError).toBe(true)
      expect(text).toContain('path and quote')
      expect(text).toContain('Nothing was written')
    }
  })

  test('takes no byte range: one sent by an older caller is ignored, and the words are what is found', () => {
    added({ start: 500, end: 100 })
    expect(tool('quizzes', { project: A, epic: 'modes-are-modules' }).text).toContain('cites chapters/bridge.tex, line 1')
  })

  test('refuses words that are not in the file, or are in it twice', () => {
    const adrift = tool('add_quiz', { ...good(), quote: 'the manifest is the larger half' })
    expect(adrift.isError).toBe(true)
    expect(adrift.text).toContain('those words are not in chapters/bridge.tex')
    const twice = tool('add_quiz', { ...good(), quote: 'half' })
    expect(twice.isError).toBe(true)
    expect(twice.text).toContain('occur 2 times')
    expect(existsSync(join(A, KEHIKOT_DIR, 'learning', 'modes-are-modules.md'))).toBe(false)
  })

  test('refuses text the file would read as structure, rather than writing a broken file', () => {
    const { text, isError } = tool('add_quiz', { ...good(), why: 'Because.\n## And another thing\n- [x] hidden' })
    expect(isError).toBe(true)
    expect(text).toContain('would read as structure')
  })

  test('writes Markdown a person can read and edit, with the source listed below', () => {
    const id = added()
    expect(readFileSync(join(A, KEHIKOT_DIR, 'learning', 'modes-are-modules.md'), 'utf8')).toBe(
      [
        '## What does a manifest settle? [^1]',
        `<!-- id: ${id} -->`,
        '- [x] Which tab the page gets',
        '- [ ] What colour the container is',
        '- [ ] Who owns the repository',
        '',
        'Why:',
        'The manifest is the only half a host reads.',
        '',
        'Sources:',
        '[^1]: chapters/bridge.tex | "the manifest is the smallest half of this program"',
        '',
      ].join('\n'),
    )
  })

  test('two questions about the same words share one source line', () => {
    added()
    added({ question: 'And what does a host read?' })
    const text = readFileSync(join(A, KEHIKOT_DIR, 'learning', 'modes-are-modules.md'), 'utf8')
    expect(text.match(/^\[\^/gm)).toHaveLength(1)
    expect(text).toContain('## And what does a host read? [^1]')
  })

  test('an epic that is not a slug is refused', () => {
    const { text, isError } = tool('add_quiz', { ...good(), epic: 'Modes Are Modules' })
    expect(isError).toBe(true)
    expect(text).toContain('is not an epic slug')
  })
})

describe('quizzes', () => {
  test('with a project and no epic, it counts each epic', () => {
    added()
    added({ epic: 'bridge', question: 'A bridge question' })
    const { text } = tool('quizzes', { project: A })
    expect(text).toContain('modes-are-modules — 1 question, 0 answered, 0 right')
    expect(text).toContain('bridge — 1 question, 0 answered, 0 right')
  })

  test('withholds the key by default, and says so', () => {
    added()
    const { text } = tool('quizzes', { project: A, epic: 'modes-are-modules' })
    expect(text).toContain('answer: withheld')
    expect(text).not.toContain('The manifest is the only half a host reads.')
  })

  test('reveal: true hands it over, for an author checking their own work', () => {
    added()
    const { text } = tool('quizzes', { project: A, epic: 'modes-are-modules', reveal: true })
    expect(text).toContain('answer: 0. Which tab the page gets')
    expect(text).toContain('why: The manifest is the only half a host reads.')
  })

  test('a question that HAS been answered always prints its key', () => {
    /* The reader has already been shown it; withholding it from the agent at
       that point protects nothing and makes the tool useless for its job. */
    const id = added()
    press(id, WRONG)
    const { text } = tool('quizzes', { project: A, epic: 'modes-are-modules' })
    expect(text).toContain('answer: 0. Which tab the page gets')
    /* In the FILE's numbering, whatever position the page showed it at. */
    expect(text).toContain(`the reader chose 1 (${WRONG}) and was WRONG`)
  })

  test('prints the source, which is the module’s whole claim, and where the file is', () => {
    added()
    const { text } = tool('quizzes', { project: A, epic: 'modes-are-modules' })
    expect(text).toContain('cites chapters/bridge.tex, line 1: “the manifest is the smallest half of this program”')
    expect(text).toContain(`They are ${KEHIKOT_DIR}/learning/modes-are-modules.md`)
  })

  test('reads a file a person typed by hand, and says what is wrong with it without giving the key away', () => {
    mkdirSync(join(A, KEHIKOT_DIR, 'learning'), { recursive: true })
    writeFileSync(
      join(A, KEHIKOT_DIR, 'learning', 'by-hand.md'),
      '## Which half does a host read? [^a]\n- the page\n- [x] the manifest\n\n## Unfinished\n- one\n- two\n\nSources:\n[^a]: chapters/bridge.tex | "the only half a host reads"\n',
    )
    const { text } = tool('quizzes', { project: A, epic: 'by-hand' })
    expect(text).toContain('Which half does a host read?')
    expect(text).toContain('answer: withheld')
    expect(text).not.toContain('answer: 1')
    expect(text).toContain('NOT ASKED')
    expect(text).toContain('Wrong with the file:')
    expect(text).toContain('has no option ticked')
    expect(text).toContain('names no source')
    /* The page is sent the one that can be asked, and the sentence — never the tick. */
    const reply = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'by-hand' }), null, null)
    const body = reply?.body as { questions: { answer: number | null; source: { status: string } }[]; trouble: string; file: string }
    expect(body.questions).toHaveLength(1)
    expect(body.questions[0]?.answer).toBeNull()
    expect(body.questions[0]?.source.status).toBe('holds')
    expect(body.file).toBe(`${KEHIKOT_DIR}/learning/by-hand.md`)
    expect(body.trouble).toContain('has no option ticked')
    expect(JSON.stringify(body.questions)).not.toContain('"answer":1')
  })

  test('an epic with nothing in it says so, and says what to do', () => {
    const { text, isError } = tool('quizzes', { project: A, epic: 'nothing-here' })
    expect(isError).toBe(false)
    expect(text).toContain('No questions have been written about nothing-here')
  })

  test('one project’s questions are not another’s', () => {
    added({ project: A, question: 'The question in project one' })
    added({ project: B, question: 'The question in project two' })
    expect(tool('quizzes', { project: A, epic: 'modes-are-modules' }).text).toContain('The question in project one')
    expect(tool('quizzes', { project: A, epic: 'modes-are-modules' }).text).not.toContain('The question in project two')
    expect(tool('quizzes', { project: B, epic: 'modes-are-modules' }).text).toContain('The question in project two')
  })
})

describe('where the document is', () => {
  test('add_quiz takes the absolute path the other doors on the canvas hand out, and writes it relative', () => {
    const id = added({ path: join(A, 'chapters', 'bridge.tex') })
    const { text } = tool('quizzes', { project: A, epic: 'modes-are-modules' })
    expect(text).toContain(`${id}`)
    expect(text).toContain('cites chapters/bridge.tex')
    expect(text).not.toContain(`cites ${A}`)
  })

  test('add_quiz refuses a source whose document is not in the project', () => {
    /* A file name relative to the PAPER, handed to a door that reads it
       relative to the PROJECT. Refused while the caller can still fix it. */
    const { text, isError } = tool('add_quiz', { ...good(), path: 'chapters/agents.tex' })
    expect(isError).toBe(true)
    expect(text).toContain('"chapters/agents.tex" is not a readable file inside this project')
    expect(text).toContain('relative to something else')
    expect(text).toContain('Nothing was written')
    const outside = tool('add_quiz', { ...good(), path: join(B, 'chapters', 'bridge.tex') })
    expect(outside.isError).toBe(true)
    expect(outside.text).toContain('not relative to the project and inside it')
  })

  test('quizzes says, beside the source, when it no longer resolves — the agent is the one who can fix it', () => {
    const id = added()
    writeFileSync(join(A, 'chapters', 'bridge.tex'), 'The paper was rewritten.')
    const adrift = tool('quizzes', { project: A, epic: 'modes-are-modules' }).text
    expect(adrift).toContain(id)
    expect(adrift).toContain('the source does NOT resolve: chapters/bridge.tex no longer has these words')
    rmSync(join(A, 'chapters', 'bridge.tex'))
    const gone = tool('quizzes', { project: A, epic: 'modes-are-modules' }).text
    expect(gone).toContain('the source does NOT resolve: chapters/bridge.tex is not a readable file')
    expect(gone).toContain('reword_quiz with path')
  })

  test('the page is told the same thing, on every read: holds, ambiguous, adrift, unreadable', () => {
    const id = added()
    const status = () => {
      const reply = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'modes-are-modules' }), null, null)
      return (reply?.body as { questions: { id: string; source: { status: string; at: { from: number; to: number; line: number } | null; count: number } }[] }).questions.find((q) => q.id === id)?.source
    }
    /* Found where the words are: byte offsets, which is what a passage carries. */
    expect(status()).toMatchObject({ status: 'holds', at: { from: 3, to: 52, line: 1 }, count: 1 })
    /* An edit ABOVE the passage moves the range with it instead of rotting it. */
    writeFileSync(join(A, 'chapters', 'bridge.tex'), 'A new opening line.\nSo the manifest is the smallest\nhalf of this program.')
    expect(status()).toMatchObject({ status: 'holds', at: { from: 23, line: 2 } })
    writeFileSync(join(A, 'chapters', 'bridge.tex'), 'the manifest is the smallest half of this program, twice: the manifest is the smallest half of this program')
    expect(status()).toMatchObject({ status: 'ambiguous', count: 2 })
    writeFileSync(join(A, 'chapters', 'bridge.tex'), 'Rewritten.')
    expect(status()).toMatchObject({ status: 'adrift', at: null })
    rmSync(join(A, 'chapters', 'bridge.tex'))
    expect(status()).toMatchObject({ status: 'unreadable', at: null })
  })
})

describe('reword_quiz and drop_quiz', () => {
  test('both need an id, and say it is not the words', () => {
    for (const name of ['reword_quiz', 'drop_quiz']) {
      const { text, isError } = tool(name, { project: A })
      expect(isError).toBe(true)
      expect(text).toContain('needs the id of the question')
      expect(text).toContain('both of those move, and an id does not')
    }
  })

  test('a reword keeps the id and every answer', () => {
    const id = added()
    press(id, RIGHT)
    const { text, isError } = tool('reword_quiz', { project: A, id, question: 'A sharper question' })
    expect(isError).toBe(false)
    expect(text).toContain(`Question ${id} reworded`)
    expect(text).toContain('A sharper question')
    expect(text).toContain('was right')
  })

  test('a reword with options that are not an array is refused', () => {
    const id = added()
    const { text, isError } = tool('reword_quiz', { project: A, id, options: 'a, b' })
    expect(isError).toBe(true)
    expect(text).toContain('not an array')
  })

  test('a reword can re-spell the source’s path alone, keeping the quote', () => {
    /* The document moved inside the project, and the agent gives the absolute
       path, which is the one spelling it can produce without knowing where the
       paper module keeps papers. */
    const id = added()
    mkdirSync(join(A, 'moved'))
    writeFileSync(join(A, 'moved', 'bridge.tex'), 'the manifest is the smallest half of this program')
    const { text, isError } = tool('reword_quiz', { project: A, id, path: join(A, 'moved', 'bridge.tex') })
    expect(isError).toBe(false)
    expect(text).toContain(`Question ${id} reworded and now cites moved/bridge.tex`)
    expect(text).toContain('cites moved/bridge.tex, line 1')
    expect(text).not.toContain('does NOT resolve')
    /* The line nobody cites any more is gone from the file. */
    expect(readFileSync(join(A, KEHIKOT_DIR, 'learning', 'modes-are-modules.md'), 'utf8')).not.toContain('chapters/bridge.tex')
  })

  test('a reword cannot cite a document that is not there', () => {
    const id = added()
    const { text, isError } = tool('reword_quiz', { project: A, id, path: 'chapters/gone.tex' })
    expect(isError).toBe(true)
    expect(text).toContain('"chapters/gone.tex" is not a readable file inside this project')
    /* And the source is exactly as it was. */
    expect(tool('quizzes', { project: A, epic: 'modes-are-modules' }).text).toContain('cites chapters/bridge.tex')
  })

  test('a drop says how many answers went with it', () => {
    const id = added()
    answer('POST', '/api/answer', nothing, { project: A, epic: 'modes-are-modules', id, chose: 0 }, TICKET)
    const { text, isError } = tool('drop_quiz', { project: A, id })
    expect(isError).toBe(false)
    expect(text).toContain('1 answer')
  })

  test('a question in another project is not addressable', () => {
    const id = added({ project: A })
    const { text, isError } = tool('drop_quiz', { project: B, id })
    expect(isError).toBe(true)
    expect(text).toContain(`there is no question "${id}" in this project`)
  })
})

/* ------------------------------------------------------------------ *
 * The page's doors
 * ------------------------------------------------------------------ */

describe('/api/questions', () => {
  test('needs a project, and says why', () => {
    const reply = answer('GET', '/api/questions', new URLSearchParams({ epic: 'x' }), null, null)
    expect(reply?.status).toBe(400)
    expect((reply?.body as { error: string }).error).toContain('kept inside the project')
    expect((reply?.body as { error: string }).error).toContain('will not guess')
  })

  test('DOES NOT CARRY THE KEY for a question nobody has answered', () => {
    /* The assertion this whole module is built around. */
    added()
    const reply = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'modes-are-modules' }), null, null)
    const body = reply?.body as { questions: { answer: number | null; why: string | null; options: string[] }[] }
    expect(body.questions).toHaveLength(1)
    expect(body.questions[0]?.answer).toBeNull()
    expect(body.questions[0]?.why).toBeNull()
    /* And nothing else is missing — this is a projection, not a stub. */
    expect(body.questions[0]?.options).toHaveLength(3)

    /* Not anywhere else in the document either, under any name. */
    const serialised = JSON.stringify(reply?.body)
    expect(serialised).not.toContain('The manifest is the only half a host reads.')
    expect(serialised).not.toContain('"answer": 0')
  })

  test('carries the key once there is an attempt', () => {
    const id = added()
    press(id, WRONG)
    const [question] = shown()
    /* The key is a position in the order shown, and it is on the right words. */
    expect(question?.options[question.answer ?? -1]).toBe(RIGHT)
    expect(question?.options[question.attempts[0]?.chose ?? -1]).toBe(WRONG)
    expect(question?.why).toBe('The manifest is the only half a host reads.')
  })

  test('with no epic it answers with the standings and no questions', () => {
    added()
    const reply = answer('GET', '/api/questions', new URLSearchParams({ project: A }), null, null)
    const body = reply?.body as { epic: null; standings: unknown[]; questions: unknown[] }
    expect(body.epic).toBeNull()
    expect(body.standings).toHaveLength(1)
    expect(body.questions).toHaveLength(0)
  })

  test('one project’s questions are not visible under another', () => {
    added({ project: A })
    const reply = answer('GET', '/api/questions', new URLSearchParams({ project: B, epic: 'modes-are-modules' }), null, null)
    expect((reply?.body as { questions: unknown[] }).questions).toHaveLength(0)
  })
})

describe('/api/answer', () => {
  test('is refused without the ticket', () => {
    const id = added()
    const reply = answer('POST', '/api/answer', nothing, { project: A, epic: 'modes-are-modules', id, chose: 0 }, 'a guess')
    expect(reply?.status).toBe(403)
    expect((reply?.body as { error: string }).error).toContain('did not come from this app')
  })

  test('a refused press records nothing', () => {
    const id = added()
    answer('POST', '/api/answer', nothing, { project: A, epic: 'modes-are-modules', id, chose: 0 }, null)
    const reply = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'modes-are-modules' }), null, null)
    expect((reply?.body as { questions: { attempts: unknown[] }[] }).questions[0]?.attempts).toHaveLength(0)
  })

  test('returns the verdict, the key and the explanation — the one place they cross', () => {
    const id = added()
    const body = press(id, WRONG)
    expect(body.right).toBe(false)
    expect(body.asked.options[body.answer]).toBe(RIGHT)
    expect(body.asked.options[body.attempt.chose]).toBe(WRONG)
    expect(body.why).toBe('The manifest is the only half a host reads.')
    expect(body.asked.answer).toBe(body.answer)
    expect(press(id, RIGHT).right).toBe(true)
  })

  test('an option that does not exist is refused, not scored as wrong', () => {
    const id = added()
    const reply = answer('POST', '/api/answer', nothing, { project: A, epic: 'modes-are-modules', id, chose: 47 }, TICKET)
    expect(reply?.status).toBe(400)
    expect((reply?.body as { error: string }).error).toContain('Nothing was recorded')
  })

  test('an answer to nothing is refused', () => {
    const reply = answer('POST', '/api/answer', nothing, { project: A, epic: 'modes-are-modules', chose: 0 }, TICKET)
    expect(reply?.status).toBe(400)
    expect((reply?.body as { error: string }).error).toContain('did not say which question')
  })

  test('an answer with no chosen option is refused', () => {
    const id = added()
    const reply = answer('POST', '/api/answer', nothing, { project: A, id }, TICKET)
    expect((reply?.body as { error: string }).error).toContain('nothing was recorded')
  })
})

describe('/api/retake', () => {
  test('puts the key back out of reach', () => {
    const id = added()
    answer('POST', '/api/answer', nothing, { project: A, epic: 'modes-are-modules', id, chose: 0 }, TICKET)
    const before = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'modes-are-modules' }), null, null)
    expect((before?.body as { questions: { answer: number | null }[] }).questions[0]?.answer).not.toBeNull()

    const reply = answer('POST', '/api/retake', nothing, { project: A, epic: 'modes-are-modules' }, TICKET)
    expect(reply?.status).toBe(200)
    expect((reply?.body as { questions: { answer: number | null }[] }).questions[0]?.answer).toBeNull()

    const after = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'modes-are-modules' }), null, null)
    expect((after?.body as { questions: { answer: number | null }[] }).questions[0]?.answer).toBeNull()
  })

  test('is behind the ticket', () => {
    expect(answer('POST', '/api/retake', nothing, { project: A, epic: 'x' }, null)?.status).toBe(403)
  })

  test('needs an epic', () => {
    const reply = answer('POST', '/api/retake', nothing, { project: A }, TICKET)
    expect((reply?.body as { error: string }).error).toContain('which epic')
  })
})

describe('/api/quiz, the editor’s door — the one that carries the file', () => {
  const where = () => new URLSearchParams({ project: A, epic: 'modes-are-modules' })
  const read = () => (answer('GET', '/api/quiz', where(), null, TICKET)?.body as { file: { text: string; version: string | null; sources: unknown[] } }).file
  const save = (text: string, base: string | null, ticket: string | null = TICKET) =>
    answer('POST', '/api/quiz', nothing, { project: A, epic: 'modes-are-modules', text, base, session: 'sitting' }, ticket)

  test('nothing behind it is answered without the ticket, reads included', () => {
    const id = added()
    for (const ticket of [null, '', 'guess']) {
      for (const [method, path, body] of [
        ['GET', '/api/quiz', null],
        ['POST', '/api/quiz', { project: A, epic: 'modes-are-modules', text: 'gone', base: null }],
        ['GET', '/api/history', null],
        ['POST', '/api/undo', { project: A, epic: 'modes-are-modules', id }],
      ] as const) {
        const reply = answer(method, path, where(), body, ticket)
        expect(reply?.status).toBe(403)
        expect(JSON.stringify(reply?.body)).not.toContain('[x]')
      }
    }
    expect(read().text).toContain(`<!-- id: ${id} -->`)
  })

  test('with it, the file comes whole — and the questions route is exactly as it was', () => {
    added()
    const file = read()
    expect(file.text).toContain('- [x] Which tab the page gets')
    expect(file.text).toContain('The manifest is the only half a host reads.')
    expect(file.sources).toMatchObject([{ label: '1', status: 'holds' }])
    /* Reading the file earns nothing: the page's own route still withholds. */
    const asked = answer('GET', '/api/questions', where(), null, TICKET)
    expect(JSON.stringify(asked?.body)).not.toContain('[x]')
    expect(JSON.stringify(asked?.body)).not.toContain('only half a host reads.')
    expect((asked?.body as { questions: { answer: number | null }[] }).questions[0]?.answer).toBeNull()
  })

  test('a save is what was typed; a stale one is a 409 carrying what is there, and writes nothing', () => {
    added()
    const mine = read()
    added({ question: 'An agent wrote this meanwhile' })
    const stale = save(`${mine.text}mine\n`, mine.version)
    expect(stale?.status).toBe(409)
    const theirs = (stale?.body as { file: { text: string; version: string } }).file
    expect(theirs.text).toContain('An agent wrote this meanwhile')
    expect(read().text).toBe(theirs.text)
    const kept = save(`${mine.text}mine\n`, theirs.version)
    expect(kept?.status).toBe(200)
    expect(read().text).toBe(`${mine.text}mine\n`)
  })

  test('needs a project and an epic, and an epic names no path', () => {
    expect(answer('GET', '/api/quiz', new URLSearchParams({ project: A }), null, TICKET)?.status).toBe(400)
    expect(answer('GET', '/api/quiz', new URLSearchParams({ project: A, epic: '../learning/modes-are-modules' }), null, TICKET)?.status).toBe(400)
    expect(save('x', null)?.status).toBe(200)
    expect(answer('POST', '/api/quiz', nothing, { project: A, epic: 'modes-are-modules', base: null }, TICKET)?.status).toBe(400)
  })

  test('the history lists agent writes and page edits, and an undo from the page puts one back', () => {
    const id = added({ agent: 'claude' })
    const before = read().text
    expect(tool('drop_quiz', { project: A, id, agent: 'claude' }).isError).toBe(false)
    const listed = answer('GET', '/api/history', where(), null, TICKET)?.body as { entries: { id: string; agent: string; summary: string }[] }
    expect(listed.entries.map((one) => one.agent)).toEqual(['claude', 'claude'])
    expect(listed.entries[0]?.summary).toContain('dropped')
    expect(JSON.stringify(listed)).not.toContain('[x]')
    const undone = answer('POST', '/api/undo', nothing, { project: A, epic: 'modes-are-modules', id: listed.entries[0]!.id }, TICKET)
    expect(undone?.status).toBe(200)
    expect(read().text).toBe(before)
    expect(tool('quizzes', { project: A, epic: 'modes-are-modules' }).text).toContain(id)
  })
})

describe('the other doors', () => {
  test('/healthz says this process is answering, and deliberately counts nothing', () => {
    /* It used to count the projects held and the questions in them, because
       there was one store beside this program. There is not: every question is
       inside the project it is about, and a health check has no project. A check
       that needed an argument would not be one. */
    added()
    const body = answer('GET', '/healthz', nothing, null, null)?.body as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.id).toBe('kehikot.learning')
    expect(body.projects).toBeUndefined()
    expect(body.questions).toBeUndefined()
  })

  test('/api/projects is gone, because there is no register of projects to list', () => {
    expect(answer('GET', '/api/projects', nothing, null, null)?.status).toBe(404)
  })

  test('no other door serves the Markdown file, whatever it is asked for', () => {
    added()
    const query = new URLSearchParams({ project: A, epic: 'modes-are-modules', slug: 'modes-are-modules' })
    for (const path of ['/api/deck', '/api/file', '/api/source', '/api/questions.md', '/api/quiz.md', '/api/quizzes']) {
      expect(answer('GET', path, query, null, TICKET)?.status).toBe(404)
    }
    for (const epic of ['modes-are-modules', 'modes-are-modules.md', '../learning/modes-are-modules']) {
      const reply = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic }), null, TICKET)
      expect(JSON.stringify(reply?.body)).not.toContain('[x]')
      expect(JSON.stringify(reply?.body)).not.toContain('The manifest is the only half a host reads.')
    }
  })

  test('an unknown /api path is ours to refuse, not Vite’s to serve as source', () => {
    expect(answer('GET', '/api/nothing', nothing, null, null)?.status).toBe(404)
    expect(answer('POST', '/api/nothing', nothing, {}, TICKET)?.status).toBe(404)
  })

  test('anything else is not ours', () => {
    expect(answer('GET', '/src/main.tsx', nothing, null, null)).toBeNull()
    expect(answer('GET', '/app', nothing, null, null)).toBeNull()
  })
})
