/**
 * Crux — Session Manager
 *
 * Persists agent conversation context to YAML files.
 * One file per session in ~/.crux/sessions/<timestamp>.yaml
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { stringify, parse } from 'yaml'
import { createContext } from '@elfenlabs/cog'
import type { Context, SerializedContext } from '@elfenlabs/cog'
import type { Message } from '@elfenlabs/cog'
import { cruxHome } from '../config/paths.js'

// ── Types ───────────────────────────────────────────────────────────────────

export type SessionMetadata = {
  id: string
  created_at: string
  updated_at: string
  model: string
  total_tokens: number
  summary: string
}

export type SessionData = SessionMetadata & {
  messages: Message[]
}

export type SessionSummary = SessionMetadata & {
  message_count: number
}

// ── Session Manager ─────────────────────────────────────────────────────────

export class SessionManager {
  private readonly dir: string

  constructor() {
    this.dir = cruxHome('sessions')
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
    }
  }

  /** Generate a new session ID from current timestamp */
  generateId(): string {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  }

  /** Save a session to disk */
  save(id: string, ctx: Context, metadata: Omit<SessionMetadata, 'id' | 'updated_at'>): void {
    const serialized = ctx.serialize()
    const data: SessionData = {
      id,
      ...metadata,
      updated_at: new Date().toISOString(),
      messages: serialized.messages,
    }
    const filePath = join(this.dir, `${id}.yaml`)
    writeFileSync(filePath, stringify(data), 'utf-8')
  }

  /** Load a session from disk. Returns null if not found. */
  load(id: string): { ctx: Context; metadata: SessionMetadata } | null {
    const filePath = join(this.dir, `${id}.yaml`)
    if (!existsSync(filePath)) return null

    const raw = readFileSync(filePath, 'utf-8')
    const data = parse(raw) as SessionData

    const ctx = createContext({
      from: { messages: data.messages },
    })

    return {
      ctx,
      metadata: {
        id: data.id,
        created_at: data.created_at,
        updated_at: data.updated_at,
        model: data.model,
        total_tokens: data.total_tokens,
        summary: data.summary,
      },
    }
  }

  /** List all sessions, newest first */
  list(): SessionSummary[] {
    if (!existsSync(this.dir)) return []

    const files = readdirSync(this.dir)
      .filter(f => f.endsWith('.yaml'))
      .sort()
      .reverse()

    const summaries: SessionSummary[] = []
    for (const file of files) {
      try {
        const raw = readFileSync(join(this.dir, file), 'utf-8')
        const data = parse(raw) as SessionData
        summaries.push({
          id: data.id,
          created_at: data.created_at,
          updated_at: data.updated_at,
          model: data.model,
          total_tokens: data.total_tokens,
          summary: data.summary,
          message_count: data.messages?.length ?? 0,
        })
      } catch {
        // Skip corrupt files
      }
    }

    return summaries
  }
}
