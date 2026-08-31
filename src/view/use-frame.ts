import { useEffect, useState } from 'react'

/**
 * The size of the box this page was given — the frame's, not the content's.
 *
 * ## Why this exists when the whole app is container queries
 *
 * `index.css` makes the body a container and every responsive class in this app
 * measures it. That covers width and it covers it well. It cannot cover height:
 * `container-type: inline-size` measures one axis on purpose, because a
 * container that measured both would have to lay its children out to know its
 * own size and then re-lay them out because it changed. There is no
 * `@height-sm:` and there is not going to be one.
 *
 * So the height comes from here, and `view/room.ts` turns the pair into a
 * decision. This hook does no deciding — it reports two numbers.
 *
 * ## Why two listeners and not one
 *
 * `document.documentElement.clientHeight` is the frame's height, and nothing
 * fires reliably when it alone changes. A `ResizeObserver` on the root element
 * watches the root's own box, which follows the CONTENT: it fires the moment the
 * frame gets narrower and the text rewraps, and it does not fire when the host
 * merely drags the container's bottom edge. `window`'s `resize` event does fire
 * for that, because a resized iframe is a resized window as far as the document
 * inside it is concerned.
 *
 * Either one alone leaves a real case wrong, so both are attached and both ask
 * the same question. The setter compares before it writes, so the pair firing
 * together costs one render, not two.
 *
 * ## The first value is measured, not assumed
 *
 * Read synchronously in the initialiser rather than started at zero and
 * corrected in an effect: the correction is one frame late, and one frame late
 * is a visible unfold on every mount. Where there is no document at all — a
 * test environment that does not lay out — it stays at zero, which `room()`
 * reads as "not measured" and answers by showing everything.
 */
function measure(): { width: number; height: number } {
  if (typeof document === 'undefined') return { width: 0, height: 0 }
  const root = document.documentElement
  return { width: root.clientWidth, height: root.clientHeight }
}

export function useFrame(): { width: number; height: number } {
  const [frame, setFrame] = useState(measure)

  useEffect(() => {
    const look = () =>
      setFrame((was) => {
        const now = measure()
        return was.width === now.width && was.height === now.height ? was : now
      })

    look()
    window.addEventListener('resize', look)
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(look)
    watch?.observe(document.documentElement)
    return () => {
      window.removeEventListener('resize', look)
      watch?.disconnect()
    }
  }, [])

  return frame
}
