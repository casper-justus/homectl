import { HomectlConfig, HostConfig } from '../config/types'
import { getHostConfig } from '../config/loader'
import { SSHClient } from '../adapters/ssh'
import { getDockerInfo } from '../adapters/docker'
import {
  getOSVersionString,
  getCPUInfo,
  getUptime,
  getMemoryInfo,
  getDiskInfo,
} from '../utils/platform'

export type CloudProvider = 'hetzner' | 'digitalocean' | 'lightsail' | 'generic-ssh'

export interface CloudInstance {
  id: string
  name: string
  provider: CloudProvider
  region?: string
  ip?: string
  status: string
  type?: string
  tags: string[]
  hostRef?: string
}

export async function discoverCloudHosts(
  config: HomectlConfig,
  providerFilter?: CloudProvider,
): Promise<CloudInstance[]> {
  const instances: CloudInstance[] = []

  for (const hostConfig of config.hosts) {
    if (hostConfig.connection.type !== 'ssh') continue

    const isCloud = hostConfig.tags?.some(
      (t) => t === 'cloud' || t === 'prod' || t === 'vps' || t === 'remote',
    )

    if (!isCloud) continue

    if (providerFilter && !hostConfig.tags?.includes(providerFilter)) continue

    const provider = detectProvider(hostConfig)
    const reachable = await checkReachable(hostConfig)

    instances.push({
      id: hostConfig.name,
      name: hostConfig.connection.host,
      provider,
      ip: hostConfig.connection.host,
      status: reachable ? 'reachable' : 'unreachable',
      tags: hostConfig.tags || [],
      hostRef: hostConfig.name,
    })
  }

  return instances
}

function detectProvider(hostConfig: HostConfig): CloudProvider {
  const tags = hostConfig.tags || []
  if (tags.includes('hetzner')) return 'hetzner'
  if (tags.includes('digitalocean') || tags.includes('do')) return 'digitalocean'
  if (tags.includes('lightsail') || tags.includes('aws')) return 'lightsail'
  return 'generic-ssh'
}

async function checkReachable(hostConfig: HostConfig): Promise<boolean> {
  try {
    const info = await getDockerInfo(hostConfig)
    return info.containers > 0 || info.serverVersion !== undefined
  } catch {
    return false
  }
}

export async function getProviderInfo(
  hostConfig: HostConfig,
): Promise<Record<string, string>> {
  const info: Record<string, string> = {}

  try {
    if (hostConfig.connection.type === 'local') {
      const [osVersion, cpu, uptime, mem, disk] = await Promise.all([
        getOSVersionString(),
        Promise.resolve(getCPUInfo()),
        Promise.resolve(getUptime()),
        getMemoryInfo(),
        getDiskInfo(),
      ])
      info.os = osVersion
      info.cpu = cpu
      info.uptime = uptime
      if (mem) info.memory = `${mem.used} / ${mem.total}`
      if (disk) info.disk = `${disk.used} / ${disk.total} (${disk.usagePercent}%)`
    } else {
      const ssh = new SSHClient()
      try {
        await ssh.connect(hostConfig)
        const uname = await ssh.execRaw('uname -a')
        info.kernel = uname.stdout.trim()

        const uptime = await ssh.execRaw('uptime -p')
        info.uptime = uptime.stdout.trim() || 'N/A'

        const cpu = await ssh.execRaw("nproc 2>/dev/null || echo 1")
        info.cpu = `${cpu.stdout.trim()} cores`

        const mem = await ssh.execRaw("free -h | grep 'Mem:' | awk '{print $3 \"/\" $2}'")
        info.memory = mem.stdout.trim() || 'N/A'

        const disk = await ssh.execRaw("df -h / | tail -1 | awk '{print $3 \"/\" $2 \" (\" $5 \")\"}'")
        info.disk = disk.stdout.trim() || 'N/A'
      } finally {
        ssh.disconnect()
      }
    }
  } catch {
    info.error = 'Could not retrieve provider info'
  }

  return info
}

export async function listCloudProviders(
  config: HomectlConfig,
): Promise<{ provider: CloudProvider; hosts: number; reachable: number }[]> {
  const providerMap = new Map<CloudProvider, { total: number; reachable: number }>()

  for (const hostConfig of config.hosts) {
    if (hostConfig.connection.type !== 'ssh') continue
    const isCloud = hostConfig.tags?.some(
      (t) => t === 'cloud' || t === 'prod' || t === 'vps' || t === 'remote',
    )
    if (!isCloud) continue

    const provider = detectProvider(hostConfig)
    const entry = providerMap.get(provider) || { total: 0, reachable: 0 }
    entry.total++
    try {
      const reachable = await checkReachable(hostConfig)
      if (reachable) entry.reachable++
    } catch {
      // not reachable
    }
    providerMap.set(provider, entry)
  }

  return Array.from(providerMap.entries()).map(([provider, stats]) => ({
    provider,
    hosts: stats.total,
    reachable: stats.reachable,
  }))
}
