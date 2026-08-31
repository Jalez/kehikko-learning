import type { Standing } from '@/store/ask.ts'
import { Badge } from '@/components/ui/badge.tsx'

/**
 * The two screens for "there is nothing to ask you yet", which are not errors.
 *
 * Both of them exist because the module is honest about two nullable facts the
 * protocol hands over, and a module that treated either as a failure would be
 * telling somebody their canvas is broken when it is merely somewhere else.
 */

/**
 * The canvas is on no epic.
 *
 * `context.epic` is nullable and this is the screen for it. A question belongs
 * to the epic whose paper it was written about — that is the key the store is
 * read by, not a display choice — so with no epic there is genuinely nothing to
 * ask. What the pane can still do is say WHICH papers in this project have
 * questions waiting, which is the most useful true thing available and turns a
 * dead end into a signpost.
 */
export function NoEpic({ project, standings }: { project: string | null; standings: Standing[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h2 className="text-[0.8rem] font-semibold">No paper is open</h2>
      <p className="text-[0.7rem] leading-4 text-muted-foreground">
        A question here belongs to the epic whose paper it was written about, so this pane has nothing to ask until
        one is open. Open an epic on this canvas and its questions appear.
      </p>
      {standings.length ? (
        <>
          <p className="text-[0.65rem] leading-4 text-muted-foreground">
            Questions are waiting for {standings.length === 1 ? 'this paper' : 'these papers'}
            {project ? ' in this project' : ''}:
          </p>
          <ul className="flex min-w-0 flex-col gap-1">
            {standings.map((row) => (
              <li key={row.epic} className="flex min-w-0 flex-wrap items-center gap-1 rounded border bg-card px-2 py-1">
                <span className="min-w-0 text-[0.72rem] font-medium [overflow-wrap:anywhere]">{row.epic}</span>
                <Badge nowrap variant={row.answered === row.questions ? 'right' : 'unasked'}>
                  {row.answered}/{row.questions} answered
                </Badge>
                {row.answered ? (
                  <Badge nowrap variant={row.right === row.answered ? 'right' : 'wrong'}>
                    {row.right} right
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[0.65rem] leading-4 text-muted-foreground">
          No questions have been written about anything in this project yet. Nothing here ships a question: an agent
          that has just read a chapter writes them with <code>add_quiz</code>.
        </p>
      )}
    </section>
  )
}

/**
 * Nothing said which project this canvas is standing in.
 *
 * `context.projectPath` is nullable — a host with no filesystem of its own knows
 * the project's name and has no folder to point at, and a page opened directly
 * has no canvas at all — and this page must not guess. Guessing is not a display
 * mistake here: questions are kept INSIDE the project, at
 * `.kehikot/learning/questions.json`, so a guessed path is somebody's questions written
 * into a folder they will never open, under a pane that said they were saved.
 *
 * ## Why there is no longer a list of projects on this screen
 *
 * There used to be one. This app kept a single store beside itself, keyed by
 * project, so it could say "questions are held for these paths" — a receipt, for
 * a person wondering where the ones an agent wrote had gone. It was deliberately
 * not a picker: choosing here would be the page deciding where it is standing,
 * which is the thing it has just said it cannot know.
 *
 * The store moved into the projects, so there is nothing left to enumerate: this
 * process is handed one project at a time and forgets it. The receipt is gone
 * and the question it answered is answered better — the file is
 * `.kehikot/learning/questions.json` in the folder you were working in, and `ls` finds it
 * without asking anybody.
 */
export function NoProject({ unhosted }: { unhosted: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h2 className="text-[0.8rem] font-semibold">
        {unhosted ? 'Nothing is framing this page' : 'This canvas did not say where it is'}
      </h2>
      <p className="text-[0.7rem] leading-4 text-muted-foreground">
        {unhosted
          ? 'Opened directly, this page has no canvas to tell it which project it is standing in — and the questions '
            + 'are kept inside the project, so without one there is no file to open. Nothing is wrong and nothing is '
            + 'lost: open this pane on a canvas that has a project, and its questions appear.'
          : 'A host may know a project’s name and have no folder to point at, and this pane will not guess. Questions '
            + 'live inside the project they are about, so a guessed path would write somebody’s questions into a '
            + 'folder they will never open.'}
      </p>
      <p className="text-[0.65rem] leading-4 text-muted-foreground">
        Wherever they are, they are in plain sight: each project keeps its own in{' '}
        <code className="[overflow-wrap:anywhere]">.kehikot/learning/questions.json</code>, beside the work rather than inside
        this app.
      </p>
    </section>
  )
}
