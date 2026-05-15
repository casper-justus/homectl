export interface ConnectionConfig {
  type: 'ssh' | 'local' | 'docker-socket'
  host: string
  port?: number
  user?: string
  identityFile?: string
}

export interface RuntimeConfig {
  docker: boolean
  compose: boolean
}

export interface PathsConfig {
  composeRoot?: string
  backupRoot?: string
}

export interface HostConfig {
  name: string
  connection: ConnectionConfig
  runtime: RuntimeConfig
  paths?: PathsConfig
  tags?: string[]
}

export interface ContextConfig {
  name: string
  host: string
  tags?: string[]
}

export interface ServiceDef {
  name: string
  host: string
  stack?: string
  composeService?: string
  healthcheck?: HealthcheckDef
}

export interface HealthcheckDef {
  type: 'http' | 'tcp' | 'exec'
  url?: string
  port?: number
  command?: string
  interval?: number
  timeout?: number
}

export interface BackupSchedule {
  hosts: string[]
  paths: string[]
  databases?: string[]
  retentionDays?: number
}

export interface HomectlConfig {
  version: number
  defaultContext?: string
  contexts: ContextConfig[]
  hosts: HostConfig[]
  services?: ServiceDef[]
  backup?: {
    baseDir?: string
    schedules?: Record<string, BackupSchedule>
  }
}

export interface HostStatus {
  name: string
  reachable: boolean
  runtime: string
  containers: number
  images: number
  dockerVersion?: string
  disk?: string
  memory?: string
  uptime?: string
  error?: string
}

export interface ServiceInfo {
  name: string
  host: string
  project?: string
  image?: string
  imageTag?: string
  status: string
  ports?: string[]
  volumes?: string[]
  restartCount?: string
  health?: string
  created?: string
  networks?: string[]
  dependencies?: string[]
  uptime?: string
  containerIds?: string[]
}

export interface StackInfo {
  name: string
  host: string
  status: string
  serviceCount: number
  configFiles: string[]
  workingDir?: string
}

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  message: string
  detail?: string
  nextStep?: string
}

export interface LogEntry {
  timestamp?: string
  message: string
  stream?: 'stdout' | 'stderr'
  service?: string
}

export interface BackupResult {
  name: string
  host: string
  success: boolean
  path?: string
  size?: string
  timestamp?: string
  error?: string
}

export interface CommandOptions {
  json?: boolean
  plain?: boolean
  verbose?: boolean
  quiet?: boolean
  dryRun?: boolean
  host?: string
  context?: string
  config?: string
  since?: string
  follow?: boolean
  tail?: number
  yes?: boolean
  tag?: string
  filter?: string
  provider?: string
  output?: string
  force?: boolean
  nonInteractive?: boolean
  timeout?: number
  stack?: string
  service?: string
}
