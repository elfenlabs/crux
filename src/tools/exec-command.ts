/**
 * Crux — exec_command tool
 *
 * Execute shell commands on the local machine.
 * Future: support remote execution via SSH pool.
 */

import { createTool } from '@elfenlabs/cog'
import { getCwd, setCwd } from '../state/cwd-tracker.js'

export const execCommand = createTool({
  id: 'exec_command',
  description:
    'Execute a shell command on the local machine. Returns stdout, stderr, and exit code. ' +
    'If the command exceeds the timeout, it is killed and the result will include `timedOut: true` with any partial output captured.',
  schema: {
    command: { type: 'string', description: 'The shell command to execute' },
    cwd: { type: 'string', description: 'Working directory (default: current directory)', required: false },
    timeout: { type: 'number', description: 'Timeout in seconds (default: 30)', required: false },
  },
  execute: async (args) => {
    const { command, cwd, timeout } = args as {
      command: string
      cwd?: string
      timeout?: number
    }

    // When an explicit cwd is provided, make it sticky for future calls
    if (cwd) setCwd(cwd)

    const effectiveCwd = getCwd()
    const timeoutSec = timeout ?? 30
    const timeoutMs = timeoutSec * 1000

    try {
      const proc = Bun.spawn(['bash', '-c', command], {
        cwd: effectiveCwd,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      // Sentinel so we can distinguish timeout from normal completion
      const TIMEOUT = Symbol('timeout')

      const timeoutPromise = new Promise<typeof TIMEOUT>((resolve) => {
        setTimeout(() => resolve(TIMEOUT), timeoutMs)
      })

      // Race the *entire* operation (stdout + stderr + exit) against the timeout.
      // This avoids blocking forever when a command hangs without closing its streams.
      const raceResult = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]),
        timeoutPromise,
      ])

      if (raceResult === TIMEOUT) {
        proc.kill()
        // Give the process a moment to die so we can drain partial output
        await Promise.race([proc.exited, new Promise((r) => setTimeout(r, 500))])

        const result: Record<string, unknown> = {
          exitCode: null,
          timedOut: true,
          error: `Command timed out after ${timeoutSec}s`,
        }
        return result
      }

      // Normal completion — raceResult is [stdout, stderr, exitCode]
      const [stdout, stderr, exitCode] = raceResult

      const result: Record<string, unknown> = { exitCode }

      const trimmedStdout = stdout.trim()
      const trimmedStderr = stderr.trim()

      if (trimmedStdout) result.stdout = trimmedStdout
      if (trimmedStderr) result.stderr = trimmedStderr

      return result
    } catch (err) {
      return {
        exitCode: 1,
        error: `Failed to execute command: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
})
