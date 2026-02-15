/**
 * Crux — Agent Controller
 *
 * Bridges Cog's runAgent with the TUI.
 * Emits typed events that ink components subscribe to via callbacks.
 */

import { createContext, runAgent, MaxStepsError, AgentAbortError } from '@elfenlabs/cog'
import type { Context, Tool } from '@elfenlabs/cog'
import type { Provider, Usage } from '@elfenlabs/cog'
import { buildInstruction } from './instruction.js'
import { getBuiltinTools } from '../tools/registry.js'
import type { CruxConfig } from '../config/types.js'
import type { InfraDatabase } from '../infra/types.js'
import { loadInfraDatabase } from '../infra/database.js'

// ── Event Types ─────────────────────────────────────────────────────────────

export type ToolCallEvent = {
  id: string
  name: string
  args: Record<string, unknown>
}

export type ToolResultEvent = {
  id: string
  name: string
  result: string
  isError: boolean
}

export type AgentCallbacks = {
  onThinkingStart?: () => void
  onThinking?: (chunk: string) => void
  onThinkingEnd?: () => void
  onOutputStart?: () => void
  onOutput?: (chunk: string) => void
  onOutputEnd?: () => void
  onToolCall?: (event: ToolCallEvent) => void
  onToolResult?: (event: ToolResultEvent) => void
  onComplete?: (response: string, usage: Usage) => void
  onError?: (error: Error) => void
}

// ── Controller ──────────────────────────────────────────────────────────────

export class AgentController {
  private ctx: Context
  private provider: Provider
  private config: CruxConfig
  private tools: Tool<any>[]
  private infraDb: InfraDatabase
  private abortController: AbortController | null = null

  constructor(provider: Provider, config: CruxConfig) {
    this.ctx = createContext()
    this.provider = provider
    this.config = config
    this.infraDb = loadInfraDatabase()
    this.tools = getBuiltinTools(this.infraDb)
  }

  /** Whether the agent is currently running */
  get isRunning(): boolean {
    return this.abortController !== null
  }

  /** Run the agent with a user prompt */
  async run(prompt: string, callbacks: AgentCallbacks): Promise<void> {
    this.ctx.push(prompt)
    this.abortController = new AbortController()

    try {
      const result = await runAgent({
        ctx: this.ctx,
        provider: this.provider,
        instruction: buildInstruction(this.infraDb, this.config.agent?.instruction),
        tools: this.tools,
        maxSteps: this.config.agent?.max_steps ?? 50,
        signal: this.abortController.signal,

        // Streaming
        onThinkingStart: callbacks.onThinkingStart,
        onThinking: callbacks.onThinking,
        onThinkingEnd: callbacks.onThinkingEnd,
        onOutputStart: callbacks.onOutputStart,
        onOutput: callbacks.onOutput,
        onOutputEnd: callbacks.onOutputEnd,

        // Tool lifecycle
        onBeforeToolCall: async (tool, args) => {
          callbacks.onToolCall?.({
            id: tool.id,
            name: tool.id,
            args,
          })
          // Phase 0.5: no safety classification, always allow
          return true
        },
        onAfterToolCall: (tool, args, result) => {
          const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          callbacks.onToolResult?.({
            id: tool.id,
            name: tool.id,
            result: content,
            isError: false,
          })
        },
      })

      callbacks.onComplete?.(result.response, result.usage)
    } catch (err) {
      if (err instanceof AgentAbortError) {
        callbacks.onError?.(new Error('Aborted'))
      } else if (err instanceof MaxStepsError) {
        callbacks.onError?.(new Error('Exceeded maximum steps'))
      } else {
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      this.abortController = null
    }
  }

  /** Abort the current agent run */
  abort(): void {
    this.abortController?.abort()
  }
}
