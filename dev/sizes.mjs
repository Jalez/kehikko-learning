/**
 * What the module actually looks like in the box a canvas gives it.
 *
 *   ./run.sh &                       # 7950
 *   node dev/sizes.mjs               # exits non-zero on any finding
 *
 * `dev/probe.mjs` answers "is the answer key out of the DOM, and does anything
 * overflow sideways". This one answers a different question: in a container 220
 * wide and 300 tall — the ordinary case on a canvas, not the extreme — how much
 * of a question can you see, how many pixels are spent before the first word of
 * it, and does a small flick land the next card flush against the top or half
 * off the bottom.
 *
 * ## Why it puts the page in a real iframe
 *
 * Because `framed` in `src/app.tsx` is `window.parent !== window`, and the whole
 * heading only exists when nothing is framing the page. A probe that navigated
 * straight to `/app` would measure 130 pixels of explanation that a reader on a
 * canvas never sees, and would then draw conclusions about a layout nobody has.
 * The harness below is the smallest thing that is honestly a host: an iframe of
 * exactly the container's size, and a `roadmap.hello` posted into it.
 *
 * ## What it establishes
 *
 * The card heights in the comment at the top of `src/view/room.ts` are read out
 * of this file's output, and the thresholds there are arguments about them. Run
 * it after changing either.
 *
 * NEVER `waitUntil: 'networkidle'`: the page polls every three seconds, so it
 * never idles and the probe would hang.
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT ?? '/Users/jaakkorajala/.claude/jobs/85f6bc23/tmp/node_modules/playwright/index.mjs'
)

const EXECUTABLE =
  process.env.CHROME
  ?? '/Users/jaakkorajala/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'

const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:7950'
const ROADMAP = '/Users/jaakkorajala/Projects/roadmap'
/* Its own epic, so this never touches the questions the other probe asserts on. */
const EPIC = 'sizes-probe'

/* The sizes a container on a canvas actually gets. The first two are what this
   file exists for; the last is the "it is also fine large" control. */
const SIZES = [
  { width: 220, height: 300 },
  { width: 320, height: 200 },
  { width: 460, height: 360 },
  { width: 900, height: 700 },
]

const ctx = (over = {}) => ({
  epic: EPIC,
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

const mcp = (name, args) =>
  fetch(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }).then((r) => r.json())

/* Six questions of the length an agent actually writes, so what is measured is a
   column of them and not one card with room to spare. */
const SEED = [0, 1, 2, 3, 4, 5].map((n) => ({
  project: ROADMAP,
  epic: EPIC,
  question: `Question ${n}: what does the ${['manifest', 'wire', 'door', 'store', 'ticket', 'container'][n]} settle, and who reads it?`,
  options: [
    'Whatever the host happens to have decided that morning, which is not written down anywhere',
    'Which tab the module gets, and what it would like to be allowed to ask for',
    'Nothing at all — it is a comment with a file extension',
  ],
  answer: 1,
  why: 'The manifest is the smallest half of the program and the only half a host ever reads.',
  path: 'data/papers/modes-are-modules/chapters/bridge.tex',
  start: 1024 + n,
  end: 1180 + n,
  quote:
    'The manifest is the smallest half of this program and the only half a host ever reads, which is why it is the half that has to be true.',
  agent: 'the sizes probe',
}))

/** A host, near enough: an iframe of exactly the container's size, greeted. */
const HARNESS = (origin, width, height) => `
  <body style="margin:0;background:#888">
    <iframe id="frame" src="${origin}/app"
            style="width:${width}px;height:${height}px;border:0;display:block"></iframe>
  </body>`

async function main() {
  const browser = await chromium.launch({ executablePath: EXECUTABLE })
  const problems = []

  const ids = []
  for (const seed of SEED) {
    const said = await mcp('add_quiz', seed)
    const id = /Question ([0-9a-f]{8}) written/.exec(said.result?.content?.[0]?.text ?? '')?.[1]
    if (id) ids.push(id)
  }
  say(`seeded ${ids.length} questions under epic "${EPIC}"`)

  try {
    for (const { width, height } of SIZES) {
      const page = await browser.newPage({ viewport: { width: width + 80, height: height + 80 } })
      /* Navigate to the origin FIRST, then replace the document. `setContent`
         keeps the current URL, so the harness ends up on 127.0.0.1:7950 and its
         iframe is a same-origin subresource. From `about:blank` the iframe does
         not load at all, which is a ten-minute lesson worth one line here. */
      await page.goto(`${ORIGIN}/app`, { waitUntil: 'domcontentloaded' })
      await page.setContent(HARNESS(ORIGIN, width, height), { waitUntil: 'domcontentloaded' })
      const frame = await (await page.$('#frame')).contentFrame()
      await frame.waitForSelector('#root > *', { timeout: 15000 })
      await page.evaluate(
        ([context]) =>
          document.getElementById('frame').contentWindow.postMessage(
            { type: 'roadmap.hello', protocol: 2, session: 'sizes-probe', context, state: null },
            '*',
          ),
        [ctx()],
      )
      await frame.waitForSelector('[data-question]', { timeout: 15000 })

      /* Every size starts from an unanswered list, so the heights below compare.
         Through the page's own write door with the page's own ticket, which is
         the only way to reach one — see `dev/probe.mjs`. This is also what makes
         the whole file runnable twice. */
      await frame.evaluate(async (project) => {
        const ticket = JSON.parse(document.getElementById('ticket').textContent)
        await fetch('/api/retake', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-learning-ticket': ticket },
          body: JSON.stringify({ project, epic: 'sizes-probe' }),
        })
      }, ROADMAP)
      await frame.waitForSelector('[data-question][data-answered="no"]', { timeout: 15000 })
      await frame.waitForFunction(
        () => document.querySelectorAll('[data-question][data-answered="yes"]').length === 0,
        null,
        { timeout: 15000 },
      )

      /* Two frames, so the measured-frame state and its layout have settled. */
      await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

      const m = await frame.evaluate(() => {
        const scroller = document.scrollingElement
        const cards = [...document.querySelectorAll('[data-question]')]
        return {
          viewport: { w: scroller.clientWidth, h: scroller.clientHeight },
          scrollHeight: scroller.scrollHeight,
          overflowsX: scroller.scrollWidth > scroller.clientWidth,
          snapType: getComputedStyle(scroller).scrollSnapType,
          snapAlign: getComputedStyle(cards[0]).scrollSnapAlign,
          framed: !document.querySelector('h1'),
          cards: cards.length,
          /* Pixels spent before the first word of the first question. */
          chromeAbove: Math.round(cards[0].getBoundingClientRect().top),
          cardHeights: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
          /* Two of the three things `room()` folds. The third — the note under
             "Ask these again" — cannot be seen here, because that button only
             exists once something has been answered; it is measured below. */
          folded: {
            byline: !/written by/.test(document.body.innerText),
            passage: !!document.querySelector('[data-passage="button"]'),
          },
        }
      })
      /* Whether a whole question can be on screen at once. Where it cannot,
         there is no "fully visible" for snapping to bring anything to. */
      const fits = Math.max(...m.cardHeights) <= m.viewport.h

      say(`\n=== ${width}×${height} ===`)
      say(`  framed (no page heading): ${m.framed}`)
      say(
        `  scrollHeight ${m.scrollHeight} in ${m.viewport.h} of viewport → ${(m.scrollHeight / m.viewport.h).toFixed(1)} screens`,
      )
      say(`  chrome above the first question: ${m.chromeAbove}px (${Math.round((m.chromeAbove / m.viewport.h) * 100)}% of the box)`)
      say(`  card heights: ${m.cardHeights.join(', ')} — a whole card ${fits ? 'fits' : 'does NOT fit'} in the box`)
      say(`  snap-type ${m.snapType} · align ${m.snapAlign}`)
      say(`  folded: ${JSON.stringify(m.folded)}`)

      if (m.overflowsX) problems.push(`horizontal overflow at ${width}×${height}`)
      if (!m.framed) problems.push(`the page printed its own heading inside a frame at ${width}×${height}`)
      /* The chrome above the first question is the module's whole cost of entry.
         A third of a short box is already a lot; more than that and the reader
         is scrolling before they have read anything. */
      if (m.chromeAbove > m.viewport.h / 3) {
        problems.push(`${m.chromeAbove}px of chrome above the first question in a ${height}px box`)
      }

      /*
       * The owner's complaint, measured. Flick by a third of the box, let the
       * scroller settle, and ask how far the nearest card top ended up from the
       * top edge. Snapping should pull it to zero; without it the card sits
       * wherever the flick left it, half off the bottom.
       */
      const flick = Math.round(m.viewport.h / 3)
      const landed = await frame.evaluate(async (by) => {
        const scroller = document.scrollingElement
        scroller.scrollTo({ top: 0, behavior: 'instant' })
        await new Promise((r) => requestAnimationFrame(r))
        scroller.scrollBy({ top: by, behavior: 'instant' })
        /* Snap is resolved on the next scroll settle, which is a few frames. */
        await new Promise((r) => setTimeout(r, 300))
        return {
          scrollTop: Math.round(scroller.scrollTop),
          tops: [...document.querySelectorAll('[data-question]')].map((c) =>
            Math.round(c.getBoundingClientRect().top),
          ),
        }
      }, flick)
      const nearest = landed.tops.map((t) => Math.abs(t)).reduce((a, b) => Math.min(a, b), Infinity)
      say(`  flick of ${flick}px → scrollTop ${landed.scrollTop}, nearest card top ${nearest}px from the edge`)
      /*
       * Only asserted where a whole card fits. In a box 200 tall a 239-tall card
       * cannot be "fully visible" at any scroll position, so there is no
       * alignment that would help and `proximity` correctly leaves the reader
       * where they scrolled — dragging them to the top of a card they were
       * reading the bottom of would be the worse behaviour, and is exactly what
       * `mandatory` would have done.
       */
      if (fits && m.snapType.startsWith('y') && nearest > 8) {
        problems.push(`snapping is on at ${width}×${height} but a flick left a card ${nearest}px off the edge`)
      }

      /*
       * And the failure `mandatory` would have caused: the bottom of the LAST
       * card must be reachable. A scroller that must rest on a snap point cannot
       * hold the end of a card taller than itself.
       */
      const bottom = await frame.evaluate(async () => {
        const scroller = document.scrollingElement
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' })
        await new Promise((r) => setTimeout(r, 300))
        return {
          scrollTop: Math.round(scroller.scrollTop),
          max: Math.round(scroller.scrollHeight - scroller.clientHeight),
        }
      })
      say(`  scrolled to the end: ${bottom.scrollTop} of a possible ${bottom.max}`)
      if (bottom.max - bottom.scrollTop > 8) {
        problems.push(`the end of the list is unreachable at ${width}×${height}: rested at ${bottom.scrollTop}/${bottom.max}`)
      }

      /*
       * The overlay, where there is one: it must fill the frame and nothing
       * more — and it must still do that from a SCROLLED position.
       *
       * That second half is the assertion worth having. `index.css` makes the
       * body a CSS container, and `container-type` carries `contain: layout`,
       * which makes an element a containing block for its fixed-position
       * descendants. If that applied here, `fixed inset-0` would resolve against
       * the whole 1848-pixel document instead of the 300-pixel frame, and the
       * bug would be invisible at the top of the list and obvious nowhere else.
       * It does not apply — the body is the root scroller — but that is a fact
       * about this browser's layout, not one about this code, so it is measured.
       */
      if (m.folded.passage) {
        const panel = await frame.evaluate(async () => {
          const scroller = document.scrollingElement
          scroller.scrollTo({ top: 600, behavior: 'instant' })
          await new Promise((r) => setTimeout(r, 300))
          const at = Math.round(scroller.scrollTop)
          /* Pressed in the page rather than through Playwright, which scrolls an
             element into view before clicking it and would undo the scroll that
             is the point of this step. */
          const buttons = [...document.querySelectorAll('[data-passage="button"]')]
          const visible = buttons.find((b) => b.getBoundingClientRect().top >= 0) ?? buttons[0]
          visible.click()
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          const box = document.querySelector('[data-passage-panel="open"]').getBoundingClientRect()
          return {
            at,
            box: { w: Math.round(box.width), h: Math.round(box.height), t: Math.round(box.top), l: Math.round(box.left) },
            frame: { w: scroller.clientWidth, h: scroller.clientHeight },
          }
        })
        say(
          `  passage overlay (opened at scrollTop ${panel.at}): ${panel.box.w}×${panel.box.h}`
            + ` at (${panel.box.l},${panel.box.t}) in a ${panel.frame.w}×${panel.frame.h} frame`,
        )
        if (panel.box.w !== panel.frame.w || panel.box.h !== panel.frame.h || panel.box.t !== 0) {
          problems.push(`the passage overlay did not fill the frame at ${width}×${height}`)
        }
        await frame.click('text=Close')
      }

      /*
       * Answer one, which is the only way to see the other two folds: the
       * options that were neither chosen nor correct, and the note under "Ask
       * these again". The number that matters is how much shorter an ANSWERED
       * card is — an answered card gains a verdict and an explanation, so
       * without the fold it is the tallest thing in the list.
       */
      const before = m.cardHeights[0]
      await frame.click('[data-question] >> nth=0 >> button >> nth=0')
      await frame.waitForSelector('[data-question][data-answered="yes"]', { timeout: 15000 })
      await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const done = await frame.evaluate(() => {
        const card = document.querySelector('[data-question][data-answered="yes"]')
        return {
          height: Math.round(card.getBoundingClientRect().height),
          options: card.querySelectorAll('button[data-slot="button"]').length,
          unfold: card.querySelector('[data-unfold="options"]')?.textContent ?? null,
          retakeNote: /out of reach rather than merely out of sight/.test(document.body.innerText),
        }
      })
      say(
        `  answered: card ${before}px → ${done.height}px, ${done.options} options shown`
          + `${done.unfold ? ` + “${done.unfold}”` : ''}, retake note as prose: ${done.retakeNote}`,
      )
      if (done.unfold) {
        await frame.click('[data-unfold="options"]')
        const back = await frame.evaluate(
          () => document.querySelector('[data-question][data-answered="yes"]').querySelectorAll('button[data-slot="button"]').length,
        )
        say(`  after one press the folded options are back: ${back} options`)
        if (back !== 3) problems.push(`unfolding did not bring every option back at ${width}×${height}`)
      }
      await page.close()
    }
  } finally {
    for (const id of ids) await mcp('drop_quiz', { project: ROADMAP, id })
    say(`\ndropped ${ids.length} seeded questions`)
  }

  say('\n=== VERDICT ===')
  say(problems.length ? problems.map((p) => `  PROBLEM: ${p}`).join('\n') : '  everything above measured clean')
  await browser.close()
  process.exit(problems.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
