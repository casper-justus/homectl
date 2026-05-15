import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import { listStacks, getStackInfo, deployStack, downStack, validateStack } from '../core/stack'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'
import chalk from 'chalk'

export function registerStackCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const stack = program
    .command('stack')
    .aliases(['st', 'compose'])
    .description('Manage Docker Compose stacks')

  stack
    .command('ls')
    .description('List all stacks across hosts')
    .option('--host <host>', 'Filter by host')
    .option('--json', 'Output as JSON')
    .option('--plain', 'Output as plain text')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const stacks = await listStacks(config, options.host)
        const format = detectFormat(options.json, options.plain)
        console.log(
          render(format, stacks, [
            { header: 'Name', key: 'name' },
            { header: 'Host', key: 'host' },
            { header: 'Status', key: 'status' },
            { header: 'Services', key: 'serviceCount' },
            { header: 'Config', key: 'configFiles', format: (v) => Array.isArray(v) ? v.join(', ') : '' },
          ]),
        )
      } catch (err) {
        handleError(err)
      }
    })

  stack
    .command('info')
    .description('Show detailed info about a stack')
    .argument('<name>', 'Stack name')
    .option('--host <host>', 'Filter by host')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const info = await getStackInfo(config, name, options.host)
        if (!info) {
          console.log(`  Stack '${name}' not found.`)
          return
        }
        const format = detectFormat(options.json)
        console.log(render(format, info))
      } catch (err) {
        handleError(err)
      }
    })

  stack
    .command('deploy')
    .description('Deploy (up) a Compose stack')
    .argument('<name>', 'Stack name (Compose project)')
    .option('--host <host>', 'Target host')
    .option('--dry-run', 'Show what would happen')
    .option('--yes', 'Skip confirmation')
    .action(async (name: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const result = await deployStack(config, name, options.host, options.dryRun)
        const icon = result.success ? chalk.green('✓') : chalk.red('✗')
        console.log(`  ${icon} ${result.message}`)
        if (!result.success) process.exit(1)
      } catch (err) {
        handleError(err)
      }
    })

  stack
    .command('down')
    .description('Bring down a Compose stack')
    .argument('<name>', 'Stack name (Compose project)')
    .option('--host <host>', 'Target host')
    .option('--dry-run', 'Show what would happen')
    .option('--yes', 'Skip confirmation')
    .action(async (name: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const result = await downStack(config, name, options.host, options.dryRun)
        const icon = result.success ? chalk.green('✓') : chalk.red('✗')
        console.log(`  ${icon} ${result.message}`)
        if (!result.success) process.exit(1)
      } catch (err) {
        handleError(err)
      }
    })

  stack
    .command('validate')
    .description('Validate a Compose stack configuration')
    .argument('<name>', 'Stack name')
    .option('--host <host>', 'Target host')
    .action(async (name: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const result = await validateStack(config, name, options.host)
        if (result.valid) {
          console.log(`  ${chalk.green('✓')} Stack '${name}' configuration is valid`)
        } else {
          console.log(`  ${chalk.red('✗')} Stack '${name}' has validation errors:`)
          for (const err of result.errors) {
            console.log(`    ${chalk.red('•')} ${err}`)
          }
          process.exit(1)
        }
      } catch (err) {
        handleError(err)
      }
    })
}
