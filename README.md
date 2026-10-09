# Learning

A place to be asked questions about what you are reading, and to answer them.

An app first. Every question anybody has written about a passage of a paper is
kept in the project it is about, as **one Markdown file per epic that a person
can open and edit**, with what a reader answered in a file beside it. It has
its own page, its own port and its own MCP door. A host may frame it, and
then it learns which project it is standing in and which paper is open.

```bash
./run.sh                 # http://127.0.0.1:7950/app
PORT=7951 ./run.sh       # somewhere else
bun run register         # tell a host on this machine where it is
bun test && bun run typecheck
```

## The model, which is three sentences long

A **question cites a passage** — a document, and the exact words in it. It is
**multiple choice**: the options in the order they are shown, which one is
right, and the explanation its author wrote. **Answering is recorded**, per
question, so the container can say what you got right and what you did not, and
so the same question can be asked again later.

A question belongs to **one epic** — the one whose paper it was written about —
and to **one project**. The epic is the name of the file and the project is the
folder it is in.

## The file

`<project>/.kehikot/learning/<epic>.md`. It works the way a
[Slides](../kehikko-slides) deck does, so a person who can edit one can edit
the other, and it can be typed by hand:

```md
# Anything above the first question is yours, and is kept as it is.

## Which surface does the thesis take as its object of study? [^1]
<!-- id: b13a66fc -->
- [x] The structured, graded activity
- [ ] The open chat surface
- [ ] Both surfaces equally

Why:
The introduction narrows the scope to the graded activity, in so many words.

Sources:
[^1]: chapters/1_introduction.tex | "It is the graded activity that this thesis takes as its object of study."
```

- A question is a `## ` heading; lines under it, before the options, are part of
  what is asked.
- The options are the list under it. **The correct one is the one ticked,
  `- [x]`.** The others are `- [ ]` or a plain `- `. A question with no tick, or
  two, is not asked, and both the page and `quizzes` say so.
- Everything after a line that is exactly `Why:` is the explanation.
- `[^1]` on the question is the passage it rests on, and `Sources:` lists them in
  Slides' exact syntax: `[^1]: <project-relative path> | "<exact words>"`. One
  list at the bottom is how this module writes it; a list after each question
  reads the same.
- `<!-- id: … -->` is the name a reader's answers are filed under. A question
  typed by hand needs none — it is named after its words until an agent next
  writes the file, which gives it one. So rewording a question that has an id
  keeps its answers.

**The passage is found by its words, not by byte offsets**, on every read — the
rule and the code are Slides' (`quiz/cite.ts` is a copy of its `deck/cite.ts`).
A run of whitespace in the quote matches any run in the file and nothing else is
forgiven, so each source is one of `holds`, `ambiguous` (the words occur more
than once), `adrift` (the paper changed under the question) or `unreadable` (the
file is not in the project). The page draws the source as a press only where
there is something to point at, and says which of the others it is.

**Answers are not in this file.** They are in `answers.json` beside it, by epic
and question id, and only answering adds to it: an answer is a record of what a
person did, not material to edit.

An edit made in any editor shows within three seconds, because the page asks
again that often and the server reads the file each time.

### Editing it in the page

**Edit** opens the file in the page: the Markdown beside what it will ask, the
way Slides shows a deck beside its slides, and as `Source` / `Preview` tabs
where the container is narrower than 672px. **Done** goes back to answering.
The source is typed into the editor Slides opens a deck in — CodeMirror 6 with
the same Markdown colouring, the same keys and the same light and dark.

- What is typed is saved as typed, a beat after the last keystroke. A file with
  something wrong in it is still saved, and the sentences about what is wrong —
  the ones `quizzes` prints — stand above the editor.
- A save is made against the version the editor last saw. If the file moved on
  disk meanwhile — an agent wrote, or it was edited elsewhere — nothing is
  written over it: the editor stops saving and asks which one stays, *Take what
  is on disk* or *Keep mine*.
- The disk is listened to while the editor is open (`GET /api/watch`,
  server-sent events of `{ epic, version }` behind the page's ticket, the way
  Slides watches a deck). A change made elsewhere with nothing typed since the
  last save is simply taken; with something typed and unsaved it raises the
  same question at once, rather than at the next save.
- Nothing typed is lost by leaving. **Done** waits for the save — one already
  on its way, and what was typed during it — and stays open, saying so, if it
  failed. Leaving the paper saves on the way out, and a container that is
  closed sends its last save as a request the browser finishes after the page
  is gone (for a file under about 48 kB; a larger one can lose the last beat).
- **History** lists every write to the file, newest first — an agent's
  `add_quiz`, `reword_quiz` and `drop_quiz`, an undo, and each sitting at this
  editor as one entry — and **Undo** puts back what was there before one. The
  trail is `history.json` beside the files, fifty entries an epic.

### What an edit does to answers already given

An answer is about the question as it was answered. It is kept while the
question's **options and key** are what they were — rewording the question, its
explanation or its source keeps it — and stops counting the moment either
changes: the question is then one nobody has answered, its key withheld again,
so a moved tick never leaves a stale "correct" on screen. The old attempts stay
in `answers.json` and count again if the edit is undone. `drop_quiz` leaves a
question's answers there too, so undoing a drop brings them back with it.

## The one design constraint: where the answer lives

**The correct option is not in this page until you have chosen.** It lives in
the Markdown file, on disk, and it crosses the wire exactly once per question:
in the reply to the request that submits an answer. The tick IS the answer key,
so the answering page is never sent the file.

**The editor is the one exception, and it is a press.** `GET /api/quiz` answers
with the file whole. It is behind the page's ticket, the page asks for it only
when a person presses Edit, and the text is held only by the editor, which Done
unmounts. Until that press the page holds no answer it has not earned; while
the editor is open it holds all of them. That is the trade — the person at the
editor is the author — and it means an agent that can press buttons in this
page can read the key by pressing that one.

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
| `Question` (`quiz/format.ts`) | yes | nothing outside the server process |
| `Asked` (`quiz/types.ts`) | only once there is an attempt | what `/api/questions` sends |
| `score()` (`quiz/questions.ts`) | returns it | the reply to `POST /api/answer` |

`asked()` is the only function that makes an `Asked`, and it is a dozen lines. There
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

**Measured, in a real browser** — `dev/probe.mjs`, against a running `./run.sh`,
before the questions became Markdown (the probes under `dev/` have not been run
since; see the end of this file):
zero elements carrying `data-correct` before a press, the string `correct`
absent from every question card, the explanations absent, `/api/questions`
sending `answer: null, why: null`, and the three option buttons carrying one
distinct class string between them — so there is no styling channel either.

## What it does with nothing else running

- **The questions for whatever paper is open**, each with its options, the
  document it was written about.
- **Every question says where it came from, and pressing it points the canvas
  there.** The source is one line under the question, labelled with the
  document — `agents.tex` in a narrow column, the whole project-relative path
  where there is width for it — and pressing it publishes the exact words to
  the canvas, so whatever is showing that document turns to them. The card the
  canvas is standing on is marked. The passage itself is not drawn here: it is
  the line under `Sources:` in the file, and the place to read it is the paper.
  A source that cannot be found is not a press, and says why.
- **Answering, and the record.** One press, a verdict, the key, the explanation.
  Answers survive a reload because they are on disk and not in the page.
- **A store inside the project.** `<project>/.kehikot/learning/<epic>.md` — plain
  Markdown, beside the work, readable and editable by anybody who has the
  repository open.
- **Two screens that are not errors.** A canvas standing on no epic, and a host
  that gave no project path. See below.

## The path is the partition

The host sends `projectPath` in the context (protocol 0.8), and the questions
are kept **inside that folder**, at `<project>/.kehikot/learning/`. The
user asked for exactly that:

> "Each of the modules should hold their data inside the project itself, mostly
> as text files inside a kehikko-folder (or json) … That way everything is
> transparent etc and easily usable by others in the project."

The folder name, the join and the `.gitignore` text are
`kehikot-module-protocol`'s (0.10), not this module's, because four modules
answering "where does my data live" separately is four answers and the
disagreement has no symptom: every module starts, every module saves, and a
person finds half their work in one folder and half in another.

**This replaced a partition rather than adding to one.** One `questions.json` used
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
misses. A file's NAME is a constant or an epic slug checked for shape — no
dot, no slash — and never a filename from a request.

**What was lost, and it is worth naming.** `quizzes` with no project used to
list every project this app held questions for, which was how a person found the
bucket theirs had gone into. It cannot: this process is handed one project at a
time and forgets it. The question it answered is answered better now — the file
is `.kehikot/learning/` in the folder you were working in, and `ls` finds
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

## The box it is actually given

A container on a canvas is 220–500 wide and often 150–300 tall. Measured with
`dev/sizes.mjs`, in a real frame: a question card is 307px at 220 wide, 239 at
320, 212 at 460, 182 at 900. So in the ordinary case one card is taller than the
whole box, and everything below follows from that.

- **Width is CSS.** The body is a container and the responsive classes are
  `@sm/container:` variants. Never a viewport breakpoint: the frame is 220px on
  a monitor two thousand across, so every breakpoint Tailwind ships fires.
- **Height cannot be.** `container-type: inline-size` measures one axis on
  purpose and there is no `@height-sm:`. So the frame is measured
  (`src/view/use-frame.ts`) and `src/view/room.ts` turns width and height into
  four decisions — snap, options, retake note, and how much of the source path
  the pointing control spells. It is one pure
  function with its own test file because "what shows at 220×300" should be a
  table somebody can read, not six ternaries spread across two components.
- **Scrolling snaps below 520px of height, on `proximity`, and only where there
  is a list left to snap.** Never `mandatory`: a card is taller than a short box,
  and a scroller that must come to rest on a snap point cannot hold the bottom of
  one. The heading is a snap point too, or the page loads already scrolled past
  the paper's name.
- **Nothing folded is unreachable.** The retake note becomes the button's
  `title`, and on an *answered* card the options that were neither chosen nor correct go behind one
  press. Nothing folds on an unanswered card: the options are the question.

### The ladder: one whole question beats two partial ones

The rule underneath all of that, said once: **do not squeeze many things in
partially when one thing shown completely is more useful.** `ladder()` in
`src/view/room.ts` puts the page on one of three rungs, and `dev/ladder.mjs`
measures the result in a real frame.

| rung | when | what the reader gets |
|---|---|---|
| `list` | two whole cards fit | the list, scrolling, snapping — as it has always been |
| `one` | one whole question fits | that question entire: its text, every option, and its source, with nothing to scroll and nothing to press open. A pager moves between questions |
| `part` | not even one fits | one of `question`, `options`, `why` at a time, with the question above it wherever the whole of it fits |

`list` versus the other two is a fact about the whole list; `one` versus `part`
is a fact about the question being SHOWN, so a short question shows whole and the
long one three along from it splits.

**A person can answer at every size, and that is what the probe asserts.** A
multiple-choice question you cannot read is not answerable, so the question
stands above whichever part is showing. That used to be `line-clamp-2`, and the
clamp was the bug: at the tightest sizes it drew two lines of a seven-line
question with an ellipsis on the end and took forty-six pixels off the options —
a fragment of a sentence AND less room to answer in. `headerOf()` in
`src/view/room.ts` now draws the header only where the whole question fits in two
lines *and* what is left under it still holds the source control and one whole
option; otherwise it draws none, and the `question` chip — which appears from the
same number — is the way to it. There is no `line-clamp` left in the class list,
so a clipped header is not something the card can draw, and `dev/ladder.mjs`
measures every question at every size for content overflowing its own box.

Nor is the control that points the canvas ever off screen: it is drawn above the
part rather than after it, since eight options at 220 wide are 516 pixels of
buttons and anything under them goes off the bottom. Switching parts and paging
publish nothing, and `dev/pointing.mjs` counts that from the host's side.

**And the row of controls does not move.** It used to be simply next in flow
after the card, so it rode up and down with whatever the part happened to hold:
532px on `options` and 160px on `passage` at 220×300, on the one control a reader
presses over and over — a person who looks, then reaches for `passage`, presses
`why`. The paged rungs are a column now: the card is drawn in a box of exactly
`ladder.available` pixels and scrolls inside it, and the row sits under that box.
The row's position is therefore that one number, which is the frame less the
page's padding less the row reserved at its widest, and it depends on neither
which part is showing, nor which question, nor what has been answered.
`test/room.test.ts` asserts the last two of those without a browser and
`dev/ladder.mjs` measures the row's real offset on every part at every size: it
was moving by up to 372px and moves by none. The fourth chip, which arrives with
the first answer, is a second line of chips at 220 wide — the row grows
downwards, into space `controlsHeight()` had already reserved, and its top does
not move.

What it costs is that the space reserved for a row that is not yet full is not
lent to the card in the meantime: at 220×300 a question that used to just fit now
scrolls about fifty pixels inside its box, until answering fills the row it was
always going to fill. That is the same trade `controlsHeight()` already made for
the rung, and it is made here for the same reason — a layout that gives space
back and then takes it away is a layout that moves under somebody's finger.

**The explanation is a part of its own; the result is not.** Answering earns two
things and they are drawn in two places. `right`/`wrong` and the marks on the
options stay with the options, because knowing you were wrong belongs beside what
you chose — so a press changes the screen the reader is standing on rather than
moving them off it. The explanation goes to a `why` part, offered only once there
is one to read: it is prose, it is the longest thing a card holds, and it is the
one piece that does not exist until it is earned, so sharing a part with anything
else made that part mean two things and pushed the other one off the bottom.

**The paged rungs draw no card and no heading.** The host already puts a
container round this module, so a bordered, padded card inside it is a card on a
card — 18 pixels in each axis, in a 220-pixel column, for an edge with nothing to
separate the question from. The heading block goes too, replaced by the single
row of controls those rungs need anyway; every card names its own document on its
source control, so the paper is still on screen. At `list`, where there really
are several questions, the card keeps its edge — that is the one job an edge
does. Measured: the chrome above the first question falls from 43px to 8 at 220
wide and from 25 to 8 at 320, and the text inside a card widens from 186 to 204
and from 286 to 304.

**How the fit is decided, and what it gets wrong.** By estimate, not by
measurement: measuring a card in order to decide how to draw the card is a loop
with the reader inside it, and a layout that flickers between rungs is worse than
one rung too conservative. `lines()` is a greedy line-breaker over real font
metrics (`src/view/text.ts`, a canvas), and it is exact — `dev/ladder.mjs` writes
every estimate into the DOM beside the measured height and fails the run on any
that came in under. The one thing it cannot know is the explanation of a question
nobody has answered, because the server withholds it: so answering can push a
card past its box and drop `one` to `part`. It lands on the `options`, which is
where the reader already was and where the verdict is drawn, and the explanation
it could not reserve space for gets a part of its own. The list rung is measured
as if nobody had answered anything, so working through a paper can never move it.

## The scope, which is offered to the container's header

A module tells the host what it can be narrowed by over `kehikot.filters`; the
host draws one control in the container header, and the choice comes back in
`context.filters`. This one offers a **scope**, in the owner's words: "show
questions related to all files, current file, current page or highlighted
section".

| rung | what it keeps | offered when |
|---|---|---|
| `all` | every question about the open paper | always, and it is the fallback |
| `file` | the questions written about the document the canvas is standing on | something on the canvas names a document |
| `section` | the questions whose anchor the reader's selection touches | that something also names a range |

**The rungs are grain, not places.** What the host remembers per container is
`all`, `file` or `section` — *how narrow the reader likes it*, which is a
preference and should survive a restart. *Which* file and *which* section are
read off the passage in the context every time and are never stored, so the same
stored `file` shows one chapter today and another tomorrow, and nothing rots when
a file is renamed. A rung that cannot be honoured right now degrades to `all`
rather than emptying the container, and the choice is still there when the reader
highlights something again.

**Only rungs that exist are offered.** With nothing pointed at, the offer is
empty — the protocol's way of saying "nothing here can be narrowed now" — and the
host takes the control away, because an option that cannot be honoured is a press
that teaches a reader the header lies. The offer is re-sent whenever a rung
appears or disappears, and *not* when the passage merely moves.

**There is no `page` rung**, and that is a check rather than an omission.
`kehikko-paper` really does publish a page number, so the context carries one; a
question cites a path and some words, and this module reads the SOURCE file,
never the typeset pages, so it cannot say which sheet a sentence lands on. The missing half is on
this side.

**The count stays in the page.** A host cannot count rows it does not render, in
a document it cannot read, in a frame on another origin — so a narrowed container
says what it is hiding in its own words: `3 more questions outside this passage`
in a list heading, `+3 elsewhere` with the sentence on its `title` where the box
is 220 wide. An empty scope says so, and says it differently from a paper nobody
has written questions about yet. `src/wire/scope.ts` carries the argument;
`dev/scope.mjs` drives a host and checks that the offer arrives, changes with the
canvas, and narrows what is drawn.

**`only unanswered` is refused, not postponed.** A quiz whose list silently loses
a card the moment it is answered takes away the one thing a reader comes back
for, which is reading the explanation again.

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
host to set, and the one capability this module does declare points at a
passage rather than at a clock.

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
| `quizzes` | one project's epics, or one epic's questions and how they were answered |
| `add_quiz` | one question, at the end of the epic's file: `project`, `epic`, `question`, `options`, `answer`, `why`, `path`, `quote`. Refused unless the quoted words are in the file exactly once |
| `reword_quiz` | sharpen one, keeping its id — and its answers, unless the options or key change; `path` and `quote` cite it again |
| `drop_quiz` | take one out of the file; undoable from the editor's History |

They read and write the same Markdown a person edits, so `quizzes` also prints
whether each source still holds and anything wrong with the file. No byte
offsets are taken: a caller that still sends `start` and `end` is not refused,
and they are ignored.

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

- `declares.uses: ['passage:set']`. One capability, and this line used to say
  `[]`. A question here *cites its source* — a document and the exact words in
  it — so a question IS a passage, and a container that could name
  one and not show it would be withholding the fact it exists to hold. Pressing
  the source of a question puts that passage in the canvas's context, and every
  framed module that understands one reacts: a reader turns to it, a notes
  container narrows to it. Nothing here names the module that reacts, and the
  feature works unchanged if it is replaced by a different one — the context is
  the pipeline, and a second one would be this module solving a problem the
  protocol already solved.

  The bound is narrow and it is what the capability was granted under: it points
  when a **person presses a question's source**, and never on a load, a
  greeting, a context, a poll, or an answer. `dev/pointing.mjs` sits where a
  host sits and counts, because a claim about runtime behaviour cannot be
  settled by reading a file.

  `live:read`, `epics:read`, `steps:read`, `selection:set`, `view:navigate`,
  `stage:report` and `state:keep` were each considered and each rejected, in the
  essay in `manifest.ts`. A capability asked for and never used is the fastest
  way to teach somebody to press yes without reading.
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
store.ts           <project>/.kehikot/learning/, the fence around it, and the .gitignore
quiz/types.ts      the shapes both sides name — NO imports, deliberately
quiz/format.ts     the Markdown file: the only reader and writer of one
quiz/cite.ts       a source line, and finding its words again — copied from Slides
quiz/questions.ts  the store, the rules, asked() and score()
quiz/migrate.ts    the one move out of the old questions.json
quiz/history.ts    what each file held before every write, for undo
quiz/projects.ts   what is left of "which project" now the path is the partition
dev/*.mjs          probes that drive a real browser; see below
page/document.ts   the document, generated per request so the ticket can reach it
vite.config.ts     the doors as middleware, and the missing server.cors
src/               the page: wire/ (pointed.ts, scope.ts), view/ (room.ts,
                   text.ts), store/ask.ts, ui/
test/              no browser
```

The probes under `dev/` need a running server and a chromium on disk, so
they are not part of `bun test`. **They predate the Markdown format and have not
been brought across**: they seed questions with byte ranges and measure the
passage panel a card no longer has, so read their numbers in this file as
measurements of the layout before it — the estimates in `view/room.ts` only lost
terms, but nothing has re-measured them in a browser. They are kept because
they are not part of `bun test` — a suite that cannot run on a fresh checkout is
one people learn to skip. They measure the half `bun test` cannot: real layout
at real sizes, and a DOM a browser actually built.

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

## Coming from `questions.json`

Before the Markdown, one project's questions were one JSON file,
`.kehikot/learning/questions.json`, each carrying its epic, its key, a byte
range and its attempts. The first time that file is found — on a read as well
as a write — `quiz/migrate.ts` moves it, once:

- every epic in it becomes `<epic>.md`, its questions in their order with their
  old ids, and one `Sources:` list at the bottom. **An `<epic>.md` that is
  already there is left alone**, and that epic's old questions are not merged
  into it;
- every attempt is copied into `answers.json` under the same epic and id;
- `questions.json` is renamed `questions.migrated.json`, byte for byte, so
  nothing is destroyed and the move does not run again.

What does not come across, and stays readable in the renamed file: who wrote
each question and when, and the byte range. A quote's line breaks become
spaces, which is how a source line spells it. A `questions.json` that will not
parse is not moved and not treated as empty.

## What is shared with Slides, and what is only copied

The format is Slides' on purpose — a heading per unit, `[^n]` markers, a
`Sources:` list in the same syntax, words rather than offsets, the same four
statuses, the same press that points the paper. The CODE is a copy:
`quiz/cite.ts` holds `parseSource`, `serialiseSource`, `uncitable`, `markersIn`,
`findQuote` and `resolveSource` from Slides' `deck/format.ts` and `deck/cite.ts`,
and `store.ts` holds its `citedText`. `quiz/history.ts` is Slides' undo trail in
the same shape, and `src/view/use-quiz.ts` its `useDeck`. They all belong in
`kehikot-module-protocol`. So is `quiz/live.ts`, Slides' `live.ts` for quiz
files. The editor is Slides' too, and also a copy (`src/view/markdown-editor.tsx`
of its `src/editor/deck-editor.tsx`): sharing sixty lines through the protocol
would hand CodeMirror to the host and to every module that installs it.
