#!/usr/bin/env bun

/**
 * Crux — Entry Point
 *
 * Loads config → creates provider → starts terminal REPL.
 */

import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { loadConfig, createProviderFromConfig } from './config/loader.js'
import { cruxHome } from './config/paths.js'
import { createDebugProvider } from './agent/debug-provider.js'
import { AgentController } from './agent/controller.js'
import { TerminalUI } from './ui/terminal-ui.js'
import { SessionManager } from './agent/session.js'

// ── Self-update ──────────────────────────────────────────
if (process.argv.includes('--update')) {
    const repoDir = cruxHome('repository')
    try {
        console.log('Pulling latest...')
        execSync(`git -C "${repoDir}" pull --ff-only`, { stdio: 'inherit' })
        console.log('Running installer...')
        if (process.platform === 'win32') {
            const script = join(repoDir, 'get-crux.ps1')
            const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
            execSync(`"${ps}" -ExecutionPolicy Bypass -File "${script}"`, { stdio: 'inherit' })
        } else {
            const script = join(repoDir, 'get-crux.sh')
            execSync(`bash "${script}"`, { stdio: 'inherit' })
        }
    } catch {
        console.error('Update failed.')
        process.exit(1)
    }
    process.exit(0)
}

// ── List sessions ────────────────────────────────────────
if (process.argv.includes('--list')) {
    const sm = new SessionManager()
    const sessions = sm.list()

    if (sessions.length === 0) {
        console.log('No sessions found.')
    } else {
        // Header
        const idW = 22, modelW = 20, tokW = 8, msgW = 5
        console.log(
            `${'ID'.padEnd(idW)} ${'Model'.padEnd(modelW)} ${'Tokens'.padStart(tokW)} ${'Msgs'.padStart(msgW)}  Summary`
        )
        console.log('─'.repeat(80))

        for (const s of sessions) {
            const id = s.id.padEnd(idW)
            const model = s.model.padEnd(modelW)
            const tokens = String(s.total_tokens).padStart(tokW)
            const msgs = String(s.message_count).padStart(msgW)
            const summary = s.summary.substring(0, 40)
            console.log(`${id} ${model} ${tokens} ${msgs}  ${summary}`)
        }
    }
    process.exit(0)
}

// ── Parse --resume flag ──────────────────────────────────
let resumeId: string | undefined
const resumeIdx = process.argv.indexOf('--resume')
if (resumeIdx !== -1) {
    resumeId = process.argv[resumeIdx + 1]
    if (!resumeId) {
        console.error('Usage: crux --resume <session-id>')
        process.exit(1)
    }
}

// Load config
const config = loadConfig()
let provider = createProviderFromConfig(config)

if (config.log) {
    provider = createDebugProvider(provider)
    console.log(`📝 Logging to ${cruxHome('logs')}`)
}

// Create controller and UI
let controller: AgentController
try {
    controller = new AgentController(provider, config, resumeId)
} catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
}

if (resumeId) {
    console.log(`📂 Resumed session: ${controller.sessionId}`)
}

const ui = new TerminalUI(controller, config)

// Clean shutdown
process.on('SIGTERM', () => {
    ui.destroy()
    process.exit(0)
})

// Start
ui.start()

