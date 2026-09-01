/**
 * The scope filter, watched from the host's side.
 *
 *   ./run.sh &                       # 7950
 *   node dev/scope.mjs               # exits non-zero on any finding
 *
 * `roadmap.filters` is a module telling the host what it can be narrowed by, so
 * the host can draw ONE control in the container header instead of every module
 * drawing its own. The offer goes one way and the choice comes back the other,
 * inside an ordinary context. Neither half can be checked from inside this
 * module: what `test/scope.test.ts` proves is that the functions are right, and
 * what this proves is that the messages actually leave the frame, that they
 * change when the canvas moves, and that a choice arriving from the header
 * changes what a reader sees.
 *
 * ## What it establishes
 *
 * 1. A canvas pointing at nothing offers NOTHING — an empty groups array, which
 *    the protocol defines as "nothing here can be narrowed now" and which takes
 *    the control away. An option that cannot be honoured must not be in the
 *    offer.
 * 2. A document being pointed at adds `this document`; a selection within it
 *    adds `this passage`. The offer is re-sent as those appear, the way notes
 *    re-sends when its count changes.
 * 3. A choice coming back narrows what is drawn — by document, and by range.
 * 4. The container SAYS how many it is not showing, in its own words. A host
 *    cannot count rows it does not render, in a document it cannot read, in a
 *    frame on another origin.
 * 5. A rung that goes away degrades to everything rather than emptying the
 *    container. The reader keeps the choice; they get their questions back.
 *
 * ## Two sizes, because the count is drawn in two spellings
 *
 * At `list` it is a phrase in the heading; at the paged rungs it is four words
 * in the row of controls with the sentence on the row's `title`, because forty
 * characters there would cost a 220-pixel box a whole extra row. Both are drawn
 * by this module and neither is the host's business, so both are measured.
 *
 * NEVER `waitUntil: 'networkidle'`: the page polls every three seconds, so it
 * never idles and the probe would hang.
 */
import { chromium } from '/Users/jaakkorajala/.claude/jobs/85f6bc23/tmp/node_modules/playwright/index.mjs'

const EXECUTABLE =
  process.env.CHROME
  ?? '/Users/jaakkorajala/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:7950'
const PROJECT = process.env.ROADMAP ?? '/Users/jaakkorajala/Projects/roadmap'
/* Its own epic, so this never touches what the other probes assert on. */
const EPIC = 'scope-probe'

const BRIDGE = 'data/papers/modes-are-modules/chapters/bridge.tex'
const AGENTS = 'data/papers/modes-are-modules/chapters/agents.tex'

/*
 * Three questions in two documents, and two of the three in one document at
 * ranges far apart — which is the only shape that can tell `this document` from
 * `this passage`. A probe seeded with one question per file would pass with the
 * range comparison deleted.
 */
const SEED = [
  { path: BRIDGE, start: 1000, end: 1200, question: 'What does the wire settle, up at the front of the chapter?' },
  { path: BRIDGE, start: 6000, end: 6200, question: 'And what does it settle much further down the same file?' },
  { path: AGENTS, start: 1000, end: 1200, question: 'What does a different chapter entirely have to say?' },
].map((seed) => ({
  project: PROJECT,
  epic: EPIC,
  options: ['The host', 'The module'],
  answer: 1,
  why: 'The module says what it is; the host says where it stands.',
  quote: 'A wire is two programs agreeing on one sentence.',
  agent: 'the scope probe',
  ...seed,
}))

const SIZES = [
  { name: '220x300 (the narrow column — the count goes in the row of controls)', width: 220, height: 300 },
  { name: '900x700 (a list — the count goes in the heading)', width: 900, height: 700 },
]

const mcp = (name, args) =>
  fetch(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }).then((r) => r.json())

/**
 * A host, in one document.
 *
 * It greets on the frame's `load` — never in answer to `roadmap.ready`, which is
 * two programs each waiting for the other — and it records the offers.
 */
const host = (width, height) => `<!doctype html>
<html><body style="margin:0">
<iframe id="frame" src="${ORIGIN}/app" width="${width}" height="${height}" style="border:0"
  sandbox="allow-scripts allow-same-origin"></iframe>
<script>
  window.__offers = []
  const frame = document.getElementById('frame')
  /*
   * Filtered on the ORIGIN, and this is the half of the probe that is easy to
   * get wrong in a way that always passes.
   *
   * A host page hears every message its window receives, and on a real canvas
   * that is every framed module — so an unfiltered listener reads somebody
   * else's offer as this module's. The other tempting check,
   * \`event.source === frame.contentWindow\`, is worse than useless here: the
   * frame is cross-origin, what arrives is an opaque window proxy, and the
   * comparison silently drops EVERYTHING. A probe that records nothing reports
   * a module that offered nothing, which is indistinguishable from the bug it
   * is looking for.
   */
  const FROM = ${JSON.stringify(new URL(ORIGIN).origin)}
  addEventListener('message', (event) => {
    if (event.origin !== FROM) return
    const message = event.data
    if (!message || message.type !== 'roadmap.filters') return
    window.__offers.push(message.groups)
  })
  window.__context = (over) => frame.contentWindow.postMessage(Object.assign({
    /* Flat, not nested under \`context\`: the greeting wraps its context in a
       field and \`roadmap.context\` IS the context with two envelope fields
       added. Assuming symmetry costs an afternoon. */
    type: 'roadmap.context',
    protocol: 2,
    epic: ${JSON.stringify(EPIC)},
    project: 'roadmap',
    projectPath: ${JSON.stringify(PROJECT)},
    theme: 'light',
    passage: null,
    filters: {},
    prompt: null,
  }, over || {}), '*')
  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage({
      type: 'roadmap.hello',
      protocol: 2,
      session: 'scope',
      state: null,
      context: {
        epic: ${JSON.stringify(EPIC)},
        project: 'roadmap',
        projectPath: ${JSON.stringify(PROJECT)},
        theme: 'light',
        passage: null,
        filters: {},
        prompt: null,
      },
    }, '*')
  })
</script>
</body></html>`

const at = (path, from, to) => ({ path: `${PROJECT}/${path}`, page: null, from, to, quoted: '' })

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  /* Chrome refuses a page on one origin framing loopback unless the server opts
     in, and answers before the module's own headers are consulted. The real host
     is itself on loopback and never hits this; a probe whose host page is
     synthesised does. See the longer note in `dev/pointing.mjs`. */
  args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'],
})

const wrong = []
const ids = []

for (const seed of SEED) {
  const said = await mcp('add_quiz', seed)
  const id = /Question ([0-9a-f]{8}) written/.exec(said.result?.content?.[0]?.text ?? '')?.[1]
  if (id) ids.push(id)
}
console.log(`seeded ${ids.length} questions under epic "${EPIC}" — two in one chapter, one in another`)

try {
  for (const size of SIZES) {
    const context = await browser.newContext({ viewport: { width: size.width + 40, height: size.height + 40 } })
    const page = await context.newPage()
    await page.route('http://localhost:4181/scope-probe', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: host(size.width, size.height) }))
    await page.goto('http://localhost:4181/scope-probe', { waitUntil: 'domcontentloaded' })

    const frame = page.frameLocator('#frame')
    await frame.locator('[data-question]').first().waitFor({ timeout: 15_000 })

    const say = (said) => wrong.push(`${size.name}: ${said}`)
    const offer = () => page.evaluate(() => window.__offers.at(-1) ?? null)
    const rungs = async () => {
      const groups = await offer()
      if (!groups) return '(never offered)'
      if (!groups.length) return '(nothing)'
      return groups.map((g) => `${g.id}:${g.options.map((o) => o.id).join('/')}`).join(' ')
    }
    /*
     * How many questions the container is holding — which is NOT how many cards
     * are in the document, and the difference is a feature of this module rather
     * than an inconvenience.
     *
     * In a box too small for one whole question the page draws exactly one card
     * and pages between them, so counting `[data-question]` measures the ladder
     * and says nothing about the narrowing. The pager is where the number lives
     * there: `2 / 3`, and its denominator is the list. Where there is no pager
     * there is nothing to page through, and the cards are the list.
     */
    const shown = async () => {
      const controls = frame.locator('[data-controls]')
      if (await controls.count()) {
        const said = (await controls.first().textContent()) ?? ''
        const counted = /(\d+)\s*\/\s*(\d+)/.exec(said)
        if (counted) return Number(counted[2])
      }
      return frame.locator('[data-question]').count()
    }
    const note = async () => {
      const said = frame.locator('[data-scope-note]')
      return (await said.count()) ? ((await said.first().getAttribute('title')) ?? (await said.first().textContent())) : null
    }

    const settle = () => page.waitForTimeout(400)

    console.log(`\n=== ${size.name} ===`)

    /* 1. Nothing pointed at: nothing to narrow by. */
    await settle()
    const empty = await rungs()
    console.log(`  pointing at nothing → offer ${empty}, ${await shown()} questions drawn`)
    if (empty !== '(nothing)') {
      say(`offered "${empty}" with nothing pointed at — an option nothing can honour`)
    }

    /* 2. A document, then a selection inside it. The offer has to be re-sent as
       each rung comes into existence, the way notes re-sends when its count
       changes — an offer made once at mount would be a control drawn for a
       canvas nobody is standing on. */
    await page.evaluate((passage) => window.__context({ passage }), at(BRIDGE, null, null))
    await settle()
    const document_ = await rungs()
    console.log(`  pointing at a document → offer ${document_}`)
    if (document_ !== 'scope:all/file') say(`a document being pointed at offered "${document_}"`)

    await page.evaluate((passage) => window.__context({ passage }), at(BRIDGE, 1050, 1150))
    await settle()
    const selection = await rungs()
    console.log(`  pointing at a selection → offer ${selection}`)
    if (selection !== 'scope:all/file/section') say(`a selection offered "${selection}"`)

    /* 3 and 4. The choice comes back, the list narrows, and the page says by how
       much. `this document` keeps the two questions in that chapter. */
    await page.evaluate((passage) => window.__context({ passage, filters: { scope: 'file' } }), at(BRIDGE, 1050, 1150))
    await settle()
    const byFile = await shown()
    const fileNote = await note()
    console.log(`  narrowed to this document → ${byFile} questions drawn, page says “${fileNote}”`)
    if (byFile !== 2) say(`narrowing to one chapter of two drew ${byFile} questions, not 2`)
    if (fileNote !== '1 more question about other documents') {
      say(`narrowed by document, the page said “${fileNote}” rather than counting what it hid`)
    }

    /* `this passage` keeps only the question whose anchor the selection touches
       — which is what tells the range comparison from the path comparison. */
    await page.evaluate((passage) => window.__context({ passage, filters: { scope: 'section' } }), at(BRIDGE, 1050, 1150))
    await settle()
    const bySection = await shown()
    const sectionNote = await note()
    console.log(`  narrowed to this passage → ${bySection} questions drawn, page says “${sectionNote}”`)
    if (bySection !== 1) say(`narrowing to one paragraph drew ${bySection} questions, not 1`)
    if (sectionNote !== '2 more questions outside this passage') {
      say(`narrowed by passage, the page said “${sectionNote}” rather than counting what it hid`)
    }

    /* 5. The selection goes away with the choice still stored. The rung cannot be
       honoured, so it degrades to everything — a reader who cleared a highlight
       is not asking for an empty container, and the host still holds the choice
       for when they highlight something again. */
    await page.evaluate(() => window.__context({ passage: null, filters: { scope: 'section' } }))
    await settle()
    const back = await shown()
    const backNote = await note()
    console.log(`  selection cleared, choice kept → ${back} questions drawn, page says “${backNote}”`)
    if (back !== SEED.length) say(`a scope that cannot be honoured left ${back} questions drawn, not ${SEED.length}`)
    if (backNote !== null) say(`nothing was hidden and the page still said “${backNote}”`)
    if ((await rungs()) !== '(nothing)') say('the offer was not withdrawn when there was nothing left to narrow by')

    await context.close()
  }
} finally {
  for (const id of ids) await mcp('drop_quiz', { project: PROJECT, id })
  console.log(`\ndropped ${ids.length} seeded questions`)
}

await browser.close()

if (wrong.length) {
  console.error(`\nTHE OFFER IS WRONG:\n  ${wrong.join('\n  ')}`)
  process.exit(1)
}
console.log('\noffers only the rungs that exist, narrows by the passage on the canvas, and says what it hid')
