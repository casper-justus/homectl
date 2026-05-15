import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { HomectlConfig, HostConfig, ContextConfig } from './types'

const CONFIG_FILES = [
  './homectl.yaml',
  './homectl.yml',
  './config/homectl.yaml',
  './config/homectl.yml',
  process.platform === 'win32'
    ? path.join(process.env.USERPROFILE || '~', '.config', 'homectl', 'config.yaml')
    : path.join(process.env.HOME || '~', '.config', 'homectl', 'config.yaml'),
  '/etc/homectl/config.yaml',
]

function expandHome(filePath: string): string {
  if (filePath.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '~'
    return filePath.replace('~', home)
  }
  return filePath
}

export function loadConfig(configPath?: string): HomectlConfig {
  if (configPath) {
    const resolved = expandHome(configPath)
    if (!fs.existsSync(resolved)) {
      throw new Error(`Config file not found: ${resolved}`)
    }
    return parseConfig(resolved)
  }

  for (const candidate of CONFIG_FILES) {
    const resolved = expandHome(candidate)
    if (fs.existsSync(resolved)) {
      return parseConfig(resolved)
    }
  }

  return getDefaultConfig()
}

function parseConfig(filePath: string): HomectlConfig {
  const content = fs.readFileSync(filePath, 'utf-8')
  const doc = yaml.load(content) as Record<string, unknown>

  if (!doc || typeof doc !== 'object') {
    throw new Error(`Invalid config file: ${filePath}`)
  }

  const config = doc as unknown as HomectlConfig

  // Normalize: ensure arrays exist
  if (!config.hosts) config.hosts = []
  if (!config.contexts) config.contexts = []

  // Add a default context if none exist
  if (config.contexts.length === 0 && config.hosts.length > 0) {
    config.contexts.push({
      name: 'default',
      host: config.hosts[0].name,
    })
  }

  return config
}

function getDefaultConfig(): HomectlConfig {
  return {
    version: 1,
    contexts: [{ name: 'local', host: 'local', tags: ['local'] }],
    hosts: [
      {
        name: 'local',
        connection: { type: 'local', host: 'localhost' },
        runtime: { docker: true, compose: true },
        tags: ['local', 'dev'],
      },
    ],
  }
}

export function resolveContext(
  config: HomectlConfig,
  contextName?: string,
): ContextConfig | undefined {
  const target = contextName || config.defaultContext
  if (!target) return config.contexts[0]
  return config.contexts.find((c) => c.name === target)
}

export function resolveHost(
  config: HomectlConfig,
  hostName?: string,
  contextName?: string,
): HostConfig | undefined {
  if (hostName) {
    return config.hosts.find((h) => h.name === hostName)
  }

  const ctx = resolveContext(config, contextName)
  if (ctx) {
    return config.hosts.find((h) => h.name === ctx.host)
  }

  return config.hosts[0]
}

export function getHostForService(
  config: HomectlConfig,
  serviceName: string,
): HostConfig | undefined {
  const svc = config.services?.find((s) => s.name === serviceName)
  if (svc) {
    return config.hosts.find((h) => h.name === svc.host)
  }
  return undefined
}

export function getHostConfig(
  config: HomectlConfig,
  hostName: string,
): HostConfig | undefined {
  return config.hosts.find((h) => h.name === hostName)
}

export function resolveHosts(
  config: HomectlConfig,
  hostName?: string,
  tag?: string,
): HostConfig[] {
  let hosts = config.hosts
  if (hostName) {
    hosts = hosts.filter((h) => h.name === hostName)
  }
  if (tag) {
    hosts = hosts.filter((h) => h.tags?.includes(tag))
  }
  return hosts
}
