import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LIMITS, PROTOCOL, manifestSchema } from 'roadmap-module-protocol'

import { ID, MANIFEST, VERSION } from '../manifest.ts'

const here = join(import.meta.dir, '..')

describe('the manifest', () => {
  test('is what the protocol package accepts', () => {
    expect(() => manifestSchema.parse(MANIFEST)).not.toThrow()
  })

  test('speaks the protocol this app installed', () => {
    expect(MANIFEST.protocol).toBe(PROTOCOL)
    expect(MANIFEST.declares?.protocol).toBe(`>=${PROTOCOL} <${PROTOCOL + 1}`)
  })

  test('the installed protocol package is 0.8, which is what carries projectPath', () => {
    /* A stale copy STRIPS fields it has never heard of and `parse` does not
       complain, so a manifest field vanishes with no error at all. That has
       bitten four modules in this workspace. `bun pm cache rm` then `bun update`
       — the update alone does not move a git dependency. */
    const packaged = JSON.parse(
      readFileSync(join(here, 'node_modules/roadmap-module-protocol/package.json'), 'utf8'),
    ) as { version: string }
    expect(packaged.version.startsWith('0.8.')).toBe(true)
  })

  test('says who it is, and the filename register.ts writes matches', () => {
    expect(ID).toBe('roadmap.learning')
    expect(MANIFEST.id).toBe(ID)
    expect(MANIFEST.version).toBe(VERSION)
  })

  test('declares storage, which is what closes the CORS hole', () => {
    /* Without it the host frames this page opaque, its own `/api` calls become
       cross-origin, the server would have to answer every origin permissively,
       and any tab could then read `/app` and the write ticket printed into it. */
    expect(MANIFEST.declares?.storage).toBe(true)
  })

  test('asks for no capability at all', () => {
    /* Every one of them was considered and rejected in the essay in
       manifest.ts. A capability asked for and never used is the fastest way to
       teach somebody to press yes without reading. */
    expect(MANIFEST.declares?.uses).toEqual([])
  })

  test('declares no extensions', () => {
    /* What an agent writes through this door lands in the pane in front of the
       reader within three seconds. The pane IS the notification. */
    expect(MANIFEST.extensions?.emits).toEqual([])
    expect(MANIFEST.extensions?.consumes).toEqual([])
  })

  test('does not ask for a prompt', () => {
    expect(MANIFEST.declares?.prompt).toBe(false)
  })

  test('has one epic-scoped mode', () => {
    expect(MANIFEST.modes).toHaveLength(1)
    expect(MANIFEST.modes?.[0]?.scope).toBe('epic')
  })

  test('opens an MCP door, since that is the point', () => {
    expect(MANIFEST.mcp?.url).toBe('/mcp')
    expect(MANIFEST.mcp?.transport).toBe('http')
  })

  test('the guidance says what this module’s PRESENCE OBLIGES, within the bound', () => {
    const guidance = MANIFEST.guidance ?? ''
    expect(guidance.length).toBeGreaterThan(0)
    expect(guidance.length).toBeLessThanOrEqual(LIMITS.GUIDANCE)
    /* It has to name the tool, since it is written for somebody who has read
       nothing else. */
    expect(guidance).toContain('add_quiz')
    expect(guidance).toContain('quizzes')
    /* And it has to carry the one rule, because an agent that leaks the key
       makes the module worthless whatever else it does right. */
    expect(guidance.toLowerCase()).toContain('do not answer them')
  })
})

describe('the shape of the repository', () => {
  test('there is no index.html', () => {
    /* The page is generated per request so the write ticket can reach it without
       a door of its own, and so `/app` is claimed before Vite's resolver can
       hand back `src/app.tsx` compiled to JavaScript. */
    expect(existsSync(join(here, 'index.html'))).toBe(false)
  })

  test('there is no build script, because a build here cannot succeed', () => {
    /* Several modules in this workspace carry a `"build": "vite build"` that
       fails for want of an index.html. A missing build announces itself; a stale
       `dist` served with a 200 does not, and that has cost whole afternoons. */
    const packaged = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packaged.scripts.build).toBeUndefined()
  })

  test('there is no tailwind.config.js — the house stack is Tailwind v4, CSS-first', () => {
    expect(existsSync(join(here, 'tailwind.config.js'))).toBe(false)
    expect(existsSync(join(here, 'tailwind.config.ts'))).toBe(false)
    expect(readFileSync(join(here, 'src/index.css'), 'utf8')).toContain("@import 'tailwindcss'")
  })

  test('the vite config sets no server.cors', () => {
    /* Asserted on the source rather than on behaviour because the failure it
       prevents is a header this app would have to be running to observe, and a
       line somebody adds back in a hurry is exactly what this catches. */
    const config = readFileSync(join(here, 'vite.config.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(config).not.toMatch(/cors\s*:\s*true/)
    expect(config).not.toMatch(/server\s*:\s*\{/)
    /* And the essay saying why is still there, since the line's absence is only
       legible to the next person if the reason is beside it. */
    expect(readFileSync(join(here, 'vite.config.ts'), 'utf8')).toContain('No `server.cors`')
  })

  test('run.sh defaults to 7950, and so does register.ts', () => {
    expect(readFileSync(join(here, 'run.sh'), 'utf8')).toContain('${PORT:-7950}')
    expect(readFileSync(join(here, 'register.ts'), 'utf8')).toContain('process.env.PORT ?? 7950')
  })

  test('register.ts writes both url and dir', () => {
    /* The url is where to talk to this app; the directory is where to start it,
       and a host that offers a Start button needs the second. */
    const register = readFileSync(join(here, 'register.ts'), 'utf8')
    expect(register).toContain('{ url, dir }')
    expect(register).toContain(`${ID}.json`)
  })
})

describe('the browser bundle', () => {
  test('nothing the page imports reaches a node: module', () => {
    /*
     * The failure this prevents: a value import from `quiz/questions.ts` drags
     * `node:fs` into the browser bundle, the module fails to evaluate, and the
     * only symptom is a pane reporting a module that loaded its page and never
     * answered the host's greeting. That reads as a wire problem and is not one,
     * and it is visible only in a browser console.
     *
     * Asserted on the source of every file under `src/` rather than by building,
     * because there is no build here.
     */
    const files = [...new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: join(here, 'src') })]
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const source = readFileSync(join(here, 'src', file), 'utf8')
      const imports = [...source.matchAll(/^import\s+(type\s+)?(.*?)from\s+'([^']+)'/gm)]
      for (const [, isType, , from] of imports) {
        if (from?.startsWith('node:')) throw new Error(`${file} imports ${from}`)
        /* The two files that hold `node:` imports, reached from the page only as
           types. `import type` is erased; a plain import is not. */
        if (from?.includes('quiz/questions.ts') || from?.includes('/store.ts')) {
          expect(`${file}: ${from} must be a type-only import`).toBe(`${file}: ${from} must be a type-only import`)
          expect(isType).toBeTruthy()
        }
      }
    }
  })

  test('the shared types file imports nothing at all', () => {
    /* Which is what makes importing it wrongly free. */
    const source = readFileSync(join(here, 'quiz/types.ts'), 'utf8')
    expect(source).not.toMatch(/^import\s/m)
  })
})
