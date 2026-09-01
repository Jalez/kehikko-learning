import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { LIMITS, PROTOCOL, manifestSchema } from 'roadmap-module-protocol'

import { ID, MANIFEST, PREFERRED_PORT, VERSION } from '../manifest.ts'

const here = join(import.meta.dir, '..')

describe('the manifest', () => {
  test('is what the protocol package accepts', () => {
    expect(() => manifestSchema.parse(MANIFEST)).not.toThrow()
  })

  test('speaks the protocol this app installed', () => {
    expect(MANIFEST.protocol).toBe(PROTOCOL)
    expect(MANIFEST.declares?.protocol).toBe(`>=${PROTOCOL} <${PROTOCOL + 1}`)
  })

  test('the installed protocol package is 0.15, which is what carries the filter offer', () => {
    /* A stale copy STRIPS fields it has never heard of and `parse` does not
       complain, so a manifest field vanishes with no error at all. That has
       bitten four modules in this workspace. `bun pm cache rm` then `bun update`
       — the update alone does not move a git dependency.
       0.8 carried `projectPath`, which is where the store learns which project
       it is standing in; 0.11 carries `moduleDir` and `withKehikotIgnored`,
       which is where it learns what to call the folder and which folder inside
       it is this module's; 0.12 carries `roadmap-module-protocol/client`, which
       is the wire this module no longer writes for itself; 0.13 carries
       `/serve`, which is the port and the registration it no longer decides for
       itself; 0.14 carries `reacts`, which is a module saying which fields of
       the context it follows; 0.15 carries `roadmap.filters`, which is a module
       offering what it can be narrowed by so the host can draw one control in
       the container header instead of every module drawing its own.

       This paragraph used to end "this app offers nothing on that last one, and
       the pin moves anyway", and the sentence after it — that a module does not
       have to have a filter to need a current protocol — is still true and is
       still the reason a version is one version for the family rather than one
       per module. The claim in front of it is not: this app offers a SCOPE, one
       group of two or three rungs saying how narrow the reader likes this
       container, and `wire/scope.ts` argues for it. So 0.15 is not merely a pin
       kept current here, it is a version this module now uses.

       A copy without any of them does not strip a field quietly — `store.ts`
       fails to import, and a copy older than 0.13 has no `serves()` at all, so
       the Vite config will not load — but the pin is here because the version is
       the thing that has to move, and a test that names it is the note somebody
       reads when the import breaks. Moving this line is part of moving the pin:
       `bun update` ALONE will not advance a `#main` git dependency; it takes
       `bun pm cache rm` first, and this number goes with it. */
    const packaged = JSON.parse(
      readFileSync(join(here, 'node_modules/roadmap-module-protocol/package.json'), 'utf8'),
    ) as { version: string }
    expect(packaged.version.startsWith('0.15.')).toBe(true)
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

  test('asks for exactly one capability: to point the canvas at a passage', () => {
    /* This test used to assert `[]`, and the essay in manifest.ts used to argue
       for it. The exception it had not met is that every question here is
       ANCHORED — a document, a byte range and the source those bytes held — so a
       question IS a passage, and a container that could name one and not show it
       would be withholding the fact it exists to hold.

       Nothing else. A capability asked for and never used is the fastest way to
       teach somebody to press yes without reading, and this one is used in
       exactly one place: a person pressing the source of a question. That bound
       is checked by `dev/pointing.mjs`, from where a host sits, because it is a
       claim about runtime behaviour and nothing static can settle one. */
    expect(MANIFEST.declares?.uses).toEqual(['passage:set'])
  })

  test('the essay is honest about the capability it now declares', () => {
    /* The house rule: a file that argues for what it deliberately does NOT do
       must be rewritten when it starts doing it, rather than left describing a
       module that no longer exists. This catches the declaration being changed
       without the argument. */
    const source = readFileSync(join(here, 'manifest.ts'), 'utf8')
    expect(source).toContain("uses: ['passage:set']")
    expect(source).not.toContain('nothing is asked for, and that is not an oversight')
    /* And the bound, which is the whole of what the capability was granted
       under, has to still be written down beside it. */
    expect(source).toContain('points when a person presses the source of a question')
  })

  test('nothing in this module names the module it expects to react', () => {
    /*
     * The mechanism is the general one: `passage.set` puts a passage in the
     * canvas's context and the host broadcasts it to every framed module.
     * Whatever is showing that document reacts. A module named here — or a port,
     * or an endpoint of somebody else's — would be a second system doing what
     * the context already does, and it would break the day a question is placed
     * beside a different reader.
     *
     * Asserted over the source rather than over behaviour, because the failure
     * is a line somebody adds in a hurry and the symptom is a feature that works
     * on this machine.
     */
    const files = [
      ...[...new Bun.Glob('**/*.{ts,tsx}').scanSync({ cwd: join(here, 'src') })].map((file) => join('src', file)),
      'manifest.ts',
    ]
    for (const file of files) {
      const source = readFileSync(join(here, file), 'utf8')
      /* Comments may discuss sibling modules by name and should. What must not
         appear is a module ID or an origin this app could address. */
      expect(`${file} names a module id: ${source.includes('roadmap.paper')}`).toBe(`${file} names a module id: false`)
      expect(`${file} names a sibling origin: ${/https?:\/\/[^\s'"]*:79\d\d/.test(source)}`).toBe(
        `${file} names a sibling origin: false`,
      )
    }
  })

  test('declares no extensions', () => {
    /* What an agent writes through this door lands in the container in front of the
       reader within three seconds. The container IS the notification. */
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

  /**
   * This used to assert that `run.sh` and `register.ts` both DEFAULTED to 7950,
   * which was the best check available while the number was written in both.
   * It is written in neither now, so what replaces it is that neither of them
   * says a port at all — a second copy of the literal reappearing is exactly how
   * this stops being true again.
   */
  test('the port is stated once, beside the id, and nowhere else', () => {
    expect(PREFERRED_PORT).toBe(7950)
    /* Both files ASK for it by name. Their prose still says 7950 — it is
       discussing what used to be there — so the check is on the import rather
       than on the digits. */
    expect(readFileSync(join(here, 'register.ts'), 'utf8')).toContain("PREFERRED_PORT } from './manifest.ts'")
    expect(readFileSync(join(here, 'vite.config.ts'), 'utf8')).toContain('prefer: PREFERRED_PORT')
  })

  /* And `--strictPort` went with it. It meant this app DIED on a taken port,
     which was the only honest thing to do while nothing handled the collision;
     the drift is decided deliberately now and written into the registry, so
     Vite's own fallback is a second net rather than the absence of one. The
     whole command is asserted rather than the absence of two flags, because the
     comment above it discusses both by name. */
  test('the start script demands no port it might not get', () => {
    const lines = readFileSync(join(here, 'run.sh'), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('exec '))
    expect(lines).toEqual(['exec bunx vite'])
  })

  test('register.ts writes both url and dir', () => {
    /* The url is where to talk to this app; the directory is where to start it,
       and a host that offers a Start button needs the second. Through
       `registerAt` and `originFor` now instead of a hand-built `JSON.stringify`,
       but the two fields are still the claim. */
    const register = readFileSync(join(here, 'register.ts'), 'utf8')
    expect(register).toContain('registerAt(')
    expect(register).toContain('origin: originFor(port)')
    expect(register).toContain('dir: dirname(fileURLToPath(import.meta.url))')
  })
})

describe('the browser bundle', () => {
  test('nothing the page imports reaches a node: module', () => {
    /*
     * The failure this prevents: a value import from `quiz/questions.ts` drags
     * `node:fs` into the browser bundle, the module fails to evaluate, and the
     * only symptom is a container reporting a module that loaded its page and never
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
