/**
 * Crux — Config Types
 */

export type ModelConfig = {
  provider: string
  base_url: string
  model: string
  api_key_env?: string
  temperature?: number
}

export type AgentConfig = {
  max_steps?: number
  instruction?: string
}

export type CruxConfig = {
  model: ModelConfig
  agent?: AgentConfig
}
