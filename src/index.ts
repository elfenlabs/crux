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

const debug = process.argv.includes('--debug')

// Load config
const config = loadConfig()
let provider = createProviderFromConfig(config)

if (debug) {
    provider = createDebugProvider(provider)
    console.log('🐛 Debug mode: logging to ~/.crux/logs/')
}

// Create controller and UI
const controller = new AgentController(provider, config)
const ui = new TerminalUI(controller, config)

// Clean shutdown
process.on('SIGTERM', () => {
    ui.destroy()
    process.exit(0)
})

// Start
ui.start()
