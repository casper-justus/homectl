import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import { listHosts, getHostInfo, pingHost, execHost } from '../core/host'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'
import chalk from 'chalk'

export function registerHostCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const host = program
    .command('host')
    .description('Manage and inspect hosts')

  host
    .command('ls')
    .description('List all configured hosts and their status')
    .option('--json', 'Output as JSON')
    .option('--plain', 'Output as plain text')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const hosts = await listHosts(config)
        const format = detectFormat(options.json, options.plain)
        console.log(render(format, hosts, [
          { header: 'Name', key: 'name' },
          { header: 'Reachable', key: 'reachable', format: (v) => v ? 'yes' : 'no' },
          { header: 'Runtime', key: 'runtime' },
          { header: 'Containers', key: 'containers' },
          { header: 'Images', key: 'images' },
          { header: 'Docker', key: 'dockerVersion' },
          { header: 'Error', key: 'error' },
        ]))
      } catch (err) {
        handleError(err)
      }
    })

  host
    .command('info')
    .description('Show detailed info about a specific host')
    .argument('<name>', 'Host name')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const info = await getHostInfo(config, name)
        const format = detectFormat(options.json)
        console.log(render(format, info))
      } catch (err) {
        handleError(err)
      }
    })

  host
    .command('ping')
    .description('Ping a host to check connectivity')
    .argument('<name>', 'Host name')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const hostConfig = config.hosts.find((h) => h.name === name)
        if (!hostConfig) {
          console.log(`  ${chalk.red('✗')} Host '${name}' not found in config`)
          process.exit(1)
        }
        const result = await pingHost(hostConfig)
        const format = detectFormat(options.json)
        if (format === 'json') {
          console.log(render('json', result))
        } else {
          if (result.alive) {
            console.log(`  ${chalk.green('✓')} ${name} is reachable (${result.latency})`)
          } else {
            console.log(`  ${chalk.red('✗')} ${name} is unreachable${result.error ? `: ${result.error}` : ''}`)
            process.exit(1)
          }
        }
      } catch (err) {
        handleError(err)
      }
    })

  host
    .command('exec')
    .description('Run an arbitrary command on a host')
    .argument('<name>', 'Host name')
    .argument('<command>', 'Command to run')
    .option('--json', 'Output as JSON')
    .action(async (name: string, command: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const hostConfig = config.hosts.find((h) => h.name === name)
        if (!hostConfig) {
          console.log(`  ${chalk.red('✗')} Host '${name}' not found in config`)
          process.exit(1)
        }
        const result = await execHost(hostConfig, command)
        const format = detectFormat(options.json)
        if (format === 'json') {
          console.log(render('json', result))
        } else {
          if (result.stdout) console.log(result.stdout)
          if (result.stderr) console.error(result.stderr)
          if (result.code !== 0) process.exit(result.code)
        }
      } catch (err) {
        handleError(err)
      }
    })
}
