declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked'

  interface TerminalRendererOptions {
    firstHeading?: string
    heading?: string
    strong?: string
    em?: string
    codespan?: string
    blockquote?: string
    code?: string
    listitem?: string
    hr?: string
    table?: string
    link?: string
    showSectionPrefix?: boolean
    reflowText?: boolean
    width?: number
    tab?: number
  }

  export function markedTerminal(options?: TerminalRendererOptions): MarkedExtension
  export default function Renderer(options?: TerminalRendererOptions): void
}

