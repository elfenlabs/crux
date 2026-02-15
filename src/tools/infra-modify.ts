/**
 * Crux — infra_modify tool
 *
 * Add, update, or remove hosts with a two-step propose+confirm flow.
 * Step 1: action = add/update/remove → returns YAML preview (nothing written)
 * Step 2: action = confirm → applies the pending change
 */

import { createTool } from '@elfenlabs/cog'
import type { InfraDatabase } from '../infra/types.js'
import type { Host } from '../infra/types.js'
import { addHost, updateHost, removeHost, previewYaml } from '../infra/database.js'

type PendingChange = {
  action: 'add' | 'update' | 'remove'
  name: string
  data?: Host
}

export function createInfraModifyTool(db: InfraDatabase) {
  let pending: PendingChange | null = null

  return createTool({
    id: 'infra_modify',
    description:
      'Add, update, or remove a host in the infrastructure database. ' +
      'This is a two-step process:\n' +
      '1. Call with action "add", "update", or "remove" — returns a YAML preview of the proposed change (nothing is written yet).\n' +
      '2. Present the preview to the user and ask for confirmation.\n' +
      '3. If confirmed, call again with action "confirm" to apply the change.\n' +
      'If the user declines, call with action "cancel" to discard.',
    schema: {
      action: {
        type: 'string',
        description: 'One of: add, update, remove, confirm, cancel',
      },
      name: {
        type: 'string',
        description: 'Host name/alias (required for add/update/remove, ignored for confirm/cancel)',
        required: false,
      },
      data: {
        type: 'object',
        description: 'Host data. Required for add/update, ignored for remove/confirm/cancel.',
        required: false,
        properties: {
          host: { type: 'string', description: 'IP address or hostname (required)' },
          port: { type: 'number', description: 'SSH port (default: 22)', required: false },
          user: { type: 'string', description: 'SSH username', required: false },
          key: { type: 'string', description: 'Path to SSH private key', required: false },
          jump: { type: 'string', description: 'Jump/bastion host name (references another host)', required: false },
          tags: { type: 'array', description: 'Tags for categorization', required: false, items: { type: 'string', description: 'Tag value' } },
          notes: { type: 'string', description: 'Free-text notes about the host', required: false },
        },
      },
    },
    execute: async (args) => {
      const { action, name, data } = args as {
        action: string
        name?: string
        data?: Host
      }

      // ── Confirm pending change ──────────────────────────────────────────
      if (action === 'confirm') {
        if (!pending) return 'No pending change to confirm.'

        try {
          switch (pending.action) {
            case 'add':
              addHost(db, pending.name, pending.data!)
              break
            case 'update':
              updateHost(db, pending.name, pending.data!)
              break
            case 'remove':
              removeHost(db, pending.name)
              break
          }

          const msg = `✅ Host '${pending.name}' ${pending.action === 'add' ? 'added' : pending.action === 'update' ? 'updated' : 'removed'} successfully.`
          pending = null
          return msg
        } catch (err) {
          pending = null
          return `❌ Failed: ${err instanceof Error ? err.message : String(err)}`
        }
      }

      // ── Cancel pending change ───────────────────────────────────────────
      if (action === 'cancel') {
        pending = null
        return 'Change cancelled.'
      }

      // ── Propose a change (add / update / remove) ───────────────────────
      if (!name) return 'Error: "name" is required for add/update/remove.'

      if (action === 'add') {
        if (!data?.host) return 'Error: "data" with at least a "host" field is required when adding a host.'
        if (db.hosts.has(name)) return `Error: Host '${name}' already exists. Use action "update" instead.`
        pending = { action: 'add', name, data }
      } else if (action === 'update') {
        if (!db.hosts.has(name)) return `Error: Host '${name}' not found. Use action "add" instead.`
        if (!data) return 'Error: "data" is required for update.'
        pending = { action: 'update', name, data }
      } else if (action === 'remove') {
        if (!db.hosts.has(name)) return `Error: Host '${name}' not found in the database.`
        pending = { action: 'remove', name }
      } else {
        return `Error: Unknown action "${action}". Use one of: add, update, remove, confirm, cancel.`
      }

      const preview = previewYaml(action, name, data)
      return `Proposed change:\n\n\`\`\`yaml\n${preview}\`\`\`\n\nAsk the user to confirm this change. If they agree, call infra_modify with action "confirm". If they decline, call with action "cancel".`
    },
  })
}
