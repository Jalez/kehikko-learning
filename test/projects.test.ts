import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { MAX_PROJECT, defaultProject, usablePath } from '../quiz/projects.ts'

/**
 * What is left of "which project" now that the path is the partition.
 *
 * `usablePath` used to be `projectKey` and used to produce the key a store was
 * nested under. It keys nothing today: the questions live at
 * `<project>/.kehikot/learning/questions.json`, so the path IS the partition, and this is
 * the cheap syntactic gate that runs before `store.ts` takes an arbitrary string
 * to `realpathSync`. The tests below are therefore about REFUSING nonsense
 * without touching the filesystem; nothing here asserts anything about what is
 * on disk, because that is `store.test.ts`'s job and having one place for it is
 * the point.
 */
describe('usablePath', () => {
  test('an ordinary path is itself', () => {
    expect(usablePath('/Users/somebody/Projects/roadmap')).toBe('/Users/somebody/Projects/roadmap')
  })

  test('trailing slashes are the same project', () => {
    expect(usablePath('/a/b/')).toBe('/a/b')
    expect(usablePath('/a/b///')).toBe('/a/b')
  })

  test('the root survives being normalised', () => {
    /* `/` stripped of trailing slashes is the empty string, which is not a path
       at all. */
    expect(usablePath('/')).toBe('/')
  })

  test('surrounding whitespace is not a different project', () => {
    expect(usablePath('  /a/b  ')).toBe('/a/b')
  })

  test('nothing usable is null', () => {
    expect(usablePath('')).toBeNull()
    expect(usablePath('   ')).toBeNull()
    expect(usablePath(null)).toBeNull()
    expect(usablePath(undefined)).toBeNull()
    expect(usablePath(42)).toBeNull()
    expect(usablePath({ path: '/a' })).toBeNull()
  })

  test('a control character is refused', () => {
    /* It reads back out of JSON fine and then does something surprising in a
       terminal, and no real path has one. Refused HERE, before anything asks the
       filesystem about it. */
    expect(usablePath('/a/\u0000b')).toBeNull()
    expect(usablePath('/a/\nb')).toBeNull()
    expect(usablePath('/a/\u007fb')).toBeNull()
  })

  test('a path longer than the bound is refused', () => {
    expect(usablePath(`/${'a'.repeat(MAX_PROJECT)}`)).toBeNull()
    expect(usablePath(`/${'a'.repeat(MAX_PROJECT - 2)}`)).not.toBeNull()
  })

  test('a case difference is left alone here, and settled by the filesystem later', () => {
    /* macOS is usually case-insensitive and Linux is not. This function has no
       opinion; `realpathSync` in `store.ts` has the machine's, which is the only
       one that can be right. */
    expect(usablePath('/A/B')).not.toBe(usablePath('/a/b'))
  })

  test('a relative path passes here and is refused where it can be explained', () => {
    /* Deliberately not refused as "unusable". "You did not say which project"
       and "that is not somewhere on this machine" are different mistakes, and a
       caller can only act on the one they actually made — so the second is left
       to `store.ts`, which says so in a sentence. */
    expect(usablePath('some/relative/path')).toBe('some/relative/path')
  })

  test('two spellings of one directory are no longer this file’s problem', () => {
    /* The old note here admitted `/a/b` and `/a/b/../b` were two projects and
       could not be unified, because resolving would have meant `realpath` on an
       arbitrary string from the network. `store.ts` now runs exactly that
       `realpath`, because it has to anyway: it is about to write a file there. */
    expect(usablePath('/a/b/../b')).toBe('/a/b/../b')
  })
})

describe('defaultProject', () => {
  const was = { learning: process.env.LEARNING_PROJECT, roadmap: process.env.ROADMAP_PROJECT }

  beforeEach(() => {
    delete process.env.LEARNING_PROJECT
    delete process.env.ROADMAP_PROJECT
  })

  afterEach(() => {
    if (was.learning === undefined) delete process.env.LEARNING_PROJECT
    else process.env.LEARNING_PROJECT = was.learning
    if (was.roadmap === undefined) delete process.env.ROADMAP_PROJECT
    else process.env.ROADMAP_PROJECT = was.roadmap
  })

  test('is null when nobody has said, which is what makes the door refuse', () => {
    expect(defaultProject()).toBeNull()
  })

  test('LEARNING_PROJECT wins over ROADMAP_PROJECT', () => {
    process.env.ROADMAP_PROJECT = '/from/the/host'
    process.env.LEARNING_PROJECT = '/from/this/app'
    expect(defaultProject()).toBe('/from/this/app')
  })

  test('ROADMAP_PROJECT is honoured on its own', () => {
    process.env.ROADMAP_PROJECT = '/from/the/host/'
    expect(defaultProject()).toBe('/from/the/host')
  })

  test('an unusable value is not a default', () => {
    process.env.LEARNING_PROJECT = '  '
    expect(defaultProject()).toBeNull()
  })
})
