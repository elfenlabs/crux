/**
 * Crux — Terminal UI
 *
 * Direct readline + ANSI escape code rendering.
 * Replaces React/Ink for instant keystroke handling.
 */

import * as readline from 'node:readline'
import { AgentController } from '../agent/controller.js'
import type { CruxConfig } from '../config/types.js'
import { renderMarkdown } from './markdown.js'

// ── ANSI Helpers ────────────────────────────────────────────────────────────

const ESC = '\x1b['
const RESET = `${ESC}0m`
const BOLD = `${ESC}1m`
const DIM = `${ESC}2m`

// 256-color foreground
const fg = (code: number) => `${ESC}38;5;${code}m`

// Palette mapped from theme hex → closest 256-color
const C = {
  accent:   fg(98),   // violet
  text:     fg(252),  // light gray
  dim:      fg(244),  // medium gray
  muted:    fg(240),  // dark gray
  user:     fg(117),  // sky blue
  success:  fg(42),   // green
  warning:  fg(214),  // amber
  error:    fg(196),  // red
  thinking: fg(244),  // dimmed
} as const

// ── Spinner ─────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPINNER_INTERVAL = 80

// ── Box Drawing ─────────────────────────────────────────────────────────────

function drawBox(lines: string[], borderColor: string = C.dim): string {
  const cols = process.stdout.columns || 80
  const maxWidth = cols - 4

  const out: string[] = []
  out.push(`${borderColor}╭${'─'.repeat(maxWidth + 2)}╮${RESET}`)

  for (const line of lines) {
    // Strip ANSI for width calculation
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '')
    const pad = Math.max(0, maxWidth - stripped.length)
    out.push(`${borderColor}│${RESET} ${line}${' '.repeat(pad)} ${borderColor}│${RESET}`)
  }

  out.push(`${borderColor}╰${'─'.repeat(maxWidth + 2)}╯${RESET}`)
  return out.join('\n')
}

// ── Inline Markdown Formatter ───────────────────────────────────────────────

/** Apply basic ANSI formatting to a single line of markdown */
function formatLine(line: string): string {
  // Headers
  if (line.startsWith('### ')) return `${BOLD}${fg(117)}${line.substring(4)}${RESET}`
  if (line.startsWith('## '))  return `${BOLD}${fg(117)}${line.substring(3)}${RESET}`
  if (line.startsWith('# '))   return `${BOLD}${fg(117)}${line.substring(2)}${RESET}`

  // Horizontal rules
  if (/^(-{3,}|\*{3,})$/.test(line.trim())) return `${DIM}${'─'.repeat(40)}${RESET}`

  // List items
  line = line.replace(/^(\s*)[-*] /, '$1• ')
  // Numbered items (keep as is, just ensure spacing)

  // Bold
  line = line.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${ESC}22m`)
  // Italic (just use dim as terminal italic support varies)
  line = line.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `${DIM}$1${ESC}22m`)
  // Inline code
  line = line.replace(/`([^`]+)`/g, `${fg(222)}$1${ESC}39m`)

  return line
}

// ── Terminal UI ─────────────────────────────────────────────────────────────

export class TerminalUI {
  private controller: AgentController
  private config: CruxConfig
  private steps = 0
  private totalTokens = 0
  private running = false
  private lineBuffer = ''
  private inCodeBlock = false

  // Prompt strings
  private readonly PROMPT = `${C.accent}${BOLD}❯ ${RESET}`
  private readonly CONTINUATION = `${C.dim}  ${RESET}`

  constructor(controller: AgentController, config: CruxConfig) {
    this.controller = controller
    this.config = config
  }

  /** Start the REPL */
  start(): void {
    this.printHeader()

    // Enable keypress events so we get structured key info
    readline.emitKeypressEvents(process.stdin)

    this.promptLoop()
  }

  private async promptLoop(): Promise<void> {
    while (true) {
      process.stdout.write(this.PROMPT)
      const input = await this.readMultilineInput()
      const trimmed = input.trim()

      if (!trimmed) continue

      if (trimmed === 'exit' || trimmed === 'quit') {
        process.stdout.write(`${C.muted} Goodbye.${RESET}\n`)
        process.exit(0)
      }

      await this.handleInput(trimmed)
    }
  }

  /**
   * Read input with multiline support.
   * Enter on empty line → submit, Enter on non-empty → new line.
   */
  private readMultilineInput(): Promise<string> {
    return new Promise<string>((resolve) => {
      const lines: string[] = ['']
      let currentLine = 0

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true)
      }
      process.stdin.resume()

      const redrawCurrentLine = () => {
        // Clear current line and rewrite
        const prompt = currentLine === 0 ? this.PROMPT : this.CONTINUATION
        process.stdout.write(`\r${ESC}2K${prompt}${lines[currentLine]}`)
      }

      const cleanup = () => {
        process.stdin.removeListener('keypress', onKeypress)
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }
      }

      const onKeypress = (_ch: string | undefined, key: readline.Key | undefined) => {
        if (!key) return

        // Ctrl+C — exit
        if (key.ctrl && key.name === 'c') {
          cleanup()
          process.stdout.write(`\n${C.muted} Goodbye.${RESET}\n`)
          process.exit(0)
          return
        }

        // Ctrl+D on empty input — exit
        if (key.ctrl && key.name === 'd' && lines.length === 1 && lines[0] === '') {
          cleanup()
          process.stdout.write(`\n${C.muted} Goodbye.${RESET}\n`)
          process.exit(0)
          return
        }

        // Alt+Enter — new line
        if (key.name === 'return' && key.meta) {
          currentLine++
          lines.splice(currentLine, 0, '')
          process.stdout.write(`\n${this.CONTINUATION}`)
          return
        }

        // Enter (plain) — submit
        if (key.name === 'return') {
          cleanup()
          process.stdout.write('\n')
          resolve(lines.join('\n'))
          return
        }

        // Backspace
        if (key.name === 'backspace') {
          if (lines[currentLine].length > 0) {
            // Delete last char on current line
            lines[currentLine] = lines[currentLine].slice(0, -1)
            redrawCurrentLine()
          } else if (currentLine > 0) {
            // Merge with previous line
            lines.splice(currentLine, 1)
            currentLine--
            // Move cursor up, redraw that line
            process.stdout.write(`${ESC}A\r${ESC}2K`)
            redrawCurrentLine()
          }
          return
        }

        // Ignore other control/meta keys (arrows, etc.)
        if (key.ctrl || key.meta || !key.sequence) return
        // Filter out non-printable sequences (arrow keys emit sequences like \x1b[A)
        if (key.name && ['up', 'down', 'left', 'right', 'tab', 'escape',
          'home', 'end', 'pageup', 'pagedown', 'insert', 'delete',
          'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'
        ].includes(key.name)) return

        // Printable character — append to current line
        lines[currentLine] += key.sequence
        process.stdout.write(key.sequence)
      }

      process.stdin.on('keypress', onKeypress)
    })
  }

  private printHeader(): void {
    process.stdout.write(
      `\n ${C.accent}${BOLD}⚡ crux${RESET} ${C.muted}— ops agent${RESET}\n\n`
    )
  }

  private async handleInput(input: string): Promise<void> {
    this.running = true
    let outputStarted = false

    // Handle Ctrl+C during execution — listen on raw stdin for \x03
    // because readline is paused and won't emit SIGINT while paused.
    // We must resume stdin after rl.pause() pauses it, so data events flow.
    const abortHandler = (data: Buffer) => {
      if (data[0] === 0x03 && this.running) {
        this.controller.abort()
        process.stdout.write(`\n${C.warning} ⚠ Aborted${RESET}\n`)
      }
    }
    process.stdin.on('data', abortHandler)
    process.stdin.resume()

    try {

      await this.controller.run(input, {
        onThinkingStart: () => {
          process.stdout.write('\n')
        },
        onThinking: (chunk) => {
          process.stdout.write(`${C.thinking}${DIM}${chunk}${RESET}`)
        },
        onThinkingEnd: () => {
          process.stdout.write('\n')
        },
        onOutputStart: () => {
          outputStarted = true
          process.stdout.write('\n')
        },
        onOutput: (chunk) => {
          outputStarted = true
          this.lineBuffer += chunk

          // Process and write complete lines with formatting
          let nlIdx = this.lineBuffer.indexOf('\n')
          while (nlIdx !== -1) {
            const line = this.lineBuffer.substring(0, nlIdx)
            this.lineBuffer = this.lineBuffer.substring(nlIdx + 1)

            // Toggle code block state on fences
            if (line.startsWith('```')) {
              this.inCodeBlock = !this.inCodeBlock
              const cols = process.stdout.columns || 80
              process.stdout.write(`${C.dim}${'─'.repeat(Math.min(40, cols - 2))}${RESET}\n`)
            } else if (this.inCodeBlock) {
              process.stdout.write(`${C.dim}  ${line}${RESET}\n`)
            } else {
              process.stdout.write(formatLine(line) + '\n')
            }

            nlIdx = this.lineBuffer.indexOf('\n')
          }
        },
        onOutputEnd: () => {
          // Flush any remaining text in the line buffer
          if (this.lineBuffer) {
            if (this.inCodeBlock) {
              process.stdout.write(`${C.dim}  ${this.lineBuffer}${RESET}`)
            } else {
              process.stdout.write(formatLine(this.lineBuffer))
            }
            this.lineBuffer = ''
          }
          this.inCodeBlock = false
          if (outputStarted) {
            process.stdout.write('\n')
          }
        },
        onToolCall: (event) => {
          const command = event.name === 'exec_command'
            ? `${C.muted}$ ${C.text}${String(event.args.command ?? '')}${RESET}`
            : `${C.dim}${JSON.stringify(event.args)}${RESET}`

          process.stdout.write(`\n  ${C.accent}●${RESET} ${C.dim}${event.name}${RESET}  ${command}\n`)
        },
        onToolResult: (event) => {
          const MAX_LINES = 10


          // Special formatting for exec_command results
          if (event.name === 'exec_command') {
            try {
              const parsed = JSON.parse(event.result)
              const exitCode = parsed.exitCode ?? 0
              const stdout = (parsed.stdout ?? '').trim()
              const stderr = (parsed.stderr ?? '').trim()

              // Render stdout in text color (white/light gray)
              if (stdout) {
                const lines = stdout.split('\n')
                const shown = lines.slice(0, MAX_LINES)
                for (const line of shown) {
                  process.stdout.write(`  ${C.dim}${line}${RESET}\n`)
                }
                if (lines.length > MAX_LINES) {
                  process.stdout.write(`  ${C.muted}… ${lines.length - MAX_LINES} more lines${RESET}\n`)
                }
              }

              // Render stderr in red (no prefix — color is enough)
              if (stderr) {
                const lines = stderr.split('\n')
                const shown = lines.slice(0, MAX_LINES)
                for (const line of shown) {
                  process.stdout.write(`  ${C.error}${line}${RESET}\n`)
                }
                if (lines.length > MAX_LINES) {
                  process.stdout.write(`  ${C.muted}… ${lines.length - MAX_LINES} more lines${RESET}\n`)
                }
              }

              // Exit code — only show on failure
              if (exitCode !== 0) {
                process.stdout.write(`  ${C.error}${BOLD}✗ exit ${exitCode}${RESET}\n`)
              }

              return
            } catch {
              // Fall through to generic rendering
            }
          }

          // Generic tool result rendering (non-exec_command or parse failure)
          const result = event.result
          const color = event.isError ? C.error : C.dim
          const truncated = result.length > 500
            ? result.slice(0, 500) + '\n… (truncated)'
            : result

          const rendered = renderMarkdown(truncated)
          const resultLines = rendered.split('\n').map(
            line => `  ${color}${line}${RESET}`
          )
          const boxLines = [
            ...resultLines.slice(0, 15),
            ...(resultLines.length > 15 ? [`  ${C.muted}… (${resultLines.length - 15} more lines)${RESET}`] : []),
          ]
          process.stdout.write(drawBox(boxLines, event.isError ? C.error : C.dim) + '\n\n')
        },
        onComplete: (response, usage) => {
          // If output wasn't streamed via onOutput, print the full response now
          if (!outputStarted && response) {
            process.stdout.write(renderMarkdown(response) + '\n')
          }
          this.steps++
          this.totalTokens = usage.promptTokens + usage.completionTokens
          // Print status line
          process.stdout.write(
            ` ${C.muted}${this.config.model.model} · ${this.steps} steps · ${this.totalTokens} tokens${RESET}\n`
          )
        },
        onError: (error) => {
          process.stdout.write(`${C.error}${BOLD} ✗ ${error.message}${RESET}\n`)
        },
      })
    } finally {
      this.running = false
      process.stdin.removeListener('data', abortHandler)
    }
  }

  /** Clean shutdown */
  destroy(): void {
    process.stdin.pause()
  }
}


