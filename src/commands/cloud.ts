import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import {
  discoverCloudHosts,
  listCloudProviders,
  getProviderInfo,
  CloudProvider,
} from '../core/cloud'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'

export function registerCloudCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const cloud = program
    .command('cloud')
    .description('Manage cloud VPS and remote infrastructure')

  cloud
    .command('ls')
    .description('List cloud instances across all providers')
    .option('--provider <provider>', 'Filter by provider')
    .option('--json', 'Output as JSON')
    .option('--plain', 'Output as plain text')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const instances = await discoverCloudHosts(
          config,
          options.provider as CloudProvider | undefined,
        )
        const format = detectFormat(options.json, options.plain)
        console.log(
          render(format, instances, [
            { header: 'ID', key: 'id' },
            { header: 'Host', key: 'ip' },
            { header: 'Provider', key: 'provider' },
            { header: 'Status', key: 'status' },
            { header: 'Tags', key: 'tags', format: (v) => Array.isArray(v) ? v.join(', ') : String(v) },
          ]),
        )
      } catch (err) {
        handleError(err)
      }
    })

  cloud
    .command('providers')
    .description('List configured cloud providers')
    .option('--json', 'Output as JSON')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const providers = await listCloudProviders(config)
        const format = detectFormat(options.json)
        console.log(
          render(format, providers, [
            { header: 'Provider', key: 'provider' },
            { header: 'Hosts', key: 'hosts' },
            { header: 'Reachable', key: 'reachable' },
          ]),
        )
      } catch (err) {
        handleError(err)
      }
    })

  cloud
    .command('info')
    .description('Show detailed cloud instance info')
    .argument('<host>', 'Host name from config')
    .option('--json', 'Output as JSON')
    .action(async (host: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const hostConfig = config.hosts.find((h) => h.name === host)
        if (!hostConfig) {
          console.log(`Host '${host}' not found in configuration.`)
          return
        }

        const info = await getProviderInfo(hostConfig)
        const format = detectFormat(options.json)
        console.log(
          render(format, info, Object.keys(info).map((key) => ({
            header: key.charAt(0).toUpperCase() + key.slice(1),
            key,
          }))),
        )
      } catch (err) {
        handleError(err)
      }
    })
}
