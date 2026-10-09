import { describe, expect, test } from 'bun:test'

import { placeOf } from '../src/view/place.ts'

const FILE = [
  '# Notes above the first question',
  '',
  '## What is a part? [^1]',
  '<!-- id: aaaa1111 -->',
  '- [x] A group of files',
  '- [ ] A page',
  '',
  '## Typed by hand, with no id [^2]',
  '- [x] Yes',
  '- [ ] No',
  '',
  'Sources:',
  '[^1]: a.tex | "a part"',
  '[^2]: a.tex | "by hand"',
  '',
].join('\n')

describe('where a question is in the file', () => {
  test('by its id: the heading the id sits under', () => {
    expect(placeOf(FILE, { id: 'aaaa1111', question: 'anything, the id decides' })).toBe(FILE.indexOf('## What is a part?'))
  })

  test('by its words when it was typed by hand and has no id line; markers are not part of the words', () => {
    expect(placeOf(FILE, { id: 'hash-of-words', question: 'Typed by hand, with no id' })).toBe(FILE.indexOf('## Typed by hand'))
  })

  test('nowhere: null, and the editor opens at the top', () => {
    expect(placeOf(FILE, { id: 'gone', question: 'Not in the file' })).toBeNull()
    expect(placeOf('', { id: 'x', question: 'y' })).toBeNull()
  })

  test('a question that is the first line of the file', () => {
    const first = '## First\n<!-- id: f1 -->\n- [x] a\n'
    expect(placeOf(first, { id: 'f1', question: 'First' })).toBe(0)
  })
})
