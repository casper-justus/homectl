import * as fs from 'fs'
import * as path from 'path'
import { HomectlConfig, HostConfig, BackupResult } from '../config/types'
import { getHostConfig } from '../config/loader'
import { SSHClient } from '../adapters/ssh'
import { createArchive, createDirectory } from '../utils/platform'

export async function runBackup(
  config: HomectlConfig,
  backupName: string,
  hostName?: string,
  dryRun?: boolean,
): Promise<BackupResult[]> {
  const results: BackupResult[] = []
  const schedule = config.backup?.schedules?.[backupName]

  if (!schedule) {
    return [
      {
        name: backupName,
        host: hostName || 'unknown',
        success: false,
        error: `Backup schedule '${backupName}' not found in config`,
      },
    ]
  }

  const hostsToBackup = hostName
    ? [hostName]
    : schedule.hosts

  for (const h of hostsToBackup) {
    const hostConfig = getHostConfig(config, h)
    if (!hostConfig) {
      results.push({
        name: backupName,
        host: h,
        success: false,
        error: `Host '${h}' not found in config`,
      })
      continue
    }

    const baseDir = config.backup?.baseDir || './backups'
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(baseDir, backupName, timestamp)

    if (dryRun) {
      results.push({
        name: backupName,
        host: h,
        success: true,
        path: backupDir,
        error: '[DRY-RUN] Would create backup',
      })
      continue
    }

    try {
      const result = await executeBackup(hostConfig, backupDir, schedule.paths)
      results.push(result)
    } catch (err) {
      results.push({
        name: backupName,
        host: h,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

async function executeBackup(
  hostConfig: HostConfig,
  backupDir: string,
  paths: string[],
): Promise<BackupResult> {
  if (hostConfig.connection.type === 'local') {
    const dirOk = createDirectory(backupDir)
    if (!dirOk) {
      return {
        name: path.basename(backupDir),
        host: 'local',
        success: false,
        error: 'Failed to create backup directory',
      }
    }

    const archivePath = path.join(backupDir, 'backup.zip')
    const archiveOk = await createArchive(paths, archivePath)
    if (!archiveOk) {
      return {
        name: path.basename(backupDir),
        host: 'local',
        success: false,
        error: 'Backup archive creation failed',
      }
    }

    const stat = fs.statSync(archivePath)
    return {
      name: path.basename(backupDir),
      host: 'local',
      success: true,
      path: archivePath,
      size: formatSize(stat.size),
      timestamp: new Date().toISOString(),
    }
  }

  const ssh = new SSHClient()
  try {
    await ssh.connect(hostConfig)
    const mkdirResult = await ssh.execRaw(`mkdir -p ${backupDir}`)
    if (mkdirResult.code !== 0) {
      return {
        name: path.basename(backupDir),
        host: hostConfig.connection.host,
        success: false,
        error: `Failed to create backup dir: ${mkdirResult.stderr}`,
      }
    }

    const tarPaths = paths.join(' ')
    const tarResult = await ssh.execRaw(
      `tar -czf ${backupDir}/backup.tar.gz ${tarPaths}`,
    )
    if (tarResult.code !== 0) {
      return {
        name: path.basename(backupDir),
        host: hostConfig.connection.host,
        success: false,
        error: `Backup failed: ${tarResult.stderr}`,
      }
    }

    const sizeResult = await ssh.execRaw(`stat -c%s ${backupDir}/backup.tar.gz 2>/dev/null || wc -c < ${backupDir}/backup.tar.gz`)
    const size = sizeResult.stdout.trim()

    return {
      name: path.basename(backupDir),
      host: hostConfig.connection.host,
      success: true,
      path: `${backupDir}/backup.tar.gz`,
      size: formatSize(parseInt(size, 10) || 0),
      timestamp: new Date().toISOString(),
    }
  } finally {
    ssh.disconnect()
  }
}

export async function listBackups(
  config: HomectlConfig,
  scheduleName?: string,
): Promise<BackupResult[]> {
  const results: BackupResult[] = []
  const baseDir = config.backup?.baseDir || './backups'

  if (!fs.existsSync(baseDir)) return results

  const schedules = scheduleName
    ? [scheduleName]
    : (config.backup?.schedules ? Object.keys(config.backup.schedules) : [])

  for (const sched of schedules) {
    const schedDir = path.join(baseDir, sched)
    if (!fs.existsSync(schedDir)) continue

    const entries = fs.readdirSync(schedDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const backupPath = path.join(schedDir, entry.name)
      const files = fs.readdirSync(backupPath)
      const archiveFile = files.find((f) => f.endsWith('.zip') || f.endsWith('.tar.gz'))
      let size: string | undefined
      if (archiveFile) {
        const stat = fs.statSync(path.join(backupPath, archiveFile))
        size = formatSize(stat.size)
      }
      results.push({
        name: entry.name,
        host: 'local',
        success: true,
        path: archiveFile ? path.join(backupPath, archiveFile) : backupPath,
        size,
        timestamp: entry.name,
      })
    }
  }

  return results
}

export async function verifyBackup(
  config: HomectlConfig,
  scheduleName: string,
): Promise<BackupResult> {
  const result: BackupResult = { name: scheduleName, host: 'local', success: false }
  const baseDir = config.backup?.baseDir || './backups'
  const schedDir = path.join(baseDir, scheduleName)

  if (!fs.existsSync(schedDir)) {
    result.error = `No backups found for schedule '${scheduleName}' at ${schedDir}`
    return result
  }

  const entries = fs.readdirSync(schedDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort()
    .reverse()

  if (entries.length === 0) {
    result.error = `No backup entries found for schedule '${scheduleName}'`
    return result
  }

  const latest = entries[0]
  const backupPath = path.join(schedDir, latest.name)
  const files = fs.readdirSync(backupPath)
  const archiveFile = files.find((f) => f.endsWith('.zip') || f.endsWith('.tar.gz'))

  if (!archiveFile) {
    result.error = `No archive file found in latest backup: ${backupPath}`
    return result
  }

  const archivePath = path.join(backupPath, archiveFile)
  const stat = fs.statSync(archivePath)

  // Check: file exists, non-empty, recent (< 48 hours)
  const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60)
  const errors: string[] = []

  if (stat.size === 0) errors.push('Backup archive is empty')
  if (ageHours > 48) errors.push(`Backup is ${Math.round(ageHours)} hours old (> 48h threshold)`)

  result.success = errors.length === 0
  result.path = archivePath
  result.size = formatSize(stat.size)
  result.timestamp = stat.mtime.toISOString()
  result.error = errors.length > 0 ? errors.join('; ') : undefined

  return result
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
