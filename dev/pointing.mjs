/**
 * The one thing this module asks permission for, watched from the host's side.
 *
 *   ./run.sh &                       # 7950
 *   node dev/pointing.mjs            # exits non-zero on any finding
 *
 * `manifest.ts` declares `passage:set` and then spends a page bounding it: this
 * app points when a person presses the source of a question, and never
 * otherwise — not on a load, not on a greeting, not on a context, not when the
 * poll brings back a question an agent has just written, and above all not when
 * somebody ANSWERS one. That bound is a claim about runtime behaviour, and the
 * only honest way to check a claim about runtime behaviour is to sit where the
 * host sits and count what arrives.
 *
 * So this page IS a host: it frames `/app`, greets it, records every
 * `roadmap.request` the frame sends, and then does the things that must NOT
 * produce one before doing the one thing that must. The shape is lifted from
 * `kehikko-explorer/dev/pointing.mjs`, which is the same probe for the same
 * capability in a module that reached the same conclusion.
 *
 * ## What it establishes
 *
 * 1. Loading and greeting produce ZERO `passage.set`.
 * 2. A second context — a canvas moving, which is the thing that arrives most
 *    often — produces zero.
 * 3b. Switching between the PARTS of a question, and paging to another one,
 *    produce zero. In a small box this module shows one part of one question at
 *    a time; a switcher that pointed the canvas would move every container on it
 *    five times while somebody read a single question.
 * 3. ANSWERING a question produces zero. This is the important one. A quiz that
 *    moved every container on the canvas when you chose an option would be
 *    answering for you, and it is the failure the press target was designed
 *    against: the card is almost entirely answer buttons, so "point" had to be
 *    an element a person cannot hit by aiming at an option.
 * 4. Pressing the source produces exactly one, carrying the ABSOLUTE path
 *    (project root joined onto the path the question was written with), the
 *    byte range the question is anchored to, no page, and the stored quote.
 * 5. A passage arriving from the canvas MARKS the question it names — driven by
 *    the context rather than by a memory of the press, which is the half a
 *    press-counting probe would miss and the only version that is honest when a
 *    host refuses.
 * 6. A passage naming some other place marks nothing.
 *
 * Not part of `bun test`, and deliberately: it needs a running server, a seeded
 * store and a chromium on disk, and a suite that cannot run on a fresh checkout
 * is a suite people learn to skip. Two paths below are this machine's; change
 * them or set the environment.
 *
 * NEVER `waitUntil: 'networkidle'`: this page polls every three seconds and a
 * host page never idles either, so the probe would simply hang.
 */
import { chromium } from '/Users/jaakkorajala/.claude/jobs/85f6bc23/tmp/node_modules/playwright/index.mjs'

const EXECUTABLE =
  process.env.CHROME
  ?? '/Users/jaakkorajala/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:7950'
const PROJECT = process.env.ROADMAP ?? '/Users/jaakkorajala/Projects/roadmap'
const EPIC = process.env.EPIC ?? 'modes-are-modules'

/* The two container sizes this module is actually given, run one after the
   other: the narrow column it is designed for, where the passage control is a
   button that opens an overlay, and a comfortable one, where it is the summary
   of a real `<details>`. They are different elements with different handlers,
   so a probe that only ran one would leave half the feature unwatched. */
const SIZES = [
  { name: '220x300 (the narrow column)', width: 220, height: 300 },
  { name: '460x420 (a comfortable container)', width: 460, height: 420 },
]

/**
 * A host, in one document.
 *
 * ## It greets on `load`, and that order is not interchangeable
 *
 * The obvious version greets when `roadmap.ready` arrives, and it waits
 * forever: the client sends `ready` in ANSWER to a greeting, naming the
 * protocol it was greeted with, so a host waiting for one is two programs each
 * waiting for the other. A real host greets on the frame's `load` event.
 *
 * ## It does not answer `passage.set`
 *
 * What is being measured is what the module SENDS, and separately whether it
 * marks a card when a passage ARRIVES. Answering automatically would fuse the
 * two, and then a module that marked from a memory of its own press rather than
 * from the context would pass. So the context is sent by hand, below, which is
 * also what proves the mark survives a host that refuses.
 */
const host = (width, height) => `<!doctype html>
<html><body style="margin:0">
<iframe id="frame" src="${ORIGIN}/app" width="${width}" height="${height}" style="border:0"
  sandbox="allow-scripts allow-same-origin"></iframe>
<script>
  window.__sent = []
  const frame = document.getElementById('frame')
  /*
   * Everything from the module's ORIGIN, and nothing else.
   *
   * This page listens to every message the window receives, which on a real
   * canvas is every module in every frame — so a probe that counted them all
   * would read another module's passage as this one's and would pass or fail on
   * somebody else's behaviour. \`event.origin\` is the check that costs nothing
   * and that the sender cannot forge.
   *
   * Deliberately NOT \`event.source === frame.contentWindow\`. It reads like the
   * more precise test and it silently drops everything: the frame is
   * cross-origin, so what arrives is an opaque window proxy that does not compare
   * equal to the reference this page holds. A probe that quietly counts zero of
   * everything reports a module as perfectly behaved, which is the most expensive
   * way for a probe to be wrong.
   */
  const FROM = ${JSON.stringify(new URL(ORIGIN).origin)}
  addEventListener('message', (event) => {
    if (event.origin !== FROM) return
    const message = event.data
    if (!message || typeof message.type !== 'string') return
    window.__sent.push(message)
  })
  window.__context = (over) => frame.contentWindow.postMessage(Object.assign({
    /* Flat, not nested under \`context\`. The greeting wraps its context in a
       field and \`roadmap.context\` IS the context with two envelope fields
       added, which is a difference that costs an afternoon if you assume
       symmetry. */
    type: 'roadmap.context',
    protocol: 2,
    epic: ${JSON.stringify(EPIC)},
    project: 'roadmap',
    projectPath: ${JSON.stringify(PROJECT)},
    theme: 'light',
    passage: null,
    prompt: null,
  }, over || {}), '*')
  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage({
      type: 'roadmap.hello',
      protocol: 2,
      session: 'pointing',
      state: null,
      context: {
        epic: ${JSON.stringify(EPIC)},
        project: 'roadmap',
        projectPath: ${JSON.stringify(PROJECT)},
        theme: 'light',
        passage: null,
        prompt: null,
      },
    }, '*')
  })
</script>
</body></html>`

/*
 * Local Network Access is turned off for this run, and only for this run.
 *
 * Chrome refuses a page on one origin framing `127.0.0.1` unless the loopback
 * server opts in, and answers `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`
 * before the module's own headers are ever consulted. The real host is itself on
 * loopback, so it does not hit this; a probe whose host page is synthesised by
 * the test runner does. Disabling the check removes an artefact of the harness
 * rather than relaxing anything the module relies on — its own `frame-ancestors`
 * is still enforced, which is why the host page is served from an origin that
 * header names.
 */
const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'],
})

const wrong = []

/** Forget every answer for this epic, through the page's own write door. */
const reset = (frame) =>
  frame.locator('body').evaluate(async (_, [project, epic]) => {
    const ticket = JSON.parse(document.getElementById('ticket').textContent)
    await fetch('/api/retake', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-learning-ticket': ticket },
      body: JSON.stringify({ project, epic }),
    })
  }, [PROJECT, EPIC])

for (const size of SIZES) {
  const context = await browser.newContext({ viewport: { width: size.width + 40, height: size.height + 40 } })
  const page = await context.newPage()

  await page.route('http://localhost:4181/learning-probe', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: host(size.width, size.height) }))
  await page.goto('http://localhost:4181/learning-probe', { waitUntil: 'domcontentloaded' })

  let frame = page.frameLocator('#frame')
  await frame.locator('[data-question]').first().waitFor({ timeout: 15_000 })

  /*
   * Start from unanswered, so this probe can be run twice.
   *
   * Through the page itself, with the write ticket read out of the document's
   * own JSON island — the only way to reach a write door here, and worth
   * demonstrating on its way past. Then the whole host page is reloaded, so the
   * counting below starts from a frame that has sent nothing.
   */
  await reset(frame)
  await page.reload({ waitUntil: 'domcontentloaded' })
  frame = page.frameLocator('#frame')
  await frame.locator('[data-question][data-answered="no"]').first().waitFor({ timeout: 15_000 })

  const passages = () =>
    page.evaluate(() => window.__sent.filter((m) => m.type === 'roadmap.request' && m.method === 'passage.set'))
  const marked = () =>
    frame.locator('[data-question][data-pointed="yes"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-question')))

  /* 1. Load and greeting. */
  const afterLoad = await passages()

  /* 2. A second context, which is what arrives most often on a live canvas. */
  await page.evaluate(() => window.__context({}))
  await page.waitForTimeout(300)
  const afterContext = await passages()

  /* 3. Answering. The card is almost entirely answer buttons, and this is the
     assertion that choosing one moves nothing. Reset afterwards through the
     page's own write door so the probe is idempotent. */
  const first = frame.locator('[data-question]').first()
  const id = await first.getAttribute('data-question')
  const source = await first.locator('[data-passage]').getAttribute('data-source')
  await first.locator('button[data-slot="button"]').first().click()
  await page.waitForTimeout(600)
  const afterAnswer = await passages()

  /*
   * 3b. Moving around inside the module.
   *
   * In a box too small to hold one whole question this page shows one PART of it
   * at a time — the question, the options, or the passage — and pages between
   * questions with arrows. Those controls change what is on screen and nothing
   * else. Pressing "passage" shows the reader the quote HERE; it does not ask
   * every other container on the canvas to move, because navigating inside a
   * module is not a person saying "take me there". Only the source control says
   * that.
   *
   * Same argument as the one that kept the answer buttons from pointing, and it
   * needs the same proof: a switcher wired to `onPoint` for convenience would
   * look identical on screen and would move the canvas five times while somebody
   * read one question.
   */
  for (const chip of await frame.locator('[data-part]').all()) {
    await chip.click()
    await page.waitForTimeout(120)
  }
  const onward = frame.locator('[data-page="on"]')
  if (await onward.count()) {
    await onward.click()
    await page.waitForTimeout(200)
    await frame.locator('[data-page="back"]').click()
    await page.waitForTimeout(200)
  }
  const afterMoving = await passages()

  /* 4. The press. The source control is drawn on every part, so it is reachable
     wherever the switcher above left the reader. */
  await first.locator('[data-passage]').click()
  await page.waitForTimeout(400)
  const afterPress = await passages()

  /* 5. The other direction. The host above never answered `passage.set`, so
     this context is the canvas moving on its own — which is exactly what a host
     that refused would leave, and the mark has to be driven by it. */
  const sent = afterPress.at(-1)?.params?.passage ?? null
  if (sent) {
    await page.evaluate((passage) => window.__context({ passage }), sent)
    await page.waitForTimeout(400)
  }
  const markedAfterContext = await marked()

  /* 6. And somewhere else entirely marks nothing. */
  await page.evaluate((project) =>
    window.__context({
      passage: { path: `${project}/nowhere.tex`, page: null, from: 1, to: 2, quoted: '' },
    }), PROJECT)
  await page.waitForTimeout(400)
  const markedElsewhere = await marked()

  /*
   * 7. NARROWING, which is the newest way to change what this container shows.
   *
   * The scope control lives in the container header: the host draws it, the
   * reader presses it, and the choice comes back as `filters` on a context. So
   * from this module's side a narrowing is exactly a context — and a context must
   * not point. It is the same argument as answering and as switching parts, and
   * it needs the same proof, because narrowing REBUILDS the list from a passage
   * and a page that pointed at whatever it had narrowed to would move every
   * container on the canvas every time somebody chose a scope.
   *
   * Sent last, and with a passage, because a narrowing with nothing pointed at is
   * a narrowing that cannot do anything: `scopeOf()` degrades an unhonourable
   * rung to `all`. This is the version that genuinely re-filters the list.
   */
  if (sent) {
    await page.evaluate((passage) => window.__context({ passage, filters: { scope: 'section' } }), sent)
    await page.waitForTimeout(400)
  }
  const afterNarrowing = await passages()

  /* What the module offered to be narrowed BY, for the record. That it arrives
     at all, and with the right rungs, is `dev/scope.mjs`; here it is printed so
     that a run of this probe says whether the header had a control on it. */
  const offers = await page.evaluate(() =>
    window.__sent
      .filter((m) => m.type === 'roadmap.filters')
      .map((m) => m.groups.map((g) => `${g.id}:${g.options.map((o) => o.id).join('/')}`).join(' ') || '(nothing)'))

  /* Put the store back, so the next size — and the next run — start clean. */
  await reset(frame)

  const label = await first.locator('[data-passage]').textContent()

  console.log(`\n=== ${size.name} ===`)
  console.table({
    'passage.set after load and greeting': afterLoad.length,
    'passage.set after a second context': afterContext.length,
    'passage.set after ANSWERING a question': afterAnswer.length,
    'passage.set after switching parts and paging': afterMoving.length,
    'passage.set after pressing the source': afterPress.length,
    'passage.set after NARROWING the container': afterNarrowing.length,
    'what it offered to be narrowed by': offers.at(-1) ?? '(never offered)',
    'the path sent': sent?.path ?? null,
    'the range sent': sent ? `${sent.from} … ${sent.to}` : null,
    'the page sent': sent?.page ?? null,
    'the quote sent (chars)': sent?.quoted?.length ?? null,
    'what the source control reads': label,
    'marked when the canvas points back': markedAfterContext.join(',') || '(none)',
    'marked when it points somewhere else': markedElsewhere.join(',') || '(none)',
  })

  const at = (said) => wrong.push(`${size.name}: ${said}`)
  if (afterLoad.length !== 0) at('pointed on load or greeting')
  if (afterContext.length !== 0) at('pointed on a context')
  if (afterAnswer.length !== afterContext.length) at('pointed when a question was ANSWERED')
  if (afterMoving.length !== afterAnswer.length) at('pointed when the reader switched parts or paged')
  if (afterPress.length !== afterMoving.length + 1) {
    at(`pressing the source sent ${afterPress.length - afterMoving.length} passages, not 1`)
  }
  if (afterNarrowing.length !== afterPress.length) at('pointed when the container was NARROWED')
  if (sent && sent.path !== `${PROJECT}/${source}`) at(`sent ${sent.path}, not the project root joined onto ${source}`)
  if (sent && sent.page !== null) at('sent a page number for a document it has never paginated')
  if (sent && !(sent.from < sent.to)) at('sent a range that is not a range')
  if (sent && !sent.quoted) at('sent no quote, when the quote is what makes the anchor checkable')
  if (markedAfterContext.join(',') !== id) at(`the passage from the canvas marked "${markedAfterContext}", not ${id}`)
  if (markedElsewhere.length !== 0) at(`a passage naming somewhere else marked ${markedElsewhere.join(',')}`)
  /* At 220 the label is the file name; at 460 it is the whole project-relative
     path. Both are decided in `view/room.ts` and neither is "the passage this is
     about", which is what every card used to say. */
  if (label === 'the passage this is about') at('the source control does not say where the question came from')
  if (size.width < 360 && label !== source.split('/').pop()) at(`narrow label was "${label}", not the file name`)
  if (size.width >= 360 && label !== source) at(`wide label was "${label}", not the whole path`)

  await context.close()
}

await browser.close()

if (wrong.length) {
  console.error(`\nTHE BOUND IS BROKEN:\n  ${wrong.join('\n  ')}`)
  process.exit(1)
}
console.log('\npoints only on a press of a question’s source, and marks the question the canvas is pointed at')
