/**
 * Does the pane actually NARROW to what the kehikko shows — in a real browser,
 * against a copy of the owner's thesis store — and does it say why when it
 * empties?
 *
 *     rm -rf /tmp/learning-aim-project && mkdir -p /tmp/learning-aim-project/.kehikot
 *     cp -R <CS-DEGREE>/.kehikot/learning /tmp/learning-aim-project/.kehikot/
 *     cp -R <CS-DEGREE>/.kehikot/paper    /tmp/learning-aim-project/.kehikot/
 *     ROADMAP_MODULES_DIR=/tmp/learning-aim-registry PORT=7971 bunx vite    # in the module
 *     ORIGIN=http://127.0.0.1:7971 PROJECT=/tmp/learning-aim-project bun dev/aim.probe.mjs
 *
 * ## What it plays
 *
 * A host, from where a host sits: it frames `/app`, greets it with a context
 * that carries `containers`, answers every `roadmap.request` (so `showing.set`
 * and `passage.set` resolve rather than time out), records every offer and
 * every `showing.set`, and walks the canvases the consumer rule names:
 *
 *   1. The store as copied — eighteen anchors that do not resolve — with a
 *      paper container showing chapter three and nothing picked out.
 *   2. The eighteen re-anchored through the module's own MCP door, absolute
 *      paths, one call each. Then the same canvas: chapter three's questions.
 *   3. Paper picked out. Journeys picked out alone. Both. The aim turned off.
 *      No containers at all.
 *
 * Every line printed is read off the rendered DOM. The screenshots go to
 * `/tmp/learning-aim-*.png` at 220×340 — the smallest box this module gets —
 * and at 460×420.
 *
 * Never run against the owner's live project: step 2 WRITES.
 */
import { chromium } from '/Users/jaakkorajala/.claude/jobs/85f6bc23/tmp/node_modules/playwright/index.mjs'

const EXECUTABLE =
  process.env.CHROME
  ?? '/Users/jaakkorajala/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:7971'
const PROJECT = process.env.PROJECT ?? '/tmp/learning-aim-project'
const EPIC = 'thesis'
const PAPER = `${PROJECT}/.kehikot/paper/${EPIC}`
const SELF = 'roadmap.learning'

const host = (width, height) => `<!doctype html>
<html><body style="margin:0;background:#888">
<div id="box" style="width:${width}px;height:${height}px;background:#fff;overflow:hidden">
<iframe id="frame" src="${ORIGIN}/app" width="${width}" height="${height}" style="border:0;display:block"
  sandbox="allow-scripts allow-same-origin"></iframe></div>
<script>
  window.__sent = []
  const frame = document.getElementById('frame')
  const FROM = ${JSON.stringify(new URL(ORIGIN).origin)}
  const base = () => ({
    epic: ${JSON.stringify(EPIC)}, project: 'thesis', projectPath: ${JSON.stringify(PROJECT)}, theme: 'light',
    passage: null, selection: [], filters: {}, containers: [], prompt: null, pinned: false,
  })
  let current = base()
  addEventListener('message', (event) => {
    if (event.origin !== FROM) return
    const message = event.data
    if (!message || typeof message.type !== 'string') return
    window.__sent.push(message)
    /* Every request is answered, so nothing times out. */
    if (message.type === 'roadmap.request') {
      frame.contentWindow.postMessage({ type: 'roadmap.response', id: message.id, ok: true, data: {} }, '*')
    }
  })
  window.__context = (over) => {
    current = Object.assign(base(), over || {})
    frame.contentWindow.postMessage(Object.assign({ type: 'roadmap.context', protocol: 2 }, current), '*')
  }
  frame.addEventListener('load', () => {
    frame.contentWindow.postMessage({ type: 'roadmap.hello', protocol: 2, session: 'aim', state: null, context: base() }, '*')
  })
</script>
</body></html>`

const doc = (file, from = null, to = null) => ({ path: `${PAPER}/${file}`, page: null, from, to, quoted: '' })
const row = (module, selected, documents = []) => ({ module, selected, showing: { refs: [], documents } })

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'],
})

/** Re-anchor every question in the copy, through the door, one call each. */
async function reanchor(page) {
  return page.evaluate(async ([origin, project, epic, paper]) => {
    const call = async (name, args) => {
      const r = await fetch(`${origin}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      })
      const body = await r.json()
      return { text: body.result?.content?.[0]?.text ?? '', isError: body.result?.isError === true }
    }
    const listing = await call('quizzes', { project, epic })
    const ids = [...listing.text.matchAll(/^\d+\. ([0-9a-f]{8}) — /gm)].map((m) => m[1])
    const paths = [...listing.text.matchAll(/anchored to (\S+) bytes/g)].map((m) => m[1])
    const out = []
    for (let i = 0; i < ids.length; i += 1) {
      const r = await call('reword_quiz', { project, id: ids[i], path: `${paper}/${paths[i]}` })
      out.push(`${ids[i]} ${r.isError ? 'REFUSED ' + r.text.slice(0, 80) : r.text.split('\n')[0]}`)
    }
    const after = await call('quizzes', { project, epic })
    return { before: (listing.text.match(/does NOT resolve/g) ?? []).length, out, after: (after.text.match(/does NOT resolve/g) ?? []).length }
  }, [ORIGIN, PROJECT, EPIC, PAPER])
}

for (const size of [
  { name: '220x340', width: 220, height: 340 },
  { name: '460x420', width: 460, height: 420 },
]) {
  const context = await browser.newContext({ viewport: { width: size.width + 40, height: size.height + 40 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.log(`  PAGEERROR ${error.message}`))
  await page.route('http://localhost:4181/learning-aim', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: host(size.width, size.height) }))
  await page.goto('http://localhost:4181/learning-aim', { waitUntil: 'domcontentloaded' })
  const frame = page.frameLocator('#frame')
  await frame.locator('[data-question], [data-aim-note], [data-scope-note]').first().waitFor({ timeout: 15_000 })

  const read = async () => {
    const cards = await frame.locator('[data-question]').evaluateAll((nodes) =>
      nodes.map((n) => `${n.getAttribute('data-question')}:${n.querySelector('[data-passage]')?.getAttribute('data-source')?.split('/').pop()}:${n.querySelector('[data-passage]')?.getAttribute('data-passage')}`))
    const note = await frame.locator('[data-aim-note], [data-scope-note]').evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()))
    return { cards, note }
  }
  const offers = () => page.evaluate(() => window.__sent.filter((m) => m.type === 'roadmap.filters').map((m) => JSON.stringify(m.groups)))
  const showings = () => page.evaluate(() => window.__sent.filter((m) => m.type === 'roadmap.request' && m.method === 'showing.set').map((m) => m.params.documents.map((d) => d.path.split('/').pop()).join(',') || '(nothing)'))
  const snap = async (name) => page.screenshot({ path: `/tmp/learning-aim-${size.name}-${name}.png`, clip: { x: 0, y: 0, width: size.width, height: size.height } })
  const walk = async (name, over) => {
    await page.evaluate((o) => window.__context(o), over)
    await page.waitForTimeout(500)
    const { cards, note } = await read()
    console.log(`  ${name}: ${cards.length} cards ${cards.join(' ')}`)
    for (const line of note) console.log(`    note: ${line}`)
    await snap(name)
  }

  console.log(`\n== ${size.name} ==`)
  await page.waitForTimeout(600)
  const first = await read()
  console.log(`  as loaded, no containers: ${first.cards.length} cards, ${first.cards.filter((c) => c.endsWith(':missing')).length} marked missing`)
  await snap('0-as-loaded')

  await walk('1-broken-paper-ch3-unpicked', {
    containers: [row('roadmap.paper', false, [doc('chapters/3_methods.tex')]), row('roadmap.journeys', false), row(SELF, false)],
  })

  if (size.name === '220x340') {
    const fixed = await reanchor(page)
    console.log(`  re-anchored through the door: ${fixed.before} unresolved before, ${fixed.after} after`)
    for (const line of fixed.out) console.log(`    ${line}`)
    /* The poll picks the change up within three seconds. */
    await page.waitForTimeout(3500)
  } else {
    await page.waitForTimeout(3500)
  }

  await walk('2-paper-ch3-unpicked', {
    containers: [row('roadmap.paper', false, [doc('chapters/3_methods.tex')]), row('roadmap.journeys', false), row(SELF, false)],
  })
  await walk('3-paper-ch3-picked', {
    containers: [row('roadmap.paper', true, [doc('chapters/3_methods.tex')]), row('roadmap.journeys', false), row(SELF, false)],
  })
  await walk('4-paper-ch1-picked-passage-ch3', {
    passage: doc('chapters/3_methods.tex', 100, 200),
    containers: [row('roadmap.paper', true, [doc('chapters/1_introduction.tex')]), row('roadmap.journeys', false), row(SELF, false)],
  })
  await walk('5-journeys-picked-alone', {
    containers: [row('roadmap.paper', false, [doc('chapters/3_methods.tex')]), row('roadmap.journeys', true), row(SELF, false)],
  })
  await walk('6-aim-all', {
    filters: { aim: 'all' },
    containers: [row('roadmap.paper', false, [doc('chapters/3_methods.tex')]), row('roadmap.journeys', true), row(SELF, false)],
  })
  await walk('7-self-picked-alone', {
    containers: [row('roadmap.paper', false, [doc('chapters/3_methods.tex')]), row(SELF, true, [doc('chapters/1_introduction.tex')])],
  })
  await walk('8-no-containers', {})
  await walk('9-scope-section-within-ch3', {
    filters: { scope: 'section' },
    passage: doc('chapters/3_methods.tex', 0, 4000),
    containers: [row('roadmap.paper', false, [doc('chapters/3_methods.tex', 0, 4000)])],
  })

  console.log('  offers:')
  for (const line of await offers()) console.log(`    ${line}`)
  console.log(`  showing.set sent, in order: ${(await showings()).join(' | ')}`)
  await context.close()
}

await browser.close()
