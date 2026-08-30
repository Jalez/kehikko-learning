import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { MAX_PROJECT, defaultProject, projectKey, projectName } from '../quiz/projects.ts'

describe('projectKey', () => {
  test('an ordinary path is itself', () => {
    expect(projectKey('/Users/somebody/Projects/roadmap')).toBe('/Users/somebody/Projects/roadmap')
  })

  test('trailing slashes are the same project', () => {
    expect(projectKey('/a/b/')).toBe('/a/b')
    expect(projectKey('/a/b///')).toBe('/a/b')
  })

  test('the root survives being normalised', () => {
    /* `/` stripped of trailing slashes is the empty string, which would be a
       project with no key at all. */
    expect(projectKey('/')).toBe('/')
  })

  test('surrounding whitespace is not a different project', () => {
    expect(projectKey('  /a/b  ')).toBe('/a/b')
  })

  test('nothing usable is null', () => {
    expect(projectKey('')).toBeNull()
    expect(projectKey('   ')).toBeNull()
    expect(projectKey(null)).toBeNull()
    expect(projectKey(undefined)).toBeNull()
    expect(projectKey(42)).toBeNull()
    expect(projectKey({ path: '/a' })).toBeNull()
  })

  test('a control character is refused', () => {
    /* It reads back out of JSON fine and then does something surprising in a
       terminal, and no real path has one. */
    expect(projectKey('/a/\u0000b')).toBeNull()
    expect(projectKey('/a/\nb')).toBeNull()
    expect(projectKey('/a/\u007fb')).toBeNull()
  })

  test('a path longer than the bound is refused', () => {
    expect(projectKey(`/${'a'.repeat(MAX_PROJECT)}`)).toBeNull()
    expect(projectKey(`/${'a'.repeat(MAX_PROJECT - 2)}`)).not.toBeNull()
  })

  test('a case difference is a different project, and deliberately', () => {
    /* macOS is usually case-insensitive and Linux is not. Folding here would
       make this app's answer depend on which machine the store was copied to,
       which is worse than being consistently literal. */
    expect(projectKey('/A/B')).not.toBe(projectKey('/a/b'))
  })

  test('two paths that are the same directory said differently are NOT unified', () => {
    /* Documented rather than fixed: this process may have no access to the path
       it is being told about, so resolving would mean `realpath` on an arbitrary
       string from the network. `quizzes` with no project exists so a person can
       find the bucket their questions went into. */
    expect(projectKey('/a/b/../b')).toBe('/a/b/../b')
    expect(projectKey('/a/b/../b')).not.toBe('/a/b')
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

describe('projectName', () => {
  test('is the last segment, which is what a person calls it', () => {
    expect(projectName('/Users/somebody/Projects/roadmap')).toBe('roadmap')
  })

  test('falls back to the whole path when there is no segment', () => {
    expect(projectName('/')).toBe('/')
    expect(projectName('roadmap')).toBe('roadmap')
  })
})
