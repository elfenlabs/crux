/**
 * Crux — Platform-Aware Paths
 *
 * Returns the base Crux directory for the current platform:
 *   - Windows: %APPDATA%\crux
 *   - Linux/macOS: ~/.crux
 *
 * Usage:
 *   cruxHome()                    → base dir
 *   cruxHome('repository')        → repo dir
 *   cruxHome('logs')              → log dir
 */

import { join } from 'node:path'
import { homedir } from 'node:os'

export function cruxHome(...segments: string[]): string {
  const base = process.platform === 'win32'
    ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'crux')
    : join(homedir(), '.crux')
  return segments.length ? join(base, ...segments) : base
}
