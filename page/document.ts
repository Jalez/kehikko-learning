/**
 * The document, assembled per request.
 *
 * ## Why this is a string and not an `index.html`
 *
 * Two reasons, and both of them have cost somebody in this workspace a day.
 *
 * First, the ticket. It is minted once per process and has to reach the page
 * WITHOUT being fetchable on a door of its own — a `GET /api/ticket` would be a
 * route that hands the write credential to anything that asks, which is the
 * ticket abolished with extra steps. So the document is generated, the ticket
 * goes into it, and `vite.config.ts` runs the result through
 * `transformIndexHtml` so that Vite's own client and module graph are injected
 * exactly as they would be for a file on disk.
 *
 * Second, `/app` next to `src/app.tsx`. Under Vite dev an extensionless path is
 * not free: a request for `/app` beside an `app.tsx` resolves to that module and
 * answers `200 text/javascript` with compiled source. A browser loads such a
 * document happily and runs nothing in it — the frame's `load` fires, the host
 * greets it, and nothing answers. Claiming `/app` in middleware before Vite's
 * resolver sees it is what stops that, and this repository does have a
 * `src/app.tsx`.
 *
 * ## Nothing is drawn here, and here that is a security property
 *
 * There is a root element and one inert JSON island. Every question, every
 * option and every verdict is built by React from what this program's own store
 * answers — and what the store answers to a page never contains the answer key
 * until the reader has chosen. See `asked` in `quiz/questions.ts`.
 *
 * This matters more than the usual "the page is a shell" argument. `curl
 * http://127.0.0.1:7950/app` is a thing an agent does, and what it gets back is
 * this file with a ticket in it. There is no question in it, no option, and
 * above all no key. The page has to ask, and what it is given back is already
 * redacted.
 *
 * ## The ticket rides in a JSON island
 *
 * `type="application/json"` rather than a generated JavaScript literal, because
 * a JSON island is inert: the browser neither parses nor executes it, and the
 * page reads it with `JSON.parse` off `textContent`. A value written into
 * executable source is the one place `textContent` cannot help.
 *
 * ## The one script, and why its type matters
 *
 * `<script type="module">`, which is what Vite serves and what a browser needs
 * in order to `import`. It is also the exact thing an opaque origin cannot fetch
 * without a permissive CORS header — see the essay on `server.cors` in
 * `vite.config.ts`. If this page ever loads in a frame and does nothing at all,
 * that header, or the `storage: true` that makes it unnecessary, is the first
 * thing to check, and the browser console is the only place it is visible.
 */
const PAGE_SHELL = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Learning</title>
</head>
<body>
<div id="root"></div>
<script id="ticket" type="application/json">__TICKET__</script>
<script type="module" src="/src/main.tsx"></script>
</body>
</html>
`

/**
 * The page, with the substitution made.
 *
 * The replacement is given as a FUNCTION. `String.replace` reads `$&`, `$1` and
 * friends out of a replacement string, and a ticket is random text that will
 * eventually contain a dollar sign — at which point the page would be served
 * with a mangled ticket and every write would be refused, intermittently, for a
 * reason nobody would find. A function replacement is taken literally.
 */
export function page(ticket: string): string {
  return PAGE_SHELL.replace('__TICKET__', () => JSON.stringify(ticket))
}
