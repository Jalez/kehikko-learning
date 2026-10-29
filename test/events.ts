import { stream } from '../doors.ts'

/**
 * An `EventSource` that is the module's own stream door, called in-process: what `run` and Vite
 * would serve, without a socket. happy-dom has no `EventSource`, and a page that follows its
 * server's news needs one to hear anything at all. Registered by `test/setup.ts`; a test that wants
 * to drive a line by hand puts its own in place.
 *
 * It makes no timer: a stream opens on a microtask, and news arrives when the server publishes.
 */
export class DoorSource {
  static opened: DoorSource[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((message: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  private held: { close: () => void } | null = null
  constructor(public url: string) {
    DoorSource.opened.push(this)
    queueMicrotask(() => {
      if (this.readyState === 2) return
      const at = new URL(url, 'http://127.0.0.1')
      /* Open first, as a browser's is: the initial event may be sent while the door answers. */
      this.readyState = 1
      this.onopen?.()
      const live = stream('GET', at.pathname, at.searchParams, (event) => {
        if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(event) })
      }, null)
      if (!live || !('close' in live)) {
        this.readyState = 2
        this.onerror?.()
        return
      }
      if (this.readyState === 2) live.close()
      else this.held = live
    })
  }
  /* `follow` names its events; this module's are all unnamed. */
  addEventListener(): void {}
  close(): void {
    this.readyState = 2
    this.held?.close()
    this.held = null
  }
}
