/**
 * The ladder, measured: does the reader ever have to scroll to read one
 * question, and can they answer it where they are standing?
 *
 *   ./run.sh &                       # 7950
 *   node dev/ladder.mjs              # exits non-zero on any finding
 *
 * `dev/probe.mjs` asks whether the answer key is out of the DOM. `dev/sizes.mjs`
 * asks what one card costs at four container sizes. This one asks the owner's
 * question, which is neither: **in the box this module was actually given, how
 * much of one question can a person see, and can they answer it without moving
 * the page?**
 *
 * ## Every assertion here is about the layout, not about this build
 *
 * Deliberately, and it is the point of the file. Nothing below reads
 * `data-rung`, `data-part` or any other attribute this pass introduced in order
 * to decide whether the module is behaving — those are printed, because they are
 * useful when it is not, but the findings are stated in terms a reader would
 * recognise:
 *
 * 1. **Either nothing much scrolls, or two whole questions are in view.** The
 *    rule underneath the ladder, stated as a predicate: do not squeeze many
 *    things in partially when one thing shown completely is more useful. "Not
 *    much" is a third of the box, because a card that runs a few pixels past the
 *    bottom edge is a different experience from one you must scroll three
 *    screens through.
 * 2. **The question is legible while you choose.** Its text fully within the
 *    viewport at rest, and at least one option pressable without scrolling. A
 *    multiple-choice question you cannot read is not answerable, and a layout
 *    that pages the options away from their question would pass every height
 *    check and fail every reader.
 * 3. **Answering works, from where the reader is standing.** The option is
 *    pressed IN THE PAGE rather than through Playwright, because Playwright
 *    scrolls an element into view before clicking it and would quietly undo the
 *    thing being measured.
 * 4. **The press that points the canvas is still on screen.** It is the one
 *    capability this module asks for; a split that put it behind a navigation
 *    would be the feature made unreachable by a layout.
 *
 * That is why it fails on the build BEFORE the ladder as well as passing on the
 * one after. Run it against `git stash` if you doubt it: at 220×300 the list is
 * 1225 pixels tall in a 300-pixel box with no whole card anywhere in it.
 *
 * ## And one assertion that IS about this build
 *
 * `data-estimate`, when the card carries one. `ladder()` decides everything off
 * a height it computed before the card existed, and the only honest defence of
 * such a number is to put it in the DOM and measure the card beside it. Under is
 * a finding — the page promised something fits and it did not. Over is printed,
 * because over is the conservative direction and being told how far over is how
 * the constants stay true.
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
const ROADMAP = process.env.ROADMAP ?? '/Users/jaakkorajala/Projects/roadmap'
/* Its own epic, so this never touches what the other two probes assert on. */
const EPIC = 'ladder-probe'

/*
 * The five the owner named, and they are five rather than four on purpose.
 * 260×420 is the one that separates the rungs from each other: tall enough that
 * a SHORT question fits whole and a long one does not, which is the case a
 * single rung for the whole list would get wrong.
 */
const SIZES = [
  { width: 220, height: 300, note: 'the narrow column this module is designed for' },
  { width: 320, height: 200, note: 'a wide letterbox — comfortable width, no height at all' },
  { width: 260, height: 420, note: 'narrow but tall: some questions fit whole, some do not' },
  { width: 460, height: 360, note: 'a comfortable container — a card and a half, which is the shape to stop drawing' },
  { width: 900, height: 700, note: 'half a monitor: several whole cards, so a list' },
]

/*
 * Questions of the three lengths an agent actually writes. A two-line question
 * with two options and a five-line question with eight are not the same problem
 * in the same box, and a probe that only seeded one shape would prove nothing
 * about the other.
 */
const QUOTE =
  'The manifest is the smallest half of this program and the only half a host ever reads, which is why it '
  + 'is the half that has to be true, and why it is the half that is checked.'

const SEED = [
  {
    question: 'What does the wire settle?',
    options: ['The host', 'The module'],
    answer: 1,
    why: 'The module says what it is; the host says where it stands.',
    quote: 'A wire is two programs agreeing on one sentence.',
  },
  {
    question: 'Question 1: what does the manifest settle, and who reads it?',
    options: [
      'Whatever the host happens to have decided that morning, which is not written down anywhere',
      'Which tab the module gets, and what it would like to be allowed to ask for',
      'Nothing at all — it is a comment with a file extension',
    ],
    answer: 1,
    why: 'The manifest is the smallest half of the program and the only half a host ever reads.',
    quote: QUOTE,
  },
  {
    question:
      'Question 2: when a host frames a module and the module declares a capability the host has never heard '
      + 'of, what is the host obliged to do about it, and what does the module do when the host says nothing '
      + 'at all in reply?',
    options: [
      'Refuse the frame entirely, because an unknown capability is an unknown program',
      'Answer no, in words, so the module can draw a screen that is not an error',
      'Say nothing, and let the module’s own backstop answer after half a second',
      'Forward the declaration to whichever other module claims to understand it',
      'Log it somewhere nobody reads and carry on as if it had not been said',
      'Ask the person who opened the canvas whether they meant to allow it',
      'Treat it as granted, on the grounds that a module would not ask idly',
      'Nothing at all — it is a comment with a file extension',
    ],
    answer: 1,
    why:
      'A host that says nothing leaves the module to guess, and a guess about permission is the one guess '
      + 'that cannot be made safely, which is why the protocol requires an answer in words.',
    quote: `${QUOTE} ${QUOTE}`,
  },
].map((seed, n) => ({
  project: ROADMAP,
  epic: EPIC,
  ...seed,
  path: 'data/papers/modes-are-modules/chapters/bridge.tex',
  start: 1024 + n,
  end: 1180 + n,
  agent: 'the ladder probe',
}))

const say = (...args) => console.log(...args)

const mcp = (name, args) =>
  fetch(`${ORIGIN}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }).then((r) => r.json())

/** A host, near enough: an iframe of exactly the container's size, greeted. */
const HARNESS = (origin, width, height) => `
  <body style="margin:0;background:#888">
    <iframe id="frame" src="${origin}/app"
            style="width:${width}px;height:${height}px;border:0;display:block"></iframe>
  </body>`

const ctx = {
  epic: EPIC,
  project: 'roadmap',
  projectPath: ROADMAP,
  theme: 'light',
  selection: [],
  kehikko: { id: 1, name: 'A canvas' },
  prompt: null,
  pinned: false,
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXECUTABLE })
  const problems = []

  const ids = []
  for (const seed of SEED) {
    const said = await mcp('add_quiz', seed)
    const id = /Question ([0-9a-f]{8}) written/.exec(said.result?.content?.[0]?.text ?? '')?.[1]
    if (id) ids.push(id)
  }
  say(`seeded ${ids.length} questions under epic "${EPIC}" — one short, one ordinary, one long`)

  try {
    for (const { width, height, note } of SIZES) {
      const page = await browser.newPage({ viewport: { width: width + 80, height: height + 80 } })
      /* Navigate to the origin FIRST, then replace the document. `setContent`
         keeps the current URL, so the harness ends up on the module's own origin
         and its iframe is a same-origin subresource. From `about:blank` the
         iframe does not load at all. */
      await page.goto(`${ORIGIN}/app`, { waitUntil: 'domcontentloaded' })
      await page.setContent(HARNESS(ORIGIN, width, height), { waitUntil: 'domcontentloaded' })
      const frame = await (await page.$('#frame')).contentFrame()
      await frame.waitForSelector('#root > *', { timeout: 15000 })
      await page.evaluate(
        ([context]) =>
          document.getElementById('frame').contentWindow.postMessage(
            { type: 'roadmap.hello', protocol: 2, session: 'ladder-probe', context, state: null },
            '*',
          ),
        [ctx],
      )
      await frame.waitForSelector('[data-question]', { timeout: 15000 })

      /* Every size starts from an unanswered list, through the page's own write
         door with the page's own ticket — the only way to reach one. This is
         also what makes the whole file runnable twice. */
      await frame.evaluate(async ([project, epic]) => {
        const ticket = JSON.parse(document.getElementById('ticket').textContent)
        await fetch('/api/retake', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-learning-ticket': ticket },
          body: JSON.stringify({ project, epic }),
        })
      }, [ROADMAP, EPIC])
      await frame.waitForFunction(
        () => document.querySelectorAll('[data-question][data-answered="yes"]').length === 0,
        null,
        { timeout: 15000 },
      )
      await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

      const m = await frame.evaluate(() => {
        const scroller = document.scrollingElement
        scroller.scrollTo({ top: 0, behavior: 'instant' })
        const box = scroller.clientHeight
        const cards = [...document.querySelectorAll('[data-question]')]
        const shown = cards[0]
        const rect = (el) => (el ? el.getBoundingClientRect() : null)
        const inside = (r) => r !== null && r.top >= -1 && r.bottom <= box + 1
        const text = shown?.querySelector('p')
        const options = [...(shown?.querySelectorAll('button[data-slot="button"]') ?? [])]
        const passage = shown?.querySelector('[data-passage]')
        return {
          box,
          width: scroller.clientWidth,
          scrollHeight: scroller.scrollHeight,
          overflowsX: scroller.scrollWidth > scroller.clientWidth,
          snapType: getComputedStyle(scroller).scrollSnapType,
          /* Printed, never asserted on. See the essay at the top. */
          rung: document.querySelector('[data-rung]')?.getAttribute('data-rung') ?? '(none)',
          part:
            [...document.querySelectorAll('[data-part]')]
              .find((b) => b.getAttribute('aria-pressed') === 'true')
              ?.getAttribute('data-part') ?? '(none)',
          cards: cards.length,
          wholeInView: cards.filter((c) => inside(rect(c))).length,
          heights: cards.map((c) => Math.round(rect(c).height)),
          estimates: cards.map((c) => Number(c.getAttribute('data-estimate') ?? 0)),
          questionInView: inside(rect(text)),
          questionHeight: Math.round(rect(text)?.height ?? 0),
          optionsInView: options.filter((o) => inside(rect(o))).length,
          options: options.length,
          passageOnScreen: passage !== null && passage !== undefined,
          passageInView: inside(rect(passage)),
        }
      })

      const overrun = Math.max(0, m.scrollHeight - m.box)
      say(`\n=== ${width}×${height} — ${note} ===`)
      say(`  rung ${m.rung}${m.part === '(none)' ? '' : ` · part ${m.part}`} · snap ${m.snapType}`)
      say(
        `  ${m.cards} card(s) drawn, heights ${m.heights.join(', ')} — ${m.wholeInView} whole in view`
          + ` of a ${m.box}px box`,
      )
      say(`  document is ${m.scrollHeight}px: ${overrun}px of scrolling (${Math.round((overrun / m.box) * 100)}% of the box)`)
      say(
        `  the question is ${m.questionInView ? '' : 'NOT '}wholly in view (${m.questionHeight}px);`
          + ` ${m.optionsInView} of ${m.options} options pressable where the reader is standing;`
          + ` the source control is ${m.passageOnScreen ? (m.passageInView ? 'in view' : 'on the card but below the fold') : 'ABSENT'}`,
      )
      if (m.estimates.some((e) => e > 0)) {
        say(
          `  estimate vs measured: ${m.estimates.map((e, i) => `${e}→${m.heights[i]}`).join(', ')}`
            + ` (${m.estimates.map((e, i) => (e ? `${e - m.heights[i] >= 0 ? '+' : ''}${e - m.heights[i]}` : 'n/a')).join(', ')})`,
        )
      }

      if (m.overflowsX) problems.push(`horizontal overflow at ${width}×${height}`)

      /* 1. Either nothing much scrolls, or two whole questions are in view. */
      if (overrun > m.box / 3 && m.wholeInView < 2) {
        problems.push(
          `${width}×${height}: ${overrun}px of scrolling (${Math.round((overrun / m.box) * 100)}% of the box)`
            + ` with only ${m.wholeInView} whole question in view — many things shown partially, none shown whole`,
        )
      }

      /* 2. The question is legible while you choose. */
      if (!m.questionInView) {
        problems.push(`${width}×${height}: the question is not wholly on screen where the options are pressed`)
      }
      if (m.optionsInView === 0) {
        problems.push(`${width}×${height}: no option could be pressed without scrolling`)
      }

      /* 4. The one capability this module asks for is still reachable. */
      if (!m.passageOnScreen) {
        problems.push(`${width}×${height}: the card the reader is looking at has no source control to press`)
      }

      /* The estimate, in the direction that matters. */
      for (let i = 0; i < m.estimates.length; i += 1) {
        if (m.estimates[i] > 0 && m.heights[i] > m.estimates[i] + 2) {
          problems.push(
            `${width}×${height}: card ${i} was estimated at ${m.estimates[i]}px and measured ${m.heights[i]}px —`
              + ` the estimate came in UNDER, which is the direction that promises a fit and does not deliver one`,
          )
        }
      }

      /*
       * The LONG question, which is the one the ladder exists for.
       *
       * Everything above is measured on the first card, and the first card is
       * the short one — two options and a one-line quote. A five-line question
       * with eight options in a 300-pixel box is the case a single rung for the
       * whole list would get wrong, and it is only reachable by paging, so the
       * probe pages: press "next" until it is disabled, which is the last
       * question, and ask the same four things again.
       */
      const paged = await frame.$('[data-page="on"]')
      if (paged) {
        for (let step = 0; step < 10; step += 1) {
          const on = await frame.$('[data-page="on"]:not([disabled])')
          if (!on) break
          await on.click()
          await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        }
        const last = await frame.evaluate(() => {
          const scroller = document.scrollingElement
          scroller.scrollTo({ top: 0, behavior: 'instant' })
          const box = scroller.clientHeight
          const card = document.querySelector('[data-question]')
          const inside = (el) => {
            const r = el?.getBoundingClientRect()
            return !!r && r.top >= -1 && r.bottom <= box + 1
          }
          const options = [...card.querySelectorAll('button[data-slot="button"]')]
          return {
            rung: card.getAttribute('data-rung'),
            part:
              [...document.querySelectorAll('[data-part]')]
                .find((b) => b.getAttribute('aria-pressed') === 'true')
                ?.getAttribute('data-part') ?? '(none)',
            chips: [...document.querySelectorAll('[data-part]')].map((b) => b.getAttribute('data-part')),
            height: Math.round(card.getBoundingClientRect().height),
            questionInView: inside(card.querySelector('p')),
            clamped: card.querySelector('[data-question-text]')?.getAttribute('data-question-text'),
            optionsInView: options.filter(inside).length,
            options: options.length,
            passageInView: inside(card.querySelector('[data-passage]')),
            scrollHeight: scroller.scrollHeight,
            box,
          }
        })
        const over = Math.max(0, last.scrollHeight - last.box)
        say(
          `  the long question, paged to: rung ${last.rung} · part ${last.part} · chips [${last.chips.join(' ')}]`
            + ` · question ${last.clamped}`,
        )
        say(
          `    card ${last.height}px, ${over}px of scrolling, question ${last.questionInView ? 'in view' : 'NOT in view'},`
            + ` ${last.optionsInView} of ${last.options} options pressable, source ${last.passageInView ? 'in view' : 'below the fold'}`,
        )
        if (!last.questionInView) {
          problems.push(`${width}×${height}: on the long question, the text of it is not on screen with the options`)
        }
        if (last.optionsInView === 0) {
          problems.push(`${width}×${height}: on the long question, no option could be pressed without scrolling`)
        }
        if (!last.passageInView && over > last.box / 3) {
          problems.push(`${width}×${height}: on the long question, the source control is unreachable without a long scroll`)
        }

        /*
         * Every part, pressed, and the thing it names has to appear. A switcher
         * whose chips do not change the screen is a row of pixels spent on
         * nothing, and a `quote` chip that leaves the quote off screen is the
         * split done badly.
         */
        for (const chip of last.chips) {
          await frame.click(`[data-part="${chip}"]`)
          await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          const seen = await frame.evaluate(() => {
            const card = document.querySelector('[data-question]')
            return {
              options: card.querySelectorAll('button[data-slot="button"]').length,
              quote: !!card.querySelector('blockquote'),
              whole: card.querySelector('[data-question-text]')?.getAttribute('data-question-text') === 'whole',
              scroll: document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight,
            }
          })
          say(
            `    part “${chip}”: ${seen.options} options, quote ${seen.quote ? 'shown' : 'not shown'},`
              + ` question ${seen.whole ? 'whole' : 'clamped'}, ${Math.max(0, seen.scroll)}px of scrolling`,
          )
          if (chip === 'options' && seen.options === 0) {
            problems.push(`${width}×${height}: the "options" part showed no options`)
          }
          if (chip === 'quote' && !seen.quote) {
            problems.push(`${width}×${height}: the "passage" part showed no passage`)
          }
          if (chip === 'question' && !seen.whole) {
            problems.push(`${width}×${height}: the "question" part still clamped the question it exists to show`)
          }
        }
        /* Back to the first question, so the answering step below is measured on
           the same card at every size. */
        for (let step = 0; step < 10; step += 1) {
          const back = await frame.$('[data-page="back"]:not([disabled])')
          if (!back) break
          await back.click()
          await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        }
      }

      /*
       * 3. Answering, from where the reader is standing.
       *
       * Pressed in the page rather than through Playwright, which scrolls an
       * element into view before clicking it — that would undo the exact thing
       * this file measures. The option chosen is the first one visible without
       * moving, which is also the only one a reader could have pressed.
       */
      const answered = await frame.evaluate(async () => {
        const box = document.scrollingElement.clientHeight
        const card = document.querySelector('[data-question]')
        const option = [...card.querySelectorAll('button[data-slot="button"]')].find((o) => {
          const r = o.getBoundingClientRect()
          return r.top >= -1 && r.bottom <= box + 1
        })
        if (!option) return { pressed: false }
        option.click()
        return { pressed: true }
      })
      if (answered.pressed) {
        await frame.waitForSelector('[data-question][data-answered="yes"]', { timeout: 15000 })
        await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const after = await frame.evaluate(() => {
          const scroller = document.scrollingElement
          const box = scroller.clientHeight
          const badge = document.querySelector('[data-slot="badge"]')
          const r = badge?.getBoundingClientRect()
          return {
            verdict: badge?.textContent ?? null,
            verdictInView: !!r && r.top >= -1 && r.bottom <= box + 1,
            scrollHeight: scroller.scrollHeight,
            box,
          }
        })
        say(
          `  answered where they stood: verdict “${after.verdict}”, ${after.verdictInView ? 'in view' : 'BELOW THE FOLD'}`
            + `, document now ${after.scrollHeight}px in a ${after.box}px box`,
        )
        if (!after.verdict) problems.push(`${width}×${height}: pressing an option produced no verdict`)
        if (!after.verdictInView) {
          problems.push(`${width}×${height}: the verdict for the press the reader just made is below the fold`)
        }
      } else {
        say('  answered where they stood: NO OPTION WAS REACHABLE')
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
