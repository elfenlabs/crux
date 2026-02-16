/**
 * Crux — Debug Provider
 *
 * Wraps a Cog Provider to log the full request/response
 * for every LLM invocation to a timestamped log file.
 */

import { mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Provider, GenerateResult, Message, ToolSpec, StreamCallbacks } from '@elfenlabs/cog'
import { cruxHome } from '../config/paths.js'

const DEBUG_DIR = cruxHome('logs')

function ensureDir() {
  mkdirSync(DEBUG_DIR, { recursive: true })
}

function logPath(): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return join(DEBUG_DIR, `debug-${date}.log`)
}

function writeLog(label: string, data: unknown) {
  ensureDir()
  const timestamp = new Date().toISOString()
  const separator = '-'.repeat(80)
  const content = `\n${separator}\n[${timestamp}] ${label}\n${separator}\n${JSON.stringify(data, null, 2)}\n`
  appendFileSync(logPath(), content, 'utf-8')
}

export function createDebugProvider(inner: Provider): Provider {
  let callCount = 0

  return {
    async generate(params: {
      messages: Message[]
      tools?: ToolSpec[]
      signal?: AbortSignal
      stream?: StreamCallbacks
    }): Promise<GenerateResult> {
      callCount++
      const callId = callCount

      // Log the full request
      writeLog(`REQUEST #${callId}`, {
        messageCount: params.messages.length,
        messages: params.messages,
        tools: params.tools?.map(t => t.name),
      })

      const result = await inner.generate(params)

      // Log the full response
      writeLog(`RESPONSE #${callId}`, {
        content: result.content,
        reasoning: result.reasoning,
        toolCalls: result.toolCalls,
        usage: result.usage,
      })

      return result
    },
  }
}
