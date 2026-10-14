import { describe, expect, test } from 'bun:test'
import { headerItemsSchema } from 'kehikot-module-protocol'

import { headerOf, type HeaderState } from '../src/view/header.ts'

const base: HeaderState = { pane: 'source', history: false, busy: false, conflict: false, failed: false, reading: false }

describe('the editor’s header items', () => {
  test('are a list the protocol reads', () => {
    expect(() => headerItemsSchema.parse(headerOf(base))).not.toThrow()
    expect(() => headerItemsSchema.parse(headerOf({ ...base, pane: null, history: true, conflict: true, failed: true }))).not.toThrow()
  })

  test('side by side there is nothing to switch', () => {
    expect(headerOf({ ...base, pane: null }).map((one) => one.id)).toEqual(['done', 'history'])
  })

  test('a conflict and a busy press disable Done, with the reason', () => {
    const done = (state: HeaderState) => headerOf(state).find((one) => one.id === 'done') as { disabled?: string }
    expect(done({ ...base, conflict: true }).disabled).toContain('choose which version')
    expect(done({ ...base, busy: true }).disabled).toBeDefined()
    expect(done(base).disabled).toBeUndefined()
  })

  test('is the same list however much was typed: only a failed save is in it', () => {
    expect(JSON.stringify(headerOf(base))).toBe(JSON.stringify(headerOf({ ...base })))
    expect(JSON.stringify(headerOf({ ...base, failed: true }))).not.toBe(JSON.stringify(headerOf(base)))
  })
})
