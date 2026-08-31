#!/usr/bin/env bun
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { originFor, registerAt } from 'roadmap-module-protocol/serve'

import { ID, PREFERRED_PORT } from './manifest.ts'

/**
 * Tell a host on this machine where this app answers.
 *
 *   bun run register            # or: PORT=7951 bun run register
 *
 * A separate program from `run.sh` on purpose. Registration writes into
 * somebody's home directory and says "frame this", which is a decision a person
 * makes once; a start script that did it quietly would be making that decision
 * on their behalf every time they pressed start.
 *
 * ## The plugin writes this file too, and that is not the thing forbidden above
 *
 * `serves()` in `vite.config.ts` rewrites this registration every time the
 * server starts. It reads like exactly what the paragraph above forbids, and it
 * is worth being precise about why it is not, because collapsing the two loses
 * something either way round.
 *
 * ADOPTION is the decision a person makes once, and this program is it. Running
 * this is how an app nobody had put on their canvas gets onto it, and deleting
 * the file is how it comes off again.
 *
 * The ADDRESS is not a decision anybody made. Nobody chose 7950; they chose to
 * be framed, and 7950 is a fact about where this process happened to bind — a
 * fact that changes between one start and the next when something else has the
 * port. A registration still naming the old number is one the host sweeps to
 * find nothing: it reports this app as stopped while it is running one port
 * over, beside a Start button that would spawn a second copy. Rewriting the
 * address keeps the decision the person made TRUE. It does not make one.
 *
 * ## `dir` as well as `url`
 *
 * The url is where to talk to this app; the directory is where to START it. A
 * host that offers a Start button needs the second, and needs it to be a
 * DIRECTORY rather than a command line — a string a host handed to a shell would
 * make this file a place to write shell. What a host runs is `run.sh` inside
 * this directory: one script, no arguments, for exactly that reason.
 *
 * It is derived from this file's own location rather than from `process.cwd()`,
 * so `bun run register` works from anywhere and records where the program
 * actually is instead of where somebody happened to be standing. That is the one
 * thing the package cannot work out for itself, which is why it is still here.
 *
 * ## Where a host looks is no longer said in this file
 *
 * The registry directory, the rule that the FILENAME carries the id — a host
 * sweeps the directory and reads the id off the name, so `roadmap.learning.json`
 * is what makes this `roadmap.learning` — and the shape of the document are in
 * `roadmap-module-protocol/serve` now. This file used to spell the path out with
 * a note explaining that the copy was deliberate so the directory could stand
 * alone. Fourteen deliberate copies of one path are fourteen chances to disagree
 * by a character, and writing to the wrong directory is the worst failure a
 * module can have: the host finds nothing, and finds it silently.
 *
 * `registerAt` MERGES rather than overwrites, so anything a person put beside the
 * url by hand survives a rewrite that had nothing to do with it.
 */
const port = Number(process.env.PORT ?? PREFERRED_PORT)
const written = registerAt({
  id: ID,
  origin: originFor(port),
  dir: dirname(fileURLToPath(import.meta.url)),
})

console.log(`registered: ${written.file} -> ${written.url} (${written.dir})`)
if (written.was) console.log(`  (was ${written.was.url} in ${written.was.dir})`)
console.log('Start the app with ./run.sh, then reload the host; it sweeps the directory on every read.')
console.log(`If ${port} is taken, ./run.sh moves to the next free port and rewrites this file to match.`)
