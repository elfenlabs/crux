/**
 * Crux — infra_query tool
 *
 * Search the infrastructure database by host name or tag.
 */

import { createTool } from '@elfenlabs/cog'
import type { InfraDatabase } from '../infra/types.js'
import { queryHosts, formatHosts } from '../infra/database.js'

export function createInfraQueryTool(db: InfraDatabase) {
  return createTool({
    id: 'infra_query',
    description:
      'Query the infrastructure database. Search hosts by name (substring match) or tag. ' +
      'Call with no arguments to list all hosts.',
    schema: {
      name: { type: 'string', description: 'Filter by host name (substring match)', required: false },
      tag: { type: 'string', description: 'Filter by tag', required: false },
    },
    execute: async (args) => {
      const { name, tag } = args as { name?: string; tag?: string }

      const results = queryHosts(db, { name, tag })
      if (results.size === 0) {
        if (name || tag) {
          return `No hosts found matching ${name ? `name="${name}"` : ''}${name && tag ? ', ' : ''}${tag ? `tag="${tag}"` : ''}.`
        }
        return 'The infrastructure database is empty. No hosts have been added yet.'
      }

      return `Found ${results.size} host${results.size === 1 ? '' : 's'}:\n\n${formatHosts(results)}`
    },
  })
}
