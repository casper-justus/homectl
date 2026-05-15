import { NodeSSH } from 'node-ssh'
import { HostConfig } from '../config/types'
import { ShellResult } from './shell'

export class SSHClient {
  private ssh: NodeSSH
  private connected = false

  constructor() {
    this.ssh = new NodeSSH()
  }

  async connect(config: HostConfig): Promise<void> {
    if (this.connected) return

    try {
      await this.ssh.connect({
        host: config.connection.host,
        username: config.connection.user || 'root',
        port: config.connection.port || 22,
        privateKey: config.connection.identityFile
          ? config.connection.identityFile
          : undefined,
        keepaliveInterval: 10000,
        readyTimeout: 15000,
      })
      this.connected = true
    } catch (err) {
      throw new Error(
        `SSH connection failed to ${config.connection.user || 'root'}@${config.connection.host}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async exec(command: string, args: string[] = []): Promise<ShellResult> {
    if (!this.connected) throw new Error('SSH not connected')
    const cmd = args.length > 0
      ? `${command} ${args.map(a => escapeArg(a)).join(' ')}`
      : command
    const result = await this.ssh.execCommand(cmd)
    return { code: result.code ?? 0, stdout: result.stdout, stderr: result.stderr }
  }

  async execRaw(command: string): Promise<ShellResult> {
    if (!this.connected) throw new Error('SSH not connected')
    const result = await this.ssh.execCommand(command)
    return { code: result.code ?? 0, stdout: result.stdout, stderr: result.stderr }
  }

  disconnect(): void {
    if (this.connected) {
      this.ssh.dispose()
      this.connected = false
    }
  }
}

function escapeArg(arg: string): string {
  if (/^[a-zA-Z0-9_./@:-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, "'\\''")}'`
}

export async function execRemote(config: HostConfig, command: string): Promise<ShellResult> {
  const client = new SSHClient()
  try {
    await client.connect(config)
    return await client.execRaw(command)
  } finally {
    client.disconnect()
  }
}
