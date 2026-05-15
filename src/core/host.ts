import { HomectlConfig, HostConfig, HostStatus } from '../config/types'
import { getHostConfig } from '../config/loader'
import { getDockerInfo, listContainers } from '../adapters/docker'
import { SSHClient } from '../adapters/ssh'
import { getDiskInfo, getMemoryInfo, getHostname } from '../utils/platform'

export async function listHosts(config: HomectlConfig): Promise<HostStatus[]> {
  const results: HostStatus[] = []

  for (const hostConfig of config.hosts) {
    const status = await checkHost(hostConfig.name, hostConfig)
    results.push(status)
  }

  return results
}

export async function getHostInfo(
  config: HomectlConfig,
  hostName: string,
): Promise<HostStatus> {
  const hostConfig = getHostConfig(config, hostName)
  if (!hostConfig) {
    return {
      name: hostName,
      reachable: false,
      runtime: 'unknown',
      containers: 0,
      images: 0,
      error: `Host '${hostName}' not found in config`,
    }
  }

  return checkHost(hostName, hostConfig)
}

async function checkHost(
  name: string,
  config: HostConfig,
): Promise<HostStatus> {
  try {
    const info = await getDockerInfo(config)
    const containers = await listContainers(config)
    const running = containers.filter((c) => c.state === 'running')

    return {
      name,
      reachable: true,
      runtime: config.runtime.docker ? 'docker' : 'unknown',
      containers: running.length,
      images: info.images,
      dockerVersion: info.version,
    }
  } catch (err) {
    return {
      name,
      reachable: false,
      runtime: config.runtime.docker ? 'docker' : 'unknown',
      containers: 0,
      images: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function getHostDiskUsage(
  config: HostConfig,
): Promise<string> {
  if (config.connection.type === 'local') {
    const info = await getDiskInfo()
    if (!info) return 'unknown'
    return `${info.usagePercent}% used (${info.available} avail)`
  }

  const ssh = new SSHClient()
  try {
    await ssh.connect(config)
    const result = await ssh.execRaw('df -h / | tail -1')
    const parts = result.stdout.trim().split(/\s+/)
    return `${parts[4]} used (${parts[3]} avail)`
  } catch {
    return 'unknown'
  } finally {
    ssh.disconnect()
  }
}

export async function getHostMemoryUsage(
  config: HostConfig,
): Promise<string> {
  if (config.connection.type === 'local') {
    const info = await getMemoryInfo()
    if (!info) return 'unknown'
    return `${info.used} / ${info.total}`
  }

  const ssh = new SSHClient()
  try {
    await ssh.connect(config)
    const result = await ssh.execRaw("free -h | grep 'Mem:'")
    const parts = result.stdout.trim().split(/\s+/)
    return `${parts[1]} / ${parts[2]}`
  } catch {
    return 'unknown'
  } finally {
    ssh.disconnect()
  }
}

export async function pingHost(hostConfig: HostConfig): Promise<{ alive: boolean; latency: string; error?: string }> {
  try {
    if (hostConfig.connection.type === 'local') {
      return { alive: true, latency: '0ms' }
    }
    const ssh = new SSHClient()
    try {
      const start = Date.now()
      await ssh.connect(hostConfig)
      const elapsed = Date.now() - start
      const result = await ssh.execRaw('echo pong')
      ssh.disconnect()
      if (result.code === 0 && result.stdout.trim() === 'pong') {
        return { alive: true, latency: `${elapsed}ms` }
      }
      return { alive: false, latency: '', error: `Unexpected response: ${result.stdout.trim()}` }
    } catch {
      ssh.disconnect()
      return { alive: false, latency: '', error: 'Connection failed' }
    }
  } catch (err) {
    return { alive: false, latency: '', error: err instanceof Error ? err.message : String(err) }
  }
}

export async function execHost(hostConfig: HostConfig, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
  if (hostConfig.connection.type === 'local') {
    const { execLocal } = await import('../adapters/shell')
    return execLocal('cmd', ['/c', command])
  }
  const ssh = new SSHClient()
  try {
    await ssh.connect(hostConfig)
    const result = await ssh.execRaw(command)
    return { code: result.code, stdout: result.stdout, stderr: result.stderr }
  } finally {
    ssh.disconnect()
  }
}
