/**
 * Crux — Markdown Renderer
 *
 * Renders markdown text to ANSI-styled terminal output
 * using marked + marked-terminal.
 */

import { Marked } from 'marked'
import { markedTerminal } from 'marked-terminal'

const marked = new Marked(
  markedTerminal({
    // Style overrides matching our terminal palette
    firstHeading:    '\x1b[1m\x1b[38;5;98m',   // bold + violet
    heading:         '\x1b[1m\x1b[38;5;117m',   // bold + sky blue
    strong:          '\x1b[1m',                   // bold
    em:              '\x1b[3m',                   // italic
    codespan:        '\x1b[38;5;214m',            // amber for inline code
    blockquote:      '\x1b[38;5;244m',            // dim gray
    code:            '\x1b[38;5;244m',            // dim gray for code blocks
    listitem:        '\x1b[38;5;252m',            // light gray
    hr:              '\x1b[38;5;240m',            // dark gray
    table:           '\x1b[38;5;252m',            // light gray
    link:            '\x1b[38;5;117m',            // sky blue
    showSectionPrefix: false,
    reflowText:      true,
    width:           (process.stdout.columns || 80) - 4,
    tab:             2,
  })
)

/**
 * Render markdown text to ANSI-styled terminal string.
 * Returns the original text if parsing fails.
 */
export function renderMarkdown(text: string): string {
  try {
    const rendered = marked.parse(text) as string
    // marked-terminal may add trailing newlines; trim to one
    return rendered.replace(/\n{3,}/g, '\n\n').trimEnd()
  } catch {
    return text
  }
}
