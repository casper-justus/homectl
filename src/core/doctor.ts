import { HomectlConfig, HostConfig, DoctorCheck } from '../config/types'
import { getHostConfig } from '../config/loader'
import { getDockerInfo, listContainers } from '../adapters/docker'
import { composePs } from '../adapters/compose'
import { SSHClient } from '../adapters/ssh'
import { getDiskInfo, isWindows } from '../utils/platform'

export async function runDoctorChecks(
  config: HomectlConfig,
  hostName?: string,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []

  const hostsToCheck = hostName
    ? [getHostConfig(config, hostName)].filter(Boolean) as HostConfig[]
    : config.hosts

  if (hostName && hostsToCheck.length === 0) {
    checks.push({
      name: `host:${hostName}`,
      status: 'fail',
      message: `Host '${hostName}' not found in configuration`,
      nextStep: `Check host names with: homectl host ls`,
    })
    return checks
  }

  for (const hostConfig of hostsToCheck) {
    const hostChecks = await checkHost(hostConfig)
    checks.push(...hostChecks)
  }

  return checks
}

async function checkHost(config: HostConfig): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []

  checks.push(await checkDockerReachable(config))
  checks.push(await checkDiskSpace(config))

  const containerChecks = await checkContainers(config)
  checks.push(...containerChecks)

  const portCheck = await checkPortConflicts(config)
  if (portCheck) checks.push(portCheck)

  return checks
}

async function checkDockerReachable(config: HostConfig): Promise<DoctorCheck> {
  try {
    const info = await getDockerInfo(config)
    if (info.version) {
      return {
        name: `docker:${config.name}`,
        status: 'pass',
        message: `Docker ${info.version} reachable on ${config.name}`,
        detail: `${info.running} running, ${info.stopped} stopped containers`,
      }
    }
    return {
      name: `docker:${config.name}`,
      status: 'fail',
      message: `Docker daemon not reachable on ${config.name}`,
      nextStep: `Check if Docker is running: ssh ${config.connection.host} systemctl status docker`,
    }
  } catch (err) {
    return {
      name: `docker:${config.name}`,
      status: 'fail',
      message: `Docker daemon error on ${config.name}: ${err instanceof Error ? err.message : String(err)}`,
      nextStep: config.connection.type === 'ssh'
        ? `Verify SSH access: homectl auth check --host ${config.name}`
        : 'Ensure Docker Desktop or dockerd is running locally',
    }
  }
}

async function checkDiskSpace(config: HostConfig): Promise<DoctorCheck> {
  try {
    if (config.connection.type === 'local') {
      const info = await getDiskInfo()
      if (!info) {
        return { name: `disk:${config.name}`, status: 'skip', message: `Could not check disk space on ${config.name}` }
      }
      return diskStatus(`disk:${config.name}`, info.usagePercent, info.used, info.total)
    }

    const ssh = new SSHClient()
    try {
      await ssh.connect(config)
      const result = await ssh.execRaw("df -h / | tail -1")
      const parts = result.stdout.trim().split(/\s+/)
      const usagePct = parseInt(parts[4]?.replace('%', '') || '0', 10)
      return diskStatus(`disk:${config.name}`, usagePct, parts[2], parts[1], parts[4])
    } finally {
      ssh.disconnect()
    }
  } catch {
    return { name: `disk:${config.name}`, status: 'skip', message: `Could not check disk space on ${config.name}` }
  }
}

function diskStatus(name: string, pct: number, used: string, total: string, pctStr?: string): DoctorCheck {
  if (pct >= 90) {
    return { name, status: 'fail', message: `Disk critical: ${pctStr || `${pct}%`} used (${used} of ${total})`, nextStep: `Free up space: ssh ... 'docker system prune -af' or remove old files` }
  }
  if (pct >= 75) {
    return { name, status: 'warn', message: `Disk warning: ${pctStr || `${pct}%`} used (${used} of ${total})` }
  }
  return { name, status: 'pass', message: `Disk OK: ${pctStr || `${pct}%`} used (${used} of ${total})` }
}

async function checkContainers(config: HostConfig): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []

  try {
    const containers = await listContainers(config)
    const unhealthy = containers.filter(
      (c) => c.state === 'exited' || c.health === 'unhealthy',
    )

    if (unhealthy.length === 0) {
      checks.push({
        name: `containers:${config.name}`,
        status: 'pass',
        message: `All ${containers.length} containers healthy on ${config.name}`,
      })
      return checks
    }

    for (const c of unhealthy.slice(0, 5)) {
      checks.push({
        name: `container:${c.name}`,
        status: 'fail',
        message: `Container '${c.name}' is ${c.health || c.state}`,
        detail: `Image: ${c.image}, Status: ${c.status}`,
        nextStep: `Check logs: homectl logs show ${c.name} --host ${config.name} --tail 50`,
      })
    }

    if (unhealthy.length > 5) {
      checks.push({
        name: `containers:${config.name}`,
        status: 'warn',
        message: `... and ${unhealthy.length - 5} more unhealthy containers`,
      })
    }
  } catch {
    checks.push({
      name: `containers:${config.name}`,
      status: 'skip',
      message: `Could not check container health on ${config.name}`,
    })
  }

  return checks
}

async function checkPortConflicts(config: HostConfig): Promise<DoctorCheck | null> {
  try {
    const containers = await listContainers(config)
    const exposedPorts = new Map<string, string[]>()

    for (const c of containers.filter((c) => c.state === 'running')) {
      if (!c.ports) continue
      for (const port of c.ports) {
        const match = port.match(/(\d+)->(\d+)\//)
        if (match) {
          const hostPort = match[2]
          if (!exposedPorts.has(hostPort)) {
            exposedPorts.set(hostPort, [])
          }
          exposedPorts.get(hostPort)!.push(c.name)
        }
      }
    }

    const conflicts: string[] = []
    for (const [port, names] of exposedPorts) {
      if (names.length > 1) {
        conflicts.push(`Port ${port} in use by: ${names.join(', ')}`)
      }
    }

    if (conflicts.length > 0) {
      return {
        name: `ports:${config.name}`,
        status: 'warn',
        message: `Port conflicts detected on ${config.name}`,
        detail: conflicts.join('\n'),
        nextStep: 'Review docker-compose.yml port mappings to resolve conflicts',
      }
    }
  } catch {
    // skip port check
  }

  return null
}

export async function runConfigValidationChecks(
  config: HomectlConfig,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []

  for (const hostConfig of config.hosts) {
    if (!hostConfig.connection.host) {
      checks.push({
        name: `config:host:${hostConfig.name}`,
        status: 'fail',
        message: `Host '${hostConfig.name}' missing connection host`,
        nextStep: `Add hostname/IP to host '${hostConfig.name}' in config`,
      })
      continue
    }
    if (!hostConfig.connection.type) {
      checks.push({
        name: `config:host:${hostConfig.name}`,
        status: 'fail',
        message: `Host '${hostConfig.name}' missing connection type`,
        nextStep: `Set connection.type to 'ssh' or 'local' for host '${hostConfig.name}'`,
      })
      continue
    }
    if (hostConfig.connection.type === 'ssh' && !hostConfig.connection.user) {
      checks.push({
        name: `config:host:${hostConfig.name}`,
        status: 'warn',
        message: `Host '${hostConfig.name}' uses SSH but no user set (will use root)`,
      })
    }

    checks.push({
      name: `config:host:${hostConfig.name}`,
      status: 'pass',
      message: `Host '${hostConfig.name}' config valid (${hostConfig.connection.type} → ${hostConfig.connection.host})`,
    })
  }

  if (config.hosts.length === 0) {
    checks.push({
      name: 'config:hosts',
      status: 'fail',
      message: 'No hosts defined in configuration',
      nextStep: 'Run "homectl init" to generate a configuration, or add hosts manually',
    })
  }

  if (config.contexts.length === 0) {
    checks.push({
      name: 'config:contexts',
      status: 'warn',
      message: 'No contexts defined',
      nextStep: 'Define contexts in config.yaml under the contexts: section',
    })
  }

  return checks
}

export async function runFullDiagnostics(
  config: HomectlConfig,
  hostName?: string,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []

  checks.push({
    name: 'config:version',
    status: 'pass',
    message: `Config version ${config.version || 'unknown'}`,
  })

  const hostChecks = await runDoctorChecks(config, hostName)
  checks.push(...hostChecks)

  const configChecks = await runConfigValidationChecks(config)
  checks.push(...configChecks)

  return checks
}
