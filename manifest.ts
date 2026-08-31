import { MANIFEST_KIND, PROTOCOL, manifestSchema, type Manifest } from 'roadmap-module-protocol'

export const ID = 'roadmap.learning'
export const VERSION = '1.0.0'

/**
 * What this app says about itself when a host asks.
 *
 * The manifest is the smallest half of this program and the only half a host
 * ever reads. Everything below works with nothing on the other end — the page
 * opens directly, the store answers, the MCP door takes questions — so read this
 * as a description of the ENRICHMENT and not of the app: it says which tab to
 * give the page, and which questions this app would like to be allowed to ask if
 * there turns out to be anybody there to ask.
 *
 * ## What it declares, and the much longer list of what it does not
 *
 * - **`storage: true` — declared, and it is the only capability here.** A host
 *   frames a module WITHOUT `allow-same-origin` unless its manifest declares
 *   storage, which puts the page on an opaque origin. This module owns data and
 *   takes writes: the questions, the passages they are anchored to, and every
 *   answer somebody gave. Opaque, that combination has a hole in it — an opaque
 *   page's fetches to its own `/api` are cross-origin, so the server would have
 *   to answer every origin with permissive CORS, and permissive CORS means any
 *   page in any tab can read this origin, including `/app` and the write ticket
 *   printed into it. Journeys had exactly that hole and it was demonstrated
 *   rather than theorised. Declaring storage closes it at the root: with a real
 *   origin this page's scripts and its `/api` calls are ordinary same-origin
 *   requests, no CORS header is sent at all, and a stranger reading `/app` gets
 *   nothing back. The sandbox is weakened by exactly what that costs, which is
 *   little: the origin regained is `127.0.0.1:7950` and the host is on
 *   `127.0.0.1:4181` — different ports are different origins, so the page can
 *   reach itself and nothing else.
 *
 *   It matters more here than in most modules for a second reason, which is the
 *   one this module is actually about. **The correct option is not in this page.**
 *   It is decided at the server, on the request that submits an answer, and
 *   returned only to whoever submitted one — see the essay on `score` in
 *   `quiz/questions.ts`. That is worth nothing if any tab on the machine can
 *   read this origin's `/api` and ask it for the whole store, so the CORS
 *   argument above is not hygiene here, it is the second half of the mechanism.
 *
 * - **`uses: []` — nothing is asked for, and that is not an oversight.** This
 *   app needs the context and nothing else, and the context is not a capability:
 *   it arrives in the greeting and on every switch whether anything was declared
 *   or not. Each of the things it might have asked for and does not:
 *
 *   - **`live:read` — no.** Nothing here is derived from a tracker. Every
 *     question is a line somebody typed against a passage somebody quoted, and
 *     no reading of an issue changes any of it.
 *   - **`epics:read` and `steps:read` — no.** The old module asked for both so a
 *     question could be headed with a journey's real title and the step that
 *     carried it. It shows the epic slug instead, which is the true name of what
 *     this store holds. A prettier heading is not worth a permission, and a
 *     permission asked for and used once for a heading is the fastest way to
 *     teach somebody to press yes without reading.
 *   - **`selection:set` — no.** This container reacts to what is open; it does not
 *     change what every other container on the canvas is looking at. A quiz that
 *     re-pointed the canvas when you answered a question would be answering for
 *     you.
 *   - **`view:navigate` — no.** Being walked TO is `roadmap.goto` arriving and
 *     needs no declaration. This container answers that it has nothing to walk to,
 *     because a question is not a place.
 *   - **`stage:report` — no.** Saying where work stands belongs to whoever is
 *     doing it. Getting a question wrong is not a stage.
 *   - **`state:keep` — no, and this is the one worth arguing.** Checklist
 *     declares it because a person has to PICK which list a container is showing and
 *     the pick has to stick per kehikko. Nothing here is picked: the epic
 *     decides which questions are shown, the project decides which store they
 *     came out of, and both arrive in the context. A kept string would have
 *     nothing to hold.
 *   - **Tracker access — no, and there is no capability for it.** This app never
 *     speaks to GitHub or GitLab, holds no token, and has no code path that
 *     could.
 *
 * - **`extensions: { emits: [], consumes: [] }` — empty, and here is the
 *   argument, because Checklist reached the opposite conclusion on nearly the
 *   same facts.** Checklist announces an agent coming through its MCP door, on
 *   the ground that a notification is for what you would otherwise miss. That is
 *   right there and wrong here, for one reason: what an agent writes through
 *   THIS door lands in the container in front of the reader within three seconds, as
 *   a question they can answer. The container IS the notification, and a second line
 *   on a panel two inches away saying "an agent added a question" would be
 *   telling somebody about a thing they are looking at. `consumes` stays empty
 *   for the ordinary reason: this app shows questions, and a quiz that also
 *   showed other modules' announcements would be two panels in one container.
 *
 * - **`prompt: false`.** The protocol offers a module a prompt: a paragraph a
 *   person writes on the canvas, aimed at one container, composed by the host and
 *   delivered in every context. Declaring it makes a host OFFER one. The
 *   question is not "could we find a use" but "is there work here that has to be
 *   described before it can be done", and the answer is no. A question here is
 *   already prose somebody wrote, in this app's own store, with an id an agent
 *   can name, an author, a time, and a passage it is anchored to. A prompt is
 *   prose the HOST composes: unstamped, unversioned, unaddressable, and gone
 *   when the canvas moves. Offering one beside the questions would be offering a
 *   second, worse place to write the same thing down.
 *
 * And per the protocol's own README: a declaration is not a request and is not
 * answered. The host refuses whatever it likes at every call whatever is written
 * here, so the page is built to be refused — every screen it draws is drawn from
 * this app's own store, and the context only ever narrows what is shown.
 *
 * ## The mode, and why `epic`
 *
 * One epic-scoped mode, which becomes an ordinary tab in the mode row beside
 * every other module's. A question belongs to the epic whose paper it was
 * written about, so `scope: 'epic'` is not a display choice — it is the key the
 * store is read by. An epic-scoped mode is told which epic is open by
 * `roadmap.context`, on load and on every switch, which is what makes "the
 * questions about this paper" answerable without anybody typing a slug.
 *
 * `context.epic` is nullable and that is a real screen rather than an error. A
 * canvas can be standing on no epic at all; the container then says which epics in
 * this project hold questions, which is the most useful true thing it can say.
 */
export const MANIFEST: Manifest = manifestSchema.parse({
  kind: MANIFEST_KIND,
  /**
   * Parsed rather than shipped as a bare object.
   *
   * The protocol package is explicit that its schemas are a convenience and
   * never the host's check — the host runs its own copy over what arrives on the
   * wire. That cuts both ways: running it HERE is the cheapest way for this app
   * to learn it has written a manifest no host will accept, and to learn it when
   * this file is imported rather than from a host's refusal in somebody else's
   * log.
   *
   * It has one failure mode worth knowing, because it has bitten four modules in
   * this workspace: a stale copy of the protocol package strips fields it has
   * never heard of and `parse` does not complain, so a manifest field simply
   * VANISHES with no error at all. `bun pm cache rm` and then `bun update` — the
   * update alone does not move a git dependency.
   */
  protocol: PROTOCOL,
  id: ID,
  name: 'Learning',
  version: VERSION,
  summary:
    'Questions anchored to a passage of a paper — the document, the byte range and the quoted source — with the '
    + 'options, and what you answered. An agent writes them; a person answers them.',
  /**
   * What an agent should do about this module, given that it is here.
   *
   * Not the summary. The summary says what this IS, for a person deciding
   * whether to place it. This says what its PRESENCE OBLIGES, and a host
   * composes it into the prompt every agent on the canvas is handed —
   * attributed to this module, because it is this module's claim rather than
   * the host's.
   *
   * Written as instructions to somebody who has just arrived and does not know
   * the questions exist, since that is exactly who reads it. Bounded at 1024
   * characters by the protocol, so every sentence here is one an agent that read
   * nothing else would still act correctly on.
   */
  guidance:
    'If you have just explained something from a paper on this canvas, the questions that would check whether it '
    + 'landed belong here — write them with `add_quiz` before you move on, while you still have the passage open. '
    + 'Every question is anchored: give the document path, the byte range and the exact quoted source, so that what '
    + 'the question is about is a fact and not a claim. Give the options and which one is right, and say in the '
    + 'explanation why the others are wrong. `quizzes` shows what has already been asked about an epic and how it '
    + 'was answered — read it first, because asking the same thing twice teaches nothing, and read it afterwards, '
    + 'because a question somebody got wrong is the part of your explanation that did not work. Do NOT answer them '
    + 'and do not print the correct option into anything a reader can see: the answer is withheld here until the '
    + 'person has actually chosen, and telling them is the one thing that makes this module worthless.',
  entry: '/app',
  modes: [{ id: 'learning', label: 'Learning', scope: 'epic' }],
  mcp: {
    url: '/mcp',
    transport: 'http',
    about: 'Write the questions a reader of a paper should be able to answer, anchored to the passage they are about.',
  },
  extensions: { emits: [], consumes: [] },
  declares: {
    protocol: `>=${PROTOCOL} <${PROTOCOL + 1}`,
    uses: [],
    storage: true,
    prompt: false,
  },
  health: '/healthz',
})
