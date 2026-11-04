import { LIMITS, type FooterItemInput, type HeaderItemInput } from 'kehikot-module-protocol'

import { PART_LABEL, type Part } from './room.ts'

/**
 * What this page declares for the container's footer (`kehikot.footer`, protocol 2.38.0), and,
 * beside it, what the questions declare for the header.
 *
 * The rule the two rows follow: the header is how the module is set up — which part of a question
 * is in front, asking the questions again, opening them in the editor — and the footer is what is
 * going on now: which question of how many, with the way to the one before and after beside it,
 * the score, and what went wrong. Folded to two rows, a container shows its header and this
 * footer, so the score and the place in the questions are what a person reads there.
 *
 * Declared only when the host says it draws a footer (`drawsFooter === true`). With any other host
 * nothing is declared, the questions declare no header of their own, and the page draws its row of
 * controls under the card exactly as before. Pure, so what is declared is what is tested.
 */

/** One line cut to fit with an ellipsis. */
export function clip(text: string, most: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= most ? one : `${one.slice(0, most - 1)}…`
}

/** The ids of what can be pressed in the questions' footer and header. */
export const FOOT = { BACK: 'back', NEXT: 'next' } as const
export const HEAD = { PART: 'part', RETAKE: 'retake', EDIT: 'edit' } as const

export interface QuizFooterState {
  /** How many questions are shown, answered, and answered right the last time. */
  asked: number
  answered: number
  right: number
  /** The question in front, counting from 0, at the rungs that show one at a time; null where every card is in a list. */
  at: number | null
  /** The open epic, and the file its questions are kept in, for the score's tooltip. */
  epic: string
  file: string | null
  /** The last thing that went wrong, said in words, or null. */
  trouble: string | null
}

/** The score as the page has always said it: all three numbers, never a percentage. */
export const scoreSaid = (state: Pick<QuizFooterState, 'asked' | 'answered' | 'right'>) => `${state.asked} asked · ${state.answered} answered · ${state.right} right`

/** The questions' footer: what went wrong, which question of how many with Back and Next beside it, and the score. */
export function quizFooter(state: QuizFooterState): FooterItemInput[] {
  const items: FooterItemInput[] = []
  if (state.trouble) {
    items.push({ kind: 'text', id: 'trouble', text: clip(state.trouble, LIMITS.FOOTER_TEXT), level: 'critical', tooltip: clip(state.trouble, LIMITS.FOOTER_TOOLTIP) })
  }
  if (!state.asked) return items
  if (state.at !== null && state.asked > 1) {
    const at = Math.min(Math.max(state.at, 0), state.asked - 1)
    items.push({ kind: 'run', id: FOOT.BACK, label: 'The question before', icon: 'chevron-left', disabled: at === 0 ? 'This is the first question.' : null })
    items.push({ kind: 'text', id: 'position', text: `${at + 1} / ${state.asked}` })
    items.push({ kind: 'run', id: FOOT.NEXT, label: 'The question after', icon: 'chevron-right', disabled: at === state.asked - 1 ? 'This is the last question.' : null })
  }
  const score = scoreSaid(state)
  items.push({
    kind: 'text',
    id: 'score',
    text: score,
    align: 'end',
    tooltip: clip(`${state.epic} — ${score}${state.file ? ` — edit these in ${state.file}` : ''}`, LIMITS.FOOTER_TOOLTIP),
  })
  return items
}

export interface QuizHeaderState {
  /** The parts the question in front can switch between, and the one in front; empty where there is nothing to switch. */
  parts: Part[]
  part: Part
  /** Something has been answered, so there is something to ask again. */
  answered: boolean
  /** A press is being carried out. */
  busy: boolean
}

/** The questions' header, with a host that draws the footer: which part is in front, Ask again, and Edit. */
export function quizHeader(state: QuizHeaderState): HeaderItemInput[] {
  const items: HeaderItemInput[] = []
  if (state.parts.length > 1) {
    items.push({
      kind: 'switch',
      id: HEAD.PART,
      label: 'Part',
      /* A view switch: which part is in front changes nothing a person kept, so an agent may press it. */
      agents: true,
      value: state.parts.includes(state.part) ? state.part : state.parts[0]!,
      options: state.parts.map((one) => ({ id: one, label: PART_LABEL[one] })),
    })
  }
  if (state.answered) {
    /* Forgets what was answered for this paper, so it is the person's press alone. */
    items.push({ kind: 'run', id: HEAD.RETAKE, label: 'Ask again', icon: 'refresh', ...(state.busy ? { disabled: 'Something is being done just now.' } : {}) })
  }
  /* Opens the file, which holds the answers: the person's press alone. */
  items.push({ kind: 'run', id: HEAD.EDIT, label: 'Edit', icon: 'pencil' })
  return items
}

export interface EditorFooterState {
  /** The save, in the words the editor says it: `saved`, `saving…`, `not saved: …`. */
  said: string
  /** The save failed, or was refused by a change on disk. */
  bad: boolean
  /** Changes on disk are not being heard just now. */
  detached: boolean
  /** The file being edited, relative to the project, or null. */
  file: string | null
}

/** The editor's footer: whether what was typed is saved, whether changes on disk are heard, and which file. */
export function editorFooter(state: EditorFooterState): FooterItemInput[] {
  const items: FooterItemInput[] = []
  items.push({ kind: 'text', id: 'save', text: clip(state.said, LIMITS.FOOTER_TEXT), ...(state.bad ? { level: 'critical' as const } : {}), tooltip: clip(state.said, LIMITS.FOOTER_TOOLTIP) })
  if (state.detached) items.push({ kind: 'text', id: 'watch', text: 'not hearing changes on disk — reconnecting', level: 'warn' })
  if (state.file) items.push({ kind: 'text', id: 'file', text: clip(state.file, LIMITS.FOOTER_TEXT), align: 'end', optional: true, tooltip: clip(`Editing ${state.file}.`, LIMITS.FOOTER_TOOLTIP) })
  return items
}
