#!/usr/bin/env bun

/**
 * Crux — Entry Point
 *
 * Loads config → creates provider → starts terminal REPL.
 */

import { loadConfig, createProviderFromConfig } from './config/loader.js'
import { createDebugProvider } from './agent/debug-provider.js'
import { AgentController } from './agent/controller.js'
import { TerminalUI } from './ui/terminal-ui.js'

const debug = process.argv.includes('--debug')

// Load config
const config = loadConfig()
let provider = createProviderFromConfig(config)

if (debug) {
    provider = createDebugProvider(provider)
    console.log('🐛 Debug mode: logging to ~/.config/crux/logs/')
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
