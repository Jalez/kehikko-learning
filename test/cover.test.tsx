import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mailbox, resetServerStanding } from 'kehikot-module-protocol/client'

import { TICKET, answer as door } from '../doors.ts'
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

describe('the not-ready moments, each as the one shared cover', () => {
  test('before anything has greeted the page it is waiting — never "no project" — and then unhosted', async () => {
    render(<App />)
    await settle(30)
    expect(cover()?.getAttribute('data-cover')).toBe('waiting')
    expect(document.body.textContent).not.toContain('No project')
    await settle(800)
    expect(cover()?.getAttribute('data-cover')).toBe('unhosted')
    expect(document.body.textContent).toContain('Nothing is framing this page — open Learning in Kehikot.')
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
    /* Nothing but the questions route was asked: the file is the editor's, and nobody pressed Edit. */
    expect(new Set(asked)).toEqual(new Set(['GET /api/questions']))
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
    expect(document.body.textContent).toContain('Learning’s own server is not answering.')
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
