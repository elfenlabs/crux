/**
 * Crux — Config Defaults
 */

import type { CruxConfig } from './types.js'

export const DEFAULT_CONFIG: CruxConfig = {
  model: {
    provider: 'openai',
    base_url: 'https://api.openai.com',
    model: 'gpt-4o',
    api_key_env: 'OPENAI_API_KEY',
    temperature: 0.3,
  },
  agent: {
    max_steps: 50,
  },
}
