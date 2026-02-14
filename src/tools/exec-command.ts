/**
 * Crux — exec_command tool
 *
 * Execute shell commands on the local machine.
 * Future: support remote execution via SSH pool.
 */

import { createTool } from '@elfenlabs/cog'

export const execCommand = createTool({
  id: 'exec_command',
  description: 'Execute a shell command on the local machine. Returns stdout, stderr, and exit code.',
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

    const timeoutMs = (timeout ?? 30) * 1000

    try {
      const proc = Bun.spawn(['bash', '-c', command], {
        cwd: cwd ?? process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      })

      // Race between process completion and timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          proc.kill()
          reject(new Error(`Command timed out after ${timeout ?? 30}s`))
        }, timeoutMs)
      })

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])

      const exitCode = await Promise.race([proc.exited, timeoutPromise])

      // Trim to avoid bloating the context with trailing newlines
      const result: Record<string, unknown> = {
        exitCode,
      }

      const trimmedStdout = stdout.trim()
      const trimmedStderr = stderr.trim()

      if (trimmedStdout) result.stdout = trimmedStdout
      if (trimmedStderr) result.stderr = trimmedStderr

      return result
    } catch (err) {
      throw new Error(
        `Failed to execute command: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  },
})
