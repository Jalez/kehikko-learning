import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where this app keeps what is its own.
 *
 * One file lives here — `questions.json`, holding every question anybody wrote
 * and every answer anybody gave, partitioned by project — and the directory is
 * beside the program rather than inside any host's data. That is the whole of
 * what "an app" means here: somebody can copy this directory to another machine,
 * run it, and have their questions, with nothing else installed and nothing else
 * running.
 *
 * `LEARNING_DATA` moves it, and it is deliberately NOT `ROADMAP_DATA`. That
 * variable belongs to a different program: honouring it would make this app's
 * store follow a host that may not be running, may not exist, and certainly did
 * not agree to hold anything of ours. One store, one owner, one name.
 *
 * Resolved at call time and not at import, so a test — or a deployment that sets
 * the variable in a wrapper — does not depend on which module happened to be
 * loaded first. `mkdirSync` is on this path rather than at startup because every
 * reader tolerates an absent file and none of them tolerates an absent
 * directory; making it here means the first write cannot fail on something the
 * program could simply have done.
 *
 * ## Why the fallback is the working directory and not `import.meta.dir`
 *
 * `import.meta.dir` is the direct way to say "beside the program" and it is
 * wrong here, silently. The doors are middleware inside Vite's config, and Vite
 * BUNDLES its config: `vite.config.ts` and everything it imports are compiled
 * into a single throwaway file under `node_modules/.vite-temp/`. So
 * `import.meta.dir` in that bundle is `node_modules/.vite-temp` — and under Node
 * it is not even that, because it is a Bun extension and evaluates to
 * `undefined`. Had it merely been the wrong string, this app would have started
 * cleanly, found no `questions.json`, reported that nobody had written a
 * question, and put a new store into a directory Vite deletes. That is every
 * question and every answer gone, with a page that looked fine.
 *
 * So the fallback is `process.cwd()`, and `run.sh` is what makes it exact: it
 * does `cd "$(dirname "$0")"` before starting anything and then sets
 * `LEARNING_DATA` explicitly, so the store is beside the program however the
 * script was invoked and whatever a bundler does to the module graph.
 */
export function dataDir(): string {
  const dir = process.env.LEARNING_DATA ?? join(process.cwd(), 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}
