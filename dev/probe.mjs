/**
 * The Learning module, in a real browser, greeted the way a host greets it.
 *
 *   ./run.sh &                       # 7950
 *   node dev/probe.mjs               # exits non-zero on any finding
 *
 * Not part of `bun test`, and deliberately: it needs a running server, a seeded
 * store and a chromium on disk, and a suite that cannot run on a fresh checkout
 * is a suite people learn to skip. What it measures is the half `bun test`
 * cannot — real layout at real widths, and the answer key's absence from a DOM
 * a browser actually built.
 *
 * It is idempotent: step 0 clears the answers through the page's own write door
 * before anything asserts, so it can be run twice.
 *
 * Two paths below are this machine's. Change them or set the environment.
 *
 * NEVER `waitUntil: 'networkidle'`: this page polls every three seconds and a
 * host page never idles either, so the probe would simply hang.
 */
/* Not a dependency of this package. Playwright is a hundred megabytes and this
   file is not part of `bun test`; point PLAYWRIGHT at wherever one already is. */
const { chromium } = await import(
  process.env.PLAYWRIGHT ?? '/Users/jaakkorajala/.claude/jobs/85f6bc23/tmp/node_modules/playwright-core/index.mjs'
)

const EXECUTABLE =
  process.env.CHROME
  ?? '/Users/jaakkorajala/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'

const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:7950'
const ROADMAP = '/Users/jaakkorajala/Projects/roadmap'
const OTHER = '/Users/jaakkorajala/Projects/kehikko-checklist'

/** Greet the page the way a host does: HELLO with a context, on the page itself. */
const greet = (context) => `
  window.postMessage({
    type: 'roadmap.hello',
    protocol: 2,
    session: 'probe-session',
    context: ${JSON.stringify(context)},
    state: null,
  }, '*')
`

const ctx = (over = {}) => ({
  epic: 'modes-are-modules',
  project: 'roadmap',
  projectPath: ROADMAP,
  theme: 'light',
  selection: [],
  kehikko: { id: 1, name: 'A canvas' },
  prompt: null,
  pinned: false,
  ...over,
})

const say = (...args) => console.log(...args)

async function main() {
  const browser = await chromium.launch({ executablePath: EXECUTABLE })
  const problems = []

  async function open(context, width = 400) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const console_ = []
    page.on('console', (m) => console_.push(`${m.type()}: ${m.text()}`))
    page.on('pageerror', (e) => console_.push(`pageerror: ${e.message}`))
    await page.goto(`${ORIGIN}/app`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#root > *', { timeout: 10000 })
    await page.evaluate(greet(context))
    return { page, console_ }
  }

  /* ------------------------------------------------------------------ *
   * 0. Start from unanswered, so this probe can be run twice.
   *
   * Through the page itself, with the ticket read out of the document's own
   * JSON island — which is the only way to reach a write door, and is worth
   * demonstrating on its way past.
   * ------------------------------------------------------------------ */
  const { page, console_ } = await open(ctx())
  const reset = await page.evaluate(async (project) => {
    const ticket = JSON.parse(document.getElementById('ticket').textContent)
    const r = await fetch('/api/retake', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-learning-ticket': ticket },
      body: JSON.stringify({ project, epic: 'modes-are-modules' }),
    })
    return { status: r.status, said: (await r.json()).said }
  }, ROADMAP)
  say('\n=== 0. RESET (through the page, with the page’s own ticket) ===')
  say(JSON.stringify(reset))

  /* And the same call without the ticket, to show the gate is real. */
  const ungated = await page.evaluate(async (project) => {
    const r = await fetch('/api/retake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project, epic: 'modes-are-modules' }),
    })
    return { status: r.status, error: (await r.json()).error }
  }, ROADMAP)
  say('without the ticket:', JSON.stringify(ungated))
  if (ungated.status !== 403) problems.push('a write without the ticket was not refused')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#root > *', { timeout: 10000 })
  await page.evaluate(greet(ctx()))

  /* ------------------------------------------------------------------ *
   * 1. A question written over MCP appears in the pane
   * ------------------------------------------------------------------ */
  await page.waitForSelector('[data-question]', { timeout: 10000 })
  const shown = await page.$$eval('[data-question]', (nodes) =>
    nodes.map((n) => ({
      id: n.getAttribute('data-question'),
      answered: n.getAttribute('data-answered'),
      question: n.querySelector('p')?.textContent,
    })),
  )
  say('\n=== 1. QUESTIONS WRITTEN OVER MCP, AS THE PANE SEES THEM ===')
  say(JSON.stringify(shown, null, 2))
  if (shown.length !== 2) problems.push(`expected 2 questions for roadmap, saw ${shown.length}`)

  /* ------------------------------------------------------------------ *
   * 2. Partitioned by project — the other project's question is NOT here
   * ------------------------------------------------------------------ */
  const html = await page.content()
  say('\n=== 2. PARTITIONING ===')
  say('the other project’s question text present in this DOM:', html.includes('DIFFERENT project entirely'))
  if (html.includes('DIFFERENT project entirely')) problems.push('another project’s question leaked into this pane')

  const other = await open(ctx({ projectPath: OTHER, project: 'kehikko-checklist' }))
  await other.page.waitForSelector('[data-question]', { timeout: 10000 })
  const otherShown = await other.page.$$eval('[data-question]', (n) =>
    n.map((x) => x.querySelector('p')?.textContent),
  )
  say('the OTHER project’s pane, same epic slug, shows:', JSON.stringify(otherShown))
  if (otherShown.length !== 1 || !otherShown[0].includes('DIFFERENT project')) {
    problems.push('the other project’s pane did not show exactly its own question')
  }
  await other.page.close()

  /* ------------------------------------------------------------------ *
   * 3. THE ANSWER IS NOT IN THE DOM BEFORE IT IS ASKED FOR
   * ------------------------------------------------------------------ */
  say('\n=== 3. THE ANSWER, BEFORE ANYBODY HAS CHOSEN ===')
  /* Scoped to the CARDS, not the whole document: the page's own header prose
     explains the rule in English ("the correct option is not in this page until
     you have chosen"), and a search over that would flag the explanation as the
     leak. What matters is whether the questions carry it. */
  const before = await page.evaluate(() => ({
    html: [...document.querySelectorAll('[data-question]')].map((n) => n.outerHTML).join(''),
    correctMarkers: document.querySelectorAll('[data-correct]').length,
  }))
  say('elements carrying [data-correct]:', before.correctMarkers)
  const leaks = [
    ['the word "correct" anywhere in the document', /correct/i.test(before.html)],
    ['the explanation for question 1', before.html.includes('The manifest is the only half a host reads')],
    ['the explanation for question 2', before.html.includes('Framed without allow-same-origin')],
    ['any "answer" outside data-answered="no"', /answer/i.test(before.html.replace(/data-answered="no"/g, ''))],
  ]
  for (const [what, found] of leaks) {
    say(`  ${found ? 'LEAK  ' : 'absent'} — ${what}`)
    if (found) problems.push(`answer key leaked: ${what}`)
  }
  if (before.correctMarkers !== 0) problems.push('data-correct present before answering')

  /* And what the SERVER sent, which is where the absence actually comes from. */
  const wire = await page.evaluate(async (project) => {
    const r = await fetch(`/api/questions?project=${encodeURIComponent(project)}&epic=modes-are-modules`)
    return r.text()
  }, ROADMAP)
  say('\n  what /api/questions actually sent (the key fields):')
  for (const q of JSON.parse(wire).questions) {
    say(`    ${q.id}: answer=${JSON.stringify(q.answer)} why=${JSON.stringify(q.why)} options=${q.options.length}`)
    if (q.answer !== null || q.why !== null) problems.push(`the server sent a key for unanswered ${q.id}`)
  }

  /* The three option buttons are indistinguishable. */
  const classes = await page.$$eval('[data-question]:first-of-type button', (b) => b.map((x) => x.className))
  say('  distinct class strings across the options:', new Set(classes).size, 'of', classes.length)
  if (new Set(classes).size !== 1) problems.push('the options are not styled identically before answering')

  /* ------------------------------------------------------------------ *
   * 4. Answering is recorded, and survives a reload
   * ------------------------------------------------------------------ */
  say('\n=== 4. ANSWERING ===')
  const first = shown[0].id
  await page.click(`[data-question="${first}"] button >> nth=0`) // the wrong one
  await page.waitForSelector(`[data-question="${first}"][data-answered="yes"]`, { timeout: 10000 })
  const after = await page.evaluate((id) => {
    const card = document.querySelector(`[data-question="${id}"]`)
    return {
      verdict: card.querySelector('[data-slot="badge"]')?.textContent,
      correct: card.querySelector('[data-correct="true"]')?.textContent,
      chose: card.querySelector('[data-chose="true"]')?.textContent,
      why: card.querySelector('p.border-l-2')?.textContent,
    }
  }, first)
  say('after choosing option 0 (the wrong one):')
  say(JSON.stringify(after, null, 2))
  if (after.verdict !== 'wrong') problems.push('the verdict was not shown')
  if (!after.correct) problems.push('the correct option was not revealed after answering')

  /* The second question is STILL withheld — revealing one does not reveal all. */
  const second = shown[1].id
  const stillHidden = await page.evaluate(
    (id) => document.querySelector(`[data-question="${id}"]`).outerHTML,
    second,
  )
  say('\nthe question NOT yet answered still carries no key:', !/data-correct/.test(stillHidden))
  if (/data-correct/.test(stillHidden)) problems.push('answering one question revealed another’s key')

  /* Reload. */
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#root > *', { timeout: 10000 })
  await page.evaluate(greet(ctx()))
  await page.waitForSelector(`[data-question="${first}"][data-answered="yes"]`, { timeout: 10000 })
  const survived = await page.evaluate((id) => {
    const card = document.querySelector(`[data-question="${id}"]`)
    return { verdict: card.querySelector('[data-slot="badge"]')?.textContent, correct: !!card.querySelector('[data-correct="true"]') }
  }, first)
  say('after a reload:', JSON.stringify(survived))
  if (survived.verdict !== 'wrong') problems.push('the answer did not survive a reload')

  /* ------------------------------------------------------------------ *
   * 4b. A question written over MCP while the pane is OPEN arrives in it
   * ------------------------------------------------------------------ */
  say('\n=== 4b. A QUESTION ARRIVING WHILE THE PANE IS OPEN ===')
  const written = await fetch(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'add_quiz',
        arguments: {
          project: ROADMAP,
          epic: 'modes-are-modules',
          question: 'Where does the answer key live, in this module?',
          options: [
            'In the page, drawn only after a press',
            'On the server, sent only in the reply to an answer',
            'In localStorage, per browser profile',
          ],
          answer: 1,
          why: 'Nothing the browser held before the request could produce the verdict.',
          path: 'quiz/questions.ts',
          start: 1,
          end: 2,
          quote: 'A Question never leaves this process. An Asked is what leaves.',
          agent: 'the probe',
        },
      },
    }),
  }).then((r) => r.json())
  const wroteId = /Question ([0-9a-f]{8}) written/.exec(written.result?.content?.[0]?.text ?? '')?.[1]
  say('written over MCP while the page was open:', wroteId)
  await page.waitForSelector(`[data-question="${wroteId}"]`, { timeout: 15000 })
  say('appeared in the open pane without a reload: true')
  const arrivedHidden = await page.evaluate((id) => document.querySelector(`[data-question="${id}"]`).outerHTML, wroteId)
  say('and it arrived with no key:', !/data-correct/.test(arrivedHidden))
  if (/data-correct/.test(arrivedHidden)) problems.push('a question arriving over MCP carried its key')
  /* Put the store back where the earlier steps left it. */
  await fetch(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'drop_quiz', arguments: { project: ROADMAP, id: wroteId } },
    }),
  })

  /* ------------------------------------------------------------------ *
   * 5. The no-epic screen
   * ------------------------------------------------------------------ */
  say('\n=== 5. THE NO-EPIC SCREEN ===')
  const none = await open(ctx({ epic: null }))
  await none.page.waitForSelector('text=No paper is open', { timeout: 10000 })
  say(await none.page.$eval('#root', (n) => n.innerText))
  await none.page.close()

  /* And the no-project screen, which is the other nullable fact. */
  say('\n=== 5b. THE NO-PROJECT SCREEN ===')
  const nowhere = await open(ctx({ projectPath: null, project: null }))
  await nowhere.page.waitForSelector('text=This canvas did not say where it is', { timeout: 10000 })
  say(await nowhere.page.$eval('#root', (n) => n.innerText))
  await nowhere.page.close()

  /* ------------------------------------------------------------------ *
   * 6. No horizontal overflow at every width, in both themes
   * ------------------------------------------------------------------ */
  say('\n=== 6. HORIZONTAL OVERFLOW ===')
  for (const theme of ['light', 'dark']) {
    for (const width of [220, 280, 320, 400, 1200]) {
      const probe = await browser.newPage({ viewport: { width, height: 900 } })
      await probe.goto(`${ORIGIN}/app`, { waitUntil: 'domcontentloaded' })
      await probe.waitForSelector('#root > *', { timeout: 10000 })
      await probe.evaluate(greet(ctx({ theme })))
      await probe.waitForSelector('[data-question]', { timeout: 10000 })
      const m = await probe.evaluate(() => {
        const de = document.documentElement
        let widest = null
        let widestFloor = 0
        for (const el of document.querySelectorAll('*')) {
          const floor = el.getBoundingClientRect().width
          if (floor > widestFloor) {
            widestFloor = floor
            widest = el.tagName + '.' + (el.className || '').toString().slice(0, 40)
          }
        }
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          bodyScroll: document.body.scrollWidth,
          background: getComputedStyle(document.body).backgroundColor,
          dark: de.classList.contains('dark'),
          widest,
          widestFloor: Math.round(widestFloor),
        }
      })
      const overflows = m.scrollWidth > m.clientWidth
      say(
        `  ${theme.padEnd(5)} ${String(width).padStart(4)}px — scrollWidth ${m.scrollWidth} / client ${m.clientWidth}` +
          ` ${overflows ? 'OVERFLOWS' : 'ok'} · bg ${m.background} · dark=${m.dark} · widest ${m.widestFloor}px`,
      )
      if (overflows) problems.push(`horizontal overflow at ${width}px in ${theme}: ${m.scrollWidth} > ${m.clientWidth}`)
      if (theme === 'dark' && !m.dark) problems.push('the dark class was not applied from the host theme')
      await probe.close()
    }
  }

  /* ------------------------------------------------------------------ *
   * 7. The console, which is where a node: import in the bundle shows up
   * ------------------------------------------------------------------ */
  say('\n=== 7. BROWSER CONSOLE ===')
  /* The 403 is one this probe provoked on purpose in step 0, to show the write
     gate is real. Everything else is a finding. */
  const noise = console_.filter(
    (line) => !/vite|hmr|Download the React DevTools/i.test(line) && !/status of 403/.test(line),
  )
  say(noise.length ? noise.join('\n') : '  (nothing)')
  for (const line of noise) if (/error|failed/i.test(line)) problems.push(`console: ${line}`)

  say('\n=== VERDICT ===')
  say(problems.length ? problems.map((p) => `  PROBLEM: ${p}`).join('\n') : '  everything above measured clean')

  await browser.close()
  process.exit(problems.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
