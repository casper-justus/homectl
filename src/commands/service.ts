import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import {
  listServices,
  getServiceInfo,
  restartService,
  startService,
  stopService,
  pullService,
  checkServiceHealth,
} from '../core/service'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'
import { validateServiceName } from '../utils/safety'
import chalk from 'chalk'

export function registerServiceCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const service = program
    .command('service')
    .aliases(['svc', 's'])
    .description('Manage and inspect services')

  service
    .command('ls')
    .description('List all services across hosts')
    .option('--host <host>', 'Filter by host')
    .option('--tag <tag>', 'Filter by host tag')
    .option('--json', 'Output as JSON')
    .option('--plain', 'Output as plain text')
    .action(async (options: CommandOptions & { tag?: string }) => {
      try {
        const config = getConfig()
        const services = await listServices(config, options.host, options.tag)
        const format = detectFormat(options.json, options.plain)
        console.log(
          render(format, services, [
            { header: 'Name', key: 'name' },
            { header: 'Host', key: 'host' },
            { header: 'Image', key: 'image' },
            { header: 'Status', key: 'status' },
            { header: 'Ports', key: 'ports', format: (v) => Array.isArray(v) ? v.join(', ') : String(v) },
            { header: 'Health', key: 'health' },
          ]),
        )
      } catch (err) {
        handleError(err)
      }
    })

  service
    .command('info')
    .description('Show detailed info about a service')
    .argument('<name>', 'Service name')
    .option('--host <host>', 'Host to search')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: CommandOptions) => {
      try {
        if (!validateServiceName(name)) {
          throw new Error(`Invalid service name: '${name}'`)
        }
        const config = getConfig()
        const info = await getServiceInfo(config, name, options.host)
        if (!info) {
          console.log(`  Service '${name}' not found.`)
          return
        }
        const format = detectFormat(options.json)
        console.log(render(format, info))
      } catch (err) {
        handleError(err)
      }
    })

  service
    .command('restart')
    .description('Restart a service')
    .argument('<name>', 'Service name')
    .option('--host <host>', 'Host where service runs')
    .option('--dry-run', 'Show what would happen')
    .option('--yes', 'Skip confirmation')
    .action(async (name: string, options: CommandOptions) => {
      try {
        if (!validateServiceName(name)) throw new Error(`Invalid service name: '${name}'`)
        const config = getConfig()
        const result = await restartService(config, name, options.host, options.dryRun)
        console.log(result.message)
        if (!result.success) process.exit(1)
      } catch (err) {
        handleError(err)
      }
    })

  service
    .command('start')
    .description('Start a service')
    .argument('<name>', 'Service name')
    .option('--host <host>', 'Host where service runs')
    .option('--dry-run', 'Show what would happen')
    .action(async (name: string, options: CommandOptions) => {
      try {
        if (!validateServiceName(name)) throw new Error(`Invalid service name: '${name}'`)
        const config = getConfig()
        const result = await startService(config, name, options.host, options.dryRun)
        console.log(result.message)
        if (!result.success) process.exit(1)
      } catch (err) {
        handleError(err)
      }
    })

  service
    .command('stop')
    .description('Stop a service')
    .argument('<name>', 'Service name')
    .option('--host <host>', 'Host where service runs')
    .option('--dry-run', 'Show what would happen')
    .action(async (name: string, options: CommandOptions) => {
      try {
        if (!validateServiceName(name)) throw new Error(`Invalid service name: '${name}'`)
        const config = getConfig()
        const result = await stopService(config, name, options.host, options.dryRun)
        console.log(result.message)
        if (!result.success) process.exit(1)
      } catch (err) {
        handleError(err)
      }
    })

  service
    .command('pull')
    .description('Pull latest image for a service')
    .argument('<name>', 'Service name')
    .option('--host <host>', 'Host where service runs')
    .option('--dry-run', 'Show what would happen')
    .action(async (name: string, options: CommandOptions) => {
      try {
        if (!validateServiceName(name)) throw new Error(`Invalid service name: '${name}'`)
        const config = getConfig()
        const result = await pullService(config, name, options.host, options.dryRun)
        console.log(result.message)
        if (!result.success) process.exit(1)
      } catch (err) {
        handleError(err)
      }
    })

  service
    .command('health')
    .description('Check health of a service')
    .argument('<name>', 'Service name')
    .option('--host <host>', 'Host where service runs')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: CommandOptions) => {
      try {
        if (!validateServiceName(name)) throw new Error(`Invalid service name: '${name}'`)
        const config = getConfig()
        const result = await checkServiceHealth(config, name, options.host)
        const format = detectFormat(options.json)
        if (format === 'json') {
          console.log(render('json', result))
        } else {
          const icon = result.healthy ? chalk.green('✓') : chalk.red('✗')
          console.log(`  ${icon} ${name}: ${result.status}${result.detail ? ` (${result.detail})` : ''}`)
          if (!result.healthy) process.exit(1)
        }
      } catch (err) {
        handleError(err)
      }
    })
}
