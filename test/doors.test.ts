import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'learning-doors-'))
  process.env.LEARNING_DATA = dir
  delete process.env.LEARNING_PROJECT
  delete process.env.ROADMAP_PROJECT
})

afterEach(() => {
  delete process.env.LEARNING_DATA
  rmSync(dir, { recursive: true, force: true })
})

const A = '/Users/somebody/Projects/one'
const B = '/Users/somebody/Projects/two'
const nothing = new URLSearchParams()

/** One JSON-RPC tool call, and the text it answered with. */
function tool(name: string, args: Record<string, unknown> = {}): { text: string; isError: boolean } {
  const reply = answer('POST', '/mcp', nothing, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, null)
  const body = reply?.body as { result?: { content?: { text?: string }[]; isError?: boolean } }
  return { text: body.result?.content?.[0]?.text ?? '', isError: body.result?.isError === true }
}

const GOOD = {
  project: A,
  epic: 'modes-are-modules',
  question: 'What does a manifest settle?',
  options: ['Which tab the page gets', 'What colour the pane is', 'Who owns the repository'],
  answer: 0,
  why: 'The manifest is the only half a host reads.',
  path: 'chapters/bridge.tex',
  start: 100,
  end: 240,
  quote: 'the manifest is the smallest half of this program',
  agent: 'claude',
}

/** Add one question and hand back its id, read off what the tool printed. */
function added(over: Record<string, unknown> = {}): string {
  const { text, isError } = tool('add_quiz', { ...GOOD, ...over })
  expect(isError).toBe(false)
  const id = /Question ([0-9a-f]{8}) written/.exec(text)?.[1]
  expect(id).toBeTruthy()
  return id ?? ''
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
    expect(result?.serverInfo?.name).toBe('roadmap.learning')
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
  test('quizzes with no project lists the projects rather than complaining', () => {
    /* Answering "which projects hold questions" with a complaint about a missing
       project would be refusing the very question that tells the caller what to
       pass. */
    const { text, isError } = tool('quizzes')
    expect(isError).toBe(false)
    expect(text).toContain('holds no questions yet')
  })

  test('quizzes with no project lists them once there are some', () => {
    added()
    added({ project: B })
    const { text } = tool('quizzes')
    expect(text).toContain(A)
    expect(text).toContain(B)
  })

  test('every other tool refuses without one, and says what to pass', () => {
    for (const name of ['add_quiz', 'reword_quiz', 'drop_quiz']) {
      const { text, isError } = tool(name, { ...GOOD, project: undefined, id: 'deadbeef' })
      expect(isError).toBe(true)
      expect(text).toContain('needs a project')
      expect(text).toContain('Nothing was written')
    }
  })

  test('a project that is not a usable path is refused', () => {
    const { text, isError } = tool('add_quiz', { ...GOOD, project: '   ' })
    expect(isError).toBe(true)
    expect(text).toContain('needs a project')
  })

  test('LEARNING_PROJECT is a default a person set, not a guess', () => {
    process.env.LEARNING_PROJECT = A
    const { isError } = tool('add_quiz', { ...GOOD, project: undefined })
    expect(isError).toBe(false)
    expect(tool('quizzes', { epic: 'modes-are-modules' }).text).toContain('What does a manifest settle?')
    delete process.env.LEARNING_PROJECT
  })
})

describe('add_quiz', () => {
  test('writes a question and prints the epic back without the key', () => {
    const { text, isError } = tool('add_quiz', GOOD)
    expect(isError).toBe(false)
    expect(text).toContain('written about modes-are-modules')
    expect(text).toContain('answer: withheld — nobody has answered this one yet')
    expect(text).not.toContain('answer: 0.')
  })

  test('needs an epic', () => {
    const { text, isError } = tool('add_quiz', { ...GOOD, epic: undefined })
    expect(isError).toBe(true)
    expect(text).toContain('add_quiz needs an epic')
  })

  test('needs a question', () => {
    const { text, isError } = tool('add_quiz', { ...GOOD, question: '' })
    expect(isError).toBe(true)
    expect(text).toContain('needs a question')
  })

  test('refuses options that are a string, rather than splitting them', () => {
    /* `options: "a, b, c"` is a caller that meant three options; splitting on
       commas would guess where, and an option containing a comma would become
       two. */
    const { text, isError } = tool('add_quiz', { ...GOOD, options: 'a, b, c' })
    expect(isError).toBe(true)
    expect(text).toContain('an ARRAY')
    expect(text).toContain('however it is punctuated')
  })

  test('needs an answer index, and says it is an index and not a string', () => {
    const { text, isError } = tool('add_quiz', { ...GOOD, answer: 'Which tab the page gets' })
    expect(isError).toBe(true)
    expect(text).toContain('as a whole number counting from 0')
    expect(text).toContain('not the text of one')
  })

  test('an answer index past the end is refused by the store', () => {
    const { text, isError } = tool('add_quiz', { ...GOOD, answer: 9 })
    expect(isError).toBe(true)
    expect(text).toContain('between 0 and 2')
  })

  test('needs the whole passage, and names all four parts', () => {
    for (const missing of [{ path: '' }, { quote: '' }, { start: 'x' }, { end: null }]) {
      const { text, isError } = tool('add_quiz', { ...GOOD, ...missing })
      expect(isError).toBe(true)
      expect(text).toContain('path, start, end and quote')
      expect(text).toContain('Nothing was written')
    }
  })

  test('refuses a byte range that does not go forwards', () => {
    const { text, isError } = tool('add_quiz', { ...GOOD, start: 500, end: 100 })
    expect(isError).toBe(true)
    expect(text).toContain('end greater than start')
  })

  test('records who wrote it and that it came through this door', () => {
    added({ agent: 'a particular agent' })
    const { text } = tool('quizzes', { project: A, epic: 'modes-are-modules' })
    expect(text).toContain('written by a particular agent, over MCP')
  })

  test('an epic that is not a slug is refused', () => {
    const { text, isError } = tool('add_quiz', { ...GOOD, epic: 'Modes Are Modules' })
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
    answer('POST', '/api/answer', nothing, { project: A, id, chose: 1 }, TICKET)
    const { text } = tool('quizzes', { project: A, epic: 'modes-are-modules' })
    expect(text).toContain('answer: 0. Which tab the page gets')
    expect(text).toContain('was WRONG')
  })

  test('prints the anchor, which is the module’s whole claim', () => {
    added()
    const { text } = tool('quizzes', { project: A, epic: 'modes-are-modules' })
    expect(text).toContain('anchored to chapters/bridge.tex bytes 100–240')
    expect(text).toContain('the manifest is the smallest half of this program')
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
    answer('POST', '/api/answer', nothing, { project: A, id, chose: 0 }, TICKET)
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

  test('a drop says how many answers went with it', () => {
    const id = added()
    answer('POST', '/api/answer', nothing, { project: A, id, chose: 0 }, TICKET)
    const { text, isError } = tool('drop_quiz', { project: A, id })
    expect(isError).toBe(false)
    expect(text).toContain('1 answer')
  })

  test('a question in another project is not addressable', () => {
    const id = added({ project: A })
    const { text, isError } = tool('drop_quiz', { project: B, id })
    expect(isError).toBe(true)
    expect(text).toContain('is not addressable from this one')
  })
})

/* ------------------------------------------------------------------ *
 * The page's doors
 * ------------------------------------------------------------------ */

describe('/api/questions', () => {
  test('needs a project, and says why', () => {
    const reply = answer('GET', '/api/questions', new URLSearchParams({ epic: 'x' }), null, null)
    expect(reply?.status).toBe(400)
    expect((reply?.body as { error: string }).error).toContain('partitioned by project')
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
    answer('POST', '/api/answer', nothing, { project: A, id, chose: 2 }, TICKET)
    const reply = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'modes-are-modules' }), null, null)
    const body = reply?.body as { questions: { answer: number | null; why: string | null }[] }
    expect(body.questions[0]?.answer).toBe(0)
    expect(body.questions[0]?.why).toBe('The manifest is the only half a host reads.')
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
    const reply = answer('POST', '/api/answer', nothing, { project: A, id, chose: 0 }, 'a guess')
    expect(reply?.status).toBe(403)
    expect((reply?.body as { error: string }).error).toContain('did not come from this app')
  })

  test('a refused press records nothing', () => {
    const id = added()
    answer('POST', '/api/answer', nothing, { project: A, id, chose: 0 }, null)
    const reply = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'modes-are-modules' }), null, null)
    expect((reply?.body as { questions: { attempts: unknown[] }[] }).questions[0]?.attempts).toHaveLength(0)
  })

  test('returns the verdict, the key and the explanation — the one place they cross', () => {
    const id = added()
    const reply = answer('POST', '/api/answer', nothing, { project: A, id, chose: 1 }, TICKET)
    const body = reply?.body as { right: boolean; answer: number; why: string; asked: { answer: number | null } }
    expect(body.right).toBe(false)
    expect(body.answer).toBe(0)
    expect(body.why).toBe('The manifest is the only half a host reads.')
    expect(body.asked.answer).toBe(0)
  })

  test('an option that does not exist is refused, not scored as wrong', () => {
    const id = added()
    const reply = answer('POST', '/api/answer', nothing, { project: A, id, chose: 47 }, TICKET)
    expect(reply?.status).toBe(400)
    expect((reply?.body as { error: string }).error).toContain('Nothing was recorded')
  })

  test('an answer to nothing is refused', () => {
    const reply = answer('POST', '/api/answer', nothing, { project: A, chose: 0 }, TICKET)
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
    answer('POST', '/api/answer', nothing, { project: A, id, chose: 0 }, TICKET)
    const before = answer('GET', '/api/questions', new URLSearchParams({ project: A, epic: 'modes-are-modules' }), null, null)
    expect((before?.body as { questions: { answer: number | null }[] }).questions[0]?.answer).toBe(0)

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

describe('the other doors', () => {
  test('/healthz counts what is held', () => {
    added()
    added({ project: B })
    const body = answer('GET', '/healthz', nothing, null, null)?.body as { ok: boolean; projects: number; questions: number }
    expect(body.ok).toBe(true)
    expect(body.projects).toBe(2)
    expect(body.questions).toBe(2)
  })

  test('/api/projects lists what is held for whom', () => {
    added()
    const body = answer('GET', '/api/projects', nothing, null, null)?.body as { projects: { project: string; epics: string[] }[] }
    expect(body.projects[0]?.project).toBe(A)
    expect(body.projects[0]?.epics).toEqual(['modes-are-modules'])
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
