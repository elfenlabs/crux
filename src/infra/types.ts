/**
 * Crux — Infrastructure Types
 *
 * Hosts-only for now. Clusters, groups, etc. can be added later.
 */

export type Host = {
  host: string
  port?: number
  user?: string
  key?: string
  jump?: string
  tags?: string[]
  notes?: string
}

/** Raw shape of a single YAML inventory file */
export type InfraInventoryFile = {
  hosts?: Record<string, Host>
}

/** A host entry with metadata about where it was loaded from */
export type HostEntry = Host & {
  _sourceFile: string
}

/** The materialized infra database after loading all files */
export type InfraDatabase = {
  hosts: Map<string, HostEntry>
}
