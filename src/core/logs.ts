import { HomectlConfig, LogEntry } from '../config/types'
import { getHostConfig, resolveHost } from '../config/loader'
import { SSHClient } from '../adapters/ssh'
import { execLocal } from '../adapters/shell'

export interface LogOptions {
  host?: string
  context?: string
  since?: string
  tail?: number
  follow?: boolean
  filter?: string
}

export async function tailLogs(
  config: HomectlConfig,
  serviceName: string,
  options: LogOptions,
): Promise<LogEntry[]> {
  const hostConfig = resolveHost(config, options.host, options.context)
  if (!hostConfig) {
    throw new Error(`No host resolved for logs. Specify --host or set a default context.`)
  }

  const args = ['logs']
  if (options.follow) args.push('--follow')
  if (options.tail) args.push('--tail', String(options.tail))
  if (options.since) args.push('--since', options.since)
  args.push(serviceName)

  if (hostConfig.connection.type === 'local') {
    return execLocalLogs(args)
  }

  const ssh = new SSHClient()
  try {
    await ssh.connect(hostConfig)
    const cmd = `docker ${args.join(' ')}`
    const result = await ssh.execRaw(cmd)
    return parseLogOutput(result.stdout)
  } finally {
    ssh.disconnect()
  }
}

async function execLocalLogs(args: string[]): Promise<LogEntry[]> {
  try {
    const result = await execLocal('docker', args)
    return parseLogOutput(result.stdout)
  } catch (err) {
    throw new Error(
      `Failed to get logs: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

function parseLogOutput(output: string): LogEntry[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => ({
      message: line,
    }))
}
