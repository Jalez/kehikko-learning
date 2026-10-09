import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useEffect, useMemo, useState, type ComponentType } from 'react'

/**
 * What the editor screen needs from an editor: the text and a change. Kept this
 * narrow so the screen's logic (autosave, conflicts, what the disk did) is
 * tested with a plain textarea in place of CodeMirror, which does not lay out
 * in a DOM without layout.
 */
export interface EditorProps {
  value: string
  onChange(text: string): void
}

export type Editor = ComponentType<EditorProps>

/**
 * The quiz file's Markdown in CodeMirror 6 — the editor Slides opens a deck in:
 * the same packages at the same versions, the same language, the same
 * `basicSetup` and so the same keys, and the same rules in `index.css`.
 *
 * A COPY of `kehikko-slides`' `src/editor/deck-editor.tsx`, less the caret and
 * the jump a deck needs and a quiz does not. It is a copy rather than one
 * component in `kehikot-module-protocol` because that package is what the host
 * and every module install, and sharing this would hand all of them CodeMirror
 * to share sixty lines. Change the setup in both or in neither.
 *
 * The theme is read off the document rather than passed in: `wire/use-kehikot.ts`
 * writes the host's choice there as `.dark` / `.light`, and with neither (the
 * page opened on its own) the machine's setting decides, as it does in
 * `index.css`.
 */
export function MarkdownEditor({ value, onChange }: EditorProps) {
  const theme = useTheme()
  const extensions = useMemo(() => [markdown({ base: markdownLanguage }), EditorView.lineWrapping], [])
  return (
    <CodeMirror
      className="quiz-editor h-full"
      height="100%"
      value={value}
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
      }}
      aria-label="the questions, as Markdown"
    />
  )
}

function themeNow(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  const root = document.documentElement.classList
  if (root.contains('dark')) return 'dark'
  if (root.contains('light')) return 'light'
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Light or dark, as the page is drawn now, and again whenever that changes. */
function useTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState(themeNow)
  useEffect(() => {
    const look = () => setTheme(themeNow())
    look()
    const classes = typeof MutationObserver === 'undefined' ? null : new MutationObserver(look)
    classes?.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const machine = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    machine?.addEventListener('change', look)
    return () => {
      classes?.disconnect()
      machine?.removeEventListener('change', look)
    }
  }, [])
  return theme
}
