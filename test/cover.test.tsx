import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { TICKET, answerAt as door } from '../doors.ts'
import { App } from '../src/app.tsx'

/**
 * The whole page, rendered for real against the real doors with `fetch` as the only thing faked:
 * each not-ready moment as the one shared cover, what stays underneath it, and that the page asks
 * for nothing that carries the key until somebody presses Edit.
 */

const realFetch = globalThis.fetch
const EPIC = 'modes-are-modules'
const WHY = 'The manifest is the only half a host reads.'
let dir = ''
let down = false
/** Set, the doors are told every request carried this ticket: a server that restarted under the page. */
let restarted = false
let asked: string[] = []

beforeEach(() => {
  resetServerStanding()
  /* The mailbox replays what it kept to every new listener: an earlier test's greeting would greet this one. */
  mailbox.forget?.()
  down = false
  restarted = false
  asked = []
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'learning-cover-')))
  mkdirSync(join(dir, 'chapters'))
  writeFileSync(join(dir, 'chapters', 'bridge.tex'), 'So the manifest is the smallest half of this program, and the only half a host reads.')
  door('POST', '/mcp', new URLSearchParams(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'add_quiz',
      arguments: {
        project: dir,
        epic: EPIC,
        question: 'What does a manifest settle?',
        options: ['What colour the container is', 'Who owns the repository', 'Which tab the page gets'],
        answer: 2,
        why: WHY,
        path: 'chapters/bridge.tex',
        quote: 'the manifest is the smallest half of this program',
      },
    },
  }, null)
  const island = document.createElement('script')
  island.id = 'ticket'
  island.type = 'application/json'
  island.textContent = JSON.stringify(TICKET)
  document.body.appendChild(island)
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    if (down) throw new TypeError('Load failed')
    const at = new URL(String(url), 'http://127.0.0.1')
    const method = (init.method ?? 'GET').toUpperCase()
    asked.push(`${method} ${at.pathname}`)
    const ticket = (init.headers as Record<string, string> | undefined)?.['x-module-ticket'] ?? null
    const said = door(method, at.pathname, at.searchParams, init.body ? JSON.parse(String(init.body)) : null, restarted ? 'the-ticket-of-a-process-that-is-gone' : ticket)
    return new Response(JSON.stringify(said?.body ?? null), { status: said?.status ?? 404 })
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
  document.getElementById('ticket')?.remove()
  document.documentElement.className = ''
  rmSync(dir, { recursive: true, force: true })
})

const settle = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))))
const greet = async (context: Record<string, unknown>) => {
  await act(async () => {
    window.postMessage({ type: 'kehikot.hello', protocol: 2, session: 's', state: null, context: { epic: null, theme: 'dark', ...context } }, '*')
    await new Promise((resolve) => setTimeout(resolve, 40))
  })
}
const cover = () => document.querySelector('[data-cover]')
const here = () => ({ project: 'thesis', projectPath: dir, epic: EPIC })

describe('the host\'s cover (protocol 2.70.0)', () => {
  test('is held at the greeting and lifted once, when the questions are drawn, whether or not the page is visible', async () => {
    const said: string[] = []
    const hear = (event: MessageEvent) => {
      const type = (event.data as { type?: unknown } | null)?.type
      if (typeof type === 'string') said.push(type)
    }
    window.addEventListener('message', hear)
    try {
      render(<App />)
      await greet(here())
      /* The host hides the page it covers: drawn is said all the same. */
      await act(async () => void window.postMessage({ type: 'kehikot.visible', visible: false }, '*'))
      await waitFor(() => expect(screen.getAllByText('What does a manifest settle?').length).toBeGreaterThan(0))
      await waitFor(() => expect(said.filter((type) => type === 'kehikot.drawn')).toHaveLength(1))
      await settle(60)
      expect(said.filter((type) => type === 'kehikot.drawn')).toHaveLength(1)
    } finally {
      window.removeEventListener('message', hear)
    }
  })
})

describe('the not-ready moments, each as the one shared cover', () => {
  test('before anything has greeted the page it is waiting — never "no project" — and then unhosted', async () => {
    render(<App />)
    await settle(30)
    expect(cover()?.getAttribute('data-cover')).toBe('waiting')
    expect(document.body.textContent).not.toContain('No project')
    await settle(800)
    expect(cover()?.getAttribute('data-cover')).toBe('unhosted')
    expect(document.body.textContent).toContain('Nothing is framing this page — open Quiz in Kehikot.')
    /* Where the questions live, and NOT a picker: choosing here would be the page deciding where it stands. */
    expect(document.body.textContent).toContain('.kehikot/learning/')
    expect(within(cover() as HTMLElement).queryAllByRole('button')).toHaveLength(0)
    expect(asked).toEqual([])
  })

  test('hosted with a name and no folder: no project, the same line under it, the host’s theme on <html>', async () => {
    render(<App />)
    await greet({ project: 'thesis', projectPath: null })
    expect(cover()?.getAttribute('data-cover')).toBe('no-project')
    expect(document.body.textContent).toContain('will not guess')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    await greet({ project: 'thesis', projectPath: null, theme: 'light' })
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(asked).toEqual([])
  })

  test('greeted with a project and an epic: no cover, the question, and no key anywhere in the page', async () => {
    render(<App />)
    await greet(here())
    await waitFor(() => expect(screen.getAllByText('What does a manifest settle?').length).toBeGreaterThan(0))
    expect(cover()).toBeNull()
    expect(document.documentElement.innerHTML).not.toContain(WHY)
    expect(document.documentElement.innerHTML).not.toContain('[x]')
    /* Nothing but the questions route — and how many changes are proposed to them, a number — was asked: the file is the editor's, and nobody pressed Edit.
       (The questions' stream is served in-process here, and its server asks the HOST about the folder
       before watching it, through this same `fetch`; that is the server's, not the page's.) */
    expect(new Set(asked.filter((one) => !one.includes(' /host/')))).toEqual(new Set(['GET /api/questions', 'GET /api/proposals/count']))
  })

  test('its own server not answering says so — where a read used to die uncaught — and Try again asks again', async () => {
    render(<App />)
    await greet(here())
    await waitFor(() => expect(screen.getAllByText('What does a manifest settle?').length).toBeGreaterThan(0))
    down = true
    await act(async () => {
      window.postMessage({ type: 'kehikot.context', protocol: 2, theme: 'dark', ...here(), epic: 'another-epic' }, '*')
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(cover()?.getAttribute('data-cover')).toBe('down')
    expect(document.body.textContent).toContain('Quiz’s own server is not answering.')
    down = false
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(cover()).toBeNull()
  })

  test('what was on screen stays mounted under the cover', async () => {
    const { container } = render(<App />)
    await greet(here())
    await waitFor(() => expect(screen.getAllByText('What does a manifest settle?').length).toBeGreaterThan(0))
    down = true
    /* An answer pressed into a server that has stopped. */
    await act(async () => {
      fireEvent.click(screen.getAllByText('Who owns the repository')[0]!)
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(cover()?.getAttribute('data-cover')).toBe('down')
    const under = container.querySelector('[hidden]')
    expect(under?.textContent).toContain('What does a manifest settle?')
  })

  test('a server that restarted under the page: the write is refused as stale, and the cover says the page is reloading', async () => {
    render(<App />)
    await greet(here())
    await waitFor(() => expect(screen.getAllByText('What does a manifest settle?').length).toBeGreaterThan(0))
    restarted = true
    await act(async () => {
      fireEvent.click(screen.getAllByText('Who owns the repository')[0]!)
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(asked).toContain('POST /api/answer')
    expect(cover()?.getAttribute('data-cover')).toBe('stale')
    expect(document.body.textContent).toContain('This page is older than its server — reloading…')
    /* Refused, so nothing was recorded and no key came back. */
    expect(document.documentElement.innerHTML).not.toContain(WHY)
  })
})

describe('a host that draws the footer', () => {
  /* What the page posted to its host, by type: in a test the page is its own parent. */
  const posted = (type: string) => {
    const seen: unknown[] = []
    const hear = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === type) seen.push((event.data as { items: unknown }).items)
    }
    window.addEventListener('message', hear)
    return { seen, stop: () => window.removeEventListener('message', hear) }
  }

  test('is told the score in the footer and Edit in the header; the page draws no score, and a press of Edit opens the editor', async () => {
    const footers = posted('kehikot.footer')
    const headers = posted('kehikot.header')
    render(<App />)
    await act(async () => {
      window.postMessage({ type: 'kehikot.hello', protocol: 2, session: 's', state: null, header: true, footer: true, context: { theme: 'dark', ...here() } }, '*')
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    await waitFor(() => expect(screen.getAllByText('What does a manifest settle?').length).toBeGreaterThan(0))
    type Item = { id: string; kind: string; text?: string }
    await waitFor(() => expect((footers.seen.at(-1) as Item[] | undefined)?.find((one) => one.id === 'score')?.text).toBe('1 asked · 0 answered · 0 right'))
    expect((headers.seen.at(-1) as Item[]).map((one) => `${one.kind}:${one.id}`)).toEqual(['run:edit'])
    expect(document.body.textContent).not.toContain('1 asked')
    await act(async () => {
      window.postMessage({ type: 'kehikot.press', protocol: 2, id: 'p1', item: 'edit' }, '*')
      await new Promise((resolve) => setTimeout(resolve, 80))
    })
    await waitFor(() => expect(document.querySelector('[data-editor="open"]')).toBeTruthy())
    /* The editor's own rows now: Done and History, and the save in the footer. */
    await waitFor(() => expect((headers.seen.at(-1) as Item[]).map((one) => one.id)).toContain('done'))
    await waitFor(() => expect((footers.seen.at(-1) as Item[]).map((one) => one.id)).toContain('save'))
    footers.stop()
    headers.stop()
  })

  test('a host that does not say so is told no footer, and the page draws its score as before', async () => {
    const footers = posted('kehikot.footer')
    render(<App />)
    await greet(here())
    await waitFor(() => expect(screen.getAllByText('What does a manifest settle?').length).toBeGreaterThan(0))
    await settle(40)
    expect(document.body.textContent).toContain('1 asked · 0 answered · 0 right')
    expect(footers.seen).toEqual([])
    footers.stop()
  })
})
