import { HomectlConfig, ContextConfig, HostStatus } from '../config/types'
import { resolveContext, resolveHost, getHostConfig } from '../config/loader'
import { pingHost } from './host'

export function listContexts(config: HomectlConfig): ContextConfig[] {
  return config.contexts
}

export function getContextInfo(
  config: HomectlConfig,
  contextName: string,
): { context: ContextConfig; host?: HostStatus; error?: string } {
  const ctx = config.contexts.find((c) => c.name === contextName)
  if (!ctx) {
    return { context: { name: contextName, host: '' }, error: `Context '${contextName}' not found` }
  }

  const hostConfig = resolveHost(config, ctx.host)
  if (!hostConfig) {
    return { context: ctx, error: `Host '${ctx.host}' not found for context '${contextName}'` }
  }

  return {
    context: ctx,
    host: {
      name: hostConfig.name,
      reachable: false,
      runtime: hostConfig.runtime.docker ? 'docker' : 'unknown',
      containers: 0,
      images: 0,
    },
  }
}

export function setActiveContext(
  config: HomectlConfig,
  contextName: string,
): { success: boolean; message: string } {
  const ctx = config.contexts.find((c) => c.name === contextName)
  if (!ctx) {
    return { success: false, message: `Context '${contextName}' not found` }
  }

  config.defaultContext = contextName
  return { success: true, message: `Switched to context '${contextName}' (host: ${ctx.host})` }
}
