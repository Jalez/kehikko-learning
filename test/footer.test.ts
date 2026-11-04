import { describe, expect, test } from 'bun:test'
import { footerItemsSchema, headerItemsSchema, LIMITS } from 'kehikot-module-protocol'

import { editorFooter, quizFooter, quizHeader, type QuizFooterState } from '../src/view/footer.ts'
import { headerOf } from '../src/view/header.ts'

const base: QuizFooterState = { asked: 3, answered: 2, right: 1, at: 1, epic: 'thesis', file: '.kehikot/learning/thesis.md', trouble: null }
const ids = (items: { id: string }[]) => items.map((one) => one.id)
const find = (state: QuizFooterState, id: string) => quizFooter(state).find((one) => one.id === id)

describe('the questions’ footer', () => {
  test('every list it can make parses', () => {
    const long: QuizFooterState = { ...base, asked: 400, at: 399, epic: 'x'.repeat(300), file: 'y'.repeat(300), trouble: 'It did not answer. '.repeat(30) }
    for (const state of [base, long, { ...base, asked: 0, answered: 0, right: 0 }, { ...base, at: null }]) {
      const items = quizFooter(state)
      expect(footerItemsSchema.safeParse(items).success).toBe(true)
      expect(items.length).toBeLessThanOrEqual(LIMITS.FOOTER_ITEMS)
    }
  })

  test('one at a time: the question before, which of how many, the question after, then the score', () => {
    expect(ids(quizFooter(base))).toEqual(['back', 'position', 'next', 'score'])
    expect(find(base, 'position')).toMatchObject({ kind: 'text', text: '2 / 3' })
    expect(find(base, 'score')).toMatchObject({ kind: 'text', text: '3 asked · 2 answered · 1 right', align: 'end' })
    expect((find(base, 'score') as { tooltip: string }).tooltip).toContain('.kehikot/learning/thesis.md')
    expect(find(base, 'back')).toMatchObject({ kind: 'run', icon: 'chevron-left', disabled: null })
    expect(find({ ...base, at: 0 }, 'back')).toMatchObject({ disabled: 'This is the first question.' })
    expect(find({ ...base, at: 2 }, 'next')).toMatchObject({ disabled: 'This is the last question.' })
  })

  test('a list, or a single question, has no counter: only the score', () => {
    expect(ids(quizFooter({ ...base, at: null }))).toEqual(['score'])
    expect(ids(quizFooter({ ...base, asked: 1, answered: 0, right: 0, at: 0 }))).toEqual(['score'])
  })

  test('nothing asked: nothing but what went wrong', () => {
    expect(quizFooter({ ...base, asked: 0, answered: 0, right: 0 })).toEqual([])
    const trouble = quizFooter({ ...base, trouble: 'The answer was not recorded.' })
    expect(ids(trouble)[0]).toBe('trouble')
    expect(trouble[0]).toMatchObject({ kind: 'text', level: 'critical', text: 'The answer was not recorded.' })
  })
})

describe('the questions’ header, beside the footer', () => {
  test('the parts as a switch an agent may press, Ask again once something is answered, and Edit', () => {
    const items = quizHeader({ parts: ['question', 'options', 'why'], part: 'options', answered: true, busy: false })
    expect(headerItemsSchema.safeParse(items).success).toBe(true)
    expect(items.map((one) => `${one.kind}:${one.id}`)).toEqual(['switch:part', 'run:retake', 'run:edit'])
    expect(items[0]).toMatchObject({ value: 'options', agents: true })
    expect((items[1] as { agents?: boolean }).agents).toBeUndefined()
    expect((items[2] as { agents?: boolean }).agents).toBeUndefined()
  })

  test('nothing to switch, nothing answered: only Edit; busy, Ask again says why it waits', () => {
    expect(ids(quizHeader({ parts: ['options'], part: 'options', answered: false, busy: false }))).toEqual(['edit'])
    expect(quizHeader({ parts: [], part: 'options', answered: true, busy: true })[0]).toMatchObject({ id: 'retake', disabled: 'Something is being done just now.' })
  })

  test('never the same item in both rows', () => {
    const header = quizHeader({ parts: ['question', 'options'], part: 'question', answered: true, busy: false })
    const footer = quizFooter({ ...base, trouble: 'x' })
    expect(header.filter((one) => footer.some((two) => two.id === one.id))).toEqual([])
  })
})

describe('the editor’s footer', () => {
  test('the save, whether changes on disk are heard, and the file', () => {
    const items = editorFooter({ said: 'saved', bad: false, detached: false, file: 'a.md' })
    expect(footerItemsSchema.safeParse(items).success).toBe(true)
    expect(ids(items)).toEqual(['save', 'file'])
    expect(items[0]).not.toHaveProperty('level')
    const bad = editorFooter({ said: 'not saved: the disk is full', bad: true, detached: true, file: null })
    expect(ids(bad)).toEqual(['save', 'watch'])
    expect(bad[0]).toMatchObject({ level: 'critical', text: 'not saved: the disk is full' })
    expect(bad[1]).toMatchObject({ level: 'warn' })
  })

  test('with a footer, Done says no result of its own: the footer says the save', () => {
    const state = { pane: null, history: false, busy: false, conflict: false, failed: true, reading: false }
    expect(headerOf(state).find((one) => one.id === 'done')).toMatchObject({ state: 'failed', result: 'not saved' })
    expect(headerOf({ ...state, footed: true }).find((one) => one.id === 'done')).not.toHaveProperty('result')
  })
})
