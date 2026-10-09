import { linesOf } from 'kehikot-module-protocol'
import { useMemo, useState } from 'react'

import type { Files, HistoryEntry } from '@/store/ask.ts'
import { MarkdownEditor, type Editor } from '@/view/markdown-editor.tsx'
import { useQuiz } from '@/view/use-quiz.ts'
import { Button } from '@/components/ui/button.tsx'

import { parseQuiz, quizProblems } from '../../quiz/format.ts'

/**
 * An epic's questions, open as the Markdown they are: the source beside what
 * it will ask, the way Slides shows a deck beside its slides. Where there is
 * room for only one — narrower than 672px — they are two tabs.
 *
 * ## This is the one screen that holds the answers
 *
 * Everywhere else in this page the correct option is not in the page until it
 * has been earned (`asked` in `quiz/questions.ts`). Here the whole file is —
 * every tick and every explanation — because the person who pressed Edit is
 * the author, and an author sees what they wrote. So:
 *
 * - nothing asks for the file until this component is mounted, and it is
 *   mounted only by that press (`App`);
 * - the text is held in this component's state and nowhere else, so Done takes
 *   it out of the page again;
 * - the route it comes through is behind the page's ticket (`doors.ts`).
 *
 * What is typed is saved as typed, a beat after the last keystroke. A file
 * with something wrong in it is still saved — the sentences about what is
 * wrong stand above it, and are the same ones `quizzes` prints.
 *
 * The source is typed into the editor Slides opens a deck in (`editor`,
 * `markdown-editor.tsx`); a test hands this a textarea instead, as Slides'
 * tests do. It is not drawn until the file has been read, so there is never an
 * empty editor to type into and have overwritten by the read.
 */
export function QuizEditor({
  files,
  project,
  epic,
  file,
  onDone,
  saveDelay,
  editor: EditorPane = MarkdownEditor,
}: {
  files: Files
  project: string
  epic: string
  /** Where the file is, relative to the project, for saying so. */
  file: string | null
  onDone: () => void
  saveDelay?: number
  editor?: Editor
}) {
  const doc = useQuiz({ files, project, epic, ...(saveDelay === undefined ? {} : { saveDelay }) })
  const [tab, setTab] = useState<'source' | 'preview'>('source')
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<string | null>(null)

  const quiz = useMemo(() => parseQuiz(doc.text ?? ''), [doc.text])
  const problems = useMemo(() => quizProblems(quiz), [quiz])
  const found = useMemo(() => new Map(doc.sources.map((one) => [one.label, one])), [doc.sources])

  const said =
    doc.state === 'loading'
      ? 'reading…'
      : doc.state === 'saving'
        ? 'saving…'
        : doc.state === 'unsaved'
          ? 'not saved yet'
          : doc.state === 'conflict'
            ? 'not saved'
            : doc.state === 'failed'
              ? `not saved: ${doc.error ?? 'it did not say why'}`
              : 'saved'

  const act = async (what: () => Promise<void>) => {
    setBusy(true)
    setTrouble(null)
    try {
      await what()
    } catch (caught) {
      setTrouble(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  /*
   * Done waits for the last words to be written, and does not leave on a save
   * that failed: the text is only here, and leaving would be the loss. Said
   * once; a second press, with nothing typed since, is the person's answer.
   */
  const [unsaved, setUnsaved] = useState<string | null>(null)
  const done = () =>
    act(async () => {
      if ((await doc.flush()) || unsaved === doc.text) return onDone()
      setUnsaved(doc.text)
      throw new Error('That could not be saved, so the editor is still open. Press Done again to leave without it.')
    })

  const history = () =>
    act(async () => {
      if (entries) return setEntries(null)
      await doc.flush()
      setEntries(await files.history(project, epic))
    })

  const undo = (id: string) =>
    act(async () => {
      doc.take(await files.undo(project, epic, id))
      setEntries(await files.history(project, epic))
    })

  return (
    <section data-editor="open" className="flex h-[calc(100dvh-1rem)] min-h-40 min-w-0 flex-col gap-1.5 @sm/container:h-[calc(100dvh-1.5rem)]">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {/* Leaving with a conflict unanswered would drop one side without anybody choosing it. */}
        <Button type="button" size="container" variant="outline" className="whitespace-nowrap" disabled={busy || doc.conflict} onClick={() => void done()}>
          Done
        </Button>
        <div role="tablist" className="flex gap-1 @2xl/container:hidden">
          {(['source', 'preview'] as const).map((one) => (
            <button
              key={one}
              type="button"
              role="tab"
              aria-selected={tab === one}
              data-tab={one}
              onClick={() => setTab(one)}
              className={
                tab === one
                  ? 'rounded bg-accent px-1.5 py-0.5 text-[0.65rem] font-medium whitespace-nowrap text-accent-foreground'
                  : 'rounded px-1.5 py-0.5 text-[0.65rem] whitespace-nowrap text-muted-foreground hover:bg-accent/50'
              }
            >
              {one === 'source' ? 'Source' : 'Preview'}
            </button>
          ))}
        </div>
        <span data-save={doc.state} role="status" className="min-w-0 flex-1 text-[0.65rem] text-muted-foreground [overflow-wrap:anywhere]" title={file ?? undefined}>
          {said}
        </span>
        <Button type="button" size="container" variant="ghost" className="whitespace-nowrap" aria-expanded={entries !== null} disabled={busy || doc.text === null} onClick={() => void history()}>
          History
        </Button>
      </div>

      {doc.conflict ? (
        <div role="alert" data-conflict="open" className="flex min-w-0 flex-wrap items-center gap-1 rounded border border-wrong/40 bg-wrong/5 px-2 py-1 text-[0.7rem] leading-4">
          <span className="min-w-0 basis-full">These questions changed on disk before your edits were saved. Which one stays?</span>
          <Button type="button" size="container" variant="outline" className="whitespace-nowrap" onClick={() => void act(doc.theirs)}>
            Take what is on disk
          </Button>
          <Button type="button" size="container" variant="ghost" className="whitespace-nowrap" onClick={() => void act(doc.mine)}>
            Keep mine
          </Button>
        </div>
      ) : null}

      {trouble ? <p className="rounded border border-wrong/40 bg-wrong/5 px-2 py-1 text-[0.7rem] leading-4 text-wrong">{trouble}</p> : null}

      {entries ? (
        <div data-history="open" className="max-h-[40%] min-w-0 shrink-0 overflow-y-auto rounded border px-2 py-1">
          <p className="text-[0.65rem] leading-4 text-muted-foreground">
            Every write to this file, newest first. Undo puts back what was there before one.
          </p>
          {entries.length === 0 ? <p className="text-[0.7rem] leading-4 text-muted-foreground">Nothing has been written yet.</p> : null}
          <ul className="divide-y">
            {entries.map((entry) => (
              <li key={entry.id} className="flex min-w-0 items-start gap-2 py-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.7rem] leading-4 [overflow-wrap:anywhere]">{entry.summary}</p>
                  <p className="text-[0.6rem] leading-3 text-muted-foreground">
                    {entry.agent} · {when(entry.at)}
                  </p>
                </div>
                <Button type="button" size="container" variant="outline" className="shrink-0 whitespace-nowrap" disabled={busy} aria-label={`undo ${entry.summary}`} onClick={() => void undo(entry.id)}>
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {problems.length ? (
        <ul data-problems={problems.length} className="max-h-[25%] min-w-0 shrink-0 overflow-y-auto rounded border border-wrong/40 bg-wrong/5 px-2 py-1 text-[0.7rem] leading-4 text-wrong">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 gap-2">
        <div
          data-source="quiz"
          className={`${tab === 'source' ? 'block' : 'hidden'} min-h-0 min-w-0 flex-1 overflow-hidden rounded border bg-card focus-within:ring-1 focus-within:ring-ring @2xl/container:block`}
        >
          {doc.text === null ? null : <EditorPane value={doc.text} onChange={doc.edit} />}
        </div>
        <div data-preview="quiz" className={`${tab === 'preview' ? 'block' : 'hidden'} min-h-0 min-w-0 flex-1 overflow-y-auto @2xl/container:block`}>
          {quiz.questions.length === 0 ? (
            <p className="text-[0.7rem] leading-4 text-muted-foreground">
              No questions yet. A question is a <code>## </code> heading, its options a list under it with the correct one ticked{' '}
              <code>- [x]</code>, and its source a <code>[^1]</code> with a line under <code>Sources:</code>.
            </p>
          ) : null}
          <ol className="flex min-w-0 flex-col gap-1.5">
            {quiz.questions.map((question) => {
              const source = question.label === null ? null : found.get(question.label)
              return (
                <li key={question.id} data-preview-question={question.id} className="min-w-0 rounded border bg-card p-2">
                  <p className="text-[0.78rem] leading-5 font-medium [overflow-wrap:anywhere]">{question.question}</p>
                  <ul className="mt-1 flex min-w-0 flex-col gap-0.5">
                    {question.options.map((option, index) => (
                      <li
                        key={index}
                        className={
                          question.correct.includes(index)
                            ? 'rounded border border-right bg-right/15 px-2 py-0.5 text-xs [overflow-wrap:anywhere]'
                            : 'rounded border px-2 py-0.5 text-xs [overflow-wrap:anywhere]'
                        }
                      >
                        {option}
                      </li>
                    ))}
                  </ul>
                  {question.why ? (
                    <p className="mt-1.5 border-l-2 border-border pl-2 text-[0.7rem] leading-4 whitespace-pre-line text-muted-foreground">{question.why}</p>
                  ) : null}
                  {/* As the server last found it, so a source typed a moment ago says nothing until the save it rode in on answers. */}
                  {source ? (
                    <p data-status={source.status} className={`mt-1.5 text-[0.65rem] leading-4 [overflow-wrap:anywhere] ${source.at ? 'text-muted-foreground' : 'text-wrong'}`}>
                      [^{source.label}] {source.path}
                      {source.at
                        ? `, ${linesOf(source.at)}`
                        : source.status === 'adrift'
                          ? ' — these words are not in it'
                          : ' — not a file in this project'}
                      {source.status === 'ambiguous' ? ` — these words occur ${source.count} times; quote more` : ''}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}

function when(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
