/**
 * Crux — Infrastructure Database
 *
 * Multi-file YAML loader, query engine, and write-back.
 * Reads all *.yaml files from ~/.crux/infrastructure/
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { Host, HostEntry, InfraDatabase, InfraInventoryFile } from './types.js'

const INFRA_DIR = join(homedir(), '.crux', 'infrastructure')
const MANUAL_FILE = join(INFRA_DIR, 'manual.yaml')

// ── Loader ──────────────────────────────────────────────────────────────────

/** Load all *.yaml files from ~/.crux/infrastructure/ into a single InfraDatabase */
export function loadInfraDatabase(): InfraDatabase {
  const db: InfraDatabase = { hosts: new Map() }

  if (!existsSync(INFRA_DIR)) return db

  const files = readdirSync(INFRA_DIR)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort() // alphabetical — last-write-wins for duplicates

  for (const file of files) {
    const filePath = join(INFRA_DIR, file)
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed = parseYaml(raw) as InfraInventoryFile | null

      if (parsed?.hosts) {
        for (const [name, host] of Object.entries(parsed.hosts)) {
          db.hosts.set(name, { ...host, _sourceFile: filePath })
        }
      }
    } catch {
      // Skip malformed files silently
    }
  }

  return db
}

// ── Query ───────────────────────────────────────────────────────────────────

export type HostFilter = {
  name?: string
  tag?: string
}

/** Query hosts by name substring and/or tag */
export function queryHosts(db: InfraDatabase, filter: HostFilter): Map<string, HostEntry> {
  const results = new Map<string, HostEntry>()

  for (const [name, entry] of db.hosts) {
    let matches = true

    if (filter.name) {
      matches = matches && name.toLowerCase().includes(filter.name.toLowerCase())
    }

    if (filter.tag) {
      matches = matches && (entry.tags?.includes(filter.tag) ?? false)
    }

    if (matches) {
      results.set(name, entry)
    }
  }

  return results
}

/** Format hosts into a readable string for tool output */
export function formatHosts(hosts: Map<string, HostEntry>): string {
  if (hosts.size === 0) return 'No hosts found.'

  const lines: string[] = []
  for (const [name, entry] of hosts) {
    const parts = [`  host: ${entry.host}`]
    if (entry.port && entry.port !== 22) parts.push(`  port: ${entry.port}`)
    if (entry.user) parts.push(`  user: ${entry.user}`)
    if (entry.key) parts.push(`  key: ${entry.key}`)
    if (entry.jump) parts.push(`  jump: ${entry.jump}`)
    if (entry.tags?.length) parts.push(`  tags: [${entry.tags.join(', ')}]`)
    if (entry.notes) parts.push(`  notes: "${entry.notes}"`)
    lines.push(`${name}:\n${parts.join('\n')}`)
  }

  return lines.join('\n\n')
}

/** One-line summary for the system prompt */
export function summarizeInfra(db: InfraDatabase): string | null {
  if (db.hosts.size === 0) return null

  const allTags = new Set<string>()
  for (const entry of db.hosts.values()) {
    entry.tags?.forEach((t) => allTags.add(t))
  }

  const tagList = allTags.size > 0 ? ` (tags: ${[...allTags].sort().join(', ')})` : ''
  return `${db.hosts.size} host${db.hosts.size === 1 ? '' : 's'}${tagList}`
}

// ── Write-back ──────────────────────────────────────────────────────────────

/** Strip internal metadata before serialization */
function cleanHost(entry: HostEntry): Host {
  const { _sourceFile, ...host } = entry
  return host
}

/** Read an existing inventory file, or return empty structure */
function readInventoryFile(filePath: string): InfraInventoryFile {
  if (!existsSync(filePath)) return {}
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return (parseYaml(raw) as InfraInventoryFile) ?? {}
  } catch {
    return {}
  }
}

/** Write an inventory file back to disk */
function writeInventoryFile(filePath: string, inventory: InfraInventoryFile): void {
  mkdirSync(join(filePath, '..'), { recursive: true })
  const yaml = stringifyYaml(inventory, { lineWidth: 120 })
  writeFileSync(filePath, yaml, 'utf-8')
}

/** Add a new host entry — writes to manual.yaml */
export function addHost(db: InfraDatabase, name: string, host: Host): void {
  const inventory = readInventoryFile(MANUAL_FILE)
  if (!inventory.hosts) inventory.hosts = {}
  inventory.hosts[name] = host
  writeInventoryFile(MANUAL_FILE, inventory)
  db.hosts.set(name, { ...host, _sourceFile: MANUAL_FILE })
}

/** Update an existing host entry — writes to its source file */
export function updateHost(db: InfraDatabase, name: string, host: Host): void {
  const existing = db.hosts.get(name)
  if (!existing) throw new Error(`Host '${name}' not found`)

  const filePath = existing._sourceFile
  const inventory = readInventoryFile(filePath)
  if (!inventory.hosts) inventory.hosts = {}
  inventory.hosts[name] = host
  writeInventoryFile(filePath, inventory)
  db.hosts.set(name, { ...host, _sourceFile: filePath })
}

/** Remove a host entry from its source file */
export function removeHost(db: InfraDatabase, name: string): void {
  const existing = db.hosts.get(name)
  if (!existing) throw new Error(`Host '${name}' not found`)

  const filePath = existing._sourceFile
  const inventory = readInventoryFile(filePath)
  if (inventory.hosts) {
    delete inventory.hosts[name]

    // If hosts section is now empty, remove it
    if (Object.keys(inventory.hosts).length === 0) {
      delete inventory.hosts
    }
  }

  // If the file is now empty, delete it (only for manual.yaml)
  if (!inventory.hosts && filePath === MANUAL_FILE) {
    if (existsSync(filePath)) unlinkSync(filePath)
  } else {
    writeInventoryFile(filePath, inventory)
  }

  db.hosts.delete(name)
}

/** Generate a YAML preview for a proposed change */
export function previewYaml(action: string, name: string, data?: Host): string {
  if (action === 'remove') {
    return `# Remove host:\nhosts:\n  ${name}: ~ # (will be deleted)`
  }

  const label = action === 'add' ? 'Add new host' : 'Update host'
  const yaml = stringifyYaml({ hosts: { [name]: data } }, { lineWidth: 120 })
  return `# ${label}:\n${yaml}`
}
