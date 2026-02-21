/**
 * Crux — Agent Controller
 *
 * Bridges Cog's runAgent with the TUI.
 * Emits typed events that ink components subscribe to via callbacks.
 */

import { createContext, runAgent, MaxStepsError, AgentAbortError, ContextBudgetError, SlidingWindowStrategy } from '@elfenlabs/cog'
import type { Context, Tool } from '@elfenlabs/cog'
import type { Provider, Usage } from '@elfenlabs/cog'
import { buildInstruction } from './instruction.js'
import { getBuiltinTools } from '../tools/registry.js'
import type { CruxConfig } from '../config/types.js'
import type { InfraDatabase } from '../infra/types.js'
import { loadInfraDatabase } from '../infra/database.js'
import { SessionManager } from './session.js'

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
  private readonly evictionStrategy = new SlidingWindowStrategy()
  private abortController: AbortController | null = null

  private readonly session: SessionManager
  private _sessionId: string
  private _createdAt: string
  private _totalTokens = 0

  constructor(provider: Provider, config: CruxConfig, resumeSessionId?: string) {
    this.provider = provider
    this.config = config
    this.infraDb = loadInfraDatabase()
    this.tools = getBuiltinTools(this.infraDb, this.config)
    this.session = new SessionManager()

    // Restore or create a new session
    if (resumeSessionId) {
      const loaded = this.session.load(resumeSessionId)
      if (!loaded) {
        throw new Error(`Session not found: ${resumeSessionId}`)
      }
      this.ctx = loaded.ctx
      this._sessionId = loaded.metadata.id
      this._createdAt = loaded.metadata.created_at
      this._totalTokens = loaded.metadata.total_tokens
    } else {
      this.ctx = createContext()
      this._sessionId = this.session.generateId()
      this._createdAt = new Date().toISOString()
    }
  }

  /** Current session ID */
  get sessionId(): string {
    return this._sessionId
  }

  /** Whether the agent is currently running */
  get isRunning(): boolean {
    return this.abortController !== null
  }

  /** Read-only access to the conversation messages */
  get messages(): readonly import('@elfenlabs/cog').Message[] {
    return this.ctx.messages
  }

  /** Persist the current session to disk */
  private saveSession(): void {
    // Extract summary from the first user message
    const messages = this.ctx.messages
    const firstUser = messages.find(m => m.role === 'user')
    const summary = firstUser
      ? firstUser.content.substring(0, 120).split('\n')[0]
      : ''

    this.session.save(this._sessionId, this.ctx, {
      created_at: this._createdAt,
      model: this.config.model.model,
      total_tokens: this._totalTokens,
      summary,
    })
  }

  /** Run the agent with a user prompt */
  async run(prompt: string, callbacks: AgentCallbacks): Promise<void> {
    this.ctx.push(prompt)
    this.abortController = new AbortController()

    try {
      const result = await runAgent({
        ctx: this.ctx,
        provider: this.provider,
        instruction: buildInstruction(this.infraDb, this.config),
        tools: this.tools,
        maxSteps: this.config.agent?.max_steps ?? 50,
        maxContextTokens: this.config.agent?.max_context_tokens ?? 100_000,
        evictionStrategy: this.evictionStrategy,
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
          // Auto-save after each tool call
          this.saveSession()
        },
      })

      this._totalTokens = result.usage.promptTokens + result.usage.completionTokens
      callbacks.onComplete?.(result.response, result.usage)

      // Auto-save after completion
      this.saveSession()
    } catch (err) {
      // Save even on error/abort so partial work isn't lost
      this.saveSession()

      if (err instanceof AgentAbortError) {
        callbacks.onError?.(new Error('Aborted'))
      } else if (err instanceof MaxStepsError) {
        callbacks.onError?.(new Error('Exceeded maximum steps'))
      } else if (err instanceof ContextBudgetError) {
        callbacks.onError?.(new Error('Context budget exceeded — try starting a new session'))
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
