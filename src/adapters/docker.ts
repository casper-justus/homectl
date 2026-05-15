import Docker from 'dockerode'
import { HostConfig } from '../config/types'
import { SSHClient } from './ssh'

export interface DockerContainerSummary {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string[]
  created: string
  health?: string
  mounts?: string[]
  networks?: string[]
  restartCount?: string
  uptime?: string
}

export interface DockerInfo {
  version?: string
  containers: number
  running: number
  paused: number
  stopped: number
  images: number
  serverVersion?: string
  storageDriver?: string
  operatingSystem?: string
  kernelVersion?: string
}

export async function getDockerInfo(hostConfig: HostConfig): Promise<DockerInfo> {
  if (hostConfig.connection.type === 'local') return getLocalDockerInfo()
  return getRemoteDockerInfo(hostConfig)
}

async function getLocalDockerInfo(): Promise<DockerInfo> {
  try {
    const docker = new Docker()
    const info = await docker.info()
    return {
      version: info.ServerVersion,
      containers: info.Containers,
      running: info.ContainersRunning,
      paused: info.ContainersPaused,
      stopped: info.ContainersStopped,
      images: info.Images,
      serverVersion: info.ServerVersion,
      storageDriver: info.Driver,
      operatingSystem: info.OperatingSystem,
      kernelVersion: info.KernelVersion,
    }
  } catch {
    return { containers: 0, running: 0, paused: 0, stopped: 0, images: 0 }
  }
}

async function getRemoteDockerInfo(hostConfig: HostConfig): Promise<DockerInfo> {
  const ssh = new SSHClient()
  try {
    await ssh.connect(hostConfig)
    const result = await ssh.execRaw('docker info --format "{{json .}}"')
    if (result.code !== 0) throw new Error(result.stderr)
    const info = JSON.parse(result.stdout)
    return {
      version: info.ServerVersion,
      containers: info.Containers,
      running: info.ContainersRunning,
      paused: info.ContainersPaused,
      stopped: info.ContainersStopped,
      images: info.Images,
      serverVersion: info.ServerVersion,
      storageDriver: info.Driver,
      operatingSystem: info.OperatingSystem,
      kernelVersion: info.KernelVersion,
    }
  } finally {
    ssh.disconnect()
  }
}

export async function listContainers(hostConfig: HostConfig): Promise<DockerContainerSummary[]> {
  if (hostConfig.connection.type === 'local') return listLocalContainers()
  return listRemoteContainers(hostConfig)
}

async function listLocalContainers(): Promise<DockerContainerSummary[]> {
  try {
    const docker = new Docker()
    const containers = await docker.listContainers({ all: true })
    return containers.map(mapContainerInfo)
  } catch {
    return []
  }
}

async function listRemoteContainers(hostConfig: HostConfig): Promise<DockerContainerSummary[]> {
  const ssh = new SSHClient()
  try {
    await ssh.connect(hostConfig)
    const result = await ssh.execRaw('docker ps -a --format "{{json .}}"')
    if (result.code !== 0 || !result.stdout.trim()) return []
    return result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          const raw = JSON.parse(line)
          return {
            id: raw.ID?.substring(0, 12) || 'unknown',
            name: raw.Names?.replace(/^\//, '') || 'unknown',
            image: raw.Image || 'unknown',
            status: raw.Status || 'unknown',
            state: raw.State || 'unknown',
            ports: raw.Ports ? raw.Ports.replace(/^\[|\]$/g, '').split(/\s+/).filter(Boolean) : [],
            created: raw.CreatedAt || '',
          }
        } catch {
          return null
        }
      })
      .filter(Boolean) as DockerContainerSummary[]
  } finally {
    ssh.disconnect()
  }
}

function mapContainerInfo(raw: any): DockerContainerSummary {
  const ports: string[] = []
  if (raw.Ports) {
    for (const p of raw.Ports) {
      if (p.PublicPort) ports.push(`${p.PrivatePort}->${p.PublicPort}/${p.Type}`)
      else ports.push(`${p.PrivatePort}/${p.Type}`)
    }
  }
  return {
    id: raw.Id?.substring(0, 12) || 'unknown',
    name: raw.Names?.[0]?.replace(/^\//, '') || 'unknown',
    image: raw.Image || 'unknown',
    status: raw.Status || 'unknown',
    state: raw.State || 'unknown',
    ports,
    created: raw.Created ? new Date(raw.Created * 1000).toISOString() : '',
    mounts: raw.Mounts?.map((m: any) => `${m.Type}:${m.Source || m.Destination}`),
    networks: raw.NetworkSettings?.Networks ? Object.keys(raw.NetworkSettings.Networks) : undefined,
    restartCount: raw.RestartCount?.toString(),
    uptime: raw.Status,
  }
}
