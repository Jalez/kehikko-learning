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
 * 2. **The question is legible while you choose — or it is one press away, and
 *    never half-drawn.** At least one option pressable without scrolling, and
 *    then, of the question: if it is on screen it is WHOLLY on screen and not
 *    clipped; if it is not on screen there is a `question` chip that leads to it.
 *
 *    That was one predicate and is now three, and the split is the owner's:
 *    "in Learning it's still showing the question partially when there's only
 *    space for the options." The old version was satisfied by a `line-clamp-2`
 *    header, because a clamped element measures exactly two lines and sits
 *    happily inside the viewport — the reader got a fragment of a sentence AND
 *    forty-six fewer pixels of options, and this probe called it clean. The
 *    clipping check is what a clamp cannot pass: an element whose content
 *    overflows its own box is measured, in the browser, at every size.
 *
 *    A multiple-choice question you cannot read is still not answerable, which
 *    is why the third clause is not "it may simply be missing" — it may be
 *    missing only where the switcher can reach it.
 * 3. **Answering works, from where the reader is standing.** The option is
 *    pressed IN THE PAGE rather than through Playwright, because Playwright
 *    scrolls an element into view before clicking it and would quietly undo the
 *    thing being measured.
 * 4. **The press that points the canvas is still on screen.** It is the one
 *    capability this module asks for; a split that put it behind a navigation
 *    would be the feature made unreachable by a layout.
 * 5. **The row of controls does not move.** The owner's words: "can we have the
 *    navigator component/button group stay put in a way that it doesn't go up
 *    and down in the component depending on how much space the
 *    question/options/passage/why takes." It is one number — the row's offset
 *    from the top of the document — and the whole feature is that it is the
 *    SAME number on every part, before and after an answer, at every size. The
 *    control whose entire job is to be pressed repeatedly is the one that must
 *    hold still, because a person aiming at `passage` who gets `why` was aiming
 *    at where the row was when they looked.
 *
 *    Measured rather than eyeballed, and measured with the document's own
 *    scroll added back, so that a row which is in the same place but reached by
 *    a different scroll is not counted as still.
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
  /*
   * The fourth shape, and it is here because of what the other three could not
   * catch: a SHORT question with long options.
   *
   * The three above are short-and-short, medium-and-medium, long-and-long, so at
   * every size the question that had to be split was also the question too long
   * to stand above its parts — and a probe seeded that way would pass a build in
   * which the header was never drawn at all. This one splits (six options of
   * three lines each do not fit in any box here) while its question is one line,
   * which is the case `headerOf()` exists to say yes to. The header is measured
   * for real, at every size, only because this question is in the list.
   */
  {
    question: 'What settles the wire?',
    options: [
      'Whatever the host happens to have decided that morning, which is not written down anywhere at all',
      'The manifest, which is the smallest half of the program and the only half a host ever reads first',
      'A conversation between two programs that have never been introduced and never will be introduced',
      'The person who opened the canvas, every time, by answering a dialog nobody wanted to be shown one',
      'Nothing whatsoever: it is a comment with a file extension and an unusually confident set of names',
      'Whichever module happened to load first, which is a race and is therefore a different answer daily',
    ],
    answer: 1,
    why: 'The wire is the manifest and the messages; the module says what it is and the host says where it stands.',
    quote: QUOTE,
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

/**
 * Whether one number stayed one number.
 *
 * Finding 5 is a single measurement — where the row of controls is — taken on
 * every part and, once a question has been answered, again on all four. This
 * says whether they are all the same number, and prints them either way,
 * because "it moved 46px between `options` and `passage`" is the sentence
 * somebody fixing it needs and "unstable" is not.
 *
 * One pixel of slack, for the sub-pixel line heights that put a row at 213.6
 * on one part and 214.4 on the next. Nothing a finger can aim at is inside a
 * pixel.
 */
function steady(at) {
  const named = Object.entries(at).filter(([, top]) => typeof top === 'number')
  if (!named.length) return null
  const tops = named.map(([, top]) => top)
  const drift = Math.max(...tops) - Math.min(...tops)
  return {
    still: drift <= 1,
    line:
      named.map(([name, top]) => `${name} ${top}px`).join(', ')
      + (drift <= 1 ? ' — it stays put' : ` — it moves by ${drift}px`),
  }
}

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
        /* The question, by the attribute that says it IS the question. It used
           to be `querySelector('p')` — the first paragraph on the card — which
           is a different element the moment the card stops always drawing the
           question first, and would have silently measured the byte range. */
        const text = shown?.querySelector('[data-question-text]')
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
          questionShown: text !== null && text !== undefined,
          questionInView: inside(rect(text)),
          questionHeight: Math.round(rect(text)?.height ?? 0),
          /* What a clamp looks like from outside: content taller than the box
             drawn for it. One pixel of slack for sub-pixel line heights. */
          questionClipped: !!text && text.scrollHeight > text.clientHeight + 1,
          chips: [...document.querySelectorAll('[data-part]')].map((b) => b.getAttribute('data-part')),
          optionsInView: options.filter((o) => inside(rect(o))).length,
          options: options.length,
          passageOnScreen: passage !== null && passage !== undefined,
          passageInView: inside(rect(passage)),
          /*
           * What the reader cannot see without moving, counted in BOTH
           * scrollers.
           *
           * The card body is its own scroller now — that is what pins the row
           * below it — so a document that no longer scrolls is not on its own
           * evidence that everything is on screen. Adding the body's hidden
           * height back is what keeps finding 1 meaning what it meant before
           * the row was pinned.
           */
          hidden: (() => {
            const body = document.querySelector('[data-body="pinned"]')
            return body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0
          })(),
          /* The one number finding 5 is about: where the row of controls sits,
             in the document rather than in the viewport, so a row reached by a
             different scroll is not mistaken for a row that stayed put. */
          controlsTop: (() => {
            const row = document.querySelector('[data-controls]')
            return row ? Math.round(row.getBoundingClientRect().top + scroller.scrollTop) : null
          })(),
        }
      })

      const overrun = Math.max(0, m.scrollHeight - m.box) + m.hidden
      say(`\n=== ${width}×${height} — ${note} ===`)
      say(`  rung ${m.rung}${m.part === '(none)' ? '' : ` · part ${m.part}`} · snap ${m.snapType}`)
      say(
        `  ${m.cards} card(s) drawn, heights ${m.heights.join(', ')} — ${m.wholeInView} whole in view`
          + ` of a ${m.box}px box`,
      )
      say(`  document is ${m.scrollHeight}px: ${overrun}px of scrolling (${Math.round((overrun / m.box) * 100)}% of the box)`)
      say(
        `  the question is ${m.questionShown ? (m.questionInView ? '' : 'NOT ') + 'wholly in view' : 'not drawn here'}`
          + ` (${m.questionHeight}px${m.questionClipped ? ', CLIPPED' : ''});`
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

      /* 2. Legible while you choose, or one press away — and never half-drawn. */
      if (m.questionClipped) {
        problems.push(
          `${width}×${height}: the question was drawn clipped — a fragment of a sentence, which is the one`
            + ' thing the header is not allowed to be',
        )
      }
      if (m.questionShown && !m.questionInView) {
        problems.push(`${width}×${height}: the question is not wholly on screen where the options are pressed`)
      }
      if (!m.questionShown && !m.chips.includes('question')) {
        problems.push(
          `${width}×${height}: the question is neither on screen nor reachable — no header was drawn and no`
            + ' chip leads to one',
        )
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
       * EVERY question, one page at a time.
       *
       * Everything above is measured on the first card, which is the short one —
       * two options and a one-line quote. The rest are only reachable by paging,
       * so the probe pages, and it stops at each of them rather than running to
       * the end.
       *
       * It used to press "next" until the control was disabled and measure only
       * the last question, on the argument that the longest one is the case a
       * single rung would get wrong. True, and not enough: the seeded questions
       * were short-and-short, medium-and-medium and long-and-long, so the
       * question that had to be SPLIT was always also the one too long to stand
       * above its parts. A build that never drew a header at all passed. The
       * fourth seed is a short question with long options and is the one that
       * gets a header; measuring every question is what makes sure it is seen.
       */
      const paged = await frame.$('[data-page="on"]')
      /* The first question's row, kept for the before-and-after comparison
         below: the answering step returns to question 1, so this is the same
         card measured on both sides of the press that creates a fourth chip. */
      let firstAt = {}
      for (let page = 0; paged && page < 12; page += 1) {
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
          const text = card.querySelector('[data-question-text]')
          return {
            rung: card.getAttribute('data-rung'),
            part:
              [...document.querySelectorAll('[data-part]')]
                .find((b) => b.getAttribute('aria-pressed') === 'true')
                ?.getAttribute('data-part') ?? '(none)',
            chips: [...document.querySelectorAll('[data-part]')].map((b) => b.getAttribute('data-part')),
            height: Math.round(card.getBoundingClientRect().height),
            questionShown: text !== null,
            questionInView: inside(text),
            questionClipped: !!text && text.scrollHeight > text.clientHeight + 1,
            drawn: text?.getAttribute('data-question-text') ?? 'not drawn',
            optionsInView: options.filter(inside).length,
            options: options.length,
            passageInView: inside(card.querySelector('[data-passage]')),
            scrollHeight: scroller.scrollHeight,
            hidden: (() => {
              const body = document.querySelector('[data-body="pinned"]')
              return body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0
            })(),
            box,
          }
        })
        const over = Math.max(0, last.scrollHeight - last.box) + last.hidden
        const which = `question ${page + 1}`
        say(
          `  ${which}: rung ${last.rung} · part ${last.part} · chips [${last.chips.join(' ')}]`
            + ` · question ${last.drawn}`,
        )
        say(
          `    card ${last.height}px, ${over}px of scrolling, question `
            + `${last.questionShown ? (last.questionInView ? 'in view' : 'NOT in view') : 'not drawn above the part'},`
            + ` ${last.optionsInView} of ${last.options} options pressable, source ${last.passageInView ? 'in view' : 'below the fold'}`,
        )
        if (last.questionClipped) {
          problems.push(
            `${width}×${height}: on ${which}, the header was drawn clipped — part of a sentence, which is the`
              + ' one thing it is not allowed to be',
          )
        }
        if (last.questionShown && !last.questionInView) {
          problems.push(`${width}×${height}: on ${which}, the text of it is not on screen with the options`)
        }
        if (!last.questionShown && !last.chips.includes('question')) {
          problems.push(
            `${width}×${height}: on ${which}, there is no header and no chip leading to one — the reader is`
              + ' choosing between phrases with nothing saying what they answer',
          )
        }
        if (last.optionsInView === 0) {
          problems.push(`${width}×${height}: on ${which}, no option could be pressed without scrolling`)
        }
        if (!last.passageInView && over > last.box / 3) {
          problems.push(`${width}×${height}: on ${which}, the source control is unreachable without a long scroll`)
        }

        /*
         * Every part, pressed, and the thing it names has to appear. A switcher
         * whose chips do not change the screen is a row of pixels spent on
         * nothing, and a `quote` chip that leaves the quote off screen is the
         * split done badly.
         */
        const rowAt = {}
        for (const chip of last.chips) {
          await frame.click(`[data-part="${chip}"]`)
          await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          const seen = await frame.evaluate(() => {
            const scroller = document.scrollingElement
            const card = document.querySelector('[data-question]')
            const text = card.querySelector('[data-question-text]')
            const row = document.querySelector('[data-controls]')
            const body = document.querySelector('[data-body="pinned"]')
            return {
              options: card.querySelectorAll('button[data-slot="button"]').length,
              quote: !!card.querySelector('blockquote'),
              drawn: text?.getAttribute('data-question-text') ?? 'not drawn',
              /* Asserted on every part, not only on the question's own: a header
                 above the options is the same sentence and is held to the same
                 rule, which is that it is never shown in halves. */
              clipped: !!text && text.scrollHeight > text.clientHeight + 1,
              scroll:
                scroller.scrollHeight - scroller.clientHeight
                + (body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0),
              /* Finding 5, one part at a time. */
              controlsTop: row ? Math.round(row.getBoundingClientRect().top + scroller.scrollTop) : null,
              /* How many lines the chips themselves are drawn on, by their
                 distinct tops. Four chips at 220 wide is the case the `why`
                 part introduced, and a row that gains a line is a row that
                 moved. */
              chipRows: new Set(
                [...document.querySelectorAll('[data-part]')].map((b) => Math.round(b.getBoundingClientRect().top)),
              ).size,
            }
          })
          rowAt[chip] = seen.controlsTop
          say(
            `    part “${chip}”: ${seen.options} options, quote ${seen.quote ? 'shown' : 'not shown'},`
              + ` question ${seen.drawn}${seen.clipped ? ' (CLIPPED)' : ''}, ${Math.max(0, seen.scroll)}px of scrolling,`
              + ` controls at ${seen.controlsTop}px on ${seen.chipRows} line(s) of chips`,
          )
          if (chip === 'options' && seen.options === 0) {
            problems.push(`${width}×${height}: the "options" part showed no options`)
          }
          if (chip === 'quote' && !seen.quote) {
            problems.push(`${width}×${height}: the "passage" part showed no passage`)
          }
          if (chip === 'question' && seen.drawn !== 'whole') {
            problems.push(`${width}×${height}: the "question" part did not show the question it exists to show`)
          }
          if (seen.clipped) {
            problems.push(`${width}×${height}: on ${which}'s "${chip}" part, the question was drawn clipped`)
          }
        }

        /*
         * Finding 5: the row is in the same place on every part.
         *
         * One number, asserted rather than described. `steady()` is used again
         * after the answer below, because `why` appearing is the moment the
         * row's own contents change.
         */
        if (page === 0) {
          firstAt = Object.fromEntries(Object.entries(rowAt).map(([chip, top]) => [`${chip} (unanswered)`, top]))
        }

        const said = steady(rowAt)
        if (said) {
          say(`    the row of controls: ${said.line}`)
          if (!said.still) {
            problems.push(
              `${width}×${height}: on ${which}, the row of controls moved between parts — ${said.line}.`
                + ' The one control a reader presses over and over is the one that will not hold still, so a press'
                + ' aimed at where it was lands on the chip beside the one they wanted',
            )
          }
        }

        /* On to the next question, or out of the loop at the last one. */
        const on = await frame.$('[data-page="on"]:not([disabled])')
        if (!on) break
        await on.click()
        await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      }

      /* Back to the first question, so the answering step below is measured on
         the same card at every size. */
      for (let step = 0; paged && step < 12; step += 1) {
        const back = await frame.$('[data-page="back"]:not([disabled])')
        if (!back) break
        await back.click()
        await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
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
            /* Which screen the reader is on AFTER the press. Nothing should have
               moved them: the verdict is drawn where they were standing. */
            part:
              [...document.querySelectorAll('[data-part]')]
                .find((b) => b.getAttribute('aria-pressed') === 'true')
                ?.getAttribute('data-part') ?? '(none)',
            chips: [...document.querySelectorAll('[data-part]')].map((b) => b.getAttribute('data-part')),
            /* The explanation must NOT be here: it has a part of its own, and a
               card that draws it beside the verdict is the shape the owner asked
               to be rid of. Whole cards have no parts and are exempt. */
            whyHere: !!document.querySelector('[data-why="shown"]'),
            scrollHeight: scroller.scrollHeight,
            box,
          }
        })
        say(
          `  answered where they stood: verdict “${after.verdict}”, ${after.verdictInView ? 'in view' : 'BELOW THE FOLD'}`
            + `, still on part ${after.part}, chips [${after.chips.join(' ')}]`
            + `, document now ${after.scrollHeight}px in a ${after.box}px box`,
        )
        if (!after.verdict) problems.push(`${width}×${height}: pressing an option produced no verdict`)
        if (!after.verdictInView) {
          problems.push(`${width}×${height}: the verdict for the press the reader just made is below the fold`)
        }
        /*
         * The owner's fourth part, measured rather than asserted from the inside.
         *
         * Three things have to be true of a card that has just been answered in a
         * box too small to hold it whole: the reader was not moved to another
         * screen, the explanation is not stuffed onto the screen they are on, and
         * there is a chip that leads to it. The first is what the press used to
         * get wrong — it jumped to the `question` part — and the second is what
         * the fourth part exists for.
         */
        if (after.part !== '(none)') {
          if (after.part !== 'options') {
            problems.push(
              `${width}×${height}: answering moved the reader from the options to the "${after.part}" part —`
                + ' the page changed under somebody who was still looking at what they chose',
            )
          }
          if (after.whyHere) {
            problems.push(
              `${width}×${height}: the explanation was drawn on the "${after.part}" part, beside the verdict,`
                + ' rather than on the part of its own it now has',
            )
          }
          if (!after.chips.includes('why')) {
            problems.push(
              `${width}×${height}: the answer carried an explanation and no chip leads to it — it is in the`
                + ' page and unreachable',
            )
          } else {
            await frame.click('[data-part="why"]')
            await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
            const why = await frame.evaluate(() => {
              const box = document.scrollingElement.clientHeight
              const card = document.querySelector('[data-question]')
              const said = card.querySelector('[data-why="shown"]')
              const r = said?.getBoundingClientRect()
              return {
                shown: !!said,
                inView: !!r && r.top >= -1 && r.bottom <= box + 1,
                /* Inside the CARD, not the document: the pager and the retake are
                   also `data-slot="button"` and are in the row below, so counting
                   the document would report three options on a screen that draws
                   none. */
                options: card.querySelectorAll('button[data-slot="button"]').length,
              }
            })
            say(
              `    the "why" part: explanation ${why.shown ? (why.inView ? 'in view' : 'shown but below the fold') : 'MISSING'}`
                + `, ${why.options} of the card's own options drawn beside it`,
            )
            if (!why.shown) {
              problems.push(`${width}×${height}: the "why" chip led to a screen with no explanation on it`)
            }
          }

          /*
           * Finding 5 again, across the press that changes what the row itself
           * holds.
           *
           * `why` does not exist until a question has been answered, so this is
           * the one moment the switcher's own contents change under a reader —
           * a fourth chip, and at 220 wide possibly a fourth line of them. The
           * row is measured on every part on both sides of that press and all
           * of them have to be the same number. Comparing only the answered
           * parts with each other would pass a build in which the whole row
           * dropped forty pixels the instant somebody answered.
           */
          const answeredAt = {}
          for (const chip of after.chips) {
            await frame.click(`[data-part="${chip}"]`)
            await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
            const now = await frame.evaluate(() => {
              const row = document.querySelector('[data-controls]')
              const chips = [...document.querySelectorAll('[data-part]')]
              return {
                top: row ? Math.round(row.getBoundingClientRect().top + document.scrollingElement.scrollTop) : null,
                /* The row's own height, and how many lines the chips take, on
                   the far side of the press that adds a fourth. Printed rather
                   than asserted: with the row drawn UNDER a body of a fixed
                   height, a fourth chip that wraps to a new line grows the row
                   downwards and cannot move its top — which is the point, and
                   is worth being able to see. */
                height: row ? Math.round(row.getBoundingClientRect().height) : null,
                chips: chips.length,
                lines: new Set(chips.map((b) => Math.round(b.getBoundingClientRect().top))).size,
              }
            })
            answeredAt[`${chip} (answered)`] = now.top
            say(
              `    with ${now.chips} chips: the row is ${now.height}px on ${now.lines} line(s) of chips,`
                + ` its top at ${now.top}px`,
            )
          }
          const both = steady({ ...firstAt, ...answeredAt })
          if (both) {
            say(`  the row of controls, either side of the answer: ${both.line}`)
            if (!both.still) {
              problems.push(
                `${width}×${height}: the row of controls moved — ${both.line}. It is the one control a reader`
                  + ' presses over and over, and it is the one that will not hold still',
              )
            }
          }
        }
      } else {
        say('  answered where they stood: NO OPTION WAS REACHABLE')
      }

      /*
       * Four chips, which is the widest the switcher is ever drawn.
       *
       * The step above answers question 1, and question 1 is short enough to
       * stand above its own parts at every size — so it earns a `why` chip and
       * still has only three, and a run that stopped there would never once
       * have measured the row at its full width. Four happens where a question
       * is too long for a header AND has been answered, which is a question
       * with a `question` chip, pressed.
       *
       * It matters at 220 wide, where three chips are already two lines: a
       * fourth that wraps to a third line makes the row taller. What is asserted
       * is not that it fits on one line — it does not, and demanding that would
       * mean abbreviating the words a reader navigates by — but that a row
       * growing DOWNWARDS from a fixed body cannot move its own top, which is
       * the whole reason the body is pinned rather than the row being anchored
       * to the bottom edge.
       */
      for (let step = 0; paged && step < 12; step += 1) {
        const has = await frame.evaluate(() =>
          [...document.querySelectorAll('[data-part]')].map((b) => b.getAttribute('data-part')),
        )
        if (has.includes('question')) break
        const on = await frame.$('[data-page="on"]:not([disabled])')
        if (!on) break
        await on.click()
        await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      }
      const four = await frame.evaluate(async () => {
        const chips = [...document.querySelectorAll('[data-part]')].map((b) => b.getAttribute('data-part'))
        if (!chips.includes('question')) return { reached: false }
        const card = document.querySelector('[data-question]')
        if (card.getAttribute('data-answered') === 'yes') return { reached: true, pressed: true }
        const box = document.scrollingElement.clientHeight
        const option = [...card.querySelectorAll('button[data-slot="button"]')].find((o) => {
          const r = o.getBoundingClientRect()
          return r.top >= -1 && r.bottom <= box + 1
        })
        if (!option) return { reached: true, pressed: false }
        option.click()
        return { reached: true, pressed: true }
      })
      if (four.reached && four.pressed) {
        await frame.waitForSelector('[data-question][data-answered="yes"]', { timeout: 15000 })
        await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const wideAt = {}
        const chips = await frame.evaluate(() =>
          [...document.querySelectorAll('[data-part]')].map((b) => b.getAttribute('data-part')),
        )
        for (const chip of chips) {
          await frame.click(`[data-part="${chip}"]`)
          await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          const now = await frame.evaluate(() => {
            const row = document.querySelector('[data-controls]')
            const all = [...document.querySelectorAll('[data-part]')]
            return {
              top: row ? Math.round(row.getBoundingClientRect().top + document.scrollingElement.scrollTop) : null,
              height: row ? Math.round(row.getBoundingClientRect().height) : null,
              lines: new Set(all.map((b) => Math.round(b.getBoundingClientRect().top))).size,
              bottom: row ? Math.round(row.getBoundingClientRect().bottom) : null,
              box: document.scrollingElement.clientHeight,
            }
          })
          wideAt[chip] = now.top
          say(
            `  the switcher at its widest, part “${chip}”: ${chips.length} chips on ${now.lines} line(s),`
              + ` row ${now.height}px, top at ${now.top}px, bottom ${now.bottom} of a ${now.box}px box`,
          )
        }
        const wide = steady(wideAt)
        if (wide && !wide.still) {
          problems.push(
            `${width}×${height}: with all four chips drawn the row moved — ${wide.line}. The fourth chip is the`
              + ' one that arrives while somebody is reading, so it is the one that must not move the other three',
          )
        }
      } else {
        say(`  the switcher at its widest: never reached here (${four.reached ? 'no option to press' : 'no question chip'})`)
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
