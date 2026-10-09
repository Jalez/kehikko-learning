import type { Standing } from '@/store/ask.ts'
import { Badge } from '@/components/ui/badge.tsx'

/**
 * The screen for "there is nothing to ask you yet", which is not an error.
 *
 * There were two here. The other — nothing said which project this canvas is
 * standing in, or nothing is framing the page at all — is the protocol's shared
 * `Cover` now, drawn in `App` with one line of this module's own under it: the
 * questions are kept inside a project, and this page will not guess which.
 * This one stays because it is not only a sentence: it lists what is waiting.
 */

/**
 * The canvas is on no epic.
 *
 * `context.epic` is nullable and this is the screen for it. A question belongs
 * to the epic whose paper it was written about — that is the key the store is
 * read by, not a display choice — so with no epic there is genuinely nothing to
 * ask. What the container can still do is say WHICH papers in this project have
 * questions waiting, which is the most useful true thing available and turns a
 * dead end into a signpost.
 */
export function NoEpic({ project, standings }: { project: string | null; standings: Standing[] }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h2 className="text-[0.8rem] font-semibold @sm/container:text-sm">No paper is open</h2>
      <p className="text-[0.7rem] leading-4 text-muted-foreground">
        Questions belong to the paper they were written about. Open one on this canvas and its questions appear.
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
          No questions have been written in this project yet. An agent that has just read a chapter writes them with{' '}
          <code>add_quiz</code>.
        </p>
      )}
    </section>
  )
}
