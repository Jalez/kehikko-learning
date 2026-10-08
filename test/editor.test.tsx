import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Files, QuizFile } from '../src/store/ask.ts'
import { QuizEditor } from '../src/view/editor.tsx'
import { QuizView } from '../src/view/quiz.tsx'
import { room } from '../src/view/room.ts'

/**
 * The editor, rendered for real against a fake of the file's routes: when the
 * file is asked for, what a keystroke saves, and what happens when the file
 * moved under the person typing.
 */

afterEach(cleanup)

const TEXT = '## Which half does a host read? [^1]\n<!-- id: q1 -->\n- [ ] the page\n- [x] the manifest\n\nWhy:\nIt is the only half it reads.\n\nSources:\n[^1]: chapters/bridge.tex | "the only half a host reads"\n'
const SOURCE = { label: '1', path: 'chapters/bridge.tex', quote: 'the only half a host reads', status: 'holds' as const, at: { from: 0, to: 26, line: 4, endLine: 4 }, count: 1 }

/** The routes, as a file held in memory. `disk` can be moved under the editor. */
function fake(text = TEXT) {
  const state = { disk: text, version: 1, calls: [] as string[], saves: [] as { text: string; base: string | null; session: string }[], undone: [] as string[] }
  const file = (): QuizFile => ({ text: state.disk, version: `v${state.version}`, sources: [SOURCE] })
  const files: Files = {
    async read() {
      state.calls.push('read')
      return file()
    },
    async save(_project, _epic, sent, base, session) {
      state.calls.push('save')
      state.saves.push({ text: sent, base, session })
      if (base !== `v${state.version}`) return { ok: false, theirs: file() }
      state.disk = sent
      state.version += 1
      return { ok: true, file: file() }
    },
    async history() {
      state.calls.push('history')
      return [{ id: 'e1', epic: 'thesis', at: '2026-10-08T10:00:00.000Z', agent: 'claude', summary: 'Question q1 reworded' }]
    },
    async undo(_project, _epic, id) {
      state.undone.push(id)
      state.disk = 'the file as it was before\n'
      state.version += 1
      return file()
    },
  }
  return { state, files }
}

const open = async (files: Files, onDone = () => {}) => {
  const view = render(<QuizEditor files={files} project="/p" epic="thesis" file=".kehikot/learning/thesis.md" onDone={onDone} saveDelay={0} />)
  await waitFor(() => expect((view.container.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(false))
  return { ...view, area: view.container.querySelector('textarea') as HTMLTextAreaElement }
}
const type = (area: HTMLTextAreaElement, value: string) => fireEvent.change(area, { target: { value } })
const saved = (container: HTMLElement) => waitFor(() => expect(container.querySelector('[data-save]')?.getAttribute('data-save')).toBe('saved'))

describe('the press that opens it', () => {
  test('the answering view asks for no file: it only offers the press', () => {
    const { state } = fake()
    let pressed = 0
    const { container } = render(
      <QuizView epic="thesis" file=".kehikot/learning/thesis.md" onEdit={() => (pressed += 1)} questions={[]} onAnswer={() => {}} onPoint={() => {}} pointed={null} onRetake={() => {}} trouble={null} busy={false} room={room({ width: 460, height: 420 })} />,
    )
    expect(state.calls).toEqual([])
    fireEvent.click(container.querySelector('[data-edit]')!)
    expect(pressed).toBe(1)
  })

  test('mounted, the editor reads the file once and shows it whole — the tick included', async () => {
    const { state, files } = fake()
    const { area, container } = await open(files)
    expect(state.calls).toEqual(['read'])
    expect(area.value).toBe(TEXT)
    expect(container.querySelector('[data-preview-question="q1"]')?.textContent).toContain('the manifest')
    expect(container.querySelector('[data-status="holds"]')?.textContent).toContain('chapters/bridge.tex, line 4')
  })
})

describe('typing', () => {
  test('saves what was typed, against the version last seen, as one sitting', async () => {
    const { state, files } = fake()
    const { area, container } = await open(files)
    type(area, `${TEXT}\n## A second`)
    await saved(container)
    type(area, `${TEXT}\n## A second question`)
    await saved(container)
    expect(state.disk).toBe(`${TEXT}\n## A second question`)
    expect(state.saves.map((one) => one.base)).toEqual(['v1', 'v2'])
    expect(new Set(state.saves.map((one) => one.session)).size).toBe(1)
    expect(state.saves[0]?.session).toBeTruthy()
  })

  test('something wrong is saved as typed, and said beside the editor in the sentences the tools use', async () => {
    const { state, files } = fake()
    const { area, container } = await open(files)
    expect(container.querySelector('[data-problems]')).toBeNull()
    type(area, TEXT.replace('- [x] the manifest', '- the manifest'))
    await saved(container)
    expect(state.disk).toContain('- the manifest')
    expect(container.querySelector('[data-problems]')?.textContent).toContain('has no option ticked, so it is not asked')
  })

  test('Done saves what is still waiting before it leaves', async () => {
    const { state, files } = fake()
    let left = 0
    const view = render(<QuizEditor files={files} project="/p" epic="thesis" file={null} onDone={() => (left += 1)} saveDelay={60_000} />)
    const area = view.container.querySelector('textarea') as HTMLTextAreaElement
    await waitFor(() => expect(area.disabled).toBe(false))
    type(area, 'typed and not yet saved\n')
    expect(state.saves).toHaveLength(0)
    await act(async () => fireEvent.click(screen.getByText('Done')))
    await waitFor(() => expect(left).toBe(1))
    expect(state.disk).toBe('typed and not yet saved\n')
  })
})

describe('the file moved on disk under the editor', () => {
  const moved = async () => {
    const made = fake()
    const view = await open(made.files)
    made.state.disk = 'what an agent wrote meanwhile\n'
    made.state.version += 1
    type(view.area, 'what I typed\n')
    await waitFor(() => expect(view.container.querySelector('[data-conflict]')).toBeTruthy())
    return { ...made, ...view }
  }

  test('nothing is written over it, saving stops, and the person is asked which stays', async () => {
    const { state, area, container } = await moved()
    expect(state.disk).toBe('what an agent wrote meanwhile\n')
    expect(container.querySelector('[data-conflict]')?.textContent).toContain('Which one stays?')
    const before = state.saves.length
    type(area, 'what I typed, and more\n')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.saves).toHaveLength(before)
    expect((screen.getByText('Done') as HTMLButtonElement).disabled).toBe(true)
  })

  test('“Take what is on disk” drops the edits', async () => {
    const { state, area, container } = await moved()
    fireEvent.click(screen.getByText('Take what is on disk'))
    await waitFor(() => expect(area.value).toBe('what an agent wrote meanwhile\n'))
    expect(container.querySelector('[data-conflict]')).toBeNull()
    expect(state.disk).toBe('what an agent wrote meanwhile\n')
  })

  test('“Keep mine” writes them, against the version that is there now', async () => {
    const { state, container } = await moved()
    await act(async () => fireEvent.click(screen.getByText('Keep mine')))
    await saved(container)
    expect(state.disk).toBe('what I typed\n')
    expect(state.saves.at(-1)?.base).toBe('v2')
  })
})

describe('the history', () => {
  test('is asked for only when opened, and an undo puts the file it answers with in the editor', async () => {
    const { state, files } = fake()
    const { area, container } = await open(files)
    expect(state.calls).not.toContain('history')
    await act(async () => fireEvent.click(screen.getByText('History')))
    await waitFor(() => expect(container.querySelector('[data-history]')?.textContent).toContain('Question q1 reworded'))
    await act(async () => fireEvent.click(screen.getByLabelText('undo Question q1 reworded')))
    await waitFor(() => expect(area.value).toBe('the file as it was before\n'))
    expect(state.undone).toEqual(['e1'])
  })
})
