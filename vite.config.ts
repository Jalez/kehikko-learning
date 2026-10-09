import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { doors, serves } from 'kehikot-module-protocol/serve'
import { defineConfig } from 'vite'

import { BUILD, MANIFEST, TICKET, answer, stream } from './doors.ts'
import { ID, PREFERRED_PORT } from './manifest.ts'

/**
 * The dev server.
 *
 * - `serves()` first: it decides the port from `PREFERRED_PORT` (or $PORT from a host) and keeps
 *   the registration true — `serves({ id: ID, prefer: PREFERRED_PORT })` — so there is no
 *   `server` block here at all, and a test says so.
 * - `doors()` is every door this app answers on, served by the one process that serves the page:
 *   the manifest, `/app` with the write ticket and the build printed into it, the one
 *   server-sent-event door (`/api/watch`) through `stream`, and `/healthz`, `/mcp` and `/api/*`
 *   through `answer` in doors.ts. A module is ONE ORIGIN — the page fetches `/api/questions` and
 *   `/api/answer` as relative paths — and `/app` has to be claimed before Vite's resolver sees
 *   it, because this repository has a `src/app.tsx`. See the protocol's docs/module-plumbing.md.
 *
 *   What `doors()` prints into the page is a root element, the ticket and the build: no question,
 *   no option and no key. What it adds to `/healthz` and the manifest is the build — a version, a
 *   commit and a start time. Every question still has to be asked for, and what is answered is
 *   already redacted (`asked` in `quiz/questions.ts`).
 * - No `server.cors`: this module declares storage instead, and here that is sharper than
 *   anywhere else. This app holds an ANSWER KEY. `/api/questions` is built so the key is not in
 *   it, but `/api/answer` returns the key to whoever submits an answer, and a permissive CORS
 *   header would let any page in any tab read `/app`, take the ticket printed into it, post an
 *   answer to every question and read the key back off each reply. With `storage: true` the page
 *   has a real origin, its `/api` calls are same-origin, and nothing is offered to strangers:
 *
 *       curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7950/app | grep -i access-control
 *
 *   must print nothing at all.
 * - No alias for `kehikot-module-protocol`: it resolves through its exports, as the host's does.
 *   The `@` alias points at `src`, which is what shadcn's generated components import through.
 * - `base: './'`, because a host frames this page at whatever address it wrote down.
 */
export default defineConfig({
  base: './',
  plugins: [
    serves({ id: ID, prefer: PREFERRED_PORT }),
    doors({ manifest: MANIFEST, answer, stream, build: BUILD, page: { title: 'Learning', ticket: TICKET } }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
})
