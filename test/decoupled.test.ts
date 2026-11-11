import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODULE_FOLDERS, foldersOwned, manifestSchema, serviceDescriptor } from 'kehikot-module-protocol'

import { ID, MANIFEST } from '../manifest.ts'

/**
 * Modules never name each other: what one needs from another it finds as a protocol service. So no
 * other module's id, data folder, tool name or name is spelled in this module's code, manifest or
 * skills — comments included. Its own id and folder are fine.
 */
const ROOT = join(import.meta.dir, '..')
const SELF = 'learning'
const MODULES = [
  'paper', 'review', 'checklist', 'factory', 'flows', 'screenplay', 'journeys', 'references', 'atlas', 'citations',
  'notes', 'learning', 'source', 'diff', 'explorer', 'terminal', 'claude', 'codex', 'vibe', 'opencode', 'antigravity',
  'tests', 'history', 'orchestrator', 'notifications', 'queue', 'browser', 'slides', 'diagrams', 'editor', 'kanban', 'monitor', 'worktrees',
].filter((one) => one !== SELF)
/** Tools other modules have on their doors. */
const TOOLS = ['list_sections', 'read_paper', 'read_source', 'propose_edit', 'show_flow', 'read_flow', 'list_flows', 'write_screenplay', 'read_screenplay', 'cite_slide', 'check_item', 'list_checklists']
/** Other modules' names that are never an everyday word here. */
const NAMES = ['Journeys', 'Slides', 'Paper', 'Screenplay', 'Flows', 'Browser', 'Checklist', 'Citations', 'Explorer', 'Orchestrator', 'Factory', 'Kanban', 'Codex', 'Antigravity', 'OpenCode', 'Vibe']
const BANNED: { what: string; pattern: RegExp }[] = [
  ...MODULES.map((one) => ({ what: `kehikot.${one}`, pattern: new RegExp(`\\b(?:kehikot|roadmap)\\.${one}\\b`) })),
  ...MODULES.map((one) => ({ what: `.kehikot/${one}`, pattern: new RegExp(`\\.kehikot/${one}\\b`) })),
  ...TOOLS.map((one) => ({ what: one, pattern: new RegExp(`\\b${one}\\b`) })),
  ...NAMES.map((one) => ({ what: one, pattern: new RegExp(`\\b${one}\\b`) })),
]
/* `dev/` holds probes that play a host with other modules' containers on it, as tests do; they never ship. */
const SKIP = new Set(['node_modules', 'dist', 'test', 'notes', 'docs', 'dev'])
const CODE = /\.(ts|tsx|js|mjs|json|html|sh)$/
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((one) => {
    if (SKIP.has(one.name) || one.name.startsWith('.')) return []
    const path = join(dir, one.name)
    if (one.isDirectory()) return walk(path)
    return CODE.test(one.name) && one.name !== 'bun.lock' ? [path] : []
  })
const skills = (): string[] => {
  const dir = join(ROOT, 'plugin', 'skills')
  return existsSync(dir) ? readdirSync(dir).map((one) => join(dir, one, 'SKILL.md')).filter(existsSync) : []
}

describe('no neighbours', () => {
  test('no other module is spelled in the code, the manifest or the skills', () => {
    const hits: string[] = []
    for (const file of [...walk(ROOT), ...skills()]) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const { what, pattern } of BANNED) if (pattern.test(line)) hits.push(`${file.slice(ROOT.length + 1)}:${i + 1} names ${what}`)
      })
    }
    const said = JSON.stringify(MANIFEST, null, 1).split('\n')
    said.forEach((line, i) => {
      for (const { what, pattern } of BANNED) if (pattern.test(line)) hits.push(`manifest:${i + 1} names ${what}`)
    })
    expect(hits).toEqual([])
  })
})

describe('module.folders', () => {
  test('declares the learning folder, authored, under this module\'s name', () => {
    expect(manifestSchema.parse(MANIFEST).services?.[MODULE_FOLDERS]).toBeTruthy()
    const descriptor = serviceDescriptor(MODULE_FOLDERS, MANIFEST.services?.[MODULE_FOLDERS])
    expect(descriptor).not.toBeNull()
    expect(descriptor!.name).toBe(MANIFEST.name)
    expect(descriptor!.folders.map((one) => [one.folder, one.derived])).toEqual([['learning', false]])
    expect(foldersOwned([{ module: ID, descriptor: MANIFEST.services?.[MODULE_FOLDERS] } as never]).get('learning')?.module).toBe(ID)
  })
})
