import { LIMITS, type HeaderItemInput } from 'kehikot-module-protocol'

/**
 * What the open quiz editor declares for the container's header (`kehikot.header`).
 *
 * The host draws these as its View and Run menus in the row the container already has, so the
 * editor spends no row of its own on Source / Preview, Done, History or the save status: none is
 * drawn in the page. (The page keeps its alerts: a failed save, a conflict, a server that is away.)
 *
 * A pure function of what the editor knows that is not typed text. A keystroke moves the save
 * through unsaved, saving and saved, and none of those is in this list — only a save that FAILED
 * is — so typing, and an idle editor, declare nothing. The page declares again only when the
 * list's JSON differs (`editor.tsx`).
 *
 * Ids are the item's own: `pane`, `done`, `history`.
 */
export interface HeaderState {
  /** Which pane is in front when only one fits; null where both are side by side and there is nothing to switch. */
  pane: 'source' | 'preview' | null
  /** The history list is open. */
  history: boolean
  /** Something is being done by a press (leaving, reading history, undoing). */
  busy: boolean
  /** The file changed on disk under unsaved words: a choice stands in the page, and leaving is refused until it is made. */
  conflict: boolean
  /** The last save failed (or the file could not be read). */
  failed: boolean
  /** The text has not been read yet. */
  reading: boolean
}

export function headerOf(state: HeaderState): HeaderItemInput[] {
  const items: HeaderItemInput[] = []
  if (state.pane) {
    items.push({
      kind: 'switch',
      id: 'pane',
      label: 'Pane',
      icon: 'columns-2',
      value: state.pane,
      options: [
        { id: 'source', label: 'Source' },
        { id: 'preview', label: 'Preview' },
      ],
    })
  }
  items.push({
    kind: 'run',
    id: 'done',
    label: 'Done',
    icon: 'check',
    state: state.failed ? 'failed' : 'idle',
    ...(state.failed ? { result: 'not saved' } : {}),
    /* Leaving with a conflict unanswered would drop one side without anybody choosing it. */
    ...(state.conflict ? { disabled: 'These questions changed on disk: choose which version stays first.' } : state.busy ? { disabled: 'Something is being done just now.' } : {}),
  })
  items.push({
    kind: 'run',
    id: 'history',
    label: state.history ? 'Hide history' : 'History',
    icon: 'history',
    ...(state.reading ? { disabled: 'The questions have not been read yet.' } : state.busy ? { disabled: 'Something is being done just now.' } : {}),
  })
  return items.map((item) => (item.label.length > LIMITS.HEADER_LABEL ? { ...item, label: item.label.slice(0, LIMITS.HEADER_LABEL) } : item))
}
