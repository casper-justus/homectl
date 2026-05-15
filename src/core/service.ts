import { HomectlConfig, HostConfig, ServiceInfo } from '../config/types'
import { getHostConfig, getHostForService } from '../config/loader'
import { listContainers, DockerContainerSummary } from '../adapters/docker'
import { composePs } from '../adapters/compose'
import { SSHClient } from '../adapters/ssh'
import { execLocal } from '../adapters/shell'

export async function listServices(
  config: HomectlConfig,
  hostName?: string,
  tag?: string,
): Promise<ServiceInfo[]> {
  let hosts: HostConfig[] = config.hosts
  if (hostName) {
    const h = getHostConfig(config, hostName)
    hosts = h ? [h] : []
  }
  if (tag) {
    hosts = hosts.filter((h) => h.tags?.includes(tag))
  }

  const results: ServiceInfo[] = []

  for (const hostConfig of hosts) {
    const services = await getServicesForHost(hostConfig)
    results.push(...services)
  }

  return results
}

async function getServicesForHost(
  hostConfig: HostConfig,
): Promise<ServiceInfo[]> {
  const services: ServiceInfo[] = []

  try {
    if (hostConfig.runtime.compose) {
      const composeServices = await composePs(hostConfig)
      for (const svc of composeServices) {
        services.push({
          name: svc.name,
          host: hostConfig.name,
          image: svc.image,
          status: svc.status,
          ports: svc.ports,
          project: svc.project,
        })
      }
    }

    const containers = await listContainers(hostConfig)
    const existingNames = new Set(services.map((s) => s.name))
    for (const c of containers) {
      if (!existingNames.has(c.name)) {
        services.push({
          name: c.name,
          host: hostConfig.name,
          image: c.image,
          status: c.state,
          ports: c.ports,
          volumes: c.mounts,
          networks: c.networks,
          created: c.created,
          health: c.health,
          uptime: c.uptime,
          containerIds: [c.id],
        })
      }
    }
  } catch {
    // host unreachable, skip
  }

  return services
}

export async function getServiceInfo(
  config: HomectlConfig,
  serviceName: string,
  hostName?: string,
): Promise<ServiceInfo | null> {
  const services = await listServices(config, hostName)
  const match = services.find((s) => s.name === serviceName)
  if (match) return match

  // Check if this is a defined service in config
  const svcDef = config.services?.find((s) => s.name === serviceName)
  if (svcDef) {
    const hostConfig = getHostConfig(config, svcDef.host)
    if (hostConfig) {
      const hostServices = await getServicesForHost(hostConfig)
      return hostServices.find((s) => s.name === serviceName || s.name === svcDef.composeService) || null
    }
  }
  return null
}

export async function restartService(
  config: HomectlConfig,
  serviceName: string,
  hostName?: string,
  dryRun?: boolean,
): Promise<{ success: boolean; message: string }> {
  return execServiceAction('restart', config, serviceName, hostName, dryRun)
}

export async function startService(
  config: HomectlConfig,
  serviceName: string,
  hostName?: string,
  dryRun?: boolean,
): Promise<{ success: boolean; message: string }> {
  return execServiceAction('start', config, serviceName, hostName, dryRun)
}

export async function stopService(
  config: HomectlConfig,
  serviceName: string,
  hostName?: string,
  dryRun?: boolean,
): Promise<{ success: boolean; message: string }> {
  return execServiceAction('stop', config, serviceName, hostName, dryRun)
}

export async function pullService(
  config: HomectlConfig,
  serviceName: string,
  hostName?: string,
  dryRun?: boolean,
): Promise<{ success: boolean; message: string }> {
  return execServiceAction('pull', config, serviceName, hostName, dryRun)
}

export async function checkServiceHealth(
  config: HomectlConfig,
  serviceName: string,
  hostName?: string,
): Promise<{ healthy: boolean; status: string; detail?: string }> {
  const hostConfig = await resolveHostForService(config, serviceName, hostName)
  if (!hostConfig) {
    return { healthy: false, status: 'unknown', detail: `Service '${serviceName}' not found` }
  }

  // Check defined healthcheck
  const svcDef = config.services?.find((s) => s.name === serviceName)
  if (svcDef?.healthcheck) {
    const hc = svcDef.healthcheck
    try {
      if (hostConfig.connection.type === 'local') {
        if (hc.type === 'http' && hc.url) {
          const result = await execLocal('curl', ['-sf', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', String(hc.timeout || 10), hc.url])
          if (result.code === 0) return { healthy: true, status: 'http ok', detail: `${hc.url} responded ${result.stdout.trim()}` }
          return { healthy: false, status: 'http fail', detail: `${hc.url} responded ${result.stdout.trim() || 'no response'}` }
        }
        if (hc.type === 'tcp' && hc.port) {
          const result = await execLocal('node', ['-e', `require('net').createConnection(${hc.port}, '${hostConfig.connection.host}', () => process.exit(0)).on('error', () => process.exit(1))`])
          return { healthy: result.code === 0, status: result.code === 0 ? 'tcp open' : 'tcp closed', detail: `Port ${hc.port} on ${hostConfig.connection.host}` }
        }
      } else {
        const ssh = new SSHClient()
        try {
          await ssh.connect(hostConfig)
          if (hc.type === 'http' && hc.url) {
            const result = await ssh.execRaw(`curl -sf -o /dev/null -w '%{http_code}' --max-time ${hc.timeout || 10} ${hc.url}`)
            if (result.code === 0) return { healthy: true, status: 'http ok', detail: `${hc.url} responded ${result.stdout.trim()}` }
            return { healthy: false, status: 'http fail', detail: `${hc.url} responded ${result.stdout.trim() || 'no response'}` }
          }
          if (hc.type === 'tcp' && hc.port) {
            const result = await ssh.execRaw(`timeout ${hc.timeout || 5} bash -c 'echo > /dev/tcp/${hostConfig.connection.host}/${hc.port}' 2>/dev/null && echo open || echo closed`)
            return { healthy: result.stdout.trim() === 'open', status: result.stdout.trim() === 'open' ? 'tcp open' : 'tcp closed', detail: `Port ${hc.port} on ${hostConfig.connection.host}` }
          }
          if (hc.type === 'exec' && hc.command) {
            const result = await ssh.execRaw(hc.command)
            return { healthy: result.code === 0, status: result.code === 0 ? 'pass' : 'fail', detail: result.stdout.trim() || result.stderr.trim() }
          }
        } finally {
          ssh.disconnect()
        }
      }
    } catch (err) {
      return { healthy: false, status: 'error', detail: err instanceof Error ? err.message : String(err) }
    }
  }

  // Fall back to Docker health
  const containers = await listContainers(hostConfig)
  const container = containers.find((c) => c.name === serviceName || c.name.endsWith(`/${serviceName}`))
  if (container) {
    return {
      healthy: container.health === 'healthy' || (container.state === 'running' && !container.health),
      status: container.health || container.state,
      detail: `Container ${container.id} state=${container.state}`,
    }
  }

  return { healthy: false, status: 'not found', detail: `No container found for '${serviceName}'` }
}

async function execServiceAction(
  action: 'start' | 'stop' | 'restart' | 'pull',
  config: HomectlConfig,
  serviceName: string,
  hostName?: string,
  dryRun?: boolean,
): Promise<{ success: boolean; message: string }> {
  const hostConfig = await resolveHostForService(config, serviceName, hostName)
  if (!hostConfig) {
    return {
      success: false,
      message: `Service '${serviceName}' not found on any host`,
    }
  }

  if (dryRun) {
    return {
      success: true,
      message: `[DRY-RUN] Would ${action} '${serviceName}' on ${hostConfig.connection.host}`,
    }
  }

  try {
    const dockerCmd = action
    if (hostConfig.connection.type === 'local') {
      const result = await execLocal('docker', [dockerCmd, serviceName])
      if (result.code === 0) {
        return { success: true, message: `${action}ed '${serviceName}'` }
      }
      return {
        success: false,
        message: `Failed to ${action} '${serviceName}': ${result.stderr || result.stdout}`,
      }
    }

    const ssh = new SSHClient()
    try {
      await ssh.connect(hostConfig)
      const result = await ssh.execRaw(`docker ${dockerCmd} ${serviceName}`)
      if (result.code === 0) {
        return {
          success: true,
          message: `${action}ed '${serviceName}' on ${hostConfig.connection.host}`,
        }
      }
      return {
        success: false,
        message: `Failed to ${action} '${serviceName}': ${result.stderr || result.stdout}`,
      }
    } finally {
      ssh.disconnect()
    }
  } catch (err) {
    return {
      success: false,
      message: `Error ${action}ing '${serviceName}': ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function resolveHostForService(
  config: HomectlConfig,
  serviceName: string,
  hostName?: string,
): Promise<HostConfig | null> {
  // Check defined services first
  const hostForService = getHostForService(config, serviceName)
  if (hostForService) return hostForService

  const hostsToCheck = hostName
    ? [getHostConfig(config, hostName)].filter(Boolean) as HostConfig[]
    : config.hosts

  for (const hostConfig of hostsToCheck) {
    try {
      const containers = await listContainers(hostConfig)
      const found = containers.find(
        (c) => c.name === serviceName || c.name.endsWith(`/${serviceName}`),
      )
      if (found) return hostConfig

      if (hostConfig.runtime.compose) {
        const services = await composePs(hostConfig)
        const found = services.find((s) => s.name === serviceName)
        if (found) return hostConfig
      }
    } catch {
      continue
    }
  }

  return null
}
