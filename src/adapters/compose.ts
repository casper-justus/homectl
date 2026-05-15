import { HostConfig } from '../config/types'
import { SSHClient } from './ssh'
import { execLocal } from './shell'

export interface ComposeProject {
  name: string
  configFiles: string[]
  workingDir: string
  status: string
}

export interface ComposeService {
  name: string
  project: string
  image: string
  status: string
  replicas: number
  ports: string[]
}

export async function listComposeProjects(hostConfig: HostConfig): Promise<ComposeProject[]> {
  if (hostConfig.connection.type === 'local') return listLocalComposeProjects()
  return listRemoteComposeProjects(hostConfig)
}

async function listLocalComposeProjects(): Promise<ComposeProject[]> {
  try {
    const result = await execLocal('docker', ['compose', 'ls', '--format', 'json'])
    if (result.code !== 0 || !result.stdout.trim()) return []
    return JSON.parse(result.stdout).filter((p: any) => p).map((p: any) => ({
      name: p.Name || 'unknown',
      configFiles: p.ConfigFiles?.split(',') || [],
      workingDir: p.WorkingDir || '',
      status: p.Status || 'unknown',
    }))
  } catch {
    return []
  }
}

async function listRemoteComposeProjects(hostConfig: HostConfig): Promise<ComposeProject[]> {
  const ssh = new SSHClient()
  try {
    await ssh.connect(hostConfig)
    const result = await ssh.execRaw('docker compose ls --format json')
    if (result.code !== 0 || !result.stdout.trim()) return []
    return JSON.parse(result.stdout).filter((p: any) => p).map((p: any) => ({
      name: p.Name || 'unknown',
      configFiles: p.ConfigFiles?.split(',') || [],
      workingDir: p.WorkingDir || '',
      status: p.Status || 'unknown',
    }))
  } finally {
    ssh.disconnect()
  }
}

export async function composePs(hostConfig: HostConfig, projectName?: string): Promise<ComposeService[]> {
  const cmd = projectName
    ? `docker compose -p ${projectName} ps --format json`
    : 'docker compose ps --format json'

  if (hostConfig.connection.type === 'local') {
    const result = await execLocal('docker', [
      'compose',
      ...(projectName ? ['-p', projectName] : []),
      'ps',
      '--format', 'json',
    ])
    if (result.code !== 0 || !result.stdout.trim()) return []
    return parseComposePs(result.stdout)
  }

  const ssh = new SSHClient()
  try {
    await ssh.connect(hostConfig)
    const result = await ssh.execRaw(cmd)
    if (result.code !== 0 || !result.stdout.trim()) return []
    return parseComposePs(result.stdout)
  } finally {
    ssh.disconnect()
  }
}

function parseComposePs(output: string): ComposeService[] {
  try {
    const parsed = JSON.parse(output)
    if (Array.isArray(parsed)) {
      return parsed.map((s: any) => ({
        name: s.Name || s.Service || 'unknown',
        project: s.Project || '',
        image: s.Image || 'unknown',
        status: s.Status || 'unknown',
        replicas: parseInt(s.Replicas || '1', 10),
        ports: s.Ports ? (Array.isArray(s.Ports) ? s.Ports : [s.Ports]) : [],
      }))
    }
    return []
  } catch {
    return output.trim().split('\n').slice(1).filter(Boolean).map((line) => {
      const parts = line.split(/\s{2,}/)
      return { name: parts[0] || 'unknown', project: '', image: parts[1] || 'unknown', status: parts[2] || 'unknown', replicas: 1, ports: [] }
    })
  }
}

export async function composeValidate(hostConfig: HostConfig, projectName: string, composeDir?: string): Promise<{ valid: boolean; errors: string[] }> {
  const dir = composeDir || hostConfig.paths?.composeRoot || '.'
  const cmd = projectName
    ? `cd ${dir} && docker compose -p ${projectName} config`
    : `cd ${dir} && docker compose config`

  try {
    if (hostConfig.connection.type === 'local') {
      const result = await execLocal('docker', [
        'compose',
        ...(projectName ? ['-p', projectName] : []),
        'config',
      ], { cwd: dir })
      if (result.code === 0) return { valid: true, errors: [] }
      return { valid: false, errors: [result.stderr || result.stdout] }
    }

    const ssh = new SSHClient()
    try {
      await ssh.connect(hostConfig)
      const result = await ssh.execRaw(cmd)
      if (result.code === 0) return { valid: true, errors: [] }
      return { valid: false, errors: [result.stderr || result.stdout] }
    } finally {
      ssh.disconnect()
    }
  } catch (err) {
    return { valid: false, errors: [err instanceof Error ? err.message : String(err)] }
  }
}
