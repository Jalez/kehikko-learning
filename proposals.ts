import type { ProposalDoorOptions, ProposalSite } from 'kehikot-module-protocol/proposals'
import { fileKeeper } from 'kehikot-module-protocol/proposals/store'

import { ID } from './manifest.ts'
import { poke } from './quiz/live.ts'
import { changed, folderOf } from './quiz/news.ts'
import { readQuiz, writeProposed } from './quiz/questions.ts'

/**
 * Proposed changes to an epic's questions: an agent proposes, the person accepts
 * or declines at the page (protocol 2.71.0, `kehikot-module-protocol/proposals`).
 * The book is `<project>/.kehikot/learning/proposals/all.json`; the text is the
 * epic's quiz file, read whole (the key included — a proposal is drawn only on
 * this app's own page, behind its ticket, like the editor), and an accepted
 * proposal is written through the undo trail, so Undo takes it back.
 */
export const PROPOSALS: ProposalDoorOptions = {
  what: 'the questions of an epic',
  file: { name: 'epic', description: 'The epic whose questions it is about, as quizzes lists them.' },
  module: ID,
}

export const SITE: ProposalSite = {
  keeper: fileKeeper(ID),
  text(project, epic) {
    const read = readQuiz(project, epic)
    return 'file' in read && read.file.version !== null ? read.file.text : null
  },
  write(project, epic, text, proposal) {
    const wrote = writeProposed(project, epic, text, `accepted a proposal by ${proposal.by.name}: ${proposal.why}`)
    if (wrote) return { ok: false, why: wrote }
    poke(project)
    return { ok: true }
  },
  /* A page open on the project is told the questions changed, so it reads the proposals again: it never asks on a clock. */
  onChanged(project) {
    changed(folderOf(project))
  },
}
