/**
 * Crux — Tool Registry
 *
 * Returns the array of built-in tools.
 * Future: loads plugins from ~/.crux/tools/
 */

import type { Tool } from '@elfenlabs/cog'
import type { InfraDatabase } from '../infra/types.js'
import type { CruxConfig } from '../config/types.js'
import { execCommand } from './exec-command.js'
import { createWebSearchTool } from './web-search.js'
import { createInfraQueryTool } from './infra-query.js'
import { createInfraModifyTool } from './infra-modify.js'

/** Get all built-in tools */
export function getBuiltinTools(infraDb: InfraDatabase, config: CruxConfig): Tool<any>[] {
  const tools: Tool<any>[] = [
    execCommand,
    createInfraQueryTool(infraDb),
    createInfraModifyTool(infraDb),
  ]

  if (config.search?.base_url) {
    tools.push(createWebSearchTool(config.search.base_url))
  }

  return tools
}
