import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { proposalsFooter } from 'kehikot-module-protocol/client/proposals'

import { editorFooter, quizFooter, quizHeader } from '../src/view/footer.ts'
import { headerOf } from '../src/view/header.ts'

/**
 * The rows this page declares, for `kehikot-check-rows` (protocol 2.70.0): `kehikot.rows.json` is
 * written from the real `quizHeader`/`quizFooter` (with the proposals' footer, as `app.tsx` joins
 * them) and the editor's `headerOf`/`editorFooter`, one state per moment worth checking, by
 * `bun run rows`; `test/rows.test.ts` fails when the file is not what they make now.
 */

const quiz = { asked: 8, answered: 3, right: 2, epic: 'every-epic-aims-at-a-paper', file: '.kehikot/learning/every-epic-aims-at-a-paper/questions.md', trouble: null }

export function rows() {
  return [
    {
      name: 'the questions, one part in front',
      state: true,
      header: quizHeader({ parts: ['question', 'options', 'why'], part: 'options', answered: true, busy: false }),
      footer: [...quizFooter({ ...quiz, at: 2 }), ...proposalsFooter({ open: 0 })],
    },
    {
      name: 'the list, with proposed changes waiting',
      state: true,
      header: quizHeader({ parts: [], part: 'question', answered: false, busy: false }),
      footer: [...quizFooter({ ...quiz, answered: 0, right: 0, at: null }), ...proposalsFooter({ open: 2 })],
    },
    {
      name: 'the editor, narrow',
      state: true,
      header: headerOf({ pane: 'source', history: false, busy: false, conflict: false, failed: false, reading: false, footed: true }),
      footer: editorFooter({ said: 'saved', bad: false, detached: false, file: quiz.file }),
    },
    {
      name: 'the editor, a save failed',
      state: true,
      header: headerOf({ pane: null, history: true, busy: false, conflict: false, failed: true, reading: false, footed: true }),
      footer: editorFooter({ said: 'not saved: the disk is full', bad: true, detached: true, file: quiz.file }),
    },
  ]
}

export const ROWS_PATH = join(import.meta.dir, '..', 'kehikot.rows.json')
export const rowsText = () => `${JSON.stringify(rows(), null, 2)}\n`

if (import.meta.main) writeFileSync(ROWS_PATH, rowsText())
