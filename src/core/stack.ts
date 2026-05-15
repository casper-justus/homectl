import { HomectlConfig, HostConfig, StackInfo } from '../config/types'
import { getHostConfig, resolveHost } from '../config/loader'
import { composePs, composeValidate, listComposeProjects, ComposeProject } from '../adapters/compose'
import { SSHClient } from '../adapters/ssh'
import { execLocal } from '../adapters/shell'

export async function listStacks(
  config: HomectlConfig,
  hostName?: string,
): Promise<StackInfo[]> {
  const hosts = hostName
    ? [getHostConfig(config, hostName)].filter(Boolean) as HostConfig[]
    : config.hosts

  const results: StackInfo[] = []

  for (const hostConfig of hosts) {
    if (!hostConfig.runtime.compose) continue

    try {
      const projects = await listComposeProjects(hostConfig)
      for (const p of projects) {
        results.push({
          name: p.name,
          host: hostConfig.name,
          status: p.status,
          serviceCount: 0,
          configFiles: p.configFiles,
          workingDir: p.workingDir,
        })
      }
    } catch {
      // skip unreachable
    }

    // Also check compose ps for services on this host
    try {
      const services = await composePs(hostConfig)
      const groups = new Map<string, StackInfo>()
      for (const svc of services) {
        if (!groups.has(svc.project)) {
          groups.set(svc.project, {
            name: svc.project,
            host: hostConfig.name,
            status: svc.status,
            serviceCount: 0,
            configFiles: [],
          })
        }
        const group = groups.get(svc.project)!
        group.serviceCount++
        if (group.status !== svc.status) group.status = 'mixed'
      }
      for (const [, stack] of groups) {
        const existing = results.find((r) => r.name === stack.name && r.host === stack.host)
        if (existing) {
          existing.serviceCount = stack.serviceCount
        } else {
          results.push(stack)
        }
      }
    } catch {
      // skip
    }
  }

  return results
}

export async function getStackInfo(
  config: HomectlConfig,
  stackName: string,
  hostName?: string,
): Promise<StackInfo | null> {
  const stacks = await listStacks(config, hostName)
  return stacks.find((s) => s.name === stackName) || null
}

export async function deployStack(
  config: HomectlConfig,
  stackName: string,
  hostName?: string,
  dryRun?: boolean,
): Promise<{ success: boolean; message: string }> {
  const hostConfig = resolveHost(config, undefined, hostName)
  if (!hostConfig) {
    return { success: false, message: 'No host resolved. Specify --host or set a default context.' }
  }

  if (dryRun) {
    return {
      success: true,
      message: `[DRY-RUN] Would deploy stack '${stackName}' on ${hostConfig.name} (docker compose -p ${stackName} up -d)`,
    }
  }

  const composeDir = hostConfig.paths?.composeRoot || '.'

  try {
    if (hostConfig.connection.type === 'local') {
      const result = await execLocal('docker', [
        'compose', '-p', stackName, 'up', '-d',
      ], { cwd: composeDir })
      if (result.code === 0) {
        return { success: true, message: `Stack '${stackName}' deployed on ${hostConfig.name}` }
      }
      return { success: false, message: `Deploy failed: ${result.stderr || result.stdout}` }
    }

    const ssh = new SSHClient()
    try {
      await ssh.connect(hostConfig)
      const result = await ssh.execRaw(`cd ${composeDir} && docker compose -p ${stackName} up -d`)
      if (result.code === 0) {
        return { success: true, message: `Stack '${stackName}' deployed on ${hostConfig.name}` }
      }
      return { success: false, message: `Deploy failed: ${result.stderr || result.stdout}` }
    } finally {
      ssh.disconnect()
    }
  } catch (err) {
    return { success: false, message: `Deploy error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function downStack(
  config: HomectlConfig,
  stackName: string,
  hostName?: string,
  dryRun?: boolean,
): Promise<{ success: boolean; message: string }> {
  const hostConfig = resolveHost(config, undefined, hostName)
  if (!hostConfig) {
    return { success: false, message: 'No host resolved.' }
  }

  if (dryRun) {
    return {
      success: true,
      message: `[DRY-RUN] Would bring down stack '${stackName}' on ${hostConfig.name}`,
    }
  }

  const composeDir = hostConfig.paths?.composeRoot || '.'

  try {
    if (hostConfig.connection.type === 'local') {
      const result = await execLocal('docker', [
        'compose', '-p', stackName, 'down',
      ], { cwd: composeDir })
      if (result.code === 0) {
        return { success: true, message: `Stack '${stackName}' brought down on ${hostConfig.name}` }
      }
      return { success: false, message: `Down failed: ${result.stderr || result.stdout}` }
    }

    const ssh = new SSHClient()
    try {
      await ssh.connect(hostConfig)
      const result = await ssh.execRaw(`cd ${composeDir} && docker compose -p ${stackName} down`)
      if (result.code === 0) {
        return { success: true, message: `Stack '${stackName}' brought down on ${hostConfig.name}` }
      }
      return { success: false, message: `Down failed: ${result.stderr || result.stdout}` }
    } finally {
      ssh.disconnect()
    }
  } catch (err) {
    return { success: false, message: `Down error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function validateStack(
  config: HomectlConfig,
  stackName: string,
  hostName?: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const hostConfig = resolveHost(config, undefined, hostName)
  if (!hostConfig) {
    return { valid: false, errors: ['No host resolved'] }
  }

  return composeValidate(hostConfig, stackName, hostConfig.paths?.composeRoot)
}
