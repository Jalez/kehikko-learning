import { GlobalRegistrator } from '@happy-dom/global-registrator'

/**
 * A document, for the tests that render one.
 *
 * Registered globally rather than per-file because half the value of these tests
 * is that they run the real components — the words on screen are the thing being
 * asserted, and a fake renderer would let a component say something different
 * from what it says in a browser.
 */
GlobalRegistrator.register()

/* The host's `is-project` answer, which every door asks before it works on a folder. */
import './host.ts'

/* An `EventSource` for the page: the module's own stream door, in-process (`test/events.ts`). */
import { DoorSource } from './events.ts'
globalThis.EventSource = DoorSource as unknown as typeof EventSource
