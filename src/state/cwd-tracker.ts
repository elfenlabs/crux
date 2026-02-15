/**
 * Crux — CWD Tracker
 *
 * Shared, mutable current-working-directory state.
 * exec_command reads & writes this so CWD is "sticky" across calls.
 * The terminal prompt reads it to display abbreviated CWD.
 */

import * as path from 'node:path'
import * as os from 'node:os'

let cwd = process.cwd()

/** Get the tracked CWD */
export function getCwd(): string {
  return cwd
}

/** Update the tracked CWD (resolves relative paths against the current CWD) */
export function setCwd(dir: string): void {
  cwd = path.resolve(cwd, dir)
}

/** Get the CWD with $HOME abbreviated to ~ */
export function getAbbreviatedCwd(): string {
  const home = os.homedir()
  if (cwd === home) return '~'
  if (cwd.startsWith(home + '/')) return '~' + cwd.slice(home.length)
  return cwd
}
