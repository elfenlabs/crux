/**
 * Crux — Tool Registry
 *
 * Returns the array of built-in tools.
 * Future: loads plugins from ~/.crux/tools/
 */

import type { Tool } from '@elfenlabs/cog'
import { execCommand } from './exec-command.js'
import { webSearch } from './web-search.js'

/** Get all built-in tools */
export function getBuiltinTools(): Tool<any>[] {
  return [execCommand, webSearch]
}
