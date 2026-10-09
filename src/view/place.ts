/**
 * Where a question is in the quiz file, as an offset into its text.
 *
 * For the press that opens the editor FROM a question: the file is opened on
 * that question, not on its first line. A question written by an agent is
 * found by its `<!-- id: … -->`, which sits under its heading; one typed by
 * hand has no such line and is found by its words. Null when neither is
 * there, and the editor then opens at the top as it always did.
 */
export function placeOf(text: string, at: { id: string; question: string }): number | null {
  const mark = text.indexOf(`<!-- id: ${at.id} -->`)
  if (mark !== -1) {
    /* The heading the id belongs to: the nearest `## ` line above it. */
    const above = text.lastIndexOf('\n## ', mark)
    if (above !== -1) return above + 1
    return text.startsWith('## ') ? 0 : mark
  }
  let from = 0
  for (const line of text.split('\n')) {
    /* A heading says the question and then its `[^n]` markers. */
    if (line.startsWith('## ') && line.slice(3).replace(/\s*\[\^[^\]]+\]/g, '').trim() === at.question.trim()) return from
    from += line.length + 1
  }
  return null
}
