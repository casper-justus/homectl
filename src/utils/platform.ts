import * as os from 'os'
import { execLocal } from '../adapters/shell'

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function isUnix(): boolean {
  return !isWindows()
}

export function getOSName(): string {
  if (isWindows()) {
    return `Windows ${os.release()}`
  }
  return `${os.type()} ${os.release()}`
}

export function getCPUInfo(): string {
  return `${os.cpus().length} cores`
}

export function getUptime(): string {
  const seconds = os.uptime()
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return parts.join(' ')
}

export interface DiskInfo {
  total: string
  used: string
  available: string
  usagePercent: number
}

export async function getDiskInfo(): Promise<DiskInfo | null> {
  try {
    if (isWindows()) {
      return await getWindowsDiskInfo()
    }
    return await getUnixDiskInfo()
  } catch {
    return null
  }
}

async function getWindowsDiskInfo(): Promise<DiskInfo | null> {
  try {
    const result = await execLocal(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Get-PSDrive -PSProvider FileSystem | Where-Object Root -eq "C:\\" | Select-Object @{N="Total";E={[math]::Round($_.Used/1GB + $_.Free/1GB,1)}}, @{N="Used";E={[math]::Round($_.Used/1GB,1)}}, @{N="Free";E={[math]::Round($_.Free/1GB,1)}}, @{N="Pct";E={[math]::Round($_.Used/($_.Used+$_.Free)*100,0)}} | ConvertTo-Json',
      ],
      { timeout: 10000 },
    )

    if (result.code !== 0 || !result.stdout.trim()) return null
    const parsed = JSON.parse(result.stdout)
    return {
      total: `${parsed.Total} GB`,
      used: `${parsed.Used} GB`,
      available: `${parsed.Free} GB`,
      usagePercent: parsed.Pct,
    }
  } catch {
    return null
  }
}

async function getUnixDiskInfo(): Promise<DiskInfo | null> {
  try {
    const result = await execLocal('df', ['-h', '/'], { timeout: 10000 })
    const lines = result.stdout.trim().split('\n')
    const last = lines[lines.length - 1]
    const parts = last.split(/\s+/)
    if (parts.length < 5) return null
    const usagePct = parseInt(parts[4]?.replace('%', '') || '0', 10)
    return {
      total: parts[1] || '?',
      used: parts[2] || '?',
      available: parts[3] || '?',
      usagePercent: usagePct,
    }
  } catch {
    return null
  }
}

export interface MemoryInfo {
  total: string
  used: string
  usagePercent: number
}

export async function getMemoryInfo(): Promise<MemoryInfo | null> {
  try {
    if (isWindows()) {
      return getWindowsMemoryInfo()
    }
    return getUnixMemoryInfo()
  } catch {
    return null
  }
}

async function getWindowsMemoryInfo(): Promise<MemoryInfo | null> {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  const pct = Math.round((used / total) * 100)

  return {
    total: formatBytes(total),
    used: formatBytes(used),
    usagePercent: pct,
  }
}

async function getUnixMemoryInfo(): Promise<MemoryInfo | null> {
  try {
    const result = await execLocal('free', ['-h'], { timeout: 10000 })
    const line = result.stdout.split('\n').find((l) => l.startsWith('Mem:'))
    if (!line) {
      // fallback to OS module
      const total = os.totalmem()
      const free = os.freemem()
      const used = total - free
      return {
        total: formatBytes(total),
        used: formatBytes(used),
        usagePercent: Math.round((used / total) * 100),
      }
    }
    const parts = line.split(/\s+/)
    return {
      total: parts[1] || '?',
      used: parts[2] || '?',
      usagePercent: parseInt(parts[2] || '0', 10),
    }
  } catch {
    return null
  }
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

export async function getOSVersionString(): Promise<string> {
  if (isWindows()) {
    try {
      const result = await execLocal(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          '(Get-CimInstance Win32_OperatingSystem).Caption',
        ],
        { timeout: 10000 },
      )
      if (result.code === 0 && result.stdout.trim()) {
        return result.stdout.trim()
      }
    } catch {
      // fallback
    }
    return `Windows ${os.release()}`
  }

  try {
    const result = await execLocal('uname', ['-a'], { timeout: 10000 })
    return result.stdout.trim() || os.type()
  } catch {
    return os.type()
  }
}

export function getHostname(): string {
  return os.hostname()
}

export async function createArchive(
  sourcePaths: string[],
  outputPath: string,
): Promise<boolean> {
  if (isWindows()) {
    return createWindowsArchive(sourcePaths, outputPath)
  }
  return createUnixArchive(sourcePaths, outputPath)
}

async function createWindowsArchive(
  sourcePaths: string[],
  outputPath: string,
): Promise<boolean> {
  try {
    const paths = sourcePaths.join(',')
    const result = await execLocal(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path ${sourcePaths.map(p => `"${p}"`).join(',')} -DestinationPath "${outputPath}" -Force`,
      ],
      { timeout: 120000 },
    )
    return result.code === 0
  } catch {
    return false
  }
}

async function createUnixArchive(
  sourcePaths: string[],
  outputPath: string,
): Promise<boolean> {
  try {
    const result = await execLocal(
      'tar',
      ['-czf', outputPath, ...sourcePaths],
      { timeout: 120000 },
    )
    return result.code === 0
  } catch {
    return false
  }
}

export function createDirectory(dir: string): boolean {
  try {
    const fs = require('fs')
    const path = require('path')
    fs.mkdirSync(dir, { recursive: true })
    return true
  } catch {
    return false
  }
}
