/**
 * Crux — Tool Registry
 *
 * Returns the array of built-in tools.
 * Future: loads plugins from ~/.crux/tools/
 */

import type { Tool } from '@elfenlabs/cog'
import type { InfraDatabase } from '../infra/types.js'
import { execCommand } from './exec-command.js'
import { webSearch } from './web-search.js'
import { createInfraQueryTool } from './infra-query.js'
import { createInfraModifyTool } from './infra-modify.js'

/** Get all built-in tools */
export function getBuiltinTools(infraDb: InfraDatabase): Tool<any>[] {
  return [execCommand, webSearch, createInfraQueryTool(infraDb), createInfraModifyTool(infraDb)]
}
