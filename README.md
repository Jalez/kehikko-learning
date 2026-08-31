# Learning

A place to be asked questions about what you are reading, and to answer them.

An app first. It holds every question anybody has written about a passage of a
paper, and every answer anybody has given, in its own store beside the program.
It has its own page, its own port and its own MCP door. A host may frame it, and
then it learns which project it is standing in and which paper is open.

```bash
./run.sh                 # http://127.0.0.1:7950/app
PORT=7951 ./run.sh       # somewhere else
bun run register         # tell a host on this machine where it is
bun test && bun run typecheck
```

## The model, which is three sentences long

A **question is anchored to a passage** — a document, a byte range inside it, and
the exact source those bytes held. It is **multiple choice**: the options in the
order they are shown, which one is right, and the explanation its author wrote.
**Answering is recorded**, per question, so the container can say what you got right
and what you did not, and so the same question can be asked again later.

A question belongs to **one epic** — the one whose paper it was written about —
and to **one project**. Both of those are keys the store is read by rather than
labels on a screen.

## The one design constraint: where the answer lives

**The correct option is not in this page until you have chosen.** It lives on the
server, on disk, and it crosses the wire exactly once per question: in the reply
to the request that submits an answer.

That is not the obvious build. A quiz container could perfectly well be handed the
whole question — options, key and all — and simply not draw the key until you
press something. Every browser quiz on the internet works that way. It is also
worthless here, for two reasons, and the second is the one that decided it:

1. **Anybody can open the inspector.** `document.querySelector`, or a glance at
   the network tab, and the key is there. This is the reason usually cited and
   it is the weaker one — a person cheating at their own self-check has only
   cheated themselves.
2. **An agent reading the page would see it.** That is not somebody choosing to
   cheat; it is the ordinary operation of the thing that wrote the question and
   is now standing next to the reader. Agents in this workspace read the DOM of a
   canvas with a headless browser routinely. Such an agent would hold the answer
   key to every question on screen, and would use it while being helpful. The
   reader would be told the right answer by an assistant and would learn nothing,
   and neither of them would have done anything wrong.

So the mechanism is a **projection, not a filter**:

| | holds the key? | who can get one |
|---|---|---|
| `Question` (`quiz/types.ts`) | yes | nothing outside the server process |
| `Asked` (`quiz/types.ts`) | only once there is an attempt | what `/api/questions` sends |
| `score()` (`quiz/questions.ts`) | returns it | the reply to `POST /api/answer` |

`asked()` is the only function that makes an `Asked`, and it is nine lines. There
is no version of the page, however carelessly edited, that could leak a key it
was never given — the bytes are not in the browser. Grading happens server-side,
so the round trip on a press is not a formality that could be short-circuited
for responsiveness: it is where the answer comes from.

Once you have answered, the key and the explanation are yours and are shown. A
container that still hid them would be coy rather than careful. `Ask these again`
(`POST /api/retake`) clears the attempts, which puts the key back out of reach in
the store and therefore on the wire — genuinely out of reach, not merely out of
sight.

The MCP door applies the same rule for the same reason. `quizzes` prints
`answer: withheld` for a question nobody has answered; `reveal: true` prints it,
for an author checking their own work, and says in its description when not to
ask. A question that HAS been answered always prints its key, since the reader
has already seen it.

**Measured, in a real browser** — `dev/probe.mjs`, against a running `./run.sh`:
zero elements carrying `data-correct` before a press, the string `correct`
absent from every question card, the explanations absent, `/api/questions`
sending `answer: null, why: null`, and the three option buttons carrying one
distinct class string between them — so there is no styling channel either.

## What it does with nothing else running

- **The questions for whatever paper is open**, each with its options, its
  passage behind a disclosure, and who wrote it.
- **Answering, and the record.** One press, a verdict, the key, the explanation.
  Answers survive a reload because they are on disk and not in the page.
- **A store inside the project.** `<project>/.kehikot/learning/questions.json` — plain
  JSON, beside the work, readable by anybody who has the repository open.
- **Two screens that are not errors.** A canvas standing on no epic, and a host
  that gave no project path. See below.

## The path is the partition

The host sends `projectPath` in the context (protocol 0.8), and the questions
are kept **inside that folder**, at `<project>/.kehikot/learning/questions.json`. The
user asked for exactly that:

> "Each of the modules should hold their data inside the project itself, mostly
> as text files inside a kehikko-folder (or json) … That way everything is
> transparent etc and easily usable by others in the project."

The folder name, the join and the `.gitignore` text are
`roadmap-module-protocol`'s (0.10), not this module's, because four modules
answering "where does my data live" separately is four answers and the
disagreement has no symptom: every module starts, every module saves, and a
person finds half their work in one folder and half in another.

**This replaced a partition rather than adding to one.** `questions.json` used
to sit beside this program with a `projects` record at the top of it, keyed by
path. The failure that prevented is real and not hypothetical — slugs are short,
lower-case and hand-picked, and `bridge`, `wire` and `agents` are all real epic
slugs in one project here and all words a second project would plausibly use.
Two projects are now two files in two folders, so there is no shape left in
which they could collide, which is strictly stronger than a record key.

`.kehikot/` is added to the project's `.gitignore` once, when the folder is
first created, with a comment saying what it is and that removing the rule is
how you share it. A project that is not a git repository gets nothing.

- **The page** is told. `projectPath` is nullable — a host with no filesystem of
  its own knows the project's name and has no folder to point at — and the page
  **does not guess**. Guessing is not a display mistake here: it would write
  somebody's questions into a folder they will never open, under a container that
  said they were saved.
- **An agent** says which, in `project`, and is refused without it. Every
  available default is wrong: `process.cwd()` is this module's own directory,
  "the only project that exists" is not even expressible now, and there is no
  unpartitioned bucket left to fall back to. `LEARNING_PROJECT` sets one for
  somebody running this for exactly one project, which is a decision a person
  makes in an environment rather than one this program makes for them.

**The fence.** This app writes files into a path it was handed over the wire, so
the path is resolved with `realpathSync` and the folder it lands in is checked
to be under the project it claims to be under — after resolution, because a
`.kehikot` that is a symlink elsewhere is exactly the case a string comparison
misses. The file NAME is a constant and never arrives in a request.

**What was lost, and it is worth naming.** `quizzes` with no project used to
list every project this app held questions for, which was how a person found the
bucket theirs had gone into. It cannot: this process is handed one project at a
time and forgets it. The question it answered is answered better now — the file
is `.kehikot/learning/questions.json` in the folder you were working in, and `ls` finds
it.

## The screens that are not errors

`context.epic` is nullable and so is `context.projectPath`. Both get a real
screen rather than an error:

- **No paper open.** A question belongs to the epic whose paper it was written
  about, so with no epic there is nothing to ask. What the container can still do is
  say which papers in this project have questions waiting — a signpost instead of
  a dead end.
- **No project.** Nothing to read and nowhere to write, said plainly, with the
  path a project's questions would be at so a person knows where to look. Not a
  picker: choosing one there would be the page deciding where it is standing,
  which is the thing it has just said it cannot know.

## Spaced repetition, which is deliberately not here

There is no scheduler, no interval, no "due" state and no ease factor, and this
section exists because leaving a half-built one would have been worse than
saying why.

A spaced-repetition scheme needs two things this module does not have.

**Something to fire on.** SM-2 and every descendant of it decide *when* a card
comes back. That is only useful if something makes the card come back — a daily
review session, a notification, a queue somebody opens. This is a container on a
canvas. It is looked at when a person opens the paper it is about, which is
governed by what they are reading and not by a schedule. A `dueAt` computed here
would be a field nothing reads: the container would still show every question for the
open paper, because showing three of twelve and hiding the rest until Thursday is
a worse container, not a smarter one. The protocol has no timer a module can ask a
host to set, and this module declares no capabilities at all.

**A grade, not a verdict.** Every scheduling algorithm worth the name takes a
graded recall — Anki's again/hard/good/easy, SM-2's 0–5 — because the interval is
a function of *how hard it was*, not of whether you got it. A multiple-choice
question yields one bit. Deriving five buckets from one bit means inventing four
of them, and an interval computed from an invented grade is a number with a
decimal point and no information in it.

What IS here is the honest half of the same idea, and it is enough for the case
this module is actually for: **attempts are a list, not a flag.** Every answer is
kept, oldest first, up to twelve — so a question got right on the third try is
distinguishable from one got right immediately, and `quizzes` prints both to the
agent that wrote it. `Ask these again` forgets an epic's answers so the questions
can be asked again, which is repetition when a person decides they want it rather
than when a formula decides for them. The data a scheduler would need is being
recorded; nothing is being pretended about scheduling on top of it.

If this grows one, the honest shape is a `dueAt` per question computed from the
attempts list, a `due: true` argument on `quizzes` so an agent can ask what a
reader owes, and a sort in the container — not a hidden queue. That is a day's work on
a store that already holds the history, which is the position this leaves it in.

## The MCP door, which is the point

The realistic author of these questions is an agent that has just read a chapter.
Four tools, matching `kehikko-checklist`'s shape:

| tool | what it does |
|---|---|
| `quizzes` | every project, or one project's epics, or one epic's questions and how they were answered |
| `add_quiz` | one question, anchored to a passage: `project`, `epic`, `question`, `options`, `answer`, `why`, `path`, `start`, `end`, `quote` |
| `reword_quiz` | sharpen one, keeping its id, its passage and every answer given to it |
| `drop_quiz` | take one away, along with its answers |

**There is deliberately no tool that answers a question.** The division of labour
is the module: an agent has just read the chapter and knows what a reader should
be able to say about it, so it writes the questions; a *person* answers them,
because the entire value of the record is that it says what a person understood.
An agent answering its own questions produces a store full of perfect scores that
mean nothing, and an agent answering somebody else's produces a lie about a
person.

Every refusal names what to do instead, and the refusal sentence always comes
from the store rather than from the door, so the page and an agent cannot be told
two different things about the same rule. `test/doors.test.ts` exercises every
tool's argument validation without a browser.

## The manifest

- `declares.storage: true`, and **no `server.cors`**. The two are one decision:
  with a real origin this page's `/api` calls are same-origin, no CORS header is
  offered to anybody, and `/app` — with the write ticket printed into it — is
  unreadable from another origin. It matters more here than in most modules,
  because `/api/answer` returns the key to whoever submits an answer; permissive
  CORS would let any tab take the ticket and read the key back off every question
  in the store, one POST at a time. Verify:

  ```bash
  curl -sI -H 'Origin: https://evil.example' http://127.0.0.1:7950/app | grep -i access-control
  # prints nothing
  ```

- `declares.uses: []`. Nothing is asked for. `live:read`, `epics:read`,
  `steps:read`, `selection:set`, `view:navigate`, `stage:report` and `state:keep`
  were each considered and each rejected, in the essay in `manifest.ts`. A
  capability asked for and never used is the fastest way to teach somebody to
  press yes without reading.
- `extensions: { emits: [], consumes: [] }`. Checklist announces MCP calls onto a
  notifications panel and is right to. Here, what an agent writes lands in the
  container in front of the reader within three seconds, as a question they can
  answer — the container IS the notification, and a line on a panel two inches away
  would be telling somebody about a thing they are looking at.
- `modes: [{ scope: 'epic' }]`, and `guidance` under the protocol's 1024
  characters, saying what this module's presence obliges rather than what it
  shows.

## The shape of the repository

```
manifest.ts        what a host reads, and the essay on every non-declaration
doors.ts           /mcp, /healthz and /api, as one function with no socket
store.ts           <project>/.kehikot/, the fence around it, and the .gitignore
quiz/types.ts      the shapes both sides name — NO imports, deliberately
quiz/questions.ts  the store, the rules, asked() and score()
quiz/projects.ts   what is left of "which project" now the path is the partition
dev/migrate.ts     the one-off move out of data/questions.json, run by hand
page/document.ts   the document, generated per request so the ticket can reach it
vite.config.ts     the doors as middleware, and the missing server.cors
src/               the page: wire/, view/, store/ask.ts, components/ui/
test/              182 tests, no browser
```

Two traps worth naming, because both have cost this workspace time:

- **`quiz/types.ts` has no imports at all.** The page imports its types from
  there and not from `quiz/questions.ts`, which imports `node:fs`. A value import
  — or a plain `import` somebody later drops the `type` from — drags `node:fs`
  into the browser bundle, the module fails to evaluate, and the only symptom is
  a container reporting that the module loaded its page and never answered the host's
  greeting. That reads as a wire problem and is not one, and it is visible only
  in a browser console. A types-only file cannot do it, and
  `test/manifest.test.ts` asserts the rule over every file under `src/`.
- **`whitespace-nowrap` is removed from the base of both `Badge` and `Button`.**
  shadcn ships it in both, and `white-space: nowrap` makes an element's
  *min-content width* the full width of its text, which propagates up through
  every ancestor that is not `min-w-0`. Everything in this module is a long
  string — a question, an option, a quoted passage, a document path. One of them
  in a nowrap element sets a floor under the whole container; that floor was measured
  at 1187px in a 220px container in another module here. The short verdict marks opt
  back in at their call site. Measured clean at 220/280/320/400/1200px in both
  themes.

## What was salvaged, and from where

- **The schema** is the thesis workbench's `quizzes` table, which is the shape
  that actually worked: a question anchored to a document and a byte range with
  the quoted source, and the options as a JSON array. That table carried its
  reasoning as a comment — *SQLite has no list type and a second table for four
  short strings would cost more to read than it saves* — and the argument
  survives the change of storage unchanged. An options table here would be a
  join, an order column, and a second place for a partial write to leave an
  inconsistency, in exchange for normalising four strings that are only ever read
  together.
- **The old `roadmap.learning`** contributed the bounds, the id-is-issued-here
  rule, and the honest treatment of a passage it could not open. It also
  contributed the mistake this module is built around: it sent `questionsFor(slug)`
  to the browser, and that object had `answer` in it.
