import { describe, expect, test } from 'bun:test'

import { shownOrder, staysLast, toFile, toShown } from '../quiz/order.ts'

/**
 * The one pure function the shuffle is: a seed and the options in, the order
 * they are shown in out, as file indexes. `test/shown.test.ts` asks the doors
 * that use it.
 */

const FOUR = ['one', 'two', 'three', 'four']

describe('shownOrder', () => {
  test('is a permutation of the file’s indexes, whatever the seed and however many options', () => {
    for (let n = 2; n <= 8; n += 1) {
      const options = Array.from({ length: n }, (_, i) => `option ${i}`)
      for (let seed = 0; seed < 50; seed += 1) {
        expect(shownOrder(`s${seed}`, options).toSorted((a, b) => a - b)).toEqual(options.map((_, i) => i))
      }
    }
  })

  test('the same seed and options give the same order, every time', () => {
    expect(shownOrder('salt\nq1', FOUR)).toEqual(shownOrder('salt\nq1', FOUR))
  })

  test('another seed is another order: across many seeds every position gets the first option about equally', () => {
    const at = [0, 0, 0, 0]
    for (let seed = 0; seed < 4000; seed += 1) at[toShown(shownOrder(`salt ${seed}`, FOUR), 0)]! += 1
    /* 1000 each, expected; nowhere near all in one place. */
    for (const count of at) expect(count).toBeGreaterThan(850)
    for (const count of at) expect(count).toBeLessThan(1150)
  })

  test('all 24 orders of four options turn up', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 2000; seed += 1) seen.add(shownOrder(`salt ${seed}`, FOUR).join(''))
    expect(seen.size).toBe(24)
  })

  test('toFile and toShown are each other’s inverse', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const order = shownOrder(`s${seed}`, FOUR)
      for (let index = 0; index < FOUR.length; index += 1) {
        expect(toFile(order, toShown(order, index))).toBe(index)
        expect(toShown(order, toFile(order, index)!)).toBe(index)
      }
    }
  })

  test('a position that is not one has no file index, and an index that is not one has no position', () => {
    const order = shownOrder('s', FOUR)
    for (const shown of [4, 47, -1, 0.5, Number.NaN]) expect(toFile(order, shown)).toBeUndefined()
    expect(toShown(order, 4)).toBe(-1)
  })

  test('an option about the other options stays last, and the rest still move', () => {
    const options = ['Hints', 'Prompts', 'Corrections', 'All of the above']
    const firsts = new Set<number>()
    for (let seed = 0; seed < 200; seed += 1) {
      const order = shownOrder(`s${seed}`, options)
      expect(order[3]).toBe(3)
      firsts.add(order[0]!)
    }
    expect([...firsts].toSorted()).toEqual([0, 1, 2])
  })

  test('two of them keep the order the file has them in, wherever the file had them', () => {
    const options = ['None of the above', 'Hints', 'All of the above', 'Prompts']
    for (let seed = 0; seed < 50; seed += 1) expect(shownOrder(`s${seed}`, options).slice(2)).toEqual([0, 2])
  })
})

describe('staysLast', () => {
  test('English and Finnish ways of saying "the ones above"', () => {
    for (const option of [
      'All of the above',
      'None of the above.',
      'all of these',
      'Both of the above',
      'Neither of the above',
      'None of the other options',
      'More than one of the above',
      'All of them',
      'Kaikki edellä mainitut',
      'Ei mikään edellä mainituista',
      'Kaikki yllä olevat',
      'Ei mikään näistä',
      'Molemmat edellä mainitut',
      'Ei kumpikaan edellisistä',
      'Kaikki vaihtoehdot ovat oikein',
      'Molemmat',
    ]) {
      expect([option, staysLast(option)]).toEqual([option, true])
    }
  })

  test('an ordinary option that merely starts the same way moves like any other', () => {
    for (const option of [
      'All three modules were significantly above neutral, with vanilla JS the strongest',
      'Both surfaces equally, since the thesis evaluates the EduChat platform as a whole',
      'Neither: the thesis studies the underlying Llama model rather than any interface',
      'Discount both, since none of the studies concerns a graded exercise',
      'Either party can steer the exchange: tutor and learner both ask and answer',
      'Kaikki opiskelijat palauttivat tehtävän',
      'The above-neutral result held only for vanilla JS',
    ]) {
      expect([option, staysLast(option)]).toEqual([option, false])
    }
  })
})
