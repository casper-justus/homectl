import { spawn } from 'child_process'

export interface ShellResult {
  code: number
  stdout: string
  stderr: string
}

export async function execLocal(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number },
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: options?.cwd,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer =
      options?.timeout
        ? setTimeout(() => {
            timedOut = true
            proc.kill('SIGTERM')
          }, options.timeout!)
        : undefined

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`Command timed out: ${command} ${args.join(' ')}`))
        return
      }
      resolve({ code: code ?? 0, stdout, stderr })
    })

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
  })
}

export function buildDockerArgs(
  subcommand: string[],
  hostConfig?: { connectionMethod: string; hostname: string },
): string[] {
  const args: string[] = ['--no-version-check']
  return [...args, ...subcommand]
}

export function formatEnvVars(env?: Record<string, string>): string[] {
  if (!env) return []
  return Object.entries(env).map(([k, v]) => `${k}=${v}`)
}
