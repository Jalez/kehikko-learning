import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AskFailed, resetServerStanding } from 'kehikot-module-protocol/client'

import type { Attachment, Files, QuizChange, QuizFile } from '../src/store/ask.ts'
import type { EditorProps } from '../src/view/markdown-editor.tsx'
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

/** CodeMirror stands in as a textarea: same props. */
function FakeEditor({ value, onChange, reveal }: EditorProps) {
  return <textarea aria-label="the questions, as Markdown" data-reveal={reveal ?? ''} value={value} onChange={(event) => onChange(event.target.value)} />
}

/** The routes, as a file held in memory. `disk` can be moved under the editor, and `announce` is the watch saying so. */
function fake(text = TEXT) {
  const state = {
    disk: text,
    version: 1,
    calls: [] as string[],
    saves: [] as { text: string; base: string | null; session: string }[],
    undone: [] as string[],
    listeners: new Set<(change: QuizChange) => void>(),
    /** Set to hold every save until it is called. */
    gate: null as Promise<void> | null,
    fail: null as string | null,
    /** Set, every save is refused the way a server that restarted under the page refuses one. */
    restarted: false,
    /** The watch's own line, for a test to drop and bring back. */
    line: null as ((attachment: Attachment) => void) | null,
  }
  const announce = (version = `v${state.version}`) => act(async () => state.listeners.forEach((listener) => listener({ epic: 'thesis', version })))
  /** Somebody else wrote the file, and the watch said so. */
  const write = (next: string) => {
    state.disk = next
    state.version += 1
    return announce()
  }
  const file = (): QuizFile => ({ text: state.disk, version: `v${state.version}`, sources: [SOURCE] })
  const files: Files = {
    async read() {
      state.calls.push('read')
      return file()
    },
    async save(_project, _epic, sent, base, session) {
      state.calls.push('save')
      state.saves.push({ text: sent, base, session })
      if (state.gate) await state.gate
      if (state.fail) throw new Error(state.fail)
      if (state.restarted) throw new AskFailed({ kind: 'stale', status: 403, error: 'This page is older than its server — reloading…', body: null })
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
    watch(_project, onChange, onAttachment) {
      state.listeners.add(onChange)
      state.line = onAttachment ?? null
      return () => state.listeners.delete(onChange)
    },
  }
  return { state, files, announce, write }
}

const open = async (files: Files, onDone = () => {}) => {
  const view = render(<QuizEditor files={files} project="/p" epic="thesis" file=".kehikot/learning/thesis.md" onDone={onDone} saveDelay={0} editor={FakeEditor} />)
  await waitFor(() => expect(view.container.querySelector('textarea')).toBeTruthy())
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

  test('pressed on a question, the file opens on that question; pressed elsewhere, at the top', async () => {
    const two = `# About this quiz\n\n${TEXT}\n## A second one\n<!-- id: q2 -->\n- [x] yes\n- [ ] no\n`
    const onSecond = render(
      <QuizEditor files={fake(two).files} project="/p" epic="thesis" file={null} onDone={() => {}} saveDelay={0} at={{ id: 'q2', question: 'A second one' }} editor={FakeEditor} />,
    )
    await waitFor(() => expect(onSecond.container.querySelector('textarea')).toBeTruthy())
    expect(onSecond.container.querySelector('textarea')!.getAttribute('data-reveal')).toBe(String(two.indexOf('## A second one')))
    cleanup()
    const plain = await open(fake(two).files)
    expect(plain.area.getAttribute('data-reveal')).toBe('')
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

/** Open with a save delay nothing in a test outlasts: only Done, or leaving, writes. */
const later = async (files: Files, onDone = () => {}) => {
  const view = render(<QuizEditor files={files} project="/p" epic="thesis" file={null} onDone={onDone} saveDelay={60_000} editor={FakeEditor} />)
  await waitFor(() => expect(view.container.querySelector('textarea')).toBeTruthy())
  return { ...view, area: view.container.querySelector('textarea') as HTMLTextAreaElement }
}

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
    const { area } = await later(files, () => (left += 1))
    type(area, 'typed and not yet saved\n')
    expect(state.saves).toHaveLength(0)
    await act(async () => fireEvent.click(screen.getByText('Done')))
    await waitFor(() => expect(left).toBe(1))
    expect(state.disk).toBe('typed and not yet saved\n')
  })
})

describe('leaving with a save pending', () => {
  test('Done waits for a save already on its way, and for what was typed during it', async () => {
    const { state, files } = fake()
    let left = 0
    let release = () => {}
    const { area } = await open(files, () => (left += 1))
    state.gate = new Promise<void>((resolve) => (release = resolve))
    type(area, 'first\n')
    await waitFor(() => expect(state.saves).toHaveLength(1))
    type(area, 'first, and more typed while it was being saved\n')
    await act(async () => fireEvent.click(screen.getByText('Done')))
    expect(left).toBe(0)
    state.gate = null
    await act(async () => release())
    await waitFor(() => expect(left).toBe(1))
    expect(state.disk).toBe('first, and more typed while it was being saved\n')
    expect(state.saves.map((one) => one.base)).toEqual(['v1', 'v2'])
  })

  test('Done does not leave on a save that failed, says so, and leaves on a second press', async () => {
    const { state, files } = fake()
    let left = 0
    const { area, container } = await later(files, () => (left += 1))
    state.fail = 'the disk is full'
    type(area, 'typed, and it cannot be written\n')
    await act(async () => fireEvent.click(screen.getByText('Done')))
    expect(left).toBe(0)
    expect(container.textContent).toContain('Press Done again to leave without it')
    expect(container.querySelector('[data-save]')?.textContent).toContain('the disk is full')
    await act(async () => fireEvent.click(screen.getByText('Done')))
    expect(left).toBe(1)
    expect(state.disk).toBe(TEXT)
  })

  test('the editor taken away with words unsaved writes them on the way out', async () => {
    const { state, files } = fake()
    const { area, unmount } = await later(files)
    type(area, 'typed, and then the paper was left\n')
    unmount()
    await waitFor(() => expect(state.disk).toBe('typed, and then the paper was left\n'))
    expect(state.listeners.size).toBe(0)
  })

  test('the page going away sends what is waiting without being asked', async () => {
    const { state, files } = fake()
    const { area } = await later(files)
    type(area, 'typed, and then the container was closed\n')
    window.dispatchEvent(new Event('pagehide'))
    await waitFor(() => expect(state.disk).toBe('typed, and then the container was closed\n'))
  })
})

describe('the file changed on disk while the editor was open', () => {
  test('with nothing typed since the last save, the editor takes what is on disk', async () => {
    const { state, files, write } = fake()
    const { area, container } = await open(files)
    await write('what an agent wrote meanwhile\n')
    await waitFor(() => expect(area.value).toBe('what an agent wrote meanwhile\n'))
    expect(container.querySelector('[data-conflict]')).toBeNull()
    expect(state.saves).toHaveLength(0)
    /* And it is the base of the next save, which is therefore not refused. */
    type(area, 'what an agent wrote meanwhile, and I added\n')
    await saved(container)
    expect(state.saves.at(-1)?.base).toBe('v2')
    expect(state.disk).toBe('what an agent wrote meanwhile, and I added\n')
  })

  test('with something typed and unsaved, nothing is taken or written: the person is asked which stays', async () => {
    const { state, files, write } = fake()
    const { area, container } = await later(files)
    type(area, 'what I typed\n')
    await write('what an agent wrote meanwhile\n')
    expect(container.querySelector('[data-conflict]')?.textContent).toContain('Which one stays?')
    expect(area.value).toBe('what I typed\n')
    expect(state.saves).toHaveLength(0)
    expect(state.disk).toBe('what an agent wrote meanwhile\n')
    await act(async () => fireEvent.click(screen.getByText('Keep mine')))
    await saved(container)
    expect(state.disk).toBe('what I typed\n')
    expect(state.saves.at(-1)?.base).toBe('v2')
  })

  test('and “Take what is on disk” answers it the other way', async () => {
    const { files, write } = fake()
    const { area, container } = await later(files)
    type(area, 'what I typed\n')
    await write('what an agent wrote meanwhile\n')
    await act(async () => fireEvent.click(screen.getByText('Take what is on disk')))
    await waitFor(() => expect(area.value).toBe('what an agent wrote meanwhile\n'))
    expect(container.querySelector('[data-conflict]')).toBeNull()
  })

  test('its own save, announced back, is not a change: nothing is read again', async () => {
    const { state, files, announce } = fake()
    const { area, container } = await open(files)
    type(area, 'what I typed\n')
    await saved(container)
    await announce()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.calls.filter((one) => one === 'read')).toHaveLength(1)
    expect(area.value).toBe('what I typed\n')
  })

  test('an announcement that arrives before the save it is about has answered waits for it', async () => {
    const { state, files, announce } = fake()
    let release = () => {}
    const { area, container } = await open(files)
    state.gate = new Promise<void>((resolve) => (release = resolve))
    type(area, 'what I typed\n')
    await waitFor(() => expect(state.saves).toHaveLength(1))
    await announce('v2')
    state.gate = null
    await act(async () => release())
    await saved(container)
    expect(container.querySelector('[data-conflict]')).toBeNull()
    expect(state.calls.filter((one) => one === 'read')).toHaveLength(1)
  })
})

describe('a save refused because the file moved', () => {
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

describe('the watch on the disk, said out loud', () => {
  test('nothing is said while the line is open, or on a first load that has not opened it yet', async () => {
    const { state, files } = fake()
    const { container } = await open(files)
    expect(container.querySelector('[data-watch]')).toBeNull()
    await act(async () => state.line?.('connecting'))
    await act(async () => state.line?.('attached'))
    expect(container.querySelector('[data-watch]')).toBeNull()
  })

  test('a dropped line is said, and when it is back the file is read again — a change may have gone unheard', async () => {
    const { state, files } = fake()
    const { area, container } = await open(files)
    await act(async () => state.line?.('attached'))
    await act(async () => state.line?.('detached'))
    expect(container.querySelector('[data-watch="detached"]')?.textContent).toContain('not hearing changes on disk')
    /* Somebody wrote the file while nothing was listening. */
    state.disk = 'written while the line was down\n'
    state.version += 1
    await act(async () => state.line?.('connecting'))
    await act(async () => state.line?.('attached'))
    await waitFor(() => expect(area.value).toBe('written while the line was down\n'))
    expect(container.querySelector('[data-watch]')).toBeNull()
  })

  test('back with something typed and unsaved, the text is left alone: the save decides', async () => {
    const { state, files } = fake()
    const { area } = await open(files)
    state.fail = 'This app’s own server is not answering.'
    await act(async () => state.line?.('detached'))
    type(area, 'typed while the server was away\n')
    await waitFor(() => expect(state.saves.length).toBeGreaterThan(0))
    const reads = state.calls.filter((call) => call === 'read').length
    await act(async () => state.line?.('attached'))
    expect(state.calls.filter((call) => call === 'read').length).toBe(reads)
    expect(area.value).toBe('typed while the server was away\n')
  })
})

describe('words that are not saved, and a server that is not there', () => {
  afterEach(() => resetServerStanding())

  test('the page is told whether there are any, and told there are none on the way out', async () => {
    const { state, files } = fake()
    const said: boolean[] = []
    const view = render(<QuizEditor files={files} project="/p" epic="thesis" file={null} onDone={() => {}} saveDelay={0} editor={FakeEditor} onUnsaved={(unsaved) => said.push(unsaved)} />)
    await waitFor(() => expect(view.container.querySelector('textarea')).toBeTruthy())
    expect(said.at(-1)).toBe(false)
    state.fail = 'This app’s own server is not answering.'
    type(view.container.querySelector('textarea') as HTMLTextAreaElement, 'not on disk\n')
    await waitFor(() => expect(said.at(-1)).toBe(true))
    state.fail = null
    await saved(view.container)
    expect(said.at(-1)).toBe(false)
    view.unmount()
    expect(said.at(-1)).toBe(false)
  })

  test('a save refused because the page is older than its server is not retried, and the editor says what to do', async () => {
    const { state, files } = fake()
    const { area, container } = await open(files)
    state.restarted = true
    type(area, 'typed after the server restarted\n')
    await waitFor(() => expect(container.querySelector('[data-outdated]')).toBeTruthy())
    expect(container.querySelector('[data-outdated]')?.textContent).toContain('This page is older than its server, so it cannot save what you typed.')
    expect(container.querySelector('[data-save]')?.textContent).toContain('not saved: this page is older than its server')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    /* The words are still there, and the page is not hammering a door that will never open. */
    expect(area.value).toBe('typed after the server restarted\n')
    const sent = state.saves.length
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 60))))
    expect(state.saves.length).toBe(sent)
    type(area, 'and typed some more\n')
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 60))))
    expect(state.saves.length).toBe(sent)
    expect(area.value).toBe('and typed some more\n')
  })

  test('a save that merely failed IS retried, and goes through when something answers', async () => {
    const { state, files } = fake()
    const { area, container } = await open(files)
    state.fail = 'This app’s own server is not answering.'
    type(area, 'kept through an outage\n')
    await waitFor(() => expect(container.querySelector('[data-save]')?.textContent).toContain('not saved: This app’s own server is not answering.'))
    expect(container.querySelector('[data-outdated]')).toBeNull()
    /* The fake does not move the page's standing; the real `ask()` does — see the next test. */
    expect(container.querySelector('[data-away]')).toBeNull()
    state.fail = null
    await saved(container)
    expect(state.disk).toBe('kept through an outage\n')
  })
})

describe('while this app’s own server is away', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    resetServerStanding()
  })

  test('unsaved words are said to be at risk, while there is still time to copy them', async () => {
    const { ask } = await import('kehikot-module-protocol/client')
    const { state, files } = fake()
    const { area, container } = await open(files)
    expect(container.querySelector('[data-away]')).toBeNull()
    state.fail = 'This app’s own server is not answering.'
    globalThis.fetch = (async () => {
      throw new TypeError('Load failed')
    }) as unknown as typeof fetch
    await act(async () => void (await ask('/api/questions')))
    /* Nothing typed: nothing to lose, nothing said here (the page draws its cover instead). */
    expect(container.querySelector('[data-away]')).toBeNull()
    type(area, 'only here\n')
    await waitFor(() => expect(container.querySelector('[data-away]')?.textContent).toContain('Copy it now'))
    expect(area.value).toBe('only here\n')
  })
})
