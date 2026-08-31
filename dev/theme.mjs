/**
 * The host's light/dark switch, in a real frame, in both directions.
 *
 *   ./run.sh &                       # 7950
 *   node dev/theme.mjs               # exits non-zero on any finding
 *
 * ## What it establishes
 *
 * That this module follows the theme a person picked IN THE HOST, and keeps
 * following it when they change their mind — not only on the first greeting.
 * It is run with the machine set to dark AND with it set to light, because the
 * failure worth catching is the one where the module quietly agrees with the
 * operating system and looks correct on whichever machine it was written on.
 *
 * Four things are checked at each of those two machine settings:
 *
 *   - before any greeting, the OS setting is the fallback and nothing else is;
 *   - a hello saying "dark" makes it dark, on a light machine;
 *   - a LATER context saying "light" makes it light, on a dark machine —
 *     this is the one the owner reported, and it is the case a load-time-only
 *     implementation fails;
 *   - and back again, because sticky-after-one-change is its own bug.
 *
 * `color-scheme` is asserted alongside the colours. It is what the browser's own
 * scrollbar follows, it defaults to the machine rather than the host, and a dark
 * gutter down the side of a white 220-pixel container is exactly what "it does not
 * have light mode" looks like.
 *
 * ## The one thing that will waste an hour
 *
 * `roadmap.hello` WRAPS the context in a `context` field. `roadmap.context` is
 * FLAT — the same fields one level up. See `contextMessageSchema` in the
 * protocol's `wire.ts`. Send a context message in the hello's shape and every
 * field takes its schema default, `theme` defaults to `'light'`, and the module
 * turns light and then refuses to turn back — which reads exactly like the bug
 * this file exists to rule out, in a module that does not have it.
 *
 * NEVER `waitUntil: 'networkidle'`: the page polls every three seconds.
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT ?? '/Users/jaakkorajala/.claude/jobs/85f6bc23/tmp/node_modules/playwright/index.mjs'
)

const EXECUTABLE =
  process.env.CHROME
  ?? '/Users/jaakkorajala/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'

const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:7950'
const ROADMAP = process.env.ROADMAP ?? '/Users/jaakkorajala/Projects/roadmap'

/* The two backgrounds, out of `src/index.css`. Asserted as strings rather than
   as "not the other one", so that a palette change fails here loudly instead of
   passing on a page that is neither. */
const LIGHT_BG = 'oklch(1 0 0)'
const DARK_BG = 'oklch(0.145 0 0)'

const ctx = (theme) => ({
  epic: 'modes-are-modules',
  project: 'roadmap',
  projectPath: ROADMAP,
  theme,
  selection: [],
  kehikko: { id: 1, name: 'A canvas' },
  prompt: null,
  pinned: false,
})

const say = (...args) => console.log(...args)

async function main() {
  const browser = await chromium.launch({ executablePath: EXECUTABLE })
  const problems = []

  for (const machine of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 420, height: 520 }, colorScheme: machine })
    /* Navigate to the origin first so `setContent` leaves the harness on it and
       the iframe is a same-origin subresource. From `about:blank` it does not
       load at all. */
    await page.goto(`${ORIGIN}/app`, { waitUntil: 'domcontentloaded' })
    await page.setContent(
      `<body style="margin:0"><iframe id="f" src="${ORIGIN}/app" style="width:320px;height:400px;border:0"></iframe></body>`,
      { waitUntil: 'domcontentloaded' },
    )
    const frame = await (await page.$('#f')).contentFrame()
    await frame.waitForSelector('#root > *', { timeout: 15000 })

    const send = async (type, theme) =>
      page.evaluate(
        ([type_, context]) =>
          document.getElementById('f').contentWindow.postMessage(
            type_ === 'roadmap.hello'
              ? { type: type_, protocol: 2, session: 'theme-probe', context, state: null }
              : { type: type_, protocol: 2, ...context },
            '*',
          ),
        [type, ctx(theme)],
      )

    const look = async () => {
      await new Promise((r) => setTimeout(r, 250))
      return frame.evaluate(() => ({
        classes: document.documentElement.className,
        bg: getComputedStyle(document.body).backgroundColor,
        scheme: getComputedStyle(document.documentElement).colorScheme,
      }))
    }

    const check = (what, seen, wantBg, wantScheme) => {
      say(`  ${what.padEnd(22)} classes=${JSON.stringify(seen.classes)} bg=${seen.bg} color-scheme=${seen.scheme}`)
      if (seen.bg !== wantBg) problems.push(`${machine} machine, ${what}: background ${seen.bg}, wanted ${wantBg}`)
      if (wantScheme && seen.scheme !== wantScheme) {
        problems.push(`${machine} machine, ${what}: color-scheme ${seen.scheme}, wanted ${wantScheme}`)
      }
    }

    say(`\n=== machine set to ${machine} ===`)
    /* Before anybody has spoken the OS is the only thing to go on, and it is
       the ONLY place it is consulted. */
    check('before any greeting', await look(), machine === 'dark' ? DARK_BG : LIGHT_BG, null)
    await send('roadmap.hello', 'dark')
    check('hello says dark', await look(), DARK_BG, 'dark')
    await send('roadmap.context', 'light')
    check('then context: light', await look(), LIGHT_BG, 'light')
    await send('roadmap.context', 'dark')
    check('and back to dark', await look(), DARK_BG, 'dark')

    await page.close()
  }

  say('\n=== VERDICT ===')
  say(problems.length ? problems.map((p) => `  PROBLEM: ${p}`).join('\n') : '  the host’s theme wins at every step')
  await browser.close()
  process.exit(problems.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
