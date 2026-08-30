import type { ProjectStanding, Standing } from '@/store/ask.ts'
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
 * the project's name and has no folder to point at — and this page must not
 * guess. Guessing means showing one project's questions inside another, which is
 * the exact failure the partition exists to prevent, and two projects both
 * having an epic called `bridge` is the expected collision rather than a
 * hypothetical one.
 *
 * So the pane says so, and lists what this app is holding for whom. That list is
 * not a picker: choosing one here would be this page deciding where it is
 * standing, which is the thing it has just said it cannot know. It is a receipt,
 * for a person wondering where the questions an agent wrote have gone.
 */
export function NoProject({ projects, unhosted }: { projects: ProjectStanding[]; unhosted: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h2 className="text-[0.8rem] font-semibold">
        {unhosted ? 'Nothing is framing this page' : 'This canvas did not say where it is'}
      </h2>
      <p className="text-[0.7rem] leading-4 text-muted-foreground">
        {unhosted
          ? 'Opened directly, this page has no canvas to tell it which project it is standing in. Everything below is '
            + 'held here, on this machine, and works with nothing else running — but which questions to show is a '
            + 'question only a host can answer.'
          : 'A host may know a project’s name and have no folder to point at, and this pane will not guess: questions '
            + 'are kept apart by project, and showing one project’s questions inside another is the failure that '
            + 'partition exists to prevent.'}
      </p>
      {projects.length ? (
        <>
          <p className="text-[0.65rem] leading-4 text-muted-foreground">This app is holding questions for:</p>
          <ul className="flex min-w-0 flex-col gap-1">
            {projects.map((row) => (
              <li key={row.project} className="min-w-0 rounded border bg-card px-2 py-1">
                <code className="text-[0.65rem] [overflow-wrap:anywhere]">{row.project}</code>
                <p className="text-[0.65rem] leading-4 text-muted-foreground">
                  {row.questions} question{row.questions === 1 ? '' : 's'}, about {row.epics.join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[0.65rem] leading-4 text-muted-foreground">
          No questions have been written yet, for any project.
        </p>
      )}
    </section>
  )
}
