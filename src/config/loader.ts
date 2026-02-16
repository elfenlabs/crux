/**
 * Crux — Config Loader
 *
 * Loads ~/.crux/config.yaml, merges with defaults.
 * Falls back gracefully if file doesn't exist.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { createOpenAIProvider } from '@elfenlabs/cog'
import { DEFAULT_CONFIG } from './defaults.js'
import type { CruxConfig } from './types.js'
import { cruxHome } from './paths.js'

const CONFIG_DIR = cruxHome()
const CONFIG_PATH = join(CONFIG_DIR, 'config.yaml')

/** Deep merge b into a (b wins) */
function deepMerge<T extends Record<string, any>>(a: T, b: Partial<T>): T {
  const result = { ...a }
  for (const key of Object.keys(b) as (keyof T)[]) {
    const val = b[key]
    if (val && typeof val === 'object' && !Array.isArray(val) && typeof a[key] === 'object') {
      result[key] = deepMerge(a[key] as any, val as any)
    } else if (val !== undefined) {
      result[key] = val as T[keyof T]
    }
  }
  return result
}

/** Load config from ~/.crux/config.yaml, merged with defaults */
export function loadConfig(): CruxConfig {
  if (!existsSync(CONFIG_PATH)) {
    return DEFAULT_CONFIG
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = parseYaml(raw) as Partial<CruxConfig>
    return deepMerge(DEFAULT_CONFIG, parsed)
  } catch {
    // If config is malformed, fall back to defaults
    return DEFAULT_CONFIG
  }
}

/** Create a Cog provider from config */
export function createProviderFromConfig(config: CruxConfig) {
  const { model } = config

  // Resolve API key from env
  const apiKey = model.api_key_env
    ? process.env[model.api_key_env]
    : undefined

  return createOpenAIProvider(model.base_url, model.model, {
    apiKey,
    temperature: model.temperature,
  })
}
